import { randomUUID } from 'node:crypto';
import { HttpError, mediaUrl } from './security.mjs';
export const CATEGORIES = ['Graphic Design & Creative Services', 'Video Editing & Production', 'Digital Marketing', 'Website Development', 'Branding & Visual Identity'];
export const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export function initialContent() { return { schema: 1, revision: 'initial', settings: { email: '', phone: '', whatsapp: '', location: '', instagram: '', facebook: '', youtube: '', linkedin: '', logoId: null }, works: [] }; }
function text(value, maximum, name, required = false) {
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be text.`);
  const clean = value.trim();
  if (clean.length > maximum || (required && !clean)) throw new HttpError(400, `${name} ${required && !clean ? 'is required' : 'is too long'}.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(clean)) throw new HttpError(400, `${name} contains unsupported characters.`);
  return clean;
}
export function validateSettings(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Settings are required.');
  const result = {};
  result.email = text(input.email || '', 200, 'Email');
  if (result.email && !/^[^\s@<>"\r\n]+@[^\s@<>"\r\n]+\.[^\s@<>"\r\n]+$/.test(result.email)) throw new HttpError(400, 'Enter a valid email address.');
  for (const key of ['phone', 'whatsapp']) {
    result[key] = text(input[key] || '', 30, key).replace(/[\s()-]/g, '');
    if (result[key] && !/^\+?[1-9]\d{6,14}$/.test(result[key])) throw new HttpError(400, `Enter ${key} with country code, for example +919876543210.`);
  }
  result.location = text(input.location || '', 200, 'Location');
  for (const key of ['instagram', 'facebook', 'youtube', 'linkedin']) {
    const value = text(input[key] || '', 300, key);
    result[key] = '';
    if (value) {
      let url;
      try { url = new URL(value); } catch { throw new HttpError(400, `Enter a full HTTPS ${key} URL.`); }
      const hosts = { instagram: ['instagram.com', 'www.instagram.com'], facebook: ['facebook.com', 'www.facebook.com'], youtube: ['youtube.com', 'www.youtube.com', 'youtu.be'], linkedin: ['linkedin.com', 'www.linkedin.com'] };
      if (url.protocol !== 'https:' || url.username || url.password || !hosts[key].includes(url.hostname) || url.port) throw new HttpError(400, `Enter a valid HTTPS ${key} profile URL.`);
      result[key] = url.href;
    }
  }
  result.logoId = input.logoId || null;
  if (result.logoId && !UUID.test(result.logoId)) throw new HttpError(400, 'Upload a valid logo image.');
  return result;
}
export function validateWork(input, existing) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Project details are required.');
  const id = input.id || randomUUID();
  if (!UUID.test(id)) throw new HttpError(400, 'Invalid project ID.');
  const result = { id, title: text(input.title, 100, 'Project title', true), category: input.category, description: text(input.description || '', 600, 'Project details'), client: text(input.client || '', 100, 'Client name'), published: input.published === true, order: Number.isInteger(input.order) ? input.order : 0, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (!CATEGORIES.includes(result.category)) throw new HttpError(400, 'Choose a valid service category.');
  if (result.order < 0 || result.order > 1000) throw new HttpError(400, 'Display order must be between 0 and 1000.');
  if (!Array.isArray(input.images) || input.images.length < 1 || input.images.length > 8) throw new HttpError(400, 'Add between 1 and 8 project images.');
  result.images = input.images.map(image => {
    if (!image || !UUID.test(image.id)) throw new HttpError(400, 'Upload a valid project image.');
    return { id: image.id, alt: text(image.alt || result.title, 180, 'Image description', true) };
  });
  if (new Set(result.images.map(image => image.id)).size !== result.images.length) throw new HttpError(400, 'Remove duplicate images.');
  return result;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function conflict(fields, entity) {
  const labels = { logoId: 'logo', email: 'email', phone: 'phone', whatsapp: 'WhatsApp', location: 'address', images: 'project images' };
  const error = new HttpError(409, `The ${fields.map(field => labels[field] || field).join(', ')} changed in another session. Your unsaved edits are still here.`);
  error.conflicts = fields; error.entity = entity; return error;
}
function mergeFields(base, current, desired, fields, entity) {
  const result = { ...current }, conflicts = [];
  for (const field of fields) {
    if (same(desired[field], base[field])) continue;
    if (!same(current[field], base[field]) && !same(current[field], desired[field])) conflicts.push(field);
    else result[field] = desired[field];
  }
  if (conflicts.length) throw conflict(conflicts, entity);
  return result;
}
export async function mutateContent(store, input) {
  let snapshot = await store.readContent();
  const starting = snapshot?.value || initialContent();
  let base = starting.revision === input.revision ? starting : input.revision === 'initial' ? initialContent() : UUID.test(input.revision || '') ? await store.readRevision(input.revision) : null;
  if (!base) throw new HttpError(409, 'The saved version could not be found. Your edits are still here; load the latest details before saving.');
  const desiredSettings = input.action === 'save-settings' ? validateSettings(input.settings) : null;
  const baseWork = base.works.find(work => work.id === input.work?.id || work.id === input.id);
  const desiredWork = input.action === 'save-work' ? validateWork(input.work, baseWork) : null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = snapshot?.value || initialContent(), next = structuredClone(current);
    if (input.action === 'save-settings') {
      next.settings = mergeFields(base.settings, current.settings, desiredSettings, Object.keys(desiredSettings), 'settings');
      if (next.settings.logoId && !await store.imageExists(next.settings.logoId)) throw new HttpError(400, 'The logo upload was not found. Please upload it again.');
    } else if (input.action === 'save-work') {
      const currentWork = current.works.find(work => work.id === desiredWork.id);
      if (Boolean(baseWork) !== Boolean(currentWork)) throw conflict(['project'], 'work');
      let work = desiredWork;
      if (baseWork) work = { ...mergeFields(baseWork, currentWork, desiredWork, ['title', 'category', 'description', 'client', 'published', 'order', 'images'], 'work'), updatedAt: desiredWork.updatedAt };
      if (!currentWork && next.works.length >= 150) throw new HttpError(400, 'The portfolio supports up to 150 projects.');
      if (!(await Promise.all(work.images.map(image => store.imageExists(image.id)))).every(Boolean)) throw new HttpError(400, 'An image upload was not found. Upload it again.');
      next.works = [...next.works.filter(item => item.id !== work.id), work];
    } else if (input.action === 'delete-work') {
      const work = current.works.find(work => work.id === input.id);
      if (!UUID.test(input.id || '') || !work) throw new HttpError(404, 'Project not found.');
      if (!baseWork || !same(baseWork, work)) throw conflict(['project'], 'work');
      next.works = next.works.filter(work => work.id !== input.id);
    } else throw new HttpError(400, 'Unknown action.');
    next.revision = randomUUID(); next.updatedAt = new Date().toISOString();
    await store.backup(current);
    try { await store.writeContent(next, snapshot?.etag); return next; }
    catch (error) { if (error.status !== 409 || attempt === 2) throw error; snapshot = await store.readContent(); }
  }
}
export function publicContent(content, env) {
  const settings = { ...content.settings };
  settings.logoUrl = settings.logoId ? mediaUrl(settings.logoId, env) : null;
  delete settings.logoId;
  return { settings, works: content.works.filter(work => work.published).sort((a, b) => a.order - b.order || b.createdAt.localeCompare(a.createdAt)).map(work => ({ id: work.id, title: work.title, category: work.category, description: work.description, client: work.client, images: work.images.map(image => ({ alt: image.alt, url: mediaUrl(image.id, env) })) })) };
}
