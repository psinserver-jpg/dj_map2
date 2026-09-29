/* 자동 생성 파일 — 수정하지 마세요. 소스는 js/*.js, 생성은 python tools/bundle.py */
(function () {
'use strict';

// ===== util.js =====
const __m_util = (() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDist(m) {
  if (m == null || !isFinite(m)) return '';
  if (m < 1000) return Math.round(m) + 'm';
  return (m / 1000).toFixed(m < 10000 ? 1 : 0) + 'km';
}

const debounce = (fn, ms) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

// 아주 작은 이벤트 버스 (모듈 간 결합 최소화)
const listeners = {};
const bus = {
  on(e, f) {
    (listeners[e] ||= []).push(f);
  },
  emit(e, ...a) {
    (listeners[e] || []).forEach((f) => f(...a));
  },
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
}

async function copyText(text, msg = '복사했어요') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      /* noop */
    }
    ta.remove();
  }
  toast(msg);
}

function highlight(text, q) {
  const t = String(text ?? '');
  if (!q) return esc(t);
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(t);
  return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length));
}

// 한글 초성 검색
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function chosung(s) {
  let r = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    r += c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)] : ch;
  }
  return r;
}
const isJamo = (s) => /^[ㄱ-ㅎ\s]+$/.test(s) && /[ㄱ-ㅎ]/.test(s);

const store = {
  get(k, def) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* noop */
    }
  },
};
return { $, $$, fmt, esc, fmtDist, debounce, bus, toast, copyText, highlight, chosung, isJamo, store };
})();

// ===== data.js =====
const __m_data = (() => {
const { chosung, isJamo } = __m_util;

// 전체 데이터 (컬럼형 typed array)
const D = {};
// 활성 필터 (비어 있으면 전체)
const filter = { subs: new Set(), dists: new Set() };

// <script> 태그로 데이터 파일을 읽는다 (file:// 로 열어도 동작; fetch/XHR은 file:// 에서 차단됨)
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => {
      el.remove();
      resolve();
    };
    el.onerror = () => {
      el.remove();
      reject(new Error(src + ' 을(를) 불러오지 못했어요'));
    };
    document.head.appendChild(el);
  });
}

async function loadData(onProgress) {
  // 진행률은 알 수 없으므로 두 파일 단위로만 표시
  onProgress && onProgress(0);
  await loadScript('data/meta.js');
  onProgress && onProgress(0.15);
  await loadScript('data/points.js');
  onProgress && onProgress(0.9);
  const meta = window.BUSAN_META;
  const p = window.BUSAN_POINTS;
  delete window.BUSAN_META;
  delete window.BUSAN_POINTS;
  D.meta = meta;
  D.cats = meta.cats;
  D.mids = meta.mids;
  D.subs = meta.subs;
  D.dists = meta.dists;
  D.subCat = Uint8Array.from(meta.subs, (s) => meta.mids[s.mid].cat);
  D.n = p.n;
  D.lon = Float64Array.from(p.lon);
  D.lat = Float64Array.from(p.lat);
  D.sub = Uint16Array.from(p.sub);
  D.dist = Uint8Array.from(p.dist);
  D.cat = new Uint8Array(D.n);
  for (let i = 0; i < D.n; i++) D.cat[i] = D.subCat[D.sub[i]];
  D.name = p.name;
  D.addr = p.addr;
  D.id = p.id;
  D.branch = new Map(Object.entries(p.branch).map(([k, v]) => [+k, v]));
  D.bname = new Map(Object.entries(p.bname).map(([k, v]) => [+k, v]));
  D.nl = p.name.map((s) => s.toLowerCase());
  D.al = p.addr.map((s) => s.toLowerCase());
  applyFilter();
}

function applyFilter() {
  const hs = filter.subs.size > 0;
  const hd = filter.dists.size > 0;
  const subOn = new Uint8Array(D.subs.length);
  filter.subs.forEach((s) => (subOn[s] = 1));
  const distOn = new Uint8Array(D.dists.length);
  filter.dists.forEach((s) => (distOn[s] = 1));
  const out = new Uint32Array(D.n);
  let k = 0;
  for (let i = 0; i < D.n; i++) {
    if (hs && !subOn[D.sub[i]]) continue;
    if (hd && !distOn[D.dist[i]]) continue;
    out[k++] = i;
  }
  D.F = out.subarray(0, k);
  D.filtered = hs || hd;
}

let idMap;
function indexOfId(id) {
  if (!idMap) {
    idMap = new Map();
    for (let i = 0; i < D.n; i++) idMap.set(D.id[i], i);
  }
  return idMap.get(id);
}

// ---------- 공간 질의 ----------
function metersFrom(i, lon0, lat0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return Math.hypot((D.lon[i] - lon0) * kx, (D.lat[i] - lat0) * 110540);
}

let vpBuf;
function queryBounds(w, s, e, n, cap) {
  const F = D.F;
  const cc = new Uint32Array(D.cats.length);
  vpBuf ||= new Uint32Array(D.n);
  let cnt = 0;
  for (let k = 0; k < F.length; k++) {
    const i = F[k];
    const x = D.lon[i];
    const y = D.lat[i];
    if (x < w || x > e || y < s || y > n) continue;
    cc[D.cat[i]]++;
    if (cnt < cap) vpBuf[cnt] = i;
    cnt++;
  }
  return { total: cnt, cats: cc, idx: cnt <= cap ? vpBuf.slice(0, cnt) : null };
}

// 반경 질의. useFilter=false 이면 전체 데이터에서 검색
function queryRadius(lon0, lat0, r, useFilter = true) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  const dLon = r / kx;
  const dLat = r / ky;
  const w = lon0 - dLon;
  const e = lon0 + dLon;
  const s = lat0 - dLat;
  const n = lat0 + dLat;
  const src = useFilter ? D.F : null;
  const len = useFilter ? D.F.length : D.n;
  const idx = [];
  const dist = [];
  for (let k = 0; k < len; k++) {
    const i = src ? src[k] : k;
    const x = D.lon[i];
    const y = D.lat[i];
    if (x < w || x > e || y < s || y > n) continue;
    const d = Math.hypot((x - lon0) * kx, (y - lat0) * ky);
    if (d <= r) {
      idx.push(i);
      dist.push(d);
    }
  }
  const order = idx.map((_, k) => k).sort((a, b) => dist[a] - dist[b]);
  return { idx: order.map((k) => idx[k]), dist: order.map((k) => dist[k]) };
}

// ---------- 검색 ----------
function search(q, limit = 40) {
  q = q.trim();
  if (!q) return [];
  const t0 = [];
  const t1 = [];
  const t2 = [];
  const t3 = [];
  if (isJamo(q)) {
    const qc = q.replace(/\s/g, '');
    D.cho ||= D.name.map(chosung);
    for (let i = 0; i < D.n && t0.length < limit; i++) {
      const c = D.cho[i];
      if (c.startsWith(qc)) t0.push(i);
      else if (t1.length < limit && c.includes(qc)) t1.push(i);
    }
  } else {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const first = tokens[0];
    for (let i = 0; i < D.n && t0.length < limit; i++) {
      const nl = D.nl[i];
      if (tokens.length === 1) {
        if (nl.startsWith(first)) t0.push(i);
        else if (nl.includes(first)) t1.push(i);
        else {
          const br = (D.branch.get(i) || '') + ' ' + (D.bname.get(i) || '');
          if (br.toLowerCase().includes(first)) t2.push(i);
          else if (D.al[i].includes(first)) t3.push(i);
        }
      } else {
        const hay = nl + ' ' + D.al[i] + ' ' + (D.branch.get(i) || '').toLowerCase() + ' ' + (D.bname.get(i) || '').toLowerCase();
        if (!tokens.every((t) => hay.includes(t))) continue;
        if (tokens.every((t) => nl.includes(t))) t0.push(i);
        else if (nl.includes(first)) t1.push(i);
        else t2.push(i);
      }
    }
  }
  return [...t0, ...t1, ...t2, ...t3].slice(0, limit);
}

// ---------- 상세(시군구 샤드) ----------
const shardCache = new Map();
function loadShard(d) {
  let p = shardCache.get(d);
  if (!p) {
    const code = D.dists[d].code;
    p = loadScript(`data/detail/${code}.js`).then(() => {
      const s = window.BUSAN_DETAIL[code];
      delete window.BUSAN_DETAIL[code];
      s.byBldg = new Map();
      s.rows.forEach((r, k) => {
        const b = r[6];
        if (!b) return;
        let a = s.byBldg.get(b);
        if (!a) s.byBldg.set(b, (a = []));
        a.push(k);
      });
      return s;
    });
    p.catch(() => shardCache.delete(d));
    shardCache.set(d, p);
  }
  return p;
}

const pad = (n, w) => String(n).padStart(w, '0');

async function getDetail(i) {
  const d = D.dist[i];
  const dist = D.dists[d];
  const s = await loadShard(d);
  const k = i - dist.start;
  const r = s.rows[k];
  const [hd, bd, land, bon, bu, rd, bNo, bName, zipNew, zipOld, floor, dongInfo, hoInfo, ks] = r;
  const bdong = s.b[bd];
  const road = s.r[rd];
  let jibun = `부산광역시 ${dist.name} ${bdong[1]}`;
  if (bon > 0) jibun += ` ${land === '2' ? '산 ' : ''}${bon}${bu ? '-' + bu : ''}`;
  const same = bNo ? (s.byBldg.get(bNo) || []).map((x) => x + dist.start).filter((j) => j !== i) : [];
  return {
    hdong: s.h[hd],
    bdong,
    road,
    land: land === '2' ? '산' : '대지',
    jibun,
    jibunCode: `${bdong[0]}${land}${pad(bon, 4)}${pad(bu, 4)}`,
    bldgNo: bNo,
    bldgName: bName,
    zipNew,
    zipOld,
    floor,
    dongInfo,
    hoInfo,
    ksic: D.meta.ksic[ks],
    sameBuilding: same,
  };
}
return { D, filter, loadData, applyFilter, indexOfId, metersFrom, queryBounds, queryRadius, search, loadShard, getDetail };
})();

