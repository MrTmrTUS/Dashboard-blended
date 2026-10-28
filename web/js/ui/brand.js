// Logo Trường Đại học Thành Đông: đặt tệp logo chính thức tại web/assets/logo-tdu.png (nền trong suốt).
// Chưa có tệp thì hiện biểu trưng của ứng dụng – không tự vẽ lại logo của Trường.
import { esc, raw } from './dom.js';
import { brandMark } from './icons.js';

export const LOGO_SRC = 'assets/logo-tdu.png';
export const ORG_NAME = 'Trường Đại học Thành Đông';

let logo = null;

export function probeLogo(timeout = 2500) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok) => {
      clearTimeout(timer);
      logo = ok ? LOGO_SRC : null;
      resolve(logo);
    };
    const timer = setTimeout(() => done(false), timeout);
    img.onload = () => done(img.naturalWidth > 0);
    img.onerror = () => done(false);
    img.src = LOGO_SRC;
  });
}

export const hasLogo = () => Boolean(logo);

// alt rỗng khi tên Trường đã có ngay cạnh logo (tránh đọc lặp).
export function logoMark(cls, alt = '') {
  if (!logo) return brandMark(cls);
  return raw(`<img class="${cls} ${cls}--logo" src="${esc(logo)}" alt="${esc(alt)}" decoding="async">`);
}
