// Dependency-free local dev server. For Vercel, /api/virtual.js is deployed as a serverless function.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const virtual = require('./api/virtual');
const ROOT = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico':'image/x-icon' };

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (url.pathname === '/api/virtual' || url.pathname === '/api/real') {
      req.query = Object.fromEntries(url.searchParams);
      if (url.pathname === '/api/real') req.query.mode = 'real';
      virtual(req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405; res.end('Method not allowed'); return;
    }
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    let decoded;
    try { decoded = decodeURIComponent(pathname); }
    catch { res.statusCode = 400; res.end('Bad request'); return; }
    const target = path.resolve(ROOT, '.' + decoded);
    if (!(target === path.join(ROOT, 'index.html') || target.startsWith(path.join(ROOT, 'assets') + path.sep))) {
      res.statusCode = 404; res.end('Not found'); return;
    }
    fs.readFile(target, (err, data) => {
      if (err) { res.statusCode = 404; res.end('Not found'); return; }
      res.setHeader('Content-Type', TYPES[path.extname(target)] || 'application/octet-stream');
      res.end(req.method === 'HEAD' ? '' : data);
    });
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log(`VirtualScope ready: http://localhost:${port}`));
}
module.exports = { createServer };