// ===== icons.js =====
const __m_icons = (() => {
// SF Symbols 느낌의 라인 아이콘 (24x24, stroke 기반)
const P = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  chevD: '<path d="M5 9l7 7 7-7"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  minus: '<path d="M6 12h12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  share: '<path d="M12 15V4M8 7.5l4-4 4 4"/><path d="M7 10.5H6a1 1 0 00-1 1V19a1 1 0 001 1h12a1 1 0 001-1v-7.5a1 1 0 00-1-1h-1"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7.5a2 2 0 002 2h2.5"/>',
  route: '<path d="M12 2.8l9.2 9.2-9.2 9.2L2.8 12z"/><path d="M8.5 14v-2.4a1.4 1.4 0 011.4-1.4H15m0 0l-2.2-2.2M15 10.2l-2.2 2.2"/>',
  locate: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  layers: '<path d="M12 3.5l9 4.8-9 4.8-9-4.8z"/><path d="M3 12.2l9 4.8 9-4.8"/><path d="M3 16l9 4.8 9-4.8"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  flame: '<path d="M12 21c4 0 6.5-2.7 6.5-6.2 0-3.3-2.3-5-3.3-7.3-.8 1.4-1.5 2.1-2.7 2.9C12.5 8 12 5.5 10.5 3.5 10 7 5.5 9.5 5.5 14.8 5.5 18.3 8 21 12 21z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  download: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
  pin: '<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 10-13 0c0 5.4 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  radius: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="2"/>',
  map: '<path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r=".9"/><circle cx="4.8" cy="12" r=".9"/><circle cx="4.8" cy="17.5" r=".9"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.3 2"/>',
  hash: '<path d="M9.5 4l-1.5 16M16 4l-1.5 16M4.5 9h16M3.5 15h16"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4"/>',
  // 업종 아이콘
  fork: '<path d="M6.5 3v6.5a2.5 2.5 0 005 0V3M9 3v18"/><path d="M17 21V3c-2.2 1.3-3.5 4-3.5 7.5 0 1.6 1.2 2.5 3.5 2.5"/>',
  bag: '<path d="M5.5 8h13l1 12.5h-15z"/><path d="M9 8V6.5a3 3 0 016 0V8"/>',
  wrench: '<path d="M14.6 6.2a4.2 4.2 0 005.3 5.3l-8.6 8.6a2.2 2.2 0 01-3.1-3.1l8.6-8.6a4.2 4.2 0 01-2.2-2.2z"/>',
  flask: '<path d="M9.5 3.5h5M10.5 3.5v5.8L5.2 18a2 2 0 001.7 3h10.2a2 2 0 001.7-3l-5.3-8.7V3.5"/><path d="M8 14.5h8"/>',
  book: '<path d="M12 6.5C10 4.8 7 4.5 4 5v13c3-.5 6 0 8 1.7 2-1.7 5-2.2 8-1.7V5c-3-.5-6-.2-8 1.5zM12 6.5v13"/>',
  building: '<rect x="5" y="3.5" width="10" height="17" rx="1.5"/><path d="M15 9.5h3.5a1 1 0 011 1v10M8.5 8h3M8.5 12h3M8.5 16h3"/>',
  ticket: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c-3 3-3 14 0 17M12 3.5c3 3 3 14 0 17"/>',
  house: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5M10 20v-5.5h4V20"/>',
  bed: '<path d="M3 18V6M3 14h18v4M21 14v-2.5a3 3 0 00-3-3h-7V14"/><circle cx="7" cy="11" r="1.6"/>',
  cross: '<path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z"/>',
};

function icon(name, cls = '') {
  const fill = name === 'starFill';
  const p = P[fill ? 'star' : name] || P.info;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

function iconPath(name) {
  return P[name] || P.info;
}
return { icon, iconPath };
})();

// ===== map.js =====
const __m_map = (() => {
const { D } = __m_data;
const { bus, esc } = __m_util;
const { iconPath } = __m_icons;

const maplibregl = window.maplibregl;
let map;

const EMPTY = { type: 'FeatureCollection', features: [] };
const HOME = { center: [129.06, 35.16], zoom: 11 };
const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'; // OpenFreeMap: 무료·키 불필요
const FALLBACK_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

const BASEMAPS = {
  std: { label: '표준', credit: '© OpenFreeMap © OpenMapTiles · Data © OpenStreetMap contributors' },
  osm: { label: 'OSM', credit: '© OpenStreetMap contributors' },
  sat: { label: '위성', credit: 'Imagery © Esri — Maxar, Earthstar Geographics, GIS User Community' },
};

const state = { basemap: 'std', dark: false, heat: false, ready: false, hasBase: false, vec: [], palette: [] };
let pinMarker = null;
let userMarker = null;
let tip;

// ---------- 표준 지도 팔레트 (iOS 지도 느낌의 라이트 / 다크) ----------
const LIGHT = {
  background: { 'background-color': '#f3f1ec' },
  park: { 'fill-color': '#dbeacf' },
  water: { 'fill-color': '#b3d6f0' },
  landuse_residential: { 'fill-color': '#efece6' },
  landcover_wood: { 'fill-color': '#d2e3c6' },
  waterway: { 'line-color': '#a5cdea' },
  building: { 'fill-color': '#e8e4dc', 'fill-outline-color': '#d8d3c8' },
  highway_motorway_casing: { 'line-color': '#e3bf6e' },
  highway_motorway_bridge_casing: { 'line-color': '#e3bf6e' },
  highway_motorway_inner: { 'line-color': '#fbe3a3' },
  highway_motorway_bridge_inner: { 'line-color': '#fbe3a3' },
};
const HALO = 'rgba(21,23,27,0.85)';
const DARK = {
  background: { 'background-color': '#15171b' },
  park: { 'fill-color': '#1b2a20' },
  water: { 'fill-color': '#0e2233' },
  landcover_ice_shelf: { 'fill-color': '#22252a' },
  landcover_glacier: { 'fill-color': '#22252a' },
  landuse_residential: { 'fill-color': '#181a1f' },
  landcover_wood: { 'fill-color': '#19261c' },
  waterway: { 'line-color': '#12324a' },
  building: { 'fill-color': '#22252b', 'fill-outline-color': '#2b2e35' },
  tunnel_motorway_casing: { 'line-color': '#2d3037' },
  tunnel_motorway_inner: { 'line-color': '#24272c' },
  'aeroway-taxiway': { 'line-color': '#2a2d33' },
  'aeroway-runway-casing': { 'line-color': '#2a2d33' },
  'aeroway-area': { 'fill-color': '#23262b' },
  'aeroway-runway': { 'line-color': '#2f3238' },
  road_area_pier: { 'fill-color': '#15171b' },
  road_pier: { 'line-color': '#15171b' },
  highway_path: { 'line-color': '#2d3037' },
  highway_minor: { 'line-color': '#2b2e35' },
  highway_major_casing: { 'line-color': '#34373f' },
  highway_major_inner: { 'line-color': '#3b3f47' },
  highway_major_subtle: { 'line-color': '#30333a' },
  highway_motorway_casing: { 'line-color': '#4a3f25' },
  highway_motorway_inner: { 'line-color': '#6a5830' },
  highway_motorway_subtle: { 'line-color': '#3b3526' },
  highway_motorway_bridge_casing: { 'line-color': '#4a3f25' },
  highway_motorway_bridge_inner: { 'line-color': '#6a5830' },
  railway_transit: { 'line-color': '#30333a' },
  railway_transit_dashline: { 'line-color': '#1d1f24' },
  railway_service: { 'line-color': '#30333a' },
  railway_service_dashline: { 'line-color': '#1d1f24' },
  railway: { 'line-color': '#30333a' },
  railway_dashline: { 'line-color': '#1d1f24' },
  boundary_3: { 'line-color': '#4b4f58' },
  boundary_2: { 'line-color': '#4b4f58' },
  boundary_disputed: { 'line-color': '#4b4f58' },
  waterway_line_label: { 'text-color': '#6f7680', 'text-halo-color': HALO },
  water_name_point_label: { 'text-color': '#5f88c4', 'text-halo-color': HALO },
  water_name_line_label: { 'text-color': '#5f88c4', 'text-halo-color': HALO },
  'highway-name-path': { 'text-color': '#8b8f97', 'text-halo-color': '#15171b' },
  'highway-name-minor': { 'text-color': '#9a9ea6', 'text-halo-color': '#15171b' },
  'highway-name-major': { 'text-color': '#9a9ea6', 'text-halo-color': '#15171b' },
  airport: { 'text-color': '#9a9ea6', 'text-halo-color': '#15171b' },
  label_other: { 'text-color': '#b8bac0', 'text-halo-color': HALO },
  label_village: { 'text-color': '#e5e5ea', 'text-halo-color': HALO },
  label_town: { 'text-color': '#e5e5ea', 'text-halo-color': HALO },
  label_state: { 'text-color': '#a1a1a8', 'text-halo-color': HALO },
  label_city: { 'text-color': '#f2f2f7', 'text-halo-color': HALO },
  label_city_capital: { 'text-color': '#f2f2f7', 'text-halo-color': HALO },
  label_country_3: { 'text-color': '#f2f2f7', 'text-halo-color': HALO },
  label_country_2: { 'text-color': '#f2f2f7', 'text-halo-color': HALO },
  label_country_1: { 'text-color': '#f2f2f7', 'text-halo-color': HALO },
};

let baseRaw = null;

// 상세 팝업용 미니 지도 (조작 불가, 같은 스타일/팔레트)
function createMiniMap(container, lon, lat) {
  let style;
  if (baseRaw) {
    const layers = JSON.parse(JSON.stringify(baseRaw.layers));
    for (const l of layers) {
      if (l.layout && JSON.stringify(l.layout['text-field'] || '').includes('name:latin')) l.layout['text-field'] = KO_NAME;
      l.paint ||= {};
      Object.assign(l.paint, LIGHT[l.id] || {});
      if (state.dark && DARK[l.id]) Object.assign(l.paint, DARK[l.id]);
    }
    style = { version: 8, sprite: baseRaw.sprite, glyphs: baseRaw.glyphs, sources: baseRaw.sources, layers };
  } else {
    style = {
      version: 8,
      sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19 } },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    };
  }
  return new maplibregl.Map({
    container,
    style,
    center: [lon, lat],
    zoom: 16.8,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
  });
}

