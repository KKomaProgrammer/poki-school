function launcherHtml() {
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>URL 열기</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5f7;color:#16181d}.card{width:min(720px,calc(100% - 32px));background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:28px;box-shadow:0 16px 40px rgba(0,0,0,.08)}h1{font-size:24px;margin:0 0 8px}.sub{margin:0 0 22px;color:#667085}.row{display:flex;gap:10px}input{flex:1;min-width:0;border:1px solid #cfd4dc;border-radius:12px;padding:14px 15px;font:inherit;background:#fff;color:#111827;outline:none}input:focus{border-color:#667085;box-shadow:0 0 0 3px rgba(102,112,133,.12)}button{border:0;border-radius:12px;padding:13px 17px;font:600 14px/1 system-ui;cursor:pointer}.go{background:#111827;color:#fff}.status{min-height:20px;margin-top:12px;font-size:13px;color:#667085}.history{margin-top:22px;padding-top:18px;border-top:1px solid #eaecf0}.history-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.history-title{font-size:14px;font-weight:700}.clear{padding:8px 10px;background:transparent;color:#667085;font-size:12px}.history-list{display:grid;gap:7px}.history-item{width:100%;display:flex;align-items:center;gap:10px;text-align:left;background:#f8fafc;color:#344054;border:1px solid #eaecf0;padding:10px 12px;border-radius:10px;font-weight:500}.history-item .url{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.more{width:100%;margin-top:10px;background:#eef1f5;color:#344054}.empty{padding:12px 2px;color:#98a2b3;font-size:13px}.note{margin-top:20px;color:#667085;font-size:12px;line-height:1.55}@media(max-width:560px){.row{flex-direction:column}.go{height:46px}}@media(prefers-color-scheme:dark){body{background:#0e1014;color:#f8fafc}.card{background:#171a20;border-color:#2a2f38}.sub,.status,.note,.clear{color:#aab2c0}input{background:#101318;color:#f8fafc;border-color:#353c48}.go{background:#f8fafc;color:#111827}.history{border-color:#2a2f38}.history-item{background:#11151b;color:#e5e7eb;border-color:#2a2f38}.more{background:#252b34;color:#e5e7eb}.empty{color:#7e8794}}
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

  <section class="history" aria-labelledby="history-title">
    <div class="history-head">
      <div id="history-title" class="history-title">최근 방문 웹사이트</div>
      <button id="clear-history" class="clear" type="button">전체 삭제</button>
    </div>
    <div id="history-list" class="history-list"></div>
    <button id="more-history" class="more" type="button" hidden>더보기</button>
  </section>

  <div class="note">최근 방문 기록에는 이 화면에서 직접 조회한 URL만 저장됩니다. 이후 리다이렉트되거나 열린 사이트 안에서 이동한 URL은 저장하지 않습니다.</div>
</main>
<script>
(() => {
  'use strict';
  const STORAGE_KEY = 'schoolpoki.recentUrls.v1';
  const PAGE_SIZE = 5;
  const input = document.getElementById('url');
  const go = document.getElementById('go');
  const status = document.getElementById('status');
  const historyList = document.getElementById('history-list');
  const moreHistory = document.getElementById('more-history');
  const clearHistory = document.getElementById('clear-history');
  let visibleCount = PAGE_SIZE;

  function normalize(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try {
      const u = new URL(s);
      if (u.protocol !== 'https:') return '';
      return u.href;
    } catch (_) {
      return '';
    }
  }

  function readHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(x => x && typeof x.url === 'string') : [];
    } catch (_) {
      return [];
    }
  }

  function writeHistory(items) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (_) {}
  }

  function saveTypedUrl(raw, normalized) {
    const display = String(raw || '').trim() || normalized;
    const now = Date.now();
    const items = readHistory().filter(item => item.url !== normalized);
    items.unshift({ display, url: normalized, visitedAt: now });
    writeHistory(items.slice(0, 100));
  }

  function renderHistory() {
    const items = readHistory();
    historyList.textContent = '';
    const shown = items.slice(0, visibleCount);

    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '최근 방문 기록이 없습니다.';
      historyList.appendChild(empty);
    } else {
      for (const item of shown) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'history-item';
        button.title = item.url;
        const text = document.createElement('span');
        text.className = 'url';
        text.textContent = item.display || item.url;
        button.appendChild(text);
        button.addEventListener('click', () => {
          input.value = item.display || item.url;
          openUrl(item.display || item.url, false);
        });
        historyList.appendChild(button);
      }
    }

    moreHistory.hidden = items.length <= visibleCount;
    clearHistory.hidden = items.length === 0;
  }

  function proxyPath(target) {
    const u = new URL(target);
    return '/__proxy_host/' + encodeURIComponent(u.hostname) + u.pathname + u.search + u.hash;
  }

  function openUrl(raw, save) {
    const normalized = normalize(raw);
    if (!normalized) {
      status.textContent = '올바른 HTTPS 주소를 입력하세요.';
      return;
    }
    if (save) saveTypedUrl(raw, normalized);
    location.assign(proxyPath(normalized));
  }

  go.addEventListener('click', () => openUrl(input.value, true));
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      openUrl(input.value, true);
    }
  });

  moreHistory.addEventListener('click', () => {
    visibleCount += PAGE_SIZE;
    renderHistory();
  });

  clearHistory.addEventListener('click', () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    visibleCount = PAGE_SIZE;
    renderHistory();
  });

  async function autoFillClipboard() {
    if (input.value) return;
    if (!navigator.clipboard || !navigator.clipboard.readText) return;
    try {
      const text = await navigator.clipboard.readText();
      const normalized = normalize(text);
      if (normalized) {
        input.value = String(text || '').trim();
        status.textContent = '클립보드의 URL을 자동 입력했습니다.';
      }
    } catch (_) {}
  }

  renderHistory();
  autoFillClipboard();
  input.focus();
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

export function onRequestGet() {
  return launcherHtml();
}

export function onRequest() {
  return launcherHtml();
}
