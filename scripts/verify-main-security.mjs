// Read-only smoke checks for the normal local instance. Does not create users,
// upload files, change business data or contact AI providers.
import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const ca = readFileSync(new URL('../.local-security/tls/rootCA.pem', import.meta.url));
function request(path, { port = 5173, secure = true, method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const transport = secure ? https : http;
    const outgoing = transport.request({ hostname: '127.0.0.1', servername: 'localhost', port, path, method, headers, ...(secure ? { ca } : {}) }, response => {
      const chunks = []; response.on('data', value => chunks.push(value));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    outgoing.on('error', reject); outgoing.setTimeout(10000, () => outgoing.destroy(new Error('Main instance timeout'))); outgoing.end(body);
  });
}
const ready = await request('/health/ready'); assert.equal(ready.status, 200, ready.body);
const plans = await request('/api/v1/plans'); assert.equal(plans.status, 200, plans.body); assert.ok(Array.isArray(JSON.parse(plans.body).plans));
const page = await request('/'); assert.equal(page.status, 200); assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/); assert.equal(page.headers['x-content-type-options'], 'nosniff');
const csrf = await request('/api/local-security/csrf'); assert.equal(csrf.status, 200); assert.match(csrf.headers['set-cookie'][0], /HttpOnly; SameSite=Strict; Secure/);
assert.equal((await request('/api/v1/auth/me')).status, 401);
assert.equal((await request('/api/v1/auth/login', { method: 'POST', body: '{}', headers: { Origin: 'https://127.0.0.1:5173', 'Content-Type': 'application/json' } })).status, 403);
assert.equal((await request('/health/ready', { headers: { Host: 'attacker.invalid:5173' } })).status, 421);
assert.equal((await request('/api/v1/plans', { headers: { Origin: 'https://attacker.invalid' } })).status, 403);
for (const path of ['/.env', '/.local-security/tls/localhost-key.pem', '/src/main.tsx', '/uploads/private']) assert.equal((await request(path)).status, 404, path);
assert.equal((await request('/api/v1/auth/login', { port: 8080, secure: false, method: 'POST', body: '{}', headers: { Origin: 'https://127.0.0.1:5173', 'Content-Type': 'application/json' } })).status, 403);
console.log(JSON.stringify({ main_instance: true, https_verified: true, ready: true, csp: true, secure_csrf_cookie: true, auth_required: true, csrf_enforced: true, foreign_host_origin_rejected: true, source_secrets_private: true, direct_http_mutation_rejected: true }, null, 2));
