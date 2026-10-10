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
  const announce=(message,state='running')=>{
    $('status').textContent=message;
    $('status').dataset.state=state;
  };
  const updateCharacterCount=()=>{
    $('text-count').textContent=`${$('text').value.length.toLocaleString('de-DE')} / 100.000 Zeichen`;
  };
  $('text').addEventListener('input',updateCharacterCount);
  updateCharacterCount();
  function refresh() {
    const valid=!!$('lesson').value.trim() && $('lesson').value.length<=160;
    $('lesson').setAttribute('aria-invalid',String($('lesson').value.length>160));
    $('lesson-help').textContent=valid?'Der Name gilt für Brainyoo und Anki.':'Bitte einen Lektions-/Stapelnamen mit 1–160 Zeichen eingeben, um Lernkarten herunterzuladen.';
    for(const id of ['xlsx','ods','csv','pdf'])$(id).disabled=!!controller;
    for(const id of ['by2','apkg'])$(id).disabled=!!controller || !valid;
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
  $('lesson').addEventListener('input',refresh);syncAll();
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
    } catch(error) {announce(error.message,'error');return;}
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
      if(!count) {announce('Keine Vokabeln gefunden. Prüfe den Text, die Wortarten und das Protokoll.'+(completed?' Die zuletzt erstellten Dateien bleiben verfügbar.':''),'error');return; }
      const exports=!xlsx?await import('./export.mjs'):{};
      controller.signal.throwIfAborted();
      const excel=(xlsx || exports.toXlsx)(groups);
      controller.signal.throwIfAborted();
      completed={excel,groups,cache:{}};
      $('export-menu').hidden=false;
      const total=`${count} ${count===1?'Vokabel':'Vokabeln'}`;
      $('count').textContent=`${total} · ${WORD_TYPES.filter(type=>groups[type]?.length).map(type=>`${type}: ${groups[type].length}`).join(' · ')}`;
      announce(`Fertig: ${total} in ${((Date.now()-started)/1000).toFixed(1)} Sekunden. Deine Dateien stehen zum Download bereit.`,'success');
    } catch(error) {announce((error.name==='AbortError'?'Abgebrochen.':error.message)+(completed?' Die zuletzt erstellten Dateien bleiben verfügbar.':''),error.name==='AbortError'?'cancelled':'error');}
    finally {controller=undefined;$('options').disabled=false;$('generate').disabled=false;$('cancel').hidden=true;refresh();}
  });
  $('cancel').addEventListener('click',()=>controller?.abort());
  const save=download || ((bytes,filename,type)=>{
    const url=URL.createObjectURL(new Blob([bytes],{type})),link=doc.createElement('a');link.href=url;link.download=filename;doc.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const filename=exportFilename;
  $('xlsx').addEventListener('click',()=>{if(!controller && completed)save(completed.excel,filename('','xlsx'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');});

  for(const [id,helper,mime,custom] of [['by2','toBrainyoo','application/x-brainyoo',by2],['ods','toOds','application/vnd.oasis.opendocument.spreadsheet',ods],['csv','toCsv','text/csv;charset=utf-8',csv],['pdf','toPdf','application/pdf',pdf],['apkg','toAnki','application/x-anki',anki]]) {
    $(id).addEventListener('click',async()=>{
      const cards=id==='by2' || id==='apkg',name=cards?$('lesson').value:'';
      if(controller || !completed || (cards && (!name.trim() || name.length>160)))return;
      const batch=completed,version=queryVersion,cacheKey=id+'\0'+name;$(id).disabled=true;
      try {
        batch.cache[cacheKey] ??= Promise.resolve().then(async()=>{const exporter=custom || (await import('./export.mjs'))[helper];return exporter(batch.groups,cards?name:'Vokabelliste');});
        const bytes=await batch.cache[cacheKey];
        if(!controller && completed===batch && version===queryVersion)save(bytes,filename(name,id),mime);
      } catch(error) {delete batch.cache[cacheKey];if(version===queryVersion)announce('Download fehlgeschlagen: '+error.message,'error');}
      finally {refresh();}
    });
  }
  refresh();
}
if(typeof document!=='undefined')mountApp(document);
