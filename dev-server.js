// Dependency-free local dev server. For Vercel, /api/virtual.js is deployed as a serverless function.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const handlers = { '/api/virtual': require('./api/virtual'), '/api/real': require('./api/real'), '/api/event': require('./api/event'), '/api/status': require('./api/status'), '/api/book': require('./api/book'), '/api/auto-book': require('./api/auto-book'), '/api/assistant': require('./api/assistant'), '/api/research': require('./api/research') };
handlers['/api/load-code']=require('./api/load-code');
handlers['/api/track']=require('./api/track');
handlers['/api/tickets']=require('./api/tickets');
handlers['/api/account']=require('./api/account');
const ROOT = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico':'image/x-icon' };

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (handlers[url.pathname]) {
      req.query = Object.fromEntries(url.searchParams);
      if (req.method === 'POST') {
        let body='';
        for await (const chunk of req) {
          body+=chunk;
          if (Buffer.byteLength(body)>(url.pathname==='/api/account'?2500000:64000)){res.statusCode=413;res.end('Request too large');return;}
        }
        req.body=body;
      }
      await handlers[url.pathname](req, res);
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
      res.setHeader('Cache-Control', 'no-store');
      res.end(req.method === 'HEAD' ? '' : data);
    });
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log(`VirtualScope ready: http://localhost:${port}`));
}
module.exports = { createServer };
