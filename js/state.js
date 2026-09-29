import { store, bus } from './util.js';

// 앱 전역 상태 (즐겨찾기/최근은 localStorage 유지)
export const S = {
  favs: new Set(store.get('busan-fav', [])),
  recents: store.get('busan-recent', []),
  sel: null, // 선택된 상가 index
  radius: null, // { lon, lat, r, label }
  tab: 'view', // view | fav | recent
  sort: 'dist', // dist | name
  dark: false,
};

export const isFav = (id) => S.favs.has(id);

export function toggleFav(id) {
  if (S.favs.has(id)) S.favs.delete(id);
  else S.favs.add(id);
  store.set('busan-fav', [...S.favs]);
  bus.emit('favs-changed');
  return S.favs.has(id);
}

export function pushRecent(id) {
  S.recents = [id, ...S.recents.filter((x) => x !== id)].slice(0, 30);
  store.set('busan-recent', S.recents);
  bus.emit('recents-changed');
}

export function clearRecents() {
  S.recents = [];
  store.set('busan-recent', []);
  bus.emit('recents-changed');
}
