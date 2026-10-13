import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync } from 'node:crypto';
import { build } from 'esbuild';

globalThis.WebSocketRequestResponsePair = class { constructor(request,response) { this.request=request; this.response=response; } };
const bundle = await build({
  entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'durable-object-stub', setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'stub', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }' }));
  } }],
});
const { Organisation, default: worker } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
function fixture() {
  const db = new DatabaseSync(':memory:');
  const storage = {
    sql: { exec(query, ...args) {
      const statement = db.prepare(query);
      const rows = statement.columns().length ? statement.all(...args) : (statement.run(...args), []);
      return { toArray: () => rows, one: () => { assert.equal(rows.length, 1); return rows[0]; } };
    } },
    transactionSync(fn) { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch(error) { db.exec('ROLLBACK'); throw error; } },
  };
  const env = { BOOTSTRAP_ADMIN_SECRET: 'test-only-setup-secret', ORGANISATION: { getByName: () => object } };
  const sockets = [];
  storage.setAlarm = async (time) => { storage.alarmTime = time; };
  storage.deleteAlarm = async () => { storage.alarmTime = null; };
  const ctx = { storage, getWebSockets: (tag) => sockets.filter(s => s.readyState === 1 && (!tag || s.tags.includes(tag))), acceptWebSocket: (socket,tags) => {socket.tags=tags;sockets.push(socket);}, setWebSocketAutoResponse() {} };
  const object = new Organisation(ctx, env);
  let count = 0;
  async function request(path, body, cookie, ip = `192.0.2.${++count}`) {
    const headers = { Origin: 'https://example.test', 'CF-Connecting-IP': ip };
    if (body) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    return worker.fetch(new Request('https://example.test' + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined }), env);
  }
  return { db, object, request, env, ctx, sockets, storage };
}
const password = 'test passphrase of sufficient length';
async function initialise(f) {
  assert.equal((await f.request('/api/auth/bootstrap', { secret: 'wrong', email: 'admin@example.test', displayName: 'Admin', password })).status, 403);
  assert.equal((await f.request('/api/auth/bootstrap', { secret: f.env.BOOTSTRAP_ADMIN_SECRET, email: 'ADMIN@example.test', displayName: 'Admin', password })).status, 201);
  const response = await f.request('/api/auth/login', { email: 'admin@example.test', password });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  return cookie.split(';')[0];
}
test('bootstrap, login, account isolation, password change and revocation', async () => {
  const f = fixture();
  const adminCookie = await initialise(f);
  assert.equal((await f.request('/api/auth/bootstrap', { secret: f.env.BOOTSTRAP_ADMIN_SECRET, email: 'other@example.test', displayName: 'Other', password })).status, 409);
  assert.equal((await f.request('/api/auth/login', { email: 'admin@example.test', password: 'wrong' })).status, 401);
  const creation = await f.request('/api/admin/accounts', { email: 'employee@example.test', displayName: 'Employee', role: 'employee', password }, adminCookie);
  assert.equal(creation.status, 201);
  const employee = (await creation.json()).account;
  assert.equal(employee.mustChangePassword, false);
  assert.equal(employee.password_hash, undefined);
  assert.equal((await f.request('/api/admin/accounts', { email: 'EMPLOYEE@example.test', displayName: 'Duplicate', role: 'admin', password }, adminCookie)).status, 409);
  const login = await f.request('/api/auth/login', { email: employee.email, password });
  const employeeCookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.request('/api/admin/accounts', { email: 'attacker@example.test', displayName: 'Bad', role: 'admin', password }, employeeCookie)).status, 403);
  assert.equal((await f.request('/api/auth/password', { currentPassword: 'wrong', newPassword: password + ' changed' }, employeeCookie)).status, 401);
  assert.equal((await f.request('/api/auth/password', { currentPassword: password, newPassword: password + ' changed' }, employeeCookie)).status, 200);
  assert.equal((await f.request('/api/auth/me', undefined, employeeCookie)).status, 401);
  const nextLogin = await f.request('/api/auth/login', { email: employee.email, password: password + ' changed' });
  const nextCookie = nextLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.request('/api/admin/accounts/disable', { accountId: employee.id }, nextCookie)).status, 403);
  assert.equal((await f.request('/api/admin/accounts/disable', { accountId: employee.id }, adminCookie)).status, 200);
  assert.equal((await f.request('/api/auth/me', undefined, nextCookie)).status, 401);
  assert.equal((await f.request('/api/auth/login', { email: employee.email, password: password + ' changed' })).status, 401);
  assert.equal((await f.request('/api/auth/logout', {}, adminCookie)).status, 200);
  assert.equal((await f.request('/api/auth/me', undefined, adminCookie)).status, 401);
  assert.ok(f.db.prepare('SELECT COUNT(*) AS count FROM auth_audit').get().count >= 6);
});
test('expired sessions, origin checks, oversized input and persistent throttling', async () => {
  const f = fixture();
  const cookie = await initialise(f);
  f.db.prepare('UPDATE sessions SET expires_at = 0').run();
  assert.equal((await f.request('/api/auth/me', undefined, cookie)).status, 401);
  const blocked = await worker.fetch(new Request('https://example.test/api/auth/login', { method: 'POST', headers: { Origin: 'https://evil.test' } }), f.env);
  assert.equal(blocked.status, 403);
  assert.equal((await f.request('/api/auth/login', { email: 'a@example.test', password: 'a'.repeat(5000) })).status, 413);
  for (let i = 0; i < 10; i++) assert.equal((await f.request('/api/auth/login', { email: 'missing@example.test', password })).status, 401);
  assert.equal((await f.request('/api/auth/login', { email: 'missing@example.test', password })).status, 429);
  const hash = f.db.prepare('SELECT password_hash FROM accounts').get().password_hash;
  assert.match(hash, /^scrypt-v1\$/);
  assert.ok(!hash.includes(password));
  const [, salt, derived] = hash.split('$');
  assert.equal(scryptSync(password, Buffer.from(salt, 'hex'), 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }).toString('hex'), derived);
  assert.equal(f.object.health().schemaVersion, 7);
});

