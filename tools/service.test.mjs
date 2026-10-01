import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { matchPlace, parseMenu, publicIPv4, normalizeApifyPlace, fetchPlace } from './place-service.mjs';

const shop = { name: '검증식당', branch: '역점', lon: 129.04, lat: 35.11, address: '부산광역시 동구 검증로 1', food: false };
const place = (title, lon = shop.lon) => ({ displayName: { text: title }, location: { latitude: shop.lat, longitude: lon } });
test('같은 브랜드의 다른 지점, 먼 상가, 모호한 결과를 제외한다', () => {
  assert.equal(matchPlace(shop, [place('검증식당 다른점')]), null);
  assert.equal(matchPlace(shop, [place('검증식당 역점', 129.05)]), null);
  assert.equal(matchPlace(shop, [place('검증식당 역점'), place('검증식당 역점', 129.04001)]), null);
  assert.equal(matchPlace(shop, [place('검증식당 역점')]).displayName.text, '검증식당 역점');
});
test('메뉴는 게시자의 구조화된 실제 항목과 가격만 읽는다', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Restaurant', hasMenu: { '@type': 'Menu', hasMenuSection: { '@type': 'MenuSection', hasMenuItem: [{ '@type': 'MenuItem', name: '검증 메뉴', offers: { price: '9000', priceCurrency: 'KRW' } }, { '@type': 'MenuItem', name: '가격 없는 메뉴' }] } } })}</script>`;
  const menu = parseMenu(html, 'https://example.com');
  assert.equal(menu.items[0].price, '9,000원');
  assert.equal(menu.items[1].price, '');
  assert.equal(parseMenu('<h1>맛있는 음식 10000원</h1>', 'https://example.com').items.length, 0);
});
test('메뉴 웹사이트는 사설 IP 및 로컬 네트워크로 접근할 수 없다', () => {
  for (const ip of ['127.0.0.1', '10.1.1.1', '192.168.1.1', '172.16.1.1', '169.254.169.254', '100.64.1.1', '::1']) assert.equal(publicIPv4(ip), false);
  assert.equal(publicIPv4('8.8.8.8'), true);
});
test('Apify 원문 리뷰를 그대로 매핑하고 다른 상가 리뷰를 섞지 않는다', () => {
  const rows = [{ title: '검증식당 역점', location: { lat: shop.lat, lng: shop.lon }, totalScore: 4.5, reviewsCount: 20, reviews: [{ name: '작성자', stars: 5, text: '<리뷰 원문>', reviewUrl: 'https://example.com/review' }] }];
  assert.equal(normalizeApifyPlace(shop, rows).reviews[0].text, '<리뷰 원문>');
  assert.equal(normalizeApifyPlace({ ...shop, lat: 37 }, rows).status, 'not_found');
});
test('Actor 실행과 결과 조회를 연결하고 최신 리뷰 수집을 제한한다', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    let json;
    if (url.includes('/runs?')) json = { data: { id: 'run', status: 'RUNNING' } };
    else if (url.includes('actor-runs')) json = { data: { id: 'run', status: 'SUCCEEDED', defaultDatasetId: 'dataset' } };
    else json = [{ title: '검증식당 역점', location: { lat: shop.lat, lng: shop.lon }, reviews: [{ text: '검증 원문', stars: 4 }] }];
    return { ok: true, json: async () => json };
  };
  const result = await fetchPlace(shop, 'test-token', fakeFetch, async () => {});
  assert.equal(result.reviews[0].text, '검증 원문');
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => !c.url.includes('test-token')));
  const input = JSON.parse(calls[0].options.body);
  assert.equal(input.maxReviews, 20);
  assert.equal(input.reviewsSort, 'newest');
});
test('도시 필터는 지도, 검색, 주변 검색에 적용하고 지역을 바꾸면 초기화된다', async () => {
  const src = (await readFile(new URL('../js/data.js', import.meta.url), 'utf8')).replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '');
  const fixtures = {
    'data/regions.js': { STORE_REGIONS: { regions: [{ code: '26' }, { code: '11' }] } },
  };
  for (const region of ['26', '11']) {
    fixtures[`data/regions/${region}/meta.js`] = { BUSAN_META: { cats: [{}], mids: [{ cat: 0 }], subs: [{ mid: 0 }], dists: [{ code: '1' }, { code: '2' }] } };
    fixtures[`data/regions/${region}/points.js`] = { BUSAN_POINTS: { n: 2, id: [region + '-1', region + '-2'], name: ['검증식당', '검증식당'], addr: ['주소1', '주소2'], lon: [129, 129], lat: [35, 35], sub: [0, 0], dist: [0, 1], branch: {}, bname: {} } };
  }
  const window = {};
  let scriptLoads = 0;
  const context = { window, chosung: (s) => s, isJamo: () => false, document: {
    createElement: () => ({ remove() {} }), head: { appendChild(el) { scriptLoads++; Object.assign(window, fixtures[el.src]); queueMicrotask(() => el.onload()); } },
  } };
  vm.createContext(context);
  vm.runInContext(src + '; globalThis.api = { D, filter, loadData, applyFilter, search, queryRadius, indexOfId };', context);
  const { api } = context;
  await api.loadData(null, '26');
  api.filter.city = 1;
  api.applyFilter();
  assert.deepEqual(Array.from(api.D.F), [1]);
  assert.deepEqual(Array.from(api.search('검증')), [1]);
  assert.deepEqual(Array.from(api.queryRadius(129, 35, 500, false).idx), [1]);
  assert.equal(api.D.filtered, true);
  assert.equal(api.indexOfId('26-2'), 1);
  await api.loadData(null, '11');
  assert.equal(api.indexOfId('26-2'), undefined);
  assert.equal(api.indexOfId('11-2'), 1);
  assert.equal(api.filter.city, null);
  const loadsBeforeReturn = scriptLoads;
  await api.loadData(null, '26');
  assert.equal(scriptLoads, loadsBeforeReturn);
  assert.equal(api.D.region, '26');
  assert.equal(api.indexOfId('26-2'), 1);
  assert.equal(api.filter.city, null);
});
test('길찾기 좌표 순서와 이동 수단, 직접 입력한 주소를 올바르게 전달한다', async () => {
  const src = (await readFile(new URL('../js/directions.js', import.meta.url), 'utf8')).replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '');
  const context = { URLSearchParams };
  vm.createContext(context);
  vm.runInContext(src + '; globalThis.route = routeURLs;', context);
  const routes = context.route({ name: '도착,식당', lat: 35.2, lon: 129.2 }, { name: '출발', lat: 35.1, lon: 129.1 }, 'walk');
  assert.ok(routes.kakao.includes('/by/walk/'));
  assert.ok(routes.kakao.endsWith(',35.2,129.2'));
  assert.equal(new URL(routes.google).searchParams.get('travelmode'), 'walking');
  assert.equal(new URL(context.route({ name: '식당', lat: 35, lon: 129 }, null, 'traffic', '서울역').google).searchParams.get('origin'), '서울역');
});
