import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { initialContent, CATEGORIES } from '../lib/content.mjs';

async function settle() { for (let i = 0; i < 8; i++) await new Promise(resolve => setTimeout(resolve, 0)); }

test('password change and email-code recovery forms validate and clear secrets after success', async t => {
  const dom = new JSDOM(await readFile('dist/admin.html', 'utf8'), { url: 'https://easyora.vercel.app/admin', runScripts: 'outside-only' }); t.after(() => dom.window.close());
  const w = dom.window, d = w.document; w.structuredClone = structuredClone;
  const calls = [];
  w.fetch = async (_, options) => {
    const data = options.body ? JSON.parse(options.body) : null; calls.push(data);
    return { ok: true, json: async () => !data ? { configured: true, recoveryAvailable: true, authenticated: true, csrfToken: 'csrf', content: initialContent() } : { ok: true, message: 'If this is the admin email, a code will arrive shortly.' } };
  };
  w.eval(await readFile('dist/assets/admin.js', 'utf8')); await settle();
  d.querySelector('[data-tab=security]').click(); assert.equal(d.getElementById('security-panel').hidden, false); assert.equal(d.getElementById('settings-panel').hidden, true);
  const password = d.getElementById('password-form');
  const submit = form => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  password.elements.currentPassword.value = 'original-long-password'; password.elements.newPassword.value = 'new-password-for-test'; password.elements.confirmPassword.value = 'different-password-test';
  submit(password); await settle(); assert(!calls.some(x => x?.action === 'change-password')); assert.match(d.getElementById('admin-status').textContent, /do not match/);
  password.elements.confirmPassword.value = 'new-password-for-test'; submit(password); await settle();
  assert(calls.some(x => x?.action === 'change-password')); assert.equal(d.getElementById('dashboard').hidden, true); assert.equal(password.elements.currentPassword.value, '');
  d.getElementById('forgot-password').click(); assert.equal(d.getElementById('recovery-panel').hidden, false);
  const request = d.getElementById('request-reset-form'); request.elements.email.value = 'owner@example.com'; submit(request); await settle();
  assert.equal(d.getElementById('reset-password-form').hidden, false); assert(calls.some(x => x?.action === 'request-reset' && x.email === 'owner@example.com'));
  const reset = d.getElementById('reset-password-form'); reset.elements.code.value = '123456'; reset.elements.newPassword.value = 'another-long-password'; reset.elements.confirmPassword.value = 'another-long-password'; submit(reset); await settle();
  assert(calls.some(x => x?.action === 'reset-password' && x.code === '123456' && x.email === 'owner@example.com'));
  assert.equal(reset.elements.code.value, ''); assert.equal(reset.elements.newPassword.value, ''); assert.equal(d.getElementById('login-form').hidden, false);
});

test('forgot password explains unavailable email setup without pretending to send a code', async t => {
  const dom = new JSDOM(await readFile('dist/admin.html', 'utf8'), { url: 'https://easyora.vercel.app/admin', runScripts: 'outside-only' }); t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  w.fetch = async () => ({ ok: true, json: async () => ({ configured: true, authenticated: false, recoveryAvailable: false }) });
  w.eval(await readFile('dist/assets/admin.js', 'utf8')); await settle(); d.getElementById('forgot-password').click();
  assert.equal(d.getElementById('recovery-unavailable').hidden, false); assert.equal(d.getElementById('send-reset').disabled, true);
  d.getElementById('back-to-login').click(); assert.equal(d.getElementById('login-form').hidden, false);
});

