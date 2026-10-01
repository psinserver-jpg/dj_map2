# dj_map2

전국 16개 지역, 256개 시·군·구의 상가 정보 지도입니다.

상가 선택 시 실제 리뷰와 공개 메뉴 정보를 확인하고 자동차·도보·대중교통 경로를 조회할 수 있습니다.

## 실행

Node.js 22.16 이상에서 `npm start` 후 `http://localhost:8080`으로 접속합니다.
전국 데이터는 `data/regions.js`와 `data/regions/`에 포함되어 있습니다.

## 배포

GitHub Pages는 지도와 상가 검색 같은 정적 화면을 제공할 수 있습니다.
리뷰와 내장 길찾기는 Node.js 서버의 `/api/place`, `/api/route`가 필요하므로 서버 호스팅에 이 저장소를 연결해야 합니다.
Docker 배포와 일반 Node.js 배포를 지원하며 상세 설정은 [README.txt](README.txt)를 참고하세요.

`.env`와 실제 API 키, 리뷰 캐시는 저장소에 포함하지 않습니다.
배포 서버의 비밀 설정에 `APIFY_TOKEN`, `TMAP_APP_KEY`, `TMAP_TRANSIT_APP_KEY`를 입력합니다.

## 검증

`npm test` — 리뷰 매칭, 메뉴 파싱, 도시 필터 및 길찾기 테스트

`node tools/validate-data.mjs` — 전국 상가 데이터 검증
