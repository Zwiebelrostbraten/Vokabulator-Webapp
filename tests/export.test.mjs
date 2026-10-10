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
 const many={Nomen:Array.from({length:100},(_,i)=>({fields:{'Nom. Sg.':`rōsa ${i}`,'Gen. Sg.':'rōsae',Genus:'f.','Dekl.-Kl.':'a-Dekl.','Bedeutung I.':'Blüte süß ß æ','Bedeutung II.':'Rose','Bedeutung III.':'Blume',Textbelege:'rosam\n'+('Beleg '.repeat(30))}}))};
 const pdf=await getDocument({data:await toPdf(many,'Übung'),useSystemFonts:true}).promise;assert.ok(pdf.numPages>1);let text='';for(let n=1;n<=pdf.numPages;n++) {
  const page=await pdf.getPage(n),items=(await page.getTextContent()).items;
  for(const item of items) {assert.ok(item.transform[4]>=0 && item.transform[4]+item.width<=page.view[2]+1,'text within horizontal page bounds');assert.ok(item.transform[5]>=0 && item.transform[5]<=page.view[3],'text within vertical page bounds');}
  for(const item of items.filter(x=>x.str.trim())) {
   assert.ok(item.transform[4]>=39 && item.transform[4]+item.width<=page.view[2]-39,'text stays inside printable margins');
   for(const other of items.filter(x=>x.str.trim() && x.transform[5]===item.transform[5] && x.transform[4]>item.transform[4]))assert.ok(item.transform[4]+item.width<=other.transform[4]+1,'table text does not overlap');
  }
  const pageText=items.map(x=>x.str).join(' ');
  for(const header of Object.keys(many.Nomen[0].fields))assert.ok(items.some(x=>x.str===header),'repeated table header '+header+' on page '+n);
  assert.ok(page.view[2]>page.view[3],'landscape A4');
  text+=pageText;
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
 const digest=await crypto.subtle.digest('SHA-1',new TextEncoder().encode('immerWortart: Adverbien'));assert.equal(csum,new DataView(digest).getUint32(0));db.close();
});
test('Anki GUIDs retain 128-bit identity across independently generated packages',async()=>{
 const {toAnki}=await import('../assets/export.mjs');const {default:init}=await import('sql.js');const SQL=await init();const guids=[];
 for(let i=0;i<2;i++) {const db=new SQL.Database(unzipSync(await toAnki(groups,'Übung'))['collection.anki2']);guids.push(...db.exec('select guid from notes')[0].values.flat());db.close();}
 assert.equal(new Set(guids).size,4);assert.ok(guids.every(g=>/^[a-f0-9]{32}$/.test(g)));
});
test('all nine card questions follow Excel first/final or second column; rich Anki answers and exact deck name survive',async()=>{
 const {WORD_TYPES}=await import('../assets/vocabulary.mjs');const {toAnki}=await import('../assets/export.mjs');const {default:init}=await import('sql.js');const SQL=await init();
 const g=Object.fromEntries(WORD_TYPES.map(type=>[type,[{fields:{Form:'rōsa',Grammatik:'f.', 'Bedeutung I.':'Blüte','Bedeutung II.':'Rose',Textbelege:'rosam'}}]]));
 for(const type of WORD_TYPES){
  const simple=['Adverbien','Konjunktionen','Subjunktionen','Unbekannt'].includes(type),question=simple?'f.':'rōsa\n---\nrosam';
  const xml=strFromU8(unzipSync(toBrainyoo({[type]:g[type]},'A'))['by_content.xml']);assert.ok(xml.includes('<vocabulary>'+question+'</vocabulary>'),type+' Brainyoo');
  const db=new SQL.Database(unzipSync(await toAnki({[type]:g[type]},'  Übung :: A  '))['collection.anki2']);
  const [fields,tags]=db.exec('select flds,tags from notes')[0].values[0];const [front,back]=fields.split('\x1f');assert.equal(front,question.replaceAll('\n','<br>')+'<br><strong>Wortart: '+type+'</strong>',type);assert.equal(tags,' Latein ');
  assert.equal(back,'Form: rōsa<br>Grammatik: f.<br>Bedeutung I.: Blüte<br>Bedeutung II.: Rose');assert.equal(Object.values(JSON.parse(db.exec('select decks from col')[0].values[0][0]))[0].name,'  Übung :: A  ');db.close();
 }
});
test('PDF tables exactly match Excel headers, sorted cell rows and nonempty sections',async()=>{
 const {pdfDocument}=await import('../assets/export.mjs');const definition=pdfDocument(groups,'Übung');
 const workbook=XLSX.read(toXlsx(groups));const tables=definition.content.filter(item=>item.table);
 assert.equal(tables.length,workbook.SheetNames.length);
 workbook.SheetNames.forEach((type,i)=>{const excel=XLSX.utils.sheet_to_json(workbook.Sheets[type],{header:1});assert.ok(definition.content.some(item=>item.text===type && item.bold));assert.deepEqual(tables[i].table.body[0].map(cell=>cell.text),excel[0]);assert.deepEqual(tables[i].table.body.slice(1),excel.slice(1,-1));assert.equal(tables[i].table.headerRows,1);assert.equal(tables[i].table.widths.length,excel[0].length);});
 assert.ok(definition.content.some(item=>item.text===ATTRIBUTION));assert.equal(definition.pageOrientation,'landscape');
});
test('PDF fixed widths use longest visible line in graphemes, readable minimum and finite cap; meanings share remainder',async()=>{
 const {pdfDocument}=await import('../assets/export.mjs');
 const fields={A:'x',Form:'abcdefghijklmnopqrst',Unicode:'e\u0301'.repeat(20)+'\n'+ '𐐀'.repeat(10),Textbelege:'x'.repeat(10000),'Bedeutung I.':'x'.repeat(10000),'Bedeutung II.':'kurz'};
 const doc=pdfDocument({Nomen:[{fields},{fields:{...fields,Form:'x'.repeat(22)}}]});
 const item=doc.content.find(x=>x.table);assert.deepEqual(item.table.widths,[42,118,108,120,'*','*']);
 const remainder=841.89-80-(6*10+7)-item.table.widths.filter(x=>typeof x==='number').reduce((a,b)=>a+b,0);
 assert.ok(remainder/2>0);assert.equal(item.noWrap,undefined);assert.equal(item.table.headerRows,1);
 const {toPdf}=await import('../assets/export.mjs'),{getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const pdf=await getDocument({data:await toPdf({Nomen:[{fields:{...fields,Textbelege:'x'.repeat(30),'Bedeutung I.':'Rose','Bedeutung II.':'Blüte'}},{fields:{...fields,Form:'x'.repeat(22),Textbelege:'x'.repeat(30),'Bedeutung I.':'Rose','Bedeutung II.':'Blüte'}}]})}).promise;
 const items=(await (await pdf.getPage(1)).getTextContent()).items;
 const first=items.find(x=>x.str==='Bedeutung I.'),second=items.find(x=>x.str==='Bedeutung II.');
 assert.ok(Math.abs(second.transform[4]-first.transform[4]-(remainder/2+11))<0.01,'each star column gets half the remaining content width plus padding/border');
});
test('PDF without meanings scales preferred widths within bounds to fit landscape printable area',async()=>{
 const {pdfDocument,toPdf}=await import('../assets/export.mjs');
 const fields=Object.fromEntries(Array.from({length:9},(_,i)=>['Spalte '+i,i===0?'kurz':'Wort '.repeat(100)]));
 const doc=pdfDocument({Nomen:[{fields}]}),widths=doc.content.find(x=>x.table).table.widths;
 assert.ok(widths.every(x=>typeof x==='number' && x>=42 && x<=120));
 assert.ok(widths[0]<widths[1]);assert.ok(Math.abs(widths[1]-widths[8])<0.001);
 assert.ok(widths.reduce((a,b)=>a+b,0)+9*10+10<=841.89-80+0.001);
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const pdf=await getDocument({data:await toPdf({Nomen:[{fields}]})}).promise;
 for(let n=1;n<=pdf.numPages;n++)for(const item of (await (await pdf.getPage(n)).getTextContent()).items.filter(x=>x.str.trim()))assert.ok(item.transform[4]>=40 && item.transform[4]+item.width<=841.89-40,'printable width');
});

test('PDF overflowing Verben reserves usable equal star widths and proportional readable fixed widths',async()=>{
 const {pdfDocument}=await import('../assets/export.mjs');
 const fixed=['Infinitiv','1. Ps. Sg. Präs. Ind. Akt.','1. Ps. Sg. Perf. Ind. Akt.','PPP','Konj.','Textbelege'];
 const fields=Object.fromEntries(fixed.map(h=>[h,'lateinisches Beispiel '.repeat(4)]));
 Object.assign(fields,{'Bedeutung I.':'erste deutsche Bedeutung','Bedeutung II.':'zweite deutsche Bedeutung','Bedeutung III.':'dritte deutsche Bedeutung'});
 const groups={Verben:[{fields}]},doc=pdfDocument(groups),table=doc.content.find(x=>x.table);
 const widths=table.table.widths,overhead=9*10+10,budget=841.89-80;
 assert.deepEqual(widths.slice(6),['*','*','*']);
 const total=widths.slice(0,6).reduce((a,b)=>a+b,0),remaining=budget-overhead-total;
 assert.ok(total+overhead<budget,'fixed widths and all padding/borders leave printable remainder');
 assert.ok(remaining/3>=60-0.001,'every meaning column reserves at least 60pt usable content width');
 assert.ok(widths.slice(0,6).every(w=>w>=42 && w<120),'readable fixed floor survives feasible compression');
 assert.ok(widths.slice(0,6).every(w=>Math.abs(w-widths[0])<0.001),'equal preferred lengths compress equally');
 const varied={...fields,Infinitiv:'kurz',PPP:'mittellange Form'};
 const compressed=pdfDocument({Verben:[{fields:varied}]}).content.find(x=>x.table).table.widths;
 assert.ok(compressed[0]>=42 && compressed[0]<compressed[3] && compressed[3]<compressed[1],'longest-text preference survives compression');
 assert.ok(Math.abs(compressed[3]/88-compressed[1]/120)<0.001,'unfloored preferred widths scale proportionally');

});

test('PDF pathological column counts produce deterministic bounded tables with readable widths',async()=>{
 const {pdfDocument}=await import('../assets/export.mjs');
 for(const meanings of [0,3]) {
  const fields=Object.fromEntries(Array.from({length:100},(_,i)=>[`F${i}`,'Wort '.repeat(30)]));
  for(let i=0;i<meanings;i++)fields[`Bedeutung ${i}`]='deutsche Bedeutung';
  const groups={Verben:[{fields}]},tables=pdfDocument(groups).content.filter(x=>x.table);
  assert.deepEqual(tables.map(x=>x.table),pdfDocument(groups).content.filter(x=>x.table).map(x=>x.table),'deterministic partition and allocation');
  assert.deepEqual(tables.flatMap(x=>x.table.body[0].map(c=>c.text)),Object.keys(fields),'every column retained in order');
  for(const item of tables) {
   const widths=item.table.widths,n=widths.length,stars=widths.filter(w=>w==='*').length;
   const fixed=widths.filter(w=>typeof w==='number');
   assert.ok(fixed.every(w=>w>=42 && w<=120),'readable floor remains feasible');
   assert.ok(fixed.reduce((a,b)=>a+b,0)+stars*60+n*10+n+1<=841.89-80+0.001,'including padding and borders, every table fits');
  }
 }
});

test('PDF overflowing Verben actual PDF text stays within horizontal printable margins',async()=>{
 const {toPdf}=await import('../assets/export.mjs'),{getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const fields=Object.fromEntries(['Infinitiv','1. Ps. Sg. Präs. Ind. Akt.','1. Ps. Sg. Perf. Ind. Akt.','PPP','Konj.','Textbelege'].map(h=>[h,'lateinisches Beispiel '.repeat(4)]));
 Object.assign(fields,{'Bedeutung I.':'erste deutsche Bedeutung','Bedeutung II.':'zweite deutsche Bedeutung','Bedeutung III.':'dritte deutsche Bedeutung'});
 const pdf=await getDocument({data:await toPdf({Verben:[{fields}]})}).promise;
 for(let n=1;n<=pdf.numPages;n++) {
  const page=await pdf.getPage(n);
  for(const item of (await page.getTextContent()).items.filter(x=>x.str.trim()))assert.ok(item.transform[4]>=40-0.001 && item.transform[4]+item.width<=page.view[2]-40+0.001,`printable horizontal margins: ${item.str}`);
 }
});
