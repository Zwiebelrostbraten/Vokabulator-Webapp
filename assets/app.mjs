import { createRow, rowsFromText, moveRow, toCsv } from './core.mjs';
const $ = id => document.getElementById(id);
let rows = [];
const announce = message => { $('status').textContent = message; };
function render(focusId, action = 'word') {
  $('rows').replaceChildren();
  rows.forEach((row, index) => {
    const element = $('row-template').content.firstElementChild.cloneNode(true);
    element.dataset.id = row.id;
    element.querySelector('.row-number').textContent = String(index + 1).padStart(2, '0');
    for (const field of ['word', 'translation', 'note']) {
      const input = element.querySelector(`[data-field="${field}"]`);
      input.value = row[field];
      input.setAttribute('aria-label', `${field === 'word' ? 'Wortform' : field === 'translation' ? 'Übersetzung' : 'Notiz'} in Zeile ${index + 1}`);
      input.addEventListener('input', () => { row[field] = input.value; });
    }
    element.querySelector('.frequency').textContent = `${row.frequency}× im Text`;
    for (const name of ['up', 'down', 'delete']) {
      const button = element.querySelector(`[data-action="${name}"]`);
      button.setAttribute('aria-label', `Zeile ${index + 1} ${name === 'up' ? 'nach oben' : name === 'down' ? 'nach unten' : 'löschen'}`);
      button.disabled = name === 'up' ? index === 0 : name === 'down' ? index === rows.length - 1 : false;
      button.addEventListener('click', () => {
        if (name === 'delete') {
          rows = rows.filter(r => r.id !== row.id);
          render(rows[Math.min(index, rows.length - 1)]?.id);
          if (!rows.length) $('add').focus();
          announce(`Zeile ${index + 1} gelöscht.`);
        } else {
          rows = moveRow(rows, index, name === 'up' ? -1 : 1);
          render(row.id, name); announce('Reihenfolge geändert.');
        }
      });
    }
    $('rows').append(element);
  });
  $('empty').hidden = rows.length > 0;
  $('count').textContent = `${rows.length} ${rows.length === 1 ? 'Wort' : 'Wörter'}`;
  $('csv').disabled = $('print').disabled = rows.length === 0;
  if (focusId) {
    const element = [...$('rows').children].find(el => el.dataset.id === focusId);
    element?.querySelector(action === 'word' ? '[data-field="word"]' : `[data-action="${action}"]`)?.focus();
  }
}
$('collect').addEventListener('click', () => {
  const added = rowsFromText($('text').value, $('collapse').checked);
  if (!added.length) { announce('Keine Wörter gefunden. Füge einen Text mit Buchstaben ein.'); $('text').focus(); return; }
  rows.push(...added); $('text').value = ''; render(added[0].id);
  announce(`${added.length} Wortformen übernommen. Ergänze jetzt deine Übersetzungen.`);
});
$('add').addEventListener('click', () => { const row = createRow(); rows.push(row); render(row.id); announce('Neue Zeile hinzugefügt.'); });
$('csv').addEventListener('click', () => {
  if (rows.some(row => !row.word.trim())) { announce('Bitte ergänze oder lösche leere Wortformen vor dem Export.'); render(rows.find(row => !row.word.trim()).id); return; }
  const blob = new Blob([toCsv(rows, { source: $('source').value.trim() || 'Latein', target: $('target').value.trim() || 'Deutsch' })], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = ($('title').value.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'Vokabelliste') + '.csv';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce('CSV heruntergeladen. Deine Liste bleibt hier bearbeitbar.');
});
function preparePrint() {
  const container = $('print-list'); container.replaceChildren();
  const heading = document.createElement('h1'); heading.textContent = $('title').value || 'Meine Vokabelliste'; container.append(heading);
  const table = document.createElement('table'), head = table.createTHead().insertRow();
  for (const label of [$('source').value || 'Latein', $('target').value || 'Deutsch', 'Notiz / Grammatik', 'Häufigkeit']) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th); }
  const body = table.createTBody();
  for (const row of rows) { const tr = body.insertRow(); for (const value of [row.word, row.translation, row.note, row.frequency]) tr.insertCell().textContent = value; }
  container.append(table);
}
window.addEventListener('beforeprint', preparePrint);
$('print').addEventListener('click', () => { preparePrint(); window.print(); });
window.addEventListener('beforeunload', event => { if (rows.length || $('text').value) { event.preventDefault(); event.returnValue = ''; } });
render();
