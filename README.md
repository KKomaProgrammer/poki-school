# poki-school

Cloudflare Pages Functions 기반 제한형 HTTPS 프록시입니다. 허용 도메인은 `ALLOWED_ORIGINS`에서 관리하며 Poki 계열 도메인은 기본 허용됩니다.

## 주소창 동작

사용자가 `https://example.com/game?id=1`을 입력하면 대상 호스트는 세션 쿠키에 저장되고, 주소창에는 프록시 prefix 없이 다음처럼 표시됩니다.

`https://freepoki.kro.kr/game?id=1`

상위 페이지 주소에는 더 이상 `/__proxy_host/<host>/...` 같은 prefix가 붙지 않습니다. 같은 호스트의 상대경로와 리다이렉트도 원래 path/query 형태를 유지합니다.

다른 허용 호스트의 이미지, 스크립트, iframe, API 등 내부 리소스는 서버가 목적지를 구분해야 하므로 내부 자산 라우트로 처리할 수 있지만, 사용자가 탐색하는 상위 페이지 URL에는 노출하지 않습니다.

## 첫 화면

세션에 대상 호스트가 없으면 `/`에서 URL 입력 화면을 보여줍니다.

- 클립보드에 HTTPS URL이 있고 브라우저가 읽기 권한을 허용하면 자동 입력
- 별도 클립보드 버튼 없음
- 직접 입력 후 조회한 URL만 로컬 스토리지에 최근 방문 기록으로 저장
- 기본 5개 표시, `더보기`로 5개씩 추가
- `전체 삭제` 지원
- 리다이렉트 및 열린 사이트 내부 이동은 최근 기록에 추가하지 않음

프록시 세션을 종료하고 입력 화면으로 돌아가려면 `/__home`을 사용합니다.

## 허용 도메인

Cloudflare Pages 환경변수:

`ALLOWED_ORIGINS=example.com,*.example.com,cdn.example.net`

`*` 전체 허용은 지원하지 않습니다.

기본 허용:

- `poki.com`, `*.poki.com`
- `poki-cdn.com`, `*.poki-cdn.com`
- `poki-gdn.com`, `*.poki-gdn.com`

## 프록시 처리

HTML, CSS, JavaScript, JSON, 이미지, WASM, 폰트, 오디오, 영상, `fetch`, XHR, `sendBeacon`, Worker, EventSource 및 iframe 요청을 허용 범위 안에서 백엔드로 전달합니다. 허용된 사이트의 리다이렉트도 백엔드에서 처리합니다.

## Cloudflare Pages

- Framework preset: `None`
- Build command: 없음
- Build output directory: `.`

현재 라우팅은 `functions/[[path]].js` 하나로 통합되어 있습니다.
