const MAIN_HOST = 'poki.com';
const POKI_PREFIX = '/__poki_host/';
const EXTERNAL_PREFIX = '/__external_host/';
const RUNTIME_PATH = '/__poki_runtime';
const RUNTIME_ALIAS = '/__poki_runtime.js';

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function contextInfo(requestUrl) {
  const u = new URL(requestUrl);
  const origin = u.origin;

  if (u.pathname.startsWith(EXTERNAL_PREFIX)) {
    const rest = u.pathname.slice(EXTERNAL_PREFIX.length);
    const parts = rest.split('/');
    const encodedHost = parts.shift() || '';
    const sig = parts.shift() || '';
    let host = '';
    try { host = decodeURIComponent(encodedHost).toLowerCase(); } catch (_) {}
    const suffix = '/' + parts.join('/');
    return {
      host,
      base: `${origin}${EXTERNAL_PREFIX}${encodedHost}/${sig}`,
      upstream: `https://${host}${suffix}${u.search}`
    };
  }

  if (u.pathname.startsWith(POKI_PREFIX)) {
    const rest = u.pathname.slice(POKI_PREFIX.length);
    const slash = rest.indexOf('/');
    const encodedHost = slash === -1 ? rest : rest.slice(0, slash);
    let host = '';
    try { host = decodeURIComponent(encodedHost).toLowerCase(); } catch (_) {}
    const suffix = slash === -1 ? '/' : rest.slice(slash);
    return {
      host,
      base: `${origin}${POKI_PREFIX}${encodedHost}`,
      upstream: `https://${host}${suffix}${u.search}`
    };
  }

  return {
    host: MAIN_HOST,
    base: origin,
    upstream: `https://${MAIN_HOST}${u.pathname}${u.search}`
  };
}

function discoveredExternalMap(text, origin) {
  const map = {};
  const re = /\/__external_host\/([^\/"'\\?<>&\s]+)\/([A-Za-z0-9_-]{12,64})/g;
  for (const m of text.matchAll(re)) {
    let host = '';
    try { host = decodeURIComponent(m[1]).toLowerCase(); } catch (_) { continue; }
    if (!host) continue;
    map[host] = `${origin}${EXTERNAL_PREFIX}${m[1]}/${m[2]}`;
  }
  return map;
}

function rewriteHtmlRootUrls(html, base) {
  const b = String(base).replace(/\/$/, '');
  html = html.replace(/(\b(?:src|href|action|poster|data)\s*=\s*["']?)\/(?!\/)/gi, `$1${b}/`);
  html = html.replace(/(\bsrcset\s*=\s*["'])([^"']+)(["'])/gi, (all, start, value, end) => {
    const next = value.split(',').map(part => {
      const m = part.trim().match(/^(\/[^\s]+)(\s+.*)?$/);
      return m ? `${b}${m[1]}${m[2] || ''}` : part.trim();
    }).join(', ');
    return `${start}${next}${end}`;
  });
  return html;
}

function rewriteCssRootUrls(css, base) {
  const b = String(base).replace(/\/$/, '');
  return css.replace(/url\(\s*(["']?)\/((?!\/)[^)"']*)\1\s*\)/gi, `url($1${b}/$2$1)`);
}

function injectRuntime(html, info, origin) {
  if (html.includes('id="poki-school-runtime"')) return html;
  const map = discoveredExternalMap(html, origin);
  map[info.host] = info.base;
  const tag = `<script id="poki-school-runtime" src="${RUNTIME_PATH}" data-upstream="${escapeAttr(info.upstream)}" data-current-base="${escapeAttr(info.base)}" data-current-host="${escapeAttr(info.host)}" data-proxy-map="${escapeAttr(JSON.stringify(map))}"></script>`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, m => `${m}${tag}`);
  return tag + html;
}

export async function onRequest(context) {
  const incoming = new URL(context.request.url);
  if (incoming.pathname === RUNTIME_PATH || incoming.pathname === RUNTIME_ALIAS) return context.next();

  const response = await context.next();
  if (context.request.method === 'HEAD' || response.status === 101 || !response.body) return response;

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const isHtml = contentType.includes('text/html');
  const isCss = contentType.includes('text/css');
  if (!isHtml && !isCss) return response;

  const info = contextInfo(context.request.url);
  let body = await response.text();

  if (info.host && info.host !== MAIN_HOST) {
    if (isHtml) body = rewriteHtmlRootUrls(body, info.base);
    if (isCss) body = rewriteCssRootUrls(body, info.base);
  }
  if (isHtml) body = injectRuntime(body, info, incoming.origin);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
