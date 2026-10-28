// Tiện ích DOM: mẫu HTML có thoát ký tự mặc định (dữ liệu nhập từ CSV là dữ liệu không tin cậy).

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  if (value === null || value === undefined || value === false) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESC[c]);
}

class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

// Đánh dấu chuỗi HTML đã an toàn (do mã của ứng dụng tạo ra).
export const raw = (s) => new Raw(String(s ?? ''));

function render(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

// html`<p>${userText}</p>` → thoát userText; html`${raw(x)}` hoặc mảng các html`` → giữ nguyên.
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

export function setHTML(el, content) {
  el.innerHTML = content instanceof Raw ? content.s : esc(content);
}

let uid = 0;
export const nextId = (prefix = 'id') => `${prefix}-${++uid}`;

export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
