import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

if (process.env.VERBATRACE_SECURITY_TEST !== '1') throw new Error('This test requires the isolated acceptance stack.');
const ca=readFileSync(new URL('../.local-security/tls/rootCA.pem',import.meta.url));
function client(){
  const cookies=new Map(); let csrf='';
  async function call(path,{method='GET',body,headers={},protect=true}={}){
    const payload=body===undefined?undefined:Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));
    const requestHeaders={...headers,Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')};
    if(payload){requestHeaders['Content-Length']=payload.length;requestHeaders['Content-Type']??='application/json';}
    if(!['GET','HEAD'].includes(method)){requestHeaders.Origin='https://127.0.0.1:5174';if(protect)requestHeaders['X-CSRF-Token']=csrf;}
    const response=await new Promise((resolve,reject)=>{
      const request=https.request({hostname:'127.0.0.1',servername:'localhost',port:5174,path,method,headers:requestHeaders,ca},reply=>{const chunks=[];reply.on('data',x=>chunks.push(x));reply.on('end',()=>{for(const c of reply.headers['set-cookie']??[]){const [pair]=c.split(';');const index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1));}const raw=Buffer.concat(chunks).toString();let json;try{json=JSON.parse(raw);}catch{}resolve({status:reply.statusCode,headers:reply.headers,json,raw});});});request.on('error',reject);request.setTimeout(60000,()=>request.destroy(new Error('acceptance timeout')));request.end(payload);
    });return response;
  }
  return {call,async prepare(){const r=await call('/api/local-security/csrf');assert.equal(r.status,200);assert.match(r.headers['set-cookie'][0],/Secure/);csrf=r.json.token;}};
}
function multipart(filename,content,type='text/markdown'){
  const boundary='vt-'+randomBytes(12).toString('hex');const payload=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="scope"\r\n\r\npersonal\r\n--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nSecurity acceptance\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n${content}\r\n--${boundary}--\r\n`);return{body:payload,headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`}};
}
async function settle(c,queued){assert.equal(queued.status,202,queued.raw);const id=queued.json.file_admission.id;for(let i=0;i<80;i++){const r=await c.call(`/api/v1/local-security/uploads/${id}`);assert.equal(r.status,200,r.raw);if(['completed','failed'].includes(r.json.status))return r.json;await new Promise(r=>setTimeout(r,500));}throw new Error('admission did not finish');}
async function register(c,suffix){await c.prepare();const email=`local_security_${suffix}@example.com`;const password='LocalSecurityAcceptance_2026!';const username=`sec_${suffix}`.slice(0,30);const registered=await c.call('/api/v1/auth/register',{method:'POST',body:{email,password,username,full_name:'Security',full_surname:'Acceptance'}});assert.equal(registered.status,201,registered.raw);const logged=await c.call('/api/v1/auth/login',{method:'POST',body:{email,password}});assert.equal(logged.status,200,logged.raw);assert.ok(logged.headers['set-cookie'].every(cookie=>cookie.includes('Secure')&&cookie.includes('HttpOnly')));return{email,password,id:logged.json.user.id};}

const c=client();assert.equal((await c.call('/api/v1/auth/login',{method:'POST',body:{},protect:false})).status,403);
assert.equal((await c.call('/health',{headers:{Host:'attacker.example:5174'}})).status,421);
const who=await register(c,randomBytes(5).toString('hex'));
const start=performance.now();const valid=await settle(c,await c.call('/api/v1/instructions',{method:'POST',...multipart('guide.md','# Heading\nSELECT * FROM users;\n<script>literal example</script>')}));assert.equal(valid.response_status,201,JSON.stringify(valid));assert.ok(valid.payload.id);
const preview=await c.call(`/api/v1/instructions/${valid.payload.id}/preview`);assert.equal(preview.status,200,preview.raw);assert.match(preview.json.text,/SELECT \* FROM users/);
const rejected=await settle(c,await c.call('/api/v1/instructions',{method:'POST',...multipart('fake.pdf','MZ synthetic executable renamed as PDF','application/pdf')}));assert.equal(rejected.status,'failed');assert.equal(rejected.response_status,422,JSON.stringify(rejected));
const other=client();await register(other,randomBytes(5).toString('hex'));assert.equal((await other.call(`/api/v1/local-security/uploads/${valid.id}`)).status,404);assert.equal((await other.call(`/api/v1/instructions/${valid.payload.id}/preview`)).status,403);
const direct=await new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:8081,path:'/api/v1/auth/login',method:'POST',headers:{Host:'127.0.0.1:8081',Origin:'https://127.0.0.1:5174','Content-Type':'application/json'}},reply=>{reply.resume();reply.on('end',()=>resolve(reply.statusCode));});req.on('error',reject);req.end('{}');});assert.equal(direct,403);
assert.equal((await c.call('/health/ready')).status,200);
writeFileSync(new URL('../.local-security/browser-fixture.json',import.meta.url),JSON.stringify({...who,instruction_id:valid.payload.id}),{mode:0o600});
console.log(JSON.stringify({tls_verified:true,csrf:true,host:true,secure_cookies:true,async_upload:true,literal_code:true,renamed_file_rejected:true,other_user_blocked:true,direct_http_blocked:true,valid_upload_and_preview_ms:Math.round(performance.now()-start)},null,2));