test('admin interface edits and saves a draft, restores list, and keeps unsaved settings after reauthentication', async t => {
  const html = await readFile('dist/admin.html', 'utf8');
  const dom = new JSDOM(html, { url: 'https://easyora.vercel.app/admin', runScripts: 'outside-only' }); t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  w.structuredClone = structuredClone; w.confirm = () => true; w.HTMLElement.prototype.scrollIntoView = function () {};
  let content = initialContent();
  const imageId = randomUUID();
  content.works.push({ id: randomUUID(), title: 'Brand project', category: CATEGORIES[0], description: 'Original details', client: '', published: true, order: 0, images: [{ id: imageId, alt: 'Cover' }], createdAt: new Date().toISOString() });
  let expireNextSave = false;
  const calls = [];
  w.fetch = async (url, options) => {
    const data = options.body ? JSON.parse(options.body) : null; calls.push(data);
    if (!data) return { ok: true, json: async () => ({ configured: true, authenticated: true, csrfToken: 'csrf-fixture', content: structuredClone(content) }) };
    if (data.action === 'login') return { ok: true, json: async () => ({ csrfToken: 'new-csrf-fixture', content: structuredClone(content) }) };
    if (data.action === 'save-settings' && expireNextSave) { expireNextSave = false; return { ok: false, status: 401, json: async () => ({ error: 'Please sign in again.' }) }; }
    if (data.action === 'save-work') { content.works = [structuredClone(data.work)]; content.revision = randomUUID(); return { ok: true, json: async () => ({ content: structuredClone(content) }) }; }
    if (data.action === 'save-settings') { content.settings = structuredClone(data.settings); content.revision = randomUUID(); return { ok: true, json: async () => ({ content: structuredClone(content) }) }; }
    throw new Error('Unexpected action');
  };
  w.eval(await readFile('dist/assets/admin.js', 'utf8')); await settle();
  assert.equal(d.getElementById('dashboard').hidden, false);
  assert.equal(d.querySelectorAll('.admin-project').length, 1);
  [...d.querySelectorAll('.project-actions button')].find(b => b.textContent === 'Edit').click();
  assert.equal(d.getElementById('editor-panel').hidden, false); assert.equal(d.getElementById('work-list').hidden, true);
  const workForm = d.getElementById('work-form'); workForm.elements.namedItem('title').value = 'Updated project';
  workForm.elements.namedItem('title').dispatchEvent(new w.Event('input', { bubbles: true }));
  d.getElementById('save-draft').click(); await settle();
  assert.equal(content.works[0].title, 'Updated project'); assert.equal(content.works[0].published, false);
  assert.equal(d.getElementById('editor-panel').hidden, true); assert.equal(d.getElementById('work-list').hidden, false);
  d.querySelector('[data-tab=settings]').click();
  const settings = d.getElementById('settings-form'); settings.elements.namedItem('email').value = 'new@example.com'; settings.dispatchEvent(new w.Event('input', { bubbles: true }));
  expireNextSave = true; settings.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.equal(d.getElementById('login-panel').hidden, false); assert.equal(d.getElementById('dashboard').hidden, true);
  const login = d.getElementById('login-form'); login.elements.namedItem('email').value = 'owner@example.com'; login.elements.namedItem('password').value = 'test-password'; login.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await settle();
  assert.equal(d.getElementById('dashboard').hidden, false); assert.equal(settings.elements.namedItem('email').value, 'new@example.com');
  settings.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await settle(); assert.equal(content.settings.email, 'new@example.com');
  assert(calls.some(call => call?.action === 'save-work' && call.work.images[0].id === imageId));
});

