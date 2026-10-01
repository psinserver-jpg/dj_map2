import http from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPlace } from './place-service.mjs';
import { fetchRoute, validPoint } from './route-service.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const regionData = new Map();
const cacheFile = (key) => path.join(root, '.local', 'reviews', createHash('sha256').update(key).digest('hex') + '.json');
async function scriptData(filename) {
  const source = await readFile(filename, 'utf8');
  return JSON.parse(source.slice(source.indexOf('=') + 1).trim().replace(/;$/, ''));
}
async function shopById(id, region) {
  if (!/^\d{2}$/.test(region)) return null;
  let data = regionData.get(region);
  if (!data) {
    const dir = path.join(root, 'data', 'regions', region);
    const p = await scriptData(path.join(dir, 'points.js'));
    const meta = await scriptData(path.join(dir, 'meta.js'));
    data = { p, meta, ids: new Map(p.id.map((id, i) => [id, i])) };
    // Limit memory to the last two regions. Only local government data is cached.
    if (regionData.size >= 2) regionData.delete(regionData.keys().next().value);
    regionData.set(region, data);
  }
  const i = data.ids.get(id);
  if (i == null) return null;
  const { p, meta } = data;
  return { name: p.name[i], branch: p.branch[i], address: p.addr[i], lon: p.lon[i], lat: p.lat[i], food: meta.cats[meta.mids[meta.subs[p.sub[i]].mid].cat].code === 'I2' };
}
async function requestJSON(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) throw Object.assign(new Error('요청이 너무 커요.'), { status: 413 });
  }
  try { return JSON.parse(body); } catch { throw Object.assign(new Error('요청 형식을 확인해 주세요.'), { status: 400 }); }
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}
export function createServer() {
  let active = 0;
  const jobs = new Map();
  let routeActive = 0;
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/route') {
        if (request.method !== 'POST') return json(response, 405, { message: 'POST only' });
        if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}` && request.headers.origin !== `https://${request.headers.host}`) return json(response, 403, { message: '허용되지 않은 요청이에요.' });
        const input = await requestJSON(request);
        if (!['car', 'walk', 'traffic'].includes(input.mode) || !validPoint(input.origin)) return json(response, 400, { message: '출발지와 이동 수단을 확인해 주세요.' });
        const destination = await shopById(input.id, input.region);
        if (!destination) return json(response, 404, { message: '도착 상가를 찾지 못했어요.' });
        if (routeActive >= 4) return json(response, 429, { message: '잠시 후 다시 경로를 검색해 주세요.' });
        routeActive++;
        try { json(response, 200, await fetchRoute({ mode: input.mode, origin: input.origin, destination })); } finally { routeActive--; }
        return;
      }
      if (request.method !== 'GET') return json(response, 405, { message: 'GET only' });
      if (url.pathname === '/api/place') {
        if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}` && request.headers.origin !== `https://${request.headers.host}`) return json(response, 403, { message: '허용되지 않은 요청이에요.' });
        const token = process.env.APIFY_TOKEN;
        if (!token || token.includes('<YOUR_API_TOKEN>')) return json(response, 503, { code: 'API_TOKEN_MISSING', message: '리뷰 서비스 연결을 준비하고 있어요. 지금은 지도에서 실제 리뷰를 확인할 수 있어요.' });
        const id = url.searchParams.get('id');
        const region = url.searchParams.get('region') || '26';
        const jobKey = region + ':' + id;
        for (const [k, job] of jobs) if (Date.now() - job.created > 6 * 3600000) jobs.delete(k);
        let existing = jobs.get(jobKey);
        if (existing?.error && (url.searchParams.get('retry') === '1' || Date.now() - existing.created > 30000)) {
          jobs.delete(jobKey); existing = null;
        }
        if (existing) {
          if (existing.error) return json(response, existing.error.status || 502, { message: existing.error.message });
          return json(response, existing.result ? 200 : 202, existing.result || { status: 'pending' });
        }
        if (active >= 4) return json(response, 429, { message: '요청이 많아요. 잠시 후 다시 시도해 주세요.' });
        const shop = await shopById(id, region);
        if (!shop) return json(response, 404, { message: '상가를 찾지 못했어요.' });
        try {
          const cached = JSON.parse(await readFile(cacheFile(jobKey), 'utf8'));
          if (Date.now() - cached.created < 6 * 3600000) { jobs.set(jobKey, cached); return json(response, 200, cached.result); }
        } catch { /* no completed cache yet */ }
        // Recheck after disk I/O to avoid duplicate billable runs.
        if (jobs.has(jobKey)) return json(response, 202, { status: 'pending' });
        if (active >= 4) return json(response, 429, { message: '요청이 많아요. 잠시 후 다시 시도해 주세요.' });
        if (jobs.size > 500) {
          const completed = [...jobs].find(([, j]) => j.result || j.error);
          if (completed) jobs.delete(completed[0]);
        }
        const job = { created: Date.now() };
        jobs.set(jobKey, job);
        active++;
        fetchPlace(shop, token).then(async (result) => {
          job.result = result;
          try { await mkdir(path.dirname(cacheFile(jobKey)), { recursive: true }); await writeFile(cacheFile(jobKey), JSON.stringify({ created: job.created, result }), 'utf8'); } catch { /* memory cache still available */ }
        }, (error) => { job.error = error; })
          .finally(() => { active--; });
        json(response, 202, { status: 'pending' });
        return;
      }
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      // Serve only public assets; never expose environment files or source tools.
      if (!/^(?:index\.html|app\.js|(?:css|data|vendor)\/[\w./-]+)$/.test(relative) || relative.split('/').some((part) => part === '..' || part.startsWith('.'))) return json(response, 404, { message: 'Not found' });
      const filename = path.resolve(root, relative);
      if (!filename.startsWith(root + path.sep)) return json(response, 404, { message: 'Not found' });
      const info = await stat(filename);
      if (!info.isFile()) return json(response, 404, { message: 'Not found' });
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': filename.endsWith('.json.gz') ? 'public, max-age=3600' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      response.end(await readFile(filename));
    } catch (error) {
      json(response, error.code === 'ENOENT' ? 404 : error.status || 502, { code: error.code, message: error.code === 'ENOENT' ? 'Not found' : error.status ? error.message : '정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' });
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => console.log(`상가지도: http://localhost:${port} · Apify 리뷰: ${process.env.APIFY_TOKEN ? '연결 설정됨' : '토큰 설정 필요'}`));
}
