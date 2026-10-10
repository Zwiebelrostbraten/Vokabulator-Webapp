import { authorizeBatch } from './security.mjs';
import { API_BASE_URL, TURNSTILE_SITE_KEY } from './config.mjs';
import { generateVocabulary } from './generate.mjs';
import { WORD_TYPES, prepareWords, validateOptions } from './vocabulary.mjs';
export function exportFilename(name,extension) {
  let stem=name.replace(/[^\p{L}\p{N}_-]+/gu,'-') || 'Vokabelliste';
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem))stem='Vokabelliste-'+stem;
  while(new TextEncoder().encode(stem).length>220)stem=Array.from(stem).slice(0,-1).join('');
  return stem+'.'+extension;
}
export function mountApp(doc,{generate=generateVocabulary,xlsx,by2,anki,ods,csv,pdf,download,authorize=authorizeBatch,siteKey=TURNSTILE_SITE_KEY}={}) {
  const $=id=>doc.getElementById(id);
  let controller,completed,queryVersion=0;
  const announce=message=>{$('status').textContent=message;};
  function refresh() {
    $('lesson').disabled=!($('brainyoo').checked || $('anki').checked);
    $('lesson').required=!$('lesson').disabled;
    $('xlsx').disabled=!!controller;
    for(const id of ['by2','ods','csv','pdf','apkg'])$(id).disabled=!!controller;
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
  $('brainyoo').addEventListener('change',refresh);$('anki').addEventListener('change',refresh);syncAll();
  for(const id of ['parallel','meanings']) {
    const sync=()=>{$(id+'-value').value=$(id).value;};
    $(id).addEventListener('input',sync);
    $(id).addEventListener('change',sync);
    sync();
  }
  $('generator').noValidate=true;
  $('generator').addEventListener('submit',async event=>{
    event.preventDefault();if(controller)return;
    let options;
    try {
      prepareWords($('text').value);
      options=validateOptions({parallel:Number($('parallel').value),meanings:Number($('meanings').value),types:[...doc.querySelectorAll('[name="wordtype"]:checked')].map(b=>b.value)});
      if(($('brainyoo').checked || $('anki').checked) && (!$('lesson').value.trim() || $('lesson').value.trim().length>160)) {$('lesson').focus();throw Error('Bitte einen Lektions-/Stapelnamen mit 1–160 Zeichen eingeben.');}
    } catch(error) {announce(error.message);return;}
    const brainyoo=$('brainyoo').checked,ankiSelected=$('anki').checked,name=$('lesson').value.trim();
    queryVersion++;controller=new AbortController();$('progress').value=0;$('options').disabled=true;$('generate').disabled=true;$('cancel').hidden=false;$('log').textContent='';refresh();
    const started=Date.now();announce('Navigium wird abgefragt …');
    try {
      announce('Sicherheitsprüfung …');
      const ticket=await authorize(doc,API_BASE_URL,siteKey,{signal:controller.signal});
      controller.signal.throwIfAborted();
      const groups=await generate($('text').value,API_BASE_URL,{...options,ticket,signal:controller.signal,
        update:(done,total)=>{$('progress').value=done/total;announce(`${done} / ${total} Wortformen abgefragt.`);},
        log:message=>{$('log').append(doc.createTextNode(message+'\n'));}
      });
      controller.signal.throwIfAborted();
      $('progress').value=1;
      const count=Object.values(groups).reduce((n,rows)=>n+rows.length,0);
      if(!count) {announce('Keine Vokabeln gefunden. Prüfe den Text, die Wortarten und das Protokoll.'+(completed?' Die zuletzt erstellten Dateien bleiben verfügbar.':''));return; }
      const exports=(!xlsx || (brainyoo && !by2))?await import('./export.mjs'):{};
      controller.signal.throwIfAborted();
      const excel=(xlsx || exports.toXlsx)(groups);
      const cards=brainyoo?(by2 || exports.toBrainyoo)(groups,name):undefined;
      controller.signal.throwIfAborted();
      completed={excel,cards,name,brainyoo,ankiSelected,groups,cache:{}};
      $('export-menu').hidden=false;$('by2').hidden=!brainyoo;$('brainyoo-download').hidden=!brainyoo;$('apkg').hidden=!ankiSelected;$('anki-download').hidden=!ankiSelected;
      const total=`${count} ${count===1?'Vokabel':'Vokabeln'}`;
      $('count').textContent=`${total} · ${WORD_TYPES.filter(type=>groups[type]?.length).map(type=>`${type}: ${groups[type].length}`).join(' · ')}`;
      announce(`Fertig: ${total} in ${((Date.now()-started)/1000).toFixed(1)} Sekunden. Deine Dateien stehen zum Download bereit.`);
    } catch(error) {announce((error.name==='AbortError'?'Abgebrochen.':error.message)+(completed?' Die zuletzt erstellten Dateien bleiben verfügbar.':''));}
    finally {controller=undefined;$('options').disabled=false;$('generate').disabled=false;$('cancel').hidden=true;refresh();}
  });
  $('cancel').addEventListener('click',()=>controller?.abort());
  const save=download || ((bytes,filename,type)=>{
    const url=URL.createObjectURL(new Blob([bytes],{type})),link=doc.createElement('a');link.href=url;link.download=filename;doc.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const filename=exportFilename;
  $('xlsx').addEventListener('click',()=>{if(!controller && completed)save(completed.excel,filename(completed.name,'xlsx'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');});
  $('by2').addEventListener('click',()=>{if(!controller && completed?.brainyoo)save(completed.cards,filename(completed.name,'by2'),'application/zip');});
  for(const [id,helper,mime,custom] of [['ods','toOds','application/vnd.oasis.opendocument.spreadsheet',ods],['csv','toCsv','text/csv;charset=utf-8',csv],['pdf','toPdf','application/pdf',pdf],['apkg','toAnki','application/zip',anki]]) {
    $(id).addEventListener('click',async()=>{
      if(controller || !completed || (id==='apkg' && !completed.ankiSelected))return;
      const batch=completed,version=queryVersion;$(id).disabled=true;
      try {
        batch.cache[id] ??= Promise.resolve().then(async()=>{const exporter=custom || (await import('./export.mjs'))[helper];return exporter(batch.groups,batch.name || 'Vokabelliste');});
        const bytes=await batch.cache[id];
        if(!controller && completed===batch && version===queryVersion)save(bytes,filename(batch.name,id==='apkg'?'apkg':id),mime);
      } catch(error) {delete batch.cache[id];if(version===queryVersion)announce('Download fehlgeschlagen: '+error.message);}
      finally {$(id).disabled=!!controller;}
    });
  }
  refresh();
}
if(typeof document!=='undefined')mountApp(document);
