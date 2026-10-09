import { tokenize } from './core.mjs';
export const WORD_TYPES = ['Nomen','Verben','Adjektive','Pronomen','Präpositionen','Adverbien','Konjunktionen','Subjunktionen','Unbekannt'];
const types = {SUBST:'Nomen',VERB:'Verben',ADJ:'Adjektive',PRON:'Pronomen',PRAEP:'Präpositionen',ADV:'Adverbien',KONJ:'Konjunktionen',SUBJ:'Subjunktionen'};
const singular = {Präpositionen:'Präposition',Adverbien:'Adverb',Konjunktionen:'Konjunktion',Subjunktionen:'Subjunktion',Unbekannt:'Unbekannt'};
export function validateOptions({parallel=64,meanings=1,types=WORD_TYPES.slice(0,3)}={}) {
  if (!Number.isInteger(parallel) || parallel<1 || parallel>128) throw Error('Parallele Anfragen: bitte 1–128 wählen.');
  if (!Number.isInteger(meanings) || meanings<1 || meanings>3) throw Error('Bedeutungen: bitte 1–3 wählen.');
  if (!Array.isArray(types) || !types.length || types.some(t=>!WORD_TYPES.includes(t))) throw Error('Bitte mindestens eine gültige Wortart wählen.');
  return {parallel,meanings,types:[...new Set(types)]};
}
export function prepareWords(text) {
  if (text.length>100000) throw Error('Bitte höchstens 100.000 Zeichen eingeben.');
  const words=[...new Set(tokenize(text).map(w=>w.toLowerCase()))];
  if (!words.length) throw Error('Bitte einen lateinischen Text eingeben.');
  if (words.length>3000 || words.some(w=>[...w].length>100)) throw Error('Höchstens 3.000 verschiedene Wörter mit je 100 Zeichen sind erlaubt.');
  return words;
}
const clean = value => String(value || '').replaceAll('‑','').toLowerCase();
function grammar(result,type) {
  const flexion=result.flexion || [];
  const form = name => clean(flexion.find(f=>f.form===name)?.wort.join(' / '));
  const label=result.classLabel || '';
  const declension = () => label.replace(/[(),]/g,'').replace(/neutr\./g,'').replace(/Deklination/gi,'Dekl.').trim() || '-';
  const nounForms = () => {
    const plural=!form('SubstantivForm(NOM,SG)') && !form('SubstantivForm(GEN,SG)');
    const number=plural?'PL':'SG';
    return ['NOM','GEN'].map(c=>{const value=form(`SubstantivForm(${c},${number})`);return value ? value+(plural?' (Pl.)':'') : '-';});
  };
  if (type==='Nomen') {
    const [nom,gen]=nounForms();
    let decl='-';
    if (/Substantiv|Dritte Deklination/i.test(label) || !label) {
      if (gen.endsWith('ae')) decl='a-Dekl.';
      else if (gen.endsWith('ei')) decl='e-Dekl.';
      else if (gen.endsWith('i')) decl='o-Dekl.';
      else if (gen.endsWith('us')) decl='u-Dekl.';
      else if (gen.endsWith('is')) decl=form('SubstantivForm(AKK,SG)').endsWith('im')?'i-Dekl.':form('SubstantivForm(GEN,PL)').endsWith('ium')?'gem.-Dekl.':'kons.-Dekl.';
    } else decl=declension();
    const gender=result.lemma.match(/\b([mfn])\.?\s*$/i)?.[1].toLowerCase();
    return {'Nom. Sg.':nom,'Gen. Sg.':gen,Genus:gender?gender+'.':'-','Dekl.-Kl.':decl};
  }
  if (type==='Verben') {
    const voice=result.deponens?'DEP':'AKT';
    const inf=form(`InfinitivForm(PRAES,${voice})`),present=form(`VerbForm(P1,SG,PRAES,IND,${voice},m)`);
    const conj=result.deponens?'Deponens':/Verb/i.test(label) || !label ? inf.endsWith('are')?'a-Konj.':inf.endsWith('ire')?'i-Konj.':inf.endsWith('ere')?present.endsWith('eo')?'e-Konj.':present.endsWith('io')?'kons. Konj. auf -io':'kons.-Konj.':'unbekannt':label.replace('ugation','.');
    return {Infinitiv:inf,'1. Ps. Sg. Präs. Ind. Akt.':present,'1. Ps. Sg. Perf. Ind. Akt.':form(`VerbForm(P1,SG,PERF,IND,${voice},m)`),PPP:form('PartizipialForm(PPP,AdjektivForm(NOM,SG,n,POS))'),'Konj.':conj};
  }
  if (type==='Adjektive' || type==='Pronomen') {
    let values=['-','-'],degree='',plural=false;
    outer: for (const d of type==='Adjektive'?['POS','KOMP','SUP']:['POS']) {
      for (const n of ['SG','PL']) {
        const grid=['NOM','GEN'].map(c=>['m','f','n'].map(g=>form(`AdjektivForm(${c},${n},${g},${d})`)));
        if (grid.flat().some(Boolean)) { values=grid.map(row=>row.map(v=>v || '-').join(', ')); degree=d; plural=n==='PL'; break outer; }
      }
    }
    if (type==='Pronomen' && !degree) values=nounForms();
    const fields={'Nom. Sg.: m./f./n.':values[0]+(plural?' (Pl.)':''),'Gen. Sg.: m./f./n.':values[1]+(plural?' (Pl.)':'')};
    if (type==='Adjektive') fields['Dekl.-Kl.']=degree==='KOMP'?'Komp.':degree==='SUP'?'Sup.':/Dritte Deklination/i.test(label)?form('AdjektivForm(GEN,PL,m,POS)').endsWith('ium')?'gem.-Dekl.':'kons.-Dekl.':/Adjektiv/i.test(label)?'unbekannt':declension();
    return fields;
  }
  const fields={[singular[type]]:clean(flexion[0]?.wort?.join(' / ')) || result.lemma};
  if (type==='Präpositionen') {
    const cases=['Akk','Dat','Abl'].filter(c=>(result.meanings || []).some(m=>new RegExp(`\\([^)]*${c}[^)]*\\)`,'i').test(m)));
    fields.Begleitkasus=cases.length?'mit '+cases.map(c=>c+'.').join(' / '):'-';
  }
  return fields;
}
export function buildVocabulary(records, options={}) {
  const {types:selected,meanings}=validateOptions(options);
  const groups=Object.fromEntries(WORD_TYPES.map(t=>[t,[]]));
  const seen=new Map();
  for (const {word,result} of records) {
    const type=types[result?.wordType] || 'Unbekannt';
    if (!selected.includes(type)) continue;
    const lemma=result?.found?result.lemma:word;
    const key=type+'\0'+lemma.normalize('NFC').toLowerCase();
    if (seen.has(key)) { const row=seen.get(key); if(!row.forms.includes(word))row.forms.push(word); continue; }
    const safe=result?.found?result:{lemma:word,meanings:[],flexion:[]};
    const fields=grammar(safe,type);
    for(let i=0;i<meanings;i++) {
      let meaning=safe.meanings?.[i] || '-';
      if(type==='Präpositionen') meaning=meaning.replace(/\([^)]*(?:Akk|Dat|Abl)[^)]*\)/gi,'').trim();
      fields[meanings===1?'Bedeutung':`Bedeutung ${['I','II','III'][i]}.`]=meaning || '-';
    }
    for(const key of Object.keys(fields)) if(!fields[key]?.trim())fields[key]='-';
    const row={lemma,forms:[word],fields}; seen.set(key,row); groups[type].push(row);
  }
  for(const rows of Object.values(groups)) {
    for(const row of rows)row.fields.Textbelege=row.forms.join('; ');
    rows.sort((a,b)=>Object.values(a.fields)[0].localeCompare(Object.values(b.fields)[0],'de') || a.lemma.localeCompare(b.lemma,'de'));
  }
  return groups;
}
