import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpError, hashPassword, passwordMatches } from './security.mjs';

const PATH = 'easyora/security/account.json';
export const resetConfigured = env => Boolean(env.RESEND_API_KEY && env.RESET_EMAIL_FROM);
export async function accountSnapshot(store, env) {
  const snapshot = await store.readJson(PATH);
  return snapshot || { value: { passwordHash: env.ADMIN_PASSWORD_HASH, reset: null }, etag: undefined };
}
export async function accountEnvironment(store, env) {
  const snapshot = await accountSnapshot(store, env);
  return { ...env, ADMIN_PASSWORD_HASH: snapshot.value.passwordHash };
}
const codeHash = (code, id, env) => createHmac('sha256', env.SESSION_SECRET).update(`reset:${id}:${code}`).digest('hex');
const sameHash = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function newPassword(input, previousHash) {
  if (typeof input.newPassword !== 'string' || input.newPassword.length < 16 || input.newPassword.length > 256) throw new HttpError(400, 'Use a password between 16 and 256 characters. A phrase with several words works well.');
  if (input.newPassword !== input.confirmPassword) throw new HttpError(400, 'The new passwords do not match.');
  if (passwordMatches(input.newPassword, previousHash)) throw new HttpError(400, 'Choose a different password from your current one.');
  return hashPassword(input.newPassword);
}
async function writeAccount(store, snapshot, value) {
  try { await store.writeJson(PATH, value, snapshot.etag); }
  catch (error) { if (error.status === 409) throw new HttpError(409, 'Your account changed in another request. Please try again.'); throw error; }
}
export async function changePassword(store, env, input) {
  const snapshot = await accountSnapshot(store, env);
  // Validate against the credential that authenticated this request, too.
  if (snapshot.value.passwordHash !== env.ADMIN_PASSWORD_HASH) throw new HttpError(401, 'Please sign in again.');
  if (!passwordMatches(input.currentPassword, snapshot.value.passwordHash)) throw new HttpError(400, 'Your current password is incorrect.');
  const passwordHash = newPassword(input, snapshot.value.passwordHash);
  await writeAccount(store, snapshot, { passwordHash, reset: null });
}
export async function sendResetEmail(env, code, id, fetcher = fetch) {
  let response;
  try {
    response = await fetcher('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': id },
      body: JSON.stringify({ from: env.RESET_EMAIL_FROM, to: [env.ADMIN_EMAIL], subject: 'Your EasyOra password reset code', text: `Your EasyOra admin reset code is: ${code}\n\nIt expires in 10 minutes and can be used once. Do not share this code.\n\nIf you did not request a reset, ignore this email. Your password has not changed.` })
    });
  } catch { throw new HttpError(503, 'The reset email could not be sent. Please try again shortly.'); }
  if (!response.ok) throw new HttpError(503, 'The reset email could not be sent. Please try again shortly.');
}
export async function requestReset(store, env, input, mailer = sendResetEmail, now = Date.now()) {
  if (!resetConfigured(env)) throw new HttpError(503, 'Email recovery is not configured yet. Contact the website owner.');
  if (typeof input.email !== 'string' || input.email.length > 200) throw new HttpError(400, 'Enter your admin email.');
  if (input.email.trim().toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) return;
  const snapshot = await accountSnapshot(store, env);
  if (snapshot.value.reset?.requestedAt > now - 60000) return;
  const code = String(randomInt(0, 1000000)).padStart(6, '0'), id = randomUUID();
  const reset = { id, hash: codeHash(code, id, env), requestedAt: now, expiresAt: now + 600000, attempts: 0 };
  await writeAccount(store, snapshot, { ...snapshot.value, reset });
  try { await mailer(env, code, id); }
  catch (error) {
    // A failed send must not leave a cooldown that pretends a code was sent.
    const latest = await accountSnapshot(store, env);
    if (latest.value.reset?.id === id) {
      await writeAccount(store, latest, { ...latest.value, reset: null }).catch(() => {});
    }
    throw error;
  }
}
export async function resetPassword(store, env, input, now = Date.now()) {
  const snapshot = await accountSnapshot(store, env), challenge = snapshot.value.reset;
  const error = () => new HttpError(400, 'The code is invalid or expired. Request a new code and try again.');
  if (typeof input.email !== 'string' || input.email.trim().toLowerCase() !== env.ADMIN_EMAIL.toLowerCase() || !challenge || challenge.expiresAt <= now || challenge.attempts >= 5) throw error();
  // Count every attempt in durable storage. Simultaneous attempts cannot both win.
  if (typeof input.code !== 'string' || !/^\d{6}$/.test(input.code) || !sameHash(challenge.hash, codeHash(input.code, challenge.id, env))) {
    await writeAccount(store, snapshot, { ...snapshot.value, reset: { ...challenge, attempts: challenge.attempts + 1 } });
    throw error();
  }
  const passwordHash = newPassword(input, snapshot.value.passwordHash);
  await writeAccount(store, snapshot, { passwordHash, reset: null });
}
