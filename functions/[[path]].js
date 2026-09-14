const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <title>Poki</title>
  <style>
    html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#000}
    #poki{position:fixed;inset:0;width:100%;height:100%;border:0;background:#000}
    #copyright{position:fixed;right:max(8px,env(safe-area-inset-right));bottom:max(6px,env(safe-area-inset-bottom));z-index:2147483647;padding:3px 6px;border-radius:5px;background:rgba(0,0,0,.58);color:rgba(255,255,255,.82);font:10px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-decoration:none;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
    #copyright:hover{color:#fff;background:rgba(0,0,0,.72)}
  </style>
</head>
<body>
  <iframe id="poki" title="Poki" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write" allowfullscreen></iframe>
  <a id="copyright" href="https://poki.com/" target="_blank" rel="noopener noreferrer">© Poki · poki.com</a>
  <script>
    (()=>{
      const base='https://poki.com';
      const path=location.pathname==='/'?'/':location.pathname;
      document.getElementById('poki').src=base+path+location.search+location.hash;
    })();
  <\/script>
</body>
</html>`;

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.pathname === '/favicon.ico') {
    return new Response(null, { status: 204 });
  }

  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' }
    });
  }

  const headers = new Headers({
    'content-type': 'text/html; charset=UTF-8',
    'cache-control': 'public, max-age=60',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()'
  });

  return new Response(context.request.method === 'HEAD' ? null : html, {
    status: 200,
    headers
  });
}
