// Xóa thông tin nhận diện trong ý kiến tự do (mục 4.6, 5.6): tên người, số điện thoại, mã số, email.

const NAME_WORD = '\\p{Lu}[\\p{Ll}\\p{M}]*';
const NAME = `${NAME_WORD}(?:\\s+${NAME_WORD}){0,3}`;
// Từ dẫn trước tên người. Chỉ "thầy, cô, em, tôi, mình" được viết hoa (đầu câu);
// "bạn, anh, chị" chỉ nhận chữ thường để tránh nhầm với "Tiếng Anh", "Anh văn".
const LEAD = '(?:[Ee]m|[Tt]ôi|[Mm]ình)\\s+(?:là|tên\\s+là|tên)|[Tt]ên\\s+(?:em|tôi|mình)\\s+là|[Tt]hầy|[Cc]ô|bạn|anh|chị';

const RULES = [
  { kind: 'email', re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu, mask: '[email]' },
  { kind: 'phone', re: /(?<![\d\p{L}])(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)/gu, mask: '[số điện thoại]' },
  { kind: 'id', re: /(?:\b(?:MSSV|MSV|mã số|mã sinh viên)\s*:?\s*)?(?<![\d\p{L}])\d{8,12}(?!\d)/giu, mask: '[mã số]' },
  {
    kind: 'name',
    re: new RegExp(`(?<![\\p{L}])(${LEAD})\\s+(${NAME})`, 'gu'),
    mask: (m, lead) => `${lead} [tên]`,
  },
];

export function redact(text) {
  if (!text) return { text: '', found: [] };
  let out = String(text);
  const found = [];
  for (const rule of RULES) {
    out = out.replace(rule.re, (...args) => {
      found.push(rule.kind);
      return typeof rule.mask === 'function' ? rule.mask(...args) : rule.mask;
    });
  }
  return { text: out, found };
}

export const containsPii = (text) => redact(text).found.length > 0;
