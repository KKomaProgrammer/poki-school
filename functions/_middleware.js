const OPEN_COOKIE = 'schoolpoki_open_root_once';
const SESSION_PATH = '/__proxy_session';
const HOME_PATH = '/__home';
const LAUNCHER_JS_PATH = '/__launcher.js';

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

function noStore(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const cookies = parseCookies(request);

  // A fresh visit to the proxy root must never reuse an old CDN/auth target.
  // The only exception is the short-lived root-open cookie set when the user
  // explicitly entered a URL whose pathname is '/'.
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

  if (request.method === 'GET' && url.pathname === '/' && cookies[OPEN_COOKIE] === '1') {
    headers.append('set-cookie', clearOpenCookie());
  }

  // Keep the visible launcher URL clean after the internal /__home recovery.
  if (url.pathname === LAUNCHER_JS_PATH && response.ok) {
    const body = await response.text();
    const extra = "\ntry{if(location.pathname==='/__home')history.replaceState(null,'','/');}catch(_){}\n";
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
    headers.set('pragma', 'no-cache');
    headers.set('expires', '0');
    return new Response(body + extra, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  headers.delete('content-length');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
