import { isConfigured } from './lookup.mjs';
export async function authorizeBatch(doc,base,siteKey,{signal,fetcher=fetch}={}) {
  if (!isConfigured(base)) throw Error('API nicht konfiguriert: Worker-URL fehlt.');
  if (!siteKey || siteKey.includes('__TURNSTILE_SITE_KEY__')) throw Error('Sicherheitsprüfung nicht konfiguriert.');
  const token=await turnstileToken(doc,siteKey,signal);
  let response,result;
  try {
    response=await fetcher(base.replace(/\/$/,'')+'/session',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),
      cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)
    });
    result=await response.json();
  } catch {
    signal?.throwIfAborted();
    throw Error('Sicherheitsdienst nicht erreichbar. Bitte erneut versuchen.');
  }
  if (!response.ok) throw Error(result.error || 'Sicherheitsprüfung fehlgeschlagen.');
  if (typeof result?.ticket !== 'string' || !result.ticket || result.ticket.length>2048) throw Error('Ungültige Sicherheitsantwort.');
  return result.ticket;
}
export function turnstileToken(doc,siteKey,signal) {
  return new Promise((resolve,reject)=>{
    const win=doc.defaultView;
    const container=doc.createElement('div');container.setAttribute('aria-label','Sicherheitsprüfung');doc.getElementById('generator').append(container);
    let widget,script,finished=false;
    const finish=(error,token)=>{
      if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
      if(script){script.onload=null;script.onerror=null;}
      if(widget!==undefined)win.turnstile?.remove(widget);
      container.remove();if(error)reject(error);else resolve(token);
    };
    const abort=()=>finish(signal.reason);
    const timer=setTimeout(()=>finish(Error('Sicherheitsprüfung dauert zu lange. Bitte erneut versuchen.')),120000);
    if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
    const render=()=>{
      if(finished)return;
      try {widget=win.turnstile.render(container,{sitekey:siteKey,action:'vocabulary',callback:token=>finish(null,token),'error-callback':()=>finish(Error('Sicherheitsprüfung fehlgeschlagen. Bitte erneut versuchen.')),'expired-callback':()=>finish(Error('Sicherheitsprüfung abgelaufen. Bitte erneut versuchen.'))});}
      catch {finish(Error('Sicherheitsprüfung konnte nicht geladen werden.'));}
    };
    if(win.turnstile){render();return;}
    script=doc.querySelector('script[data-turnstile]');
    if(!script){script=doc.createElement('script');script.dataset.turnstile='';script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;doc.head.append(script);}
    script.onload=render;script.onerror=()=>{script.remove();finish(Error('Sicherheitsprüfung konnte nicht geladen werden.'));};
  });
}
