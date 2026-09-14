const ASSET_PREFIX = '/__asset_host/';
const NAV_PREFIX = '/__nav_host/';
const RUNTIME_PATH = '/__proxy_runtime.js';
const SESSION_PATH = '/__proxy_session';
const HOME_PATH = '/__home';
const COOKIE_NAME = 'schoolpoki_target';
const DEFAULT_ALLOWED = [
  'poki.com','*.poki.com',
  'poki-cdn.com','*.poki-cdn.com',
  'poki-gdn.com','*.poki-gdn.com'
];

function normalizeHost(v){ return String(v||'').trim().toLowerCase().replace(/\.$/,''); }
function publicHostname(hostname){
  const host=normalizeHost(hostname);
  if(!host||host.length>253) return false;
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')) return false;
  if(host.includes(':')||/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)||!host.includes('.')) return false;
  if(!/^[a-z0-9.-]+$/.test(host)||host.includes('..')) return false;
  return host.split('.').every(x=>x&&x.length<=63&&!x.startsWith('-')&&!x.endsWith('-'));
}
function normalizePattern(v){
  let s=String(v||'').trim().toLowerCase();
  if(!s||s==='*') return '';
  try{ if(/^https?:\/\//.test(s)) s=new URL(s).hostname; }catch(_){ return ''; }
  s=s.replace(/\.$/,'');
  if(s.startsWith('*.')){ const root=normalizeHost(s.slice(2)); return publicHostname(root)?`*.${root}`:''; }
  return publicHostname(s)?s:'';
}
function allowedPatterns(env){
  const extra=String(env?.ALLOWED_ORIGINS||'').split(/[\s,;]+/).map(normalizePattern).filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED,...extra])];
}
function hostAllowed(hostname,patterns){
  const host=normalizeHost(hostname);
  if(!publicHostname(host)) return false;
  return patterns.some(p=>p.startsWith('*.')?(host.endsWith('.'+p.slice(2))&&host!==p.slice(2)):host===p);
}
function parseCookies(request){
  const out={};
  for(const part of String(request.headers.get('cookie')||'').split(';')){
    const i=part.indexOf('='); if(i<0) continue;
    const k=part.slice(0,i).trim(); const v=part.slice(i+1).trim();
    try{ out[k]=decodeURIComponent(v); }catch(_){ out[k]=v; }
  }
  return out;
}
function targetCookie(host){ return `${COOKIE_NAME}=${encodeURIComponent(host)}; Path=/; HttpOnly; Secure; SameSite=Lax`; }
function clearCookie(){ return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`; }
function assetBase(origin,host){ return `${origin}${ASSET_PREFIX}${encodeURIComponent(normalizeHost(host))}`; }
function navBase(origin,host){ return `${origin}${NAV_PREFIX}${encodeURIComponent(normalizeHost(host))}`; }
function encodeTarget(base,target){ return `${base}${target.pathname}${target.search}${target.hash}`; }

function decodePrefixed(incoming,prefix,patterns){
  if(!incoming.pathname.startsWith(prefix)) return null;
  const rest=incoming.pathname.slice(prefix.length);
  const slash=rest.indexOf('/');
  const encoded=slash<0?rest:rest.slice(0,slash);
  let host=''; try{ host=normalizeHost(decodeURIComponent(encoded)); }catch(_){}
  if(!hostAllowed(host,patterns)) throw new Error('host is not allowed');
  const path=slash<0?'/':rest.slice(slash);
  return {url:new URL(`https://${host}${path}${incoming.search}`),host};
}

