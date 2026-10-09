export function validateQuery(value) {
  if (typeof value !== 'string') return null;
  const q = value.normalize('NFC');
  return [...q].length <= 100 && /^\p{L}[\p{L}\p{M}]*$/u.test(q) ? q : null;
}
const clean = value => typeof value === 'string' ? value.trim().slice(0, 500) : '';
export function parseResult(payload, query) {
  if (!Array.isArray(payload)) throw new Error('Ungültige Navigium-Antwort.');
  let malformed = false;
  for (const group of payload) {
    if (!Array.isArray(group?.searchItems)) { malformed = true; continue; }
    for (const item of group.searchItems) {
      const lemma = clean(item?.lemma);
      const meanings = (Array.isArray(item?.bedeutungsgruppe) ? item.bedeutungsgruppe.flatMap(g => typeof g?.bedeutungJoined === 'string' ? [g.bedeutungJoined] : Array.isArray(g?.bedeutung) ? g.bedeutung : []) : Array.isArray(item?.bedeutungenFlach) ? item.bedeutungenFlach : [])
        .map(clean).filter(Boolean).slice(0, 20);
      if (lemma && meanings.length) return { query, found: true, lemma, meanings, wordType: clean(item.wortart), classLabel: clean(item.klassenlabel || item.klassenlabelMitKlammer), deponens: item.deponens === true, flexion: normalizeFlexion(item.flexion) };
      malformed = true;
    }
  }
  if (malformed) throw new Error('Ungültige Navigium-Suchergebnisse.');
  return { query, found: false, lemma: '', meanings: [], wordType: '', classLabel: '', deponens: false, flexion: [] };
}
// Keep only the paradigms used by the browser; do not relay arbitrary upstream fields.
function normalizeFlexion(value) {
  const useful = /^(?:SubstantivForm\((?:NOM|GEN|AKK|ABL),(?:SG|PL)\)|AdjektivForm\((?:NOM|GEN),(?:SG|PL),[mfn],(?:POS|KOMP|SUP)\)|InfinitivForm\(PRAES,(?:AKT|DEP)\)|VerbForm\(P1,SG,(?:PRAES|PERF),IND,(?:AKT|DEP),[mfn]\)|PartizipialForm\(PPP,AdjektivForm\(NOM,SG,n,POS\)\)|(?:Pronomen|Praeposition|Adverb|Konjunktion|Subjunktion)[^\n]{0,100})$/i;
  return (Array.isArray(value) ? value : []).filter(f => typeof f?.form === 'string' && useful.test(f.form) && Array.isArray(f.wort)).slice(0,100)
    .map(f => ({form:f.form.slice(0,150), wort:f.wort.slice(0,8).map(w=>clean(w).slice(0,150)).filter(Boolean)}));
}
async function readBoundedJson(response, limit = 1048576) {
  if (Number(response.headers.get('content-length')) > limit) throw Error('oversize');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw Error('oversize'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function allowedOrigin(origin) {
  if (origin === 'https://zwiebelrostbraten.github.io') return true;
  try {
    const url = new URL(origin);
    return url.origin === origin && ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/, '');
const decode = value => Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function signTicket(secret, claims) {
  const payload = encode(new TextEncoder().encode(JSON.stringify(claims)));
  return payload + '.' + encode(new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey(secret),new TextEncoder().encode(payload))));
}
async function validTicket(ticket, secret, origin, ip, now) {
  try {
    if (!ticket || ticket.length > 2048) return false;
    const parts = ticket.split('.');
    if (parts.length !== 2 || !parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p))) return false;
    if (!await crypto.subtle.verify('HMAC',await hmacKey(secret),decode(parts[1]),new TextEncoder().encode(parts[0]))) return false;
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    return claims.v === 1 && claims.origin === origin && claims.ip === ip && Number.isSafeInteger(claims.exp) && claims.exp > now && claims.exp <= now + 600000;
  } catch { return false; }
}
export async function handleRequest(request, fetcher = fetch, env = {}, now = Date.now) {
  const origin = request.headers.get('Origin');
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin', ...(allowedOrigin(origin) ? {'Access-Control-Allow-Origin':origin} : {}) };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!allowedOrigin(origin)) return json({error: 'Origin nicht erlaubt.'}, 403);
  const url = new URL(request.url);
  if (!['/lookup','/session'].includes(url.pathname)) return json({ error: 'Endpunkt nicht gefunden. Verwende /lookup?q=amo.' }, 404);
  if (request.method === 'OPTIONS') {
    const expectedMethod = url.pathname === '/session' ? 'POST' : 'GET';
    const method = request.headers.get('Access-Control-Request-Method');
    const requested = request.headers.get('Access-Control-Request-Headers');
    if ((method && method !== expectedMethod) || (requested && requested.split(',').some(h => !['content-type','authorization'].includes(h.trim().toLowerCase())))) return json({error:'Preflight nicht erlaubt.'},403);
    return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': expectedMethod + ', OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }
  const session = url.pathname === '/session';
  if (request.method !== (session ? 'POST' : 'GET')) return json({ error: 'Methode nicht erlaubt.' }, 405);
  const ip = request.headers.get('CF-Connecting-IP');
  if (typeof env.TURNSTILE_SECRET !== 'string' || !env.TURNSTILE_SECRET || typeof env.TICKET_HMAC_KEY !== 'string' || env.TICKET_HMAC_KEY.length < 32 || !env.LOOKUP_RATE_LIMITER?.limit || !env.SESSION_RATE_LIMITER?.limit || !ip) return json({error:'Sicherheitsdienst nicht konfiguriert.'},503);
  if (session) {
    let token;
    try {
      if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw Error('type');
      token = (await readBoundedJson(request,4096)).token;
      if (typeof token !== 'string' || !token.trim() || token.length > 2048) throw Error('token');
    } catch { return json({error:'Ungültige Sicherheitsprüfung.'},400); }
    try {
      const limited = await env.SESSION_RATE_LIMITER.limit({key:ip});
      if (limited.success === false) { headers['Retry-After']='60'; return json({error:'Zu viele Sicherheitsprüfungen. Bitte eine Minute warten.'},429); }
      if (limited.success !== true) throw Error('limiter');
      const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method:'POST', body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:token,remoteip:ip}),
        cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'manual',signal:AbortSignal.timeout(10000)
      });
      if (!response.ok) throw Error('verification');
      const result = await readBoundedJson(response,16384);
      if (result.success !== true || result.hostname !== new URL(origin).hostname || result.action !== 'vocabulary') return json({error:'Sicherheitsprüfung fehlgeschlagen. Bitte erneut versuchen.'},403);
      const expiresAt = now() + 600000;
      const ticket = await signTicket(env.TICKET_HMAC_KEY,{v:1,origin,ip,exp:expiresAt,nonce:crypto.randomUUID()});
      return json({ticket,expiresAt});
    } catch { return json({error:'Sicherheitsdienst nicht erreichbar. Bitte erneut versuchen.'},503); }
  }
  try {
    const limited = await env.LOOKUP_RATE_LIMITER.limit({key:ip});
    if (limited.success === false) { headers['Retry-After']='60'; return json({error:'Zu viele Abfragen. Bitte eine Minute warten.'},429); }
    if (limited.success !== true) throw Error('limiter');
  } catch { return json({error:'Anfragelimit nicht verfügbar. Bitte erneut versuchen.'},503); }
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ') || !await validTicket(authorization.slice(7),env.TICKET_HMAC_KEY,origin,ip,now())) return json({error:'Sicherheitsprüfung fehlt oder ist abgelaufen. Bitte neu generieren.'},401);
  const query = validateQuery(url.searchParams.get('q'));
  if (!query || url.searchParams.getAll('q').length !== 1) return json({ error: 'q muss ein einzelnes Wort aus 1–100 Unicode-Buchstaben sein.' }, 400);
  try {
    const upstream = await fetcher('https://www.navigium.de/suchfunktion/_search?q=' + encodeURIComponent(query), {
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'manual', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache, no-store' }, signal: AbortSignal.timeout(15000)
    });
    if (!upstream.ok) throw new Error('upstream');
    return json(parseResult(await readBoundedJson(upstream), query));
  } catch { return json({ error: 'Navigium ist nicht erreichbar oder liefert ungültige Daten. Bitte erneut versuchen.' }, 502); }
}
export default { fetch: (request, env) => handleRequest(request, fetch, env) };