test('employee-access Team Leads see only their led teams and retain assignments on profile edits', async () => {
  const f = fixture();
  const cookie = await initialise(f);
  const admin = f.db.prepare('SELECT id FROM accounts').get();
  f.db.prepare("UPDATE accounts SET job_role = 'team_lead' WHERE id = ?").run(admin.id);
  const response = await f.request('/api/admin/teams/save', { name: 'Led team', managerId: admin.id }, cookie);
  assert.equal(response.status, 201);
  const { teamId } = await response.json();
  f.db.prepare("INSERT INTO teams VALUES ('other-team', 'Other team', 'other team', 0)").run();
  const edit = await f.request('/api/admin/accounts/update', { accountId: admin.id, displayName: 'Lead', email: 'admin@example.test', role: 'admin', jobRole: 'team_lead' }, cookie);
  assert.equal(edit.status, 200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM manager_assignments WHERE ends_at IS NULL').get().count, 1);
  f.db.prepare("UPDATE accounts SET role = 'employee' WHERE id = ?").run(admin.id);
  const teams = await f.request('/api/manager/teams', undefined, cookie);
  assert.equal(teams.status, 200);
  assert.deepEqual((await teams.json()).teams, [{ id: teamId, name: 'Led team' }]);
  assert.equal((await f.request('/api/admin/teams', undefined, cookie)).status, 403);
  f.db.prepare("UPDATE accounts SET job_role = 'employee' WHERE id = ?").run(admin.id);
  assert.equal((await f.request('/api/manager/teams', undefined, cookie)).status, 403);
});

test('sales use server ownership/team, durable retries, and assigned Team Lead approval', async () => {
  const f = fixture();
  const adminCookie = await initialise(f);
  async function person(email, jobRole) {
    const response = await f.request('/api/admin/accounts', {email,displayName:email,role:'employee',jobRole,password}, adminCookie);
    assert.equal(response.status, 201);
    const account = (await response.json()).account;
    const login = await f.request('/api/auth/login', {email,password});
    return {id:account.id,cookie:login.headers.get('set-cookie').split(';')[0]};
  }
  const lead = await person('lead@example.test','team_lead');
  const employee = await person('seller@example.test','business_development_executive');
  const otherLead = await person('other-lead@example.test','team_lead');
  const teamResponse = await f.request('/api/admin/teams/save', {name:'Sales',managerId:lead.id},adminCookie);
  const {teamId} = await teamResponse.json();
  await f.request('/api/admin/teams/assign', {accountId:employee.id,teamId},adminCookie);
  const body = {submissionId:crypto.randomUUID(),studentName:'Student',phone:'9876543210',amount:'1234.56',overallAmount:'2000',domain:'Web Development',note:'Optional note',teamId,employeeId:lead.id};
  const created = await f.request('/api/employee/sales',body,employee.cookie);
  assert.equal(created.status,201);
  const {sale} = await created.json();
  assert.equal(sale.employeeId,employee.id);
  assert.equal(sale.teamId,teamId);
  assert.equal(sale.amountPaise,123456);
  assert.equal(sale.status,'pending');
  const retry = await f.request('/api/employee/sales',body,employee.cookie);
  assert.equal(retry.status,200);
  assert.equal((await retry.json()).sale.id,sale.id);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM collection_events').get().n,1);
  assert.equal((await f.request('/api/employee/sales',{...body,amount:'999'},employee.cookie)).status,409);
  assert.equal((await f.request('/api/employee/sales',{...body,submissionId:crypto.randomUUID(),teamId:'unassigned'},employee.cookie)).status,403);
  assert.equal((await f.request('/api/employee/sales',{...body,submissionId:crypto.randomUUID(),amount:'1.234'},employee.cookie)).status,400);
  assert.equal((await f.request('/api/employee/sales',{...body,submissionId:crypto.randomUUID(),domain:'Unknown'},employee.cookie)).status,400);
  const before = await f.request('/api/employee/sales',undefined,employee.cookie);
  assert.equal((await before.json()).totals.approvedAmountPaise,0);
  assert.equal((await f.request('/api/manager/sales',undefined,employee.cookie)).status,403);
  assert.equal((await f.request('/api/manager/sales/review',{saleId:sale.id,status:'approved'},otherLead.cookie)).status,403);
  const otherQueue = await f.request('/api/manager/sales',undefined,otherLead.cookie);
  assert.equal((await otherQueue.json()).total,0);
  assert.equal((await f.request('/api/manager/sales/review',{saleId:sale.id,status:'approved'},lead.cookie)).status,200);
  assert.equal((await f.request('/api/manager/sales/review',{saleId:sale.id,status:'approved'},adminCookie)).status,200);
  assert.equal((await f.request('/api/manager/sales/review',{saleId:sale.id,status:'rejected',reason:'Changed'},adminCookie)).status,409);
  const after = await f.request('/api/employee/sales',undefined,employee.cookie);
  assert.deepEqual((await after.json()).totals,{approvedAmountPaise:123456,approvedCount:1});
  const own = await f.request('/api/employee/sales',{...body,submissionId:crypto.randomUUID()},lead.cookie);
  assert.equal(own.status,201);
  const ownSale = (await own.json()).sale;
  assert.equal(ownSale.employeeId,lead.id);
  assert.equal((await f.request('/api/manager/sales/review',{saleId:ownSale.id,status:'approved'},lead.cookie)).status,200);
  const rejected = await f.request('/api/employee/sales',{...body,submissionId:crypto.randomUUID()},employee.cookie);
  const rejectedId = (await rejected.json()).sale.id;
  assert.equal((await f.request('/api/manager/sales/review',{saleId:rejectedId,status:'rejected'},adminCookie)).status,400);
  assert.equal((await f.request('/api/manager/sales/review',{saleId:rejectedId,status:'rejected',reason:'Wrong details'},adminCookie)).status,200);
  const transferred = await f.request('/api/admin/teams/save',{name:'New team',managerId:''},adminCookie);
  const newTeamId = (await transferred.json()).teamId;
  await f.request('/api/admin/teams/assign',{accountId:employee.id,teamId:newTeamId},adminCookie);
  const historyRetry = await f.request('/api/employee/sales',body,employee.cookie);
  assert.equal((await historyRetry.json()).sale.teamId,teamId);
  const leadHistory = await f.request('/api/employee/sales',undefined,lead.cookie);
  assert.ok((await leadHistory.json()).sales.every(s=>s.employeeId===lead.id));
});

class FakeLiveSocket {
  readyState = 1;
  messages = [];
  tags = [];
  serializeAttachment(value) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
  send(message) { assert.equal(this.readyState,1); this.messages.push(JSON.parse(message)); }
  close(code,reason) { this.readyState=3; this.closeCode=code; this.closeReason=reason; }
}
async function liveSocket(f, cookie) {
  const token = cookie.split('=')[1];
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
  const session=f.db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(hash);
  const socket=new FakeLiveSocket();
  socket.serializeAttachment({tokenHash:hash,accountId:session.account_id,expiresAt:session.expires_at,scope:''});
  f.ctx.acceptWebSocket(socket,[`account:${session.account_id}`]);
  return socket;
}

test('live sale events are post-commit, scoped, versioned, and recoverable after hibernation', async () => {
  const f=fixture(); const adminCookie=await initialise(f);
  async function person(email,jobRole) {
    const response=await f.request('/api/admin/accounts',{email,displayName:email,role:'employee',jobRole,password},adminCookie);
    const account=(await response.json()).account;
    const login=await f.request('/api/auth/login',{email,password});
    return {id:account.id,cookie:login.headers.get('set-cookie').split(';')[0]};
  }
  const lead=await person('livelead@example.test','team_lead');
  const other=await person('outside@example.test','team_lead');
  const seller=await person('liveseller@example.test','employee');
  const team=(await (await f.request('/api/admin/teams/save',{name:'Live team',managerId:lead.id},adminCookie)).json()).teamId;
  await f.request('/api/admin/teams/assign',{accountId:seller.id,teamId:team},adminCookie);
  const adminSocket=await liveSocket(f,adminCookie),leadSocket=await liveSocket(f,lead.cookie),sellerSocket=await liveSocket(f,seller.cookie),otherSocket=await liveSocket(f,other.cookie);
  const send=adminSocket.send.bind(adminSocket);
  adminSocket.send=message=>{
    const event=JSON.parse(message);
    if(event.type==='sales_changed') assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM auth_audit WHERE action IN ('sale_submitted','sale_approved')").get().n,event.version);
    send(message);
  };
  const payload={submissionId:crypto.randomUUID(),studentName:'Private Student',phone:'9876543210',amount:'100.50',overallAmount:'2000',domain:'Finance',note:'Private note',teamId:team};
  const response=await f.request('/api/employee/sales',payload,seller.cookie);
  assert.equal(response.status,201);const sale=(await response.json()).sale;
  for(const socket of [adminSocket,leadSocket,sellerSocket]) assert.deepEqual(socket.messages,[{type:'sales_changed',version:1}]);
  assert.deepEqual(otherSocket.messages,[]);
  assert.ok(!JSON.stringify(adminSocket.messages).includes('Private'));
  await f.request('/api/employee/sales',payload,seller.cookie);
  assert.equal(adminSocket.messages.length,1);
  await f.request('/api/manager/sales/review',{saleId:sale.id,status:'approved'},lead.cookie);
  assert.deepEqual(sellerSocket.messages.at(-1),{type:'sales_changed',version:2});
  const restored=new Organisation(f.ctx,f.env);
  restored.webSocketMessage(sellerSocket,'sync');
  assert.deepEqual(sellerSocket.messages.at(-1),{type:'ready',version:2});
  // Reassign review scope: prior lead stops receiving changes, new lead starts.
  await f.request('/api/admin/teams/save',{teamId:team,name:'Live team',managerId:other.id},adminCookie);
  assert.equal(leadSocket.messages.at(-1).type,'access_changed');
  const oldCount=leadSocket.messages.length;
  await f.request('/api/employee/sales',{...payload,submissionId:crypto.randomUUID()},seller.cookie);
  assert.equal(leadSocket.messages.length,oldCount);
  assert.deepEqual(otherSocket.messages.at(-1),{type:'sales_changed',version:3});
  await f.request('/api/auth/logout',{},seller.cookie);
  assert.equal(sellerSocket.closeCode,4401);
  await f.request('/api/admin/accounts/disable',{accountId:other.id},adminCookie);
  assert.equal(otherSocket.closeCode,4401);
  f.db.prepare('UPDATE sessions SET expires_at=0 WHERE account_id=?').run(lead.id);
  await restored.alarm();
  assert.equal(leadSocket.closeCode,4401);
  assert.ok(f.storage.alarmTime > Date.now());
});

test('live handshake requires upgrade, trusted origin and valid session', async () => {
  const f=fixture();const cookie=await initialise(f);
  function connect(origin,cookieValue,upgrade='websocket') {
    return worker.fetch(new Request('https://example.test/api/employee/sales/live',{headers:{Origin:origin,Upgrade:upgrade,...(cookieValue ? {Cookie:cookieValue} : {})}}),f.env);
  }
  assert.equal((await connect('https://evil.test',cookie)).status,403);
  assert.equal((await connect('https://example.test',cookie,'not-websocket')).status,426);
  assert.equal((await connect('https://example.test',null)).status,401);
  const NativeResponse=globalThis.Response;
  globalThis.WebSocketPair=class { constructor(){this[0]=new FakeLiveSocket();this[1]=new FakeLiveSocket();} };
  // Node has no 101 response/socket upgrade runtime. Stub only that runtime boundary.
  globalThis.Response=new Proxy(NativeResponse,{construct(target,args){if(args[1]?.status===101)return {status:101,webSocket:args[1].webSocket};return Reflect.construct(target,args);}});
  try {
    const response=await connect('https://example.test',cookie);
    assert.equal(response.status,101);
    assert.equal(f.sockets.length,1);
    assert.deepEqual(f.sockets[0].messages,[{type:'ready',version:0}]);
    assert.ok(f.storage.alarmTime>Date.now());
  } finally {globalThis.Response=NativeResponse;delete globalThis.WebSocketPair;}
});

test('monthly targets enforce admin/assigned lead scope, chosen basis, revisions and approved IST progress', async () => {
  const f=fixture();const adminCookie=await initialise(f);
  async function person(email,jobRole) {
    const response=await f.request('/api/admin/accounts',{email,displayName:email,role:'employee',jobRole,password},adminCookie);
    const account=(await response.json()).account;
    const login=await f.request('/api/auth/login',{email,password});
    return {id:account.id,cookie:login.headers.get('set-cookie').split(';')[0]};
  }
  const lead=await person('targetlead@example.test','team_lead');
  const employee=await person('targetemployee@example.test','employee');
  const outside=await person('targetoutside@example.test','employee');
  const teamId=(await (await f.request('/api/admin/teams/save',{name:'Target team',managerId:lead.id},adminCookie)).json()).teamId;
  await f.request('/api/admin/teams/assign',{accountId:employee.id,teamId},adminCookie);
  const base={accountId:employee.id,month:'2026-10',basis:'registration',amount:'500',expectedRevision:0};
  assert.equal((await f.request('/api/manager/targets',base,employee.cookie)).status,403);
  assert.equal((await f.request('/api/manager/targets',{...base,accountId:lead.id},lead.cookie)).status,403);
  assert.equal((await f.request('/api/manager/targets',{...base,accountId:outside.id},lead.cookie)).status,403);
  assert.equal((await f.request('/api/manager/targets',base,lead.cookie)).status,200);
  assert.equal((await f.request('/api/manager/targets',{...base,accountId:lead.id},adminCookie)).status,200);
  const queue=(await (await f.request('/api/manager/targets?month=2026-10',undefined,lead.cookie)).json()).people;
  assert.deepEqual(queue.map(p=>p.id),[employee.id]);
  const payload={submissionId:crypto.randomUUID(),studentName:'Target Student',phone:'9876543210',amount:'200',overallAmount:'1000',domain:'Finance',note:'',teamId};
  assert.equal((await f.request('/api/employee/sales',{...payload,overallAmount:'199.99'},employee.cookie)).status,400);
  assert.equal((await f.request('/api/employee/sales',{...payload,overallAmount:'1000.001'},employee.cookie)).status,400);
  const submitted=await f.request('/api/employee/sales',payload,employee.cookie);
  const sale=(await submitted.json()).sale;
  assert.equal(sale.overallAmountPaise,100000);
  assert.equal(sale.remainingAmountPaise,80000);
  const octoberStart=Date.UTC(2026,9,1)-19800000;
  f.db.prepare('UPDATE sales SET created_at=? WHERE id=?').run(octoberStart,sale.id);
  async function progress(month='2026-10'){return (await (await f.request(`/api/employee/performance?month=${month}`,undefined,employee.cookie)).json()).performance;}
  assert.equal((await progress()).achievement,0);
  await f.request('/api/manager/sales/review',{saleId:sale.id,status:'approved'},lead.cookie);
  const registration=await progress();
  assert.equal(registration.registrationPaise,20000);
  assert.equal(registration.overallPaise,100000);
  assert.equal(registration.achievement,40);
  assert.equal(registration.remainingPaise,30000);
  assert.equal((await progress('2026-09')).approvedCount,0);
  assert.equal((await f.request('/api/manager/targets',{...base,basis:'overall',expectedRevision:1},adminCookie)).status,200);
  const overall=await progress();
  assert.equal(overall.achievement,200);
  assert.equal(overall.remainingPaise,0);
  assert.equal(overall.revision,2);
  assert.equal((await f.request('/api/manager/targets',{...base,amount:'600',expectedRevision:1},lead.cookie)).status,409);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM period_target_revisions WHERE account_id=?').get(employee.id).n,2);
  assert.equal((await f.request('/api/manager/targets',{...base,month:'2026-13'},adminCookie)).status,400);
  assert.equal((await f.request('/api/manager/targets',{...base,amount:'0'},adminCookie)).status,400);
  // Historical overall value unknown: registration remains valid, total value is not fabricated.
  f.db.prepare('UPDATE sales SET overall_amount_paise=NULL WHERE id=?').run(sale.id);
  const legacy=await progress();
  assert.equal(legacy.registrationPaise,20000);
  assert.equal(legacy.overallPaise,0);
  assert.equal(legacy.missingOverallCount,1);
  // End boundary belongs to the next IST month.
  f.db.prepare('UPDATE sales SET created_at=? WHERE id=?').run(Date.UTC(2026,10,1)-19800000,sale.id);
  assert.equal((await progress()).approvedCount,0);
  assert.equal((await progress('2026-11')).approvedCount,1);
  const transferredId=(await (await f.request('/api/admin/teams/save',{name:'Moved team',managerId:''},adminCookie)).json()).teamId;
  await f.request('/api/admin/teams/assign',{accountId:employee.id,teamId:transferredId},adminCookie);
  assert.equal((await f.request('/api/manager/targets',{...base,expectedRevision:2},lead.cookie)).status,403);
});

test('target changes notify owners and existing records survive schema initialization', async () => {
  const f=fixture();const cookie=await initialise(f);
  const adminId=f.db.prepare('SELECT id FROM accounts').get().id;
  f.db.prepare("UPDATE accounts SET job_role='team_lead' WHERE id=?").run(adminId);
  const socket=await liveSocket(f,cookie);
  const response=await f.request('/api/manager/targets',{accountId:adminId,month:'2026-10',basis:'overall',amount:'5000',expectedRevision:0},cookie);
  assert.equal(response.status,200);
  assert.deepEqual(socket.messages.at(-1),{type:'sales_changed',version:1});
  const restored=new Organisation(f.ctx,f.env);
  assert.equal(restored.health().schemaVersion,7);
  assert.equal(f.db.prepare('SELECT amount_paise FROM period_targets').get().amount_paise,500000);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,1);
});