function escapeHtml(v){ return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function launcherHtml(){
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>URL 열기</title>
<style>:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5f7;color:#16181d}.card{width:min(720px,calc(100% - 32px));background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:28px;box-shadow:0 16px 40px rgba(0,0,0,.08)}h1{font-size:24px;margin:0 0 8px}.sub{margin:0 0 22px;color:#667085}.row{display:flex;gap:10px}input{flex:1;min-width:0;border:1px solid #cfd4dc;border-radius:12px;padding:14px 15px;font:inherit;background:#fff;color:#111827;outline:none}button{border:0;border-radius:12px;padding:13px 17px;font:600 14px/1 system-ui;cursor:pointer}.go{background:#111827;color:#fff}.status{min-height:20px;margin-top:12px;font-size:13px;color:#667085}.history{margin-top:22px;padding-top:18px;border-top:1px solid #eaecf0}.history-head{display:flex;justify-content:space-between;align-items:center}.history-title{font-size:14px;font-weight:700}.clear{background:transparent;color:#667085;padding:8px}.history-list{display:grid;gap:7px;margin-top:10px}.history-item{width:100%;text-align:left;background:#f8fafc;color:#344054;border:1px solid #eaecf0;padding:10px 12px;border-radius:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.more{width:100%;margin-top:10px;background:#eef1f5;color:#344054}.empty{color:#98a2b3;font-size:13px;padding:10px 2px}.note{margin-top:18px;color:#667085;font-size:12px;line-height:1.5}@media(max-width:560px){.row{flex-direction:column}.go{height:46px}}@media(prefers-color-scheme:dark){body{background:#0e1014;color:#f8fafc}.card{background:#171a20;border-color:#2a2f38}.sub,.status,.note,.clear{color:#aab2c0}input{background:#101318;color:#f8fafc;border-color:#353c48}.go{background:#f8fafc;color:#111827}.history{border-color:#2a2f38}.history-item{background:#11151b;color:#e5e7eb;border-color:#2a2f38}.more{background:#252b34;color:#e5e7eb}}</style></head><body>
<main class="card"><h1>웹페이지 열기</h1><p class="sub">불러올 HTTPS 주소를 입력하세요.</p><div class="row"><input id="url" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="https://example.com/"><button id="go" class="go" type="button">접속</button></div><div id="status" class="status"></div><section class="history"><div class="history-head"><div class="history-title">최근 방문 웹사이트</div><button id="clear" class="clear" type="button">전체 삭제</button></div><div id="history" class="history-list"></div><button id="more" class="more" type="button" hidden>더보기</button></section><div class="note">직접 입력해 조회한 URL만 저장합니다. 리다이렉트와 사이트 내부 이동은 최근 기록에 추가하지 않습니다.</div></main>
<script>(()=>{'use strict';const KEY='schoolpoki.recentUrls.v3',SIZE=5,input=document.getElementById('url'),go=document.getElementById('go'),status=document.getElementById('status'),list=document.getElementById('history'),more=document.getElementById('more'),clear=document.getElementById('clear');let visible=SIZE;
function norm(raw){let s=String(raw||'').trim();if(!s)return'';if(!/^https?:\/\//i.test(s))s='https://'+s;try{const u=new URL(s);return u.protocol==='https:'?u.href:''}catch(_){return''}}
function read(){try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch(_){return[]}}
function write(x){try{localStorage.setItem(KEY,JSON.stringify(x.slice(0,100)))}catch(_){}}
function save(raw,url){const arr=read().filter(x=>x.url!==url);arr.unshift({display:String(raw||'').trim()||url,url,visitedAt:Date.now()});write(arr)}
function render(){const arr=read();list.textContent='';if(!arr.length){const d=document.createElement('div');d.className='empty';d.textContent='최근 방문 기록이 없습니다.';list.appendChild(d)}else for(const item of arr.slice(0,visible)){const b=document.createElement('button');b.type='button';b.className='history-item';b.textContent=item.display||item.url;b.title=item.url;b.onclick=()=>open(item.display||item.url,false);list.appendChild(b)}more.hidden=arr.length<=visible;clear.hidden=!arr.length}
async function open(raw,store){const url=norm(raw);if(!url){status.textContent='올바른 HTTPS 주소를 입력하세요.';return}status.textContent='연결 중...';try{const r=await fetch('${SESSION_PATH}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url})});if(!r.ok){status.textContent=await r.text();return}const data=await r.json();if(store)save(raw,url);location.assign(data.path)}catch(_){status.textContent='연결 설정에 실패했습니다.'}}
go.onclick=()=>open(input.value,true);input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();open(input.value,true)}});more.onclick=()=>{visible+=SIZE;render()};clear.onclick=()=>{localStorage.removeItem(KEY);visible=SIZE;render()};
(async()=>{try{if(navigator.clipboard?.readText){const t=await navigator.clipboard.readText(),u=norm(t);if(u){input.value=String(t).trim();status.textContent='클립보드의 URL을 자동 입력했습니다.'}}}catch(_){} })();render();input.focus();})();</script></body></html>`;
}

function requestHeaders(request,upstream){
  const h=new Headers(request.headers);
  for(const k of ['host','cf-connecting-ip','cf-ipcountry','cf-ray','cf-visitor','x-forwarded-for','x-forwarded-proto','x-real-ip','cookie']) h.delete(k);
  h.delete('accept-encoding');
  if(h.has('origin')) h.set('origin',upstream.origin);
  if(h.has('referer')) h.set('referer',upstream.origin+'/');
  return h;
}
function responseHeaders(response){ const h=new Headers(response.headers); for(const k of ['content-length','content-encoding','transfer-encoding']) h.delete(k); return h; }
function textLike(t){ t=String(t||'').toLowerCase(); return t.startsWith('text/')||t.includes('javascript')||t.includes('json')||t.includes('xml')||t.includes('svg'); }

function rewriteAbsolute(text,origin,patterns,currentHost,clean){
  const replaceHost=(host,escaped=false)=>{
    host=normalizeHost(host); if(!hostAllowed(host,patterns)) return null;
    if(clean&&host===normalizeHost(currentHost)) return '';
    const base=assetBase(origin,host); return escaped?base.replace(/\//g,'\\/'):base;
  };
  text=text.replace(/https:\/\/([a-z0-9.-]+)(?=[:/])/gi,(all,h)=>{const r=replaceHost(h);return r===null?all:r});
  text=text.replace(/(^|[^:])\/\/([a-z0-9.-]+)(?=[:/])/gim,(all,p,h)=>{const r=replaceHost(h);return r===null?all:p+r});
  text=text.replace(/https:\\\/\\\/([a-z0-9.-]+)(?=\\\/)/gi,(all,h)=>{const r=replaceHost(h,true);return r===null?all:r});
  return text;
}
function rewriteHtml(html,origin,upstream,patterns,clean){
  html=rewriteAbsolute(html,origin,patterns,upstream.hostname,clean);
  if(!clean){ const base=assetBase(origin,upstream.hostname); html=html.replace(/(\b(?:src|href|action|poster|data)\s*=\s*["']?)\/(?!\/)/gi,`$1${base}/`); }
  const tag=`<script id="schoolpoki-proxy-runtime" src="${RUNTIME_PATH}" data-upstream="${escapeHtml(upstream.href)}" data-current-host="${escapeHtml(upstream.hostname)}" data-patterns="${escapeHtml(JSON.stringify(patterns))}"></script>`;
  if(!html.includes('id="schoolpoki-proxy-runtime"')) html=/<head\b[^>]*>/i.test(html)?html.replace(/<head\b[^>]*>/i,m=>m+tag):tag+html;
  return html;
}
function rewriteCss(css,origin,upstream,patterns,clean){
  css=rewriteAbsolute(css,origin,patterns,upstream.hostname,clean);
  if(!clean){const base=assetBase(origin,upstream.hostname);css=css.replace(/url\(\s*(["']?)\/((?!\/)[^)"']*)\1\s*\)/gi,`url($1${base}/$2$1)`)}
  return css;
}
function rewriteJs(js,origin,upstream,patterns,clean){ return rewriteAbsolute(js,origin,patterns,upstream.hostname,clean); }

function runtimeJavascript(){ return String.raw`(()=>{'use strict';const tag=document.currentScript;if(!tag||window.__schoolpokiRuntime)return;window.__schoolpokiRuntime=1;const ORIGIN=location.origin,ASSET='${ASSET_PREFIX}',NAV='${NAV_PREFIX}',upstream=tag.dataset.upstream||'',currentHost=(tag.dataset.currentHost||'').toLowerCase();let patterns=[];try{patterns=JSON.parse(tag.dataset.patterns||'[]')}catch(_){}const norm=v=>String(v||'').trim().toLowerCase().replace(/\.$/,'');function allowed(h){h=norm(h);return patterns.some(p=>{p=norm(p);return p.startsWith('*.')?(h.endsWith('.'+p.slice(2))&&h!==p.slice(2)):h===p})}function assetBase(h){return ORIGIN+ASSET+encodeURIComponent(norm(h))}function navBase(h){return ORIGIN+NAV+encodeURIComponent(norm(h))}function asUrl(v){try{return new URL(v instanceof URL?v.href:String(v),upstream)}catch(_){return null}}function asset(v){if(v==null)return v;const raw=v instanceof URL?v.href:String(v);if(!raw||/^(?:data|blob|javascript|about|mailto|tel):/i.test(raw))return v;const u=asUrl(v);if(!u||u.protocol!=='https:'||!allowed(u.hostname))return v;if(u.origin===ORIGIN&&(u.pathname.startsWith(ASSET)||u.pathname.startsWith(NAV)))return u.href;if(norm(u.hostname)===currentHost)return u.pathname+u.search+u.hash;return assetBase(u.hostname)+u.pathname+u.search+u.hash}function nav(v){const u=asUrl(v);if(!u||u.protocol!=='https:'||!allowed(u.hostname))return v;if(norm(u.hostname)===currentHost)return u.pathname+u.search+u.hash;return navBase(u.hostname)+u.pathname+u.search+u.hash}const f=window.fetch;if(f)window.fetch=function(i,o){try{if(i instanceof Request){const n=asset(i.url);if(n!==i.url)i=new Request(n,i)}else i=asset(i)}catch(_){}return f.call(this,i,o)};const xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){const a=[...arguments];a[1]=asset(u);return xo.apply(this,a)};if(navigator.sendBeacon){const b=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=(u,d)=>b(asset(u),d)};if(window.EventSource){const E=window.EventSource;window.EventSource=function(u,o){return new E(asset(u),o)};window.EventSource.prototype=E.prototype}for(const n of ['Worker','SharedWorker']){const W=window[n];if(W){window[n]=function(u,o){return new W(asset(u),o)};window[n].prototype=W.prototype}}const sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){const k=String(n).toLowerCase();if(['src','poster','data'].includes(k))v=asset(v);else if(['href','action'].includes(k)&&(this instanceof HTMLAnchorElement||this instanceof HTMLFormElement))v=nav(v);else if(['href','action'].includes(k))v=asset(v);return sa.call(this,n,v)};document.addEventListener('click',e=>{const a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;const u=asUrl(a.getAttribute('href'));if(u&&u.protocol==='https:'&&allowed(u.hostname)){e.preventDefault();location.assign(nav(u.href))}},true);})();`; }
function runtimeResponse(){ return new Response(runtimeJavascript(),{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'}}); }

async function sessionResponse(request,patterns){
  let body; try{body=await request.json()}catch(_){return new Response('올바른 URL 요청이 아닙니다.',{status:400})}
  let u; try{u=new URL(String(body?.url||''))}catch(_){return new Response('올바른 URL을 입력하세요.',{status:400})}
  if(u.protocol!=='https:'||!hostAllowed(u.hostname,patterns)) return new Response('허용되지 않은 도메인입니다. ALLOWED_ORIGINS에 추가하세요.',{status:403});
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); headers.append('set-cookie',targetCookie(normalizeHost(u.hostname)));
  return new Response(JSON.stringify({path:u.pathname+u.search+u.hash||'/'}),{headers});
}

export async function onRequest(context){
  const {request,env}=context,incoming=new URL(request.url),patterns=allowedPatterns(env);
  if(incoming.pathname===RUNTIME_PATH) return runtimeResponse();
  if(incoming.pathname===SESSION_PATH&&request.method==='POST') return sessionResponse(request,patterns);
  if(incoming.pathname===HOME_PATH){const h=new Headers({'content-type':'text/html; charset=utf-8','cache-control':'no-store'});h.append('set-cookie',clearCookie());return new Response(launcherHtml(),{headers:h});}

  const cookies=parseCookies(request); const activeHost=normalizeHost(cookies[COOKIE_NAME]||'');
  const assetReq=decodePrefixed(incoming,ASSET_PREFIX,patterns); const navReq=decodePrefixed(incoming,NAV_PREFIX,patterns);
  let upstream=null,clean=false;
  if(navReq){
    const h=new Headers({'location':navReq.url.pathname+navReq.url.search+navReq.url.hash,'cache-control':'no-store'}); h.append('set-cookie',targetCookie(navReq.host)); return new Response(null,{status:302,headers:h});
  }
  if(assetReq){upstream=assetReq.url;clean=false}
  else if(activeHost&&hostAllowed(activeHost,patterns)){upstream=new URL(`https://${activeHost}${incoming.pathname}${incoming.search}`);clean=true}
  else if(incoming.pathname==='/'&&request.method==='GET'){return new Response(launcherHtml(),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}})}
  else{return Response.redirect(incoming.origin+'/',302)}

  const init={method:request.method,headers:requestHeaders(request,upstream),redirect:'manual'}; if(!['GET','HEAD'].includes(request.method))init.body=request.body;
  let response; try{response=await fetch(upstream.href,init)}catch(e){return new Response('원본 서버에 연결할 수 없습니다: '+(e?.message||'fetch failed'),{status:502,headers:{'content-type':'text/plain; charset=utf-8'}})}
  if(response.status>=300&&response.status<400){const loc=response.headers.get('location');if(loc){try{const t=new URL(loc,upstream);if(t.protocol!=='https:'||!hostAllowed(t.hostname,patterns))return new Response('리다이렉트 대상 도메인이 허용되지 않았습니다.',{status:403});const status=[301,302,303,307,308].includes(response.status)?response.status:302;if(clean){const h=new Headers({'location':t.pathname+t.search+t.hash,'cache-control':'no-store'});if(normalizeHost(t.hostname)!==activeHost)h.append('set-cookie',targetCookie(normalizeHost(t.hostname)));return new Response(null,{status,headers:h})}return Response.redirect(encodeTarget(assetBase(incoming.origin,t.hostname),t),status)}catch(_){}}}
  const headers=responseHeaders(response),ct=String(headers.get('content-type')||'').toLowerCase(); if(request.method==='HEAD'||!textLike(ct))return new Response(request.method==='HEAD'?null:response.body,{status:response.status,statusText:response.statusText,headers});
  let body=await response.text(); if(ct.includes('text/html'))body=rewriteHtml(body,incoming.origin,upstream,patterns,clean);else if(ct.includes('text/css'))body=rewriteCss(body,incoming.origin,upstream,patterns,clean);else if(ct.includes('javascript'))body=rewriteJs(body,incoming.origin,upstream,patterns,clean);else body=rewriteAbsolute(body,incoming.origin,patterns,upstream.hostname,clean);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
