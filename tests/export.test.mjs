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