test('custom target dates are inclusive in IST and editing preserves identity, history and overlap protection', async () => {
  const f=fixture();const cookie=await initialise(f);
  const id=f.db.prepare('SELECT id FROM accounts').get().id;
  f.db.prepare("UPDATE accounts SET job_role='team_lead' WHERE id=?").run(id);
  const teamId=(await (await f.request('/api/admin/teams/save',{name:'Date team',managerId:id},cookie)).json()).teamId;
  const created=await f.request('/api/manager/targets',{accountId:id,from:'2026-10-10',to:'2026-10-11',basis:'registration',amount:'100',expectedRevision:0},cookie);
  assert.equal(created.status,200);
  const {targetId}=await created.json();
  const start=Date.UTC(2026,9,10)-19800000,end=Date.UTC(2026,9,12)-19800000;
  for(const time of [start-1,start,end-1,end]) {
    const response=await f.request('/api/employee/sales',{submissionId:crypto.randomUUID(),studentName:'Date Student',phone:'9876543210',amount:'10',overallAmount:'100',domain:'Finance',note:'',teamId},cookie);
    const sale=(await response.json()).sale;
    f.db.prepare('UPDATE sales SET created_at=? WHERE id=?').run(time,sale.id);
    await f.request('/api/manager/sales/review',{saleId:sale.id,status:'approved'},cookie);
  }
  const initial=(await (await f.request('/api/employee/performance?from=2026-10-10&to=2026-10-11',undefined,cookie)).json());
  assert.equal(initial.performance.approvedCount,2);
  assert.equal(initial.performance.registrationPaise,2000);
  assert.equal(initial.performance.achievement,20);
  assert.equal(initial.targets[0].fromDate,'2026-10-10');
  const singleDay=(await (await f.request('/api/employee/performance?from=2026-10-10&to=2026-10-10',undefined,cookie)).json()).performance;
  assert.equal(singleDay.approvedCount,1);
  const monthlyView=(await (await f.request('/api/employee/performance?month=2026-10',undefined,cookie)).json());
  assert.equal(monthlyView.performance.approvedCount,4);
  assert.equal(monthlyView.targets[0].approvedCount,2); // Target always uses its own dates.
  const edited=await f.request('/api/manager/targets',{accountId:id,targetId,from:'2026-10-10',to:'2026-10-12',basis:'overall',amount:'1000',expectedRevision:1},cookie);
  assert.equal(edited.status,200);
  const editResult=await edited.json();
  assert.equal(editResult.targetId,targetId);
  assert.equal(editResult.revision,2);
  const changed=(await (await f.request('/api/employee/performance?from=2026-10-10&to=2026-10-12',undefined,cookie)).json()).performance;
  assert.equal(changed.approvedCount,3);
  assert.equal(changed.achievedPaise,30000);
  assert.equal(changed.achievement,30);
  const revisions=f.db.prepare('SELECT from_date,to_date,basis,amount_paise FROM period_target_revisions WHERE target_id=? ORDER BY revision').all(targetId);
  assert.deepEqual(revisions.map(r=>[r.from_date,r.to_date,r.basis,r.amount_paise]),[['2026-10-10','2026-10-11','registration',10000],['2026-10-10','2026-10-12','overall',100000]]);
  assert.equal((await f.request('/api/manager/targets',{accountId:id,from:'2026-10-12',to:'2026-10-15',basis:'registration',amount:'100'},cookie)).status,409);
  // Adjacent periods do not overlap because the end date is inclusive.
  assert.equal((await f.request('/api/manager/targets',{accountId:id,from:'2026-10-13',to:'2026-10-15',basis:'registration',amount:'100'},cookie)).status,200);
  assert.equal((await f.request('/api/manager/targets',{accountId:id,targetId,from:'2026-10-10',to:'2026-10-13',basis:'registration',amount:'100',expectedRevision:2},cookie)).status,409);
  const crossMonth=await f.request('/api/manager/targets',{accountId:id,from:'2026-10-31',to:'2026-11-02',basis:'registration',amount:'100'},cookie);
  assert.equal(crossMonth.status,200);
  const crossId=(await crossMonth.json()).targetId;
  assert.equal(f.db.prepare('SELECT ends_at FROM period_targets WHERE id=?').get(crossId).ends_at,Date.UTC(2026,10,3)-19800000);
  const row=f.db.prepare('SELECT to_date,revision FROM period_targets WHERE id=?').get(targetId);
  assert.equal(row.to_date,'2026-10-12');assert.equal(row.revision,2);
  for(const dates of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-10-20',to:'2026-10-19'},{from:'2026-10-20'}, {from:'2100-01-01',to:'2100-01-02'}]) {
    assert.equal((await f.request('/api/manager/targets',{accountId:id,basis:'registration',amount:'100',...dates},cookie)).status,400);
  }
});