async function loadBaseStyle() {
  try {
    const r = await fetch(BASE_STYLE_URL);
    if (!r.ok) throw new Error(r.status);
    return (baseRaw = await r.json());
  } catch (e) {
    console.warn('기본 지도 스타일을 불러오지 못해 OSM 타일로 대체합니다.', e);
    return null;
  }
}

const KO_NAME = ['coalesce', ['get', 'name:ko'], ['get', 'name']];

function buildStyle(base, dark) {
  const catColors = D.cats.flatMap((c, i) => [i, c.color]);
  const baseLayers = base ? JSON.parse(JSON.stringify(base.layers)) : [];
  state.vec = baseLayers.map((l) => l.id);
  state.palette = [];
  const showVec = state.basemap === 'std' && !!base;
  for (const l of baseLayers) {
    // 한글 지명 우선 표기
    if (l.layout && JSON.stringify(l.layout['text-field'] || '').includes('name:latin')) l.layout['text-field'] = KO_NAME;
    l.paint ||= {};
    const lt = LIGHT[l.id] || {};
    const dk = DARK[l.id];
    if (dk) for (const prop of Object.keys(dk)) state.palette.push([l.id, prop, lt[prop] ?? l.paint[prop], dk[prop]]);
    Object.assign(l.paint, lt);
    if (dark && dk) Object.assign(l.paint, dk);
    l.layout = { ...(l.layout || {}), visibility: showVec ? 'visible' : 'none' };
  }

  return {
    version: 8,
    ...(base?.sprite ? { sprite: base.sprite } : {}),
    glyphs: base?.glyphs || FALLBACK_GLYPHS,
    sources: {
      ...(base?.sources || {}),
      osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19 },
      sat: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
      },
      shops: { type: 'geojson', data: EMPTY, cluster: true, clusterMaxZoom: 16, clusterRadius: 55 },
      radius: { type: 'geojson', data: EMPTY },
    },
    layers: [
      ...baseLayers,
      { id: 'bm-osm', type: 'raster', source: 'osm', layout: { visibility: state.basemap === 'osm' ? 'visible' : 'none' } },
      { id: 'bm-sat', type: 'raster', source: 'sat', layout: { visibility: state.basemap === 'sat' ? 'visible' : 'none' } },
      {
        id: 'heat',
        type: 'heatmap',
        source: 'shops',
        maxzoom: 18,
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['coalesce', ['get', 'point_count'], 1], 1, 0.35, 30, 1.2, 500, 3],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 1.4, 18, 2.6],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 12, 12, 22, 15, 34, 18, 52],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0.9, 18, 0.55],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0,122,255,0)',
            0.15, 'rgba(90,200,250,0.55)',
            0.35, 'rgba(52,199,89,0.72)',
            0.55, 'rgba(255,204,0,0.82)',
            0.78, 'rgba(255,149,0,0.9)',
            1, 'rgba(255,59,48,0.95)',
          ],
        },
      },
      {
        id: 'clusters',
        type: 'circle',
        source: 'shops',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#007AFF', 100, '#5856D6', 1000, '#AF52DE', 5000, '#FF2D55'],
          'circle-opacity': 0.92,
          'circle-radius': ['step', ['get', 'point_count'], 15, 100, 19, 1000, 25, 5000, 32],
          'circle-stroke-width': 3,
          'circle-stroke-color': 'rgba(255,255,255,0.85)',
        },
      },
      {
        id: 'cluster-count',
        type: 'symbol',
        source: 'shops',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12.5,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#ffffff' },
      },
      {
        id: 'points',
        type: 'circle',
        source: 'shops',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['match', ['get', 'c'], ...catColors, '#8E8E93'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2.6, 13, 4.2, 15, 6, 17, 8.5, 19, 11],
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 15, 1.6],
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.96,
        },
      },
      { id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#007AFF', 'fill-opacity': 0.08 } },
      { id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#007AFF', 'line-width': 2, 'line-dasharray': [2, 2] } },
    ],
  };
}

async function initMap(container, initial = {}) {
  state.dark = !!initial.dark;
  state.basemap = initial.basemap || 'std';
  const base = await loadBaseStyle();
  state.hasBase = !!base;
  if (!base) state.basemap = 'osm';
  return new Promise((resolve) => {
    map = new maplibregl.Map({
      container,
      style: buildStyle(base, state.dark),
      center: initial.center || HOME.center,
      zoom: initial.zoom ?? HOME.zoom,
      minZoom: 8.5,
      maxZoom: 19.5,
      maxBounds: [
        [128.2, 34.6],
        [129.8, 35.8],
      ],
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      fadeDuration: 150,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'ios-tip', maxWidth: '260px' });

    const applyPadding = () => {
      const desktop = matchMedia('(min-width: 768px)').matches;
      map.setPadding({ top: 0, right: 0, bottom: 0, left: desktop ? 422 : 0 });
    };
    window.addEventListener('resize', applyPadding);

    map.on('error', (e) => console.warn('[map error]', e.error?.message || e.error));
    map.on('load', () => {
      const c = map.getCenter();
      const z = map.getZoom();
      applyPadding();
      map.jumpTo({ center: c, zoom: z });
      state.ready = true;
      applyBasemap();
      bindEvents();
      resolve(map);
    });
    map.on('moveend', () => bus.emit('move'));
  });
}

function nearestFeature(point, layers, pad) {
  const fs = map.queryRenderedFeatures(
    [
      [point.x - pad, point.y - pad],
      [point.x + pad, point.y + pad],
    ],
    { layers }
  );
  if (!fs.length) return null;
  let best = null;
  let bd = Infinity;
  for (const f of fs) {
    const p = map.project(f.geometry.coordinates);
    const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

function bindEvents() {
  map.on('click', async (e) => {
    const f = nearestFeature(e.point, ['clusters', 'points'], 8);
    if (!f) return bus.emit('map-empty');
    if (f.properties.cluster) {
      const z = await map.getSource('shops').getClusterExpansionZoom(f.properties.cluster_id);
      map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z + 0.4, 19), duration: 600 });
    } else {
      bus.emit('shop-click', +f.properties.i);
    }
  });

  if (matchMedia('(hover: hover)').matches) {
    let raf = 0;
    map.on('mousemove', (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const f = nearestFeature(e.point, ['clusters', 'points'], 7);
        map.getCanvas().style.cursor = f ? 'pointer' : '';
        if (f && !f.properties.cluster) {
          const i = +f.properties.i;
          const c = D.cats[D.cat[i]];
          tip
            .setLngLat(f.geometry.coordinates)
            .setHTML(`<b>${esc(D.name[i])}</b><span><i style="background:${c.color}"></i>${esc(D.subs[D.sub[i]].name)}</span>`)
            .addTo(map);
        } else tip.remove();
      });
    });
    map.on('mouseout', () => tip.remove());
    map.on('movestart', () => tip.remove());
  }
}

// ---------- 데이터 ----------
let allFC = null;
function buildFC(F) {
  const feats = new Array(F.length);
  for (let k = 0; k < F.length; k++) {
    const i = F[k];
    feats[k] = { type: 'Feature', geometry: { type: 'Point', coordinates: [D.lon[i], D.lat[i]] }, properties: { i, c: D.cat[i] } };
  }
  return { type: 'FeatureCollection', features: feats };
}

function setShops(F, isAll) {
  const fc = isAll ? (allFC ||= buildFC(F)) : buildFC(F);
  map.getSource('shops').setData(fc);
}

// ---------- 표시 옵션 ----------
function vis(id, on) {
  map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
}

function applyBasemap() {
  const b = state.basemap;
  const showVec = b === 'std' && state.hasBase;
  state.vec.forEach((id) => vis(id, showVec));
  vis('bm-osm', b === 'osm');
  vis('bm-sat', b === 'sat');
  applyPalette();
  bus.emit('credit', BASEMAPS[b].credit);
}

function applyPalette() {
  for (const [id, prop, light, dark] of state.palette) map.setPaintProperty(id, prop, state.dark ? dark : light);
}

function setBasemap(kind) {
  if (kind === 'std' && !state.hasBase) kind = 'osm';
  state.basemap = kind;
  if (state.ready) applyBasemap();
}

function setDark(dark) {
  if (state.dark === dark) return;
  state.dark = dark;
  if (state.ready) applyPalette();
}

