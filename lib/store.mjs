import { get, put, head, BlobNotFoundError, BlobPreconditionFailedError } from '@vercel/blob';
import { HttpError } from './security.mjs';
const CONTENT = 'easyora/content.json';

// Blob downloads can add the HTTP weak-validator prefix; conditional writes
// require the storage ETag (the same quoted version returned by head()).
export function storageETag(etag) {
  return etag?.replace(/^W\//, '');
}

export class BlobStore {
  async readJson(path = CONTENT) {
    try {
      const result = await get(path, { access: 'private', useCache: false });
      if (!result) return null;
      const text = await new Response(result.stream).text();
      if (text.length > 600_000) throw new Error('Content document exceeds limit');
      return { value: JSON.parse(text), etag: storageETag(result.blob.etag) };
    } catch (error) { if (error instanceof BlobNotFoundError) return null; throw error; }
  }
  async writeJson(path, value, etag) {
    try {
      return await put(path, JSON.stringify(value), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: Boolean(etag), ...(etag ? { ifMatch: etag } : {}), cacheControlMaxAge: 60 });
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError || /already exists/i.test(error.message)) throw new HttpError(409, 'Another update was saved first. Reload the latest content before saving.');
      throw error;
    }
  }
  async readContent() { return this.readJson(CONTENT); }
  async readRevision(revision) { return (await this.readJson(`easyora/backups/${revision}.json`))?.value || null; }
  async writeContent(value, etag) { return this.writeJson(CONTENT, value, etag); }
  async backup(value) {
    if (value.revision !== 'initial') await this.writeJson(`easyora/backups/${value.revision}.json`, value).catch(error => { if (error.status !== 409) throw error; });
  }
  async saveImage(id, image) { await put(`easyora/media/${id}.webp`, image, { access: 'private', contentType: 'image/webp', addRandomSuffix: false, cacheControlMaxAge: 31536000 }); }
  async imageExists(id) {
    try { await head(`easyora/media/${id}.webp`); return true; }
    catch (error) { if (error instanceof BlobNotFoundError) return false; throw error; }
  }
  async readImage(id) {
    try { return await get(`easyora/media/${id}.webp`, { access: 'private' }); }
    catch (error) { if (error instanceof BlobNotFoundError) return null; throw error; }
  }
  async limitLogin(key, now = Date.now()) {
    const window = Math.floor(now / 600_000);
    const path = `easyora/security/login-${key}.json`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await this.readJson(path);
      const count = current?.value.window === window ? current.value.count : 0;
      if (count >= 10) throw new HttpError(429, 'Too many sign-in attempts. Try again in 10 minutes.');
      try { await this.writeJson(path, { window, count: count + 1 }, current?.etag); return; }
      catch (error) { if (error.status !== 409) throw error; }
    }
    throw new HttpError(429, 'Please wait before trying to sign in again.');
  }
}
