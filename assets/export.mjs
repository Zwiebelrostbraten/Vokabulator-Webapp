import * as XLSX from '@e965/xlsx';
import { zipSync, strToU8 } from 'fflate';
import { WORD_TYPES } from './vocabulary.mjs';
export const ATTRIBUTION = 'Diese Liste basiert auf Daten von "https://www.navigium.de/suchfunktion/_search?q={}". © Rechteinhaber: Navigium.de';
function categories(groups) {
  const entries=WORD_TYPES.filter(type=>groups[type]?.length).map(type=>[type,[...groups[type]].sort((a,b)=>Object.values(a.fields)[0].localeCompare(Object.values(b.fields)[0],'de'))]);
  if(!entries.length)throw Error('Keine Vokabeln zum Exportieren vorhanden.');
  return entries;
}
export const toOds = groups => spreadsheet(groups, 'ods');
export const toXlsx = groups => spreadsheet(groups, 'xlsx');
function spreadsheet(groups, bookType) {
  const workbook=XLSX.utils.book_new();
  for(const [type,rows] of categories(groups)) {
    const headers=Object.keys(rows[0].fields);
    const data=[headers,...rows.map(row=>headers.map(h=>row.fields[h] || '-')),[ATTRIBUTION]];
    const sheet=XLSX.utils.aoa_to_sheet(data);
    sheet['!merges']=[{s:{r:data.length-1,c:0},e:{r:data.length-1,c:headers.length-1}}];
    sheet['!cols']=headers.map((h,i)=>({wch:Math.min(60,Math.max(h.length,...data.slice(1,-1).map(row=>String(row[i]).length))+2)}));
    sheet['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rows.length,c:headers.length-1}})};
    XLSX.utils.book_append_sheet(workbook,sheet,type);
  }
  return new Uint8Array(XLSX.write(workbook,{type:'array',bookType,compression:true}));
}
// XML 1.0 forbids these control characters.
// eslint-disable-next-line no-control-regex
const cleanText = value => String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
const xmlEscape = value => cleanText(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function cardText(type,fields) {
  const values=Object.entries(fields),grammar=values.filter(([key])=>!key.startsWith('Bedeutung') && key!=='Textbelege').map(([,value])=>value);
  const meanings=values.filter(([key])=>key.startsWith('Bedeutung')).map(([,value])=>value).join('\n');
  if(['Adverbien','Konjunktionen','Subjunktionen','Unbekannt'].includes(type))return [meanings,grammar[0]];
  const question=grammar[0]+'\n---\n'+fields.Textbelege;
  let answer;
  if(type==='Nomen')answer=`${grammar[0]}, ${grammar[1]}; ${grammar[2]}; ${grammar[3]}`;
  if(type==='Verben')answer=`${grammar.slice(0,4).join(', ')}; ${grammar[4]}`;
  if(type==='Adjektive')answer=grammar.join('; ');
  if(type==='Pronomen')answer=grammar.join(', ');
  if(type==='Präpositionen')answer=`${grammar[0]} (${grammar[1]})`;
  return [question,answer+':\n'+meanings];
}
export function toBrainyoo(groups,lessonName) {
  const name=lessonName.trim();
  if(!name || name.length>160)throw Error('Bitte einen Lektionsnamen mit 1–160 Zeichen eingeben.');
  let id=24755500;
  let xml='<?xml version="1.0" encoding="UTF-8"?><BYXML xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.0" xsi:noNamespaceSchemaLocation="https://www.brainyoo.de/Brainyoo2/xsd/brainyoo_xml_v2.0.xsd">';
  xml+=`<lesson title="${xmlEscape(name)}" userLessonID="${id++}">`;
  for(const [type,rows] of categories(groups)) {
    xml+=`<lesson title="${xmlEscape(type)}" userLessonID="${id++}">`;
    for(const row of rows) {
      const [question,answer]=cardText(type,row.fields);
      xml+=`<vocabularycard userCardID="${id++}"><vocabularyQuestion><vocabPara><vocabulary>${xmlEscape(question)}</vocabulary></vocabPara></vocabularyQuestion><vocabularyAnswer><vocabPara><vocabulary>${xmlEscape(answer)}</vocabulary></vocabPara></vocabularyAnswer></vocabularycard>`;
    }
    xml+='</lesson>';
  }
  return zipSync({'by_content.xml':strToU8(xml+'</lesson></BYXML>')});
}
export function toCsv(groups) {
  const entries=categories(groups),headers=[...new Set(entries.flatMap(([,rows])=>rows.flatMap(row=>Object.keys(row.fields))))];
  const quote=value=>{let text=String(value ?? '');if(/^[\s]*[=+@-]/u.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const rows=[['Wortart',...headers],...entries.flatMap(([type,rows])=>rows.map(row=>[type,...headers.map(h=>row.fields[h] ?? '')]))];
  return strToU8('\uFEFF'+rows.map(row=>row.map(quote).join(';')).join('\r\n')+'\r\n');
}
export async function toPdf(groups,name='Vokabelliste') {
  const entries=categories(groups);
  const [{default:pdfMake},{default:fonts}]=await Promise.all([import('pdfmake/build/pdfmake.js'),import('pdfmake/build/vfs_fonts.js')]);
  pdfMake.addVirtualFileSystem(fonts);
  const content=[{text:name || 'Vokabelliste',fontSize:20,margin:[0,0,0,16]}];
  for(const [type,rows] of entries) {
    content.push({text:type,fontSize:16,bold:true,margin:[0,12,0,8]});
    for(const row of rows)for(const [key,value] of Object.entries(row.fields))content.push({text:[{text:key+': ',bold:true},String(value || '-')],margin:[0,0,0,key==='Textbelege'?10:2]});
  }
  content.push({text:ATTRIBUTION,fontSize:8,margin:[0,16,0,0]});
  return new Uint8Array(await pdfMake.createPdf({pageSize:'A4',pageMargins:[40,40,40,40],defaultStyle:{font:'Roboto',fontSize:10},content,footer:(page,pages)=>({text:`${page} / ${pages}`,alignment:'center',fontSize:8})}).getBuffer());
}
export async function toAnki(groups,lessonName) {
  const name=lessonName.trim();if(!name || name.length>160)throw Error('Bitte einen Lektions-/Stapelnamen mit 1–160 Zeichen eingeben.');
  const entries=categories(groups);
  const [{default:init},{schema,deckConfig}]=await Promise.all([import('sql.js'),import('./anki-schema.mjs')]);
  // Vite emits the WASM alongside JS; Node tests use sql.js's own asset resolver.
  const options=typeof window==='undefined'?{}:{locateFile:()=>new URL('../node_modules/sql.js/dist/sql-wasm.wasm',import.meta.url).href};
  const SQL=await init(options),db=new SQL.Database();
  try {
    db.run(schema);
    const now=Date.now(),seconds=Math.floor(now/1000),did=now,mid=1700000000001;
    const model={id:mid,name:'Vokabulator · Latein → Deutsch',type:0,mod:seconds,usn:-1,sortf:0,did,latexPre:'',latexPost:'',latexsvg:false,tags:[],vers:[],req:[[0,'all',[0]]],css:'.card { font-family: Arial; font-size: 20px; text-align: left; }',flds:['Vorderseite','Rückseite'].map((name,ord)=>({name,ord,sticky:false,rtl:false,font:'Arial',size:20,media:[]})),tmpls:[{name:'Latein → Deutsch',ord:0,qfmt:'{{Vorderseite}}',afmt:'{{FrontSide}}<hr id="answer">{{Rückseite}}',bqfmt:'',bafmt:'',bfont:'',bsize:0,did:null}]};
    const deck={id:did,name,desc:ATTRIBUTION,mod:seconds,usn:-1,dyn:0,conf:1,collapsed:false,extendNew:10,extendRev:50,newToday:[0,0],revToday:[0,0],lrnToday:[0,0],timeToday:[0,0]};
    db.run('insert into col values (?,?,?,?,?,?,?,?,?,?,?,?,?)',[1,seconds,now,now,11,0,0,0,JSON.stringify({activeDecks:[did],curDeck:did,curModel:String(mid),nextPos:1}),JSON.stringify({[mid]:model}),JSON.stringify({[did]:deck}),JSON.stringify(deckConfig),'{}']);
    let index=0;
    for(const [type,rows] of entries)for(const row of rows) {
      const values=Object.entries(row.fields),lemma=String(values[0]?.[1] || row.lemma || '-');
      const html=value=>xmlEscape(value).replaceAll('\n','<br>');
      const front=html(lemma)+'<br>'+html(type)+'<br>'+html(row.fields.Textbelege || '');
      const back=values.filter(([key])=>key!=='Textbelege').map(([key,value])=>html(key)+': '+html(value)).join('<br>');
      const digest=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(cleanText([lemma,type,row.fields.Textbelege || ''].join('')).replaceAll('\n','')));const csum=new DataView(digest).getUint32(0);
      const nid=now+(++index)*2;
      db.run('insert into notes values (?,?,?,?,?,?,?,?,?,?,?)',[nid,crypto.randomUUID().replaceAll('-',''),mid,seconds,-1,'',front+'\x1f'+back,lemma,csum,0,'']);
      db.run('insert into cards values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[nid+1,nid,did,0,seconds,-1,0,0,index,0,2500,0,0,0,0,0,0,'']);
    }
    return zipSync({'collection.anki2':db.export(),media:strToU8('{}')});
  } finally {db.close();}
}