function setHeat(on) {
  state.heat = on;
  vis('heat', on);
  vis('clusters', !on);
  vis('cluster-count', !on);
  // 히트맵 상태에서는 확대(15+)했을 때만 개별 점을 보여준다
  map.setLayerZoomRange('points', on ? 15 : 0, 24);
}

// ---------- 선택 핀 / 내 위치 ----------
function setSelected(i) {
  if (pinMarker) {
    pinMarker.remove();
    pinMarker = null;
  }
  if (i == null) return;
  const c = D.cats[D.cat[i]];
  const el = document.createElement('div');
  el.className = 'pin';
  el.style.setProperty('--c', c.color);
  el.innerHTML = `<div class="pin-body"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath(c.icon)}</svg></div><div class="pin-shadow"></div>`;
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    bus.emit('shop-click', i);
  });
  pinMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([D.lon[i], D.lat[i]]).addTo(map);
}

function showUser(lon, lat) {
  if (!userMarker) {
    const el = document.createElement('div');
    el.className = 'user-dot';
    el.innerHTML = '<span></span>';
    userMarker = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
  } else userMarker.setLngLat([lon, lat]);
}

// ---------- 반경 원 ----------
function setRadius(c) {
  const src = map.getSource('radius');
  if (!c) return src.setData(EMPTY);
  const pts = [];
  const kx = 111320 * Math.cos((c.lat * Math.PI) / 180);
  for (let a = 0; a <= 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    pts.push([c.lon + (Math.cos(t) * c.r) / kx, c.lat + (Math.sin(t) * c.r) / 110540]);
  }
  src.setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} });
}

// ---------- 카메라 ----------
function flyTo(lon, lat, zoom, opts = {}) {
  map.flyTo({ center: [lon, lat], zoom, speed: 1.6, curve: 1.4, essential: true, ...opts });
}

function fitBounds(b, opts = {}) {
  map.fitBounds(
    [
      [b[0], b[1]],
      [b[2], b[3]],
    ],
    { padding: 60, duration: 800, ...opts }
  );
}

function fitRadius(c, opts = {}) {
  const kx = 111320 * Math.cos((c.lat * Math.PI) / 180);
  const dx = c.r / kx;
  const dy = c.r / 110540;
  fitBounds([c.lon - dx, c.lat - dy, c.lon + dx, c.lat + dy], opts);
}

const zoomIn = () => map.zoomIn({ duration: 300 });
const zoomOut = () => map.zoomOut({ duration: 300 });
return { get map() { return map; }, BASEMAPS, createMiniMap, initMap, setShops, setBasemap, setDark, setHeat, setSelected, showUser, setRadius, flyTo, fitBounds, fitRadius, zoomIn, zoomOut, HOME };
})();

// ===== modal.js =====
const __m_modal = (() => {
const { icon } = __m_icons;

const root = document.getElementById('overlay-root');
const stack = [];
const isMobile = () => matchMedia('(max-width: 767px)').matches;

/**
 * iOS 스타일 모달. 데스크톱: 중앙 카드, 모바일: 바텀시트(아래로 스와이프해 닫기)
 * @returns {{el, scroll, close, overlay}}
 */
function openModal({ className = '', onClose } = {}) {
  const prevFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const el = document.createElement('div');
  el.className = 'modal ' + className;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="m-grab" aria-hidden="true"><span></span></div>
    <button class="m-close" type="button" aria-label="닫기">${icon('close')}</button>
    <div class="m-scroll"></div>`;
  const scroll = el.querySelector('.m-scroll');
  overlay.appendChild(el);
  root.appendChild(overlay);
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('show')));

  let closed = false;
  const api = { el, scroll, overlay, close };
  function close() {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(api);
    if (i >= 0) stack.splice(i, 1);
    overlay.classList.remove('show');
    el.style.transform = '';
    setTimeout(() => overlay.remove(), 320);
    try {
      prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true });
    } catch {
      /* noop */
    }
    onClose && onClose();
  }

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  el.querySelector('.m-close').addEventListener('click', close);
  el.querySelector('.m-close').focus({ preventScroll: true });

  // 모바일: 스크롤 최상단에서 아래로 당기면 닫기
  let y0 = null;
  let dy = 0;
  let drag = false;
  const start = (e) => {
    if (!isMobile()) return;
    y0 = scroll.scrollTop <= 0 || e.target.closest('.m-grab') ? e.touches[0].clientY : null;
    drag = false;
    dy = 0;
  };
  const move = (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 8 && scroll.scrollTop <= 0) {
      drag = true;
      e.preventDefault();
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
    }
  };
  const end = () => {
    if (drag) {
      el.style.transition = '';
      if (dy > 110) close();
      else el.style.transform = '';
    }
    y0 = null;
    drag = false;
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);

  stack.push(api);
  return api;
}

const hasModal = () => stack.length > 0;

document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape' && stack.length) {
      e.stopImmediatePropagation();
      stack[stack.length - 1].close();
    }
  },
  true
);
return { openModal, hasModal };
})();

// ===== rows.js =====
const __m_rows = (() => {
const { D } = __m_data;
const { icon } = __m_icons;
const { esc, fmtDist, highlight } = __m_util;

function badge(cat, cls = '') {
  const c = D.cats[cat];
  return `<span class="badge ${cls}" style="--c:${c.color}">${icon(c.icon)}</span>`;
}

// 상가 리스트 한 줄 (버튼). data-i = 전체 index
function rowHTML(i, { dist, q } = {}) {
  const br = D.branch.get(i);
  const sub = D.subs[D.sub[i]].name;
  return `<button class="row" type="button" data-i="${i}">
    ${badge(D.cat[i])}
    <span class="row-main">
      <b>${highlight(D.name[i], q)}${br ? ` <i>${highlight(br, q)}</i>` : ''}</b>
      <span class="row-sub">${esc(sub)} · ${highlight(D.addr[i], q)}</span>
    </span>
    ${dist != null ? `<span class="row-aux">${fmtDist(dist)}</span>` : ''}
  </button>`;
}
return { badge, rowHTML };
})();

// ===== state.js =====
const __m_state = (() => {
const { store, bus } = __m_util;

// 앱 전역 상태 (즐겨찾기/최근은 localStorage 유지)
const S = {
  favs: new Set(store.get('busan-fav', [])),
  recents: store.get('busan-recent', []),
  sel: null, // 선택된 상가 index
  radius: null, // { lon, lat, r, label }
  tab: 'view', // view | fav | recent
  sort: 'dist', // dist | name
  dark: false,
};

const isFav = (id) => S.favs.has(id);

function toggleFav(id) {
  if (S.favs.has(id)) S.favs.delete(id);
  else S.favs.add(id);
  store.set('busan-fav', [...S.favs]);
  bus.emit('favs-changed');
  return S.favs.has(id);
}

function pushRecent(id) {
  S.recents = [id, ...S.recents.filter((x) => x !== id)].slice(0, 30);
  store.set('busan-recent', S.recents);
  bus.emit('recents-changed');
}

function clearRecents() {
  S.recents = [];
  store.set('busan-recent', []);
  bus.emit('recents-changed');
}
return { S, isFav, toggleFav, pushRecent, clearRecents };
})();

// ===== ui.js =====
const __m_ui = (() => {
const { D, filter, applyFilter, queryBounds, queryRadius, search, indexOfId, metersFrom } = __m_data;
const M = __m_map;
const { openModal } = __m_modal;
const { icon } = __m_icons;
const { badge, rowHTML } = __m_rows;
const { S, clearRecents } = __m_state;
const { $, $$, bus, debounce, esc, fmt, fmtDist, highlight, toast, store } = __m_util;

const PAGE = 60;
const LIST_CAP = 30000; // 화면 내 상가가 이 수를 넘으면 목록 대신 통계만
const collator = new Intl.Collator('ko');
const isMobile = () => matchMedia('(max-width: 767px)').matches;

let items = null; // 현재 목록(전체 index 배열) 또는 null(너무 많음)
let itemDist = null; // items와 병렬인 거리(m)
let shown = PAGE;
let viewTotal = 0;
let viewCats = null;
let catSubs = [];

function initUI() {
  catSubs = D.cats.map(() => []);
  D.subs.forEach((s, k) => catSubs[D.subCat[k]].push(k));

  $('#sub').textContent = `부산광역시 · ${fmt(D.n)}개 상가`;
  renderChips();
  renderTabs();
  bindSearch();
  bindList();
  bindControls();
  initSheet();

  bus.on('move', debounce(refreshList, 140));
  bus.on('filter-changed', () => {
    renderChips();
    refreshList();
  });
  bus.on('favs-changed', () => {
    renderTabs();
    if (S.tab === 'fav') refreshList();
  });
  bus.on('recents-changed', () => {
    if (S.tab === 'recent') refreshList();
  });
  bus.on('radius-changed', () => {
    S.tab = 'view';
    renderTabs();
    refreshList();
  });
  bus.on('credit', (t) => ($('#credit').textContent = t + ' · ' + D.meta.source));
  refreshList();
}

// =====================================================================
// 업종 칩 + 필터 버튼
// =====================================================================
function catState(c) {
  const subs = catSubs[c];
  let n = 0;
  subs.forEach((s) => filter.subs.has(s) && n++);
  return n === 0 ? 'none' : n === subs.length ? 'all' : 'some';
}

function activeFilterCount() {
  let n = filter.dists.size;
  D.cats.forEach((_, c) => catState(c) !== 'none' && n++);
  return n;
}

function renderChips() {
  const n = activeFilterCount();
  $('#chips').innerHTML =
    `<button class="chip filter-btn${n ? ' on' : ''}" type="button" data-chip="filter" aria-label="필터 열기">${icon('sliders')}필터${n ? `<b>${n}</b>` : ''}</button>` +
    D.cats
      .map((c, k) => {
        const st = catState(k);
        return `<button class="chip cat ${st}" type="button" data-chip="${k}" style="--c:${c.color}" aria-pressed="${st === 'all'}">${icon(c.icon)}${esc(c.name)}</button>`;
      })
      .join('');
}

function toggleCat(c) {
  if (catState(c) === 'all') catSubs[c].forEach((s) => filter.subs.delete(s));
  else catSubs[c].forEach((s) => filter.subs.add(s));
  commitFilter();
}

const commitFilterNow = () => {
  applyFilter();
  bus.emit('filter-changed');
};
const commitFilterDebounced = debounce(commitFilterNow, 120);
function commitFilter() {
  applyFilter();
  renderChips();
  commitFilterDebounced();
}

document.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-chip]');
  if (!chip) return;
  if (chip.dataset.chip === 'filter') openFilter();
  else toggleCat(+chip.dataset.chip);
});

// =====================================================================
// 탭 / 요약 / 목록
// =====================================================================
function renderTabs() {
  const tabs = [
    ['view', 'list', '주변'],
    ['fav', 'star', `즐겨찾기${S.favs.size ? ` ${S.favs.size}` : ''}`],
    ['recent', 'clock', '최근'],
  ];
  $('#tabs').innerHTML = tabs
    .map(([k, ic, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${S.tab === k}" class="${S.tab === k ? 'on' : ''}">${icon(ic)}${t}</button>`)
    .join('');
}

function bindList() {
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    S.tab = b.dataset.tab;
    renderTabs();
    refreshList();
  });
  $('#list').addEventListener('click', (e) => {
    const r = e.target.closest('.row[data-i]');
    if (r) bus.emit('select-shop', +r.dataset.i);
  });
  $('#more').addEventListener('click', () => {
    shown += PAGE * 2;
    renderList();
  });
  $('#summary').addEventListener('click', (e) => {
    const s = e.target.closest('[data-sort]');
    if (s) {
      S.sort = s.dataset.sort;
      store.set('busan-sort', S.sort);
      refreshList();
    }
    if (e.target.closest('[data-csv]')) exportCSV();
    const lg = e.target.closest('[data-cat]');
    if (lg) toggleCat(+lg.dataset.cat);
  });
  $('#radius-banner').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b || !S.radius) return;
    if (b.dataset.r === 'clear') return bus.emit('radius-clear');
    bus.emit('radius-set', { ...S.radius, r: +b.dataset.r });
  });
  S.sort = store.get('busan-sort', 'dist');
}

