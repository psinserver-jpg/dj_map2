import { D, loadData, filter, applyFilter, indexOfId } from './data.js';
import * as M from './map.js';
import { initUI, refreshRegionUI, renderChips, syncPop, setDetent } from './ui.js';
import { openDetail, closeDetail } from './detail.js';
import { S, pushRecent } from './state.js';
import { $, bus, debounce, store, toast, fmt } from './util.js';

const isMobile = () => matchMedia('(max-width: 767px)').matches;
const view = { basemap: store.get('busan-basemap', 'std'), theme: store.get('busan-theme', 'auto'), heat: false };

// ---------- 테마 ----------
const mq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme(mode) {
  view.theme = mode;
  const dark = mode === 'dark' || (mode === 'auto' && mq.matches);
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.dataset.resolved = dark ? 'dark' : 'light';
  S.dark = dark;
  $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#f2f2f7');
  if (M.map) M.setDark(dark);
}
applyTheme(view.theme);
mq.addEventListener('change', () => view.theme === 'auto' && applyTheme('auto'));

// ---------- 스플래시 ----------
const splash = $('#splash');
function setSplash(p) {
  $('#splash-bar').style.width = Math.round(p * 100) + '%';
  $('#splash-txt').textContent = p > 0 ? `상가 데이터 불러오는 중… ${Math.round(p * 100)}%` : '상가 데이터 불러오는 중…';
}
function hideSplash() {
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 600);
}

// ---------- URL 해시 ----------
function encodeFilter() {
  const parts = [];
  D.cats.forEach((c, ci) => {
    const subs = D.subs.map((s, k) => [s, k]).filter(([, k]) => D.subCat[k] === ci);
    const on = subs.filter(([, k]) => filter.subs.has(k));
    if (!on.length) return;
    if (on.length === subs.length) parts.push(c.code);
    else on.forEach(([s]) => parts.push(s.code));
  });
  return parts.join(',');
}

function decodeFilter(str) {
  filter.subs.clear();
  for (const tok of str.split(',').filter(Boolean)) {
    const ci = D.cats.findIndex((c) => c.code === tok);
    if (ci >= 0) D.subs.forEach((_, k) => D.subCat[k] === ci && filter.subs.add(k));
    else {
      const k = D.subs.findIndex((s) => s.code === tok);
      if (k >= 0) filter.subs.add(k);
    }
  }
}

const updateHash = debounce(() => {
  if (!M.map) return;
  const c = M.map.getCenter();
  const p = new URLSearchParams();
  p.set('r', D.region);
  if (filter.city != null) p.set('c', D.dists[filter.city].code);
  p.set('map', `${M.map.getZoom().toFixed(2)}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`);
  if (S.sel != null) p.set('shop', D.id[S.sel]);
  const f = encodeFilter();
  if (f) p.set('s', f);
  if (filter.dists.size) p.set('d', [...filter.dists].map((k) => D.dists[k].code).join(','));
  history.replaceState(null, '', '#' + decodeURIComponent(p.toString()).replace(/ /g, '+'));
}, 400);

function parseHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const out = { p };
  const m = /^([\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)$/.exec(p.get('map') || '');
  if (m) out.view = { zoom: +m[1], center: [+m[3], +m[2]] };
  return out;
}

function applyHashState(h) {
  const p = h.p;
  const city = D.dists.findIndex((d) => d.code === p.get('c'));
  filter.city = city >= 0 ? city : null;
  decodeFilter(p.get('s') || '');
  filter.dists.clear();
  (p.get('d') || '')
    .split(',')
    .filter(Boolean)
    .forEach((code) => {
      const k = D.dists.findIndex((d) => d.code === code);
      if (k >= 0) filter.dists.add(k);
    });
  applyFilter();
}

// ---------- 선택 / 상세 ----------
function selectShop(i, { fly = true, open = true } = {}) {
  S.sel = i;
  M.setSelected(i);
  pushRecent(D.id[i]);
  if (fly) M.flyTo(D.lon[i], D.lat[i], Math.max(M.map.getZoom(), 16.2));
  if (open) openDetail(i);
  updateHash();
}

