import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { handlers } from '../lib/handlers.mjs';
import { hashPassword, passwordMatches, createSession, readSession, COOKIE, HttpError } from '../lib/security.mjs';
import { validateSettings, validateWork, initialContent, CATEGORIES, mutateContent } from '../lib/content.mjs';

const PASSWORD = 'a-long-test-password-only';
const env = { BLOB_READ_WRITE_TOKEN: 'test-only-token', ADMIN_EMAIL: 'owner@example.com', ADMIN_PASSWORD_HASH: hashPassword(PASSWORD), SESSION_SECRET: 'test-secret-only-'.repeat(4), SITE_ORIGIN: 'https://easyora.vercel.app' };

class MemoryStore {
  constructor() { this.document = null; this.etag = 0; this.images = new Map(); this.attempts = new Map(); this.backups = []; }
  async readContent() { return this.document ? { value: structuredClone(this.document), etag: String(this.etag) } : null; }
  async writeContent(value, etag) { if ((this.document && etag !== String(this.etag)) || (!this.document && etag)) throw new HttpError(409, 'Conflict'); this.document = structuredClone(value); this.etag++; }
  async backup(value) { this.backups.push(structuredClone(value)); }
  async readRevision(revision) { return structuredClone(this.backups.find(value => value.revision === revision) || null); }
  async imageExists(id) { return this.images.has(id); }
  async saveImage(id, bytes) { this.images.set(id, Buffer.from(bytes)); }
  async readImage(id) { const bytes = this.images.get(id); return bytes ? { stream: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) } : null; }
  async limitLogin(key) { const count = (this.attempts.get(key) || 0) + 1; this.attempts.set(key, count); if (count > 10) throw new HttpError(429, 'Too many sign-in attempts.'); }
}

test('session integrity, expiry, and password-change invalidation', () => {
  assert(passwordMatches(PASSWORD, env.ADMIN_PASSWORD_HASH));
  assert(!passwordMatches('incorrect', env.ADMIN_PASSWORD_HASH));
  const session = createSession(env);
  const request = { headers: { cookie: `${COOKIE}=${session.token}` } };
  assert(readSession(request, env));
  assert.equal(readSession({ headers: { cookie: `${COOKIE}=${session.token}x` } }, env), null);
  assert.equal(readSession(request, env, Date.now() + 9 * 3600_000), null);
  assert.equal(readSession(request, { ...env, ADMIN_PASSWORD_HASH: hashPassword('another-long-test-password') }), null);
});

test('settings reject unsafe links and invalid contact details', () => {
  for (const value of ['javascript:alert(1)', 'https://instagram.com.attacker.test/x', 'https://evil@instagram.com/x', 'http://instagram.com/x']) assert.throws(() => validateSettings({ instagram: value }), { status: 400 });
  assert.throws(() => validateSettings({ email: 'person@example.com\r\nBcc:other@example.com' }), { status: 400 });
  assert.throws(() => validateSettings({ whatsapp: '+91 XXXXX XXXXX' }), { status: 400 });
  assert.throws(() => validateSettings({ logoId: '../private' }), { status: 400 });
  assert.equal(validateSettings({ phone: '+91 98765 43210' }).phone, '+919876543210');
});

test('project validation protects image paths, category, and limits', () => {
  const base = { title: 'Example', category: CATEGORIES[0], images: [{ id: randomUUID(), alt: 'Example' }] };
  assert.throws(() => validateWork({ ...base, title: '  ' }), { status: 400 });
  assert.throws(() => validateWork({ ...base, category: 'Unsupported' }), { status: 400 });
  assert.throws(() => validateWork({ ...base, images: [{ id: '../../config' }] }), { status: 400 });
  assert.throws(() => validateWork({ ...base, images: [] }), { status: 400 });
  assert.throws(() => validateWork({ ...base, order: -1 }), { status: 400 });
  assert.equal(validateWork({ ...base, title: '<script>alert(1)</script>' }).title, '<script>alert(1)</script>', 'Text is preserved for safe textContent rendering, never treated as markup');
});

