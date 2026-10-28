// Đọc / ghi CSV theo RFC 4180; tự nhận dấu phân cách ',' hoặc ';' (Excel bản địa Việt Nam dùng ';').

export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ) {
      if (ch === ',') commas++;
      else if (ch === ';') semis++;
      else if (ch === '\t') tabs++;
    }
  }
  if (tabs > commas && tabs > semis) return '\t';
  return semis > commas ? ';' : ',';
}

// Trả về { header, rows (mảng đối tượng), lines (số dòng trong tệp của từng bản ghi), delimiter }.
export function parseCsv(input, { delimiter } = {}) {
  let text = String(input ?? '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delim = delimiter || detectDelimiter(text);
  const records = [];
  const lines = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delim) {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      field = '';
      if (!(record.length === 1 && record[0] === '')) {
        records.push(record);
        lines.push(recordLine);
      }
      record = [];
      line++;
      recordLine = line;
    } else field += ch;
  }
  if (field !== '' || record.length) {
    record.push(field);
    if (!(record.length === 1 && record[0] === '')) {
      records.push(record);
      lines.push(recordLine);
    }
  }
  if (!records.length) return { header: [], rows: [], lines: [], delimiter: delim };
  const header = records[0].map((h) => h.trim());
  const rows = records.slice(1).map((rec) => {
    const obj = {};
    header.forEach((h, j) => (obj[h] = (rec[j] ?? '').trim()));
    obj.__extra = rec.length > header.length ? rec.slice(header.length) : null;
    return obj;
  });
  return { header, rows, lines: lines.slice(1), delimiter: delim };
}

function escapeField(v, delim) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /["\r\n]/.test(s) || s.includes(delim) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns, rows, { delimiter = ',', bom = true } = {}) {
  const out = [columns.map((c) => escapeField(c, delimiter)).join(delimiter)];
  for (const row of rows) {
    out.push(columns.map((c) => escapeField(Array.isArray(row) ? row[columns.indexOf(c)] : row[c], delimiter)).join(delimiter));
  }
  return (bom ? '﻿' : '') + out.join('\r\n') + '\r\n';
}
