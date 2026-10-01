import { D } from './data.js';
import { bus, esc } from './util.js';
import { iconPath } from './icons.js';

const maplibregl = window.maplibregl;
export let map;

const EMPTY = { type: 'FeatureCollection', features: [] };
const HOME = { center: [129.06, 35.16], zoom: 11 };
const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'; // OpenFreeMap: 무료·키 불필요
const FALLBACK_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export const BASEMAPS = {
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
export function createMiniMap(container, lon, lat, options = {}) {
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
    interactive: options.interactive ?? false,
    attributionControl: options.attributionControl ?? false,
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

export async function initMap(container, initial = {}) {
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
      minZoom: 5.5,
      maxZoom: 19.5,
      maxBounds: [
        [123.5, 32.5],
        [132.5, 39.5],
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
let allRegion = null;
let lastF = null;
function buildFC(F) {
  const feats = new Array(F.length);
  for (let k = 0; k < F.length; k++) {
    const i = F[k];
    feats[k] = { type: 'Feature', geometry: { type: 'Point', coordinates: [D.lon[i], D.lat[i]] }, properties: { i, c: D.cat[i] } };
  }
  return { type: 'FeatureCollection', features: feats };
}

export function setShops(F, isAll) {
  if (lastF === F && allRegion === D.region) return;
  lastF = F;
  if (allRegion !== D.region) { allFC = null; allRegion = D.region; }
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

export function setBasemap(kind) {
  if (kind === 'std' && !state.hasBase) kind = 'osm';
  state.basemap = kind;
  if (state.ready) applyBasemap();
}

export function setDark(dark) {
  if (state.dark === dark) return;
  state.dark = dark;
  if (state.ready) applyPalette();
}

export function setHeat(on) {
  state.heat = on;
  vis('heat', on);
  vis('clusters', !on);
  vis('cluster-count', !on);
  // 히트맵 상태에서는 확대(15+)했을 때만 개별 점을 보여준다
  map.setLayerZoomRange('points', on ? 15 : 0, 24);
}

// ---------- 선택 핀 / 내 위치 ----------
export function setSelected(i) {
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

export function showUser(lon, lat) {
  if (!userMarker) {
    const el = document.createElement('div');
    el.className = 'user-dot';
    el.innerHTML = '<span></span>';
    userMarker = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
  } else userMarker.setLngLat([lon, lat]);
}

// ---------- 반경 원 ----------
export function setRadius(c) {
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
export function flyTo(lon, lat, zoom, opts = {}) {
  map.flyTo({ center: [lon, lat], zoom, speed: 1.6, curve: 1.4, essential: true, ...opts });
}

export function fitBounds(b, opts = {}) {
  map.fitBounds(
    [
      [b[0], b[1]],
      [b[2], b[3]],
    ],
    { padding: 60, duration: 800, ...opts }
  );
}

export function fitRadius(c, opts = {}) {
  const kx = 111320 * Math.cos((c.lat * Math.PI) / 180);
  const dx = c.r / kx;
  const dy = c.r / 110540;
  fitBounds([c.lon - dx, c.lat - dy, c.lon + dx, c.lat + dy], opts);
}

export const zoomIn = () => map.zoomIn({ duration: 300 });
export const zoomOut = () => map.zoomOut({ duration: 300 });
export { HOME };
