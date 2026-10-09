import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuery, allowedOrigin, parseResult, handleRequest } from '../worker/index.mjs';
const item = { lemma: 'amāre, amō', bedeutungenFlach: ['lieben', 'mögen'], wortart: 'VERB', klassenlabelMitKlammer: '(a-Konjugation)', flexion: ['huge'] };
test('validates exactly one Unicode-letter word, normalized and bounded', () => {
  for (const q of ['amo', 'Ārma', 'a\u0304', 'a'.repeat(100)]) assert.ok(validateQuery(q));
  for (const q of ['', null, ' amo', 'amo amas', 'amo1', 'a-b', 'a'.repeat(101)]) assert.equal(validateQuery(q), null);
});
test('normalizes only first viable Navigium search item', () => {
  assert.deepEqual(parseResult([{searchItems:[{}, item, {...item, lemma:'other'}]}], 'amo'), {query:'amo',found:true,lemma:'amāre, amō',meanings:['lieben','mögen'],wordType:'VERB',classLabel:'(a-Konjugation)'});
});
test('empty results and malformed payloads are distinguished', () => {
  assert.equal(parseResult([{searchItems:[]}], 'xyz').found, false);
  for (const data of [null, {}, [{}], [{searchItems:[{lemma:3}]}]]) assert.throws(() => parseResult(data, 'amo'));
});
test('CORS permits exact Pages origin and local development only', () => {
  for (const o of ['https://zwiebelrostbraten.github.io','http://localhost:8080','http://127.0.0.1:8080']) assert.ok(allowedOrigin(o));
  for (const o of ['null','https://evil.test','https://zwiebelrostbraten.github.io.evil.test','http://localhost.evil.test','https://zwiebelrostbraten.github.io:444']) assert.equal(allowedOrigin(o), false);
});
const req = (path='/lookup?q=amo', method='GET', origin='https://zwiebelrostbraten.github.io') => new Request('https://worker.test'+path, {method,headers:{Origin:origin}});
test('Worker fetches Navigium without caching and returns minimal no-store JSON', async () => {
  let calls=0;
  const res=await handleRequest(req(), async (url, options) => { calls++; assert.equal(url,'https://www.navigium.de/suchfunktion/_search?q=amo'); assert.equal(options.cache,'no-store'); assert.equal(new Headers(options.headers).get('cache-control'),'no-cache, no-store'); return Response.json([{searchItems:[item]}]); });
  assert.equal(calls,1); assert.equal(res.status,200); assert.equal(res.headers.get('cache-control'),'no-store'); assert.equal(res.headers.get('access-control-allow-origin'),'https://zwiebelrostbraten.github.io'); assert.equal((await res.json()).lemma,item.lemma);
});
test('preflight, forbidden origins, bad queries and routing never fetch upstream', async () => {
  const fail = () => { throw new Error('must not fetch'); };
  assert.equal((await handleRequest(req('/lookup','OPTIONS'),fail)).status,204);
  for (const [request,status] of [[req('/lookup?q=two+words'),400],[req('/lookup?q=amo&q=amas'),400],[req('/lookup?q=amo','GET','https://evil.test'),403],[req('/other'),404],[req('/lookup','POST'),405]]) {
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
test('preflight rejects foreign methods and headers and permits IPv6 development', async () => {
  const fetcher = () => assert.fail('preflight must not fetch');
  for (const headers of [
    {'Access-Control-Request-Method':'POST'},
    {'Access-Control-Request-Method':'GET', 'Access-Control-Request-Headers':'authorization'}
  ]) {
    const request = new Request('https://worker.test/lookup', {method:'OPTIONS', headers:{Origin:'http://[::1]:8080', ...headers}});
    const response = await handleRequest(request, fetcher);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const response = await handleRequest(new Request('https://worker.test/lookup', {method:'OPTIONS', headers:{Origin:'http://[::1]:8080', 'Access-Control-Request-Method':'GET'}}), fetcher);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://[::1]:8080');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('client cookies, authorization, referrer and extra parameters are never forwarded', async () => {
  let forwarded;
  const request = new Request('https://worker.test/lookup?q=amo&private=secret', {headers:{Cookie:'session=secret', Authorization:'Bearer secret', Referer:'https://private.test/text'}});
  const response = await handleRequest(request, async (url, options) => {
    forwarded = {url, headers:new Headers(options.headers)};
    return Response.json([{searchItems:[item]}]);
  });
  assert.equal(response.status, 200);
  assert.equal(forwarded.url, 'https://www.navigium.de/suchfunktion/_search?q=amo');
  for (const name of ['cookie','authorization','referer','origin']) assert.equal(forwarded.headers.get(name), null);
});
