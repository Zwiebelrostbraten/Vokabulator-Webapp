export function isConfigured(base) {
  if (!base || base.includes('__WORKER_URL__')) return false;
  try { return ['https:', 'http:'].includes(new URL(base).protocol); } catch { return false; }
}
const key = word => word.normalize('NFC').toLocaleLowerCase('la');
export function applyResult(row, result, before) {
  if (!result.found) return;
  // Only prefill blank, unchanged fields; keep user-authored values on retries.
  if (!before.translation && (row.translation ?? '') === before.translation) row.translation = result.meanings[0];
  if (!before.note && (row.note ?? '') === before.note) row.note = [result.lemma, result.wordType, result.classLabel].filter(Boolean).join(' · ');
}
export async function lookupRows(rows, base, { fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), update = () => {} } = {}) {
  const groups = new Map();
  for (const row of rows) {
    const k = key(row.word);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ row, word: row.word, translation: row.translation ?? '', note: row.note ?? '' });
    row.lookupState = 'queued'; row.lookupMessage = 'Wartet auf API-Abfrage …';
  }
  update(0, groups.size);
  let completed = 0;
  for (const queued of groups.values()) {
    if (completed && isConfigured(base)) await sleep(1200);
    const group = queued.filter(({row, word}) => row.word === word);
    for (const {row, word} of queued) if (row.word !== word) { row.lookupState = 'idle'; row.lookupMessage = 'Wort geändert. Bitte erneut abfragen.'; }
    if (!group.length) { completed++; update(completed, groups.size); continue; }
    for (const {row} of group) { row.lookupState = 'loading'; row.lookupMessage = 'Navigium wird abgefragt …'; }
    update(completed, groups.size);
    try {
      if (!isConfigured(base)) throw new Error('API nicht konfiguriert: Worker-URL fehlt.');
      const q = group[0].word.normalize('NFC');
      if (!/^\p{L}[\p{L}\p{M}]*$/u.test(q) || [...q].length > 100) throw new Error('Bitte ein Wort aus 1–100 Buchstaben eingeben.');
      const res = await fetcher(base.replace(/\/$/, '') + '/lookup?q=' + encodeURIComponent(q), { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(20000) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `API-Fehler (${res.status}).`);
      if (typeof result.found !== 'boolean' || !Array.isArray(result.meanings) || (result.found && (!result.meanings.length || !result.meanings.every(m => typeof m === 'string') || typeof result.lemma !== 'string' || typeof result.wordType !== 'string' || typeof result.classLabel !== 'string'))) throw new Error('Ungültige API-Antwort.');
      for (const before of group) {
        const {row} = before;
        if (row.word !== before.word) continue;
        applyResult(row, result, before);
        row.lookupState = result.found ? 'found' : 'missing';
        row.lookupMessage = result.found ? 'Navigium: Treffer (erster Wörterbucheintrag).' : 'Navigium: kein Treffer. Eingaben bleiben erhalten.';
      }
    } catch (error) {
      for (const {row, word} of group) if (row.word === word) { row.lookupState = 'error'; row.lookupMessage = error.name === 'TimeoutError' ? 'API-Zeitüberschreitung. Bitte erneut versuchen.' : error.message; }
    }
    for (const {row, word} of group) if (row.word !== word) { row.lookupState = 'idle'; row.lookupMessage = 'Wort geändert. Bitte erneut abfragen.'; }
    completed++; update(completed, groups.size);
  }
}
