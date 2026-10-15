import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { handlers } from '../lib/handlers.mjs';
import { hashPassword, passwordMatches, HttpError } from '../lib/security.mjs';
import { requestReset, resetPassword, sendResetEmail } from '../lib/account.mjs';

const oldPassword = 'original-password-for-tests', nextPassword = 'a-new-password-for-testing';
const env = { BLOB_READ_WRITE_TOKEN: 'test', ADMIN_EMAIL: 'owner@example.com', ADMIN_PASSWORD_HASH: hashPassword(oldPassword), SESSION_SECRET: 'a'.repeat(64), SITE_ORIGIN: 'https://easyora.vercel.app', RESEND_API_KEY: 'test-only', RESET_EMAIL_FROM: 'EasyOra <security@example.com>' };
class Store {
  docs = new Map(); limits = new Map();
  async readJson(path) { return structuredClone(this.docs.get(path) || null); }
  async writeJson(path, value, etag) {
    if (this.docs.get(path)?.etag !== etag) throw new HttpError(409, 'Conflict');
    this.docs.set(path, { value: structuredClone(value), etag: randomUUID() });
  }
  async readContent() { return null; }
  async limitLogin(key) { const count = (this.limits.get(key) || 0) + 1; this.limits.set(key, count); if (count > 10) throw new HttpError(429, 'Please wait.'); }
}
test('HTTP password change requires current password, origin and CSRF; invalidates all old sessions and survives requests', async t => {
  const store = new Store(), api = handlers(store, env);
  const server = createServer(api.admin); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  let cookie = '', csrf = '';
  const call = (data, headers = {}) => fetch(url, { method: data ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Origin: env.SITE_ORIGIN, Cookie: cookie, 'X-CSRF-Token': csrf, ...headers }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const login = await call({ action: 'login', email: env.ADMIN_EMAIL, password: oldPassword }); cookie = login.headers.get('set-cookie').split(';')[0]; csrf = (await login.json()).csrfToken;
  const change = { action: 'change-password', currentPassword: oldPassword, newPassword: nextPassword, confirmPassword: nextPassword };
  assert.equal((await call(change, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await call(change, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await call({ ...change, currentPassword: 'incorrect' })).status, 400);
  assert.equal((await call({ ...change, confirmPassword: 'mismatch' })).status, 400);
  const changed = await call(change); assert.equal(changed.status, 200); assert.match(changed.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await (await call()).json()).authenticated, false);
  assert.equal((await call({ ...change, currentPassword: nextPassword })).status, 401);
  assert.equal((await call({ action: 'login', email: env.ADMIN_EMAIL, password: oldPassword })).status, 401);
  assert.equal((await call({ action: 'login', email: env.ADMIN_EMAIL, password: nextPassword })).status, 200);
});
test('reset codes are mailed only to owner, hashed, throttled, single use, and expire', async () => {
  const store = new Store(); let code, sends = 0;
  const mailer = async (config, value) => { assert.equal(config.ADMIN_EMAIL, env.ADMIN_EMAIL); code = value; sends++; };
  await requestReset(store, env, { email: 'other@example.com' }, mailer); assert.equal(sends, 0);
  await requestReset(store, env, { email: env.ADMIN_EMAIL }, mailer, 1000000);
  assert.match(code, /^\d{6}$/); assert.equal(sends, 1); assert(!JSON.stringify([...store.docs.values()]).includes(`"${code}"`));
  await requestReset(store, env, { email: env.ADMIN_EMAIL }, mailer, 1001000); assert.equal(sends, 1);
  const input = { email: env.ADMIN_EMAIL, code, newPassword: nextPassword, confirmPassword: nextPassword };
  await assert.rejects(resetPassword(store, env, input, 1600001), { status: 400 });
  const results = await Promise.allSettled([resetPassword(store, env, input, 1002000), resetPassword(store, env, input, 1002000)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  await assert.rejects(resetPassword(store, env, input, 1003000), { status: 400 });
  const saved = (await store.readJson('easyora/security/account.json')).value;
  assert(passwordMatches(nextPassword, saved.passwordHash)); assert.equal(saved.reset, null);
});
test('five wrong attempts lock a code; resend replaces it; missing mail configuration fails honestly', async () => {
  const store = new Store(); let code;
  const mailer = async (_, value) => { code = value; };
  await assert.rejects(requestReset(store, { ...env, RESEND_API_KEY: '' }, { email: env.ADMIN_EMAIL }, mailer), { status: 503 });
  await requestReset(store, env, { email: env.ADMIN_EMAIL }, mailer, 1000000);
  const firstCode = code, input = { email: env.ADMIN_EMAIL, code: 'invalid', newPassword: nextPassword, confirmPassword: nextPassword };
  for (let i = 0; i < 5; i++) await assert.rejects(resetPassword(store, env, input, 1001000), { status: 400 });
  await assert.rejects(resetPassword(store, env, { ...input, code }, 1001000), { status: 400 });
  await requestReset(store, env, { email: env.ADMIN_EMAIL }, mailer, 1061000);
  if (code !== firstCode) await assert.rejects(resetPassword(store, env, { ...input, code: firstCode }, 1062000), { status: 400 });
  await resetPassword(store, env, { ...input, code }, 1063000);
});
test('Resend adapter sends a plain text code to owner and hides provider failures', async () => {
  await sendResetEmail(env, '123456', 'test-id', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails'); const body = JSON.parse(options.body);
    assert.deepEqual(body.to, [env.ADMIN_EMAIL]); assert.match(body.text, /123456/); assert.equal(options.headers['Idempotency-Key'], 'test-id');
    return { ok: true };
  });
  await assert.rejects(sendResetEmail(env, '123456', 'id', async () => ({ ok: false })), { status: 503 });
  await assert.rejects(sendResetEmail(env, '123456', 'id', async () => { throw new Error('secret-token'); }), error => error.status === 503 && !error.message.includes('secret-token'));
});

test('failed delivery clears its cooldown so the next request can send', async () => {
  const store = new Store();
  await assert.rejects(requestReset(store, env, { email: env.ADMIN_EMAIL }, async () => { throw new HttpError(503, 'Mail unavailable'); }, 1000000), { status: 503 });
  assert.equal((await store.readJson('easyora/security/account.json')).value.reset, null);
  let sent = false;
  await requestReset(store, env, { email: env.ADMIN_EMAIL }, async () => { sent = true; }, 1001000);
  assert(sent);
});

test('HTTP forgot-password reset is neutral for unknown emails, rejects replay and throttles requests', async t => {
  const store = new Store(); let code, sends = 0;
  const api = handlers(store, env, async (_, value) => { code = value; sends++; });
  const server = createServer(api.admin); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = data => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: env.SITE_ORIGIN }, body: JSON.stringify(data) });
  const unknown = await call({ action: 'request-reset', email: 'other@example.com' }); assert.equal(unknown.status, 200);
  const owner = await call({ action: 'request-reset', email: env.ADMIN_EMAIL }); assert.equal(owner.status, 200);
  assert.deepEqual(await unknown.json(), await owner.json()); assert.equal(sends, 1);
  const reset = { action: 'reset-password', email: env.ADMIN_EMAIL, code, newPassword: nextPassword, confirmPassword: nextPassword };
  const success = await call(reset); assert.equal(success.status, 200); assert(!JSON.stringify(await success.json()).includes(code));
  assert.equal((await call(reset)).status, 400);
  assert.equal((await call({ action: 'login', email: env.ADMIN_EMAIL, password: nextPassword })).status, 200);
  let result;
  for (let i = 0; i < 10; i++) result = await call({ action: 'request-reset', email: 'other@example.com' });
  assert.equal(result.status, 429);
});
