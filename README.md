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

## Poki 기본 도메인

다음 Poki 계열 주소는 별도 서명 없이 기본 프록시됩니다.

- `poki.com` 및 서브도메인
- `poki-cdn.com` 및 서브도메인
- `poki-gdn.com` 및 서브도메인
- `games.poki.com`
- `t.poki.com`

예:

- `https://games.poki.com/...` → `/__poki_host/games.poki.com/...`
- `https://t.poki.com/...` → `/__poki_host/t.poki.com/...`

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
