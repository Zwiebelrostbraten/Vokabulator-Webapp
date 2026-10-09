import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { mountApp } from '../assets/app.mjs';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const fixture=()=>({Nomen:[{lemma:'rosa f.',fields:{'Nom. Sg.':'rosa','Gen. Sg.':'rosae',Genus:'f.','Dekl.-Kl.':'a-Dekl.',Bedeutung:'Rose',Textbelege:'rosam'}}]});
const tick=()=>new Promise(r=>setTimeout(r,0));
function setup(options={}) {const dom=new JSDOM(html);const doc=dom.window.document;mountApp(doc,{authorize:async()=>undefined,...options});return {doc,dom,$:id=>doc.getElementById(id)};}
test('German accessible original controls, defaults, select-all synchronization and optional lesson',()=>{
  const {$,doc}=setup();assert.equal(doc.documentElement.lang,'de');
  assert.equal($('parallel').min,'1');assert.equal($('parallel').max,'128');assert.equal($('parallel').value,'64');
  assert.equal($('meanings').max,'3');assert.equal($('meanings').value,'1');
  assert.equal(doc.querySelectorAll('[name="wordtype"]').length,9);
  assert.equal(doc.querySelectorAll('[name="wordtype"]:checked').length,3);
  $('all-types').click();assert.equal(doc.querySelectorAll('[name="wordtype"]:checked').length,9);
  doc.querySelector('[name="wordtype"]').click();assert.equal($('all-types').checked,false);assert.equal($('all-types').indeterminate,true);
  assert.equal($('lesson').disabled,true);$('brainyoo').click();assert.equal($('lesson').disabled,false);
});
test('generation snapshots options, displays progress/log and grouped editable fields; export uses edits and deletion',async()=>{
  const calls=[],downloads=[];
  const {$,doc}=setup({generate:async(text,base,options)=>{calls.push({text,options});options.update(1,2);options.log('<img src=x onerror=evil()>');return fixture();},xlsx:groups=>JSON.stringify(groups),by2:(groups,name)=>name,download:(...args)=>downloads.push(args)});
  $('text').value='rosam';$('parallel').value='2';$('meanings').value='3';$('brainyoo').click();$('lesson').value='Meine Lektion';
  $('generate').click();assert.equal($('options').disabled,true);await tick();
  assert.equal(calls[0].text,'rosam');assert.equal(calls[0].options.parallel,2);assert.equal(calls[0].options.meanings,3);
  assert.equal($('options').disabled,false);assert.equal($('progress').value,1);
  assert.match($('status').textContent,/1 Vokabel/);assert.equal($('log').querySelector('img'),null);assert.match($('log').textContent,/<img/);
  assert.match($('results').textContent,/Nomen/);assert.ok(doc.querySelector('[data-field="Bedeutung"]'));
  const input=doc.querySelector('[data-field="Bedeutung"]');input.value='eigene Übersetzung';input.dispatchEvent(new doc.defaultView.Event('input'));
  $('xlsx').click();await tick();assert.match(downloads[0][0],/eigene Übersetzung/);assert.equal(downloads[0][1],'Vokabelliste.xlsx');
  $('by2').click();await tick();assert.equal(downloads[1][0],'Meine Lektion');assert.equal(downloads[1][1],'Meine-Lektion.by2');
  doc.querySelector('[data-delete]').click();assert.equal($('xlsx').disabled,true);
});
test('invalid input, filters, numeric values and lesson prevent requests; errors are announced',async()=>{
  let calls=0;const {$,doc}=setup({generate:async()=>{calls++;throw Error('offline');}});
  $('generate').click();await tick();assert.equal(calls,0);assert.match($('status').textContent,/Text/);
  $('text').value='rosa';$('parallel').value='129';$('generate').click();await tick();assert.equal(calls,0);
  $('parallel').value='64';for(const box of doc.querySelectorAll('[name="wordtype"]'))box.checked=false;
  $('generate').click();await tick();assert.equal(calls,0);
  doc.querySelector('[name="wordtype"]').checked=true;$('brainyoo').click();$('generate').click();await tick();assert.equal(calls,0);
  $('lesson').value='Lektion';$('generate').click();await tick();assert.equal(calls,1);assert.match($('status').textContent,/offline/);assert.equal($('generate').disabled,false);
});
test('cancel preserves previous reviewed results; changing export option enables BY2',async()=>{
  let run=0;const {$}=setup({generate:async(text,base,{signal})=>{if(!run++)return fixture();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
  $('text').value='rosa';$('generate').click();await tick();assert.equal($('xlsx').disabled,false);
  $('brainyoo').click();$('lesson').value='Lektion';assert.equal($('by2').disabled,false);
  $('generate').click();$('cancel').click();await tick();assert.match($('status').textContent,/Abgebrochen/);assert.equal($('xlsx').disabled,false);assert.equal($('results').querySelector('[data-field="Bedeutung"]').value,'Rose');
});
test('one authorization per run before generation, ticket passed to batch; failure prevents lookup',async()=>{
 const order=[];const {$}=setup({authorize:async()=>{order.push('authorize');return 'signed-ticket';},generate:async(_text,_base,options)=>{order.push('generate');assert.equal(options.ticket,'signed-ticket');return fixture();}});
 $('text').value='rosa rosam';$('generate').click();await tick();assert.deepEqual(order,['authorize','generate']);
 const broken=setup({authorize:async()=>{throw Error('Sicherheitsprüfung fehlgeschlagen.');},generate:async()=>assert.fail('generate')});broken.$('text').value='rosa';broken.$('generate').click();await tick();assert.match(broken.$('status').textContent,/Sicherheitsprüfung fehlgeschlagen/);assert.equal(broken.$('generate').disabled,false);
});
