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

export function icon(name, cls = '') {
  const fill = name === 'starFill';
  const p = P[fill ? 'star' : name] || P.info;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

export function iconPath(name) {
  return P[name] || P.info;
}
