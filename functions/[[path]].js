const MAIN_HOST = 'poki.com';
const POKI_PREFIX = '/__poki_host/';
const EXTERNAL_PREFIX = '/__external_host/';
const RUNTIME_PATH = '/__poki_runtime';
const RUNTIME_ALIAS = '/__poki_runtime.js';
const BUILTIN_ROOTS = ['poki.com', 'poki-cdn.com', 'poki-gdn.com'];
const BUILTIN_EXACT_HOSTS = ['game-cdn.poki.com', 'games.poki.com', 'poki-auth.poki.com', 't.poki.com'];
const encoder = new TextEncoder();

function normalizeHost(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
}

function builtinHost(hostname) {
  const host = normalizeHost(hostname);
  if (BUILTIN_EXACT_HOSTS.includes(host)) return true;
  return BUILTIN_ROOTS.some(root => host === root || host.endsWith(`.${root}`));
}

function publicHostname(hostname) {
  const host = normalizeHost(hostname);
  if (!host || host.length > 253) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host.includes(':')) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  if (!host.includes('.')) return false;
  if (!/^[a-z0-9.-]+$/.test(host)) return false;
  if (host.includes('..')) return false;
  return host.split('.').every(label => label && label.length <= 63 && !label.startsWith('-') && !label.endsWith('-'));
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hostSignature(host, env) {
  const secret = String(env?.PROXY_SIGNING_SECRET || '');
  if (!secret) return null;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(normalizeHost(host)));
  return bytesToBase64Url(new Uint8Array(signed)).slice(0, 32);
}

async function externalBase(origin, host, env) {
  host = normalizeHost(host);
  if (!publicHostname(host)) return null;
  const sig = await hostSignature(host, env);
  if (!sig) return null;
  return `${origin}${EXTERNAL_PREFIX}${encodeURIComponent(host)}/${sig}`;
}

async function localBase(origin, host, env) {
  host = normalizeHost(host);
  if (host === MAIN_HOST) return origin;
  if (builtinHost(host)) return `${origin}${POKI_PREFIX}${encodeURIComponent(host)}`;
  return externalBase(origin, host, env);
}

async function verifyExternal(host, signature, env) {
  if (!publicHostname(host) || !signature) return false;
  const expected = await hostSignature(host, env);
  return Boolean(expected && expected === signature);
}

async function upstreamFromRequest(requestUrl, env) {
  const incoming = new URL(requestUrl);

  if (incoming.pathname.startsWith(POKI_PREFIX)) {
    const rest = incoming.pathname.slice(POKI_PREFIX.length);
    const slash = rest.indexOf('/');
    const host = normalizeHost(decodeURIComponent(slash === -1 ? rest : rest.slice(0, slash)));
    if (!builtinHost(host)) throw new Error('disallowed Poki host');
    const path = slash === -1 ? '/' : rest.slice(slash);
    return new URL(`https://${host}${path}${incoming.search}`);
  }

  if (incoming.pathname.startsWith(EXTERNAL_PREFIX)) {
    const rest = incoming.pathname.slice(EXTERNAL_PREFIX.length);
    const parts = rest.split('/');
    const host = normalizeHost(decodeURIComponent(parts.shift() || ''));
    const signature = parts.shift() || '';
    if (!(await verifyExternal(host, signature, env))) throw new Error('invalid external host signature');
    const path = '/' + parts.join('/');
    return new URL(`https://${host}${path}${incoming.search}`);
  }

  return new URL(`https://${MAIN_HOST}${incoming.pathname}${incoming.search}`);
}

async function replacementMap(text, origin, env) {
  const hosts = new Set();
  for (const match of text.matchAll(/https:\/\/([a-z0-9.-]+)(?=[:/])/gi)) hosts.add(normalizeHost(match[1]));
  for (const match of text.matchAll(/(^|[^:])\/\/([a-z0-9.-]+)(?=[:/])/gim)) hosts.add(normalizeHost(match[2]));
  for (const match of text.matchAll(/https:\\\/\\\/([a-z0-9.-]+)(?=\\\/)/gi)) hosts.add(normalizeHost(match[1]));

  const map = new Map();
  await Promise.all([...hosts].map(async host => {
    const base = await localBase(origin, host, env);
    if (base) map.set(host, base);
  }));
  return map;
}

