let sequence = 0;
export function tokenize(text) {
  return String(text).normalize('NFC').match(/\p{L}[\p{L}\p{M}]*/gu) ?? [];
}
export function createRow(word = '') {
  return { id: `row-${++sequence}`, word, translation: '', note: '', frequency: 1 };
}
export function rowsFromText(text, collapse = true) {
  const rows = [], seen = new Map();
  for (const word of tokenize(text)) {
    const key = word.toLocaleLowerCase('la');
    if (collapse && seen.has(key)) seen.get(key).frequency++;
    else { const row = createRow(word); rows.push(row); seen.set(key, row); }
  }
  return rows;
}
export function moveRow(rows, index, direction) {
  const result = [...rows], destination = index + direction;
  if (index < 0 || index >= rows.length || destination < 0 || destination >= rows.length) return result;
  [result[index], result[destination]] = [result[destination], result[index]];
  return result;
}
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function toCsv(rows, { source = 'Latein', target = 'Deutsch' } = {}) {
  const records = [[source, target, 'Notiz', 'Häufigkeit'], ...rows.map(r => [r.word, r.translation, r.note, r.frequency])];
  return '\uFEFF' + records.map(record => record.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
