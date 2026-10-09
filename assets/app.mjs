import { authorizeBatch } from './security.mjs';
import { API_BASE_URL, TURNSTILE_SITE_KEY } from './config.mjs';
import { generateVocabulary } from './generate.mjs';
import { WORD_TYPES, prepareWords, validateOptions } from './vocabulary.mjs';
export function mountApp(doc,{generate=generateVocabulary,xlsx,by2,download,authorize=authorizeBatch,siteKey=TURNSTILE_SITE_KEY}={}) {
  const $=id=>doc.getElementById(id);
  let groups={},controller;
  const announce=message=>{$('status').textContent=message;};
  const count=()=>Object.values(groups).reduce((n,rows)=>n+rows.length,0);
  function refresh() {
    $('xlsx').disabled=Boolean(controller)||!count();
    $('by2').disabled=Boolean(controller)||!count()||!$('brainyoo').checked;
    $('lesson').disabled=!$('brainyoo').checked;
    $('count').textContent=`${count()} Vokabeln`;
  }
  function syncAll() {
    const boxes=[...doc.querySelectorAll('[name="wordtype"]')];
    $('all-types').checked=boxes.every(b=>b.checked);
    $('all-types').indeterminate=!$('all-types').checked && boxes.some(b=>b.checked);
  }
  WORD_TYPES.forEach((type,index)=>{
    const label=doc.createElement('label');label.className='check';
    const box=doc.createElement('input');box.type='checkbox';box.name='wordtype';box.value=type;box.checked=index<3;
    box.addEventListener('change',syncAll);label.append(box,doc.createTextNode(type));$('wordtypes').append(label);
  });
  $('all-types').addEventListener('change',()=>{for(const box of doc.querySelectorAll('[name="wordtype"]'))box.checked=$('all-types').checked;syncAll();});
  $('brainyoo').addEventListener('change',refresh);syncAll();
  function render() {
    $('results').replaceChildren();
    for(const type of WORD_TYPES) {
      const rows=groups[type] || [];if(!rows.length)continue;
      const section=doc.createElement('section');section.className='result-group';
      const heading=doc.createElement('h3');heading.textContent=`${type} · ${rows.length}`;section.append(heading);
      for(const row of rows) {
        const article=doc.createElement('article');article.className='result-card';
        const title=doc.createElement('h4');title.textContent=row.lemma;article.append(title);
        const fields=doc.createElement('div');fields.className='result-fields';
        for(const [key,value] of Object.entries(row.fields)) {
          const label=doc.createElement('label');label.textContent=key;
          const input=doc.createElement('textarea');input.rows=2;input.maxLength=6000;input.value=value;input.dataset.field=key;
          input.setAttribute('aria-label',`${key} – ${row.lemma}`);input.autocomplete='off';
          input.addEventListener('input',()=>{row.fields[key]=input.value;});label.append(input);fields.append(label);
        }
        article.append(fields);
        const remove=doc.createElement('button');remove.type='button';remove.textContent='Vokabel entfernen';remove.dataset.delete='';remove.setAttribute('aria-label',`${row.lemma} entfernen`);
        remove.addEventListener('click',()=>{
          const index=groups[type].indexOf(row);groups[type].splice(index,1);render();announce(`${row.lemma} entfernt.`);
          ($('results').querySelector('[data-delete]') || $('generate')).focus();
        });article.append(remove);section.append(article);
      }
      $('results').append(section);
    }
    if(!count()) {const empty=doc.createElement('p');empty.className='empty';empty.textContent='Keine Vokabeln vorhanden. Prüfe den Text, die Wortarten und das Protokoll.';$('results').append(empty);}
    refresh();
  }
  $('generator').noValidate=true;
  $('generator').addEventListener('submit',async event=>{
    event.preventDefault();if(controller)return;
    let options;
    try {
      prepareWords($('text').value);
      options=validateOptions({parallel:Number($('parallel').value),meanings:Number($('meanings').value),types:[...doc.querySelectorAll('[name="wordtype"]:checked')].map(b=>b.value)});
      if($('brainyoo').checked && !$('lesson').value.trim()) {$('lesson').focus();throw Error('Bitte einen Lektionsnamen für Brainyoo eingeben.');}
    } catch(error) {announce(error.message);return;}
    controller=new AbortController();$('options').disabled=true;$('generate').disabled=true;$('cancel').hidden=false;$('log').textContent='';refresh();
    const started=Date.now();announce('Navigium wird abgefragt …');
    try {
      announce('Sicherheitsprüfung …');
      const ticket=await authorize(doc,API_BASE_URL,siteKey,{signal:controller.signal});
      controller.signal.throwIfAborted();
      groups=await generate($('text').value,API_BASE_URL,{...options,ticket,signal:controller.signal,
        update:(done,total)=>{$('progress').value=done/total;announce(`${done} / ${total} Wortformen abgefragt.`);},
        log:message=>{$('log').append(doc.createTextNode(message+'\n'));}
      });
      $('progress').value=1;render();announce(`Fertig: ${count()} Vokabeln in ${((Date.now()-started)/1000).toFixed(1)} Sekunden. Bitte Ergebnisse prüfen.`);
    } catch(error) {announce(error.name==='AbortError'?'Abgebrochen. Die vorherigen Ergebnisse bleiben erhalten.':error.message);}
    finally {controller=undefined;$('options').disabled=false;$('generate').disabled=false;$('cancel').hidden=true;refresh();}
  });
  $('cancel').addEventListener('click',()=>controller?.abort());
  const save=download || ((bytes,filename,type)=>{
    const url=URL.createObjectURL(new Blob([bytes],{type})),link=doc.createElement('a');link.href=url;link.download=filename;doc.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  for(const format of ['xlsx','by2']) $(''+format).addEventListener('click',async()=>{
    if(controller || !count())return;
    try {
      const exports=(!xlsx || !by2)?await import('./export.mjs'):{};
      const name=$('lesson').value.trim();
      const bytes=format==='xlsx'?(xlsx || exports.toXlsx)(groups):(by2 || exports.toBrainyoo)(groups,name);
      const filename=format==='xlsx'?'Vokabelliste.xlsx':(name.replace(/[^\p{L}\p{N}_-]+/gu,'-') || 'Vokabelliste')+'.by2';
      save(bytes,filename,format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/zip');
      announce(`${format==='xlsx'?'Excel':'Brainyoo'} heruntergeladen.`);
    } catch(error) {announce(error.message);}
  });
  refresh();
}
if(typeof document!=='undefined')mountApp(document);
