import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { BlobStore } from './store.mjs';
import { initialContent, mutateContent, publicContent, UUID } from './content.mjs';
import { HttpError, COOKIE, missingConfiguration, checkOrigin, checkCsrf, requireSession, readSession, createSession, passwordMatches, requestBody, loginKey, json, handleError, isMediaSignature } from './security.mjs';

export function handlers(store = new BlobStore(), env = process.env) {
  async function admin(req, res) {
    try {
      const missing = missingConfiguration(env);
      if (req.method === 'GET') {
        const session = readSession(req, env);
        return json(res, 200, { configured: missing.length === 0, authenticated: Boolean(session), ...(session ? { csrfToken: session.csrf, content: (await store.readContent())?.value || initialContent() } : {}) });
      }
      if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
      checkOrigin(req, env);
      if (missing.length) throw new HttpError(503, 'Admin setup is not complete. Connect private Vercel Blob storage and configure the admin credentials.');
      const input = await requestBody(req);
      if (input.action === 'login') {
        if (typeof input.email !== 'string' || input.email.length > 200) throw new HttpError(400, 'Enter your admin email.');
        await store.limitLogin(loginKey(req, env));
        const passwordOk = passwordMatches(input.password, env.ADMIN_PASSWORD_HASH);
        if (!passwordOk || input.email.trim().toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) throw new HttpError(401, 'Email or password is incorrect.');
        const session = createSession(env);
        res.setHeader('Set-Cookie', `${COOKIE}=${session.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
        return json(res, 200, { csrfToken: session.claims.csrf, content: (await store.readContent())?.value || initialContent() });
      }
      const session = requireSession(req, env);
      checkCsrf(req, session);
      if (input.action === 'logout') {
        res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
        return json(res, 200, { ok: true });
      }
      if (input.action === 'upload') {
        if (typeof input.data !== 'string' || input.data.length > 2_800_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)) throw new HttpError(400, 'Choose an image smaller than 2 MB after optimization.');
        const bytes = Buffer.from(input.data, 'base64');
        if (bytes.length < 12 || bytes.length > 2_000_000) throw new HttpError(400, 'Choose a valid image smaller than 2 MB.');
        const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
        if (!png && !jpeg && !webp) throw new HttpError(400, 'Upload a valid JPG, PNG, or WebP image.');
        let optimized;
        try {
          const image = sharp(bytes, { limitInputPixels: 25_000_000, animated: false });
          const metadata = await image.metadata();
          if (!['jpeg', 'png', 'webp'].includes(metadata.format) || metadata.pages > 1) throw new Error('Unsupported image');
          optimized = await image.rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
        } catch { throw new HttpError(400, 'Upload a valid JPG, PNG, or WebP image. SVG and animated files are not supported.'); }
        if (optimized.length > 2_000_000) throw new HttpError(400, 'This image is too large. Try a smaller image.');
        const id = randomUUID();
        await store.saveImage(id, optimized);
        return json(res, 200, { id, previewUrl: `/api/media?id=${id}`, bytes: optimized.length });
      }
      const content = await mutateContent(store, input);
      return json(res, 200, { content });
    } catch (error) { handleError(res, error); }
  }
  async function content(req, res) {
    try {
      if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
      if (missingConfiguration(env).length) return json(res, 200, publicContent(initialContent(), env));
      json(res, 200, publicContent((await store.readContent())?.value || initialContent(), env));
    } catch (error) { handleError(res, error); }
  }
  async function media(req, res) {
    try {
      if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
      const url = new URL(req.url, 'https://easyora.vercel.app');
      const id = url.searchParams.get('id');
      if (!UUID.test(id || '')) throw new HttpError(404, 'Image not found.');
      if (missingConfiguration(env).length) throw new HttpError(503, 'Media storage is not configured.');
      const signed = isMediaSignature(id, url.searchParams.get('sig'), env);
      if (!signed) requireSession(req, env);
      const result = await store.readImage(id);
      if (!result) throw new HttpError(404, 'Image not found.');
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', signed ? 'public, max-age=86400, immutable' : 'private, no-store');
      res.statusCode = 200;
      for await (const chunk of result.stream) res.write(chunk);
      res.end();
    } catch (error) { handleError(res, error); }
  }
  return { admin, content, media };
}
