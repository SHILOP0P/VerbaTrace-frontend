import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { protectBrowserRequest } from './local-security.mjs';

const bundle = await build({ entryPoints: ['src/shared/lib/secure-fetch.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
let moduleId = 0;
async function scenario(run, override) {
  const oldFetch = globalThis.fetch, oldWindow = globalThis.window;
  const state = { cookie: 'a'.repeat(64), csrfRequests: 0, attempts: 0, writes: 0 };
  globalThis.window = { location: { href: 'https://127.0.0.1:5173/app', origin: 'https://127.0.0.1:5173' } };
  globalThis.fetch = async (input, init = {}) => {
    const path = new URL(input instanceof Request ? input.url : String(input), window.location.href).pathname;
    const reply = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, writeHead(code, headers) { this.code = code; Object.assign(this.headers, headers); }, end(body) { this.body = body; } };
    const headers = { host: '127.0.0.1:5173', origin: window.location.origin, cookie: `__Host-vt_csrf=${state.cookie}`, ...Object.fromEntries(new Headers(init.headers)) };
    if (path === '/api/local-security/csrf') {
      state.csrfRequests++;
      protectBrowserRequest({ method: 'GET', url: path, headers }, reply);
      return new Response(reply.body, { status: reply.code, headers: reply.headers });
    }
    state.attempts++;
    if (override) return override(state);
    const refusal = protectBrowserRequest({ method: init.method ?? (input instanceof Request ? input.method : 'GET'), url: path, headers }, reply);
    if (refusal) return new Response(refusal[1], { status: refusal[0] });
    state.writes++;
    return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const { secureFetch } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}#${++moduleId}`);
    await run(secureFetch, state);
  } finally { globalThis.fetch = oldFetch; globalThis.window = oldWindow; }
}

test('stale CSRF after returning to a tab is repaired before exactly one mutation', () => scenario(async (fetch, state) => {
  assert.equal((await fetch('/api/v1/auth/refresh', { method: 'POST' })).status, 200);
  state.cookie = 'b'.repeat(64);
  assert.equal((await fetch('/api/v1/auth/refresh', { method: 'POST' })).status, 200);
  assert.equal(state.csrfRequests, 2);
  assert.equal(state.attempts, 3);
  assert.equal(state.writes, 2);
}));

test('concurrent stale requests share CSRF repair and never duplicate accepted writes', () => scenario(async (fetch, state) => {
  await fetch('/api/v1/auth/refresh', { method: 'POST' });
  state.cookie = 'c'.repeat(64);
  const responses = await Promise.all([fetch('/api/v1/calls', { method: 'POST', body: new FormData() }), fetch('/api/v1/auth/refresh', { method: 'POST' })]);
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(state.csrfRequests, 2);
  assert.equal(state.attempts, 5);
  assert.equal(state.writes, 3);
}));

test('permission denial does not replay a mutation', () => scenario(async (fetch, state) => {
  assert.equal((await fetch('/api/v1/calls', { method: 'POST' })).status, 403);
  assert.equal(state.attempts, 1);
  assert.equal(state.csrfRequests, 1);
}, () => new Response('Forbidden', { status: 403 })));

test('failed CSRF repair has a single retry budget', () => scenario(async (fetch, state) => {
  assert.equal((await fetch('/api/v1/auth/refresh', { method: 'POST' })).status, 403);
  assert.equal(state.attempts, 2);
  assert.equal(state.csrfRequests, 2);
}, () => new Response('Invalid CSRF token', { status: 403 })));

test('an uncertain network failure never replays an accepted mutation', () => scenario(async (fetch, state) => {
  await assert.rejects(fetch('/api/v1/calls', { method: 'POST' }), TypeError);
  assert.equal(state.attempts, 1);
  assert.equal(state.writes, 1);
}, state => { state.writes++; throw new TypeError('connection interrupted'); }));

test('Request bodies are not replayed and the next request can repair its token', () => scenario(async (fetch, state) => {
  await fetch('/api/v1/auth/refresh', { method: 'POST' });
  state.cookie = 'd'.repeat(64);
  const response = await fetch(new Request('https://127.0.0.1:5173/api/v1/calls', { method: 'POST', body: 'streamed body' }));
  assert.equal(response.status, 403);
  assert.equal(state.attempts, 2);
  assert.equal((await fetch('/api/v1/auth/refresh', { method: 'POST' })).status, 200);
  assert.equal(state.csrfRequests, 2);
  assert.equal(state.writes, 2);
}));
