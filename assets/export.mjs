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
  if(['Adverbien','Konjunktionen','Subjunktionen','Unbekannt'].includes(type))return [values[1][1],grammar[0]];
  const question=values[0][1]+'\n---\n'+values.at(-1)[1];
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
// At 9pt: 42pt readable minimum, 120pt cap, 5pt per grapheme + 8pt reserve.
// Count displayed grapheme clusters (including combining marks/surrogate pairs),
// using the longest explicit line rather than counting newline characters.
const pdfSegmenter=new Intl.Segmenter('de',{granularity:'grapheme'});
function pdfWidths(headers,body,type) {
  const widths=headers.map((header,i)=>{
    if(header.startsWith('Bedeutung'))return '*';
    let longest=0;
    // These verb labels adapt to the final width; only actual forms determine
    // their preferred width. Other headers still participate normally.
    const contentOnly=type==='Verben' && ['1. Ps. Sg. Präs. Ind. Akt.','1. Ps. Sg. Perf. Ind. Akt.'].includes(header);
    for(const row of contentOnly?body:[headers,...body])for(const line of String(row[i]).split(/\r\n|[\r\n]/u)) {
      let length=0;for(const _segment of pdfSegmenter.segment(line))length++;
      longest=Math.max(longest,length);
    }
    return Math.min(120,Math.max(42,longest*5+8));
  });
  // Reserve 60pt of usable content for EACH star meaning column, after ALL
  // 5pt left/right padding and 1pt borders. Normal preferred widths stay intact.
  const stars=widths.filter(width=>width==='*').length;
  const budget=841.89-80-headers.length*10-(headers.length+1)-stars*60;
  const total=scale=>widths.reduce((sum,width)=>sum+(width==='*'?0:Math.max(42,width*scale)),0);
  if(total(1)>budget) {
    // Scale preferred lengths together, clamping only at the readable 42pt floor.
    // pdfDocument partitions columns first so this floor is always feasible.
    let low=0,high=1;
    for(let i=0;i<60;i++){const mid=(low+high)/2;if(total(mid)>budget)high=mid;else low=mid;}
    return widths.map(width=>width==='*'?'*':Math.max(42,width*low));
  }
  return widths;
}
export function pdfDocument(groups,name='Vokabelliste') {
  const entries=categories(groups);
  const content=[{text:name || 'Vokabelliste',fontSize:20,margin:[0,0,0,16]}];
  for(const [type,rows] of entries) {
    content.push({text:type,fontSize:16,bold:true,margin:[0,12,0,8]});
    const headers=Object.keys(rows[0].fields);
    const body=rows.map(row=>headers.map(key=>String(row.fields[key] || '-')));
    // When even minimum content widths plus padding/borders cannot fit, start
    // another table. This keeps arbitrarily many columns deterministic/readable
    // instead of producing negative widths or overflowing padding alone.
    let start=0;
    while(start<headers.length) {
      let end=start,cost=1; // outer border; each column adds content + 10pt padding + 1pt border
      while(end<headers.length) {
        const next=(headers[end].startsWith('Bedeutung')?60:42)+11;
        if(cost+next>841.89-80)break;
        cost+=next;end++;
      }
      const sectionHeaders=headers.slice(start,end),sectionBody=body.map(row=>row.slice(start,end));
      const widths=pdfWidths(sectionHeaders,sectionBody,type);
      const displayHeaders=sectionHeaders.map((header,i)=>{
        // Natural one-line advances in the embedded Roboto bold font at 9pt
        // (font units / 2048 * 9). Compare usable content AFTER compression.
        if(type==='Verben' && header==='1. Ps. Sg. Präs. Ind. Akt.' && widths[i]<96.767578125)return '1. Ps. Sg.\nPräs. Ind.\nAkt.';
        if(type==='Verben' && header==='1. Ps. Sg. Perf. Ind. Akt.' && widths[i]<95.4580078125)return '1. Ps. Sg.\nPerf. Ind.\nAkt.';
        return header;
      });
      content.push({table:{headerRows:1,widths,body:[displayHeaders.map(text=>({text,bold:true,fillColor:'#edf3e9'})),...sectionBody]},layout:{paddingLeft:()=>5,paddingRight:()=>5,paddingTop:()=>5,paddingBottom:()=>5},fontSize:9});
      start=end;
    }
  }
  content.push({text:ATTRIBUTION,fontSize:8,margin:[0,16,0,0]});
  return {pageSize:'A4',pageOrientation:'landscape',pageMargins:[40,40,40,40],defaultStyle:{font:'Roboto',fontSize:10},content,footer:(page,pages)=>({text:`${page} / ${pages}`,alignment:'center',fontSize:8})};
}
export async function toPdf(groups,name='Vokabelliste') {
  const definition=pdfDocument(groups,name);
  const [{default:pdfMake},{default:fonts}]=await Promise.all([import('pdfmake/build/pdfmake.js'),import('pdfmake/build/vfs_fonts.js')]);
  pdfMake.addVirtualFileSystem(fonts);
  return new Uint8Array(await pdfMake.createPdf(definition).getBuffer());
}

