import { icon } from './icons.js';

const root = document.getElementById('overlay-root');
const stack = [];
const isMobile = () => matchMedia('(max-width: 767px)').matches;

/**
 * iOS 스타일 모달. 데스크톱: 중앙 카드, 모바일: 바텀시트(아래로 스와이프해 닫기)
 * @returns {{el, scroll, close, overlay}}
 */
export function openModal({ className = '', onClose } = {}) {
  const prevFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const el = document.createElement('div');
  el.className = 'modal ' + className;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="m-grab" aria-hidden="true"><span></span></div>
    <button class="m-close" type="button" aria-label="닫기">${icon('close')}</button>
    <div class="m-scroll"></div>`;
  const scroll = el.querySelector('.m-scroll');
  overlay.appendChild(el);
  root.appendChild(overlay);
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('show')));

  let closed = false;
  const api = { el, scroll, overlay, close };
  function close() {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(api);
    if (i >= 0) stack.splice(i, 1);
    overlay.classList.remove('show');
    el.style.transform = '';
    setTimeout(() => overlay.remove(), 320);
    try {
      prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true });
    } catch {
      /* noop */
    }
    onClose && onClose();
  }

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  el.querySelector('.m-close').addEventListener('click', close);
  el.querySelector('.m-close').focus({ preventScroll: true });

  // 모바일: 스크롤 최상단에서 아래로 당기면 닫기
  let y0 = null;
  let dy = 0;
  let drag = false;
  const start = (e) => {
    if (!isMobile()) return;
    y0 = scroll.scrollTop <= 0 || e.target.closest('.m-grab') ? e.touches[0].clientY : null;
    drag = false;
    dy = 0;
  };
  const move = (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 8 && scroll.scrollTop <= 0) {
      drag = true;
      e.preventDefault();
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
    }
  };
  const end = () => {
    if (drag) {
      el.style.transition = '';
      if (dy > 110) close();
      else el.style.transform = '';
    }
    y0 = null;
    drag = false;
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);

  stack.push(api);
  return api;
}

export const hasModal = () => stack.length > 0;

document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape' && stack.length) {
      e.stopImmediatePropagation();
      stack[stack.length - 1].close();
    }
  },
  true
);
