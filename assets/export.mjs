import * as XLSX from '@e965/xlsx';
import { zipSync, strToU8 } from 'fflate';
import { WORD_TYPES } from './vocabulary.mjs';
export const ATTRIBUTION = 'Diese Liste basiert auf Daten von "https://www.navigium.de/suchfunktion/_search?q={}". © Rechteinhaber: Navigium.de';
function categories(groups) {
  const entries=WORD_TYPES.filter(type=>groups[type]?.length).map(type=>[type,[...groups[type]].sort((a,b)=>Object.values(a.fields)[0].localeCompare(Object.values(b.fields)[0],'de'))]);
  if(!entries.length)throw Error('Keine Vokabeln zum Exportieren vorhanden.');
  return entries;
}
export function toXlsx(groups) {
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
  return new Uint8Array(XLSX.write(workbook,{type:'array',bookType:'xlsx',compression:true}));
}
// XML 1.0 forbids these control characters.
// eslint-disable-next-line no-control-regex
const xmlEscape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
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
