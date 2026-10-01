import { createMiniMap } from './map.js';

export function createRouteView(container, destination) {
  const map = createMiniMap(container, destination.lon, destination.lat, { interactive: true, attributionControl: true });
  let ready = false;
  let route = null;
  let origin = null;
  let markers = [];
  let currentMarker = null;
  function marker(point, text, color) {
    const element = document.createElement('span');
    element.className = 'route-pin';
    element.textContent = text;
    element.style.background = color;
    element.setAttribute('aria-label', `${text}: ${point.name}`);
    return new window.maplibregl.Marker({ element }).setLngLat([point.lon, point.lat]).addTo(map);
  }
  function draw() {
    if (!ready) return;
    markers.forEach((m) => m.remove());
    markers = [marker(destination, '도착', '#FF3B30')];
    if (origin) markers.push(marker(origin, '출발', '#007AFF'));
    const geo = route?.geometry || { type: 'FeatureCollection', features: [] };
    map.getSource('route').setData(geo);
    const coordinates = geo.features.flatMap((f) => f.geometry.coordinates);
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    if (coordinates.length) {
      const bounds = new window.maplibregl.LngLatBounds();
      coordinates.forEach((p) => bounds.extend(p));
      if (origin) bounds.extend([origin.lon, origin.lat]);
      bounds.extend([destination.lon, destination.lat]);
      map.fitBounds(bounds, { padding: 44, maxZoom: 17, duration: 450, essential: true });
    } else if (origin) {
      const bounds = new window.maplibregl.LngLatBounds();
      bounds.extend([origin.lon, origin.lat]);
      bounds.extend([destination.lon, destination.lat]);
      map.fitBounds(bounds, { padding: 44, maxZoom: 16, duration: 300, essential: true });
    }
  }
  map.on('load', () => {
    map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'route-border', type: 'line', source: 'route', paint: { 'line-color': '#fff', 'line-width': 8, 'line-opacity': 0.85 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', filter: ['!=', ['get', 'mode'], 'WALK'],
      paint: { 'line-color': ['get', 'color'], 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'route-walk', type: 'line', source: 'route', filter: ['==', ['get', 'mode'], 'WALK'],
      paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-dasharray': [1, 1.3] }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    ready = true;
    draw();
  });
  return {
    show(nextRoute, nextOrigin) { route = nextRoute; origin = nextOrigin; draw(); },
    follow(point) {
      if (!ready) return;
      if (!currentMarker) {
        const el = document.createElement('span');
        el.className = 'navigation-position';
        el.setAttribute('aria-label', '현재 위치');
        currentMarker = new window.maplibregl.Marker({ element: el }).setLngLat([point.lon, point.lat]).addTo(map);
      }
      currentMarker.setLngLat([point.lon, point.lat]);
      map.easeTo({ center: [point.lon, point.lat], zoom: 17, pitch: 42, bearing: Number.isFinite(point.heading) ? point.heading : map.getBearing(), duration: 800 });
    },
    clearPosition() { currentMarker?.remove(); currentMarker = null; map.easeTo({ pitch: 0, bearing: 0, duration: 400 }); },
    destroy() { markers.forEach((m) => m.remove()); currentMarker?.remove(); map.remove(); },
  };
}
