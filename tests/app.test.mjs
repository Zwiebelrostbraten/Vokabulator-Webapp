import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { mountApp } from '../assets/app.mjs';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const fixture=()=>({Nomen:[{lemma:'rosa f.',fields:{'Nom. Sg.':'rosa','Gen. Sg.':'rosae',Genus:'f.','Dekl.-Kl.':'a-Dekl.',Bedeutung:'Rose',Textbelege:'rosam'}}]});
const tick=()=>new Promise(r=>setTimeout(r,0));
function setup(options={}) {const dom=new JSDOM(html);const doc=dom.window.document;mountApp(doc,{authorize:async()=>undefined,download:()=>{},...options});return {doc,dom,$:id=>doc.getElementById(id)};}
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
test('successful generation directly downloads original Excel and optional Brainyoo with filenames and MIME types',async()=>{
  const calls=[],downloads=[];
  const {$,doc}=setup({generate:async(text,base,options)=>{calls.push({text,options});options.update(1,2);options.log('<img src=x onerror=evil()>');return fixture();},xlsx:groups=>JSON.stringify(groups),by2:(groups,name)=>name,download:(...args)=>downloads.push(args)});
  $('text').value='rosam';$('parallel').value='2';$('meanings').value='3';$('brainyoo').click();$('lesson').value='Meine Lektion';
  $('generate').click();assert.equal($('options').disabled,true);await tick();
  assert.equal(calls[0].text,'rosam');assert.equal(calls[0].options.parallel,2);assert.equal(calls[0].options.meanings,3);
  assert.equal($('options').disabled,false);assert.equal($('progress').value,1);
  assert.equal($('log').querySelector('img'),null);assert.match($('log').textContent,/<img/);
  assert.deepEqual(downloads,[
    [JSON.stringify(fixture()),'Vokabelliste.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['Meine Lektion','Meine-Lektion.by2','application/zip']
  ]);
  assert.match($('status').textContent,/1 Vokabel.*Excel.*Brainyoo.*Download/);
  assert.equal($('count').textContent,'1 Vokabel · Nomen: 1');
  assert.match($('status').textContent,/Fertig: 1 Vokabel in/);
  assert.equal(doc.querySelector('#results, [data-field], [data-delete], #xlsx, #by2, .export-bar'),null);
  assert.equal(doc.querySelectorAll('textarea').length,1);
});
test('invalid input, filters, numeric values and lesson prevent requests; errors are announced',async()=>{
  let calls=0;const {$,doc}=setup({generate:async()=>{calls++;throw Error('offline');}});
  $('generate').click();await tick();assert.equal(calls,0);assert.match($('status').textContent,/Text/);
  $('text').value='rosa';$('parallel').max='129';$('parallel').value='129';$('generate').click();await tick();assert.equal(calls,0);
  $('parallel').value='64';for(const box of doc.querySelectorAll('[name="wordtype"]'))box.checked=false;
  $('generate').click();await tick();assert.equal(calls,0);
  doc.querySelector('[name="wordtype"]').checked=true;$('brainyoo').click();$('generate').click();await tick();assert.equal(calls,0);
  $('lesson').value='Lektion';$('generate').click();await tick();assert.equal(calls,1);assert.match($('status').textContent,/offline/);assert.equal($('generate').disabled,false);
});
test('Excel alone downloads automatically; cancellation never downloads again',async()=>{
  let run=0;const downloads=[];
  const {$}=setup({xlsx:()=>new Uint8Array([1]),by2:()=>assert.fail('optional export'),download:(...args)=>downloads.push(args),generate:async(text,base,{signal})=>{
    if(!run++)return fixture();
    return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  }});
  $('text').value='rosa';$('generate').click();await tick();assert.equal(downloads.length,1);
  assert.equal(downloads[0][1],'Vokabelliste.xlsx');
  $('generate').click();await tick();$('cancel').click();await tick();
  assert.match($('status').textContent,/Abgebrochen/);assert.equal(downloads.length,1);assert.equal($('generate').disabled,false);
});
test('invalid Brainyoo lesson length prevents authorization, generation and downloads',async()=>{
  const {$}=setup({authorize:()=>assert.fail('authorize'),generate:()=>assert.fail('generate'),download:()=>assert.fail('download')});
  $('text').value='rosa';$('brainyoo').click();$('lesson').value='a'.repeat(161);
  $('generate').click();await tick();
  assert.match($('status').textContent,/1–160 Zeichen/);
  assert.equal($('generate').disabled,false);
});
test('one authorization per run before generation, ticket passed to batch; failure prevents lookup',async()=>{
 const order=[];const {$}=setup({authorize:async()=>{order.push('authorize');return 'signed-ticket';},generate:async(_text,_base,options)=>{order.push('generate');assert.equal(options.ticket,'signed-ticket');return fixture();}});
 $('text').value='rosa rosam';$('generate').click();await tick();assert.deepEqual(order,['authorize','generate']);
 const broken=setup({authorize:async()=>{throw Error('Sicherheitsprüfung fehlgeschlagen.');},generate:async()=>assert.fail('generate')});broken.$('text').value='rosa';broken.$('generate').click();await tick();assert.match(broken.$('status').textContent,/Sicherheitsprüfung fehlgeschlagen/);assert.equal(broken.$('generate').disabled,false);
});
