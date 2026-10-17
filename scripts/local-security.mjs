import { randomBytes, timingSafeEqual } from 'node:crypto';

export const localOrigin = 'https://127.0.0.1:5173';
const allowedHosts = new Set(['127.0.0.1:5173', 'localhost:5173', '[::1]:5173']);
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
export const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

export function securityHeaders(response) {
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function cookie(request, name) {
  return String(request.headers.cookie ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
}

export function protectBrowserRequest(request, response, { secure = true, port = 5173 } = {}) {
  const host = String(request.headers.host ?? '').toLowerCase();
  const allowed = port === 5173 ? allowedHosts.has(host) : ['127.0.0.1', 'localhost', '[::1]'].some(x => host === `${x}:${port}`);
  if (!allowed) return [421, 'Invalid local host'];
  const navigation = request.method === 'GET' && request.headers['sec-fetch-mode'] === 'navigate' && request.headers['sec-fetch-dest'] === 'document' && !/^\/(?:api|health)(?:\/|$)/.test(request.url);
  if (request.headers['sec-fetch-site'] === 'cross-site' && !navigation) return [403, 'Cross-site request refused'];
  const origin = `${secure ? 'https' : 'http'}://${host}`;
  if (request.headers.origin && request.headers.origin !== origin) return [403, 'Invalid origin'];
  if (request.url === '/api/local-security/csrf' && request.method === 'GET') {
    const existing = cookie(request, '__Host-vt_csrf');
    const token = /^[a-f0-9]{64}$/.test(existing) ? existing : randomBytes(32).toString('hex');
    response.setHeader('Set-Cookie', `__Host-vt_csrf=${token}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`);
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ token }));
    return [0, ''];
  }
  if (!safeMethods.has(request.method)) {
    if (request.headers.origin !== origin) return [403, 'Origin is required'];
    const supplied = String(request.headers['x-csrf-token'] ?? '');
    const expected = cookie(request, '__Host-vt_csrf');
    if (!/^[a-f0-9]{64}$/.test(expected) || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return [403, 'Invalid CSRF token'];
  }
  return null;
}

export function proxyHeaders(headers, { secure, upstreamHost }) {
  const result = { ...headers };
  for (const name of Object.keys(result)) if (name === 'forwarded' || name.startsWith('x-forwarded-')) delete result[name];
  result['x-forwarded-host'] = headers.host;
  result['x-forwarded-proto'] = secure ? 'https' : 'http';
  result.host = upstreamHost;
  return result;
}
