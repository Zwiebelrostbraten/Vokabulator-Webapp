import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { mountApp } from '../assets/app.mjs';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const fixture=()=>({Nomen:[{lemma:'rosa f.',fields:{'Nom. Sg.':'rosa','Gen. Sg.':'rosae',Genus:'f.','Dekl.-Kl.':'a-Dekl.',Bedeutung:'Rose',Textbelege:'rosam'}}]});
const tick=()=>new Promise(r=>setTimeout(r,0));
function setup(options={}) {const dom=new JSDOM(html);const doc=dom.window.document;mountApp(doc,{authorize:async()=>undefined,download:()=>{},...options});return {doc,dom,$:id=>doc.getElementById(id)};}
test('native sliders expose defaults and synchronize numeric outputs on input and change',()=>{
  const {$,doc}=setup();
  for(const [id,min,max,initial,next] of [['parallel','1','128','64','128'],['meanings','1','3','1','3']]) {
    const slider=$(id),output=$(id+'-value');
    assert.equal(slider.type,'range');assert.equal(slider.min,min);assert.equal(slider.max,max);assert.equal(slider.step,'1');
    assert.equal(slider.value,initial);assert.equal(output.value,initial);assert.equal(output.htmlFor.value,id);
    assert.ok(doc.querySelector('label[for="'+id+'"]'));
    assert.ok($(slider.getAttribute('aria-describedby')));
    slider.value=next;slider.dispatchEvent(new doc.defaultView.Event('input'));assert.equal(output.value,next);
    slider.value=min;slider.dispatchEvent(new doc.defaultView.Event('change'));assert.equal(output.value,min);
  }
});
test('one authorization per run before generation, ticket passed to batch; failure prevents lookup',async()=>{
 const order=[];const {$}=setup({authorize:async()=>{order.push('authorize');return 'signed-ticket';},generate:async(_text,_base,options)=>{order.push('generate');assert.equal(options.ticket,'signed-ticket');return fixture();}});
 $('text').value='rosa rosam';$('generate').click();await tick();assert.deepEqual(order,['authorize','generate']);
 const broken=setup({authorize:async()=>{throw Error('Sicherheitsprüfung fehlgeschlagen.');},generate:async()=>assert.fail('generate')});broken.$('text').value='rosa';broken.$('generate').click();await tick();assert.match(broken.$('status').textContent,/Sicherheitsprüfung fehlgeschlagen/);assert.equal(broken.$('generate').disabled,false);
});
test('download filenames avoid reserved device names and filesystem byte limits',async()=>{
 const {exportFilename}=await import('../assets/app.mjs');
 assert.equal(exportFilename('CON','pdf'),'Vokabelliste-CON.pdf');assert.equal(exportFilename('A / B','apkg'),'A-B.apkg');assert.equal(exportFilename('','ods'),'Vokabelliste.ods');
 assert.ok(new TextEncoder().encode(exportFilename('學'.repeat(160),'xlsx')).length<=240);
});
test('starting a new query cancels a pending download even when that query is cancelled',async()=>{
 let run=0,finish;const downloads=[];const {$}=setup({xlsx:()=>new Uint8Array([1]),pdf:()=>new Promise(resolve=>{finish=resolve;}),download:(...a)=>downloads.push(a),generate:async(_t,_b,{signal})=>{if(!run++)return fixture();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
 $('text').value='rosa';$('generate').click();await tick();$('pdf').click();await tick();$('generate').click();await tick();$('cancel').click();await tick();finish(new Uint8Array([2]));await tick();assert.equal(downloads.length,0);assert.equal($('export-menu').hidden,false);$('pdf').click();await tick();assert.equal(downloads.length,1);
});

test('output-only Lernkarten: six formats, independent validation and preserved name/batch across empty failed cancelled runs',async()=>{
 let result=fixture();const downloads=[],names=[];const {$,doc}=setup({generate:async(_t,_b,{signal})=>{if(result==='cancel')return new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)));if(result instanceof Error)throw result;return result;},xlsx:g=>JSON.stringify(g),by2:(_g,n)=>{names.push(n);return n;},anki:(_g,n)=>{names.push(n);return n;},download:(...a)=>downloads.push(a)});
 assert.equal(doc.querySelector('#generator #lesson, #brainyoo, #anki'),null);assert.ok(doc.querySelector('#export-menu #lesson'));assert.equal($('export-menu').hidden,true);
 $('text').value='rosa';$('generate').click();await tick();assert.equal($('export-menu').hidden,false);
 for(const id of ['xlsx','ods','csv','pdf','by2','apkg'])assert.equal($(id).hidden,false);
 assert.equal($('by2').disabled,true);assert.equal($('apkg').disabled,true);for(const id of ['xlsx','ods','csv','pdf'])assert.equal($(id).disabled,false);assert.match($('lesson-help').textContent,/1–160/);assert.equal($('lesson').getAttribute('aria-invalid'),'true');
 const input=()=> $('lesson').dispatchEvent(new doc.defaultView.Event('input'));
 $('lesson').value='x'.repeat(161);input();assert.equal($('by2').disabled,true);$('generate').click();await tick();assert.match($('status').textContent,/Fertig:/);assert.equal($('by2').disabled,true);
 $('lesson').value='  Übung :: A  ';input();assert.equal($('by2').disabled,false);assert.equal($('apkg').disabled,false);assert.equal($('lesson').getAttribute('aria-invalid'),'false');
 for(const next of [{},Error('offline'),'cancel']){result=next;$('generate').click();await tick();if(next==='cancel'){$('cancel').click();await tick();}assert.equal($('lesson').value,'  Übung :: A  ');assert.equal($('by2').disabled,false);$('by2').click();$('apkg').click();await tick();}
 assert.deepEqual(names,Array(2).fill('  Übung :: A  '));assert.equal(downloads.length,6);
 $('lesson').value='Neu';input();$('apkg').click();await tick();assert.equal(names.at(-1),'Neu');assert.equal(downloads.at(-1)[1],'Neu.apkg');
 assert.ok(doc.querySelector('label[for="lesson"]'));assert.equal($('lesson').maxLength,160);assert.equal($('lesson-help').getAttribute('aria-live'),'polite');
});
test('footer links to Webapp repository with safe external navigation',()=>{const {doc}=setup();const link=doc.querySelector('footer a');assert.equal(link.href,'https://github.com/Zwiebelrostbraten/Vokabulator-Webapp');assert.match(link.textContent,/Webapp/);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');});
test('generation retains default filters, validation, logging and explicit independent spreadsheet download',async()=>{
 let calls=0;const downloads=[];const {$,doc}=setup({generate:async(_text,_base,options)=>{calls++;assert.equal(options.parallel,2);assert.equal(options.meanings,3);options.update(1,1);options.log('<img src=x>');return fixture();},xlsx:g=>JSON.stringify(g),download:(...a)=>downloads.push(a)});
 assert.equal(doc.documentElement.lang,'de');assert.equal(doc.querySelectorAll('[name="wordtype"]').length,9);assert.equal(doc.querySelectorAll('[name="wordtype"]:checked').length,3);
 $('all-types').click();assert.equal(doc.querySelectorAll('[name="wordtype"]:checked').length,9);doc.querySelector('[name="wordtype"]').click();assert.equal($('all-types').indeterminate,true);
 $('generate').click();await tick();assert.equal(calls,0);assert.match($('status').textContent,/Text/);
 $('text').value='rosam';$('parallel').max='129';$('parallel').value='129';$('generate').click();await tick();assert.equal(calls,0);
 $('parallel').value='2';$('meanings').value='3';for(const box of doc.querySelectorAll('[name="wordtype"]'))box.checked=false;$('generate').click();await tick();assert.equal(calls,0);
 doc.querySelector('[name="wordtype"]').checked=true;$('generate').click();assert.equal($('options').disabled,true);await tick();assert.equal(calls,1);assert.equal($('options').disabled,false);assert.equal($('progress').value,1);
 assert.equal($('log').querySelector('img'),null);assert.match($('log').textContent,/<img/);assert.equal(downloads.length,0);$('xlsx').click();assert.deepEqual(downloads,[[JSON.stringify(fixture()),'Vokabelliste.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']]);assert.equal($('count').textContent,'1 Vokabel · Nomen: 1');assert.equal(doc.querySelectorAll('textarea').length,1);
});
test('card downloads keep proprietary extensions and explicit format MIME types',async()=>{
 const downloads=[],payload=new Uint8Array([80,75,3,4]);
 const {$,doc}=setup({generate:async()=>fixture(),xlsx:()=>payload,by2:()=>payload,anki:()=>payload,download:(...args)=>downloads.push(args)});
 $('text').value='rosa';$('generate').click();await tick();
 $('lesson').value='Meine Lektion & Text';$('lesson').dispatchEvent(new doc.defaultView.Event('input'));
 for(const id of ['by2','apkg']){$(id).click();await tick();await tick();}
 assert.deepEqual(downloads,[[payload,'Meine-Lektion-Text.by2','application/x-brainyoo'],[payload,'Meine-Lektion-Text.apkg','application/x-anki']]);
});
