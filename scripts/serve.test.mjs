import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { brotliCompressSync, brotliDecompressSync, gzipSync } from 'node:zlib';
import { createSiteServer } from './serve.mjs';
import { checkPort } from './check-port.mjs';

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function request(port, path, { method = 'GET', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({ hostname: '127.0.0.1', port, path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

test('compiled server: public/app routing, source isolation, compression/cache, ranges and authenticated proxy', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'verbatrace-site-'));
  const dist = join(folder, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  const html = '<!doctype html><script src="/assets/main-abcdefgh.js"></script>';
  const javascript = Buffer.from('export const compiled = true;');
  await writeFile(join(dist, 'index.html'), html);
  await writeFile(join(dist, 'app.html'), 'authenticated application');
  await writeFile(join(dist, 'product.html'), 'product document');
  await writeFile(join(dist, 'pricing.html'), 'pricing document');
  await writeFile(join(dist, 'integrations.html'), 'integrations document');
  await writeFile(join(dist, 'legal.html'), 'legal placeholder');
  // Accidental copies inside dist must remain inaccessible too.
  await writeFile(join(dist, 'package.json'), 'PRIVATE=configuration');
  await writeFile(join(dist, 'assets', 'source.tsx'), 'PRIVATE=source');
  await writeFile(join(dist, 'assets', 'main-abcdefgh.js'), javascript);
  await writeFile(join(dist, 'assets', 'main-abcdefgh.js.br'), brotliCompressSync(javascript));
  await writeFile(join(dist, 'assets', 'main-abcdefgh.js.gz'), gzipSync(javascript));
  await writeFile(join(folder, '.env'), 'PRIVATE=never-public');
  let proxyInput;
  const backend = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      proxyInput = { url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() };
      res.writeHead(206, { 'Content-Type': 'audio/wav', 'Content-Range': 'bytes 1-3/5', 'Cache-Control': 'private, no-store', 'Set-Cookie': 'session=refreshed; HttpOnly; Path=/api' });
      res.end('udi');
    });
  });
  const backendPort = await listen(backend);
  const server = createSiteServer({ distDir: dist, apiTarget: `http://127.0.0.1:${backendPort}` });
  const port = await listen(server);
  t.after(async () => {
    server.closeAllConnections();
    backend.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => backend.close(resolve))]);
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
    assert.ok(basename(folder).startsWith('verbatrace-site-'));
    await rm(folder, { recursive: true, force: true });
  });
  await assert.rejects(checkPort(port), { code: 'EADDRINUSE' });
  const home = await request(port, '/');
  assert.equal(home.status, 200);
  assert.equal(home.body.toString(), html);
  const route = await request(port, '/app/calls?call=example', { headers: { accept: 'text/html' } });
  assert.equal(route.body.toString(), 'authenticated application');
  for (const page of ['product', 'pricing', 'integrations']) assert.equal((await request(port, `/${page}`)).body.toString(), `${page} document`);
  for (const page of ['login', 'register', 'reset-password']) assert.equal((await request(port, `/${page}?token=example`)).body.toString(), html);
  for (const page of ['privacy', 'terms', 'offer', 'cookies', 'consent', 'details']) assert.equal((await request(port, `/legal/${page}`)).body.toString(), 'legal placeholder');
  for (const [oldPage, newPage] of [['concept.html', '/'], ['concept-product.html', '/product'], ['concept-pricing.html', '/pricing'], ['concept-integrations.html', '/integrations']]) {
    const redirect = await request(port, `/${oldPage}?example=1`);
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.location, `${newPage}?example=1`);
  }
  for (const path of ['/src/main.tsx', '/@vite/client', '/@react-refresh', '/node_modules/react', '/.env', '/%2e%2e%2f.env', '/assets/missing.js', '/assets/main-abcdefgh.js.br', '/.vite/manifest.json', '/package.json', '/assets/source.tsx', '/demo.html', '/tools/check', '/scripts/serve.mjs', '/plugins/compressed-assets.ts', '/tests/private', '/docs/private', '/unknown-route']) {
    const blocked = await request(port, path, { headers: { accept: 'text/html' } });
    assert.equal(blocked.status, 404, path);
    assert.ok(!blocked.body.includes(Buffer.from('PRIVATE')));
  }
  const compressed = await request(port, '/assets/main-abcdefgh.js', { headers: { 'accept-encoding': 'gzip, br' } });
  assert.equal(compressed.headers['content-encoding'], 'br');
  assert.deepEqual(brotliDecompressSync(compressed.body), javascript);
  assert.match(compressed.headers['cache-control'], /immutable/);
  const uncompressed = await request(port, '/assets/main-abcdefgh.js', { headers: { 'accept-encoding': 'gzip;q=0, br;q=0' } });
  assert.equal(uncompressed.headers['content-encoding'], undefined);
  assert.deepEqual(uncompressed.body, javascript);
  const cached = await request(port, '/assets/main-abcdefgh.js', { headers: { 'if-none-match': compressed.headers.etag } });
  assert.equal(cached.status, 304);
  assert.equal(cached.body.length, 0);
  const head = await request(port, '/assets/main-abcdefgh.js', { method: 'HEAD' });
  assert.equal(Number(head.headers['content-length']), javascript.length);
  assert.equal(head.body.length, 0);
  const range = await request(port, '/assets/main-abcdefgh.js', { headers: { range: 'bytes=1-3', 'accept-encoding': 'gzip' } });
  assert.equal(range.status, 206);
  assert.deepEqual(range.body, javascript.subarray(1, 4));
  assert.equal((await request(port, '/assets/main-abcdefgh.js', { headers: { range: 'bytes=1000-' } })).status, 416);
  assert.equal((await request(port, '/', { method: 'POST' })).status, 405);
  const media = await request(port, '/api/v1/calls/example/media/download?variant=original', {
    method: 'POST', body: 'payload', headers: { cookie: 'session=existing', authorization: 'Bearer test', range: 'bytes=1-3', origin: 'http://127.0.0.1:5173' }
  });
  assert.equal(media.status, 206);
  assert.equal(media.body.toString(), 'udi');
  assert.equal(media.headers['cache-control'], 'private, no-store');
  assert.equal(media.headers['set-cookie'][0], 'session=refreshed; HttpOnly; Path=/api');
  assert.equal(media.headers['content-range'], 'bytes 1-3/5');
  assert.equal(proxyInput.method, 'POST');
  assert.equal(proxyInput.url, '/api/v1/calls/example/media/download?variant=original');
  assert.equal(proxyInput.body, 'payload');
  assert.equal(proxyInput.headers.cookie, 'session=existing');
  assert.equal(proxyInput.headers.authorization, 'Bearer test');
  assert.equal(proxyInput.headers.range, 'bytes=1-3');
  assert.equal(proxyInput.headers.origin, 'http://127.0.0.1:5173');
});
