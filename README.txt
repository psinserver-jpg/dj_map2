전국 상가지도
=============
GitHub / 서버 배포:
  .env, .local/, artifacts/ 는 GitHub 업로드에서 제외됩니다.
  실제 키를 소스나 GitHub Actions 공개 출력에 넣지 마세요.
  GitHub Pages는 정적 페이지 전용이므로 /api/place, /api/route 를 실행할 수 없습니다.
  리뷰와 내장 길찾기를 유지하려면 GitHub 저장소를 Node.js 서버 호스팅에 연결합니다.
  실행 명령: npm start (Node.js 22.16 이상, 외부 패키지 설치 불필요)
  호스팅 설정: HOST=0.0.0.0, PORT=호스팅 서비스가 지정한 포트
  비밀 설정: APIFY_TOKEN, TMAP_APP_KEY, TMAP_TRANSIT_APP_KEY
  Dockerfile은 공개 파일과 필요한 서버 모듈만 복사하며 .env를 포함하지 않습니다.
  GitHub Actions는 키 없이 테스트만 실행합니다.

실행 (Node.js 22.16 이상):
  node tools/server.mjs
  브라우저에서 http://localhost:8080 접속

지도/상가 검색/길찾기만 사용하려면 index.html 을 더블클릭해도 됩니다.
실제 리뷰 자동 수집은 서버 접속이 필요합니다.

지역 선택:
  시·도를 고르면 해당 지역의 데이터만 읽습니다.
  시·군·구를 고르면 지도, 검색, 주변 정보와 즐겨찾기는 해당 도시로 제한됩니다.
  지역·도시·상가 선택은 공유 링크에 저장됩니다.
  제공된 CSV의 지역명과 코드를 그대로 사용합니다 (전남광주통합특별시 포함).

실제 리뷰 / 메뉴 (Apify):
  .env.example 을 .env 로 복사하고 APIFY_TOKEN 을 입력합니다.
  사용 Actor: compass/crawler-google-places
  토큰은 서버에서만 사용하며 .env 는 웹으로 제공되지 않습니다.
  이름·지점·좌표를 대조하고, 다른 지점이나 모호한 결과는 표시하지 않습니다.
  최신 리뷰 최대 20개, 검색 후보 최대 3개를 수집합니다.
  첫 수집은 최대 약 3분 걸릴 수 있으며 완료된 결과는 .local/reviews 및 서버 메모리에서 6시간 재사용합니다.
  Actor 실행은 Apify 계정의 요금/사용량을 사용합니다.
  음식점은 수집된 메뉴 URL/공식 홈페이지의 Schema.org MenuItem 공개 데이터를 읽습니다.
  메뉴 항목이 공개되지 않은 곳은 원본 링크를 제공합니다. 가격이나 리뷰를 생성하지 않습니다.
  제공된 실행 결과를 읽으려면 APIFY_SEED_RUN_ID 설정 후 node tools/import-apify.mjs 를 실행합니다.
  가져온 원본은 .local/apify-seed.json 에 저장되며 웹으로 노출되지 않습니다.

길찾기:
  상세창의 길찾기 → 현재 위치 또는 출발 상가 선택 → 자동차/도보/대중교통 → 경로 찾기
  웹 내부의 지도에 API가 제공한 실제 경로를 표시하고 거리·소요 시간·이동 안내를 제공합니다.
  자동차: 통행료, 도보: 보행 경로, 대중교통: 최대 3개 경로·노선·정류장·환승·요금
  TMAP_APP_KEY: SK Open API 앱의 자동차/보행자 API 키
  TMAP_TRANSIT_APP_KEY: 대중교통 API 키 (동일 앱에서 활성화한 경우 TMAP_APP_KEY 사용 가능)
  .env 에 키를 설정하고 서버를 재시작하세요. 키 없이 경로/소요 시간을 임의로 표시하지 않습니다.
  키 발급: https://openapi.sk.com/ 및 https://transit.tmapmobility.com/
  출발 주소 검색은 선택한 도시의 상가 데이터에서 검색합니다. 다른 지역은 현재 위치를 사용할 수 있습니다.
  카카오맵/구글지도에서도 확인할 수 있는 링크를 제공합니다.
  현재 위치는 HTTPS 또는 localhost 에서 위치 권한을 허용해야 사용할 수 있습니다.

수정/재생성이 필요할 때 (Python 3):
  python tools/build_data.py   # ../data/소상공인시장진흥공단_상가(상권)정보_20260630 의 전국 CSV 변환
  python tools/build_data.py --source "CSV 폴더 경로"
  python tools/bundle.py       # js/*.js 소스 -> app.js 생성 (js/ 를 고친 뒤 실행)

검증: node --test tools/service.test.mjs tools/route.test.mjs

구성: index.html, app.js(번들), css/, js/(소스), data/regions.js, data/regions/<시도코드>/, vendor/(MapLibre GL)
지도: OpenFreeMap / OpenStreetMap / Esri 위성 (무료, API 키 불필요)
데이터: 소상공인시장진흥공단 상가(상권)정보 (2026-06, 제공된 전국 16개 CSV)

참고:
  https://apify.com/compass/crawler-google-places/input-schema
  https://docs.apify.com/api/v2
  https://apis.map.kakao.com/web/guide/
