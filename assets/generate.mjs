import { isConfigured } from './lookup.mjs';
import { buildVocabulary, prepareWords, validateOptions } from './vocabulary.mjs';
function validResult(result) {
  return typeof result?.found==='boolean' && Array.isArray(result.meanings) && (!result.found ||
    (typeof result.lemma==='string' && result.lemma.length>0 && typeof result.wordType==='string' && typeof result.classLabel==='string' && typeof result.deponens==='boolean' && result.meanings.length>0 && result.meanings.length<=20 && result.meanings.every(m=>typeof m==='string' && m.length<=500) &&
    Array.isArray(result.flexion) && result.flexion.length<=100 && result.flexion.every(f=>typeof f?.form==='string' && f.form.length<=150 && Array.isArray(f.wort) && f.wort.length<=8 && f.wort.every(w=>typeof w==='string' && w.length<=150))));
}
export async function generateVocabulary(text,base,{fetcher=fetch,update=()=>{},log=()=>{},signal,ticket,...options}={}) {
  const config=validateOptions(options),words=prepareWords(text);
  if (!isConfigured(base)) throw Error('API nicht konfiguriert: Worker-URL fehlt.');
  const records=new Array(words.length); let next=0,completed=0,fatal;
  update(0,words.length);
  async function work() {
    while(next<words.length && !fatal) {
      signal?.throwIfAborted();
      const index=next++,word=words[index];
      try {
        const response=await fetcher(base.replace(/\/$/,'')+'/lookup?q='+encodeURIComponent(word),{headers:ticket?{Authorization:'Bearer '+ticket}:{},cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
        const result=await response.json();
        signal?.throwIfAborted();
        if([401,429,503].includes(response.status)) {fatal=Error(result.error || 'Sicherheitsprüfung fehlgeschlagen. Bitte erneut versuchen.');return;}
        if(!response.ok)throw Error(result.error || `API-Fehler (${response.status}).`);
        if(!validResult(result))throw Error('Ungültige API-Antwort.');
        records[index]={word,result};log(`${word}: ${result.found?'Treffer – '+result.lemma:'kein Treffer'}`);
      } catch(error) {
        signal?.throwIfAborted();
        records[index]={word,result:{found:false,meanings:[]}};
        log(`${word}: ${error.name==='TimeoutError'?'Zeitüberschreitung':error.message}`);
      }
      update(++completed,words.length);
    }
  }
  await Promise.all(Array.from({length:Math.min(config.parallel,words.length)},work));
  signal?.throwIfAborted();
  if(fatal)throw fatal;
  return buildVocabulary(records,config);
}
