const ASSET_PREFIX = '/__asset_host/';
const NAV_PREFIX = '/__nav_host/';
const RUNTIME_PATH = '/__proxy_runtime.js';
const LAUNCHER_JS_PATH = '/__launcher.js';
const SESSION_PATH = '/__proxy_session';
const HOME_PATH = '/__home';
const COOKIE_NAME = 'schoolpoki_target';
const DEFAULT_ALLOWED = [
  'poki.com', '*.poki.com',
  'poki-cdn.com', '*.poki-cdn.com',
  'poki-gdn.com', '*.poki-gdn.com', '*.com','*.net','*.org','*.edu','*.gov','*.mil','*.int','*.biz','*.info','*.name','*.pro','*.coop','*.museum','*.aero','*.kr','*.co.kr','*.or.kr','*.re.kr','*.pe.kr','*.ne.kr','*.go.kr','*.ac.kr','*.seoul.kr','*.busan.kr','*.daegu.kr','*.incheon.kr','*.gwangju.kr','*.daejeon.kr','*.ulsan.kr','*.gyeonggi.kr','*.gangwon.kr','*.chungbuk.kr','*.chungnam.kr','*.jeonbuk.kr','*.jeonnam.kr','*.gyeongbuk.kr','*.gyeongnam.kr','*.jeju.kr','*.jp','*.co.jp','*.ne.jp','*.or.jp','*.go.jp','*.ac.jp','*.cn','*.com.cn','*.net.cn','*.org.cn','*.gov.cn','*.tw','*.com.tw','*.hk','*.com.hk','*.us','*.uk','*.co.uk','*.me.uk','*.org.uk','*.ltd.uk','*.plc.uk','*.ca','*.de','*.fr','*.au','*.com.au','*.ru','*.sg','*.com.sg','*.my','*.com.my','*.vn','*.com.vn','*.ph','*.com.ph','*.th','*.co.th','*.id','*.co.id','*.in','*.co.in','*.io','*.ai','*.co','*.me','*.tv','*.cc','*.to','*.xyz','*.app','*.dev','*.tech','*.online','*.site','*.website','*.store','*.shop','*.blog','*.club','*.space','*.top','*.vip','*.work','*.live','*.icu','*.buzz','*.today','*.news','*.agency','*.company','*.studio','*.design','*.photography','*.media','*.digital','*.marketing','*.solutions','*.systems','*.services','*.network','*.cloud','*.data','*.host','*.link','*.click','*.press','*.review','*.guide','*.expert','*.guru','*.wiki','*.mobi','*.tel','*.jobs','*.travel','*.asia','*.eu','*.ch','*.at','*.nl','*.be','*.it','*.es','*.pt','*.se','*.no','*.dk','*.fi','*.is','*.ie','*.pl','*.cz','*.hu','*.ro','*.bg','*.gr','*.tr','*.ua','*.br','*.com.br','*.ar','*.com.ar','*.mx','*.com.mx','*.cl','*.pe','*.ve','*.za','*.co.za','*.eg','*.ng','*.ke','*.ma','*.su','*.cat','*.post','*.radio','*.xxx','*.best','*.bid','*.box','*.buy','*.cam','*.ceo','*.chat','*.city','*.cool','*.date','*.download','*.earth','*.email','*.events','*.exchange','*.fail','*.fans','*.farm','*.fun','*.fyi','*.gallery','*.game','*.games','*.gifts','*.gold','*.help','*.house','*.immo','*.ink','*.life','*.loan','*.lol','*.ltd','*.market','*.mba','*.moe','*.one','*.ooo','*.party','*.pics','*.plus','*.pub','*.run','*.science','*.show','*.social','*.software','*.stream','*.support','*.team','*.tips','*.trade','*.video','*.web','*.win','*.world','*.wtf','*.zone'
];

function normalizeHost(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

function publicHostname(hostname) {
  const host = normalizeHost(hostname);
  if (!host || host.length > 253) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || !host.includes('.')) return false;
  if (!/^[a-z0-9.-]+$/.test(host) || host.includes('..')) return false;
  return host.split('.').every(label => label && label.length <= 63 && !label.startsWith('-') && !label.endsWith('-'));
}

