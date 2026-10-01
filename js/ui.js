import { D, catalog, filter, applyFilter, queryBounds, queryRadius, search, indexOfId, metersFrom } from './data.js';
import * as M from './map.js';
import { openModal } from './modal.js';
import { icon } from './icons.js';
import { badge, rowHTML } from './rows.js';
import { S, clearRecents } from './state.js';
import { $, $$, bus, debounce, esc, fmt, fmtDist, highlight, toast, store } from './util.js';

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

export function initUI() {
  refreshRegionUI();
  renderChips();
  renderTabs();
  bindSearch();
  bindList();
  bindControls();
  initSheet();
  $('#region-select').addEventListener('change', (e) => bus.emit('region-select', e.target.value));
  $('#city-select').addEventListener('change', (e) => bus.emit('city-select', e.target.value));
  setupRegionPicker('region', '시·도');
  setupRegionPicker('city', '시·군·구');

  bus.on('move', debounce(refreshList, 140));
  bus.on('filter-changed', () => {
    renderChips();
    syncRegionSelectors();
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

function syncRegionSelectors() {
  const city = filter.city == null ? null : D.dists[filter.city];
  $('#sub').textContent = `${D.meta.regionName}${city ? ' · ' + city.name : ''} · ${fmt(city ? city.count : D.n)}개 상가`;
  $('#region-select').value = D.region;
  $('#city-select').value = city ? city.code : '';
  for (const kind of ['region', 'city']) {
    const button = $(`#${kind}-picker`);
    const select = $(`#${kind}-select`);
    if (button) button.querySelector('strong').textContent = select.selectedOptions[0]?.textContent || '선택';
  }
}

function setupRegionPicker(kind, title) {
  const select = $(`#${kind}-select`);
  select.hidden = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = `${kind}-picker`;
  button.className = 'region-picker';
  button.setAttribute('aria-label', `${title} 선택`);
  button.setAttribute('aria-haspopup', 'dialog');
  button.innerHTML = `<strong>${esc(select.selectedOptions[0]?.textContent || '선택')}</strong><span aria-hidden="true">⌄</span>`;
  select.after(button);
  button.addEventListener('click', () => {
    const modal = openModal({ className: 'region-choice-modal' });
    modal.el.setAttribute('aria-label', `${title} 선택`);
    modal.scroll.innerHTML = `<h2>${title} 선택</h2><p class="region-choice-hint">보고 싶은 지역을 선택하세요.</p><input class="region-choice-search" type="search" aria-label="${title} 검색" placeholder="지역 이름 검색"><div class="region-choice-list" role="listbox" aria-label="${title} 목록"></div>`;
    const input = modal.el.querySelector('input');
    const list = modal.el.querySelector('[role="listbox"]');
    function render() {
      const options = [...select.options].filter((o) => o.textContent.includes(input.value.trim()));
      list.innerHTML = options.length ? options.map((o) => `<button type="button" role="option" aria-selected="${o.value === select.value}" data-value="${esc(o.value)}"><span>${esc(o.textContent)}</span><b aria-hidden="true">${o.value === select.value ? '✓' : '›'}</b></button>`).join('') : '<p class="region-choice-hint">검색 결과가 없어요.</p>';
    }
    input.addEventListener('input', render);
    list.addEventListener('click', (e) => {
      const option = e.target.closest('[data-value]');
      if (!option) return;
      const value = option.dataset.value;
      modal.close();
      bus.emit(`${kind}-select`, value);
    });
    render();
  });
}

export function refreshRegionUI() {
  catSubs = D.cats.map(() => []);
  D.subs.forEach((s, k) => catSubs[D.subCat[k]].push(k));
  $('#region-select').innerHTML = catalog.regions.map((r) => `<option value="${esc(r.code)}">${esc(r.name)}</option>`).join('');
  $('#city-select').innerHTML = '<option value="">전체 시·군·구</option>' + D.dists.map((d) => `<option value="${esc(d.code)}">${esc(d.name)} (${fmt(d.count)})</option>`).join('');
  syncRegionSelectors();
  resetSearch();
  renderChips();
  renderTabs();
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

export function renderChips() {
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

export function refreshList() {
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
    items = ids.map((id) => indexOfId(id)).filter((i) => i != null && (filter.city == null || D.dist[i] === filter.city));
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
        D.addr[i],
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
  a.download = `shops_${D.region}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
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
  const distHits = D.dists.map((d, k) => [d, k]).filter(([d, k]) => d.name.includes(v) && (filter.city == null || filter.city === k)).slice(0, 3);
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

export function syncPop(state) {
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
export function setDetent(d) {
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

export function openFilter() {
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
      .map((d, k) => filter.city != null && filter.city !== k ? '' : `<button type="button" class="pill${filter.dists.has(k) || filter.city === k ? ' on' : ''}" data-d="${k}">${esc(d.name)}<small>${fmt(d.count)}</small></button>`)
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
