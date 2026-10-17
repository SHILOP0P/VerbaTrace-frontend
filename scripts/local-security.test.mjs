import assert from 'node:assert/strict';
import { test } from 'node:test';
import { protectBrowserRequest, proxyHeaders } from './local-security.mjs';

function response() { return { headers: {}, setHeader(k,v){this.headers[k]=v;}, writeHead(code,headers){this.code=code;Object.assign(this.headers,headers);}, end(value){this.body=value;} }; }
test('browser policy refuses rebinding and CSRF while preserving same-origin requests', () => {
  const token='a'.repeat(64);
  const request={ method:'POST',url:'/api/v1/calls',headers:{host:'127.0.0.1:5173',origin:'https://127.0.0.1:5173',cookie:`__Host-vt_csrf=${token}`,'x-csrf-token':token} };
  assert.equal(protectBrowserRequest(request,response()),null);
  assert.equal(protectBrowserRequest({...request,headers:{...request.headers,origin:'https://attacker.example'}},response())[0],403);
  assert.equal(protectBrowserRequest({...request,headers:{...request.headers,host:'attacker.example:5173'}},response())[0],421);
  assert.equal(protectBrowserRequest({...request,headers:{...request.headers,'x-csrf-token':''}},response())[0],403);
  const reply=response();protectBrowserRequest({method:'GET',url:'/api/local-security/csrf',headers:{host:'127.0.0.1:5173'}},reply);
  assert.equal(reply.code,200);assert.match(reply.headers['Set-Cookie'],/HttpOnly; SameSite=Strict; Secure/);
  assert.equal(reply.headers['Cache-Control'],'no-store');
  assert.equal(protectBrowserRequest({method:'GET',url:'/',headers:{host:'127.0.0.1:5173','sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document'}},response()),null);
  assert.equal(protectBrowserRequest({method:'GET',url:'/api/v1/auth/me',headers:{host:'127.0.0.1:5173','sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document'}},response())[0],403);
});
test('proxy discards every untrusted forwarded representation',()=>{
  const headers=proxyHeaders({host:'127.0.0.1:5173',forwarded:'for=evil','x-forwarded-for':'evil','x-forwarded-proto':'http','x-forwarded-host':'evil',cookie:'session'}, {secure:true,upstreamHost:'127.0.0.1:8080'});
  assert.equal(headers.forwarded,undefined);assert.equal(headers['x-forwarded-for'],undefined);assert.equal(headers['x-forwarded-proto'],'https');assert.equal(headers['x-forwarded-host'],'127.0.0.1:5173');assert.equal(headers.cookie,'session');
});
