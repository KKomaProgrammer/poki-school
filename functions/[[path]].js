const MAIN_HOST = 'poki.com';
const PROXY_PREFIX = '/__poki_host/';
const BUILTIN_ROOTS = ['poki.com', 'poki-cdn.com', 'poki-gdn.com'];
const BUILTIN_EXACT_HOSTS = ['games.poki.com', 't.poki.com'];

function extraRoots(env) {
  return String(env?.PROXY_EXTRA_HOSTS || '')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
}

function allowedHost(hostname, env) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (BUILTIN_EXACT_HOSTS.includes(host)) return true;
  return [...BUILTIN_ROOTS, ...extraRoots(env)].some(root =>
    host === root || host.endsWith(`.${root}`)
  );
}

function localBase(origin, host) {
  host = host.toLowerCase();
  return host === MAIN_HOST ? origin : `${origin}${PROXY_PREFIX}${host}`;
}

function upstreamFromRequest(requestUrl, env) {
  const incoming = new URL(requestUrl);

  if (incoming.pathname.startsWith(PROXY_PREFIX)) {
    const rest = incoming.pathname.slice(PROXY_PREFIX.length);
    const slash = rest.indexOf('/');
    const host = decodeURIComponent(slash === -1 ? rest : rest.slice(0, slash)).toLowerCase();
    if (!allowedHost(host, env)) throw new Error('disallowed host');
    const path = slash === -1 ? '/' : rest.slice(slash);
    return new URL(`https://${host}${path}${incoming.search}`);
  }

  return new URL(`https://${MAIN_HOST}${incoming.pathname}${incoming.search}`);
}

function rewriteUrls(text, origin, env) {
  if (!text) return text;

  text = text.replace(/(?:(https?):)?\/\/([a-z0-9.-]+)(?=[:/])/gi, (all, scheme, host) => {
    if (!allowedHost(host, env)) return all;
    return localBase(origin, host);
  });

  const escapedOrigin = origin.replace(/\//g, '\\/');
  const escapedPrefix = PROXY_PREFIX.replace(/\//g, '\\/');
  text = text.replace(/https?:\\\/\\\/([a-z0-9.-]+)(?=\\\/)/gi, (all, host) => {
    if (!allowedHost(host, env)) return all;
    return host.toLowerCase() === MAIN_HOST
      ? escapedOrigin
      : `${escapedOrigin}${escapedPrefix}${host.toLowerCase()}`;
  });

  return text;
}

function addCopyright(html) {
  if (html.includes('poki-school-copyright')) return html;
  const badge = `<a id="poki-school-copyright" href="https://poki.com/" target="_blank" rel="noopener noreferrer" style="position:fixed;right:8px;bottom:6px;z-index:2147483647;padding:3px 6px;border-radius:5px;background:rgba(0,0,0,.58);color:rgba(255,255,255,.82);font:10px/1.2 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-decoration:none">© Poki · poki.com</a>`;
  return /<\/body\s*>/i.test(html)
    ? html.replace(/<\/body\s*>/i, `${badge}</body>`)
    : html + badge;
}

function requestHeaders(request) {
  const headers = new Headers(request.headers);
  for (const h of ['host','cf-connecting-ip','cf-ipcountry','cf-ray','cf-visitor','x-forwarded-for','x-forwarded-proto','x-real-ip']) {
    headers.delete(h);
  }
  headers.delete('accept-encoding');
  if (headers.has('origin')) headers.set('origin', 'https://poki.com');
  if (headers.has('referer')) headers.set('referer', 'https://poki.com/');
  return headers;
}

function responseHeaders(upstream, origin, env) {
  const headers = new Headers(upstream.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');

  const location = headers.get('location');
  if (location) {
    try {
      const u = new URL(location, 'https://poki.com');
      if (allowedHost(u.hostname, env)) {
        headers.set('location', `${localBase(origin, u.hostname)}${u.pathname}${u.search}${u.hash}`);
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
  let upstreamUrl;

  try {
    upstreamUrl = upstreamFromRequest(request.url, env);
  } catch (_) {
    return new Response('Forbidden host', { status: 403 });
  }

  const init = {
    method: request.method,
    headers: requestHeaders(request),
    redirect: 'manual'
  };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;

  let upstream;
  try {
    upstream = await fetch(upstreamUrl.toString(), init);
  } catch (error) {
    return new Response(`Poki upstream unavailable: ${error?.message || 'fetch failed'}`, {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }

  if (upstream.status === 101) return upstream;

  const headers = responseHeaders(upstream, incoming.origin, env);
  const contentType = headers.get('content-type') || '';

  if (request.method === 'HEAD' || !textLike(contentType)) {
    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    });
  }

  let body = await upstream.text();
  body = rewriteUrls(body, incoming.origin, env);

  if (contentType.toLowerCase().includes('text/html') && upstreamUrl.hostname === MAIN_HOST) {
    body = addCopyright(body);
  }

  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
}
