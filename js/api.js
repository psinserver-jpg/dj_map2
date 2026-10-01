let configuration;
async function apiBase() {
  if (!configuration) configuration = (async () => {
    try {
      const result = await fetch('api-config.json', { cache: 'no-cache' });
      if (result.ok) {
        const data = await result.json();
        if (data.baseUrl) {
          const url = new URL(data.baseUrl);
          if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error('API 서버 주소는 HTTPS여야 합니다.');
          url.search = '';
          url.hash = '';
          return url.href.replace(/\/$/, '');
        }
      }
    } catch { /* Same-origin local servers do not need configuration. */ }
    if (location.hostname.endsWith('.github.io') || location.protocol === 'file:') throw new Error('리뷰·메뉴·내장 길찾기 서버가 아직 연결되지 않았어요. 서버 연결 후 사용할 수 있어요.');
    return '';
  })();
  return configuration;
}
export async function apiJSON(path, options = {}) {
  const base = await apiBase();
  let response;
  try { response = await fetch(base + path, options); }
  catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('리뷰·길찾기 서버가 응답하지 않아요. 서버 연결 설정을 확인해 주세요.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '요청을 처리하지 못했어요.');
  return data;
}
