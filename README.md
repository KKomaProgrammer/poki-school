# poki-school

Cloudflare Pages용 Poki 래퍼입니다.

## 동작

- 화면 전체에 `https://poki.com`을 iframe으로 표시합니다.
- 현재 Pages 경로와 쿼리 문자열을 Poki 경로에 그대로 대응합니다.
- 화면에는 작은 저작권/출처 표시만 추가합니다.
- `_redirects`를 사용해 모든 경로를 `index.html`로 연결합니다.

## Cloudflare Pages 배포

- Framework preset: `None`
- Build command: 비워 둠
- Build output directory: `.`

GitHub 저장소를 Cloudflare Pages에 연결하면 됩니다.

## 중요한 제한

이 프로젝트는 Poki의 보안 정책을 우회하지 않습니다. Poki가 `Content-Security-Policy: frame-ancestors` 또는 `X-Frame-Options` 등으로 외부 iframe 삽입을 제한하면 브라우저가 표시를 차단할 수 있습니다.

그 제한을 제거하거나, Poki 전체 HTML/JS/게임 파일을 서버에서 역프록시해 원본처럼 재배포하는 기능은 포함하지 않습니다. 해당 방식이 필요하다면 Poki의 명시적인 허가 및 공식 임베드/API 방식을 사용해야 합니다.
