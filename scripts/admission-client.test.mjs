import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

test('refresh resumes admission polling without submitting the multipart twice', async () => {
  const result = await build({ entryPoints: ['src/api.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'import.meta.env': '{}' } });
  const events = new EventTarget();
  const nativeFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = { location: { href: 'https://127.0.0.1:5173/app', origin: 'https://127.0.0.1:5173' }, dispatchEvent: e => events.dispatchEvent(e), setTimeout: callback => setTimeout(callback, 1) };
  let posts = 0, polls = 0, refreshed = false;
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url), window.location.href).pathname;
    if (path.endsWith('/csrf')) return json({ token: 'a'.repeat(64) });
    if (path.endsWith('/instructions')) { posts++; return json({ file_admission: { id: 'admission-1' } }, 202); }
    if (path.endsWith('/uploads/admission-1')) { polls++; return refreshed ? json({ status: 'completed', response_status: 201, payload: { id: 'instruction-1' } }) : json({ error: { code: 'access_token_stale' } }, 401); }
    if (path.endsWith('/auth/session')) return json({ access_available: refreshed, refresh_available: true });
    if (path.endsWith('/auth/me')) return refreshed ? json({ id: 'test-user' }) : json({}, 401);
    if (path.endsWith('/auth/refresh')) { refreshed = true; return json({ user: { id: 'test-user' } }); }
    throw new Error(`Unexpected mock path ${path}`);
  };
  try {
    const { api } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
    const response = await api.createInstruction({ title: 'test', scope: 'personal', file: new File(['ordinary'], 'test.md') });
    assert.equal(response.id, 'instruction-1'); assert.equal(posts, 1); assert.equal(polls, 2); assert.equal(refreshed, true);
  } finally { globalThis.fetch = nativeFetch; globalThis.window = originalWindow; }
});

test('expired access after tab idle recovers through stale CSRF without expiring the session', async () => {
  const result = await build({ entryPoints: ['src/api.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'import.meta.env': '{}' } });
  const oldFetch = globalThis.fetch, oldWindow = globalThis.window;
  const events = new EventTarget();
  let expiredEvents = 0, access = true, cookie = 'a'.repeat(64), csrfRequests = 0, refreshAttempts = 0, rotations = 0, callRequests = 0;
  events.addEventListener('verbatrace:session-expired', () => expiredEvents++);
  globalThis.window = { location: { href: 'https://127.0.0.1:5173/app', origin: 'https://127.0.0.1:5173' }, dispatchEvent: event => events.dispatchEvent(event) };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url), window.location.href).pathname;
    if (path.endsWith('/csrf')) { csrfRequests++; return json({ token: cookie }); }
    if (path.endsWith('/auth/me/profile')) return json({ id: 'synthetic-user' });
    if (path.endsWith('/auth/session')) return json({ access_available: access, refresh_available: true });
    if (path.endsWith('/auth/me')) return access ? json({ id: 'synthetic-user' }) : json({}, 401);
    if (path.endsWith('/auth/refresh')) {
      refreshAttempts++;
      if (new Headers(init.headers).get('X-CSRF-Token') !== cookie) return new Response('Invalid CSRF token', { status: 403 });
      rotations++; access = true; return json({ user: { id: 'synthetic-user' } });
    }
    if (path.endsWith('/calls')) { callRequests++; return access ? json({ items: [] }) : json({ error: { code: 'unauthorized' } }, 401); }
    throw new Error(`Unexpected mock path: ${path}`);
  };
  try {
    const { api } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64') + '#idle-recovery');
    await api.updateProfile({ display_name: 'Synthetic user' });
    access = false; cookie = 'b'.repeat(64);
    await api.listCalls();
    assert.equal(callRequests, 2);
    assert.equal(refreshAttempts, 2);
    assert.equal(rotations, 1);
    assert.equal(csrfRequests, 2);
    assert.equal(expiredEvents, 0);
  } finally { globalThis.fetch = oldFetch; globalThis.window = oldWindow; }
});