test('public portfolio uses text nodes, hides draft-only content, applies contacts/logo, and opens an accessible gallery', async t => {
  const dom = new JSDOM(await readFile('dist/work.html', 'utf8'), { url: 'https://easyora.vercel.app/work.html', runScripts: 'outside-only' }); t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  const unsafeTitle = '<img src=x onerror=alert(1)>';
  w.fetch = async () => ({ ok: true, json: async () => ({ settings: { email: 'hello@example.com', phone: '+919876543210', whatsapp: '+919876543210', location: 'India', instagram: 'https://www.instagram.com/example', logoUrl: '/api/media?id=logo&sig=test' }, works: [{ id: randomUUID(), title: unsafeTitle, category: CATEGORIES[0], description: '<script>alert(1)</script>', client: 'A real client', images: [{ url: '/api/media?id=image&sig=test', alt: 'Project cover' }, { url: '/api/media?id=second&sig=test', alt: 'Second image' }] }] }) });
  w.eval(await readFile('dist/assets/site.js', 'utf8')); await settle();
  assert.equal(d.querySelectorAll('.published-work').length, 1);
  assert.equal(d.querySelector('.published-work h3').textContent, unsafeTitle);
  assert.equal(d.querySelector('.published-work h3 img'), null);
  assert.equal(d.querySelector('.brand img').getAttribute('src'), '/api/media?id=logo&sig=test');
  assert(d.getElementById('footer-contact-links').querySelector('a[href^="mailto:"]'));
  assert(!d.getElementById('footer-contact-links').textContent.includes('Sample contact details'));
  d.querySelector('.work-image-button').click();
  const dialog = d.querySelector('dialog'); assert(dialog.hasAttribute('open')); assert.equal(dialog.querySelector('h2').textContent, unsafeTitle); assert.equal(dialog.querySelector('.viewer-description script'), null);
  const next = [...dialog.querySelectorAll('button')].find(b => b.textContent.includes('Next')); next.click(); assert.equal(dialog.querySelector('.viewer-image').alt, 'Second image');
  dialog.querySelector('.viewer-close').click(); assert(!dialog.hasAttribute('open')); assert(!d.documentElement.classList.contains('gallery-open'));
});

test('settings conflict keeps the selected logo and resolves only edited fields after explicit confirmation', async t => {
  const dom = new JSDOM(await readFile('dist/admin.html', 'utf8'), { url: 'https://easyora.vercel.app/admin', runScripts: 'outside-only' }); t.after(() => dom.window.close());
  const w = dom.window, d = w.document; w.structuredClone = structuredClone; w.confirm = () => true;
  const base = initialContent(); base.revision = randomUUID(); base.settings.email = 'old@example.com'; base.settings.logoId = randomUUID();
  const latest = structuredClone(base); latest.revision = randomUUID(); latest.settings.phone = '+919876543210'; latest.settings.logoId = randomUUID();
  let reads = 0, saves = 0, saved;
  w.fetch = async (_, options) => {
    if (!options.body) return { ok: true, json: async () => ({ configured: true, authenticated: true, csrfToken: 'csrf', content: structuredClone(reads++ ? latest : base) }) };
    const input = JSON.parse(options.body);
    assert.equal(input.action, 'save-settings');
    if (++saves === 1) return { ok: false, status: 409, json: async () => ({ error: 'The logo changed in another session.', conflicts: ['logoId'] }) };
    saved = input;
    return { ok: true, json: async () => ({ content: { ...latest, settings: input.settings, revision: randomUUID() } }) };
  };
  w.eval(await readFile('dist/assets/admin.js', 'utf8')); await settle();
  d.querySelector('[data-tab=settings]').click();
  d.getElementById('reset-logo').click();
  const form = d.getElementById('settings-form'); form.elements.namedItem('email').value = 'my-edit@example.com'; form.dispatchEvent(new w.Event('input', { bubbles: true }));
  form.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); await settle();
  assert.equal(form.elements.namedItem('email').value, 'my-edit@example.com'); assert.equal(d.getElementById('logo-preview').getAttribute('src'), '/assets/easyora-logo.webp');
  [...d.querySelectorAll('.conflict-actions button')].find(button => button.textContent === 'Save my edited fields').click(); await settle();
  assert.equal(saved.revision, latest.revision); assert.equal(saved.settings.logoId, null); assert.equal(saved.settings.email, 'my-edit@example.com'); assert.equal(saved.settings.phone, latest.settings.phone);
  assert.equal(form.elements.namedItem('phone').value, latest.settings.phone);
});
