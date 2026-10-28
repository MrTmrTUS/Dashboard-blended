// Bộ kiểm số (mục 5.2, 5.5): mọi con số trong văn bản AI phải có trong dữ kiện đầu vào,
// mọi ý phải gắn mã nguồn [F1], [F2]…; mã nguồn phải tồn tại.
import { parseViNumber } from './format.js';

// Các mã không phải là số liệu: mã phương diện, chỉ báo, biện pháp, dữ kiện, mức σ.
const CODE_PATTERNS = [
  /\[F\d+\]/g,
  /\bBP-[A-Z]{2}\d-\d{2}\b/g,
  /\bQ_[A-Za-z]+\d?_\d+\b/g,
  /\b(?:CT|IN|PS|PT)\d\b/g,
  /\b(?:EB|EE|EC)\d?\b/g,
  /\bTC\d\b/g,
  /\bF\d+\b/g,
  /\b\d\s?σ/g,
  /\b(?:HK|K)\d[\d–-]*\b/g,
  /\b\d{4}\s?[–-]\s?\d{4}\b/g,
  /\bN\d{2}\b/g,
  /\b[A-Z]{2,4}\d{3}\b/g,
];

const NUMBER_RE = /\d+(?:[.,]\d+)*/g;

function stripCodes(text) {
  let s = text;
  for (const re of CODE_PATTERNS) s = s.replace(re, ' ');
  return s;
}

export function extractNumbers(text) {
  const out = [];
  const s = stripCodes(String(text || ''));
  for (const m of s.matchAll(NUMBER_RE)) {
    const v = parseViNumber(m[0]);
    if (v !== null) out.push({ raw: m[0], value: v });
  }
  return out;
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+(?=\S)/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

// facts: [{ ma: 'F1', noi_dung: '…' }]; extraAllowed: các hằng số được phép (mục tiêu, ngưỡng).
export function checkText(text, facts, { extraAllowed = [], requireCitations = true, tolerance = 0.006 } = {}) {
  const codes = new Set(facts.map((f) => f.ma));
  const allowed = new Set(extraAllowed.map((v) => Number(v)));
  for (const f of facts) for (const n of extractNumbers(f.noi_dung)) allowed.add(n.value);
  const allowedList = [...allowed];

  const unknownNumbers = [];
  for (const n of extractNumbers(text)) {
    const hit = allowedList.some((a) => Math.abs(a - n.value) <= tolerance);
    if (!hit) unknownNumbers.push(n.raw);
  }

  const citations = [...String(text || '').matchAll(/\[(F\d+)\]/g)].map((m) => m[1]);
  const badCodes = [...new Set(citations.filter((c) => !codes.has(c)))];

  const uncited = requireCitations
    ? splitSentences(text).filter((s) => !/\[F\d+\]/.test(s) && /[\p{L}]/u.test(s))
    : [];

  return {
    ok: unknownNumbers.length === 0 && badCodes.length === 0 && uncited.length === 0,
    unknownNumbers,
    badCodes,
    uncited,
    citations: [...new Set(citations)],
  };
}
