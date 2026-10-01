function failure(message, status = 502, code = 'ROUTE_FAILED') {
  return Object.assign(new Error(message), { status, code });
}
export function validPoint(point) {
  return point && typeof point.lon === 'number' && typeof point.lat === 'number' &&
    Number.isFinite(point.lon) && Number.isFinite(point.lat) && point.lon >= 124 && point.lon <= 132 && point.lat >= 32 && point.lat <= 40;
}
function line(coordinates, mode, color) {
  const clean = (coordinates || []).filter((c) => Array.isArray(c) && validPoint({ lon: c[0], lat: c[1] }));
  return clean.length >= 2 ? { type: 'Feature', geometry: { type: 'LineString', coordinates: clean }, properties: { mode, color } } : null;
}
function parseLine(value) {
  return typeof value === 'string' ? value.trim().split(/\s+/).map((p) => p.split(',').map(Number)) : [];
}
function number(value) { return value != null && Number.isFinite(Number(value)) ? Number(value) : null; }
export function normalizeRoad(data, mode) {
  const features = data.features || [];
  const summary = features.find((f) => f.properties?.totalTime != null)?.properties;
  if (!summary) throw failure('이 구간의 경로를 찾지 못했어요.', 404, 'NO_ROUTE');
  const color = mode === 'walk' ? '#34C759' : '#007AFF';
  const geometry = features.filter((f) => f.geometry?.type === 'LineString').map((f) => line(f.geometry.coordinates, mode === 'walk' ? 'WALK' : 'CAR', color)).filter(Boolean);
  if (!geometry.length) throw failure('경로 좌표가 제공되지 않았어요.', 404, 'NO_GEOMETRY');
  return [{ duration: number(summary.totalTime), distance: number(summary.totalDistance), toll: mode === 'car' ? number(summary.totalFare) : null,
    steps: features.filter((f) => f.geometry?.type === 'Point' && f.properties?.description).map((f) => ({ mode: mode === 'walk' ? 'WALK' : 'CAR', instruction: f.properties.description, distance: number(f.properties.distance), duration: number(f.properties.time) })),
    geometry: { type: 'FeatureCollection', features: geometry } }];
}
export function normalizeTransit(data) {
  const itineraries = data.metaData?.plan?.itineraries || [];
  const routes = itineraries.slice(0, 3).map((itinerary) => {
    const geometry = [];
    const steps = (itinerary.legs || []).map((leg) => {
      const color = /^[0-9a-f]{6}$/i.test(leg.routeColor || '') ? '#' + leg.routeColor : leg.mode === 'WALK' ? '#8E8E93' : '#FF9500';
      if (leg.mode === 'WALK') {
        for (const step of leg.steps || []) { const f = line(parseLine(step.linestring), 'WALK', color); if (f) geometry.push(f); }
      } else {
        const f = line(parseLine(leg.passShape?.linestring), leg.mode, color);
        if (f) geometry.push(f);
      }
      return { mode: leg.mode, route: leg.route || '', from: leg.start?.name || '', to: leg.end?.name || '', duration: number(leg.sectionTime), distance: number(leg.distance),
        instruction: leg.mode === 'WALK' ? `${leg.start?.name || '출발지'} → ${leg.end?.name || '도착지'} 도보 이동` : `${leg.route || '대중교통'} · ${leg.start?.name || ''} 승차 → ${leg.end?.name || ''} 하차`,
        details: (leg.steps || []).map((s) => s.description).filter(Boolean), stops: (leg.passStopList?.stations || []).map((s) => s.stationName), service: leg.service };
    });
    return { duration: number(itinerary.totalTime), distance: number(itinerary.totalDistance), walkDistance: number(itinerary.totalWalkDistance), transfers: number(itinerary.transferCount),
      fare: number(itinerary.fare?.regular?.totalFare), steps, geometry: { type: 'FeatureCollection', features: geometry } };
  });
  if (!routes.length) throw failure('이 구간의 대중교통 경로를 찾지 못했어요.', 404, 'NO_ROUTE');
  return routes;
}
export async function fetchRoute({ mode, origin, destination }, env = process.env, request = fetch) {
  if (!['car', 'walk', 'traffic'].includes(mode) || !validPoint(origin) || !validPoint(destination)) throw failure('출발지와 도착지 좌표를 확인해 주세요.', 400, 'INVALID_ROUTE');
  const key = mode === 'traffic' ? env.TMAP_TRANSIT_APP_KEY || env.TMAP_APP_KEY : env.TMAP_APP_KEY;
  if (!key) throw failure(mode === 'traffic' ? '대중교통 경로 연결을 준비하고 있어요. TMAP 대중교통 API 키를 연결하면 사용할 수 있어요.' : '내장 길찾기 연결을 준비하고 있어요. TMAP API 키를 연결하면 사용할 수 있어요.', 503, 'ROUTE_KEY_MISSING');
  const body = { startX: String(origin.lon), startY: String(origin.lat), endX: String(destination.lon), endY: String(destination.lat) };
  let endpoint;
  if (mode === 'traffic') {
    endpoint = 'https://apis.openapi.sk.com/transit/routes';
    Object.assign(body, { count: 3, lang: 0, format: 'json' });
  } else {
    endpoint = `https://apis.openapi.sk.com/tmap/routes${mode === 'walk' ? '/pedestrian' : ''}?version=1`;
    Object.assign(body, { reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', searchOption: '0', sort: 'index' });
    if (mode === 'walk') Object.assign(body, { startName: encodeURIComponent(origin.name || '출발지'), endName: encodeURIComponent(destination.name || '도착지') });
    else Object.assign(body, { totalValue: 1, trafficInfo: 'Y' });
  }
  const response = await request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', appKey: key }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok || data.error || data.result?.status || data.metaData?.error) {
    throw failure(response.status === 401 || response.status === 403
      ? mode === 'traffic' ? '현재 키로 대중교통 API를 이용할 수 없어요. 대중교통 상품 이용 권한을 확인하거나 전용 키를 연결해 주세요.' : 'TMAP 키와 경로 API 이용 권한을 확인해 주세요.'
      : '경로를 불러오지 못했어요. 해당 구간 지원 여부와 API 이용 설정을 확인해 주세요.');
  }
  return { mode, source: mode === 'traffic' ? 'TMAP 대중교통' : 'TMAP', routes: mode === 'traffic' ? normalizeTransit(data) : normalizeRoad(data, mode) };
}
