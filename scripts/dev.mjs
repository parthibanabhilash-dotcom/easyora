import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handlers } from '../lib/handlers.mjs';
try { process.loadEnvFile('.env.local'); } catch {}
const root = path.resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const api = handlers();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:4173');
  const route = { '/api/admin': 'admin', '/api/content': 'content', '/api/media': 'media' }[url.pathname];
  if (route) return api[route](req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.statusCode = 400; return res.end(); }
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin') pathname = '/admin.html';
  const filename = path.resolve(root, '.' + pathname);
  if (!filename.startsWith(root + path.sep)) { res.statusCode = 403; return res.end(); }
  try { const bytes = await readFile(filename); res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.end(req.method === 'HEAD' ? undefined : bytes); }
  catch { res.statusCode = 404; res.end('Not found'); }
});
server.listen(4173, '127.0.0.1', () => console.log('EasyOra local preview: http://127.0.0.1:4173'));
