import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, rowsFromText, createRow, toCsv, moveRow } from '../assets/core.mjs';
test('Latin words: Unicode, punctuation, numbers and apostrophes', () => {
  assert.deepEqual(tokenize('  Ārma, virumque! æquus; AMŌ\namo 123 — in “Gallia”. māter\u0304 '), ['Ārma','virumque','æquus','AMŌ','amo','in','Gallia','māter̄']);
  assert.deepEqual(tokenize("arma-virumque l’arma"), ['arma','virumque','l','arma']);
  assert.deepEqual(tokenize('123 …'), []);
});
test('Collapse case variants, retain spelling and frequency in first-seen order', () => {
  const rows = rowsFromText('Arma arma virumque ARMA', true);
  assert.deepEqual(rows.map(({word,frequency}) => ({word,frequency})), [{word:'Arma',frequency:3},{word:'virumque',frequency:1}]);
  assert.deepEqual(rowsFromText('arma arma', false).map(r=>r.frequency), [1,1]);
  assert.equal(rowsFromText('ā ā a', true).length, 2);
});
test('Manual rows have editable blank fields and a positive default frequency', () => {
  const a=createRow(), b=createRow('amo');
  assert.equal(a.word,''); assert.equal(a.translation,''); assert.equal(a.note,''); assert.equal(a.frequency,1);
  assert.equal(b.word,'amo'); assert.notEqual(a.id,b.id);
});
test('CSV has BOM, CRLF, quoted delimiters, quotes, newlines and safe spreadsheet cells', () => {
  const csv=toCsv([{word:'amo',translation:'lieben; "mögen"',note:'Zeile\nzwei',frequency:2},{word:'=SUM(A1)',translation:'',note:'',frequency:1}], {source:'Latein',target:'Deutsch'});
  assert.equal(csv, '\uFEFF"Latein";"Deutsch";"Notiz";"Häufigkeit"\r\n"amo";"lieben; ""mögen""";"Zeile\nzwei";"2"\r\n"\'=SUM(A1)";"";"";"1"\r\n');
});
test('Reordering is immutable, bounded, and determines export order', () => {
  const rows=[createRow('a'),createRow('b'),createRow('c')];
  const moved=moveRow(rows,2,-1);
  assert.deepEqual(moved.map(r=>r.word), ['a','c','b']); assert.equal(rows[1].word,'b');
  assert.deepEqual(moveRow(rows,0,-1),rows);
  assert.ok(toCsv(moved).indexOf('"c"') < toCsv(moved).indexOf('"b"'));
});
