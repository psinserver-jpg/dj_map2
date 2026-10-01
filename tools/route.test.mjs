import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoad, normalizeTransit, fetchRoute, validPoint } from './route-service.mjs';

const origin = { lon: 129.04, lat: 35.11, name: '출발 식당' };
const destination = { lon: 129.05, lat: 35.12, name: '도착 식당' };
const road = { features: [
  { type: 'Feature', geometry: { type: 'Point', coordinates: [129.04, 35.11] }, properties: { totalTime: 600, totalDistance: 1500, totalFare: 1000, description: '직진하세요' } },
  { type: 'Feature', geometry: { type: 'LineString', coordinates: [[129.04, 35.11], [129.045, 35.118], [129.05, 35.12]] }, properties: {} },
] };
test('자동차·도보는 API 경로와 시간·거리를 그대로 사용한다', () => {
  const car = normalizeRoad(road, 'car')[0];
  const walk = normalizeRoad(road, 'walk')[0];
  assert.equal(car.duration, 600);
  assert.equal(car.distance, 1500);
  assert.equal(car.toll, 1000);
  assert.equal(walk.toll, null);
  assert.equal(walk.geometry.features[0].properties.mode, 'WALK');
  assert.deepEqual(car.geometry.features[0].geometry.coordinates, road.features[1].geometry.coordinates);
  assert.throws(() => normalizeRoad({ features: [] }, 'car'), { code: 'NO_ROUTE' });
});
test('대중교통은 도보·노선별 경로와 정류장, 환승·요금을 구분한다', () => {
  const data = { metaData: { plan: { itineraries: [{ totalTime: 1800, totalDistance: 6000, totalWalkDistance: 500, transferCount: 1,
    fare: { regular: { totalFare: 1550 } }, legs: [
      { mode: 'WALK', sectionTime: 200, steps: [{ description: '정류장까지 직진', linestring: '129.04,35.11 129.041,35.111' }] },
      { mode: 'BUS', route: '100번', routeColor: 'FF9500', start: { name: '출발 정류장' }, end: { name: '도착 정류장' }, sectionTime: 1400, service: 1,
        passShape: { linestring: '129.041,35.111 129.045,35.118 129.05,35.12' }, passStopList: { stations: [{ stationName: '중간 정류장' }] } },
    ] }] } } };
  const route = normalizeTransit(data)[0];
  assert.equal(route.transfers, 1);
  assert.equal(route.fare, 1550);
  assert.equal(route.geometry.features.length, 2);
  assert.equal(route.geometry.features[0].properties.mode, 'WALK');
  assert.equal(route.steps[1].route, '100번');
  assert.equal(route.steps[1].stops[0], '중간 정류장');
  assert.throws(() => normalizeTransit({}), { code: 'NO_ROUTE' });
});
test('키가 없거나 좌표가 잘못되면 경로나 예상 시간을 만들어 내지 않는다', async () => {
  assert.equal(validPoint({ lon: '129', lat: 35 }), false);
  assert.equal(validPoint({ lon: 0, lat: 0 }), false);
  await assert.rejects(fetchRoute({ mode: 'car', origin, destination }, {}), { code: 'ROUTE_KEY_MISSING' });
  await assert.rejects(fetchRoute({ mode: 'traffic', origin: { lon: 0, lat: 0 }, destination }, {}), { code: 'INVALID_ROUTE' });
});
test('이동 수단별 공식 API와 키를 분리하고 보행자 명칭을 인코딩한다', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.includes('/transit/') ? { metaData: { plan: { itineraries: [{ totalTime: 10, legs: [] }] } } } : road };
  };
  const env = { TMAP_APP_KEY: 'road-key', TMAP_TRANSIT_APP_KEY: 'transit-key' };
  for (const mode of ['car', 'walk', 'traffic']) await fetchRoute({ mode, origin, destination }, env, request);
  assert.ok(calls[0].url.endsWith('/tmap/routes?version=1'));
  assert.ok(calls[1].url.includes('/pedestrian'));
  assert.ok(calls[2].url.endsWith('/transit/routes'));
  assert.equal(calls[2].options.headers.appKey, 'transit-key');
  assert.equal(JSON.parse(calls[1].options.body).startName, encodeURIComponent(origin.name));
  assert.equal(JSON.parse(calls[0].options.body).startX, String(origin.lon));
  assert.equal(JSON.parse(calls[0].options.body).resCoordType, 'WGS84GEO');
  assert.ok(calls.every((call) => !call.url.includes('-key')));
});
