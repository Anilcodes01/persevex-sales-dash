import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync } from 'node:crypto';
import { build } from 'esbuild';

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
  const object = new Organisation({ storage }, env);
  let count = 0;
  async function request(path, body, cookie, ip = `192.0.2.${++count}`) {
    const headers = { Origin: 'https://example.test', 'CF-Connecting-IP': ip };
    if (body) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    return worker.fetch(new Request('https://example.test' + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined }), env);
  }
  return { db, object, request, env };
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
  assert.equal(employee.mustChangePassword, true);
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
  assert.equal(f.object.health().schemaVersion, 3);
});
