import https from 'node:https';
import { lookup } from 'node:dns/promises';

const norm = (s) => String(s || '').toLowerCase().replace(/주식회사|\(주\)|[\s\p{P}\p{S}]/gu, '');
export function matchPlace(shop, places) {
  const name = norm(shop.name);
  const branch = norm(shop.branch);
  const matches = places.map((p) => {
    const n = norm(p.displayName?.text);
    const distance = Math.hypot((p.location?.longitude - shop.lon) * 111320 * Math.cos(shop.lat * Math.PI / 180), (p.location?.latitude - shop.lat) * 110540);
    const sameName = n === name || n === name + branch || (name.length >= 3 && n.startsWith(name));
    if (!sameName || !Number.isFinite(distance) || distance > 150 || (branch && !n.includes(branch))) return null;
    return { place: p, score: (n === name || n === name + branch ? 200 : 150) - distance };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
  if (!matches.length || (matches[1] && matches[0].score - matches[1].score < 25)) return null;
  return matches[0].place;
}

export function publicIPv4(address) {
  const a = address.split('.').map(Number);
  if (a.length !== 4 || a.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return false;
  return !(a[0] === 0 || a[0] === 10 || a[0] === 127 || a[0] >= 224 ||
    (a[0] === 100 && a[1] >= 64 && a[1] <= 127) ||
    (a[0] === 169 && a[1] === 254) || (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
    (a[0] === 192 && [0, 168].includes(a[1])) || (a[0] === 198 && [18, 19].includes(a[1])));
}

async function websiteHTML(value, redirects = 0) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('unsupported website');
  const addresses = await lookup(url.hostname, { family: 4, all: true });
  if (!addresses.length || addresses.some((a) => !publicIPv4(a.address))) throw new Error('non-public website');
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'StoreMap/1.0 (public menu lookup)', Accept: 'text/html' },
      lookup: (_host, options, callback) => callback(null, options.all ? [{ address: addresses[0].address, family: 4 }] : addresses[0].address, 4) }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (redirects >= 3 || !response.headers.location) return reject(new Error('redirect limit'));
        websiteHTML(new URL(response.headers.location, url).href, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200 || !String(response.headers['content-type']).includes('text/html')) {
        response.resume(); reject(new Error('no HTML menu')); return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) { response.destroy(new Error('website too large')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), url: url.href }));
    });
    request.setTimeout(5000, () => request.destroy(new Error('website timeout')));
    request.on('error', reject);
  });
}

export function parseMenu(html, sourceUrl) {
  const items = [];
  let menuUrl = '';
  const seen = new Set();
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const types = [].concat(node['@type'] || []);
    if (types.some((t) => /(?:^|\/)MenuItem$/.test(t)) && typeof node.name === 'string' && !seen.has(node.name)) {
      const offer = [].concat(node.offers || [])[0] || {};
      const price = offer.price ?? offer.priceSpecification?.price;
      const currency = offer.priceCurrency || offer.priceSpecification?.priceCurrency;
      seen.add(node.name);
      items.push({ name: node.name, description: typeof node.description === 'string' ? node.description : '',
        price: price == null ? '' : currency === 'KRW' && Number.isFinite(+price) ? `${Number(price).toLocaleString('ko-KR')}원` : `${price} ${currency || ''}`.trim() });
    }
    if (typeof node.hasMenu === 'string') {
      try { const u = new URL(node.hasMenu, sourceUrl); if (u.protocol === 'https:') menuUrl = u.href; } catch { /* ignore */ }
    }
    Object.values(node).forEach(walk);
  }
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1])); } catch { /* ignore invalid publisher JSON */ }
  }
  return { items: items.slice(0, 100), sourceUrl: menuUrl || sourceUrl, menuUrl, status: items.length ? 'available' : 'not_published' };
}

async function getMenu(website) {
  if (!website) return { items: [], status: 'not_published' };
  try {
    const page = await websiteHTML(website);
    const menu = parseMenu(page.html, page.url);
    if (!menu.items.length && menu.menuUrl && new URL(menu.menuUrl).origin === new URL(page.url).origin && menu.menuUrl !== page.url) {
      try { const detail = await websiteHTML(menu.menuUrl); return parseMenu(detail.html, detail.url); } catch { /* keep original link */ }
    }
    return menu;
  } catch { return { items: [], sourceUrl: website, status: 'unavailable' }; }
}

export function normalizeApifyPlace(shop, rows) {
  const candidates = rows.filter((r) => r.title && !r.permanentlyClosed).map((r) => ({
    displayName: { text: r.title }, location: { latitude: r.location?.lat, longitude: r.location?.lng }, raw: r,
  }));
  const selected = matchPlace(shop, candidates);
  if (!selected) return { status: 'not_found' };
  const p = selected.raw;
  return { status: 'ok', rating: p.totalScore, reviewCount: p.reviewsCount || 0, mapsUrl: p.url || (p.placeId ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.title)}&query_place_id=${encodeURIComponent(p.placeId)}` : ''),
    source: 'Apify · Google Maps', fetchedAt: p.scrapedAt || new Date().toISOString(),
    reviews: (p.reviews || []).slice(0, 20).map((r) => ({ author: r.name, authorUrl: r.reviewerUrl, rating: r.stars,
      text: r.text || r.textTranslated || '', date: r.publishedAtDate || r.publishedAt || '', url: r.reviewUrl })),
    website: typeof p.menu === 'string' && p.menu ? p.menu : p.website };
}

export async function fetchPlace(shop, token, apifyFetch = fetch, delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  const deadline = Date.now() + 195000;
  async function apify(url, options = {}) {
    const response = await apifyFetch('https://api.apify.com/v2/' + url, { ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      const error = new Error(response.status === 401 || response.status === 403 ? 'Apify 토큰과 Actor 실행 권한을 확인해 주세요.' : 'Apify 수집 요청이 실패했어요. 계정 잔액과 실행 상태를 확인해 주세요.');
      error.status = 502;
      throw error;
    }
    return response.json();
  }
  const started = await apify('actors/compass~crawler-google-places/runs?timeout=180', {
    method: 'POST', body: JSON.stringify({ searchStringsArray: [`${shop.address} ${shop.name} ${shop.branch || ''}`],
      maxCrawledPlacesPerSearch: 3, language: 'ko', maxReviews: 20, reviewsSort: 'newest', reviewsOrigin: 'google', scrapeReviewsPersonalData: true }) });
  let run = started.data;
  while (['READY', 'RUNNING', 'TIMING-OUT', 'ABORTING'].includes(run.status)) {
    if (Date.now() > deadline) {
      const error = new Error('리뷰 수집 시간이 초과됐어요. Apify 실행 내역을 확인해 주세요.'); error.status = 504; throw error;
    }
    await delay(2500);
    run = (await apify(`actor-runs/${encodeURIComponent(run.id)}`)).data;
  }
  if (run.status !== 'SUCCEEDED') { const error = new Error('Apify 수집이 완료되지 않았어요. 실행 내역을 확인해 주세요.'); error.status = 502; throw error; }
  const rows = await apify(`datasets/${encodeURIComponent(run.defaultDatasetId)}/items?clean=true&format=json&limit=3`);
  const result = normalizeApifyPlace(shop, rows);
  if (result.status !== 'ok') return result;
  if (shop.food) {
    let website = result.website;
    if (typeof website === 'string' && website.startsWith('http://')) website = 'https://' + website.slice(7);
    result.menu = await getMenu(website);
  }
  delete result.website;
  return result;
}
