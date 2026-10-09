import test from 'node:test';
import assert from 'node:assert/strict';
import { WORD_TYPES, buildVocabulary, validateOptions, prepareWords } from '../assets/vocabulary.mjs';
const f = (form,...wort)=>({form,wort});
const entry = (wordType,lemma,flexion=[],extra={})=>({found:true,wordType,lemma,flexion,meanings:['eins','zwei','drei','vier'],classLabel:'',deponens:false,...extra});
test('original defaults, bounds, filters and bounded text',()=>{
  assert.equal(validateOptions({}).parallel,64); assert.equal(validateOptions({}).meanings,1);
  assert.deepEqual(validateOptions({}).types,WORD_TYPES.slice(0,3));
  for(const parallel of [0,129,1.5]) assert.throws(()=>validateOptions({parallel}));
  for(const meanings of [0,4,1.5]) assert.throws(()=>validateOptions({meanings}));
  assert.throws(()=>validateOptions({types:[]})); assert.throws(()=>validateOptions({types:['Bogus']}));
  assert.throws(()=>prepareWords(' '.repeat(100001))); assert.throws(()=>prepareWords('123'));
  assert.deepEqual(prepareWords('Arma, arma ARMA; māter\u0304 123'),['arma','māter̄']);
  assert.throws(()=>prepareWords('a'.repeat(101)));
});
test('lemma deduplication retains distinct forms, filters and sorts original rows with 1–3 meanings',()=>{
  const results=[{word:'rosae',result:entry('SUBST','rosa, -ae f.',[f('SubstantivForm(NOM,SG)','rosa'),f('SubstantivForm(GEN,SG)','rosae'),f('SubstantivForm(ABL,SG)','rosa')],{classLabel:'Substantiv'})},{word:'rosa',result:entry('SUBST','rosa, -ae f.')},{word:'rosae',result:entry('SUBST','rosa, -ae f.')},{word:'a',result:entry('ADV','a')},{word:'ager',result:entry('SUBST','ager, agri m.')}];
  const groups=buildVocabulary(results,{types:['Nomen'],meanings:3});
  assert.equal(groups.Nomen.length,2); assert.equal(groups.Adverbien.length,0);
  assert.equal(groups.Nomen[0].lemma,'ager, agri m.');
  const row=groups.Nomen[1].fields;
  assert.deepEqual(row,{'Nom. Sg.':'rosa','Gen. Sg.':'rosae',Genus:'f.','Dekl.-Kl.':'a-Dekl.','Bedeutung I.':'eins','Bedeutung II.':'zwei','Bedeutung III.':'drei',Textbelege:'rosae; rosa'});
  assert.equal(buildVocabulary(results,{types:['Nomen']}).Nomen[1].fields.Bedeutung,'eins');
});
test('noun plural fallback and third declension subtypes',()=>{
  for(const [flexion,expected] of [[ [f('SubstantivForm(NOM,PL)','castra'),f('SubstantivForm(GEN,PL)','castrorum')],'-'], [[f('SubstantivForm(GEN,SG)','civis'),f('SubstantivForm(GEN,PL)','civium')],'gem.-Dekl.'],[[f('SubstantivForm(GEN,SG)','turris'),f('SubstantivForm(AKK,SG)','turrim')],'i-Dekl.']]){
    const row=buildVocabulary([{word:'x',result:entry('SUBST','x n.',flexion,{classLabel:'Dritte Deklination'})}],{types:['Nomen']}).Nomen[0].fields;
    assert.equal(row['Dekl.-Kl.'],expected);
    if(expected==='-') assert.equal(row['Nom. Sg.'],'castra (Pl.)');
  }
});
test('verb principal parts and conjugation, including deponents',()=>{
  for(const [inf,present,expected,dep] of [['amare','amo','a-Konj.',false],['monere','moneo','e-Konj.',false],['audire','audio','i-Konj.',false],['capere','capio','kons. Konj. auf -io',false],['legere','lego','kons.-Konj.',false],['hortari','hortor','Deponens',true]]){
    const voice=dep?'DEP':'AKT'; const result=entry('VERB',present,[f(`InfinitivForm(PRAES,${voice})`,inf),f(`VerbForm(P1,SG,PRAES,IND,${voice},m)`,present),f(`VerbForm(P1,SG,PERF,IND,${voice},m)`,'perfectum'),f('PartizipialForm(PPP,AdjektivForm(NOM,SG,n,POS))','amatum')],{deponens:dep,classLabel:'Verb'});
    const row=buildVocabulary([{word:present,result}],{types:['Verben']}).Verben[0].fields;
    assert.equal(row.Infinitiv,inf);assert.equal(row['Konj.'],expected);assert.equal(row.PPP,'amatum');assert.equal(row['1. Ps. Sg. Perf. Ind. Akt.'],'perfectum');
  }
});
test('adjective genders, comparison fallback and pronoun substantive fallback',()=>{
  for(const degree of ['POS','KOMP','SUP']){
    const flexion=['NOM','GEN'].flatMap(c=>['m','f','n'].map(g=>f(`AdjektivForm(${c},SG,${g},${degree})`,`${c}-${g}`)));
    const row=buildVocabulary([{word:'bonus',result:entry('ADJ','bonus',flexion,{classLabel:'Dritte Deklination'})}],{types:['Adjektive']}).Adjektive[0].fields;
    assert.equal(row['Nom. Sg.: m./f./n.'],'nom-m, nom-f, nom-n'); assert.equal(row['Dekl.-Kl.'],degree==='POS'?'kons.-Dekl.':degree==='KOMP'?'Komp.':'Sup.');
  }
  const row=buildVocabulary([{word:'ego',result:entry('PRON','ego',[f('SubstantivForm(NOM,SG)','ego'),f('SubstantivForm(GEN,SG)','mei')])}],{types:['Pronomen']}).Pronomen[0].fields;
  assert.equal(row['Gen. Sg.: m./f./n.'],'mei');
});
test('preposition cases, all simple types and missing lookups remain reviewable',()=>{
  const results=['ADV','KONJ','SUBJ','OTHER'].map(wordType=>({word:'x',result:entry(wordType,'x')}));
  results.push({word:'in',result:entry('PRAEP','in',[f('Praeposition','in')],{meanings:['(mit Akk. oder Abl.) in','hinein']})},{word:'xyz',result:{found:false,meanings:[]}});
  const groups=buildVocabulary(results,{types:WORD_TYPES,meanings:2});
  assert.equal(groups.Präpositionen[0].fields.Begleitkasus,'mit Akk. / Abl.');
  assert.equal(groups.Präpositionen[0].fields['Bedeutung I.'],'in');
  for(const type of ['Adverbien','Konjunktionen','Subjunktionen']) assert.equal(groups[type].length,1);
  assert.equal(groups.Unbekannt.length,2); assert.equal(groups.Unbekannt.find(r=>r.lemma==='xyz').fields['Bedeutung I.'],'-');
});
