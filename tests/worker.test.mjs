import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuery, parseResult, handleRequest as secureHandleRequest } from '../worker/index.mjs';
// Explicit test-only bindings; exercise upstream behavior behind a real signed ticket.
async function handleRequest(request, fetcher) {
  const env={TURNSTILE_SECRET:'test-only',TICKET_HMAC_KEY:'test-only-key'.repeat(4),LOOKUP_RATE_LIMITER:{limit:async()=>({success:true})},SESSION_RATE_LIMITER:{limit:async()=>({success:true})}};
  const headers=new Headers(request.headers);headers.set('CF-Connecting-IP','192.0.2.1');
  if(request.method==='GET' && new URL(request.url).pathname==='/lookup' && headers.get('Origin')) {
    const session=await secureHandleRequest(new Request('https://worker.test/session',{method:'POST',headers:{...Object.fromEntries(headers),'Content-Type':'application/json'},body:JSON.stringify({token:'test-token'})}),async()=>Response.json({success:true,hostname:new URL(headers.get('Origin')).hostname,action:'vocabulary'}),env);
    if(session.ok)headers.set('Authorization','Bearer '+(await session.json()).ticket);
  }
  return secureHandleRequest(new Request(request,{headers}),fetcher,env);
}
const item = { lemma: 'amāre, amō', bedeutungenFlach: ['lieben', 'mögen'], wortart: 'VERB', klassenlabelMitKlammer: '(a-Konjugation)', flexion: ['huge'] };
test('validates exactly one Unicode-letter word, normalized and bounded', () => {
  for (const q of ['amo', 'Ārma', 'a\u0304', 'a'.repeat(100)]) assert.ok(validateQuery(q));
  for (const q of ['', null, ' amo', 'amo amas', 'amo1', 'a-b', 'a'.repeat(101)]) assert.equal(validateQuery(q), null);
});
test('normalizes only first viable Navigium search item', () => {
  assert.deepEqual(parseResult([{searchItems:[{}, item, {...item, lemma:'other'}]}], 'amo'), {query:'amo',found:true,lemma:'amāre, amō',meanings:['lieben','mögen'],wordType:'VERB',classLabel:'(a-Konjugation)',deponens:false,flexion:[]});
});
test('empty results and malformed payloads are distinguished', () => {
  assert.equal(parseResult([{searchItems:[]}], 'xyz').found, false);
  for (const data of [null, {}, [{}], [{searchItems:[{lemma:3}]}]]) assert.throws(() => parseResult(data, 'amo'));
});
test('strict CORS accepts exact Pages and loopback origins only', async () => {
  for (const origin of ['https://zwiebelrostbraten.github.io','http://localhost:8080','http://127.0.0.1:5173','http://[::1]:8787']) {
    const res=await handleRequest(new Request('https://worker.test/lookup',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}}));
    assert.equal(res.status,204);assert.equal(res.headers.get('access-control-allow-origin'),origin);assert.equal(res.headers.get('vary'),'Origin');
    assert.equal(res.headers.get('access-control-allow-headers'),'Content-Type, Authorization');
  }
  for (const origin of ['null','https://other.test','https://zwiebelrostbraten.github.io.evil.test','http://zwiebelrostbraten.github.io','http://localhost.evil.test','http://127.0.0.2','https://zwiebelrostbraten.github.io:444','https://zwiebelrostbraten.github.io/path','']) {
    const res=await handleRequest(new Request('https://worker.test/lookup',{headers:origin?{Origin:origin}:{}}));
    assert.equal(res.status,403);assert.equal(res.headers.get('access-control-allow-origin'),null);
  }
  for (const headers of [{'Access-Control-Request-Method':'DELETE'},{'Access-Control-Request-Headers':'x-test'}]) {
    assert.equal((await handleRequest(new Request('https://worker.test/lookup',{method:'OPTIONS',headers:{Origin:'http://localhost:8080',...headers}}))).status,403);
  }
});
const req = (path='/lookup?q=amo', method='GET', origin='https://zwiebelrostbraten.github.io') => new Request('https://worker.test'+path, {method,headers:{Origin:origin}});
test('Worker fetches Navigium without caching and returns minimal no-store JSON', async () => {
  let calls=0;
  const res=await handleRequest(req(), async (url, options) => { calls++; assert.equal(url,'https://www.navigium.de/suchfunktion/_search?q=amo'); assert.equal(options.cache,'no-store'); assert.equal(new Headers(options.headers).get('cache-control'),'no-cache, no-store'); return Response.json([{searchItems:[item]}]); });
  assert.equal(calls,1); assert.equal(res.status,200); assert.equal(res.headers.get('cache-control'),'no-store'); assert.equal(res.headers.get('access-control-allow-origin'),'https://zwiebelrostbraten.github.io'); assert.equal((await res.json()).lemma,item.lemma);
});
test('preflight, bad queries and routing never fetch upstream', async () => {
  const fail = () => { throw new Error('must not fetch'); };
  assert.equal((await handleRequest(req('/lookup','OPTIONS'),fail)).status,204);
  for (const [request,status] of [[req('/lookup?q=two+words'),400],[req('/lookup?q=amo&q=amas'),400],[req('/other'),404],[req('/lookup','POST'),405]]) {
    const res=await handleRequest(request,fail); assert.equal(res.status,status); assert.ok((await res.json()).error); assert.equal(res.headers.get('cache-control'),'no-store');
  }
});
test('upstream failures and malformed JSON return useful errors', async () => {
  for (const fetcher of [async()=>{throw Error('offline');},async()=>new Response('oops'),async()=>Response.json({}, {status:503}),async()=>Response.json({})]) {
    const res=await handleRequest(req(),fetcher); assert.equal(res.status,502); assert.ok((await res.json()).error);
  }
});
test('Unicode combining marks are valid only after a letter', () => {
  assert.equal(validateQuery('māter\u0304'), 'māter\u0304');
  assert.equal(validateQuery('\u0304amo'), null);
});
test('upstream requests reject redirects and omit credentials and referrers', async () => {
  let options;
  const response = await handleRequest(req(), async (url, supplied) => {
    options = supplied;
    return Response.json([{searchItems:[item]}]);
  });
  assert.equal(response.status, 200);
  assert.equal(options.redirect, 'manual');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.referrerPolicy, 'no-referrer');
});
test('client cookies, authorization, referrer and extra parameters are never forwarded', async () => {
  let forwarded;
  const request = new Request('https://worker.test/lookup?q=amo&private=secret', {headers:{Origin:'https://zwiebelrostbraten.github.io', Cookie:'session=secret', Authorization:'Bearer secret', Referer:'https://private.test/text'}});
  const response = await handleRequest(request, async (url, options) => {
    forwarded = {url, headers:new Headers(options.headers)};
    return Response.json([{searchItems:[item]}]);
  });
  assert.equal(response.status, 200);
  assert.equal(forwarded.url, 'https://www.navigium.de/suchfunktion/_search?q=amo');
  for (const name of ['cookie','authorization','referer','origin']) assert.equal(forwarded.headers.get(name), null);
});

