import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../worker/index.mjs';
const origin='https://zwiebelrostbraten.github.io';
const env=()=>({TURNSTILE_SECRET:'test-only-secret',TICKET_HMAC_KEY:'test-only-key-'.repeat(4),LOOKUP_RATE_LIMITER:{limit:async()=>({success:true})},SESSION_RATE_LIMITER:{limit:async()=>({success:true})}});
function req(path='/session',ticket,extra={}) {return new Request('https://worker.test'+path,{method:path==='/session'?'POST':'GET',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1',...(path==='/session'?{'Content-Type':'application/json'}:{}),...(ticket?{Authorization:'Bearer '+ticket}:{}),...extra},...(path==='/session'?{body:JSON.stringify({token:'single-use-token'})}:{})});}
const verified=async()=>Response.json({success:true,hostname:'zwiebelrostbraten.github.io',action:'vocabulary'});
async function issue(e=env(),now=Date.now()) {const res=await handleRequest(req(),verified,e,()=>now);assert.equal(res.status,200);const body=await res.json();assert.equal(body.expiresAt,now+600000);return body.ticket;}
test('server validates Turnstile once then signed ticket allows multi-word batch',async()=>{
 const e=env();let verifications=0;
 const res=await handleRequest(req(),async(url,options)=>{verifications++;assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');const body=new URLSearchParams(options.body);assert.equal(body.get('secret'),e.TURNSTILE_SECRET);assert.equal(body.get('response'),'single-use-token');assert.equal(body.get('remoteip'),'192.0.2.1');return verified();},e);
 assert.equal(res.status,200);const {ticket}=await res.json();assert.ok(ticket);assert.equal(res.headers.get('cache-control'),'no-store');
 for(let i=0;i<64;i++)assert.equal((await handleRequest(req('/lookup?q=amo',ticket),async()=>Response.json([{searchItems:[]}]),e)).status,200);
 assert.equal(verifications,1);
});
test('Turnstile failures, wrong hostname/action, redirects and unavailable validation fail closed',async()=>{
 for(const result of [{success:false},{success:true,hostname:'evil.test',action:'vocabulary'},{success:true,hostname:'zwiebelrostbraten.github.io',action:'wrong'}]) assert.equal((await handleRequest(req(),async()=>Response.json(result),env())).status,403);
 for(const fetcher of [async()=>{throw Error('offline');},async()=>new Response('',{status:302}),async()=>new Response('invalid')]) assert.equal((await handleRequest(req(),fetcher,env())).status,503);
});
test('ticket required; tampering, expiry, IP/origin changes rejected before upstream',async()=>{
 const e=env(),now=Date.now(),ticket=await issue(e,now);const fail=()=>assert.fail('upstream');
 for(const bad of [undefined,ticket+'x','invalid'])assert.equal((await handleRequest(req('/lookup?q=amo',bad),fail,e)).status,401);
 assert.equal((await handleRequest(req('/lookup?q=amo',ticket),fail,e,()=>now+600000)).status,401);
 for(const extra of [{'CF-Connecting-IP':'192.0.2.2'},{Origin:'http://localhost:8080'}])assert.equal((await handleRequest(req('/lookup?q=amo',ticket,extra),fail,e)).status,401);
});
test('missing secrets, IP or rate bindings and limiter failures return 503; no local bypass',async()=>{
 for(const field of ['TURNSTILE_SECRET','TICKET_HMAC_KEY','LOOKUP_RATE_LIMITER','SESSION_RATE_LIMITER']) {const e=env();delete e[field];assert.equal((await handleRequest(req(),verified,e)).status,503);}
 assert.equal((await handleRequest(req('/session',null,{'CF-Connecting-IP':''}),verified,env())).status,503);
 const e=env(),ticket=await issue(e);e.LOOKUP_RATE_LIMITER={limit:async()=>{throw Error('unavailable');}};assert.equal((await handleRequest(req('/lookup?q=amo',ticket),()=>assert.fail('fetch'),e)).status,503);
 assert.equal((await handleRequest(req('/session',null,{Origin:'http://localhost:8080'}),verified,{})).status,503);
});
test('IP rate limit returns 429 and Retry-After without upstream; session also limited',async()=>{
 const e=env(),ticket=await issue(e);e.LOOKUP_RATE_LIMITER={limit:async({key})=>{assert.equal(key,'192.0.2.1');return {success:false};}};
 const res=await handleRequest(req('/lookup?q=amo',ticket),()=>assert.fail('fetch'),e);assert.equal(res.status,429);assert.equal(res.headers.get('retry-after'),'60');
 e.SESSION_RATE_LIMITER={limit:async()=>({success:false})};assert.equal((await handleRequest(req(),()=>assert.fail('siteverify'),e)).status,429);
});
test('session input is bounded, JSON only; correct POST preflight',async()=>{
 for(const body of ['{}','{','{"token":""}',JSON.stringify({token:'x'.repeat(2049)}),' '.repeat(4097)]) {
 const request=new Request('https://worker.test/session',{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json'},body});assert.equal((await handleRequest(request,()=>assert.fail('fetch'),env())).status,400);
 }
 const pre=new Request('https://worker.test/session',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'}});assert.equal((await handleRequest(pre)).status,204);
});
test('deployment config has placeholder namespaces and practical per-IP bounds, no secrets',async()=>{
 const {readFile}=await import('node:fs/promises');const config=await readFile('worker/wrangler.toml','utf8');
 assert.match(config,/name = "LOOKUP_RATE_LIMITER"[\s\S]*?namespace_id = "1001"[\s\S]*?limit = 128, period = 60/);
 assert.match(config,/name = "SESSION_RATE_LIMITER"[\s\S]*?namespace_id = "1002"[\s\S]*?limit = 3, period = 60/);
 assert.match(config,/enabled = false/);assert.doesNotMatch(config,/TURNSTILE_SECRET\s*=|TICKET_HMAC_KEY\s*=/);
});
test('lookup limiter also protects invalid tickets before HMAC work and ignores spoofed forwarding IP',async()=>{
 const e=env();let keys=[];e.LOOKUP_RATE_LIMITER={limit:async({key})=>{keys.push(key);return {success:false};}};
 const res=await handleRequest(req('/lookup?q=amo','invalid',{'X-Forwarded-For':'203.0.113.9'}),()=>assert.fail('fetch'),e);assert.equal(res.status,429);assert.deepEqual(keys,['192.0.2.1']);
});
