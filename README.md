# poki-school

Cloudflare Pages용 Poki 래퍼입니다.

## 현재 구조

- `functions/[[path]].js`가 모든 GET/HEAD 요청을 Cloudflare Pages Functions 백엔드에서 처리합니다.
- HTML/CSS/JS 래퍼는 Pages Function이 서버에서 직접 생성해 응답합니다.
- 현재 경로와 쿼리 문자열을 `https://poki.com`의 같은 경로로 연결합니다.
- 화면에는 작은 `© Poki · poki.com` 출처 표시만 추가합니다.
- Poki의 실제 HTML/JS/이미지/게임 파일은 복제하거나 재배포하지 않고 원본 Poki 서버에서 직접 로드합니다.

## Cloudflare Pages 배포

- Framework preset: `None`
- Build command: 비워 둠
- Build output directory: `.`

GitHub 저장소를 Cloudflare Pages 프로젝트에 연결하면 `functions` 디렉터리가 자동으로 Pages Functions로 배포됩니다.

## 제한

이 프로젝트는 Poki의 CSP, `X-Frame-Options`, CORS 또는 기타 보안/배포 제한을 제거하거나 우회하지 않습니다. Poki 측에서 외부 iframe 표시를 제한하면 브라우저가 표시를 차단할 수 있습니다.

Poki 사이트와 게임 파일을 이 도메인에서 서버 프록시·복제하여 다시 제공하는 기능은 포함하지 않습니다. Poki의 현재 이용약관은 콘텐츠의 무단 복사·재게시·저장·전송·배포를 제한하므로, 그런 형태의 전체 미러링은 Poki 및 각 권리자의 명시적 허가가 있는 경우에만 별도로 구성해야 합니다.
