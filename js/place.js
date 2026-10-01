import { D } from './data.js';
import { esc } from './util.js';
import { icon } from './icons.js';
import { apiJSON } from './api.js';

const group = (title, content) => `<section class="group"><h3>${title}</h3><div class="card">${content}</div></section>`;
const message = (text) => `<p class="place-message">${esc(text)}</p>`;
function reviewDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value || '')) return value || '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
}
function safeURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}
function link(url, label) {
  const href = safeURL(url);
  return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}${icon('ext')}</a>` : '';
}

export function placeLoading(i) {
  return group('리뷰', '<div class="shimmer"></div><div class="shimmer w70"></div><p class="place-message">실제 리뷰를 불러오는 중… 첫 수집은 최대 3분 정도 걸릴 수 있어요.</p>') +
    (D.cats[D.cat[i]].code === 'I2' ? group('메뉴', '<div class="shimmer"></div>') : '');
}

export async function fillPlace(i, slot, signal, retry = false) {
  const food = D.cats[D.cat[i]].code === 'I2';
  const fallback = `<div class="linkrow">${link('https://map.naver.com/p/search/' + encodeURIComponent(D.addr[i] + ' ' + D.name[i]), food ? '네이버지도에서 리뷰·메뉴 확인' : '네이버지도에서 리뷰 확인')}</div>`;
  try {
    if (location.protocol === 'file:') throw new Error('서버로 접속하면 리뷰를 자동으로 불러올 수 있어요. 지금은 지도에서 리뷰를 확인할 수 있어요.');
    const endpoint = '/api/place?' + new URLSearchParams({ id: D.id[i], region: D.region });
    const started = Date.now();
    let data;
    while (true) {
      data = await apiJSON(endpoint + (retry ? '&retry=1' : ''), { signal, cache: 'no-store' });
      retry = false;
      if (data.status !== 'pending') break;
      if (Date.now() - started > 210000) throw new Error('리뷰 수집이 지연되고 있어요. 잠시 후 다시 불러와 주세요.');
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2500);
        const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
    }
    if (signal.aborted) return;
    if (data.status === 'not_found') {
      slot.innerHTML = group('리뷰', message('이 주소와 일치하는 상가의 리뷰를 찾지 못했어요.') + fallback) + (food ? group('메뉴', message('메뉴 원본을 지도에서 확인해 주세요.')) : '');
      return;
    }
    const reviews = data.reviews || [];
    const reviewHTML = reviews.map((r, index) => `<article class="review"${index >= 3 ? ' hidden' : ''}>
      <div class="review-head"><b>${safeURL(r.authorUrl) ? `<a href="${esc(safeURL(r.authorUrl))}" target="_blank" rel="noopener noreferrer">${esc(r.author || 'Google Maps 사용자')}</a>` : esc(r.author || 'Google Maps 사용자')}</b><span class="review-rating">★ ${esc(r.rating ?? '—')}</span></div>
      <p class="review-date">${esc(reviewDate(r.date))}</p><p class="review-text">${esc(r.text || '내용 없이 별점만 남긴 리뷰예요.')}</p>
      ${link(r.url, '리뷰 원문 보기')}
    </article>`).join('');
    slot.innerHTML = group('리뷰', `<div class="review-summary"><strong>★ ${esc(data.rating ?? '—')}</strong><span>평가 ${esc((data.reviewCount || 0).toLocaleString('ko-KR'))}개</span></div>
      ${reviewHTML || message('공개된 리뷰가 아직 없어요.')}
      ${reviews.length > 3 ? `<button type="button" class="link-btn" data-act="more-reviews">리뷰 ${reviews.length - 3}개 더 보기${icon('chevR')}</button>` : ''}
      <div class="place-attribution"><span translate="no">Google Maps</span><small>Apify 수집 · 최신순 · 최대 20개</small></div>
      ${(data.attributions || []).map((a) => `<p class="place-message">${link(a.uri, a.provider) || esc(a.provider)}</p>`).join('')}
      <div class="linkrow">${link(data.mapsUrl, 'Google Maps에서 전체 리뷰 보기')}</div>`) +
      (food ? group('메뉴', renderMenu(data.menu) + fallback) : '');
  } catch (error) {
    if (signal.aborted) return;
    slot.innerHTML = group('리뷰', message(error.message) + '<button type="button" class="link-btn" data-act="retry-place">다시 불러오기</button>' + fallback) +
      (food ? group('메뉴', message('메뉴가 제공되는 음식점은 공식 홈페이지의 메뉴를 표시해요.')) : '');
  }
}

function renderMenu(menu = {}) {
  const items = menu.items || [];
  return (items.length ? items.map((item) => `<div class="r menu-row"><span class="menu-name">${esc(item.name)}${item.description ? `<small>${esc(item.description)}</small>` : ''}</span><span class="r-v">${esc(item.price || '가격 미공개')}</span></div>`).join('')
    : message(menu.status === 'unavailable' ? '공식 홈페이지의 메뉴를 불러오지 못했어요.' : '이 음식점은 자동으로 가져올 수 있는 메뉴 항목을 공개하지 않았어요. 원본에서 확인해 주세요.')) +
    (menu.sourceUrl ? `<div class="linkrow">${link(menu.sourceUrl, items.length ? '메뉴 출처에서 확인' : '메뉴 원본에서 확인')}</div>` : '') +
    (items.length ? '<p class="place-message">공식 홈페이지에 공개된 메뉴와 가격이에요. 실제 판매 가격은 매장에서 확인해 주세요.</p>' : '');
}