bus.on('select-shop', (i) => selectShop(i));
bus.on('shop-click', (i) => selectShop(i, { fly: false }));
bus.on('map-empty', () => {
  if (S.sel != null) {
    S.sel = null;
    M.setSelected(null);
    updateHash();
  }
});
bus.on('focus-map', () => {
  if (S.sel != null) M.flyTo(D.lon[S.sel], D.lat[S.sel], 17.5);
});
bus.on('move', updateHash);

// ---------- 지역 이동 ----------
bus.on('goto-dist', (k) => {
  const d = D.dists[k];
  selectCity(d.code);
  if (isMobile()) setDetent('half');
});

let switchingRegion = false;
function fitRegion(bounds) {
  // MapLibre adds fitBounds padding to the current camera padding.
  // Reset it first so the sidebar inset is applied only once.
  M.map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  const width = M.map.getContainer().clientWidth;
  const height = M.map.getContainer().clientHeight;
  M.map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], {
    padding: isMobile() ? { top: 90, bottom: Math.min(220, height * 0.32), left: 24, right: 24 } : { top: 40, bottom: 40, left: Math.min(440, width * 0.55), right: 24 },
    maxZoom: 13, duration: 700, essential: true,
  });
}
function selectCity(code) {
  if (switchingRegion) return;
  closeDetail();
  S.sel = null;
  S.radius = null;
  M.setSelected(null);
  M.setRadius(null);
  const city = D.dists.findIndex((d) => d.code === code);
  filter.city = city >= 0 ? city : null;
  filter.dists.clear();
  applyFilter();
  refreshRegionUI();
  bus.emit('filter-changed');
  fitRegion(city >= 0 ? D.dists[city].bounds : D.meta.bounds);
  updateHash();
}
async function changeRegion(region, hashState = null) {
  if (switchingRegion) return;
  if (region === D.region) { if (!hashState) selectCity(''); return; }
  switchingRegion = true;
  closeDetail();
  const previous = D.region;
  const selectors = [$('#region-select'), $('#city-select')];
  selectors.forEach((el) => el.disabled = true);
  $('#sidebar').inert = true;
  $('#map').inert = true;
  $('#region-status').textContent = '선택한 지역의 상가를 불러오는 중…';
  try {
    await loadData(null, region);
    S.sel = null;
    S.radius = null;
    S.tab = 'view';
    M.setSelected(null);
    M.setRadius(null);
    if (hashState) applyHashState(hashState);
    M.setShops(D.F, !D.filtered);
    refreshRegionUI();
    bus.emit('filter-changed');
    if (hashState?.view) M.map.jumpTo(hashState.view);
    else fitRegion(filter.city != null ? D.dists[filter.city].bounds : D.meta.bounds);
    const id = hashState?.p.get('shop');
    if (id) { const i = indexOfId(id); if (i != null) selectShop(i); }
    store.set('shops-region', D.region);
    $('#region-status').textContent = '';
    updateHash();
  } catch (error) {
    $('#region-select').value = previous;
    $('#region-status').textContent = '지역 데이터를 불러오지 못했어요. 다시 선택해 주세요.';
  } finally {
    switchingRegion = false;
    selectors.forEach((el) => el.disabled = false);
    $('#sidebar').inert = false;
    $('#map').inert = false;
  }
}
bus.on('region-select', (region) => changeRegion(region));
bus.on('city-select', selectCity);

// ---------- 필터 ----------
bus.on('filter-changed', () => {
  M.setShops(D.F, !D.filtered);
  updateHash();
});

