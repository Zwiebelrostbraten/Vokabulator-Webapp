import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVocabulary } from '../assets/generate.mjs';
const result={found:true,lemma:'rosa f.',meanings:['Rose'],wordType:'SUBST',classLabel:'',deponens:false,flexion:[]};
test('bounded parallel pool defaults to 64, deduplicates requests and reports every completion',async()=>{
  for(const parallel of [1,2,128,undefined]) {
    let active=0,peak=0; const urls=[],progress=[],logs=[];
    const groups=await generateVocabulary('Rosa rosa ROSAE sum', 'https://api.test/', {parallel,types:['Nomen'],update:(done,total)=>progress.push([done,total]),log:m=>logs.push(m),fetcher:async(url,options)=>{
      urls.push(url);active++;peak=Math.max(peak,active);assert.equal(options.cache,'no-store');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.redirect,'error');
      await new Promise(r=>setTimeout(r,5));active--;return Response.json(result);
    }});
    assert.equal(peak,Math.min(parallel??64,3));assert.equal(urls.length,3);
    assert.deepEqual(progress,[[0,3],[1,3],[2,3],[3,3]]);assert.equal(logs.length,3);
    assert.equal(groups.Nomen.length,1);assert.equal(groups.Nomen[0].fields.Textbelege,'rosa; rosae; sum');
  }
});
test('failure and missing result are logged and preserved as unknown without poisoning successes',async()=>{
  const logs=[];
  const groups=await generateVocabulary('rosa bad missing', 'https://api.test', {types:['Nomen','Unbekannt'],log:m=>logs.push(m),fetcher:async url=>url.endsWith('bad')?Response.json({error:'offline'},{status:502}):Response.json(url.endsWith('missing')?{found:false,meanings:[]}:result)});
  assert.equal(groups.Nomen.length,1);assert.equal(groups.Unbekannt.length,2);assert.ok(logs.some(m=>m.includes('offline')));assert.ok(logs.some(m=>m.includes('kein Treffer')));
});
test('invalid config, input and options fail before any fetch',async()=>{
  const fetcher=()=>assert.fail('fetch');
  await assert.rejects(generateVocabulary('rosa','__WORKER_URL__',{fetcher}),/konfiguriert/);
  await assert.rejects(generateVocabulary('rosa','https://api.test',{parallel:129,fetcher}));
  await assert.rejects(generateVocabulary('','https://api.test',{fetcher}));
});
test('malformed API paradigms are rejected, abort stops queued requests',async()=>{
  const logs=[];
  await generateVocabulary('rosa','https://api.test',{log:m=>logs.push(m),fetcher:async()=>Response.json({...result,flexion:[{form:'x',wort:[{}]}]})});
  assert.match(logs[0],/Ungültige API/);
  const controller=new AbortController();let calls=0;
  await assert.rejects(generateVocabulary('rosa rosae sum','https://api.test',{parallel:1,signal:controller.signal,fetcher:async()=>{calls++;controller.abort();return Response.json(result);}}),{name:'AbortError'});
  assert.equal(calls,1);
});
test('batch sends the same ticket in headers for each word without token revalidation',async()=>{
 let calls=0;const headers=[];
 await generateVocabulary('rosa amo','https://worker.test',{parallel:64,meanings:1,types:['Nomen'],ticket:'signed-ticket',fetcher:async(_url,options)=>{calls++;headers.push(new Headers(options.headers).get('Authorization'));return Response.json({found:false,meanings:[]});}});
 assert.equal(calls,2);assert.deepEqual(headers,['Bearer signed-ticket','Bearer signed-ticket']);
});
test('security rejection stops queued batch and surfaces German error instead of successful finish',async()=>{
 for(const status of [401,429,503]) {
 let calls=0;await assert.rejects(generateVocabulary('rosa amo sum','https://worker.test',{parallel:1,ticket:'ticket',fetcher:async()=>{calls++;return Response.json({error:'Bitte neu generieren oder eine Minute warten.'},{status});}}),/Bitte neu generieren/);assert.equal(calls,1);
 }
});