function normalizePattern(value) {
  let pattern = String(value || '').trim().toLowerCase();
  if (!pattern || pattern === '*') return '';
  try {
    if (/^https?:\/\//.test(pattern)) pattern = new URL(pattern).hostname;
  } catch (_) {
    return '';
  }
  pattern = pattern.replace(/\.$/, '');
  if (pattern.startsWith('*.')) {
    const root = normalizeHost(pattern.slice(2));
    return publicHostname(root) ? `*.${root}` : '';
  }
  return publicHostname(pattern) ? pattern : '';
}

function allowedPatterns(env) {
  const extra = String(env?.ALLOWED_ORIGINS || '')
    .split(/[\s,;]+/)
    .map(normalizePattern)
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED, ...extra])];
}

function hostAllowed(hostname, patterns) {
  const host = normalizeHost(hostname);
  if (!publicHostname(host)) return false;
  return patterns.some(pattern => {
    if (pattern.startsWith('*.')) {
      const root = pattern.slice(2);
      return host.endsWith(`.${root}`) && host !== root;
    }
    return host === pattern;
  });
}

function parseCookies(request) {
  const result = {};
  for (const part of String(request.headers.get('cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(raw); } catch (_) { result[key] = raw; }
  }
  return result;
}

function targetCookie(host) {
  return `${COOKIE_NAME}=${encodeURIComponent(host)}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function assetBase(origin, host) {
  return `${origin}${ASSET_PREFIX}${encodeURIComponent(normalizeHost(host))}`;
}

function navBase(origin, host) {
  return `${origin}${NAV_PREFIX}${encodeURIComponent(normalizeHost(host))}`;
}

function decodePrefixed(incoming, prefix, patterns) {
  if (!incoming.pathname.startsWith(prefix)) return null;
  const rest = incoming.pathname.slice(prefix.length);
  const slash = rest.indexOf('/');
  const encodedHost = slash < 0 ? rest : rest.slice(0, slash);
  let host = '';
  try { host = normalizeHost(decodeURIComponent(encodedHost)); } catch (_) {}
  if (!hostAllowed(host, patterns)) throw new Error('host is not allowed');
  const path = slash < 0 ? '/' : rest.slice(slash);
  return { host, url: new URL(`https://${host}${path}${incoming.search}`) };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function launcherHtml() {
  return new Response(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>URL 열기</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5f7;color:#16181d}.card{width:min(720px,calc(100% - 32px));background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:28px;box-shadow:0 16px 40px rgba(0,0,0,.08)}h1{font-size:24px;margin:0 0 8px}.sub{margin:0 0 22px;color:#667085}.row{display:flex;gap:10px}input{flex:1;min-width:0;border:1px solid #cfd4dc;border-radius:12px;padding:14px 15px;font:inherit;background:#fff;color:#111827;outline:none}button{border:0;border-radius:12px;padding:13px 17px;font:600 14px/1 system-ui;cursor:pointer}.go{background:#111827;color:#fff}.status{min-height:20px;margin-top:12px;font-size:13px;color:#667085}.history{margin-top:22px;padding-top:18px;border-top:1px solid #eaecf0}.history-head{display:flex;justify-content:space-between;align-items:center}.history-title{font-size:14px;font-weight:700}.clear{background:transparent;color:#667085;padding:8px}.history-list{display:grid;gap:7px;margin-top:10px}.history-item{width:100%;text-align:left;background:#f8fafc;color:#344054;border:1px solid #eaecf0;padding:10px 12px;border-radius:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.more{width:100%;margin-top:10px;background:#eef1f5;color:#344054}.empty{color:#98a2b3;font-size:13px;padding:10px 2px}.note{margin-top:18px;color:#667085;font-size:12px;line-height:1.5}@media(max-width:560px){.row{flex-direction:column}.go{height:46px}}@media(prefers-color-scheme:dark){body{background:#0e1014;color:#f8fafc}.card{background:#171a20;border-color:#2a2f38}.sub,.status,.note,.clear{color:#aab2c0}input{background:#101318;color:#f8fafc;border-color:#353c48}.go{background:#f8fafc;color:#111827}.history{border-color:#2a2f38}.history-item{background:#11151b;color:#e5e7eb;border-color:#2a2f38}.more{background:#252b34;color:#e5e7eb}}
</style>
</head>
<body>
<main class="card">
  <h1>웹페이지 열기</h1>
  <p class="sub">불러올 HTTPS 주소를 입력하세요.</p>
  <div class="row">
    <input id="url" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="https://example.com/">
    <button id="go" class="go" type="button">접속</button>
  </div>
  <div id="status" class="status"></div>
  <section class="history">
    <div class="history-head"><div class="history-title">최근 방문 웹사이트</div><button id="clear" class="clear" type="button">전체 삭제</button></div>
    <div id="history" class="history-list"></div>
    <button id="more" class="more" type="button" hidden>더보기</button>
  </section>
  <div class="note">직접 입력해 조회한 URL만 저장합니다. 리다이렉트와 사이트 내부 이동은 최근 기록에 추가하지 않습니다.</div>
</main>
<script src="${LAUNCHER_JS_PATH}" defer></script>
</body>
</html>`, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff'
    }
  });
}

function launcherJavascript() {
  return String.raw`(()=>{
'use strict';
const KEY='schoolpoki.recentUrls.v4';
const SIZE=5;
const input=document.getElementById('url');
const go=document.getElementById('go');
const status=document.getElementById('status');
const list=document.getElementById('history');
const more=document.getElementById('more');
const clear=document.getElementById('clear');
let visible=SIZE;

function normalizeUrl(raw){
  let value=String(raw||'').trim();
  if(!value) return '';
  if(!/^https?:\/\//i.test(value)) value='https://'+value;
  try{
    const url=new URL(value);
    return url.protocol==='https:'?url.href:'';
  }catch(_){
    return '';
  }
}

function readHistory(){
  try{
    const value=JSON.parse(localStorage.getItem(KEY)||'[]');
    return Array.isArray(value)?value:[];
  }catch(_){
    return [];
  }
}

function writeHistory(items){
  try{ localStorage.setItem(KEY,JSON.stringify(items.slice(0,100))); }catch(_){}
}

function saveHistory(raw,url){
  const items=readHistory().filter(item=>item.url!==url);
  items.unshift({display:String(raw||'').trim()||url,url,visitedAt:Date.now()});
  writeHistory(items);
}

function renderHistory(){
  const items=readHistory();
  list.textContent='';
  if(!items.length){
    const empty=document.createElement('div');
    empty.className='empty';
    empty.textContent='최근 방문 기록이 없습니다.';
    list.appendChild(empty);
  }else{
    for(const item of items.slice(0,visible)){
      const button=document.createElement('button');
      button.type='button';
      button.className='history-item';
      button.textContent=item.display||item.url;
      button.title=item.url;
      button.addEventListener('click',()=>openUrl(item.display||item.url,false));
      list.appendChild(button);
    }
  }
  more.hidden=items.length<=visible;
  clear.hidden=!items.length;
}

async function openUrl(raw,store){
  const url=normalizeUrl(raw);
  if(!url){
    status.textContent='올바른 HTTPS 주소를 입력하세요.';
    return;
  }
  status.textContent='연결 중...';
  try{
    const response=await fetch('${SESSION_PATH}',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({url})
    });
    if(!response.ok){
      status.textContent=await response.text();
      return;
    }
    const data=await response.json();
    if(store) saveHistory(raw,url);
    location.assign(data.path);
  }catch(_){
    status.textContent='연결 설정에 실패했습니다.';
  }
}

go.addEventListener('click',()=>openUrl(input.value,true));
input.addEventListener('keydown',event=>{
  if(event.key==='Enter'){
    event.preventDefault();
    openUrl(input.value,true);
  }
});
more.addEventListener('click',()=>{visible+=SIZE;renderHistory();});
clear.addEventListener('click',()=>{try{localStorage.removeItem(KEY);}catch(_){}visible=SIZE;renderHistory();});

(async()=>{
  try{
    if(navigator.clipboard?.readText){
      const text=await navigator.clipboard.readText();
      const url=normalizeUrl(text);
      if(url){
        input.value=String(text).trim();
        status.textContent='클립보드의 URL을 자동 입력했습니다.';
      }
    }
  }catch(_){}
})();

renderHistory();
input.focus();
})();`;
}

function requestHeaders(request, upstream) {
  const headers = new Headers(request.headers);
  for (const name of ['host','cf-connecting-ip','cf-ipcountry','cf-ray','cf-visitor','x-forwarded-for','x-forwarded-proto','x-real-ip','cookie']) headers.delete(name);
  headers.delete('accept-encoding');
  if (headers.has('origin')) headers.set('origin', upstream.origin);
  if (headers.has('referer')) headers.set('referer', `${upstream.origin}/`);
  return headers;
}

function responseHeaders(response) {
  const headers = new Headers(response.headers);
  for (const name of ['content-length','content-encoding','transfer-encoding']) headers.delete(name);
  return headers;
}

function textLike(contentType) {
  const type = String(contentType || '').toLowerCase();
  return type.startsWith('text/') || type.includes('javascript') || type.includes('json') || type.includes('xml') || type.includes('svg');
}

function rewriteAbsolute(text, origin, patterns, currentHost, cleanMode) {
  const replacement = (host, escaped = false) => {
    host = normalizeHost(host);
    if (!hostAllowed(host, patterns)) return null;
    if (cleanMode && host === normalizeHost(currentHost)) return '';
    const base = assetBase(origin, host);
    return escaped ? base.replace(/\//g, '\\/') : base;
  };

  text = text.replace(/https:\/\/([a-z0-9.-]+)(?=[:/])/gi, (all, host) => {
    const value = replacement(host);
    return value === null ? all : value;
  });
  text = text.replace(/(^|[^:])\/\/([a-z0-9.-]+)(?=[:/])/gim, (all, prefix, host) => {
    const value = replacement(host);
    return value === null ? all : prefix + value;
  });
  text = text.replace(/https:\\\/\\\/([a-z0-9.-]+)(?=\\\/)/gi, (all, host) => {
    const value = replacement(host, true);
    return value === null ? all : value;
  });
  return text;
}

function rewriteNavigationAttributes(html, origin, upstream, patterns, cleanMode) {
  const current = normalizeHost(upstream.hostname);
  return html.replace(/\b(href|action)\s*=\s*(["'])(https:\/\/([a-z0-9.-]+)([^"']*))\2/gi,
    (all, attr, quote, full, host, rest) => {
      host = normalizeHost(host);
      if (!hostAllowed(host, patterns)) return all;
      let value;
      if (host === current) {
        value = cleanMode ? rest || '/' : assetBase(origin, host) + (rest || '/');
      } else {
        value = navBase(origin, host) + (rest || '/');
      }
      return `${attr}=${quote}${value}${quote}`;
    });
}

function rewriteHtml(html, origin, upstream, patterns, cleanMode) {
  html = rewriteNavigationAttributes(html, origin, upstream, patterns, cleanMode);
  html = rewriteAbsolute(html, origin, patterns, upstream.hostname, cleanMode);

  if (!cleanMode) {
    const base = assetBase(origin, upstream.hostname);
    html = html.replace(/(\b(?:src|href|action|poster|data)\s*=\s*["']?)\/(?!\/)/gi, `$1${base}/`);
  }

  const tag = `<script id="schoolpoki-proxy-runtime" src="${RUNTIME_PATH}" data-upstream="${escapeHtml(upstream.href)}" data-current-host="${escapeHtml(upstream.hostname)}" data-clean="${cleanMode ? '1' : '0'}" data-patterns="${escapeHtml(JSON.stringify(patterns))}"></script>`;
  if (!html.includes('id="schoolpoki-proxy-runtime"')) {
    html = /<head\b[^>]*>/i.test(html)
      ? html.replace(/<head\b[^>]*>/i, match => match + tag)
      : tag + html;
  }
  return html;
}

function rewriteCss(css, origin, upstream, patterns, cleanMode) {
  css = rewriteAbsolute(css, origin, patterns, upstream.hostname, cleanMode);
  if (!cleanMode) {
    const base = assetBase(origin, upstream.hostname);
    css = css.replace(/url\(\s*(["']?)\/((?!\/)[^)"']*)\1\s*\)/gi, `url($1${base}/$2$1)`);
  }
  return css;
}

function runtimeJavascript() {
  return String.raw`(()=>{
'use strict';
const tag=document.currentScript;
if(!tag||window.__schoolpokiRuntime) return;
window.__schoolpokiRuntime=1;
const ORIGIN=location.origin;
const ASSET='${ASSET_PREFIX}';
const NAV='${NAV_PREFIX}';
const upstream=tag.dataset.upstream||'';
const currentHost=(tag.dataset.currentHost||'').toLowerCase();
const clean=tag.dataset.clean==='1';
const inFrame=window.top!==window;
let patterns=[];
try{patterns=JSON.parse(tag.dataset.patterns||'[]')||[];}catch(_){}
const norm=value=>String(value||'').trim().toLowerCase().replace(/\.$/,'');
function allowed(host){
  host=norm(host);
  return patterns.some(pattern=>{
    pattern=norm(pattern);
    if(pattern.startsWith('*.')){
      const root=pattern.slice(2);
      return host.endsWith('.'+root)&&host!==root;
    }
    return host===pattern;
  });
}
function assetBase(host){return ORIGIN+ASSET+encodeURIComponent(norm(host));}
function navBase(host){return ORIGIN+NAV+encodeURIComponent(norm(host));}
function asUrl(value){try{return new URL(value instanceof URL?value.href:String(value),upstream);}catch(_){return null;}}
function sameHostPath(url){
  if(clean&&!inFrame) return url.pathname+url.search+url.hash;
  return assetBase(currentHost)+url.pathname+url.search+url.hash;
}
function asset(value){
  if(value==null) return value;
  const raw=value instanceof URL?value.href:String(value);
  if(!raw||/^(?:data|blob|javascript|about|mailto|tel):/i.test(raw)) return value;
  const url=asUrl(value);
  if(!url||url.protocol!=='https:'||!allowed(url.hostname)) return value;
  if(url.origin===ORIGIN&&(url.pathname.startsWith(ASSET)||url.pathname.startsWith(NAV))) return url.href;
  if(norm(url.hostname)===currentHost) return sameHostPath(url);
  return assetBase(url.hostname)+url.pathname+url.search+url.hash;
}
function navigate(value){
  const url=asUrl(value);
  if(!url||url.protocol!=='https:'||!allowed(url.hostname)) return value;
  if(norm(url.hostname)===currentHost) return sameHostPath(url);
  if(inFrame) return assetBase(url.hostname)+url.pathname+url.search+url.hash;
  return navBase(url.hostname)+url.pathname+url.search+url.hash;
}
function patch(proto,prop,transform){
  try{
    const d=Object.getOwnPropertyDescriptor(proto,prop);
    if(!d||!d.get||!d.set||!d.configurable) return;
    Object.defineProperty(proto,prop,{configurable:true,enumerable:d.enumerable,get:d.get,set(value){return d.set.call(this,transform(value));}});
  }catch(_){}
}
const nativeFetch=window.fetch;
if(nativeFetch) window.fetch=function(input,init){
  try{
    if(input instanceof Request){const next=asset(input.url);if(next!==input.url) input=new Request(next,input);}
    else input=asset(input);
  }catch(_){}
  return nativeFetch.call(this,input,init);
};
const xhrOpen=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(method,url){const args=[...arguments];args[1]=asset(url);return xhrOpen.apply(this,args);};
if(navigator.sendBeacon){const beacon=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=(url,data)=>beacon(asset(url),data);}
if(window.EventSource){const Native=window.EventSource;window.EventSource=function(url,options){return new Native(asset(url),options);};window.EventSource.prototype=Native.prototype;}
for(const name of ['Worker','SharedWorker']){const Native=window[name];if(Native){window[name]=function(url,options){return new Native(asset(url),options);};window[name].prototype=Native.prototype;}}
const setAttribute=Element.prototype.setAttribute;
Element.prototype.setAttribute=function(name,value){
  const lower=String(name).toLowerCase();
  if(lower==='href'&&(this instanceof HTMLAnchorElement||this instanceof HTMLAreaElement)) value=navigate(value);
  else if(lower==='action'&&this instanceof HTMLFormElement) value=navigate(value);
  else if(['src','href','action','poster','data'].includes(lower)) value=asset(value);
  return setAttribute.call(this,name,value);
};
patch(HTMLAnchorElement.prototype,'href',navigate);
if(window.HTMLAreaElement) patch(HTMLAreaElement.prototype,'href',navigate);
patch(HTMLFormElement.prototype,'action',navigate);
for(const pair of [
  [HTMLImageElement.prototype,'src'],[HTMLScriptElement.prototype,'src'],[HTMLIFrameElement.prototype,'src'],
  [HTMLLinkElement.prototype,'href'],[HTMLSourceElement.prototype,'src'],[HTMLMediaElement.prototype,'src'],
  [HTMLVideoElement.prototype,'poster'],[HTMLObjectElement.prototype,'data']
]) patch(pair[0],pair[1],asset);
})();`;
}

function jsResponse(code) {
  return new Response(code, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff'
    }
  });
}

async function proxyResponse(context, upstream, patterns, cleanMode, mode) {
  const { request } = context;
  const incoming = new URL(request.url);
  const init = {
    method: request.method,
    headers: requestHeaders(request, upstream),
    redirect: 'manual'
  };
  if (!['GET','HEAD'].includes(request.method)) init.body = request.body;

  let response;
  try {
    response = await fetch(upstream.href, init);
  } catch (error) {
    return new Response(`원본 서버에 연결할 수 없습니다: ${error?.message || 'fetch failed'}`, {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (location) {
      try {
        const target = new URL(location, upstream);
        if (target.protocol !== 'https:' || !hostAllowed(target.hostname, patterns)) {
          return new Response(`리다이렉트 대상 ${target.hostname} 이(가) 허용 목록에 없습니다.`, {
            status: 403,
            headers: { 'content-type': 'text/plain; charset=utf-8' }
          });
        }
        const status = [301,302,303,307,308].includes(response.status) ? response.status : 302;
        const sameHost = normalizeHost(target.hostname) === normalizeHost(upstream.hostname);
        if (mode === 'clean') {
          const headers = new Headers({ location: target.pathname + target.search + target.hash });
          if (!sameHost) headers.append('set-cookie', targetCookie(target.hostname));
          return new Response(null, { status, headers });
        }
        const base = mode === 'nav' ? navBase(incoming.origin, target.hostname) : assetBase(incoming.origin, target.hostname);
        return Response.redirect(base + target.pathname + target.search + target.hash, status);
      } catch (_) {}
    }
  }

  const headers = responseHeaders(response);
  const contentType = String(headers.get('content-type') || '').toLowerCase();
  if (request.method === 'HEAD' || !textLike(contentType)) {
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  let body = await response.text();
  if (contentType.includes('text/html')) body = rewriteHtml(body, incoming.origin, upstream, patterns, cleanMode);
  else if (contentType.includes('text/css')) body = rewriteCss(body, incoming.origin, upstream, patterns, cleanMode);
  else body = rewriteAbsolute(body, incoming.origin, patterns, upstream.hostname, cleanMode);

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const incoming = new URL(request.url);
  const patterns = allowedPatterns(env);

  if (incoming.pathname === LAUNCHER_JS_PATH) return jsResponse(launcherJavascript());
  if (incoming.pathname === RUNTIME_PATH || incoming.pathname === '/__poki_runtime' || incoming.pathname === '/__poki_runtime.js') return jsResponse(runtimeJavascript());

  if (incoming.pathname === HOME_PATH) {
    const response = launcherHtml();
    response.headers.append('set-cookie', clearCookie());
    return response;
  }

  if (incoming.pathname === SESSION_PATH) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    let data;
    try { data = await request.json(); } catch (_) { return new Response('잘못된 요청입니다.', { status: 400 }); }
    let target;
    try { target = new URL(String(data?.url || '')); } catch (_) { return new Response('올바른 URL이 아닙니다.', { status: 400 }); }
    if (target.protocol !== 'https:' || !hostAllowed(target.hostname, patterns)) {
      return new Response('허용되지 않은 HTTPS 도메인입니다.', { status: 403 });
    }
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    headers.append('set-cookie', targetCookie(target.hostname));
    return new Response(JSON.stringify({ path: target.pathname + target.search + target.hash }), { headers });
  }

  let decoded;
  try {
    decoded = decodePrefixed(incoming, ASSET_PREFIX, patterns);
    if (decoded) return proxyResponse(context, decoded.url, patterns, false, 'asset');
    decoded = decodePrefixed(incoming, NAV_PREFIX, patterns);
    if (decoded) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return proxyResponse(context, decoded.url, patterns, false, 'nav');
      const headers = new Headers({ location: decoded.url.pathname + decoded.url.search + decoded.url.hash });
      headers.append('set-cookie', targetCookie(decoded.host));
      return new Response(null, { status: 302, headers });
    }
  } catch (error) {
    return new Response(`허용되지 않은 도메인입니다. ${error?.message || ''}`, { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  const cookieHost = normalizeHost(parseCookies(request)[COOKIE_NAME]);
  if (!cookieHost || !hostAllowed(cookieHost, patterns)) {
    if (incoming.pathname === '/') return launcherHtml();
    return Response.redirect(`${incoming.origin}${HOME_PATH}`, 302);
  }

  const upstream = new URL(`https://${cookieHost}${incoming.pathname}${incoming.search}`);
  return proxyResponse(context, upstream, patterns, true, 'clean');
}
