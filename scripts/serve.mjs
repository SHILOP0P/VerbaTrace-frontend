import { createReadStream, existsSync, realpathSync } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectDir = fileURLToPath(new URL('../', import.meta.url));
const mediaTimeout = 45 * 60 * 1000;
const publicPages = new Map([
  ['/', 'index.html'], ['/product', 'product.html'], ['/pricing', 'pricing.html'],
  ['/integrations', 'integrations.html'], ['/login', 'index.html'],
  ['/register', 'index.html'], ['/reset-password', 'index.html'],
  ...['privacy', 'terms', 'offer', 'cookies', 'consent', 'details'].map(document => [`/legal/${document}`, 'legal.html'])
]);
const legacyPages = new Map([
  ['/concept.html', '/'], ['/concept-product.html', '/product'],
  ['/concept-pricing.html', '/pricing'], ['/concept-integrations.html', '/integrations']
]);
const documents = new Set(['/index.html', '/app.html', '/product.html', '/pricing.html', '/integrations.html', '/legal.html']);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg'
};

function plain(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(message);
}

function endToEndHeaders(headers) {
  const copy = { ...headers };
  const nominated = String(copy.connection ?? '').split(',').map(name => name.trim().toLowerCase());
  for (const name of [...nominated, 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']) delete copy[name];
  return copy;
}

function proxy(request, response, target, agent) {
  const headers = endToEndHeaders(request.headers);
  headers['x-forwarded-host'] = request.headers.host;
  headers['x-forwarded-proto'] ??= 'http';
  headers.host = target.host;
  const transport = target.protocol === 'https:' ? https : http;
  const upstream = transport.request({ protocol: target.protocol, hostname: target.hostname,
    port: target.port || undefined, path: request.url, method: request.method, headers, agent }, reply => {
    response.writeHead(reply.statusCode ?? 502, endToEndHeaders(reply.headers));
    pipeline(reply, response, () => {});
  });
  upstream.setTimeout(mediaTimeout, () => upstream.destroy(new Error('API timeout')));
  upstream.on('error', () => {
    if (!response.headersSent) plain(response, 502, 'API is unavailable');
    else response.destroy();
  });
  request.on('aborted', () => upstream.destroy());
  request.on('error', () => upstream.destroy());
  response.on('close', () => { if (!response.writableEnded) upstream.destroy(); });
  request.pipe(upstream);
}

function encodingQuality(header, name) {
  const values = String(header ?? '').toLowerCase().split(',').map(value => {
    const [token, ...parameters] = value.trim().split(';');
    const q = parameters.find(parameter => parameter.trim().startsWith('q='));
    return [token, q ? Number(q.trim().slice(2)) : 1];
  });
  const quality = values.find(([token]) => token === name)?.[1]
    ?? values.find(([token]) => token === '*')?.[1] ?? (name === 'identity' ? 1 : 0);
  return Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0;
}

async function staticFile(request, response, distDir, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return plain(response, 405, 'Method not allowed');
  }
  if (legacyPages.has(pathname)) {
    const query = new URL(request.url, 'http://localhost').search;
    response.writeHead(308, { Location: legacyPages.get(pathname) + query, 'Cache-Control': 'no-store' });
    return response.end();
  }
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.includes(':')
    || pathname.split('/').some(part => part.startsWith('.'))
    || /^\/(?:src|scripts|tools|plugins|tests|docs|node_modules|@vite|@id|@fs|@react-refresh)(?:\/|$)/.test(pathname)
    || /\.(?:tsx?|map|gz|br)$/.test(pathname)) return plain(response, 404, 'Not found');
  const page = publicPages.get(pathname);
  const workspace = pathname === '/app' || pathname.startsWith('/app/');
  const asset = pathname.startsWith('/assets/') && Object.hasOwn(mimeTypes, extname(pathname));
  if (workspace && extname(pathname)) return plain(response, 404, 'Not found');
  if (!page && !workspace && !documents.has(pathname) && !asset) return plain(response, 404, 'Not found');
  let file = resolve(distDir, page ?? (workspace ? 'app.html' : `.${pathname}`));
  let sourceStat;
  try { sourceStat = await stat(file); } catch { /* A page route can use the SPA entry. */ }
  if (!sourceStat?.isFile()) {
    if (extname(pathname) || /^\/(?:assets|basis|draco)(?:\/|$)/.test(pathname)
      || !String(request.headers.accept ?? '').includes('text/html')) return plain(response, 404, 'Not found');
    return plain(response, 404, 'Not found');
  }
  // A link inside dist must never make workspace files public.
  if (!(await realpath(file)).startsWith(distDir + sep)) return plain(response, 404, 'Not found');
  const hashed = /-[\w-]{8}\.(?:js|mjs|css|woff2?|png|jpg|svg)$/.test(file);
  const etag = `W/"${sourceStat.size}-${Math.trunc(sourceStat.mtimeMs)}"`;
  const contentType = mimeTypes[extname(file)] ?? 'application/octet-stream';
  response.setHeader('Content-Type', contentType);
  response.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
  response.setHeader('ETag', etag);
  response.setHeader('Last-Modified', sourceStat.mtime.toUTCString());
  response.setHeader('Vary', 'Accept-Encoding');
  if (String(request.headers['if-none-match'] ?? '').split(',').map(value => value.trim()).some(value => value === etag || value === '*')) {
    response.writeHead(304);
    return response.end();
  }
  // Byte ranges refer to the original representation. API ranges are proxied.
  let selected = file;
  if (!request.headers.range) {
    const encodings = ['br', 'gzip'].map(name => ({ name, quality: encodingQuality(request.headers['accept-encoding'], name) }))
      .filter(value => value.quality > 0).sort((a, b) => b.quality - a.quality);
    for (const { name } of encodings) {
      const compressed = `${file}.${name === 'br' ? 'br' : 'gz'}`;
      if (existsSync(compressed)) {
        if (!(await realpath(compressed)).startsWith(distDir + sep)) return plain(response, 404, 'Not found');
        selected = compressed;
        response.setHeader('Content-Encoding', name);
        break;
      }
    }
  }
  if (selected === file && encodingQuality(request.headers['accept-encoding'], 'identity') === 0) return plain(response, 406, 'Encoding not available');
  const selectedStat = selected === file ? sourceStat : await stat(selected);
  let start = 0;
  let end = selectedStat.size - 1;
  let status = 200;
  response.setHeader('Accept-Ranges', 'bytes');
  const ifRange = request.headers['if-range'];
  const useRange = request.headers.range && (!ifRange || Date.parse(ifRange) >= Math.trunc(sourceStat.mtimeMs / 1000) * 1000);
  if (useRange && request.method === 'GET') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if (match && (match[1] || match[2])) {
      if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), end) : end;
      } else start = Math.max(0, selectedStat.size - Number(match[2]));
    } else start = -1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || end >= selectedStat.size) {
      response.setHeader('Content-Range', `bytes */${selectedStat.size}`);
      return plain(response, 416, 'Range not satisfiable');
    }
    status = 206;
    response.setHeader('Content-Range', `bytes ${start}-${end}/${selectedStat.size}`);
  }
  response.setHeader('Content-Length', selectedStat.size === 0 ? 0 : end - start + 1);
  response.writeHead(status);
  if (request.method === 'HEAD' || selectedStat.size === 0) return response.end();
  pipeline(createReadStream(selected, { start, end }), response, () => {});
}