test('normalizes joined meanings, class, deponens and only useful bounded flexion fields', () => {
  const payload = [{searchItems:[{lemma:'hortor', wortart:'VERB', klassenlabel:'Verb', deponens:true,
    bedeutungsgruppe:[{bedeutungJoined:'ermahnen, auffordern', bedeutung:['wrong']},{bedeutungJoined:'ermutigen'}],
    flexion:[{form:'InfinitivForm(PRAES,DEP)', wort:['hortari'], secret:'private'}, {form:'VerbForm(P2,PL,PERF,IND,AKT,m)',wort:['unused']}, ...Array.from({length:200},()=>({form:'SubstantivForm(NOM,SG)',wort:['x'.repeat(1000)]}))]}]}];
  const result = parseResult(payload, 'hortor');
  assert.deepEqual(result.meanings,['ermahnen, auffordern','ermutigen']);
  assert.equal(result.classLabel,'Verb'); assert.equal(result.deponens,true);
  assert.deepEqual(result.flexion[0],{form:'InfinitivForm(PRAES,DEP)',wort:['hortari']});
  assert.ok(result.flexion.length <= 100);
  assert.ok(result.flexion.every(f=>f.wort.every(w=>w.length <= 150)));
  assert.ok(!result.flexion.some(f=>f.form.includes('P2')));
});
test('oversized upstream body fails without disclosing fields', async () => {
  const response = await handleRequest(req(),async()=>new Response(' '.repeat(1048577)));
  assert.equal(response.status,502);
});