function refreshList() {
  const list = $('#list');
  const summary = $('#summary');
  const banner = $('#radius-banner');
  if (!M.map) return;
  const c = M.map.getCenter();
  shown = PAGE;

  if (S.tab === 'fav' || S.tab === 'recent') {
    summary.hidden = true;
    banner.hidden = true;
    const ids = S.tab === 'fav' ? [...S.favs] : S.recents;
    items = ids.map((id) => indexOfId(id)).filter((i) => i != null);
    itemDist = items.map((i) => metersFrom(i, c.lng, c.lat));
    const head =
      S.tab === 'recent' && items.length ? `<div class="list-head"><span>최근 본 상가 ${items.length}곳</span><button type="button" data-clear-recent>기록 지우기</button></div>` : '';
    $('#list-head').innerHTML = head;
    renderList(
      S.tab === 'fav'
        ? '<div class="empty">' + icon('star') + '<b>즐겨찾기가 비어 있어요</b><span>상가 상세 화면에서 ★를 눌러 저장하세요.</span></div>'
        : '<div class="empty">' + icon('clock') + '<b>최근 본 상가가 없어요</b><span>지도에서 상가를 눌러보세요.</span></div>'
    );
    return;
  }

  $('#list-head').innerHTML = '';
  summary.hidden = false;

  if (S.radius) {
    const r = queryRadius(S.radius.lon, S.radius.lat, S.radius.r, true);
    items = r.idx;
    itemDist = r.dist;
    viewTotal = r.idx.length;
    viewCats = new Uint32Array(D.cats.length);
    r.idx.forEach((i) => viewCats[D.cat[i]]++);
    if (S.sort === 'name') sortByName();
  } else {
    const b = M.map.getBounds();
    const q = queryBounds(b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), LIST_CAP);
    viewTotal = q.total;
    viewCats = q.cats;
    if (q.idx) {
      items = Array.from(q.idx);
      itemDist = items.map((i) => metersFrom(i, c.lng, c.lat));
      if (S.sort === 'name') sortByName();
      else {
        const ord = items.map((_, k) => k).sort((a, b2) => itemDist[a] - itemDist[b2]);
        items = ord.map((k) => items[k]);
        itemDist = ord.map((k) => itemDist[k]);
      }
    } else {
      items = null;
      itemDist = null;
    }
  }

  renderSummary();
  renderRadiusBanner();
  renderList(
    items === null
      ? `<div class="empty">${icon('map')}<b>지도를 확대해 주세요</b><span>화면에 상가가 너무 많아 목록을 표시하지 않아요.<br>업종 칩이나 필터로 좁혀도 됩니다.</span></div>`
      : '<div class="empty">' + icon('search') + '<b>이 화면에는 상가가 없어요</b><span>지도를 움직이거나 필터를 조정해 보세요.</span></div>'
  );
}

function sortByName() {
  const ord = items.map((_, k) => k).sort((a, b) => collator.compare(D.name[items[a]], D.name[items[b]]));
  items = ord.map((k) => items[k]);
  itemDist = ord.map((k) => itemDist[k]);
}

function renderSummary() {
  const total = viewTotal;
  const cats = D.cats.map((c, k) => [k, viewCats[k]]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const scope = S.radius ? `${esc(S.radius.label)} 반경 ${fmtDist(S.radius.r)}` : '현재 지도 화면';
  $('#summary').innerHTML = `
    <div class="sum-top">
      <div class="sum-count"><b>${fmt(total)}</b><span>개 상가</span><small>${scope}${D.filtered ? ' · 필터 적용' : ''}</small></div>
      <div class="sum-tools">
        <div class="seg mini" role="group" aria-label="정렬">
          <button type="button" data-sort="dist" class="${S.sort === 'dist' ? 'on' : ''}">거리순</button>
          <button type="button" data-sort="name" class="${S.sort === 'name' ? 'on' : ''}">이름순</button>
        </div>
        <button type="button" class="icon-btn small" data-csv aria-label="CSV로 내보내기" title="CSV로 내보내기">${icon('download')}</button>
      </div>
    </div>
    ${
      total
        ? `<div class="dist-bar">${cats.map(([k, n]) => `<span style="flex:${n};background:${D.cats[k].color}"></span>`).join('')}</div>
    <div class="dist-legend">${cats
      .slice(0, 5)
      .map(([k, n]) => `<button type="button" data-cat="${k}"><i style="background:${D.cats[k].color}"></i>${esc(D.cats[k].name)}<b>${fmt(n)}</b></button>`)
      .join('')}</div>`
        : ''
    }`;
}

function renderRadiusBanner() {
  const b = $('#radius-banner');
  if (!S.radius) {
    b.hidden = true;
    return;
  }
  b.hidden = false;
  b.innerHTML = `<div class="rb-top"><span class="rb-ic">${icon('radius')}</span><div><b>${esc(S.radius.label)} 주변 검색</b><small>반경 ${fmtDist(S.radius.r)}</small></div><button type="button" class="link" data-r="clear">해제</button></div>
    <div class="seg mini full" role="group" aria-label="반경">${[200, 500, 1000, 2000]
      .map((r) => `<button type="button" data-r="${r}" class="${S.radius.r === r ? 'on' : ''}">${fmtDist(r)}</button>`)
      .join('')}</div>`;
}

function renderList(emptyHTML = '') {
  const list = $('#list');
  const more = $('#more');
  if (!items || !items.length) {
    list.innerHTML = emptyHTML;
    more.hidden = true;
    return;
  }
  const end = Math.min(shown, items.length);
  let html = '';
  for (let k = 0; k < end; k++) html += `<li>${rowHTML(items[k], { dist: itemDist ? itemDist[k] : null })}</li>`;
  list.innerHTML = html;
  more.hidden = end >= items.length;
  more.textContent = `더 보기 (${fmt(items.length - end)}개 남음)`;
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-clear-recent]')) {
    clearRecents();
    toast('최근 본 기록을 지웠어요');
  }
});