test('HTTP lifecycle: authentication, upload, draft privacy, publishing, contacts, conflicts, removal', async t => {
  const store = new MemoryStore(), api = handlers(store, env);
  const server = createServer((req, res) => {
    const route = new URL(req.url, 'http://localhost').pathname.split('/').pop();
    (api[route] || ((_, response) => { response.statusCode = 404; response.end(); }))(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cookie = '', csrf = '';
  const request = (route, data, headers = {}) => fetch(origin + '/api/' + route, { method: data ? 'POST' : 'GET', headers: { ...(data ? { 'Content-Type': 'application/json', Origin: env.SITE_ORIGIN } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers }, ...(data ? { body: JSON.stringify(data) } : {}) });
  assert.equal((await (await request('admin')).json()).authenticated, false);
  assert.equal((await request('admin', { action: 'save-settings', settings: {} })).status, 401);
  assert.equal((await request('admin', { action: 'login', email: env.ADMIN_EMAIL, password: PASSWORD }, { Origin: 'https://attacker.test' })).status, 403);
  assert.equal((await request('admin', { action: 'login', email: env.ADMIN_EMAIL, password: 'wrong' })).status, 401);
  const login = await request('admin', { action: 'login', email: env.ADMIN_EMAIL, password: PASSWORD });
  assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
  cookie = login.headers.get('set-cookie').split(';')[0];
  let session = await login.json(); csrf = session.csrfToken; let revision = session.content.revision;
  assert.equal((await request('admin', { action: 'save-settings', revision, settings: {} }, { 'X-CSRF-Token': 'forged' })).status, 403);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
  assert.equal((await request('admin', { action: 'upload', data: svg })).status, 400);
  const png = await sharp({ create: { width: 20, height: 20, channels: 4, background: '#3bb97b' } }).png().toBuffer();
  const upload = await request('admin', { action: 'upload', data: png.toString('base64') });
  assert.equal(upload.status, 200); const image = await upload.json(); assert(image.id); assert.equal((await sharp(store.images.get(image.id)).metadata()).format, 'webp');
  let work = { title: 'A client project', category: CATEGORIES[0], description: 'Short project details.', client: 'Example', published: false, order: 0, images: [{ id: image.id, alt: 'Artwork detail' }] };
  const draft = await request('admin', { action: 'save-work', revision, work }); assert.equal(draft.status, 200);
  let saved = (await draft.json()).content; revision = saved.revision; work = saved.works[0];
  assert.equal((await (await request('content')).json()).works.length, 0);
  assert.equal((await fetch(origin + image.previewUrl)).status, 401);
  assert.equal((await fetch(origin + image.previewUrl, { headers: { Cookie: cookie } })).status, 200);
  const publish = await request('admin', { action: 'save-work', revision, work: { ...work, published: true } }); assert.equal(publish.status, 200);
  saved = (await publish.json()).content; revision = saved.revision;
  const visible = await (await request('content')).json(); assert.equal(visible.works.length, 1); assert.equal(visible.works[0].images[0].alt, 'Artwork detail');
  const publicImage = await fetch(origin + visible.works[0].images[0].url); assert.equal(publicImage.status, 200); assert.match(publicImage.headers.get('content-type'), /image\/webp/);
  assert.equal((await fetch(origin + visible.works[0].images[0].url + 'broken')).status, 401);
  const conflict = await request('admin', { action: 'save-settings', revision: 'invalid-old-revision', settings: {} }); assert.equal(conflict.status, 409);
  const settings = { ...initialContent().settings, email: 'hello@example.com', whatsapp: '+919876543210', instagram: 'https://www.instagram.com/example', logoId: image.id };
  const update = await request('admin', { action: 'save-settings', revision, settings }); assert.equal(update.status, 200);
  saved = (await update.json()).content; revision = saved.revision;
  const publicSettings = (await (await request('content')).json()).settings; assert.equal(publicSettings.email, settings.email); assert(publicSettings.logoUrl.includes('/api/media')); assert.equal(publicSettings.logoId, undefined);
  assert(store.backups.length >= 3);
  const remove = await request('admin', { action: 'delete-work', revision, id: work.id }); assert.equal(remove.status, 200);
  assert.equal((await (await request('content')).json()).works.length, 0);
  const secondHandler = handlers(store, env); assert(secondHandler); assert.equal((await store.readContent()).value.settings.email, settings.email, 'State survives handler recreation');
  const logout = await request('admin', { action: 'logout' }); assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});

test('missing production configuration fails closed', async () => {
  const api = handlers(new MemoryStore(), {});
  let status, body;
  const response = { setHeader() {}, set statusCode(value) { status = value; }, end(value) { body = JSON.parse(value); } };
  await api.admin({ method: 'GET', headers: {} }, response); assert.equal(status, 200); assert.equal(body.configured, false); assert.equal(body.authenticated, false);
  await api.admin({ method: 'POST', headers: { origin: 'https://easyora.vercel.app' } }, response); assert.equal(status, 503);
});

test('stale logo and contact saves merge independent edits using archived revisions', async () => {
  const store = new MemoryStore(), firstLogo = randomUUID(), secondLogo = randomUUID();
  store.images.set(firstLogo, Buffer.from('image')); store.images.set(secondLogo, Buffer.from('image'));
  const original = await mutateContent(store, { action: 'save-settings', revision: 'initial', settings: { ...initialContent().settings, email: 'hello@example.com', logoId: firstLogo } });
  const otherTab = await mutateContent(store, { action: 'save-settings', revision: original.revision, settings: { ...original.settings, phone: '+919876543210' } });
  const result = await mutateContent(store, { action: 'save-settings', revision: original.revision, settings: { ...original.settings, logoId: secondLogo } });
  assert.equal(result.settings.phone, otherTab.settings.phone); assert.equal(result.settings.logoId, secondLogo);
  const work = await mutateContent(store, { action: 'save-work', revision: result.revision, work: { title: 'New project', category: CATEGORIES[0], images: [{ id: firstLogo, alt: 'Cover' }] } });
  const settings = await mutateContent(store, { action: 'save-settings', revision: result.revision, settings: { ...result.settings, location: 'Madurai' } });
  assert.equal(settings.works[0].id, work.works[0].id); assert.equal(settings.settings.location, 'Madurai');
  const latest = await mutateContent(store, { action: 'save-settings', revision: settings.revision, settings: { ...settings.settings, logoId: firstLogo } });
  await assert.rejects(mutateContent(store, { action: 'save-settings', revision: settings.revision, settings: { ...settings.settings, logoId: null } }), error => error.status === 409 && error.conflicts.includes('logoId'));
  assert.equal((await store.readContent()).value.settings.logoId, latest.settings.logoId);
});

test('conditional-write races retry and retain concurrent unrelated changes', async () => {
  const store = new MemoryStore(), image = randomUUID(); store.images.set(image, Buffer.from('image'));
  const original = await mutateContent(store, { action: 'save-settings', revision: 'initial', settings: initialContent().settings });
  const write = store.writeContent.bind(store); let raced = false;
  store.writeContent = async (value, etag) => {
    if (!raced) { raced = true; store.document.settings.phone = '+919876543210'; store.document.revision = randomUUID(); store.etag++; throw new HttpError(409, 'Conflict'); }
    return write(value, etag);
  };
  const result = await mutateContent(store, { action: 'save-settings', revision: original.revision, settings: { ...original.settings, logoId: image } });
  assert.equal(result.settings.logoId, image); assert.equal(result.settings.phone, '+919876543210');
});
