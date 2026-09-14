const OPEN_COOKIE = 'schoolpoki_open_root_once';
const SESSION_PATH = '/__proxy_session';
const HOME_PATH = '/__home';
const LAUNCHER_JS_PATH = '/__launcher.js';
const RUNTIME_PATHS = new Set(['/__proxy_runtime.js', '/__poki_runtime', '/__poki_runtime.js']);

function parseCookies(request) {
  const out = {};
  for (const part of String(request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try { out[key] = decodeURIComponent(value); } catch (_) { out[key] = value; }
  }
  return out;
}

function openCookie() {
  return `${OPEN_COOKIE}=1; Path=/; Max-Age=30; HttpOnly; Secure; SameSite=Lax`;
}

function clearOpenCookie() {
  return `${OPEN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function noStoreHeaders(headers) {
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  headers.delete('content-length');
  return headers;
}

function noStore(response) {
  const headers = noStoreHeaders(new Headers(response.headers));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function launcherCleanupCode() {
  return `\n(async()=>{\ntry{\n  if('serviceWorker' in navigator){\n    const regs=await navigator.serviceWorker.getRegistrations();\n    await Promise.all(regs.map(reg=>reg.unregister().catch(()=>false)));\n  }\n}catch(_){}\ntry{\n  if('caches' in window){\n    const keys=await caches.keys();\n    await Promise.all(keys.map(key=>caches.delete(key).catch(()=>false)));\n  }\n}catch(_){}\ntry{if(location.pathname==='${HOME_PATH}')history.replaceState(null,'','/');}catch(_){}\n})();\n`;
}

function runtimeProtectionCode() {
  return `\n(()=>{\ntry{\n  if('serviceWorker' in navigator && navigator.serviceWorker.register){\n    navigator.serviceWorker.register=function(){\n      return Promise.reject(new Error('Service Worker is disabled inside this proxy.'));\n    };\n  }\n}catch(_){}\n})();\n`;
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const cookies = parseCookies(request);

  // Never reuse a stale target host for a fresh visit to '/'. This prevents a
  // previous CDN/auth host from becoming the next root page and returning S3 AccessDenied.
  if (request.method === 'GET' && url.pathname === '/' && cookies[OPEN_COOKIE] !== '1') {
    return noStore(Response.redirect(`${url.origin}${HOME_PATH}`, 302));
  }

  let sessionTargetIsRoot = false;
  if (url.pathname === SESSION_PATH && request.method === 'POST') {
    try {
      const data = await request.clone().json();
      const target = new URL(String(data?.url || ''));
      sessionTargetIsRoot = target.protocol === 'https:' && target.pathname === '/';
    } catch (_) {}
  }

  let response = await context.next();
  let headers = new Headers(response.headers);

  if (sessionTargetIsRoot && response.ok) {
    headers.append('set-cookie', openCookie());
  }

  // Let a root-to-root redirect chain finish before clearing the one-shot cookie.
  if (request.method === 'GET' && url.pathname === '/' && cookies[OPEN_COOKIE] === '1') {
    const location = headers.get('location');
    let keepForRootRedirect = false;
    if (response.status >= 300 && response.status < 400 && location) {
      try {
        const target = new URL(location, url);
        keepForRootRedirect = target.pathname === '/';
      } catch (_) {}
    }
    if (!keepForRootRedirect) headers.append('set-cookie', clearOpenCookie());
  }

  if (url.pathname === LAUNCHER_JS_PATH && response.ok) {
    const body = await response.text();
    headers = noStoreHeaders(headers);
    return new Response(body + launcherCleanupCode(), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  if (RUNTIME_PATHS.has(url.pathname) && response.ok) {
    const body = await response.text();
    headers = noStoreHeaders(headers);
    return new Response(body + runtimeProtectionCode(), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  headers = noStoreHeaders(headers);
  if (url.pathname === HOME_PATH) headers.set('clear-site-data', '"cache"');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
