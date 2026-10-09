export function validateQuery(value) {
  if (typeof value !== 'string') return null;
  const q = value.normalize('NFC');
  return [...q].length <= 100 && /^\p{L}[\p{L}\p{M}]*$/u.test(q) ? q : null;
}
export function allowedOrigin(origin) {
  if (origin === 'https://zwiebelrostbraten.github.io') return true;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.origin === origin;
  } catch { return false; }
}
const clean = value => typeof value === 'string' ? value.trim().slice(0, 500) : '';
export function parseResult(payload, query) {
  if (!Array.isArray(payload)) throw new Error('Ungültige Navigium-Antwort.');
  let malformed = false;
  for (const group of payload) {
    if (!Array.isArray(group?.searchItems)) { malformed = true; continue; }
    for (const item of group.searchItems) {
      const lemma = clean(item?.lemma);
      const meanings = (Array.isArray(item?.bedeutungenFlach) ? item.bedeutungenFlach :
        Array.isArray(item?.bedeutungsgruppe) ? item.bedeutungsgruppe.flatMap(g => Array.isArray(g?.bedeutung) ? g.bedeutung : []) : [])
        .map(clean).filter(Boolean).slice(0, 20);
      if (lemma && meanings.length) return { query, found: true, lemma, meanings, wordType: clean(item.wortart), classLabel: clean(item.klassenlabelMitKlammer) };
      malformed = true;
    }
  }
  if (malformed) throw new Error('Ungültige Navigium-Suchergebnisse.');
  return { query, found: false, lemma: '', meanings: [], wordType: '', classLabel: '' };
}
export async function handleRequest(request, fetcher = fetch) {
  const origin = request.headers.get('Origin');
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (allowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowedOrigin(origin)) return json({ error: 'Dieser Ursprung ist nicht erlaubt.' }, 403);
  const url = new URL(request.url);
  if (url.pathname !== '/lookup') return json({ error: 'Endpunkt nicht gefunden. Verwende /lookup?q=amo.' }, 404);
  if (request.method === 'OPTIONS') {
    if (!allowedOrigin(origin) || !['GET', null].includes(request.headers.get('Access-Control-Request-Method')) || request.headers.get('Access-Control-Request-Headers')) return json({ error: 'Preflight nicht erlaubt.' }, 403);
    return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
  }
  if (request.method !== 'GET') return json({ error: 'Nur GET und OPTIONS sind erlaubt.' }, 405);
  const query = validateQuery(url.searchParams.get('q'));
  if (!query || url.searchParams.getAll('q').length !== 1) return json({ error: 'q muss ein einzelnes Wort aus 1–100 Unicode-Buchstaben sein.' }, 400);
  try {
    const upstream = await fetcher('https://www.navigium.de/suchfunktion/_search?q=' + encodeURIComponent(query), {
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'manual', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache, no-store' }, signal: AbortSignal.timeout(15000)
    });
    if (!upstream.ok) throw new Error('upstream');
    return json(parseResult(await upstream.json(), query));
  } catch { return json({ error: 'Navigium ist nicht erreichbar oder liefert ungültige Daten. Bitte erneut versuchen.' }, 502); }
}
export default { fetch: request => handleRequest(request) };
