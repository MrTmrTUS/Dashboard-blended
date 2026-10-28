// Định dạng số, ngày kiểu Việt Nam (mục 9): 3,72 · 1.234 · dd/mm/yyyy.
const cache = new Map();

function nf(min, max) {
  const key = `${min}-${max}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      new Intl.NumberFormat('vi-VN', { minimumFractionDigits: min, maximumFractionDigits: max }),
    );
  }
  return cache.get(key);
}

const ok = (v) => typeof v === 'number' && Number.isFinite(v);

// Điểm thang 1 – 5: luôn 2 chữ số thập phân.
export function fmtScore(v, digits = 2) {
  return ok(v) ? nf(digits, digits).format(v) : '–';
}

export function fmtNum(v, digits = 0) {
  return ok(v) ? nf(digits, digits).format(v) : '–';
}

export function fmtInt(v) {
  return ok(v) ? nf(0, 0).format(Math.round(v)) : '–';
}

// Tỷ lệ 0 – 1 → "68%".
export function fmtPct(v, digits = 0) {
  return ok(v) ? `${nf(digits, digits).format(v * 100)}%` : '–';
}

// Số có dấu: +0,05 / −0,20 (dùng dấu trừ chuẩn).
export function fmtSigned(v, digits = 2) {
  if (!ok(v)) return '–';
  const s = nf(digits, digits).format(Math.abs(v));
  if (Math.abs(v) < 0.5 * 10 ** -digits) return nf(digits, digits).format(0);
  return v > 0 ? `+${s}` : `−${s}`;
}

export function fmtDate(value) {
  if (!value) return '–';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '–';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function fmtDateTime(value) {
  if (!value) return '–';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '–';
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${fmtDate(d)} ${hh}:${mi}`;
}

// Đọc số kiểu Việt Nam hoặc kiểu quốc tế: "3,72" → 3.72; "1.234" → 1234; "1.234,5" → 1234.5.
export function parseViNumber(text) {
  if (text === null || text === undefined) return null;
  let s = String(text).trim().replace(/\s+/g, '').replace(/−/g, '-');
  if (!s) return null;
  if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^[-+]?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  else if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
