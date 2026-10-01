export function meters(a, b) {
  const scale = Math.cos((a.lat + b.lat) * Math.PI / 360);
  return Math.hypot((a.lon - b.lon) * 111320 * scale, (a.lat - b.lat) * 110540);
}
export function makePath(route) {
  const points = route.geometry.features.flatMap((f) => f.geometry.coordinates).map(([lon, lat]) => ({ lon, lat }));
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + meters(points[i - 1], points[i]));
  return { points, lengths, total: lengths.at(-1) || 0 };
}
export function projectPosition(point, path) {
  let best = { offset: Infinity, progress: 0 };
  const scale = 111320 * Math.cos(point.lat * Math.PI / 180);
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i];
    const dx = (b.lon - a.lon) * scale, dy = (b.lat - a.lat) * 110540;
    const px = (point.lon - a.lon) * scale, py = (point.lat - a.lat) * 110540;
    const ratio = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
    const offset = Math.hypot(px - ratio * dx, py - ratio * dy);
    if (offset < best.offset) best = { offset, progress: path.lengths[i - 1] + ratio * (path.lengths[i] - path.lengths[i - 1]) };
  }
  return best;
}
const models = new WeakMap();
export function navigationState(route, destination, point, previous = 0) {
  if (!models.has(route)) {
    const path = makePath(route);
    const anchors = route.steps.map((step, index) => ({ ...step, index,
      progress: step.location ? projectPosition(step.location, path).progress : null })).filter((s) => s.progress != null);
    models.set(route, { path, anchors });
  }
  const { path, anchors } = models.get(route);
  const projection = projectPosition(point, path);
  const progress = Math.max(previous, projection.progress);
  const remaining = Math.max(0, path.total - progress);
  const next = anchors.find((s) => s.progress > progress + 12) || anchors.at(-1);
  const accuracy = point.accuracy || 0;
  return { progress, remaining, offset: projection.offset,
    next: next || { instruction: '경로를 따라 도착지로 이동하세요.', index: -1 },
    turnDistance: next ? Math.max(0, next.progress - progress) : remaining,
    duration: path.total ? Math.round((route.duration || 0) * remaining / path.total) : null,
    arrived: accuracy <= 60 && meters(point, destination) < 25 && remaining < 70,
    offRoute: accuracy <= 60 && projection.offset > Math.max(65, accuracy * 1.7),
    poorAccuracy: accuracy > 60 };
}

export function startNavigation({ route, destination, mode, onUpdate, onPosition, onReroute, onStop }) {
  let active = true, voice = true, progress = 0, lastSpeech = '', offCount = 0, rerouting = false, lastReroute = 0;
  let watchId = null;
  let wakeLock = null;
  function speak(text, key) {
    if (!voice || !window.speechSynthesis || key === lastSpeech) return;
    lastSpeech = key;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
  function stop(message = '안내를 종료했어요.') {
    if (!active) return;
    active = false;
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    window.speechSynthesis?.cancel();
    wakeLock?.release().catch(() => {});
    onStop(message);
  }
  if (!navigator.geolocation) { queueMicrotask(() => stop('현재 위치를 지원하지 않는 브라우저예요.')); return { stop, toggleVoice: () => false }; }
  speak('현재 위치를 확인하고 이동 안내를 시작합니다.', 'start');
  navigator.wakeLock?.request('screen').then((lock) => { if (!active) lock.release(); else wakeLock = lock; }).catch(() => {});
  watchId = navigator.geolocation.watchPosition(async ({ coords }) => {
    if (!active) return;
    const point = { lon: coords.longitude, lat: coords.latitude, accuracy: coords.accuracy, heading: coords.heading, speed: coords.speed };
    const state = navigationState(route, destination, point, progress);
    if (!state.poorAccuracy && !state.offRoute) progress = state.progress;
    onPosition(point);
    onUpdate(state, point);
    if (state.arrived) {
      speak('목적지에 도착했습니다.', 'arrived');
      // Keep the arrival announcement playing while stopping location tracking.
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      active = false;
      wakeLock?.release().catch(() => {});
      onStop('목적지에 도착했습니다.');
      return;
    }
    if (state.poorAccuracy) { offCount = 0; return; }
    if (state.offRoute) offCount = progress === 0 ? 2 : offCount + 1; else offCount = 0;
    if (offCount >= 2 && !rerouting && Date.now() - lastReroute > 45000) {
      rerouting = true;
      lastReroute = Date.now();
      speak('경로를 벗어났습니다. 현재 위치에서 다시 탐색합니다.', 'reroute-' + lastReroute);
      try {
        const nextRoute = await onReroute(point);
        if (active && nextRoute) { route = nextRoute; progress = 0; offCount = 0; }
      } catch (error) { if (active) onUpdate({ ...state, message: error.message }, point); }
      finally { rerouting = false; }
      return;
    }
    if (!state.offRoute) {
      const band = state.turnDistance < 35 ? 'now' : state.turnDistance < 180 ? 'near' : 'far';
      if (band !== 'far' || progress < 30) speak(`${Math.round(state.turnDistance)}미터 앞, ${state.next.instruction}`, `${state.next.index}-${band}`);
    }
  }, (error) => {
    if (!active) return;
    if (error.code === 1) stop('위치 권한을 허용하면 실시간 안내를 사용할 수 있어요.');
    else onUpdate({ message: 'GPS 신호를 기다리고 있어요. 위치가 잡히면 안내를 계속합니다.' });
  }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
  return { stop, toggleVoice() { voice = !voice; if (!voice) window.speechSynthesis?.cancel(); return voice; } };
}
