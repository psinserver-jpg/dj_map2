import test from 'node:test';
import assert from 'node:assert/strict';
import { makePath, projectPosition, navigationState, startNavigation } from '../js/navigation.js';
import { apiJSON } from '../js/api.js';
import { createServer } from './server.mjs';

const destination = { lon: 129.01, lat: 35 };
const route = { duration: 600, geometry: { features: [{ geometry: { coordinates: [[129, 35], [129.005, 35], [129.01, 35]] } }] },
  steps: [{ instruction: '출발', location: { lon: 129, lat: 35 } }, { instruction: '우회전', location: { lon: 129.005, lat: 35 } }, { instruction: '도착', location: destination }] };
test('이동하면 남은 거리와 다음 안내가 바뀌고 도착·경로 이탈을 감지한다', () => {
  const start = navigationState(route, destination, { lon: 129, lat: 35, accuracy: 10 });
  const middle = navigationState(route, destination, { lon: 129.006, lat: 35, accuracy: 10 }, start.progress);
  assert.ok(middle.remaining < start.remaining);
  assert.equal(start.next.instruction, '우회전');
  assert.equal(middle.next.instruction, '도착');
  assert.equal(navigationState(route, destination, { ...destination, accuracy: 5 }).arrived, true);
  assert.equal(navigationState(route, destination, { lon: 129.004, lat: 35.002, accuracy: 10 }).offRoute, true);
  assert.equal(navigationState(route, destination, { lon: 129.004, lat: 35.002, accuracy: 150 }).offRoute, false);
  assert.equal(navigationState(route, destination, { ...destination, accuracy: 150 }).arrived, false);
  assert.ok(projectPosition({ lon: 129.004, lat: 35 }, makePath(route)).offset < 1);
});
test('GPS 추적을 종료하고 재탐색 및 음성 안내를 제어한다', async () => {
  let position, stopped = 0, rerouted = 0, spoken = 0;
  const oldNavigator = globalThis.navigator, oldWindow = globalThis.window, oldSpeech = globalThis.SpeechSynthesisUtterance;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: {
    watchPosition(callback) { position = callback; return 7; }, clearWatch(id) { assert.equal(id, 7); stopped++; },
  } } });
  globalThis.window = { speechSynthesis: { speak() { spoken++; }, cancel() {} } };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  try {
    const navigation = startNavigation({ route, destination, mode: 'car', onPosition() {}, onUpdate() {}, onStop() {}, async onReroute() { rerouted++; return route; } });
    await position({ coords: { longitude: 129.004, latitude: 35.002, accuracy: 10 } });
    assert.equal(rerouted, 1);
    assert.ok(spoken > 0);
    assert.equal(navigation.toggleVoice(), false);
    navigation.stop();
    assert.equal(stopped, 1);
    await position({ coords: { longitude: 129, latitude: 35, accuracy: 10 } });
    assert.equal(rerouted, 1);
  } finally {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: oldNavigator });
    globalThis.window = oldWindow;
    globalThis.SpeechSynthesisUtterance = oldSpeech;
  }
});
test('API 오류 페이지를 JSON으로 해석하지 않고 연결 오류를 표시한다', async () => {
  const oldFetch = globalThis.fetch, oldLocation = globalThis.location;
  globalThis.location = { hostname: 'localhost', protocol: 'http:' };
  globalThis.fetch = async (url) => url === 'api-config.json' ? new Response('{"baseUrl":""}', { status: 200 }) : new Response('<!DOCTYPE html>', { status: 404, headers: { 'Content-Type': 'text/html' } });
  try { await assert.rejects(apiJSON('/api/place'), /서버가 응답하지/); }
  finally { globalThis.fetch = oldFetch; globalThis.location = oldLocation; }
});
test('허용된 GitHub 사이트의 API 요청과 preflight만 허용한다', async () => {
  const oldOrigin = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = 'https://psinserver-jpg.github.io';
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/route`;
  try {
    const allowed = await fetch(url, { method: 'OPTIONS', headers: { Origin: process.env.PUBLIC_ORIGIN } });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-origin'), process.env.PUBLIC_ORIGIN);
    const denied = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://other.example' } });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  } finally { await new Promise((resolve) => server.close(resolve)); if (oldOrigin == null) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = oldOrigin; }
});
