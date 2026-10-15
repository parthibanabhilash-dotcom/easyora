import { createHmac, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const COOKIE = '__Host-easyora_admin';
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 16 || password.length > 256) throw new Error('Use a password between 16 and 256 characters.');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, encoded) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [algorithm, salt, hash] = String(encoded).split(':');
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) return false;
  return safeEqual(scryptSync(password, salt, 64).toString('hex'), hash);
}
export function missingConfiguration(env = process.env) {
  return ['BLOB_READ_WRITE_TOKEN', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'SESSION_SECRET'].filter(key => !env[key] || (key === 'SESSION_SECRET' && env[key].length < 32));
}
function sign(value, env) { return createHmac('sha256', env.SESSION_SECRET).update(value).digest('base64url'); }
function passwordVersion(env) { return createHash('sha256').update(env.ADMIN_PASSWORD_HASH).digest('hex').slice(0, 16); }
export function createSession(env = process.env, now = Date.now()) {
  const claims = { exp: Math.floor(now / 1000) + 8 * 3600, csrf: randomBytes(24).toString('base64url'), v: passwordVersion(env) };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return { token: `${body}.${sign(body, env)}`, claims };
}
export function readSession(req, env = process.env, now = Date.now()) {
  if (missingConfiguration(env).length) return null;
  const token = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!token || token.length > 1200) return null;
  try {
    const [body, signature, extra] = token.split('.');
    if (extra || !signature || !safeEqual(sign(body, env), signature)) return null;
    const claims = JSON.parse(Buffer.from(body, 'base64url'));
    if (!Number.isInteger(claims.exp) || claims.exp <= Math.floor(now / 1000) || claims.exp > Math.floor(now / 1000) + 8 * 3600 + 30 || claims.v !== passwordVersion(env) || !/^[\w-]{32}$/.test(claims.csrf)) return null;
    return claims;
  } catch { return null; }
}
export function requireSession(req, env = process.env) {
  const session = readSession(req, env);
  if (!session) throw new HttpError(401, 'Please sign in again.');
  return session;
}
export function checkOrigin(req, env = process.env) {
  const origin = req.headers.origin;
  const expected = env.SITE_ORIGIN || 'https://easyora.vercel.app';
  const allowed = new Set([expected]);
  if (env.VERCEL_URL) allowed.add('https://' + env.VERCEL_URL);
  if (env.NODE_ENV === 'test') allowed.add('http://localhost:4173');
  if (!origin || !allowed.has(origin)) throw new HttpError(403, 'Request origin is not allowed.');
}
export function checkCsrf(req, session) {
  if (!safeEqual(req.headers['x-csrf-token'] || '', session.csrf)) throw new HttpError(403, 'Your session changed. Refresh and try again.');
}
export function mediaSignature(id, env = process.env) { return sign('public-media:' + id, env); }
export function isMediaSignature(id, signature, env = process.env) { return Boolean(env.SESSION_SECRET) && safeEqual(signature || '', mediaSignature(id, env)); }
export function mediaUrl(id, env = process.env) { return `/api/media?id=${encodeURIComponent(id)}&sig=${mediaSignature(id, env)}`; }
export function loginKey(req, env = process.env) {
  const ip = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  return sign('login:' + String(ip).split(',')[0].trim(), env).slice(0, 40);
}
export async function requestBody(req, maximum = 3_000_000) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Send JSON content.');
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > maximum) throw new HttpError(413, 'This request is too large.');
    return req.body;
  }
  let chunks = [], size = 0;
  if (req.body) chunks = [Buffer.from(req.body)];
  else for await (const chunk of req) {
    size += chunk.length;
    if (size > maximum) throw new HttpError(413, 'This request is too large.');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  if (raw.length > maximum) throw new HttpError(413, 'This request is too large.');
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid JSON.'); }
}
export function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}
export function handleError(res, error) {
  if (res.headersSent) { res.destroy(); return; }
  if (!error.status) console.error('EasyOra CMS:', error.name);
  json(res, error.status || 503, { error: error.status ? error.message : 'The service is temporarily unavailable. Your changes were not saved. Please try again.', ...(error.conflicts ? { conflicts: error.conflicts, entity: error.entity } : {}) });
}
