// Run locally once after linking the existing Vercel project. Secrets travel on stdin.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
import { hashPassword } from '../lib/security.mjs';
const cli = new URL('../.cache/vercel-tools/node_modules/vercel/dist/vc.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const email = process.argv[2];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Pass the admin email address.');
let password = randomBytes(20).toString('base64url');
try { const old = await readFile('admin-access.txt', 'utf8'); password = old.match(/^Password: (.+)$/m)?.[1] || password; } catch {}
const settings = { ADMIN_EMAIL: email, ADMIN_PASSWORD_HASH: hashPassword(password), SESSION_SECRET: randomBytes(48).toString('base64url'), SITE_ORIGIN: 'https://easyora.vercel.app' };
for (const [name, value] of Object.entries(settings)) {
  await new Promise((resolve, reject) => {
    const args = [cli, 'env', 'add', name, 'production', '--scope', 'film9', '--force'];
    if (name !== 'SITE_ORIGIN' && name !== 'ADMIN_EMAIL') args.push('--sensitive');
    const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' } });
    let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Could not configure ${name}: ${output.split(value).join('[redacted]')}`)));
    child.stdin.end(value);
  });
  console.log(`${name}: configured`);
}
await writeFile('admin-access.txt', `EasyOra admin access\n\nURL: https://easyora.vercel.app/admin\nEmail: ${email}\nPassword: ${password}\n\nKeep this file private. It is excluded from Git.\n`, { mode: 0o600 });
console.log('Private admin login saved to admin-access.txt (excluded from Git).');