export function createSiteServer({ distDir = resolve(projectDir, 'dist'), apiTarget = 'http://127.0.0.1:8080' } = {}) {
  distDir = realpathSync(distDir);
  const target = new URL(apiTarget);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Invalid API_TARGET');
  const agent = target.protocol === 'https:' ? new https.Agent({ keepAlive: true }) : new http.Agent({ keepAlive: true });
  const server = http.createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { return plain(response, 400, 'Invalid path'); }
    if (/^\/(?:api|health)(?:\/|$)/.test(pathname)) return proxy(request, response, target, agent);
    staticFile(request, response, distDir, pathname).catch(() => {
      if (!response.headersSent) plain(response, 500, 'File is unavailable');
      else response.destroy();
    });
  });
  server.requestTimeout = mediaTimeout;
  server.headersTimeout = 30_000;
  server.on('close', () => agent.destroy());
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const distDir = resolve(projectDir, 'dist');
  if (!existsSync(resolve(distDir, 'index.html'))) {
    console.error('Build the site first: npm run build');
    process.exit(1);
  }
  const server = createSiteServer({ distDir, apiTarget: process.env.API_TARGET || 'http://127.0.0.1:8080' });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'Port 5173 is already occupied. Stop the previous server.' : error.message);
    process.exit(1);
  });
  server.listen(5173, '127.0.0.1', () => console.log('VerbaTrace: http://127.0.0.1:5173 (compiled site + API proxy)'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => {
      server.closeAllConnections();
      process.exit(0);
    }, 5000).unref();
  });
}
