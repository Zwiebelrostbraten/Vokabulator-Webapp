import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { authorizeBatch, turnstileToken } from '../assets/security.mjs';
const setup=()=>new JSDOM('<form id="generator"></form>').window.document;
const tick=()=>new Promise(r=>setTimeout(r,0));
test('unconfigured Turnstile never loads script or sends a request',async()=>{
 const doc=setup();for(const key of ['', '__TURNSTILE_SITE_KEY__'])await assert.rejects(authorizeBatch(doc,'https://worker.test',key,{fetcher:()=>assert.fail('fetch')}),/nicht konfiguriert/);
 assert.equal(doc.querySelector('script'),null);
});
test('configured widget loads explicitly, exchanges one token, removes widget; new run renders fresh',async()=>{
 const doc=setup();let options,removed=0,rendered=0;
 const fetcher=async(url,config)=>{assert.equal(url,'https://worker.test/session');assert.equal(config.method,'POST');assert.deepEqual(JSON.parse(config.body),{token:'one-use'});assert.equal(config.credentials,'omit');assert.equal(config.redirect,'error');assert.equal(config.referrerPolicy,'no-referrer');assert.equal(config.cache,'no-store');return Response.json({ticket:'signed-ticket'});};
 const first=authorizeBatch(doc,'https://worker.test/','public-sitekey',{fetcher});
 const script=doc.querySelector('script');assert.equal(script.src,'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
 doc.defaultView.turnstile={render:(_container,config)=>{options=config;rendered++;return 7;},remove:id=>{assert.equal(id,7);removed++;}};
 script.onload();assert.equal(options.sitekey,'public-sitekey');assert.equal(options.action,'vocabulary');options.callback('one-use');assert.equal(await first,'signed-ticket');assert.equal(removed,1);
 const second=authorizeBatch(doc,'https://worker.test','public-sitekey',{fetcher});options.callback('one-use');assert.equal(await second,'signed-ticket');assert.equal(rendered,2);assert.equal(removed,2);assert.equal(doc.getElementById('generator').children.length,0);
});
test('challenge errors/expiry, failed exchange and abort prevent lookup and clean widget',async()=>{
 for(const callback of ['error-callback','expired-callback']) {
 const doc=setup();let options;doc.defaultView.turnstile={render:(_el,config)=>{options=config;return 1;},remove:()=>{}};
 const p=authorizeBatch(doc,'https://worker.test','public-sitekey',{fetcher:()=>assert.fail('fetch')});options[callback]();await assert.rejects(p,/Sicherheitsprüfung/);assert.equal(doc.getElementById('generator').children.length,0);
 }
 const doc=setup(),controller=new AbortController();const p=turnstileToken(doc,'public-sitekey',controller.signal);controller.abort();await assert.rejects(p,{name:'AbortError'});assert.equal(doc.getElementById('generator').children.length,0);
 doc.defaultView.turnstile={render:(_el,config)=>{setTimeout(()=>config.callback('token'),0);return 1;},remove:()=>{}};
 await assert.rejects(authorizeBatch(doc,'https://worker.test','public-sitekey',{fetcher:async()=>Response.json({error:'Zu viele Sicherheitsprüfungen.'},{status:429})}),/Zu viele/);
 await tick();
});
test('missing Worker URL prevents challenge; network or malformed exchange gives concise German error',async()=>{
 const doc=setup();await assert.rejects(authorizeBatch(doc,'__WORKER_URL__','public-key',{signal:AbortSignal.timeout(10)}),/Worker-URL fehlt/);assert.equal(doc.querySelector('script'),null);
 doc.defaultView.turnstile={render:(_el,config)=>{setTimeout(()=>config.callback('token'),0);return 1;},remove:()=>{}};
 for(const fetcher of [async()=>{throw TypeError('Failed to fetch');},async()=>new Response('oops')])await assert.rejects(authorizeBatch(doc,'https://worker.test','public-key',{fetcher}),/Sicherheitsdienst nicht erreichbar/);
});
test('successful exchange with null or missing ticket is rejected in German',async()=>{
 const doc=setup();doc.defaultView.turnstile={render:(_el,options)=>{setTimeout(()=>options.callback('token'),0);return 1;},remove:()=>{}};
 for(const body of [null,{}, {ticket:''},{ticket:'x'.repeat(2049)}])await assert.rejects(authorizeBatch(doc,'https://worker.test','public-key',{fetcher:async()=>Response.json(body)}),/Ungültige Sicherheitsantwort/);
});
