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
function fixture(beforeInit) {
  const db = new DatabaseSync(':memory:');
  beforeInit?.(db);
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
  assert.equal(f.object.health().schemaVersion, 11);
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
  assert.equal(restored.health().schemaVersion,11);
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
  assert.equal(migrated.health().schemaVersion,11);
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
  const start = Date.parse(board.period.from+'T00:00:00+05:30');
  const end = Date.parse(board.period.to+'T00:00:00+05:30')+86400000;
  const target = f.db.prepare('INSERT INTO period_targets VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  target.run('tv-target-a',admin,board.period.from,board.period.to,start,end,'sales_count',null,1,admin,Date.now(),4);
  target.run('tv-target-b','second',board.period.from,board.period.to,start,end,'sales_count',null,1,admin,Date.now(),2);
  f.db.prepare('INSERT INTO team_memberships VALUES (?,?,?,?,NULL)').run('tv-member-a',admin,'tv-a',start);
  f.db.prepare('INSERT INTO manager_assignments VALUES (?,?,?,?,NULL)').run('tv-lead-a',admin,'tv-a',start);
  f.db.prepare('INSERT INTO team_memberships VALUES (?,?,?,?,NULL)').run('tv-member-b','second','tv-b',start);
  f.db.prepare("UPDATE sales SET amount_paise=20000 WHERE id='tv-1'").run();
  const counts = await (await f.request('/api/admin/tv',undefined,cookie)).json();
  assert.deepEqual(counts.employees.map(row=>row.rank),[1,1]); // Amount no longer breaks count ties.
  assert.equal(counts.employees.find(row=>row.id===admin).targetCount,4);
  assert.equal(counts.employees.find(row=>row.id===admin).achievement,25);
  assert.equal(counts.teams.find(row=>row.id==='tv-a').targetCount,4); // Lead/member counted once.
  assert.equal(counts.teams.find(row=>row.id==='tv-b').achievement,50);
  f.db.prepare("DELETE FROM period_targets WHERE id='tv-target-b'").run();
  const partial = await (await f.request('/api/admin/tv',undefined,cookie)).json();
  assert.equal(partial.teams.find(row=>row.id==='tv-b').targetCount,null);
  assert.equal(partial.teams.find(row=>row.id==='tv-b').achievement,null);
  f.db.prepare("UPDATE sales SET amount_paise=10000 WHERE id='tv-1'").run();

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


test('sales-count targets validate whole numbers, enforce lead scope, count approved sales and preserve edits', async () => {
  const f=fixture();const cookie=await initialise(f);
  async function person(email,jobRole='employee') {
    const result=await f.request('/api/admin/accounts',{email,displayName:email,role:'employee',jobRole,password},cookie);
    const account=(await result.json()).account;
    const login=await f.request('/api/auth/login',{email,password});
    return {...account,cookie:login.headers.get('set-cookie').split(';')[0]};
  }
  const lead=await person('count-lead@example.test','team_lead');
  const employee=await person('count-employee@example.test');
  const outside=await person('count-outside@example.test');
  const team=(await (await f.request('/api/admin/teams/save',{name:'Count team',managerId:lead.id},cookie)).json()).teamId;
  await f.request('/api/admin/teams/assign',{accountId:employee.id,teamId:team},cookie);
  const directory = await (await f.request('/api/admin/teams',undefined,cookie)).json();
  const listedTeam = directory.teams.find(item=>item.id===team);
  assert.equal(listedTeam.manager.email,'count-lead@example.test');
  assert.equal(listedTeam.manager.jobRole,'team_lead');
  assert.equal(listedTeam.members[0].jobRole,'employee');

  const body={accountId:employee.id,from:'2026-10-10',to:'2026-10-11',basis:'sales_count',count:'2',expectedRevision:0};
  for(const count of ['0','-1','1.5','2.0','1e3','','10000000',2,null]) assert.equal((await f.request('/api/manager/targets',{...body,count},cookie)).status,400);
  assert.equal((await f.request('/api/manager/targets',body,employee.cookie)).status,403);
  assert.equal((await f.request('/api/manager/targets',{...body,accountId:lead.id},lead.cookie)).status,403);
  assert.equal((await f.request('/api/manager/targets',{...body,accountId:outside.id},lead.cookie)).status,403);
  const saved=await f.request('/api/manager/targets',body,lead.cookie);assert.equal(saved.status,200);
  const {targetId}=await saved.json();
  assert.equal((await f.request('/api/manager/targets',{...body,accountId:lead.id},cookie)).status,200);
  assert.equal((await f.request('/api/manager/targets',{...body,accountId:outside.id},cookie)).status,200);
  const filtered = await (await f.request('/api/manager/targets?from=2026-10-10&to=2026-10-11&teamId='+team,undefined,cookie)).json();
  assert.deepEqual(filtered.people.map(p=>p.id).sort(),[employee.id,lead.id].sort());
  assert.deepEqual(filtered.targets.map(p=>p.id).sort(),[employee.id,lead.id].sort());
  assert.ok(filtered.teams.some(t=>t.id===team));
  const empty = await (await f.request('/api/manager/targets?month=2026-10&teamId=missing',undefined,cookie)).json();
  assert.equal(empty.people.length,0);assert.equal(empty.targets.length,0);
  const leadFiltered = await (await f.request('/api/manager/targets?from=2026-10-10&to=2026-10-11&teamId=missing',undefined,lead.cookie)).json();
  assert.deepEqual(leadFiltered.people.map(p=>p.id),[employee.id]);
  assert.equal(leadFiltered.teams.length,0);
  const start=Date.parse('2026-10-10T00:00:00+05:30'),end=Date.parse('2026-10-12T00:00:00+05:30');
  const insert=f.db.prepare("INSERT INTO sales (id,submission_id,employee_id,team_id,student_name,phone,domain,note,amount_paise,status,fingerprint,created_at,overall_amount_paise) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for(const [id,status,time] of [['a','approved',start],['b','approved',end-1],['c','pending',start],['d','rejected',start],['e','approved',start-1],['f','approved',end]]) insert.run(id,id,employee.id,team,'Student','9876543210','Finance','',10000,status,'x',time,null);
  async function progress(){return (await (await f.request('/api/employee/performance?from=2026-10-10&to=2026-10-11',undefined,employee.cookie)).json());}
  const result=await progress();
  assert.equal(result.performance.targetPaise,null);assert.equal(result.performance.targetCount,2);
  assert.equal(result.performance.targetValue,2);assert.equal(result.performance.achievedValue,2);
  assert.equal(result.performance.achievement,100);assert.equal(result.targets[0].remainingValue,0);
  assert.equal((await f.request('/api/manager/targets',{...body,targetId,count:'1',expectedRevision:1},lead.cookie)).status,200);
  assert.equal((await progress()).targets[0].achievement,200);
  assert.equal((await f.request('/api/manager/targets',{...body,targetId,count:'3',expectedRevision:1},cookie)).status,409);
  assert.equal((await f.request('/api/manager/targets',{...body,targetId,basis:'registration',amount:'500',expectedRevision:2},cookie)).status,200);
  assert.equal((await progress()).performance.achievement,40);
  const revisions=f.db.prepare('SELECT basis,target_count,amount_paise FROM period_target_revisions WHERE target_id=? ORDER BY revision').all(targetId);
  assert.deepEqual(revisions.map(r=>[r.basis,r.target_count,r.amount_paise]),[['sales_count',2,null],['sales_count',1,null],['registration',null,50000]]);
  new Organisation(f.ctx,f.env);
  assert.equal((await progress()).performance.targetPaise,50000);
});

test('v7 money targets migrate to v8 with audit history and foreign keys intact', () => {
  const f=fixture(db=>{
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE app_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT INTO app_metadata VALUES ('schema_version','7');
      CREATE TABLE accounts (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL,must_change_password INTEGER NOT NULL,created_at INTEGER NOT NULL,job_role TEXT NOT NULL);
      INSERT INTO accounts VALUES ('legacy','legacy@example.test','Legacy','unused','employee',1,0,0,'employee');
      CREATE TABLE period_targets (id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),from_date TEXT NOT NULL,to_date TEXT NOT NULL,starts_at INTEGER NOT NULL,ends_at INTEGER NOT NULL,basis TEXT NOT NULL CHECK(basis IN ('registration','overall')),amount_paise INTEGER NOT NULL,revision INTEGER NOT NULL,updated_by TEXT NOT NULL REFERENCES accounts(id),updated_at INTEGER NOT NULL);
      INSERT INTO period_targets VALUES ('old','legacy','2026-10-01','2026-10-31',1,2,'overall',50000,2,'legacy',10);
      CREATE TABLE period_target_revisions (id TEXT PRIMARY KEY,target_id TEXT NOT NULL REFERENCES period_targets(id),account_id TEXT NOT NULL,from_date TEXT NOT NULL,to_date TEXT NOT NULL,basis TEXT NOT NULL,amount_paise INTEGER NOT NULL,revision INTEGER NOT NULL,actor_id TEXT NOT NULL,recorded_at INTEGER NOT NULL,UNIQUE(target_id,revision));
      INSERT INTO period_target_revisions VALUES ('r1','old','legacy','2026-10-01','2026-10-31','registration',25000,1,'legacy',5);
      INSERT INTO period_target_revisions VALUES ('r2','old','legacy','2026-10-01','2026-10-31','overall',50000,2,'legacy',10);`);
  });
  assert.equal(f.object.health().schemaVersion,11);
  const target=f.db.prepare('SELECT * FROM period_targets').get();
  assert.equal(target.amount_paise,50000);assert.equal(target.target_count,null);assert.equal(target.revision,2);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM period_target_revisions').get().n,2);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
  new Organisation(f.ctx,f.env);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM period_targets').get().n,1);
});


async function paymentWebhook(f, payload, options={}) {
  const raw = options.raw ?? JSON.stringify(payload);
  const timestamp = options.timestamp ?? String(Date.now());
  const secret = options.secret ?? f.env.CASHFREE_WEBHOOK_SECRET ?? 'test-cashfree-secret';
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature = Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+raw))).toString('base64');
  return worker.fetch(new Request('https://example.test/api/webhooks/cashfree',{
    method:'POST',headers:{'Content-Type':'application/json','x-webhook-timestamp':timestamp,'x-webhook-signature':signature,...options.headers},body:options.sentRaw ?? raw
  }),f.env);
}
function successPayment(id='1453995084705707520') {
  return {type:'PAYMENT_SUCCESS_WEBHOOK',data:{
    order:{order_id:'order-123',order_amount:3000,order_currency:'INR'},
    payment:{cf_payment_id:id,payment_status:'SUCCESS',payment_amount:3000,payment_currency:'INR',payment_time:new Date().toISOString()},
    customer_details:{customer_name:'Payer Example',customer_email:'payer@example.test',customer_phone:'9876543210'},
  }};
}
test('Cashfree accepts signed successes once, masks TV data and notifies only authenticated admins',async()=>{
  const f=fixture(); const cookie=await initialise(f);
  f.env.CASHFREE_WEBHOOK_SECRET='test-cashfree-secret';f.env.CASHFREE_ENV='sandbox';
  const created=await f.request('/api/admin/accounts',{email:'payments-employee@example.test',displayName:'Employee',role:'employee',password},cookie);
  const employee=(await created.json()).account;
  const login=await f.request('/api/auth/login',{email:employee.email,password});
  const employeeCookie=login.headers.get('set-cookie').split(';')[0];
  const adminSocket=await liveSocket(f,cookie),employeeSocket=await liveSocket(f,employeeCookie);
  const payload=successPayment();
  const response=await paymentWebhook(f,payload);
  assert.equal(response.status,200);assert.equal((await response.json()).duplicate,false);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cashfree_payments').get().n,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sales').get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM collection_events').get().n,0);
  assert.deepEqual(adminSocket.messages,[{type:'payments_changed',version:1}]);
  assert.deepEqual(employeeSocket.messages,[]);
  const duplicate=await paymentWebhook(f,payload,{timestamp:'1700000000000'});
  assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).duplicate,true);
  assert.equal(adminSocket.messages.length,1);
  const changed=structuredClone(payload);changed.data.customer_details.customer_name='Changed metadata';
  assert.equal((await paymentWebhook(f,changed)).status,200);
  assert.equal(f.db.prepare('SELECT payer_name FROM cashfree_payments').get().payer_name,'Payer Example');
  changed.data.payment.payment_amount=4000;
  assert.equal((await paymentWebhook(f,changed)).status,409);
  const tv=await (await f.request('/api/admin/tv',undefined,cookie)).json();
  assert.equal(tv.payments.length,1);assert.equal(tv.paymentEnvironment,'sandbox');assert.equal(tv.paymentsConfigured,true);
  assert.equal(tv.payments[0].amountPaise,300000);assert.equal(tv.payments[0].name,'Payer Example');
  assert.ok(!JSON.stringify(tv).includes('9876543210'));assert.ok(!JSON.stringify(tv).includes('payer@example.test'));
  assert.equal((await f.request('/api/admin/tv',undefined,employeeCookie)).status,403);
  f.env.CASHFREE_ENV='production';
  assert.equal((await (await f.request('/api/admin/tv',undefined,cookie)).json()).payments.length,0);
  assert.equal((await paymentWebhook(f,payload)).status,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cashfree_payments').get().n,2);
  const restored=new Organisation(f.ctx,f.env);
  restored.webSocketMessage(adminSocket,'sync');assert.equal(adminSocket.messages.at(-1).version,2);
  f.db.prepare('UPDATE sessions SET expires_at=0').run();
  assert.equal((await paymentWebhook(f,successPayment('new-after-expiry'))).status,200);
  assert.equal(adminSocket.closeCode,4401);assert.equal(employeeSocket.messages.length,0);
});
test('Cashfree rejects forged, malformed and oversized deliveries before persistence',async()=>{
  const f=fixture();const payload=successPayment();
  assert.equal((await paymentWebhook(f,payload)).status,503);
  f.env.CASHFREE_ENV='sandbox';f.env.CASHFREE_WEBHOOK_SECRET='test-cashfree-secret';
  assert.equal((await worker.fetch(new Request('https://example.test/api/webhooks/cashfree'),f.env)).status,405);
  assert.equal((await paymentWebhook(f,payload,{secret:'wrong-secret'})).status,401);
  const binding=f.env.ORGANISATION;
  f.env.ORGANISATION={getByName(){throw new Error('Unauthenticated request reached storage');}};
  assert.equal((await paymentWebhook(f,payload,{secret:'wrong-secret'})).status,401);
  f.env.ORGANISATION=binding;
  assert.equal((await paymentWebhook(f,payload,{sentRaw:JSON.stringify(payload).replace('3000','3001')})).status,401);

  assert.equal((await paymentWebhook(f,payload,{headers:{'x-webhook-signature':''}})).status,401);
  assert.equal((await paymentWebhook(f,payload,{timestamp:String(Date.now()+600000)})).status,401);
  assert.equal((await paymentWebhook(f,payload,{raw:'{invalid'})).status,400);
  assert.equal((await paymentWebhook(f,payload,{headers:{'Content-Type':'text/plain'}})).status,415);
  assert.equal((await paymentWebhook(f,payload,{raw:' '.repeat(65537)})).status,413);
  assert.equal((await paymentWebhook(f,payload,{headers:{'Content-Length':'70000'}})).status,413);
  for(const [field,value] of [['payment_status','FAILED'],['payment_currency','USD'],['payment_amount',-1],['payment_amount',1.001],['cf_payment_id',9007199254740992],['payment_time','not-a-date'],['payment_time','2026-02-31T12:00:00Z']]) {
    const bad=structuredClone(payload);bad.data.payment[field]=value;assert.equal((await paymentWebhook(f,bad)).status,400);
  }
  const ignored=structuredClone(payload);ignored.type='PAYMENT_FAILED_WEBHOOK';ignored.data.payment.payment_status='FAILED';
  assert.equal((await paymentWebhook(f,ignored)).status,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cashfree_payments').get().n,0);
  assert.equal(f.db.prepare("SELECT value FROM app_metadata WHERE key='sales_version'").get().value,'0');
  // The HMAC covers original decimal spelling and whitespace, not reserialized JSON.
  const raw=JSON.stringify(payload).replace('"payment_amount":3000','"payment_amount":3000.00');
  assert.equal((await paymentWebhook(f,payload,{raw})).status,200);
});
test('Cashfree persistence failures are retryable and concurrent duplicates commit once',async()=>{
  const f=fixture();f.env.CASHFREE_ENV='sandbox';f.env.CASHFREE_WEBHOOK_SECRET='test-cashfree-secret';
  const payload=successPayment();
  const exec=f.storage.sql.exec;
  f.storage.sql.exec=(query,...args)=>{if(query.startsWith('INSERT INTO cashfree_payments'))throw new Error('disk error');return exec(query,...args);};
  assert.equal((await paymentWebhook(f,payload)).status,503);
  f.storage.sql.exec=exec;
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cashfree_payments').get().n,0);
  assert.equal(f.db.prepare("SELECT value FROM app_metadata WHERE key='sales_version'").get().value,'0');
  const responses=await Promise.all([paymentWebhook(f,payload),paymentWebhook(f,payload)]);
  assert.ok(responses.every(response=>response.status===200));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cashfree_payments').get().n,1);
  assert.equal(f.db.prepare("SELECT value FROM app_metadata WHERE key='sales_version'").get().value,'1');
});


test('unsigned mode is explicit, unverified and cannot bypass a configured signature key',async()=>{
  const f=fixture();f.env.CASHFREE_ENV='sandbox';f.env.CASHFREE_ALLOW_UNSIGNED='true';
  const payload=successPayment();
  const send=()=>worker.fetch(new Request('https://example.test/api/webhooks/cashfree',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),f.env);
  assert.equal((await send()).status,200);
  assert.equal(f.db.prepare('SELECT verified FROM cashfree_payments').get().verified,0);
  assert.equal((await send()).status,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cashfree_payments').get().n,1);
  f.env.CASHFREE_WEBHOOK_SECRET='test-cashfree-secret';
  assert.equal((await send()).status,401);
  payload.data.payment.payment_amount=4000;
  assert.equal((await paymentWebhook(f,payload)).status,200);
  const record=f.db.prepare('SELECT * FROM cashfree_payments').get();
  assert.equal(record.verified,1);assert.equal(record.amount_paise,400000);
  delete f.env.CASHFREE_WEBHOOK_SECRET;
  payload.data.payment.payment_amount=5000;
  assert.equal((await send()).status,409);
  assert.equal(f.db.prepare('SELECT amount_paise FROM cashfree_payments').get().amount_paise,400000);
});


test('admin team deletion ends current assignments atomically and preserves historical sales',async()=>{
  const f=fixture();const cookie=await initialise(f);
  async function person(email,jobRole){const created=await f.request('/api/admin/accounts',{email,displayName:email,role:'employee',jobRole,password},cookie);const account=(await created.json()).account;const login=await f.request('/api/auth/login',{email,password});return {...account,cookie:login.headers.get('set-cookie').split(';')[0]};}
  const lead=await person('delete-lead@example.test','team_lead'),employee=await person('delete-employee@example.test','employee');
  const team=(await (await f.request('/api/admin/teams/save',{name:'Delete team',managerId:lead.id},cookie)).json()).teamId;
  await f.request('/api/admin/teams/assign',{accountId:employee.id,teamId:team},cookie);
  const sale=(await (await f.request('/api/employee/sales',{submissionId:crypto.randomUUID(),teamId:team,studentName:'Historical student',phone:'9876543210',amount:'100',overallAmount:'1000',domain:'Finance',note:''},employee.cookie)).json()).sale;
  assert.equal((await f.request('/api/admin/teams/delete',{teamId:team},employee.cookie)).status,403);
  assert.equal((await f.request('/api/admin/teams/delete',{teamId:team},lead.cookie)).status,403);
  const exec=f.storage.sql.exec;
  f.storage.sql.exec=(query,...args)=>{if(query.startsWith('UPDATE manager_assignments SET ends_at=?'))throw new Error('test rollback');return exec(query,...args);};
  assert.equal((await f.request('/api/admin/teams/delete',{teamId:team},cookie)).status,503);
  f.storage.sql.exec=exec;
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM deleted_teams').get().n,0);
  assert.equal(f.db.prepare('SELECT ends_at FROM team_memberships WHERE team_id=?').get(team).ends_at,null);
  const socket=await liveSocket(f,employee.cookie);
  assert.equal((await f.request('/api/admin/teams/delete',{teamId:team},cookie)).status,200);
  assert.ok(f.db.prepare('SELECT ends_at FROM team_memberships WHERE team_id=?').get(team).ends_at);
  assert.ok(f.db.prepare('SELECT ends_at FROM manager_assignments WHERE team_id=?').get(team).ends_at);
  assert.ok(socket.messages.some(event=>event.type==='access_changed'));
  const directory=await (await f.request('/api/admin/teams',undefined,cookie)).json();assert.equal(directory.teams.length,0);
  const context=await (await f.request('/api/employee/sales/context',undefined,employee.cookie)).json();assert.equal(context.teams.length,0);
  assert.equal((await f.request('/api/admin/teams/assign',{accountId:employee.id,teamId:team},cookie)).status,404);
  assert.equal((await f.request('/api/admin/teams/save',{teamId:team,name:'Revive',managerId:lead.id},cookie)).status,404);
  assert.equal((await f.request('/api/manager/sales/review',{saleId:sale.id,status:'approved'},lead.cookie)).status,403);
  assert.equal((await f.request('/api/manager/sales/review',{saleId:sale.id,status:'approved'},cookie)).status,200);
  assert.equal(f.db.prepare('SELECT team_id FROM sales WHERE id=?').get(sale.id).team_id,team);
  const history=await (await f.request('/api/employee/sales',undefined,employee.cookie)).json();assert.equal(history.sales[0].teamName,'Delete team');
  assert.equal((await f.request('/api/admin/teams/delete',{teamId:team},cookie)).status,200);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM auth_audit WHERE action='team_deleted'").get().n,1);
  assert.equal((await f.request('/api/admin/teams/save',{name:'Delete team',managerId:lead.id},cookie)).status,201);
  assert.equal((await f.request('/api/admin/teams/delete',{teamId:'missing'},cookie)).status,404);
});

test('people directory filters current team members and leads before pagination', async () => {
  const f = fixture();
  const cookie = await initialise(f);
  async function create(email, jobRole) {
    const response = await f.request('/api/admin/accounts', { email, displayName: email, role: 'employee', jobRole, password }, cookie);
    assert.equal(response.status, 201);
    return (await response.json()).account.id;
  }
  const lead = await create('directory-lead@example.test', 'team_lead');
  const employee = await create('directory-employee@example.test', 'business_development_executive');
  const teamId = (await (await f.request('/api/admin/teams/save', { name: 'Directory team', managerId: lead }, cookie)).json()).teamId;
  await f.request('/api/admin/teams/assign', { accountId: employee, teamId }, cookie);
  const secondId = (await (await f.request('/api/admin/teams/save', { name: 'Second team', managerId: lead }, cookie)).json()).teamId;
  const roster = await (await f.request(`/api/admin/accounts?teamId=${teamId}`, undefined, cookie)).json();
  assert.equal(roster.total, 2);
  assert.deepEqual(new Set(roster.accounts.map(a => a.id)), new Set([lead, employee]));
  assert.equal(roster.accounts.find(a => a.id === lead).teams.length, 2);
  assert.deepEqual(roster.accounts.find(a => a.id === employee).teams, [{ id: teamId, name: 'Directory team' }]);
  assert.equal(roster.teams.length, 2);
  const filtered = await (await f.request(`/api/admin/accounts?teamId=${secondId}&jobRole=business_development_executive`, undefined, cookie)).json();
  assert.equal(filtered.total, 0);
  assert.equal((await (await f.request('/api/admin/accounts?teamId=unknown', undefined, cookie)).json()).total, 0);
  await f.request('/api/admin/teams/delete', { teamId }, cookie);
  const archived = await (await f.request(`/api/admin/accounts?teamId=${teamId}`, undefined, cookie)).json();
  assert.equal(archived.total, 0);
  assert.equal(archived.teams.length, 1);
});

test('admin custom-period sales reset preserves records and clears approved progress', async () => {
  const f = fixture();
  const cookie = await initialise(f);
  const response = await f.request('/api/admin/accounts', { email: 'reset-sales@example.test', displayName: 'Seller', role: 'employee', password }, cookie);
  const employee = (await response.json()).account;
  const login = await f.request('/api/auth/login', { email: employee.email, password });
  const employeeCookie = login.headers.get('set-cookie').split(';')[0];
  const teamId = (await (await f.request('/api/admin/teams/save', { name: 'Reset team', managerId: '' }, cookie)).json()).teamId;
  await f.request('/api/admin/teams/assign', { accountId: employee.id, teamId }, cookie);
  const saleResponse = await f.request('/api/employee/sales', { submissionId: crypto.randomUUID(), studentName: 'Reset student', phone: '9876543210', amount: '100', overallAmount: '500', domain: 'Finance', teamId }, employeeCookie);
  const sale = (await saleResponse.json()).sale;
  await f.request('/api/manager/sales/review', { saleId: sale.id, status: 'approved' }, cookie);
  const range = { from: '2026-01-01', to: '2026-01-31', accountId: employee.id };
  f.db.prepare('UPDATE sales SET created_at=? WHERE id=?').run(Date.parse('2026-01-15T00:00:00Z'), sale.id);
  assert.equal((await f.request('/api/admin/accounts/reset-sales', range, employeeCookie)).status, 403);
  const reset = await f.request('/api/admin/accounts/reset-sales', range, cookie);
  assert.equal(reset.status, 200);
  assert.equal((await reset.json()).resetCount, 1);
  assert.equal(f.db.prepare('SELECT status FROM sales WHERE id=?').get(sale.id).status, 'rejected');
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM auth_audit WHERE action='sale_reset'").get().n, 1);
  assert.equal((await (await f.request('/api/admin/accounts/reset-sales', range, cookie)).json()).resetCount, 0);
  assert.equal((await f.request('/api/manager/sales/review', { saleId: sale.id, status: 'approved' }, cookie)).status, 409);
  const target = { accountId: employee.id, from: range.from, to: range.to, basis: 'registration', amount: '1000' };
  const saved = await (await f.request('/api/manager/targets', target, cookie)).json();
  const edited = await f.request('/api/manager/targets', { ...target, basis: 'sales_count', count: '30', targetId: saved.targetId, expectedRevision: saved.revision }, cookie);
  assert.equal(edited.status, 200);
  const progress = await (await f.request('/api/employee/performance?from=2026-01-01&to=2026-01-31', undefined, employeeCookie)).json();
  assert.equal(progress.performance.approvedCount, 0);
  assert.equal(progress.targets[0].targetCount, 30);
});

test('private avatars enforce ownership, validate PNGs and replace R2 objects', async () => {
  const { deflateSync } = await import('node:zlib');
  function chunk(type, data) {
    const kind=Buffer.from(type); const payload=Buffer.concat([kind,data]); let crc=0xffffffff;
    for(const byte of payload) { crc^=byte; for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
    const result=Buffer.alloc(data.length+12); result.writeUInt32BE(data.length); payload.copy(result,4); result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4); return result;
  }
  const header=Buffer.alloc(13); header.writeUInt32BE(256); header.writeUInt32BE(256,4); header[8]=8; header[9]=6;
  const image=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc(256*(256*4+1)))),chunk('IEND',Buffer.alloc(0))]);
  const f=fixture(); const cookie=await initialise(f);
  const user=(await (await f.request('/api/admin/accounts',{email:'avatar@example.test',displayName:'Avatar',role:'employee',password},cookie)).json()).account;
  const login=await f.request('/api/auth/login',{email:user.email,password}); const employeeCookie=login.headers.get('set-cookie').split(';')[0];
  const objects=new Map();
  f.env.AVATARS={ async put(key,bytes) { objects.set(key,bytes); }, async delete(key) { objects.delete(key); }, async get(key) { const bytes=objects.get(key); return bytes ? { body:new Response(bytes).body,httpEtag:'"test-etag"' } : null; } };
  const path=`/api/employee/avatar?accountId=${user.id}`;
  const send=(body,session=cookie,extra='') => worker.fetch(new Request('https://example.test'+path+extra,{method:'POST',headers:{Origin:'https://example.test',Cookie:session,'Content-Type':'image/png'},body}),f.env);
  assert.equal((await f.request(path)).status,401);
  assert.equal((await send(Buffer.from('<svg/>'))).status,400);
  assert.equal((await send(image,employeeCookie)).status,200);
  assert.equal(objects.size,1);
  const read=await f.request(path,undefined,cookie); assert.equal(read.status,200); assert.equal(read.headers.get('Content-Type'),'image/png'); assert.equal(read.headers.get('Cache-Control'),'private, no-cache');
  assert.deepEqual(Buffer.from(await read.arrayBuffer()),image);
  const admin=(await (await f.request('/api/auth/me',undefined,cookie)).json()).account;
  const denied=await worker.fetch(new Request('https://example.test/api/employee/avatar?accountId='+admin.id,{method:'POST',headers:{Origin:'https://example.test',Cookie:employeeCookie,'Content-Type':'image/png'},body:image}),f.env);
  assert.equal(denied.status,403);
  assert.equal((await send(image)).status,200); assert.equal(objects.size,1);
  const corrupt=Buffer.from(image); corrupt[corrupt.length-1]^=1;
  assert.equal((await send(corrupt)).status,400); assert.equal(objects.size,1);
  assert.equal((await send(Buffer.alloc(256*1024+1))).status,413);
  assert.equal((await send(undefined,cookie,'&remove=true')).status,200); assert.equal(objects.size,0);
  assert.equal((await f.request(path,undefined,cookie)).status,404);
});