function exportCSV() {
  if (!items) return toast('지도를 확대한 뒤 내보낼 수 있어요');
  if (!items.length) return toast('내보낼 상가가 없어요');
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = ['상호명,지점명,대분류,중분류,소분류,도로명주소,시군구,경도,위도,상가업소번호'];
  for (const i of items) {
    const sub = D.subs[D.sub[i]];
    lines.push(
      [
        D.name[i],
        D.branch.get(i) || '',
        D.cats[D.cat[i]].name,
        D.mids[sub.mid].name,
        sub.name,
        '부산광역시 ' + D.addr[i],
        D.dists[D.dist[i]].name,
        D.lon[i],
        D.lat[i],
        D.id[i],
      ]
        .map(q)
        .join(',')
    );
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `busan_shops_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`${fmt(items.length)}개 상가를 내보냈어요`);
}

// =====================================================================
// 검색
// =====================================================================
let results = [];
let active = -1;

function bindSearch() {
  const q = $('#q');
  const clear = $('#q-clear');
  const run = debounce(() => {
    const v = q.value.trim();
    showSearch(v);
  }, 90);
  q.addEventListener('input', () => {
    clear.hidden = !q.value;
    run();
  });
  q.addEventListener('focus', () => {
    if (isMobile()) setDetent('full');
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const el = $$('#search-results [data-i], #search-results [data-dist]');
      const t = el[active >= 0 ? active : 0];
      if (t) t.click();
      q.blur();
    } else if (e.key === 'Escape') {
      resetSearch();
      q.blur();
    }
  });
  clear.addEventListener('click', () => {
    resetSearch();
    q.focus();
  });
  $('#search-results').addEventListener('click', (e) => {
    const d = e.target.closest('[data-dist]');
    if (d) {
      const dist = D.dists[+d.dataset.dist];
      resetSearch();
      bus.emit('goto-dist', +d.dataset.dist);
      return;
    }
    const r = e.target.closest('[data-i]');
    if (r) {
      const i = +r.dataset.i;
      resetSearch();
      bus.emit('select-shop', i);
    }
  });
}

function moveActive(dir) {
  const el = $$('#search-results [data-i], #search-results [data-dist]');
  if (!el.length) return;
  active = (active + dir + el.length) % el.length;
  el.forEach((x, k) => x.classList.toggle('active', k === active));
  el[active].scrollIntoView({ block: 'nearest' });
}

function showSearch(v) {
  const view = $('#view-search');
  const main = $('#view-list');
  if (!v) {
    view.hidden = true;
    main.hidden = false;
    return;
  }
  results = search(v, 40);
  active = -1;
  const distHits = D.dists.map((d, k) => [d, k]).filter(([d]) => d.name.includes(v)).slice(0, 3);
  let html = distHits
    .map(
      ([d, k]) =>
        `<li><button class="row" type="button" data-dist="${k}"><span class="badge" style="--c:#007AFF">${icon('map')}</span><span class="row-main"><b>${highlight(d.name, v)}</b><span class="row-sub">지역으로 이동 · 상가 ${fmt(d.count)}개</span></span>${icon('chevR', 'row-chev')}</button></li>`
    )
    .join('');
  html += results.map((i) => `<li>${rowHTML(i, { q: v })}</li>`).join('');
  if (!results.length && !distHits.length)
    html = `<li class="empty">${icon('search')}<b>‘${esc(v)}’ 검색 결과가 없어요</b><span>상호명, 도로명주소, 초성(예: ㅅㅂㅋㅍ)으로 검색해 보세요.</span></li>`;
  $('#search-results').innerHTML = html;
  $('#search-head').textContent = results.length ? `검색 결과${results.length >= 40 ? ' (상위 40개)' : ` ${results.length}개`}` : '';
  view.hidden = false;
  main.hidden = true;
}

function resetSearch() {
  const q = $('#q');
  q.value = '';
  $('#q-clear').hidden = true;
  showSearch('');
  if (isMobile()) setDetent('peek');
}

// =====================================================================
// 지도 컨트롤 / 레이어 팝오버 / 테마
// =====================================================================
function bindControls() {
  $('#btn-zoom-in').addEventListener('click', M.zoomIn);
  $('#btn-zoom-out').addEventListener('click', M.zoomOut);
  $('#btn-locate').addEventListener('click', () => bus.emit('locate'));
  const pop = $('#layer-pop');
  $('#btn-layers').addEventListener('click', (e) => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
    $('#btn-layers').classList.toggle('on', !pop.hidden);
  });
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !e.target.closest('#layer-pop')) {
      pop.hidden = true;
      $('#btn-layers').classList.remove('on');
    }
  });
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    const seg = b.closest('[data-seg]').dataset.seg;
    if (seg === 'basemap') bus.emit('set-basemap', b.dataset.v);
    if (seg === 'theme') bus.emit('set-theme', b.dataset.v);
    syncPop();
  });
  $('#heat').addEventListener('change', (e) => bus.emit('set-heat', e.target.checked));
}

function syncPop(state) {
  if (state) syncPop.state = state;
  const st = syncPop.state || {};
  $$('#layer-pop [data-seg="basemap"] [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === st.basemap));
  $$('#layer-pop [data-seg="theme"] [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === st.theme));
  $('#heat').checked = !!st.heat;
}

// =====================================================================
// 모바일 바텀시트 (peek / half / full)
// =====================================================================
const PEEK = 158;
let detent = 'peek';
let dragging = false;

function sheetH() {
  return $('#sidebar').offsetHeight;
}
function visFor(d) {
  return d === 'peek' ? PEEK : d === 'half' ? Math.round(window.innerHeight * 0.52) : sheetH();
}
function setDetent(d) {
  detent = d;
  $('#sidebar').dataset.detent = d;
  layoutSheet();
}
function layoutSheet() {
  const sb = $('#sidebar');
  if (!isMobile()) return sb.style.removeProperty('--ty');
  sb.style.setProperty('--ty', sheetH() - visFor(detent) + 'px');
}

function initSheet() {
  const sb = $('#sidebar');
  const grab = $('#grab');
  layoutSheet();
  window.addEventListener('resize', layoutSheet);
  let startY = 0;
  let startTy = 0;
  let moved = 0;
  let lastY = 0;
  let lastT = 0;
  let vel = 0;
  grab.addEventListener('pointerdown', (e) => {
    if (!isMobile()) return;
    dragging = true;
    startY = lastY = e.clientY;
    lastT = performance.now();
    startTy = sheetH() - visFor(detent);
    moved = 0;
    vel = 0;
    sb.style.transition = 'none';
    grab.setPointerCapture(e.pointerId);
  });
  grab.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    moved = Math.max(moved, Math.abs(dy));
    const now = performance.now();
    vel = (e.clientY - lastY) / Math.max(1, now - lastT);
    lastY = e.clientY;
    lastT = now;
    const ty = Math.min(sheetH() - PEEK, Math.max(0, startTy + dy));
    sb.style.setProperty('--ty', ty + 'px');
  });
  const up = () => {
    if (!dragging) return;
    dragging = false;
    sb.style.transition = '';
    if (moved < 5) {
      setDetent(detent === 'peek' ? 'half' : detent === 'half' ? 'full' : 'peek');
      return;
    }
    const cur = sheetH() - parseFloat(sb.style.getPropertyValue('--ty') || '0');
    const cand = ['peek', 'half', 'full'].map((d) => [d, visFor(d)]);
    const target = cur + -vel * 220; // 관성 반영
    cand.sort((a, b) => Math.abs(a[1] - target) - Math.abs(b[1] - target));
    setDetent(cand[0][0]);
  };
  grab.addEventListener('pointerup', up);
  grab.addEventListener('pointercancel', up);
}

// =====================================================================
// 필터 시트 (모달)
// =====================================================================
const expanded = new Set();

function cbHTML(state) {
  return `<span class="cb ${state}">${state === 'all' ? icon('check') : state === 'some' ? icon('minus') : ''}</span>`;
}

function subState(list) {
  let n = 0;
  list.forEach((s) => filter.subs.has(s) && n++);
  return n === 0 ? 'none' : n === list.length ? 'all' : 'some';
}

function treeHTML() {
  const midSubs = D.mids.map(() => []);
  D.subs.forEach((s, k) => midSubs[s.mid].push(k));
  return D.cats
    .map((c, ci) => {
      const kc = 'c' + ci;
      const mids = D.mids.map((m, mi) => [m, mi]).filter(([m]) => m.cat === ci);
      const open = expanded.has(kc);
      return `<div class="tn">
        <div class="tr" data-t="c" data-k="${kc}">
          <button type="button" class="cbtn" data-cb aria-label="${esc(c.name)} 전체 선택">${cbHTML(catState(ci))}</button>
          <span class="tn-label">${badge(ci, 'sm')}${esc(c.name)}</span><span class="tn-count">${fmt(c.count)}</span>
          <span class="exp${open ? ' open' : ''}">${icon('chevR')}</span>
        </div>
        <div class="tn-children"${open ? '' : ' hidden'}>${mids
          .map(([m, mi]) => {
            const km = 'm' + mi;
            const mopen = expanded.has(km);
            return `<div class="tn"><div class="tr lvl1" data-t="m" data-k="${km}">
              <button type="button" class="cbtn" data-cb>${cbHTML(subState(midSubs[mi]))}</button>
              <span class="tn-label">${esc(m.name)}</span><span class="tn-count">${fmt(m.count)}</span>
              <span class="exp${mopen ? ' open' : ''}">${icon('chevR')}</span></div>
              <div class="tn-children"${mopen ? '' : ' hidden'}>${midSubs[mi]
                .map(
                  (s) =>
                    `<div class="tr lvl2" data-t="s" data-s="${s}"><button type="button" class="cbtn" data-cb>${cbHTML(filter.subs.has(s) ? 'all' : 'none')}</button><span class="tn-label">${esc(D.subs[s].name)}</span><span class="tn-count">${fmt(D.subs[s].count)}</span></div>`
                )
                .join('')}</div></div>`;
          })
          .join('')}</div></div>`;
    })
    .join('');
}

function openFilter() {
  const m = openModal({ className: 'filter' });
  const midSubs = D.mids.map(() => []);
  D.subs.forEach((s, k) => midSubs[s.mid].push(k));
  let rad = store.get('busan-rad', 500);

  m.scroll.innerHTML = `
    <div class="f-head"><h2>필터</h2><button type="button" class="link" data-f="reset">초기화</button></div>
    <section class="group"><h3>업종</h3><div class="card tree" id="tree"></div><p class="hint">선택하지 않으면 모든 업종을 보여줘요. 대분류를 누르면 하위 분류를 펼칠 수 있어요.</p></section>
    <section class="group"><h3>지역</h3><div class="pills" id="pills"></div></section>
    <section class="group"><h3>반경 검색</h3>
      <div class="card pad">
        <div class="seg full" id="f-rad">${[200, 500, 1000, 2000].map((r) => `<button type="button" data-r="${r}">${fmtDist(r)}</button>`).join('')}</div>
        <div class="btn-row">
          <button type="button" class="btn" data-f="center">${icon('pin')}지도 중심 기준</button>
          <button type="button" class="btn" data-f="me">${icon('locate')}내 위치 기준</button>
        </div>
      </div>
    </section>
    <div class="f-foot"><button type="button" class="primary" data-f="done"></button></div>`;

  const tree = m.scroll.querySelector('#tree');
  const pills = m.scroll.querySelector('#pills');
  const done = m.scroll.querySelector('[data-f="done"]');

  const paint = () => {
    tree.innerHTML = treeHTML();
    pills.innerHTML = D.dists
      .map((d, k) => `<button type="button" class="pill${filter.dists.has(k) ? ' on' : ''}" data-d="${k}">${esc(d.name)}<small>${fmt(d.count)}</small></button>`)
      .join('');
    done.textContent = `${fmt(D.F.length)}개 상가 보기`;
    $$('#f-rad [data-r]', m.scroll).forEach((b) => b.classList.toggle('on', +b.dataset.r === rad));
  };
  paint();

  const changed = () => {
    applyFilter();
    paint();
    renderChips();
    commitFilterDebounced();
  };

  m.scroll.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]');
    if (f) {
      const a = f.dataset.f;
      if (a === 'reset') {
        filter.subs.clear();
        filter.dists.clear();
        changed();
      } else if (a === 'done') m.close();
      else if (a === 'center' || a === 'me') {
        store.set('busan-rad', rad);
        m.close();
        bus.emit('radius-request', a, rad);
      }
      return;
    }
    const r = e.target.closest('#f-rad [data-r]');
    if (r) {
      rad = +r.dataset.r;
      paint();
      return;
    }
    const pill = e.target.closest('[data-d]');
    if (pill) {
      const k = +pill.dataset.d;
      filter.dists.has(k) ? filter.dists.delete(k) : filter.dists.add(k);
      changed();
      if (filter.dists.size === 1) bus.emit('goto-dist', k);
      return;
    }
    const row = e.target.closest('.tr');
    if (!row) return;
    const t = row.dataset.t;
    const onCb = e.target.closest('[data-cb]');
    if (t === 's') {
      const s = +row.dataset.s;
      filter.subs.has(s) ? filter.subs.delete(s) : filter.subs.add(s);
      return changed();
    }
    const key = row.dataset.k;
    if (onCb) {
      const list = t === 'c' ? catSubs[+key.slice(1)] : midSubs[+key.slice(1)];
      if (subState(list) === 'all') list.forEach((s) => filter.subs.delete(s));
      else list.forEach((s) => filter.subs.add(s));
      return changed();
    }
    expanded.has(key) ? expanded.delete(key) : expanded.add(key);
    const kids = row.nextElementSibling;
    if (kids) kids.hidden = !expanded.has(key);
    row.querySelector('.exp').classList.toggle('open', expanded.has(key));
  });
}
return { initUI, renderChips, refreshList, syncPop, setDetent, openFilter };
})();

// ===== detail.js =====
const __m_detail = (() => {
const { D, getDetail, queryRadius } = __m_data;
const { openModal } = __m_modal;
const { icon, iconPath } = __m_icons;
const { rowHTML } = __m_rows;
const { isFav, toggleFav } = __m_state;
const { createMiniMap } = __m_map;
const { esc, fmt, fmtDist, copyText, toast, bus } = __m_util;

let cur = null; // { m, i }
let token = 0;

function openDetail(i) {
  if (!cur) {
    const m = openModal({
      className: 'detail',
      onClose: () => {
        cur = null;
        token++;
        destroyMini();
        bus.emit('detail-closed');
      },
    });
    cur = { m, i };
    m.scroll.addEventListener('click', onClick);
  }
  cur.i = i;
  render(i);
}

const closeDetail = () => cur && cur.m.close();
const currentDetail = () => (cur ? cur.i : null);

// ---------- 헬퍼 ----------
const group = (title, inner, cls = '') =>
  `<section class="group ${cls}">${title ? `<h3>${title}</h3>` : ''}<div class="card">${inner}</div></section>`;

function row(label, value, o = {}) {
  if (value == null || value === '') return '';
  const v = String(value);
  const cp = o.copy ? ` data-copy="${esc(o.copy === true ? v : o.copy)}" role="button" tabindex="0"` : '';
  return `<div class="r${o.copy ? ' copyable' : ''}${o.stack ? ' stack' : ''}"${cp}>
    <span class="r-l">${label}</span>
    <span class="r-v${o.mono ? ' mono' : ''}">${o.html ? v : esc(v)}</span>
    ${o.copy ? icon('copy', 'r-c') : ''}
  </div>`;
}

function fmtFloor(f) {
  if (!f) return '';
  if (/^\d+$/.test(f)) return f + '층';
  const m = /^[Bb](\d+)$/.exec(f) || /^-(\d+)$/.exec(f);
  return m ? `지하 ${m[1]}층` : f;
}

const fmtZip = (z) => (z && /^\d{6}$/.test(z) ? z.slice(0, 3) + '-' + z.slice(3) : z);

// ---------- 미니 지도 (조작 불가 MapLibre 인스턴스) ----------
let mini = null;
function destroyMini() {
  if (mini) {
    try {
      mini.remove();
    } catch {
      /* noop */
    }
    mini = null;
  }
}

function miniMap() {
  const c = D.cats[D.cat[cur.i]];
  return `<button class="minimap" type="button" data-act="showmap" aria-label="지도에서 위치 보기">
    <div class="mm-map"></div>
    <div class="mm-pin" style="--c:${c.color}"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath(c.icon)}</svg></div>
    <span class="mm-cap">${icon('map')}지도에서 보기</span>
  </button>`;
}

function mountMini(i) {
  const el = cur.m.scroll.querySelector('.mm-map');
  if (!el) return;
  destroyMini();
  mini = createMiniMap(el, D.lon[i], D.lat[i]);
}

// ---------- 렌더 ----------
function render(i) {
  const my = ++token;
  const m = cur.m;
  const cat = D.cats[D.cat[i]];
  const sub = D.subs[D.sub[i]];
  const mid = D.mids[sub.mid];
  const br = D.branch.get(i);
  const lon = D.lon[i];
  const lat = D.lat[i];
  const dist = D.dists[D.dist[i]];
  const fullAddr = '부산광역시 ' + D.addr[i];
  const fav = isFav(D.id[i]);
  const nm = encodeURIComponent(D.name[i].replace(/,/g, ' '));

  m.el.style.setProperty('--c', cat.color);
  m.scroll.innerHTML = `
    <div class="hero">
      <div class="hero-badge">${icon(cat.icon)}</div>
      <h2>${esc(D.name[i])}</h2>
      ${br ? `<p class="hero-branch">${esc(br)}</p>` : ''}
      <div class="crumbs">
        <span class="crumb" style="--c:${cat.color}">${esc(cat.name)}</span>
        <span class="crumb-sep">${icon('chevR')}</span><span class="crumb">${esc(mid.name)}</span>
        <span class="crumb-sep">${icon('chevR')}</span><span class="crumb strong">${esc(sub.name)}</span>
      </div>
      <p class="hero-addr">${icon('pin')}<span>${esc(fullAddr)}</span></p>
    </div>

    <div class="actions">
      <a class="act" href="https://map.kakao.com/link/to/${nm},${lat},${lon}" target="_blank" rel="noopener">${icon('route')}<span>길찾기</span></a>
      <button class="act" type="button" data-act="radius">${icon('radius')}<span>주변 검색</span></button>
      <button class="act" type="button" data-act="copy-addr">${icon('copy')}<span>주소 복사</span></button>
      <button class="act" type="button" data-act="share">${icon('share')}<span>공유</span></button>
      <button class="act${fav ? ' on' : ''}" type="button" data-act="fav">${icon(fav ? 'starFill' : 'star')}<span>${fav ? '즐겨찾기 해제' : '즐겨찾기'}</span></button>
    </div>

    ${miniMap()}

    <div id="slot-detail">${group('위치', '<div class="shimmer"></div><div class="shimmer w70"></div><div class="shimmer w50"></div>')}</div>
    <div id="slot-nearby"></div>
    <div id="slot-building"></div>
    <div id="slot-same"></div>
    <div id="slot-ids"></div>

    ${group(
      '지도 앱에서 열기',
      `<div class="linkrow">
        <a href="https://map.kakao.com/link/map/${nm},${lat},${lon}" target="_blank" rel="noopener"><i style="background:#FEE500;color:#191919">K</i>카카오맵${icon('ext')}</a>
        <a href="https://map.naver.com/p/search/${encodeURIComponent(fullAddr + ' ' + D.name[i])}" target="_blank" rel="noopener"><i style="background:#03C75A;color:#fff">N</i>네이버지도${icon('ext')}</a>
        <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" rel="noopener"><i style="background:#4285F4;color:#fff">G</i>구글지도${icon('ext')}</a>
      </div>`
    )}
    <p class="foot">데이터 출처: ${esc(D.meta.source)} · ${esc(dist.name)}</p>
  `;
  m.scroll.scrollTop = 0;
  mountMini(i);

  // 주변 통계는 동기 계산(수 ms)이지만 첫 페인트 후에
  setTimeout(() => {
    if (my !== token) return;
    fillNearby(i);
  }, 0);

  getDetail(i)
    .then((d) => {
      if (my !== token) return;
      fillDetail(i, d);
    })
    .catch(() => {
      if (my !== token) return;
      const s = m.scroll.querySelector('#slot-detail');
      if (s) s.innerHTML = group('위치', '<div class="r"><span class="r-l">상세 정보를 불러오지 못했어요</span></div>');
    });
}

function fillDetail(i, d) {
  const m = cur.m;
  const cat = D.cats[D.cat[i]];
  const sub = D.subs[D.sub[i]];
  const mid = D.mids[sub.mid];
  const dist = D.dists[D.dist[i]];
  const zip = d.zipOld && d.zipOld !== d.zipNew ? `${fmtZip(d.zipNew)}  (구 ${fmtZip(d.zipOld)})` : fmtZip(d.zipNew);

  m.scroll.querySelector('#slot-detail').innerHTML =
    group(
      '위치',
      row('도로명주소', '부산광역시 ' + D.addr[i], { stack: true, copy: true }) +
        row('지번주소', d.jibun, { stack: true, copy: true }) +
        row('건물명', d.bldgName) +
        row('동', d.dongInfo) +
        row('층', fmtFloor(d.floor)) +
        row('호', d.hoInfo) +
        row('우편번호', zip, { copy: fmtZip(d.zipNew) }) +
        row('시군구', dist.name) +
        row('행정동', d.hdong[1]) +
        row('법정동', d.bdong[1]) +
        row('도로명', d.road[1])
    ) +
    group(
      '업종',
      row('대분류', `<i class="dot" style="background:${cat.color}"></i>${esc(cat.name)}`, { html: true }) +
        row('중분류', mid.name) +
        row('소분류', sub.name) +
        row('표준산업분류', d.ksic[1], { stack: true }) +
        row('표준산업분류 코드', d.ksic[0], { mono: true })
    );

  m.scroll.querySelector('#slot-ids').innerHTML = group(
    '식별 정보',
    row('상가업소번호', D.id[i], { mono: true, copy: true }) +
      row('건물관리번호', d.bldgNo, { mono: true, copy: true }) +
      row('도로명코드', d.road[0], { mono: true, copy: true }) +
      row('지번코드', d.jibunCode, { mono: true, copy: true }) +
      row('행정동코드', d.hdong[0], { mono: true, copy: true }) +
      row('법정동코드', d.bdong[0], { mono: true, copy: true }) +
      row('좌표 (위도, 경도)', `${D.lat[i].toFixed(6)}, ${D.lon[i].toFixed(6)}`, { mono: true, copy: true }),
    'ids'
  );

  if (d.sameBuilding.length) {
    const list = d.sameBuilding.slice(0, 40);
    m.scroll.querySelector('#slot-building').innerHTML = group(
      `같은 건물의 다른 상가 <em>${fmt(d.sameBuilding.length)}</em>`,
      list.map((j) => rowHTML(j)).join('') +
        (d.sameBuilding.length > list.length ? `<div class="r more-note">외 ${fmt(d.sameBuilding.length - list.length)}곳</div>` : ''),
      'rows'
    );
  }
}

function fillNearby(i) {
  const m = cur.m;
  const R = 500;
  const res = queryRadius(D.lon[i], D.lat[i], R, false);
  const sub = D.sub[i];
  const mid = D.subs[sub].mid;
  const cc = new Array(D.cats.length).fill(0);
  let sameSub = 0;
  let sameMid = 0;
  res.idx.forEach((j) => {
    cc[D.cat[j]]++;
    if (j === i) return;
    if (D.sub[j] === sub) sameSub++;
    if (D.subs[D.sub[j]].mid === mid) sameMid++;
  });
  const total = res.idx.length - 1;
  const order = cc.map((c, k) => [k, c]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const sum = res.idx.length;

  // 가장 가까운 같은 업종 (전체 데이터)
  const lon0 = D.lon[i];
  const lat0 = D.lat[i];
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const best = [];
  for (let j = 0; j < D.n; j++) {
    if (D.sub[j] !== sub || j === i) continue;
    const d = Math.hypot((D.lon[j] - lon0) * kx, (D.lat[j] - lat0) * 110540);
    if (best.length < 6 || d < best[best.length - 1][1]) {
      best.push([j, d]);
      best.sort((a, b) => a[1] - b[1]);
      if (best.length > 6) best.pop();
    }
  }

  m.scroll.querySelector('#slot-nearby').innerHTML =
    group(
      `반경 ${R}m 상권`,
      `<div class="stats">
        <div><b>${fmt(total)}</b><span>전체 상가</span></div>
        <div><b>${fmt(sameMid)}</b><span>같은 중분류</span></div>
        <div><b>${fmt(sameSub)}</b><span>같은 소분류</span></div>
      </div>
      <div class="dist-bar" role="img" aria-label="업종 분포">${order
        .map(([k, c]) => `<span style="flex:${c};background:${D.cats[k].color}" title="${esc(D.cats[k].name)} ${c}"></span>`)
        .join('')}</div>
      <div class="dist-legend">${order
        .slice(0, 6)
        .map(
          ([k, c]) =>
            `<span><i style="background:${D.cats[k].color}"></i>${esc(D.cats[k].name)}<b>${fmt(c)}</b><em>${Math.round((c / sum) * 100)}%</em></span>`
        )
        .join('')}</div>
      <button class="link-btn" type="button" data-act="radius">${icon('radius')}이 주변 상가 목록으로 보기${icon('chevR')}</button>`,
      'nearby'
    ) +
    '';

  if (best.length) {
    m.scroll.querySelector('#slot-same').innerHTML = group(
      `가까운 ${esc(D.subs[sub].name)}`,
      best.map(([j, d]) => rowHTML(j, { dist: d })).join(''),
      'rows'
    );
  }
}

// ---------- 이벤트 ----------
function onClick(e) {
  const i = cur.i;
  const rowEl = e.target.closest('.row[data-i]');
  if (rowEl) return bus.emit('select-shop', +rowEl.dataset.i);
  const cp = e.target.closest('[data-copy]');
  if (cp) return copyText(cp.dataset.copy, '복사했어요');
  const act = e.target.closest('[data-act]');
  if (!act) return;
  switch (act.dataset.act) {
    case 'fav': {
      const on = toggleFav(D.id[i]);
      act.classList.toggle('on', on);
      act.innerHTML = `${icon(on ? 'starFill' : 'star')}<span>${on ? '즐겨찾기 해제' : '즐겨찾기'}</span>`;
      toast(on ? '즐겨찾기에 추가했어요' : '즐겨찾기에서 뺐어요');
      break;
    }
    case 'copy-addr':
      copyText('부산광역시 ' + D.addr[i] + ' ' + D.name[i], '주소를 복사했어요');
      break;
    case 'share': {
      const url = location.href.split('#')[0] + '#shop=' + encodeURIComponent(D.id[i]);
      if (navigator.share) {
        navigator.share({ title: D.name[i], text: '부산광역시 ' + D.addr[i], url }).catch(() => {});
      } else copyText(url, '링크를 복사했어요');
      break;
    }
    case 'radius':
      bus.emit('radius-from', i, 500);
      break;
    case 'showmap':
      cur.m.close();
      bus.emit('focus-map');
      break;
  }
}

// 즐겨찾기가 다른 곳에서 바뀌면 버튼 동기화
bus.on('favs-changed', () => {
  if (!cur) return;
  const b = cur.m.scroll.querySelector('[data-act="fav"]');
  if (!b) return;
  const on = isFav(D.id[cur.i]);
  b.classList.toggle('on', on);
  b.innerHTML = `${icon(on ? 'starFill' : 'star')}<span>${on ? '즐겨찾기 해제' : '즐겨찾기'}</span>`;
});
return { openDetail, closeDetail, currentDetail };
})();

// ===== main.js =====
const __m_main = (() => {
const { D, loadData, filter, applyFilter, indexOfId } = __m_data;
const M = __m_map;
const { initUI, renderChips, syncPop, setDetent } = __m_ui;
const { openDetail, closeDetail } = __m_detail;
const { S, pushRecent } = __m_state;
const { $, bus, debounce, store, toast, fmt } = __m_util;

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
  M.flyTo(d.center[0], d.center[1], 12.6);
  if (isMobile()) setDetent('half');
});

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
          toast('현재 위치가 부산 지도 범위 밖이에요');
          return resolve(null);
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
  try {
    await loadData(setSplash);
  } catch (err) {
    console.error(err);
    $('#splash-txt').innerHTML =
      '데이터를 불러오지 못했어요.<br><small>web2 폴더의 <b>data</b> 폴더가 그대로 있는지 확인해 주세요.</small>';
    $('#splash-bar').parentElement.hidden = true;
    return;
  }
  const h = parseHash();
  applyHashState(h);
  await M.initMap('map', { ...h.view, dark: S.dark, basemap: view.basemap });
  M.setShops(D.F, !D.filtered);
  syncPop({ ...view });
  initUI();
  renderChips();

  const shopId = h.p.get('shop');
  if (shopId) {
    const i = indexOfId(shopId);
    if (i != null) selectShop(i, { fly: !h.view });
  }
  hideSplash();
  window.__app = { D, M, S }; // 디버깅 편의
}

window.addEventListener('hashchange', () => {
  // 외부에서 해시가 바뀐 경우(공유 링크 붙여넣기 등)
  const h = parseHash();
  if (!D.n) return;
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
return {  };
})();
})();