test('monthly targets and revisions migrate once to calendar date periods including leap years', async () => {
  const f=fixture();await initialise(f);
  const id=f.db.prepare('SELECT id FROM accounts').get().id;
  f.db.prepare("UPDATE accounts SET job_role='team_lead' WHERE id=?").run(id);
  f.db.prepare("UPDATE app_metadata SET value='6' WHERE key='schema_version'").run();
  f.db.prepare('INSERT INTO performance_targets VALUES (?,?,?,?,?,?,?)').run(id,'2024-02','overall',75000,2,id,123);
  f.db.prepare('INSERT INTO target_revisions VALUES (?,?,?,?,?,?,?,?)').run('old-revision-1',id,'2024-02','registration',50000,1,id,122);
  f.db.prepare('INSERT INTO target_revisions VALUES (?,?,?,?,?,?,?,?)').run('old-revision-2',id,'2024-02','overall',75000,2,id,123);
  const migrated=new Organisation(f.ctx,f.env);
  assert.equal(migrated.health().schemaVersion,7);
  const target=f.db.prepare('SELECT * FROM period_targets').get();
  assert.equal(target.from_date,'2024-02-01');assert.equal(target.to_date,'2024-02-29');
  assert.equal(target.amount_paise,75000);assert.equal(target.revision,2);
  assert.equal(target.starts_at,Date.UTC(2024,1,1)-19800000);
  assert.equal(target.ends_at,Date.UTC(2024,2,1)-19800000);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM period_target_revisions').get().n,2);
  new Organisation(f.ctx,f.env);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM period_targets').get().n,1);
  const original=f.db.prepare('SELECT COUNT(*) AS n FROM target_revisions').get().n;
  assert.equal(original,2); // Original monthly audit records are retained too.
});