// ---------- 반경 검색 ----------
function setRadius(c, fit = true) {
  S.radius = c;
  M.setRadius(c);
  if (c && fit) M.fitRadius(c, { padding: isMobile() ? { top: 80, bottom: 320, left: 30, right: 30 } : { top: 60, bottom: 60, left: 60, right: 70 } });
  if (c && isMobile()) setDetent('half');
  bus.emit('radius-changed');
}
bus.on('radius-set', (c) => setRadius(c));
bus.on('radius-clear', () => setRadius(null));
bus.on('radius-from', (i, r) => {
  closeDetail();
  setRadius({ lon: D.lon[i], lat: D.lat[i], r, label: D.name[i] });
});
bus.on('radius-request', async (kind, r) => {
  if (kind === 'center') {
    const c = M.map.getCenter();
    setRadius({ lon: c.lng, lat: c.lat, r, label: '지도 중심' });
  } else {
    const u = await locate();
    if (u) setRadius({ lon: u.lon, lat: u.lat, r, label: '내 위치' });
  }
});

// ---------- 내 위치 ----------
function locate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      toast('이 브라우저는 위치 기능을 지원하지 않아요');
      return resolve(null);
    }
    toast('현재 위치를 찾는 중…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude: lon, latitude: lat } = pos.coords;
        const b = D.meta.bounds;
        if (lon < b[0] - 0.15 || lon > b[2] + 0.15 || lat < b[1] - 0.15 || lat > b[3] + 0.15) {
          toast('현재 위치는 선택한 지역 밖이에요. 해당 시·도를 선택하면 상가를 볼 수 있어요');
        }
        S.user = { lon, lat };
        M.showUser(lon, lat);
        M.flyTo(lon, lat, 15);
        resolve(S.user);
      },
      (err) => {
        toast(err.code === 1 ? '위치 권한을 허용해 주세요' : '현재 위치를 가져오지 못했어요');
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}
bus.on('locate', locate);

// ---------- 표시 옵션 ----------
bus.on('set-basemap', (v) => {
  view.basemap = v;
  store.set('busan-basemap', v);
  M.setBasemap(v);
  syncPop({ ...view });
});
bus.on('set-theme', (v) => {
  store.set('busan-theme', v);
  applyTheme(v);
  syncPop({ ...view });
});
bus.on('set-heat', (on) => {
  view.heat = on;
  M.setHeat(on);
  syncPop({ ...view });
});

// ---------- 단축키 ----------
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
    e.preventDefault();
    $('#q').focus();
  }
});

// ---------- 부트 ----------
async function boot() {
  const h = parseHash();
  try {
    await loadData(setSplash, h.p.get('r') || store.get('shops-region', '26'));
  } catch (err) {
    console.error(err);
    $('#splash-txt').innerHTML =
      '데이터를 불러오지 못했어요.<br><small>web2 폴더의 <b>data</b> 폴더가 그대로 있는지 확인해 주세요.</small>';
    $('#splash-bar').parentElement.hidden = true;
    return;
  }
  applyHashState(h);
  await M.initMap('map', { ...h.view, dark: S.dark, basemap: view.basemap });
  M.setShops(D.F, !D.filtered);
  syncPop({ ...view });
  initUI();
  renderChips();
  if (!h.view) fitRegion(filter.city != null ? D.dists[filter.city].bounds : D.meta.bounds);

  const shopId = h.p.get('shop');
  if (shopId) {
    const i = indexOfId(shopId);
    if (i != null) selectShop(i, { fly: !h.view });
  }
  hideSplash();
  window.__app = { D, M, S }; // 디버깅 편의
}

window.addEventListener('hashchange', async () => {
  // 외부에서 해시가 바뀐 경우(공유 링크 붙여넣기 등)
  const h = parseHash();
  if (!D.n) return;
  if (h.p.get('r') && h.p.get('r') !== D.region) { await changeRegion(h.p.get('r'), h); return; }
  applyHashState(h);
  M.setShops(D.F, !D.filtered);
  renderChips();
  bus.emit('filter-changed');
  const id = h.p.get('shop');
  if (id) {
    const i = indexOfId(id);
    if (i != null) selectShop(i);
  }
});

boot();
