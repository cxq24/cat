import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildApp } from './build.mjs';

const production = process.argv.includes('--production');
const directory = production ? 'dist' : '.preview';
await buildApp(directory, !production);
const base = path.resolve(directory);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(base + path.sep)) { response.writeHead(403); response.end(); return; }
    const content = await readFile(file);
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(content);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(Number(process.env.PORT || 4173), '0.0.0.0', () => console.log('Cat cafe listening on port ' + (process.env.PORT || 4173)));
