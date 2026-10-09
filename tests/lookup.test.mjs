import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupRows, applyResult, isConfigured } from '../assets/lookup.mjs';
const result={query:'amo',found:true,lemma:'amāre',meanings:['lieben'],wordType:'VERB',classLabel:'a-Konjugation'};
test('placeholder reports configuration error without false success or fetch', async()=>{
  assert.equal(isConfigured('__WORKER_URL__'),false);
  const rows=[{word:'amo'}]; await lookupRows(rows,'__WORKER_URL__',{fetcher:()=>assert.fail('fetch')}); assert.equal(rows[0].lookupState,'error'); assert.match(rows[0].lookupMessage,/nicht konfiguriert/);
});
test('distinct words are sequential, delayed 1200ms and uncached; duplicates share current result',async()=>{
  const rows=[{word:'amo'},{word:'AMO'},{word:'sum'}], events=[];
  await lookupRows(rows,'https://worker.test',{sleep:async ms=>events.push(ms),fetcher:async(url,options)=>{events.push(url);assert.equal(options.cache,'no-store');return Response.json(result);}});
  assert.deepEqual(events,['https://worker.test/lookup?q=amo',1200,'https://worker.test/lookup?q=sum']);
  assert.ok(rows.every(r=>r.lookupState==='found')); assert.equal(rows[1].translation,'lieben');
});
test('no results and errors retain editable fields; user edits during a request survive',async()=>{
  const row={word:'amo',translation:'mine',note:'my note'};
  applyResult(row,{found:false}, {translation:'',note:''}); assert.equal(row.translation,'mine'); assert.equal(row.note,'my note');
  await lookupRows([row],'https://worker.test',{fetcher:async()=>{row.translation='edited';return Response.json(result);}});
  assert.equal(row.translation,'edited'); assert.equal(row.note,'my note');
  await lookupRows([row],'https://worker.test',{fetcher:async()=>Response.json({error:'offline'},{status:502})}); assert.equal(row.lookupState,'error'); assert.equal(row.translation,'edited');
});
test('word changed during request cannot receive stale vocabulary',async()=>{
  const row={word:'amo',translation:'',note:''}; await lookupRows([row],'https://worker.test',{fetcher:async()=>{row.word='sum';return Response.json(result);}}); assert.equal(row.translation,''); assert.equal(row.lookupState,'idle');
});
test('combining marks in Unicode words reach the API', async () => {
  const row = {word:'māter\u0304'};
  let calls = 0;
  await lookupRows([row], 'https://worker.test', {fetcher:async () => { calls++; return Response.json(result); }});
  assert.equal(calls, 1);
  assert.equal(row.lookupState, 'found');
});
test('words edited while queued are not sent or overwritten', async () => {
  const rows = [{word:'amo'}, {word:'sum'}], urls = [];
  await lookupRows(rows, 'https://worker.test', {sleep:async()=>{}, fetcher:async url => {
    urls.push(url); rows[1].word = 'esse'; return Response.json(result);
  }});
  assert.deepEqual(urls, ['https://worker.test/lookup?q=amo']);
  assert.equal(rows[1].lookupState, 'idle');
  assert.equal(rows[1].translation, undefined);
});
test('browser lookup omits credentials and referrer and rejects redirects', async () => {
  let options;
  await lookupRows([{word:'amo'}], 'https://worker.test', {fetcher:async (url, supplied) => {
    options = supplied; return Response.json(result);
  }});
  assert.equal(options.credentials, 'omit');
  assert.equal(options.referrerPolicy, 'no-referrer');
  assert.equal(options.redirect, 'error');
});
test('malformed optional API fields cannot populate editable notes', async () => {
  const row = {word:'amo', translation:'', note:''};
  await lookupRows([row], 'https://worker.test', {fetcher:async()=>Response.json({...result, wordType:{private:'data'}})});
  assert.equal(row.lookupState, 'error');
  assert.equal(row.translation, '');
  assert.equal(row.note, '');
});