test('admin sales filters preserve historical attribution, IST boundaries and pagination', async () => {
  const f = fixture();
  const adminCookie = await initialise(f);
  const admin = f.db.prepare("SELECT id FROM accounts WHERE role='admin'").get().id;
  const created = await f.request('/api/admin/accounts', { email: 'seller@example.test', displayName: 'Seller', role: 'employee', password }, adminCookie);
  const seller = (await created.json()).account.id;
  const login = await f.request('/api/auth/login', { email: 'seller@example.test', password });
  const employeeCookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.request('/api/admin/sales', undefined, employeeCookie)).status, 403);
  assert.equal((await f.request('/api/admin/sales')).status, 401);
  f.db.prepare('INSERT INTO teams VALUES (?,?,?,?)').run('team-a','A','a',0);
  f.db.prepare('INSERT INTO teams VALUES (?,?,?,?)').run('team-b','B','b',0);
  const start = Date.parse('2026-10-01T00:00:00+05:30');
  const end = Date.parse('2026-11-01T00:00:00+05:30');
  const insert = f.db.prepare("INSERT INTO sales (id,submission_id,employee_id,team_id,student_name,phone,domain,note,amount_paise,status,fingerprint,created_at,overall_amount_paise) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let i=0;i<28;i++) insert.run('sale-'+i,'sub-'+i,seller,'team-a','Student','9876543210','Finance','',10000,i===0?'approved':'pending','test',start+i,20000);
  insert.run('other','other',admin,'team-b','Other','9876543210','Finance','',5000,'rejected','test',end-1,10000);
  insert.run('before','before',seller,'team-a','Before','9876543210','Finance','',10000,'approved','test',start-1,20000);
  insert.run('after','after',seller,'team-a','After','9876543210','Finance','',10000,'approved','test',end,20000);
  const query = '/api/admin/sales?from=2026-10-01&to=2026-10-31';
  const all = await (await f.request(query, undefined, adminCookie)).json();
  assert.equal(all.total,29);
  assert.equal(all.sales.length,25);
  assert.equal(all.totals.approvedAmountPaise,10000);
  const filtered = await (await f.request(query+'&teamId=team-a&employeeId='+seller+'&page=2', undefined, adminCookie)).json();
  assert.equal(filtered.total,28);
  assert.equal(filtered.sales.length,3);
  assert.ok(filtered.sales.every(s=>s.teamId==='team-a' && s.employeeId===seller));
  const mismatch = await (await f.request(query+'&teamId=team-b&employeeId='+seller, undefined, adminCookie)).json();
  assert.equal(mismatch.total,0);
  assert.equal((await f.request('/api/admin/sales?from=2026-10-31&to=2026-10-01', undefined, adminCookie)).status,400);
  assert.equal((await f.request(query+'&page=0', undefined, adminCookie)).status,400);
  const defaults = await (await f.request('/api/admin/sales', undefined, adminCookie)).json();
  const month = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit'}).formatToParts(new Date());
  assert.equal(defaults.period.from,month.find(p=>p.type==='year').value+'-'+month.find(p=>p.type==='month').value+'-01');
});


