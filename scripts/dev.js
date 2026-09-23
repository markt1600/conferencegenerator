#!/usr/bin/env node
/*
 * Local development server that mirrors the Vercel deployment:
 *   - static files from the repo root with cleanUrls (/about -> about.html)
 *   - the rewrites declared in vercel.json (/conferences/:slug -> conference.html)
 *   - serverless functions in /api with Vercel-style req/res helpers
 *   - loads .env / .env.local so ANTHROPIC_API_KEY etc. work locally
 *
 * Usage: npm run dev   (PORT=3000 by default)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);

loadEnv(path.join(ROOT, '.env'));
loadEnv(path.join(ROOT, '.env.local'));

const vercelConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const rewrites = (vercelConfig.rewrites || []).map((r) => {
  const keys = [];
  const pattern = r.source.replace(/:([A-Za-z0-9_]+)/g, (_, k) => {
    keys.push(k);
    return '([^/]+)';
  });
  return { regex: new RegExp('^' + pattern + '$'), keys, destination: r.destination };
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

function safeJoin(root, urlPath) {
  const p = path.normalize(path.join(root, decodeURIComponent(urlPath)));
  if (!p.startsWith(root)) return null;
  return p;
}

function serveFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
}

function resolveStatic(urlPath) {
  if (urlPath.endsWith('/') && urlPath !== '/') urlPath = urlPath.slice(0, -1);
  const candidates = [];
  const base = safeJoin(ROOT, urlPath === '/' ? '/index.html' : urlPath);
  if (!base) return null;
  candidates.push(base);
  if (!path.extname(urlPath)) {
    candidates.push(base + '.html');
    candidates.push(path.join(base, 'index.html'));
  }
  for (const c of candidates) {
    if (c.includes(path.sep + 'node_modules' + path.sep) || c.includes(path.sep + '.git' + path.sep)) continue;
    try {
      const st = fs.statSync(c);
      if (st.isFile()) return c;
    } catch (_) {}
  }
  return null;
}

async function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const ct = req.headers['content-type'] || '';
      if (!raw) return resolve(undefined);
      if (ct.includes('application/json')) {
        try { return resolve(JSON.parse(raw)); } catch (_) { return resolve(raw); }
      }
      resolve(raw);
    });
  });
}

function vercelify(req, res, url) {
  req.query = Object.fromEntries(url.searchParams.entries());
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (body) => {
    if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) return res.json(body);
    res.end(body);
    return res;
  };
}

async function handleApi(req, res, url) {
  const name = url.pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
  if (!name || name.startsWith('_') || name.includes('..')) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  const file = path.join(ROOT, 'api', name + '.js');
  if (!fs.existsSync(file)) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'No such function: ' + name }));
  }
  // Fresh module each request so edits are picked up without restarting.
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(path.join(ROOT, 'api'))) delete require.cache[key];
  }
  const mod = require(file);
  const handler = mod.default || mod;
  req.body = await readBody(req);
  vercelify(req, res, url);
  try {
    await handler(req, res);
    if (!res.writableEnded) res.end();
  } catch (err) {
    console.error('[api]', name, err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
    }
    if (!res.writableEnded) res.end(JSON.stringify({ error: 'Function crashed', detail: String(err && err.message || err) }));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const started = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${url.pathname}${url.search} -> ${res.statusCode} (${Date.now() - started}ms)`);
  });

  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);

  let file = resolveStatic(url.pathname);
  if (!file) {
    for (const rw of rewrites) {
      const m = url.pathname.match(rw.regex);
      if (m) {
        file = resolveStatic(rw.destination);
        break;
      }
    }
  }
  if (!file) {
    res.statusCode = 404;
    const nf = path.join(ROOT, '404.html');
    if (fs.existsSync(nf)) return serveFile(res, nf);
    return res.end('Not found');
  }
  serveFile(res, file);
});

server.listen(PORT, () => {
  console.log(`OOO dev server → http://localhost:${PORT}`);
  console.log(`AI generator: ${process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY loaded' : 'no ANTHROPIC_API_KEY (offline planner only)'}`);
});
