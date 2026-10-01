import { chosung, isJamo } from './util.js';

// 전체 데이터 (컬럼형 typed array)
export const D = {};
// 활성 필터 (비어 있으면 전체)
export const filter = { subs: new Set(), dists: new Set(), city: null };
export const catalog = {};

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

export async function loadData(onProgress, region = '26') {
  // 진행률은 알 수 없으므로 두 파일 단위로만 표시
  onProgress && onProgress(0);
  if (!catalog.regions) {
    await loadScript('data/regions.js');
    if (!Array.isArray(window.STORE_REGIONS?.regions) || !window.STORE_REGIONS.regions.length) throw new Error('지역 목록 데이터가 올바르지 않아요. data/regions.js 파일을 확인해 주세요.');
    Object.assign(catalog, window.STORE_REGIONS);
    delete window.STORE_REGIONS;
  }
  const selected = catalog.regions.find((r) => r.code === region) || catalog.regions.find((r) => r.code === '26') || catalog.regions[0];
  const basePath = `data/regions/${selected.code}`;
  await loadScript(`${basePath}/meta.js`);
  onProgress && onProgress(0.15);
  await loadScript(`${basePath}/points.js`);
  onProgress && onProgress(0.9);
  const meta = window.BUSAN_META;
  const p = window.BUSAN_POINTS;
  if (!Array.isArray(meta?.cats) || !Array.isArray(p?.id) || p.id.length !== p.n) throw new Error(`${basePath}의 상가 데이터가 올바르지 않아요. meta.js와 points.js 파일을 확인해 주세요.`);
  delete window.BUSAN_META;
  delete window.BUSAN_POINTS;
  for (const key of Object.keys(D)) delete D[key];
  idMap = null;
  shardCache.clear();
  vpBuf = null;
  filter.subs.clear();
  filter.dists.clear();
  filter.city = null;
  D.basePath = basePath;
  D.region = selected.code;
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

export function applyFilter() {
  const hs = filter.subs.size > 0;
  const hd = filter.dists.size > 0;
  const subOn = new Uint8Array(D.subs.length);
  filter.subs.forEach((s) => (subOn[s] = 1));
  const distOn = new Uint8Array(D.dists.length);
  filter.dists.forEach((s) => (distOn[s] = 1));
  const out = new Uint32Array(D.n);
  let k = 0;
  for (let i = 0; i < D.n; i++) {
    if (filter.city != null && D.dist[i] !== filter.city) continue;
    if (hs && !subOn[D.sub[i]]) continue;
    if (hd && !distOn[D.dist[i]]) continue;
    out[k++] = i;
  }
  D.F = out.subarray(0, k);
  D.filtered = hs || hd || filter.city != null;
}

let idMap;
export function indexOfId(id) {
  if (!idMap) {
    idMap = new Map();
    for (let i = 0; i < D.n; i++) idMap.set(D.id[i], i);
  }
  return idMap.get(id);
}

// ---------- 공간 질의 ----------
export function metersFrom(i, lon0, lat0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return Math.hypot((D.lon[i] - lon0) * kx, (D.lat[i] - lat0) * 110540);
}

let vpBuf;
export function queryBounds(w, s, e, n, cap) {
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
export function queryRadius(lon0, lat0, r, useFilter = true) {
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
    if (filter.city != null && D.dist[i] !== filter.city) continue;
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
export function search(q, limit = 40) {
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
      if (filter.city != null && D.dist[i] !== filter.city) continue;
      const c = D.cho[i];
      if (c.startsWith(qc)) t0.push(i);
      else if (t1.length < limit && c.includes(qc)) t1.push(i);
    }
  } else {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const first = tokens[0];
    for (let i = 0; i < D.n && t0.length < limit; i++) {
      if (filter.city != null && D.dist[i] !== filter.city) continue;
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
export function loadShard(d) {
  let p = shardCache.get(d);
  if (!p) {
    const code = D.dists[d].code;
    p = loadScript(`${D.basePath}/detail/${code}.js`).then(() => {
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

export async function getDetail(i) {
  const d = D.dist[i];
  const dist = D.dists[d];
  const s = await loadShard(d);
  const k = i - dist.start;
  const r = s.rows[k];
  const [hd, bd, land, bon, bu, rd, bNo, bName, zipNew, zipOld, floor, dongInfo, hoInfo, ks] = r;
  const bdong = s.b[bd];
  const road = s.r[rd];
  let jibun = `${D.meta.regionName} ${dist.name} ${bdong[1]}`;
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
