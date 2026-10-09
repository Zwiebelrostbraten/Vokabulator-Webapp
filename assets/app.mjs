import { authorizeBatch } from './security.mjs';
import { API_BASE_URL, TURNSTILE_SITE_KEY } from './config.mjs';
import { generateVocabulary } from './generate.mjs';
import { WORD_TYPES, prepareWords, validateOptions } from './vocabulary.mjs';
export function mountApp(doc,{generate=generateVocabulary,xlsx,by2,download,authorize=authorizeBatch,siteKey=TURNSTILE_SITE_KEY}={}) {
  const $=id=>doc.getElementById(id);
  let controller;
  const announce=message=>{$('status').textContent=message;};
  function refresh() {
    $('lesson').disabled=!$('brainyoo').checked;
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
      if($('brainyoo').checked && (!$('lesson').value.trim() || $('lesson').value.trim().length>160)) {$('lesson').focus();throw Error('Bitte einen Lektionsnamen für Brainyoo mit 1–160 Zeichen eingeben.');}
    } catch(error) {announce(error.message);return;}
    const brainyoo=$('brainyoo').checked,name=$('lesson').value.trim();
    controller=new AbortController();$('options').disabled=true;$('generate').disabled=true;$('cancel').hidden=false;$('log').textContent='';refresh();
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
      if(!count) { $('count').textContent='0 Vokabeln';announce('Keine Vokabeln gefunden. Prüfe den Text, die Wortarten und das Protokoll.');return; }
      const exports=(!xlsx || (brainyoo && !by2))?await import('./export.mjs'):{};
      controller.signal.throwIfAborted();
      save((xlsx || exports.toXlsx)(groups),'Vokabelliste.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      if(brainyoo)save((by2 || exports.toBrainyoo)(groups,name),(name.replace(/[^\p{L}\p{N}_-]+/gu,'-') || 'Vokabelliste')+'.by2','application/zip');
      const total=`${count} ${count===1?'Vokabel':'Vokabeln'}`;
      $('count').textContent=`${total} · ${WORD_TYPES.filter(type=>groups[type]?.length).map(type=>`${type}: ${groups[type].length}`).join(' · ')}`;
      announce(`Fertig: ${total} in ${((Date.now()-started)/1000).toFixed(1)} Sekunden. ${brainyoo?'Excel und Brainyoo':'Excel'}: Download gestartet.`);
    } catch(error) {announce(error.name==='AbortError'?'Abgebrochen. Kein weiterer Download gestartet.':error.message);}
    finally {controller=undefined;$('options').disabled=false;$('generate').disabled=false;$('cancel').hidden=true;refresh();}
  });
  $('cancel').addEventListener('click',()=>controller?.abort());
  const save=download || ((bytes,filename,type)=>{
    const url=URL.createObjectURL(new Blob([bytes],{type})),link=doc.createElement('a');link.href=url;link.download=filename;doc.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  refresh();
}
if(typeof document!=='undefined')mountApp(document);
