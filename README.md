# poki-school

Cloudflare Pages Functions에서 Poki를 서버 측으로 가져와 같은 사이트 경로에서 표시하는 제한형 reverse proxy입니다.

## 현재 구조

- `functions/[[path]].js`가 모든 경로를 Cloudflare Pages Functions 백엔드에서 처리합니다.
- `/en/g/...` 같은 일반 경로는 서버가 `https://poki.com`의 같은 경로를 `fetch()`해서 응답합니다.
- HTML/CSS/JS/JSON/SVG 안의 Poki 계열 절대 URL을 이 Pages 사이트의 프록시 경로로 바꿉니다.
- `img.poki-cdn.com`, `a.poki-cdn.com`, `gdn.poki.com` 등 Poki 계열 자산도 `/__poki_host/<호스트>/...`를 통해 서버에서 가져옵니다.
- 이미지, WASM, 폰트, 오디오, 영상 등 바이너리 응답은 서버가 스트리밍합니다.
- Poki 페이지 자체를 감싸는 외부 iframe은 사용하지 않습니다. Poki 원본 페이지 내부에서 게임을 위해 자체적으로 사용하는 iframe은 원본 구조 그대로 유지될 수 있으며, 그 `src`가 Poki 계열 도메인이면 역시 이 서버 경로로 재작성됩니다.
- 메인 Poki HTML에는 작은 `© Poki · poki.com` 표시를 추가합니다.
- 리다이렉트 `Location`도 Poki 계열 주소인 경우 현재 Pages 도메인으로 다시 매핑합니다.

## 허용 호스트

기본적으로 다음 루트 도메인과 그 서브도메인만 프록시합니다.

- `poki.com`
- `poki-cdn.com`
- `poki-gdn.com`

따라서 이 프로젝트가 임의의 외부 주소를 전달하는 공개 오픈 프록시가 되지 않습니다.

추가로 Poki 측에서 사용하는 허가된 자산 호스트가 생기면 Cloudflare Pages 환경 변수에 다음처럼 추가할 수 있습니다.

- 변수명: `PROXY_EXTRA_HOSTS`
- 값 예시: `example.poki-assets.com,another-poki-domain.com`

쉼표로 여러 루트 도메인을 등록할 수 있습니다.

## Cloudflare Pages 배포

- Framework preset: `None`
- Build command: 비워 둠
- Build output directory: `.`

GitHub 저장소를 Cloudflare Pages 프로젝트에 연결하면 `functions` 디렉터리가 Pages Functions로 자동 배포됩니다.

## 참고

이 구성은 Poki 및 관련 콘텐츠에 대해 필요한 사용·프록시·재배포 허가를 보유한 환경을 전제로 합니다. 제3자 도메인은 자동 프록시하지 않습니다.
