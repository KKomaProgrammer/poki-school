# poki-school

Cloudflare Pages Functions에서 **허용한 HTTPS 사이트**를 서버 측으로 가져와 같은 Pages 도메인에서 표시하는 allowlist 기반 reverse proxy입니다. Poki 전용이 아니라 `ALLOWED_ORIGINS`에 등록한 다른 사이트에도 같은 구조를 사용할 수 있습니다.

## 접속 화면

`https://schoolpoki.pages.dev/`에 접속하면 URL 입력 화면이 표시됩니다.

- HTTPS 주소를 입력하고 **접속**을 누르면 해당 페이지를 백엔드가 가져와 표시합니다.
- 브라우저가 Clipboard API 읽기를 허용하는 경우, 클립보드에 복사된 HTTPS 링크를 자동으로 입력합니다.
- 브라우저 정책상 자동 클립보드 읽기가 차단된 경우에는 **클립보드에서 붙여넣기** 버튼을 눌러 사용할 수 있습니다.
- HTTP 주소는 지원하지 않습니다.

## 프록시 주소 형식

허용된 사이트는 다음 형식으로 같은 Pages 도메인 안에서 열립니다.

`/__proxy_host/<호스트>/<경로>`

예:

`https://example.com/game/index.html`

→

`https://schoolpoki.pages.dev/__proxy_host/example.com/game/index.html`

이 경로는 Cloudflare Pages Function이 받아 원본 HTTPS 서버를 `fetch()`하고 응답을 다시 전달합니다.

## iframe / 하위 리소스 / 동적 요청

프록시된 HTML에는 런타임이 자동 삽입됩니다. 따라서 허용 목록에 포함된 호스트라면 다음 요청도 프록시 경로를 사용합니다.

- `iframe.src`
- `img.src`, `img.srcset`
- `script.src`
- `link.href`
- `form.action`
- `video`, `audio`, `source`, `poster`
- `object.data`
- `fetch()`
- `XMLHttpRequest`
- `navigator.sendBeacon()`
- `EventSource`
- `Worker`, `SharedWorker`
- `window.open()`
- JavaScript의 `setAttribute()`로 동적으로 지정되는 URL
- CSS의 동적 `url(...)`

iframe의 `src`가 허용 도메인이면 iframe 자체도 `/__proxy_host/...`로 열리므로, 그 iframe 내부 HTML에도 동일한 런타임이 다시 삽입됩니다.

HTML/CSS/JavaScript/JSON/XML/SVG 안의 허용된 절대 HTTPS URL도 가능한 범위에서 프록시 URL로 다시 작성합니다. 이미지, WASM, 폰트, 오디오, 영상 등 바이너리 응답은 서버에서 스트리밍합니다.

## 리다이렉트

원본 서버가 `301`, `302`, `303`, `307`, `308`과 `Location` 헤더를 반환하면 대상 URL을 확인합니다.

- 대상 도메인이 허용 목록에 있으면 자동으로 `/__proxy_host/...` 주소로 다시 리다이렉트합니다.
- 허용 목록 밖으로 이동하려는 경우에는 외부로 직접 빠져나가지 않고 `403`으로 차단합니다.

## 허용 도메인 설정

임의 사용자가 이 프로젝트를 아무 사이트나 중계하는 공개 오픈 프록시로 사용할 수 없도록, 서버는 **허용 목록에 등록된 호스트만** 프록시합니다.

Cloudflare Pages → **Settings → Variables and Secrets**에 다음 환경 변수를 추가합니다.

- 변수명: `ALLOWED_ORIGINS`
- 값: 쉼표, 공백 또는 세미콜론으로 구분한 도메인 목록

예:

```text
ALLOWED_ORIGINS=example.com,*.example.com,cdn.example.net,*.game-studio.com
```

지원 형식:

- `example.com` → 정확히 `example.com`만 허용
- `*.example.com` → `www.example.com`, `cdn.example.com` 등 하위 도메인 허용
- `https://example.com` 형식으로 넣어도 호스트명만 사용

보안상 `*` 전체 허용은 무시하며, 직접 IP 주소, `localhost`, `.local`, `.internal` 같은 내부 네트워크 호스트는 허용하지 않습니다.

### 기본 허용 Poki 도메인

기존 Poki 동작을 유지하기 위해 다음은 환경변수 없이 기본 허용됩니다.

- `poki.com`
- `*.poki.com`
- `poki-cdn.com`
- `*.poki-cdn.com`
- `poki-gdn.com`
- `*.poki-gdn.com`

따라서 `games.poki.com`, `poki-auth.poki.com`, `game-cdn.poki.com`, `t.poki.com`도 기본적으로 백엔드를 거칩니다.

## 기존 Poki 경로 호환

이전 버전의 `/__poki_host/<host>/...` 경로도 계속 읽을 수 있도록 호환 처리가 남아 있습니다. `/__poki_runtime`과 `/__poki_runtime.js`도 새 통합 런타임을 반환합니다.

새 페이지에서는 `/__proxy_host/<host>/...`를 사용합니다.

## Cloudflare Pages 배포

- Framework preset: `None`
- Build command: 비워 둠
- Build output directory: `.`

GitHub 저장소를 Cloudflare Pages 프로젝트에 연결하면 `functions/[[path]].js`가 접속 화면과 프록시 요청을 모두 처리합니다.

## 제한 사항

- 일부 사이트는 자체 CSP, 인증 방식, Service Worker, WebSocket, 쿠키 구조 등 때문에 완전히 동일하게 동작하지 않을 수 있습니다.
- 브라우저의 Clipboard API는 사용자 권한/브라우저 정책에 따라 페이지 로드 즉시 읽기가 거부될 수 있습니다. 이 경우 붙여넣기 버튼을 사용합니다.
- 사이트가 사용하는 별도 API/CDN/iframe 도메인도 백엔드로 보내려면 해당 호스트를 `ALLOWED_ORIGINS`에 함께 추가해야 합니다.
- 원본 사이트의 보안 헤더를 강제로 제거하거나 우회하지 않습니다.

이 구성은 프록시할 각 사이트 및 리소스에 대해 필요한 사용·중계 권한을 보유한 환경을 전제로 합니다.
