export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const fmt = (n) => Number(n).toLocaleString('ko-KR');
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmtDist(m) {
  if (m == null || !isFinite(m)) return '';
  if (m < 1000) return Math.round(m) + 'm';
  return (m / 1000).toFixed(m < 10000 ? 1 : 0) + 'km';
}

export const debounce = (fn, ms) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

// 아주 작은 이벤트 버스 (모듈 간 결합 최소화)
const listeners = {};
export const bus = {
  on(e, f) {
    (listeners[e] ||= []).push(f);
  },
  emit(e, ...a) {
    (listeners[e] || []).forEach((f) => f(...a));
  },
};

let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
}

export async function copyText(text, msg = '복사했어요') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      /* noop */
    }
    ta.remove();
  }
  toast(msg);
}

export function highlight(text, q) {
  const t = String(text ?? '');
  if (!q) return esc(t);
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(t);
  return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length));
}

// 한글 초성 검색
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export function chosung(s) {
  let r = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    r += c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)] : ch;
  }
  return r;
}
export const isJamo = (s) => /^[ㄱ-ㅎ\s]+$/.test(s) && /[ㄱ-ㅎ]/.test(s);

const store = {
  get(k, def) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* noop */
    }
  },
};
export { store };
