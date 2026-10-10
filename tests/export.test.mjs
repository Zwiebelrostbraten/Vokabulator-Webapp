import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from '@e965/xlsx';
import { unzipSync, strFromU8 } from 'fflate';
import { toXlsx, toBrainyoo, ATTRIBUTION } from '../assets/export.mjs';
const groups={Nomen:[{lemma:'rosa',fields:{'Nom. Sg.':'rosa','Gen. Sg.':'rosae',Genus:'f.','Dekl.-Kl.':'a-Dekl.','Bedeutung I.':'Rose & Blume','Bedeutung II.':'=formula','Bedeutung III.':'<Blüte>',Textbelege:'rosam; rosae'}}],Verben:[],Adverbien:[{lemma:'semper',fields:{Adverb:'semper',Bedeutung:'immer',Textbelege:'semper'}}]};
test('real XLSX roundtrip: nonempty category sheets, headers, literal strings, widths and merged attribution',()=>{
  const bytes=toXlsx(groups);assert.equal(bytes[0],80);assert.equal(bytes[1],75);
  const workbook=XLSX.read(bytes,{type:'array'});
  assert.deepEqual(workbook.SheetNames,['Nomen','Adverbien']);
  const sheet=workbook.Sheets.Nomen;
  const data=XLSX.utils.sheet_to_json(sheet,{header:1});
  assert.deepEqual(data[0],Object.keys(groups.Nomen[0].fields));
  assert.deepEqual(data[1],Object.values(groups.Nomen[0].fields));
  assert.equal(data[2][0],ATTRIBUTION);assert.equal(sheet.F2.t,'s');assert.equal(sheet.F2.f,undefined);
  assert.equal(sheet['!merges'][0].e.c,7);
});
test('BY2 contains original BYXML schema, lesson/category/card hierarchy and escaped three meanings',()=>{
  const files=unzipSync(toBrainyoo(groups,'Lektion "A" & B'));
  assert.deepEqual(Object.keys(files),['by_content.xml']);const xml=strFromU8(files['by_content.xml']);
  assert.match(xml,/^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml,/<BYXML[^>]*version="1.0"/);assert.match(xml,/brainyoo_xml_v2\.0\.xsd/);
  assert.match(xml,/title="Lektion &quot;A&quot; &amp; B"/);
  assert.equal((xml.match(/<lesson /g)||[]).length,3);assert.equal((xml.match(/<vocabularycard /g)||[]).length,2);
  assert.match(xml,/rosa\n---\nrosam; rosae/);
  assert.match(xml,/rosa, rosae; f\.; a-Dekl\.:\nRose &amp; Blume\n=formula\n&lt;Blüte&gt;/);
  assert.match(xml,/<vocabularyQuestion><vocabPara><vocabulary>immer/);
  assert.match(xml,/<vocabularyAnswer><vocabPara><vocabulary>semper/);
  const ids=[...xml.matchAll(/user(?:Lesson|Card)ID="(\d+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  assert.ok(!xml.includes(ATTRIBUTION));
});
test('export rejects empty results and missing or overlong lesson names',()=>{
  assert.throws(()=>toXlsx({Nomen:[]}));assert.throws(()=>toBrainyoo(groups,''));assert.throws(()=>toBrainyoo(groups,'x'.repeat(161)));assert.throws(()=>toBrainyoo({},'Title'));
});
test('ODS is an OpenDocument archive with category sheets and Excel values',async()=>{
 const {toOds}=await import('../assets/export.mjs'); const bytes=toOds(groups);
 const files=unzipSync(bytes);assert.equal(strFromU8(files.mimetype),'application/vnd.oasis.opendocument.spreadsheet');assert.ok(files['META-INF/manifest.xml']);
 const wb=XLSX.read(bytes,{type:'array'});assert.deepEqual(wb.SheetNames,['Nomen','Adverbien']);assert.deepEqual(XLSX.utils.sheet_to_json(wb.Sheets.Nomen,{header:1})[1],Object.values(groups.Nomen[0].fields));
});
test('CSV BOM, German delimiter, union fields, literal formulas and multiline quoting roundtrip',async()=>{
 const {toCsv}=await import('../assets/export.mjs');const g={Nomen:[{fields:{Wort:'="x";\nü',Bedeutung:' +SUM(A1)',Textbelege:'a\r\nb'}}],Adverbien:[{fields:{Adverb:'semper',Bedeutung:'immer',Textbelege:'semper'}}]};
 const text=new TextDecoder('utf-8',{ignoreBOM:true}).decode(toCsv(g));assert.equal(text,'\uFEFF"Wortart";"Wort";"Bedeutung";"Textbelege";"Adverb"\r\n"Nomen";"\'=""x"";\nü";"\' +SUM(A1)";"a\r\nb";""\r\n"Adverbien";"";"immer";"semper";"semper"\r\n');
 const wb=XLSX.read(text,{type:'string',raw:true,FS:';'});assert.equal(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1})[1][1],'\'="x";\nü');
});
test('PDF has readable Unicode meanings/evidence and unclipped multipage content',async()=>{
 const {toPdf}=await import('../assets/export.mjs');const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const many={Nomen:Array.from({length:100},(_,i)=>({fields:{Wort:`rōsa ${i}`,Bedeutung:'Blüte süß ß æ',Textbelege:'rosam\n'+('Beleg '.repeat(30))}}))};
 const pdf=await getDocument({data:await toPdf(many,'Übung'),useSystemFonts:true}).promise;assert.ok(pdf.numPages>1);let text='';for(let n=1;n<=pdf.numPages;n++) {
  const page=await pdf.getPage(n),items=(await page.getTextContent()).items;
  for(const item of items) {assert.ok(item.transform[4]>=0 && item.transform[4]+item.width<=page.view[2]+1,'text within horizontal page bounds');assert.ok(item.transform[5]>=0 && item.transform[5]<=page.view[3],'text within vertical page bounds');}
  text+=items.map(x=>x.str).join(' ');
 }
 for(const expected of ['Übung','Nomen','rōsa 99','Blüte süß ß æ','Textbelege','Beleg'])assert.ok(text.includes(expected),expected);
});
test('Anki package has valid SQLite v11 schema, named deck, linked new cards and escaped fields',async()=>{
 const {toAnki}=await import('../assets/export.mjs');const {default:init}=await import('sql.js');const SQL=await init();
 const files=unzipSync(await toAnki(groups,'Übung'));assert.deepEqual(Object.keys(files).sort(),['collection.anki2','media']);assert.equal(strFromU8(files.media),'{}');
 const db=new SQL.Database(files['collection.anki2']);assert.equal(db.exec('pragma integrity_check')[0].values[0][0],'ok');
 const col=db.exec('select ver, models, decks from col')[0].values[0];assert.equal(col[0],11);const model=Object.values(JSON.parse(col[1]))[0],deck=Object.values(JSON.parse(col[2]))[0];assert.equal(deck.name,'Übung');assert.equal(model.flds.length,2);assert.match(model.tmpls[0].qfmt,/Vorderseite/);
 assert.equal(db.exec('select count(*) from cards c join notes n on c.nid=n.id where c.did='+deck.id+' and c.type=0 and c.queue=0')[0].values[0][0],2);
 const fields=db.exec('select flds from notes order by id')[0].values.flat().join('\n');assert.match(fields,/rosa/);assert.match(fields,/Rose &amp; Blume/);assert.match(fields,/&lt;Blüte&gt;/);assert.match(fields,/rosam; rosae/);assert.match(fields,/semper/);assert.match(fields,/immer/);db.close();
 await assert.rejects(()=>toAnki(groups,''));await assert.rejects(()=>toAnki({},'A'));
});
test('Anki checksum matches plain front text and names/HTML controls stay literal',async()=>{
 const {toAnki}=await import('../assets/export.mjs');const {default:init}=await import('sql.js');const SQL=await init();
 const db=new SQL.Database(unzipSync(await toAnki({Adverbien:[{fields:{Adverb:'<ō> & ü',Bedeutung:'immer',Textbelege:'x\x1f\ny'}}]},'A & B'))['collection.anki2']);
 const [fields,csum]=db.exec('select flds,csum from notes')[0].values[0];assert.equal(fields.split('\x1f').length,2);assert.match(fields,/&lt;ō&gt; &amp; ü/);
 const digest=await crypto.subtle.digest('SHA-1',new TextEncoder().encode('<ō> & üAdverbienxy'));assert.equal(csum,new DataView(digest).getUint32(0));db.close();
});
test('Anki GUIDs retain 128-bit identity across independently generated packages',async()=>{
 const {toAnki}=await import('../assets/export.mjs');const {default:init}=await import('sql.js');const SQL=await init();const guids=[];
 for(let i=0;i<2;i++) {const db=new SQL.Database(unzipSync(await toAnki(groups,'Übung'))['collection.anki2']);guids.push(...db.exec('select guid from notes')[0].values.flat());db.close();}
 assert.equal(new Set(guids).size,4);assert.ok(guids.every(g=>/^[a-f0-9]{32}$/.test(g)));
});
