import { D, search } from './data.js';
import { openModal } from './modal.js';
import { esc } from './util.js';
import { icon } from './icons.js';
import { createRouteView } from './routing.js';

export function routeURLs(destination, origin, mode = 'car', address = '') {
  const point = (p) => `${encodeURIComponent(p.name.replace(/,/g, ' '))},${p.lat},${p.lon}`;
  const kakao = origin
    ? `https://map.kakao.com/link/by/${mode}/${point(origin)}/${point(destination)}`
    : `https://map.kakao.com/link/to/${point(destination)}`;
  const params = new URLSearchParams({ api: '1', destination: `${destination.lat},${destination.lon}`,
    travelmode: { car: 'driving', traffic: 'transit', walk: 'walking', bicycle: 'bicycling' }[mode] });
  if (origin) params.set('origin', `${origin.lat},${origin.lon}`);
  else if (address.trim()) params.set('origin', address.trim());
  return { kakao, google: 'https://www.google.com/maps/dir/?' + params };
}

export function openDirections(i) {
  const destination = { name: D.name[i], lat: D.lat[i], lon: D.lon[i] };
  let origin = null;
  let mode = 'car';
  let alive = true;
  let locating = false;
  let request = null;
  let routeView = null;
  let response = null;
  const cache = new Map();
  const m = openModal({ className: 'directions', onClose: () => { alive = false; request?.abort(); routeView?.destroy(); } });
  m.scroll.innerHTML = `<div class="f-head"><h2>길찾기</h2></div>
    <section class="group"><h3>도착지</h3><div class="card">
      <div class="r stack"><span class="r-l">${esc(destination.name)}</span><span class="r-v">${esc(D.addr[i])}</span></div></div></section>
    <section class="group"><h3>출발지</h3><div class="card route-form">
      <button class="btn" type="button" data-route="locate">${icon('locate')}현재 위치 사용</button>
      <label for="route-origin">출발 상가명 · 주소</label>
      <input id="route-origin" type="search" placeholder="출발할 상가나 주소를 검색하세요" autocomplete="off" maxlength="200">
      <div class="route-results"></div>
      <p class="route-status" role="status" aria-live="polite">현재 위치를 사용하거나 목록에서 출발 상가를 선택해 주세요.</p>
    </div></section>
    <section class="group"><h3>이동 수단</h3><div class="seg route-modes" role="group" aria-label="이동 수단">
      ${[['car', '자동차'], ['walk', '도보'], ['traffic', '대중교통']].map(([k, label]) => `<button type="button" data-mode="${k}" class="${k === mode ? 'on' : ''}" aria-pressed="${k === mode}">${label}</button>`).join('')}
    </div></section>
    <section class="group"><button type="button" class="primary" data-route="search" disabled>경로 찾기</button></section>
    <section class="group"><h3>경로 지도</h3><div class="card"><div class="route-map" role="region" aria-label="길찾기 경로 지도"></div></div></section>
    <div class="route-output" aria-live="polite"><p class="place-message">출발지를 선택하면 웹 안에서 경로를 확인할 수 있어요.</p></div>
    <section class="group"><h3>지도 앱에서도 보기</h3><div class="card linkrow">
      <a data-provider="kakao" target="_blank" rel="noopener noreferrer"><i style="background:#FEE500;color:#191919">K</i>카카오맵 길찾기${icon('ext')}</a>
      <a data-provider="google" target="_blank" rel="noopener noreferrer"><i style="background:#4285F4;color:#fff">G</i>구글지도 길찾기${icon('ext')}</a>
    </div><p class="hint route-hint"></p></section><p class="foot">경로 정보: TMAP · 실제 이동 시간은 교통 상황과 운행 시간에 따라 달라질 수 있어요.</p>`;
  const input = m.scroll.querySelector('#route-origin');
  const results = m.scroll.querySelector('.route-results');
  const status = m.scroll.querySelector('.route-status');
  const searchButton = m.scroll.querySelector('[data-route="search"]');
  const output = m.scroll.querySelector('.route-output');
  routeView = createRouteView(m.scroll.querySelector('.route-map'), destination);
  const labels = { car: '자동차', walk: '도보', traffic: '대중교통' };
  const modes = { WALK: '도보', CAR: '자동차', BUS: '버스', SUBWAY: '지하철', TRAIN: '기차', EXPRESSBUS: '고속·시외버스', AIRPLANE: '항공', FERRY: '배' };
  const time = (seconds) => {
    if (seconds == null) return '시간 미제공';
    const minutes = Math.ceil(seconds / 60);
    return minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes}분`;
  };
  const distance = (meters) => meters == null ? '거리 미제공' : meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
  function cancel() { request?.abort(); request = null; response = null; routeView.show(null, origin); }
  function showRoute(index) {
    const route = response.routes[index];
    routeView.show(route, origin);
    output.innerHTML = `<section class="group"><h3>${labels[mode]} 경로</h3><div class="card">
      ${response.routes.length > 1 ? `<div class="route-alternatives">${response.routes.map((r, k) => `<button type="button" class="route-option${k === index ? ' on' : ''}" data-route-index="${k}" aria-pressed="${k === index}"><b>${k === 0 ? '추천 경로' : '경로 ' + (k + 1)}</b><span>${time(r.duration)} · ${distance(r.distance)}</span></button>`).join('')}</div>` : ''}
      <div class="route-summary"><strong>${time(route.duration)}</strong><span>${distance(route.distance)}</span>
        ${route.transfers != null ? `<span>환승 ${route.transfers}회</span>` : ''}
        ${route.fare != null ? `<span>교통비 ${route.fare.toLocaleString('ko-KR')}원</span>` : ''}
        ${route.toll != null ? `<span>통행료 ${route.toll.toLocaleString('ko-KR')}원</span>` : ''}
        ${route.walkDistance != null ? `<span>도보 ${distance(route.walkDistance)}</span>` : ''}
      </div>
      ${route.geometry.features.length ? '' : '<p class="place-message">경로 선이 제공되지 않아 이동 안내만 표시해요.</p>'}
      <ol class="route-steps">${route.steps.map((step) => `<li><div><span class="route-step-mode">${esc(modes[step.mode] || step.mode)}</span>${step.duration != null ? `<small>${time(step.duration)}</small>` : ''}</div><p>${esc(step.instruction)}</p>
        ${step.service === 0 ? '<small class="route-service-warning">현재 운행이 종료된 구간이에요.</small>' : ''}
        ${step.stops?.length ? `<details><summary>정류장 ${step.stops.length}곳</summary><p>${esc(step.stops.join(' → '))}</p></details>` : ''}
        ${step.details?.length ? `<details><summary>도보 상세 안내</summary>${step.details.map((text) => `<p>${esc(text)}</p>`).join('')}</details>` : ''}</li>`).join('')}</ol>
      <p class="place-message">${esc(response.source)} 제공</p></div></section>`;
  }
  async function findRoute() {
    if (!origin) { status.textContent = '목록에서 출발지를 선택해 주세요.'; return; }
    cancel();
    const selectedMode = mode;
    const key = `${origin.lon},${origin.lat},${mode}`;
    if (cache.has(key)) { response = cache.get(key); showRoute(0); return; }
    const controller = new AbortController();
    request = controller;
    searchButton.disabled = true;
    output.innerHTML = `<section class="group"><h3>${labels[mode]} 경로</h3><div class="card"><div class="shimmer"></div><p class="place-message">실제 경로를 검색하고 있어요…</p></div></section>`;
    try {
      if (location.protocol === 'file:') throw new Error('웹 서버로 접속하면 내장 길찾기를 사용할 수 있어요.');
      const result = await fetch('/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, origin, id: D.id[i], region: D.region }), signal: controller.signal });
      const data = await result.json();
      if (!result.ok) throw new Error(data.message || '경로를 불러오지 못했어요.');
      if (!alive || controller.signal.aborted || mode !== selectedMode) return;
      cache.set(key, data);
      response = data;
      showRoute(0);
    } catch (error) {
      if (!alive || controller.signal.aborted) return;
      output.innerHTML = `<section class="group"><h3>${labels[selectedMode]} 경로</h3><div class="card"><p class="place-message">${esc(error.message)}</p></div></section>`;
    } finally { if (alive && request === controller) { request = null; searchButton.disabled = !origin; } }
  }
  function update() {
    const urls = routeURLs(destination, origin, mode, input.value);
    searchButton.disabled = !origin;
    for (const provider of ['kakao', 'google']) m.scroll.querySelector(`[data-provider="${provider}"]`).href = urls[provider];
    m.scroll.querySelector('.route-hint').textContent = origin ? '선택한 출발지와 이동 수단으로 경로를 열어요.'
      : input.value.trim() ? '입력한 주소는 구글지도에 전달돼요. 카카오맵에서는 출발지와 이동 수단을 선택해 주세요.'
      : '출발지를 지정하지 않으면 지도 앱에서 출발지와 이동 수단을 선택할 수 있어요.';
  }
  input.addEventListener('input', () => {
    origin = null;
    cancel();
    output.innerHTML = '<p class="place-message">검색 결과에서 출발 상가를 선택해 주세요.</p>';
    const query = input.value.trim();
    results.innerHTML = query ? search(query, 5).map((j) => `<button type="button" class="route-result" data-origin="${j}"><b>${esc(D.name[j])}</b><small>${esc(D.addr[j])}</small></button>`).join('') : '';
    status.textContent = query ? '검색 결과에서 출발 상가를 선택해 주세요.' : '현재 위치를 사용하거나 출발 상가를 검색해 주세요.';
    update();
  });
  m.scroll.addEventListener('click', (e) => {
    const result = e.target.closest('[data-origin]');
    if (result) {
      const j = +result.dataset.origin;
      origin = { name: D.name[j], lat: D.lat[j], lon: D.lon[j] };
      input.value = origin.name;
      results.innerHTML = '';
      status.textContent = '출발지: ' + D.addr[j];
      cancel();
      output.innerHTML = '<p class="place-message">이동 수단을 선택하고 경로 찾기를 눌러 주세요.</p>';
      update();
    }
    const button = e.target.closest('[data-mode]');
    if (button) {
      const hadRoute = !!response;
      cancel();
      mode = button.dataset.mode;
      m.scroll.querySelectorAll('[data-mode]').forEach((b) => {
        b.classList.toggle('on', b === button);
        b.setAttribute('aria-pressed', String(b === button));
      });
      update();
      output.innerHTML = '<p class="place-message">' + labels[mode] + ' 경로 찾기를 눌러 주세요.</p>';
      if (hadRoute && origin) findRoute();
    }
    const alternative = e.target.closest('[data-route-index]');
    if (alternative && response) showRoute(+alternative.dataset.routeIndex);
    if (e.target.closest('[data-route="search"]')) findRoute();
    const locate = e.target.closest('[data-route="locate"]');
    if (!locate || locating) return;
    if (!navigator.geolocation) { status.textContent = '위치를 지원하지 않는 브라우저예요. 출발 주소를 입력해 주세요.'; return; }
    locating = true;
    locate.disabled = true;
    status.textContent = '현재 위치를 확인하고 있어요…';
    navigator.geolocation.getCurrentPosition((position) => {
      if (!alive) return;
      locating = false;
      locate.disabled = false;
      origin = { name: '현재 위치', lat: position.coords.latitude, lon: position.coords.longitude };
      input.value = '현재 위치';
      results.innerHTML = '';
      status.textContent = '현재 위치를 출발지로 설정했어요.';
      cancel();
      output.innerHTML = '<p class="place-message">이동 수단을 선택하고 경로 찾기를 눌러 주세요.</p>';
      update();
    }, (error) => {
      if (!alive) return;
      locating = false;
      locate.disabled = false;
      status.textContent = error.code === 1 ? '위치 권한이 꺼져 있어요. 출발 주소를 직접 입력할 수 있어요.' : '현재 위치를 확인하지 못했어요. 출발 주소를 입력해 주세요.';
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  });
  update();
}
