const PROXY_PREFIX = '/__proxy_host/';
const RUNTIME_PATH = '/__proxy_runtime.js';
const LEGACY_RUNTIME_PATHS = new Set(['/__poki_runtime', '/__poki_runtime.js']);
const LEGACY_POKI_PREFIX = '/__poki_host/';
const DEFAULT_ALLOWED = [
  'poki.com',
  '*.poki.com',
  'poki-cdn.com',
  '*.poki-cdn.com',
  'poki-gdn.com',
  '*.poki-gdn.com'
];

function normalizeHost(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

function normalizePattern(value) {
  let s = String(value || '').trim().toLowerCase();
  if (!s) return '';
  try {
    if (/^https?:\/\//.test(s)) s = new URL(s).hostname;
  } catch (_) {
    return '';
  }
  s = s.replace(/\.$/, '');
  if (s === '*') return '';
  if (s.startsWith('*.')) {
    const root = normalizeHost(s.slice(2));
    return publicHostname(root) ? `*.${root}` : '';
  }
  return publicHostname(s) ? s : '';
}

function publicHostname(hostname) {
  const host = normalizeHost(hostname);
  if (!host || host.length > 253) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host.includes(':')) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  if (!host.includes('.')) return false;
  if (!/^[a-z0-9.-]+$/.test(host) || host.includes('..')) return false;
  return host.split('.').every(label => label && label.length <= 63 && !label.startsWith('-') && !label.endsWith('-'));
}

function allowedPatterns(env) {
  const raw = String(env?.ALLOWED_ORIGINS || '');
  const extra = raw.split(/[\s,;]+/).map(normalizePattern).filter(Boolean);
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

function proxyBase(origin, host) {
  return `${origin}${PROXY_PREFIX}${encodeURIComponent(normalizeHost(host))}`;
}

function proxyUrl(origin, target) {
  return `${proxyBase(origin, target.hostname)}${target.pathname}${target.search}${target.hash}`;
}

function decodeProxyRequest(incoming, patterns) {
  if (incoming.pathname.startsWith(PROXY_PREFIX)) {
    const rest = incoming.pathname.slice(PROXY_PREFIX.length);
    const slash = rest.indexOf('/');
    const encodedHost = slash === -1 ? rest : rest.slice(0, slash);
    let host = '';
    try { host = normalizeHost(decodeURIComponent(encodedHost)); } catch (_) {}
    if (!hostAllowed(host, patterns)) throw new Error('host is not allowed');
    const path = slash === -1 ? '/' : rest.slice(slash);
    return new URL(`https://${host}${path}${incoming.search}`);
  }

  if (incoming.pathname.startsWith(LEGACY_POKI_PREFIX)) {
    const rest = incoming.pathname.slice(LEGACY_POKI_PREFIX.length);
    const slash = rest.indexOf('/');
    const encodedHost = slash === -1 ? rest : rest.slice(0, slash);
    let host = '';
    try { host = normalizeHost(decodeURIComponent(encodedHost)); } catch (_) {}
    if (!hostAllowed(host, patterns)) throw new Error('host is not allowed');
    const path = slash === -1 ? '/' : rest.slice(slash);
    return new URL(`https://${host}${path}${incoming.search}`);
  }

  return null;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function launcherHtml(incoming, env) {
  const initial = incoming.searchParams.get('url') || '';
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>URL 열기</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5f7;color:#16181d}.card{width:min(680px,calc(100% - 32px));background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:28px;box-shadow:0 16px 40px rgba(0,0,0,.08)}h1{font-size:24px;margin:0 0 8px}.sub{margin:0 0 22px;color:#667085}.row{display:flex;gap:10px}input{flex:1;min-width:0;border:1px solid #cfd4dc;border-radius:12px;padding:14px 15px;font:inherit;background:#fff;color:#111827;outline:none}input:focus{border-color:#667085;box-shadow:0 0 0 3px rgba(102,112,133,.12)}button{border:0;border-radius:12px;padding:13px 17px;font:600 14px/1 system-ui;cursor:pointer}.go{background:#111827;color:#fff}.paste{margin-top:10px;background:#eef1f5;color:#344054}.status{min-height:20px;margin-top:12px;font-size:13px;color:#667085}.note{margin-top:20px;padding-top:18px;border-top:1px solid #eaecf0;color:#667085;font-size:12px;line-height:1.55}@media(max-width:560px){.row{flex-direction:column}.go{height:46px}}@media(prefers-color-scheme:dark){body{background:#0e1014;color:#f8fafc}.card{background:#171a20;border-color:#2a2f38}.sub,.status,.note{color:#aab2c0}input{background:#101318;color:#f8fafc;border-color:#353c48}.paste{background:#252b34;color:#e5e7eb}.go{background:#f8fafc;color:#111827}}
</style>
</head>
<body>
<main class="card">
  <h1>웹페이지 열기</h1>
  <p class="sub">불러올 HTTPS 주소를 입력하세요.</p>
  <form id="open-form" class="row">
    <input id="url" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="https://example.com/" value="${escapeHtml(initial)}" required>
    <button class="go" type="submit">접속</button>
  </form>
  <button id="paste" class="paste" type="button">클립보드에서 붙여넣기</button>
  <div id="status" class="status"></div>
  <div class="note">허용된 도메인만 백엔드를 통해 열립니다. 새 도메인은 Cloudflare Pages의 <b>ALLOWED_ORIGINS</b>에 쉼표로 추가할 수 있습니다.</div>
</main>
<script>
(() => {
  const input = document.getElementById('url');
  const form = document.getElementById('open-form');
  const paste = document.getElementById('paste');
  const status = document.getElementById('status');

  function normalize(raw){
    let s = String(raw || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try {
      const u = new URL(s);
      if (u.protocol !== 'https:') throw new Error('https only');
      return u.href;
    } catch (_) { return ''; }
  }

  function openUrl(raw){
    const value = normalize(raw);
    if (!value){ status.textContent = '올바른 HTTPS 주소를 입력하세요.'; return; }
    const u = new URL(value);
    location.href = ${JSON.stringify(PROXY_PREFIX)} + encodeURIComponent(u.hostname) + u.pathname + u.search + u.hash;
  }

  form.addEventListener('submit', e => { e.preventDefault(); openUrl(input.value); });
  paste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const value = normalize(text);
      if (!value) throw new Error();
      input.value = value;
      status.textContent = '클립보드 링크를 입력했습니다.';
    } catch (_) { status.textContent = '클립보드를 읽을 수 없습니다. 주소를 직접 붙여넣어 주세요.'; }
  });

  (async () => {
    if (input.value) return;
    try {
      const text = await navigator.clipboard.readText();
      const value = normalize(text);
      if (value){ input.value = value; status.textContent = '클립보드의 링크를 자동 입력했습니다.'; }
    } catch (_) {}
  })();
})();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function requestHeaders(request, upstream) {
  const headers = new Headers(request.headers);
  for (const h of ['host','cf-connecting-ip','cf-ipcountry','cf-ray','cf-visitor','x-forwarded-for','x-forwarded-proto','x-real-ip']) headers.delete(h);
  headers.delete('accept-encoding');
  if (headers.has('origin')) headers.set('origin', upstream.origin);
  if (headers.has('referer')) headers.set('referer', `${upstream.origin}/`);
  return headers;
}

function cleanResponseHeaders(upstream) {
  const headers = new Headers(upstream.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');
  return headers;
}

function textLike(contentType) {
  const t = String(contentType || '').toLowerCase();
  return t.startsWith('text/') || t.includes('javascript') || t.includes('json') || t.includes('xml') || t.includes('svg');
}

function rewriteAbsoluteUrls(text, origin, patterns) {
  if (!text) return text;

  text = text.replace(/https:\/\/([a-z0-9.-]+)(?=[:/])/gi, (all, host) => {
    const normalized = normalizeHost(host);
    return hostAllowed(normalized, patterns) ? proxyBase(origin, normalized) : all;
  });

  text = text.replace(/(^|[^:])\/\/([a-z0-9.-]+)(?=[:/])/gim, (all, prefix, host) => {
    const normalized = normalizeHost(host);
    return hostAllowed(normalized, patterns) ? `${prefix}${proxyBase(origin, normalized)}` : all;
  });

  text = text.replace(/https:\\\/\\\/([a-z0-9.-]+)(?=\\\/)/gi, (all, host) => {
    const normalized = normalizeHost(host);
    return hostAllowed(normalized, patterns) ? proxyBase(origin, normalized).replace(/\//g, '\\/') : all;
  });

  return text;
}

function rewriteHtml(html, origin, upstream, patterns) {
  const base = proxyBase(origin, upstream.hostname);
  html = rewriteAbsoluteUrls(html, origin, patterns);

  html = html.replace(/(\b(?:src|href|action|poster|data)\s*=\s*["']?)\/(?!\/)/gi, `$1${base}/`);
  html = html.replace(/(\bsrcset\s*=\s*["'])([^"']+)(["'])/gi, (all, start, value, end) => {
    const next = value.split(',').map(part => {
      const m = part.trim().match(/^(\/[^\s]+)(\s+.*)?$/);
      return m ? `${base}${m[1]}${m[2] || ''}` : part.trim();
    }).join(', ');
    return `${start}${next}${end}`;
  });

  if (!html.includes('id="schoolpoki-proxy-runtime"')) {
    const patternsAttr = escapeHtml(JSON.stringify(patterns));
    const tag = `<script id="schoolpoki-proxy-runtime" src="${RUNTIME_PATH}" data-upstream="${escapeHtml(upstream.href)}" data-patterns="${patternsAttr}"></script>`;
    html = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, m => `${m}${tag}`) : tag + html;
  }
  return html;
}

function rewriteCss(css, origin, upstream, patterns) {
  const base = proxyBase(origin, upstream.hostname);
  css = rewriteAbsoluteUrls(css, origin, patterns);
  return css.replace(/url\(\s*(["']?)\/((?!\/)[^)"']*)\1\s*\)/gi, `url($1${base}/$2$1)`);
}

function rewriteJavascript(js, origin, upstream, patterns) {
  const base = proxyBase(origin, upstream.hostname);
  js = rewriteAbsoluteUrls(js, origin, patterns);
  js = js.replace(/(\bfrom\s*["'])\/((?!\/)[^"']+)(["'])/g, `$1${base}/$2$3`);
  js = js.replace(/(\bimport\s*\(\s*["'])\/((?!\/)[^"']+)(["']\s*\))/g, `$1${base}/$2$3`);
  return js;
}

function runtimeJavascript() {
  return String.raw`(() => {
  'use strict';
  const tag = document.currentScript;
  if (!tag || window.__schoolpokiGenericProxyInstalled) return;
  window.__schoolpokiGenericProxyInstalled = true;

  const PAGE_ORIGIN = location.origin;
  const PROXY_PREFIX = '/__proxy_host/';
  const upstream = tag.dataset.upstream || '';
  let patterns = [];
  try { patterns = JSON.parse(tag.dataset.patterns || '[]') || []; } catch (_) {}

  const norm = v => String(v || '').trim().toLowerCase().replace(/\.$/, '');
  function allowed(hostname){
    const host = norm(hostname);
    return patterns.some(pattern => {
      pattern = norm(pattern);
      if (pattern.startsWith('*.')) {
        const root = pattern.slice(2);
        return host.endsWith('.' + root) && host !== root;
      }
      return host === pattern;
    });
  }
  function baseFor(host){ return PAGE_ORIGIN + PROXY_PREFIX + encodeURIComponent(norm(host)); }
  function alreadyProxy(u){ return u.origin === PAGE_ORIGIN && u.pathname.startsWith(PROXY_PREFIX); }

  function proxify(value){
    if (value == null) return value;
    const raw = value instanceof URL ? value.href : String(value);
    if (!raw || /^(?:data|blob|javascript|about|mailto|tel):/i.test(raw)) return value;
    let u;
    try { u = new URL(raw, upstream); } catch (_) { return value; }
    if (alreadyProxy(u)) return u.href;
    if (u.protocol !== 'https:' || !allowed(u.hostname)) return value;
    return baseFor(u.hostname) + u.pathname + u.search + u.hash;
  }

  function proxifySrcset(value){
    return String(value || '').split(',').map(part => {
      const m = part.trim().match(/^(\S+)(\s+.*)?$/);
      return m ? String(proxify(m[1])) + (m[2] || '') : part.trim();
    }).join(', ');
  }

  function patchUrlSetter(proto, prop, srcset){
    try {
      const d = Object.getOwnPropertyDescriptor(proto, prop);
      if (!d || !d.get || !d.set || !d.configurable) return;
      Object.defineProperty(proto, prop, {
        configurable: true,
        enumerable: d.enumerable,
        get: d.get,
        set(value){ return d.set.call(this, srcset ? proxifySrcset(value) : proxify(value)); }
      });
    } catch (_) {}
  }

  const nativeFetch = window.fetch;
  if (nativeFetch) window.fetch = function(input, init){
    try {
      if (input instanceof Request) {
        const next = proxify(input.url);
        if (next !== input.url) input = new Request(next, input);
      } else input = proxify(input);
    } catch (_) {}
    return nativeFetch.call(this, input, init);
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url){
    const args = Array.from(arguments);
    args[1] = proxify(url);
    return xhrOpen.apply(this, args);
  };

  if (navigator.sendBeacon) {
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => nativeBeacon(proxify(url), data);
  }

  if (window.EventSource) {
    const Native = window.EventSource;
    window.EventSource = function(url, options){ return new Native(proxify(url), options); };
    window.EventSource.prototype = Native.prototype;
  }

  for (const name of ['Worker','SharedWorker']) {
    const Native = window[name];
    if (!Native) continue;
    window[name] = function(url, options){ return new Native(proxify(url), options); };
    window[name].prototype = Native.prototype;
  }

  const nativeOpen = window.open;
  if (nativeOpen) window.open = function(url){
    const args = Array.from(arguments);
    if (args.length) args[0] = proxify(url);
    return nativeOpen.apply(this, args);
  };

  const attrs = new Set(['src','href','action','poster','data']);
  const nativeSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value){
    const lower = String(name).toLowerCase();
    if (attrs.has(lower)) value = proxify(value);
    else if (lower === 'srcset') value = proxifySrcset(value);
    return nativeSetAttribute.call(this, name, value);
  };

  [
    [window.HTMLImageElement && HTMLImageElement.prototype,'src',false],
    [window.HTMLImageElement && HTMLImageElement.prototype,'srcset',true],
    [window.HTMLScriptElement && HTMLScriptElement.prototype,'src',false],
    [window.HTMLIFrameElement && HTMLIFrameElement.prototype,'src',false],
    [window.HTMLLinkElement && HTMLLinkElement.prototype,'href',false],
    [window.HTMLAnchorElement && HTMLAnchorElement.prototype,'href',false],
    [window.HTMLFormElement && HTMLFormElement.prototype,'action',false],
    [window.HTMLSourceElement && HTMLSourceElement.prototype,'src',false],
    [window.HTMLSourceElement && HTMLSourceElement.prototype,'srcset',true],
    [window.HTMLMediaElement && HTMLMediaElement.prototype,'src',false],
    [window.HTMLVideoElement && HTMLVideoElement.prototype,'poster',false],
    [window.HTMLObjectElement && HTMLObjectElement.prototype,'data',false]
  ].forEach(([proto, prop, srcset]) => { if (proto) patchUrlSetter(proto, prop, srcset); });

  const nativeSetProperty = window.CSSStyleDeclaration && CSSStyleDeclaration.prototype.setProperty;
  if (nativeSetProperty) CSSStyleDeclaration.prototype.setProperty = function(name, value, priority){
    if (typeof value === 'string' && value.includes('url(')) {
      value = value.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi, (_, q, url) => 'url(' + q + proxify(url) + q + ')');
    }
    return nativeSetProperty.call(this, name, value, priority);
  };
})();`;
}

function runtimeResponse() {
  return new Response(runtimeJavascript(), {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff'
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const incoming = new URL(request.url);
  const patterns = allowedPatterns(env);

  if (incoming.pathname === RUNTIME_PATH || LEGACY_RUNTIME_PATHS.has(incoming.pathname)) return runtimeResponse();
  if (incoming.pathname === '/' && request.method === 'GET') return launcherHtml(incoming, env);

  let upstream;
  try {
    upstream = decodeProxyRequest(incoming, patterns);
  } catch (error) {
    return new Response(`허용되지 않은 도메인입니다. Cloudflare Pages의 ALLOWED_ORIGINS에 추가하세요.\n${error?.message || ''}`, {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }

  if (!upstream) {
    return Response.redirect(`${incoming.origin}/`, 302);
  }

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
          return new Response(`리다이렉트 대상 ${target.hostname} 이(가) 허용 목록에 없습니다. ALLOWED_ORIGINS에 추가하세요.`, {
            status: 403,
            headers: { 'content-type': 'text/plain; charset=utf-8' }
          });
        }
        const status = [301,302,303,307,308].includes(response.status) ? response.status : 302;
        return Response.redirect(proxyUrl(incoming.origin, target), status);
      } catch (_) {}
    }
  }

  const headers = cleanResponseHeaders(response);
  const contentType = String(headers.get('content-type') || '').toLowerCase();

  if (request.method === 'HEAD' || !textLike(contentType)) {
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  let body = await response.text();
  if (contentType.includes('text/html')) body = rewriteHtml(body, incoming.origin, upstream, patterns);
  else if (contentType.includes('text/css')) body = rewriteCss(body, incoming.origin, upstream, patterns);
  else if (contentType.includes('javascript')) body = rewriteJavascript(body, incoming.origin, upstream, patterns);
  else body = rewriteAbsoluteUrls(body, incoming.origin, patterns);

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
