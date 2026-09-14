const OPEN_COOKIE = 'schoolpoki_open_root_once';
const TARGET_COOKIE = 'schoolpoki_target';
const SESSION_PATH = '/__proxy_session';
const LAUNCHER_JS_PATH = '/__launcher.js';
const HOME_PATH = '/__home';

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

function clearTargetCookie() {
  return `${TARGET_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function noStore(headers = new Headers()) {
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  headers.delete('content-length');
  return headers;
}

function launcherResponse() {
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>URL 열기</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5f7;color:#16181d}.card{width:min(720px,calc(100% - 32px));background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:28px;box-shadow:0 16px 40px rgba(0,0,0,.08)}h1{font-size:24px;margin:0 0 8px}.sub{margin:0 0 22px;color:#667085}.row{display:flex;gap:10px}input{flex:1;min-width:0;border:1px solid #cfd4dc;border-radius:12px;padding:14px 15px;font:inherit;background:#fff;color:#111827;outline:none}button{border:0;border-radius:12px;padding:13px 17px;font:600 14px/1 system-ui;cursor:pointer}.go{background:#111827;color:#fff}.status{min-height:20px;margin-top:12px;font-size:13px;color:#667085}.history{margin-top:22px;padding-top:18px;border-top:1px solid #eaecf0}.history-head{display:flex;justify-content:space-between;align-items:center}.history-title{font-size:14px;font-weight:700}.clear{background:transparent;color:#667085;padding:8px}.history-list{display:grid;gap:7px;margin-top:10px}.history-item{width:100%;text-align:left;background:#f8fafc;color:#344054;border:1px solid #eaecf0;padding:10px 12px;border-radius:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.more{width:100%;margin-top:10px;background:#eef1f5;color:#344054}.empty{color:#98a2b3;font-size:13px;padding:10px 2px}@media(max-width:560px){.row{flex-direction:column}.go{height:46px}}@media(prefers-color-scheme:dark){body{background:#0e1014;color:#f8fafc}.card{background:#171a20;border-color:#2a2f38}.sub,.status,.clear{color:#aab2c0}input{background:#101318;color:#f8fafc;border-color:#353c48}.go{background:#f8fafc;color:#111827}.history{border-color:#2a2f38}.history-item{background:#11151b;color:#e5e7eb;border-color:#2a2f38}.more{background:#252b34;color:#e5e7eb}}
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
</main>
<script src="/__launcher.js" defer></script>
</body>
</html>`;

  const headers = noStore(new Headers({
    'content-type': 'text/html; charset=utf-8',
    'x-content-type-options': 'nosniff'
  }));
  headers.append('set-cookie', clearTargetCookie());
  headers.append('set-cookie', clearOpenCookie());
  return new Response(html, { status: 200, headers });
}

function isRootRedirect(response, requestUrl) {
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get('location');
  if (!location) return false;
  try {
    const target = new URL(location, requestUrl);
    return target.pathname === '/';
  } catch (_) {
    return false;
  }
}

function patchLauncherJs(body) {
  return body.replace(
    'location.assign(data.path);',
    "const opened=window.open(data.path,'_blank','noopener');if(!opened){status.textContent='새 탭을 열 수 없습니다. 팝업 차단을 허용해 주세요.';}else{status.textContent='새 탭에서 열었습니다.';}"
  );
}

function removeLauncherNote(body) {
  return body.replace(/\s*<div class="note">직접 입력해 조회한 URL만 저장합니다\. 리다이렉트와 사이트 내부 이동은 최근 기록에 추가하지 않습니다\.<\/div>/g, '');
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const cookies = parseCookies(request);

  if (request.method === 'GET' && url.pathname === '/' && cookies[OPEN_COOKIE] !== '1') {
    return launcherResponse();
  }

  let sessionTargetIsRoot = false;
  if (url.pathname === SESSION_PATH && request.method === 'POST') {
    try {
      const data = await request.clone().json();
      const target = new URL(String(data?.url || ''));
      sessionTargetIsRoot = target.protocol === 'https:' && target.pathname === '/';
    } catch (_) {}
  }

  const response = await context.next();
  let headers = noStore(new Headers(response.headers));

  if (sessionTargetIsRoot && response.ok) {
    headers.append('set-cookie', openCookie());
  }

  if (request.method === 'GET' && url.pathname === '/' && cookies[OPEN_COOKIE] === '1') {
    if (isRootRedirect(response, url)) headers.append('set-cookie', openCookie());
    else headers.append('set-cookie', clearOpenCookie());
  }

  if (url.pathname === LAUNCHER_JS_PATH && response.ok) {
    const body = patchLauncherJs(await response.text());
    headers.delete('content-encoding');
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  if (url.pathname === HOME_PATH && response.ok && String(headers.get('content-type') || '').includes('text/html')) {
    const body = removeLauncherNote(await response.text());
    headers.delete('content-encoding');
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
