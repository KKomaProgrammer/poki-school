# poki-school

Cloudflare Pages Functions에서 Poki와 게임 실행에 필요한 외부 게임사/CDN 리소스를 서버 측으로 가져와 같은 사이트에서 표시하는 reverse proxy입니다.

## 현재 구조

- `functions/[[path]].js`가 모든 경로를 Cloudflare Pages Functions 백엔드에서 처리합니다.
- `/en/g/...` 같은 일반 경로는 서버가 `https://poki.com`의 같은 경로를 `fetch()`해서 응답합니다.
- HTML/CSS/JS/JSON/SVG 안의 절대 URL을 검사해 Poki 도메인뿐 아니라 외부 게임사/CDN의 공개 HTTPS 도메인도 프록시 주소로 자동 재작성합니다.
- 이미지, WASM, 폰트, 오디오, 영상 등 바이너리 응답도 Cloudflare 서버가 스트리밍합니다.
- Poki 페이지 자체를 감싸는 외부 iframe은 사용하지 않습니다. 원본 게임이 자체적으로 iframe을 사용하는 경우 그 구조는 유지되며, HTTPS `src`가 텍스트 응답에서 발견되면 역시 프록시 경로로 재작성될 수 있습니다.
- 메인 Poki HTML에는 작은 `© Poki · poki.com` 표시를 추가합니다.
- HTTPS 리다이렉트 `Location`도 서버 프록시 주소로 다시 매핑합니다.

## HTTPS 요청 백엔드 경유

정적 HTML 안의 주소뿐 아니라 실행 중 만들어지는 HTTPS 요청도 서버가 이미 승인·서명한 호스트라면 Cloudflare 백엔드 경로로 보냅니다.

- `functions/_middleware.js`가 HTML/CSS 응답을 추가 처리하고 현재 게임 호스트 기준의 프록시 정보를 런타임에 전달합니다.
- 실제 런타임 함수 경로는 `/__poki_runtime`입니다.
- 기존 `/__poki_runtime.js` 요청은 404 대신 `/__poki_runtime`으로 리다이렉트합니다.
- `fetch()`와 `XMLHttpRequest`의 HTTPS 요청을 승인된 프록시 경로로 변경합니다.
- `navigator.sendBeacon()` 요청도 동일하게 처리합니다.
- JavaScript가 동적으로 설정하는 `src`, `href`, `action`, `poster`, `data` 속성도 승인된 HTTPS 호스트면 백엔드 경로로 변경합니다.
- `img.src`, `script.src`, `iframe.src`, `link.href`, `form.action`, `video/audio/source` 같은 속성을 직접 대입하는 경우도 처리합니다.
- `EventSource` HTTPS 요청도 승인된 프록시 주소를 사용합니다.
- 현재 게임 호스트의 `/assets/...` 같은 루트 상대경로는 해당 게임사의 백엔드 프록시 경로로 고정됩니다.
- 서버 응답 안에서 이미 `/__external_host/.../<서명>/...` 형태로 변환된 외부 게임사/CDN은 이후 요청도 계속 Cloudflare 백엔드에서 처리합니다.

임의 사용자가 아무 외부 주소나 직접 입력해 중계할 수 있는 공개 오픈 프록시는 만들지 않습니다. Poki/게임 응답에서 서버가 발견하고 서명한 외부 HTTPS 호스트와 현재 게임 호스트의 요청을 백엔드로 전달합니다.

## Poki 기본 도메인

`poki.com` 자체와 **모든 `*.poki.com` 서브도메인**은 별도 서명 없이 항상 백엔드 프록시됩니다.

예:

- `https://games.poki.com/...` → `/__poki_host/games.poki.com/...`
- `https://poki-auth.poki.com/...` → `/__poki_host/poki-auth.poki.com/...`
- `https://game-cdn.poki.com/...` → `/__poki_host/game-cdn.poki.com/...`
- 그 밖의 임의의 `https://<subdomain>.poki.com/...` 역시 `/__poki_host/<subdomain>.poki.com/...`로 처리됩니다.

다음 호스트는 코드에도 명시적으로 기본 지원 대상으로 적어 두었습니다.

- `game-cdn.poki.com`
- `games.poki.com`
- `poki-auth.poki.com`
- `t.poki.com`

또한 기존대로 다음 계열도 기본 프록시됩니다.

- `poki-cdn.com` 및 서브도메인
- `poki-gdn.com` 및 서브도메인

## 모든 외부 게임사 도메인 지원

Poki에서 일부 게임이 다른 게임사, 퍼블리셔 또는 CDN 도메인을 사용하는 경우에도 동작하도록 공개 HTTPS 호스트를 자동 지원합니다.

예를 들어 Poki가 반환한 HTML/JS/JSON/CSS 안에서 다음과 같은 주소가 발견되면:

`https://cdn.example-game-studio.com/assets/game.js`

Cloudflare 응답에서는 다음 형태의 서명된 프록시 주소로 바뀝니다.

`/__external_host/cdn.example-game-studio.com/<서명>/assets/game.js`

서명은 서버에서 HMAC-SHA256으로 생성·검증합니다. 따라서 외부 게임사 도메인의 종류를 미리 모두 등록할 필요는 없지만, 방문자가 이 프로젝트를 임의의 사이트를 중계하는 공개 오픈 프록시로 사용하는 것은 방지합니다.

직접 IP 주소, `localhost`, `.local`, `.internal` 등 내부 네트워크용 호스트는 프록시하지 않습니다. 외부 게임 콘텐츠는 HTTPS 도메인 이름을 사용하는 경우에 자동 지원됩니다.

## 필수 Cloudflare 환경 변수

외부 게임사 도메인 자동 프록시를 사용하려면 Cloudflare Pages 프로젝트에 다음 환경 변수를 추가해야 합니다.

- 변수명: `PROXY_SIGNING_SECRET`
- 값: 충분히 긴 임의 문자열 (권장 32자 이상)

예시 형식:

`PROXY_SIGNING_SECRET=<랜덤한 32자 이상의 비밀값>`

이 값은 GitHub 저장소에 커밋하지 말고 Cloudflare Pages의 **Settings → Environment variables / Variables and Secrets**에서 Secret으로 등록하십시오.

이 값이 없어도 Poki 기본 도메인은 계속 동작하지만, Poki 밖의 임의 게임사/CDN 도메인은 안전을 위해 자동 프록시되지 않습니다.

## Cloudflare Pages 배포

- Framework preset: `None`
- Build command: 비워 둠
- Build output directory: `.`

GitHub 저장소를 Cloudflare Pages 프로젝트에 연결하면 `functions` 디렉터리가 Pages Functions로 자동 배포됩니다.

## 참고

이 구성은 Poki 및 해당 게임/외부 게임사 콘텐츠에 대해 필요한 사용·프록시·재배포 권한을 보유한 환경을 전제로 합니다.
