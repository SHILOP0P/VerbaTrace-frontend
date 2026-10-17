// Explicit isolated acceptance server. It never selects the normal API port.
import { readFileSync } from 'node:fs';
import { createSiteServer } from './serve.mjs';
if (process.env.VERBATRACE_SECURITY_TEST !== '1') throw new Error('Set VERBATRACE_SECURITY_TEST=1 for the isolated acceptance stack.');
const server = createSiteServer({ apiTarget: 'http://127.0.0.1:8081', enforceSecurity: true,
  tls: { cert: readFileSync(new URL('../.local-security/tls/localhost.pem', import.meta.url)), key: readFileSync(new URL('../.local-security/tls/localhost-key.pem', import.meta.url)), minVersion: 'TLSv1.2' } });
server.listen(5174, '127.0.0.1', () => console.log('Isolated security acceptance: https://127.0.0.1:5174'));