async function rewriteUrls(text, origin, upstreamUrl, env) {
  if (!text) return text;
  const map = await replacementMap(text, origin, env);

  text = text.replace(/https:\/\/([a-z0-9.-]+)(?=[:/])/gi, (all, host) => {
    return map.get(normalizeHost(host)) || all;
  });

  text = text.replace(/(^|[^:])\/\/([a-z0-9.-]+)(?=[:/])/gim, (all, prefix, host) => {
    const base = map.get(normalizeHost(host));
    return base ? `${prefix}${base}` : all;
  });

  text = text.replace(/https:\\\/\\\/([a-z0-9.-]+)(?=\\\/)/gi, (all, host) => {
    const base = map.get(normalizeHost(host));
    return base ? base.replace(/\//g, '\\/') : all;
  });

  if (!builtinHost(upstreamUrl.hostname)) {
    const base = await externalBase(origin, upstreamUrl.hostname, env);
    if (base) {
      text = text.replace(/(["'`])\/(?!\/)/g, `$1${base}/`);
      text = text.replace(/url\(\s*\/((?!\/)[^)"']*)\)/gi, `url(${base}/$1)`);
    }
  }

  return text;
}

function addCopyright(html) {
  if (html.includes('poki-school-copyright')) return html;
  const badge = `<a id="poki-school-copyright" href="https://poki.com/" target="_blank" rel="noopener noreferrer" style="position:fixed;right:8px;bottom:6px;z-index:2147483647;padding:3px 6px;border-radius:5px;background:rgba(0,0,0,.58);color:rgba(255,255,255,.82);font:10px/1.2 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-decoration:none">© Poki · poki.com</a>`;
  return /<\/body\s*>/i.test(html)
    ? html.replace(/<\/body\s*>/i, `${badge}</body>`)
    : html + badge;
}

function requestHeaders(request, upstreamUrl) {
  const headers = new Headers(request.headers);
  for (const h of ['host','cf-connecting-ip','cf-ipcountry','cf-ray','cf-visitor','x-forwarded-for','x-forwarded-proto','x-real-ip']) {
    headers.delete(h);
  }
  headers.delete('accept-encoding');
  if (headers.has('origin')) headers.set('origin', upstreamUrl.origin);
  if (headers.has('referer')) headers.set('referer', `${upstreamUrl.origin}/`);
  return headers;
}

async function responseHeaders(upstream, origin, upstreamUrl, env) {
  const headers = new Headers(upstream.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');

  const location = headers.get('location');
  if (location) {
    try {
      const u = new URL(location, upstreamUrl);
      if (u.protocol === 'https:') {
        const base = await localBase(origin, u.hostname, env);
        if (base) headers.set('location', `${base}${u.pathname}${u.search}${u.hash}`);
      }
    } catch (_) {}
  }

  return headers;
}

function textLike(contentType) {
  const t = String(contentType || '').toLowerCase();
  return t.startsWith('text/') ||
    t.includes('javascript') ||
    t.includes('json') ||
    t.includes('xml') ||
    t.includes('svg');
}

export async function onRequest(context) {
  const { request, env } = context;
  const incoming = new URL(request.url);

  if (incoming.pathname === RUNTIME_ALIAS) {
    return Response.redirect(`${incoming.origin}${RUNTIME_PATH}${incoming.search}`, 302);
  }

  let upstreamUrl;

  try {
    upstreamUrl = await upstreamFromRequest(request.url, env);
  } catch (_) {
    return new Response('Forbidden or unsigned host', { status: 403 });
  }

  const init = {
    method: request.method,
    headers: requestHeaders(request, upstreamUrl),
    redirect: 'manual'
  };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;

  let upstream;
  try {
    upstream = await fetch(upstreamUrl.toString(), init);
  } catch (error) {
    return new Response(`Upstream unavailable: ${error?.message || 'fetch failed'}`, {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }

  if (upstream.status === 101) return upstream;

  const headers = await responseHeaders(upstream, incoming.origin, upstreamUrl, env);
  const contentType = headers.get('content-type') || '';

  if (request.method === 'HEAD' || !textLike(contentType)) {
    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    });
  }

  let body = await upstream.text();
  body = await rewriteUrls(body, incoming.origin, upstreamUrl, env);

  if (contentType.toLowerCase().includes('text/html') && upstreamUrl.hostname === MAIN_HOST) {
    body = addCopyright(body);
  }

  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
}
