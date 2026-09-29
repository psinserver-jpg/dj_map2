import { D, getDetail, queryRadius } from './data.js';
import { openModal } from './modal.js';
import { icon, iconPath } from './icons.js';
import { rowHTML } from './rows.js';
import { isFav, toggleFav } from './state.js';
import { createMiniMap } from './map.js';
import { esc, fmt, fmtDist, copyText, toast, bus } from './util.js';

let cur = null; // { m, i }
let token = 0;

export function openDetail(i) {
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

export const closeDetail = () => cur && cur.m.close();
export const currentDetail = () => (cur ? cur.i : null);

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
