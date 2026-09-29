import { D } from './data.js';
import { icon } from './icons.js';
import { esc, fmtDist, highlight } from './util.js';

export function badge(cat, cls = '') {
  const c = D.cats[cat];
  return `<span class="badge ${cls}" style="--c:${c.color}">${icon(c.icon)}</span>`;
}

// 상가 리스트 한 줄 (버튼). data-i = 전체 index
export function rowHTML(i, { dist, q } = {}) {
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