test('TV leaderboard ranks approved registrations with shared ties and excludes student data', async () => {
  const f = fixture();
  const cookie = await initialise(f);
  const admin = f.db.prepare("SELECT id FROM accounts WHERE role='admin'").get().id;
  f.db.prepare("INSERT INTO accounts (id,email,display_name,password_hash,role,active,must_change_password,created_at,job_role) VALUES (?,?,?,?,?,1,0,?,?)").run('second','second@example.test','Second','unused','employee',Date.now(),'team_lead');
  f.db.prepare('INSERT INTO teams VALUES (?,?,?,?)').run('tv-a','TV A','tv-a',Date.now());
  f.db.prepare('INSERT INTO teams VALUES (?,?,?,?)').run('tv-b','TV B','tv-b',Date.now());
  const insert = f.db.prepare("INSERT INTO sales (id,submission_id,employee_id,team_id,student_name,phone,domain,note,amount_paise,status,fingerprint,created_at,overall_amount_paise) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  insert.run('tv-1','tv-1',admin,'tv-a','Private student','9876543210','Finance','Private note',10000,'approved','x',Date.now(),50000);
  insert.run('tv-2','tv-2','second','tv-b','Private student','9876543210','Finance','Private note',10000,'approved','x',Date.now(),90000);
  insert.run('tv-3','tv-3','second','tv-b','Private student','9876543210','Finance','Private note',99999,'pending','x',Date.now(),100000);
  insert.run('tv-4','tv-4',admin,'tv-a','Private student','9876543210','Finance','Private note',99999,'rejected','x',Date.now(),100000);
  insert.run('tv-old','tv-old',admin,'tv-a','Private student','9876543210','Finance','Private note',99999,'approved','x',0,100000);
  assert.equal((await f.request('/api/admin/tv')).status,401);
  const employeeToken = 'a'.repeat(64);
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(employeeToken))).toString('hex');
  f.db.prepare("INSERT INTO sessions VALUES (?, 'second', ?)").run(hash,Date.now()+60000);
  assert.equal((await f.request('/api/admin/tv',undefined,'__Host-persevex_session='+employeeToken)).status,403);
  const response = await f.request('/api/admin/tv',undefined,cookie);
  assert.equal(response.status,200);
  const board = await response.json();
  assert.equal(board.totals.amountPaise,20000);
  assert.equal(board.totals.approved,2);
  assert.equal(board.totals.pending,1);
  assert.equal(board.employees.length,2);
  assert.deepEqual(board.employees.map(row=>row.rank),[1,1]);
  assert.deepEqual(board.teams.map(row=>row.rank),[1,1]);
  assert.ok(board.employees.every(row=>row.amountPaise===10000 && row.salesCount===1));
  assert.equal(board.activity.length,4);
  assert.ok(!JSON.stringify(board).includes('Private'));
  assert.ok(!JSON.stringify(board).includes('9876543210'));
  assert.ok(!JSON.stringify(board).includes('@example.test'));
  assert.equal((await f.request('/api/admin/overview')).status,401);
  assert.equal((await f.request('/api/admin/overview',undefined,'__Host-persevex_session='+employeeToken)).status,403);
  const overview = await (await f.request('/api/admin/overview',undefined,cookie)).json();
  assert.equal(overview.sales.total,4);
  assert.equal(overview.sales.approved,2);
  assert.equal(overview.sales.pending,1);
  assert.equal(overview.sales.rejected,1);
  assert.equal(overview.sales.registrationPaise,20000);
  assert.equal(overview.sales.overallPaise,140000);
  assert.equal(overview.sales.remainingPaise,120000);
  assert.equal(overview.workspace.teams,2);
  assert.equal(overview.workspace.teamLeads,1);
  f.db.prepare("UPDATE sales SET overall_amount_paise=NULL WHERE id='tv-1'").run();
  const legacy = await (await f.request('/api/admin/overview',undefined,cookie)).json();
  assert.equal(legacy.sales.missingOverall,1);
  assert.equal(legacy.sales.registrationPaise,20000);
  assert.equal(legacy.sales.overallPaise,90000);
  assert.equal(legacy.sales.remainingPaise,80000);
  const historical = await (await f.request('/api/admin/overview?from=2000-01-01&to=2000-01-02',undefined,cookie)).json();
  assert.equal(historical.sales.total,0);
  assert.equal(historical.sales.registrationPaise,0);
  assert.equal((await f.request('/api/admin/overview?from=2026-10-13&to=2026-10-01',undefined,cookie)).status,400);

});