export async function toAnki(groups,lessonName) {
  const name=lessonName;if(!name.trim() || name.length>160)throw Error('Bitte einen Lektions-/Stapelnamen mit 1–160 Zeichen eingeben.');
  const entries=categories(groups);
  const [{default:init},{schema,deckConfig}]=await Promise.all([import('sql.js'),import('./anki-schema.mjs')]);
  // Vite emits the WASM alongside JS; Node tests use sql.js's own asset resolver.
  const options=typeof window==='undefined'?{}:{locateFile:()=>new URL('../node_modules/sql.js/dist/sql-wasm.wasm',import.meta.url).href};
  const SQL=await init(options),db=new SQL.Database();
  try {
    db.run(schema);
    const now=Date.now(),seconds=Math.floor(now/1000),did=now,mid=1700000000001;
    const model={id:mid,name:'Vokabulator · Lernkarten',type:0,mod:seconds,usn:-1,sortf:0,did,latexPre:'',latexPost:'',latexsvg:false,tags:[],vers:[],req:[[0,'all',[0]]],css:'.card { font-family: Arial; font-size: 20px; text-align: left; }',flds:['Vorderseite','Rückseite'].map((name,ord)=>({name,ord,sticky:false,rtl:false,font:'Arial',size:20,media:[]})),tmpls:[{name:'Vokabel',ord:0,qfmt:'{{Vorderseite}}',afmt:'{{FrontSide}}<hr id="answer">{{Rückseite}}',bqfmt:'',bafmt:'',bfont:'',bsize:0,did:null}]};
    const deck={id:did,name,desc:ATTRIBUTION,mod:seconds,usn:-1,dyn:0,conf:1,collapsed:false,extendNew:10,extendRev:50,newToday:[0,0],revToday:[0,0],lrnToday:[0,0],timeToday:[0,0]};
    db.run('insert into col values (?,?,?,?,?,?,?,?,?,?,?,?,?)',[1,seconds,now,now,11,0,0,0,JSON.stringify({activeDecks:[did],curDeck:did,curModel:String(mid),nextPos:1}),JSON.stringify({[mid]:model}),JSON.stringify({[did]:deck}),JSON.stringify(deckConfig),'{}']);
    let index=0;
    for(const [type,rows] of entries)for(const row of rows) {
      const values=Object.entries(row.fields),lemma=String(values[0]?.[1] || row.lemma || '-');
      const html=value=>xmlEscape(value).replaceAll('\n','<br>');
      const question=cardText(type,row.fields)[0];
      const front=html(question)+'<br><strong>Wortart: '+html(type)+'</strong>';
      const back=values.filter(([key])=>key!=='Textbelege').map(([key,value])=>html(key)+': '+html(value)).join('<br>');
      const digest=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(cleanText(question+'Wortart: '+type).replaceAll('\n','')));const csum=new DataView(digest).getUint32(0);
      const nid=now+(++index)*2;
      db.run('insert into notes values (?,?,?,?,?,?,?,?,?,?,?)',[nid,crypto.randomUUID().replaceAll('-',''),mid,seconds,-1,' Latein ',front+'\x1f'+back,lemma,csum,0,'']);
      db.run('insert into cards values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[nid+1,nid,did,0,seconds,-1,0,0,index,0,2500,0,0,0,0,0,0,'']);
    }
    return zipSync({'collection.anki2':db.export(),media:strToU8('{}')});
  } finally {db.close();}
}
