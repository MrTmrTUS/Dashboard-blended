// Tiện ích dựng phiếu mẫu cho kiểm thử.
import { ALL_ITEM_CODES, FACTOR_ITEM_INDEX, ENG_ITEM_INDEX } from '../web/js/core/constants.js';
import { DEFAULT_CONFIG } from '../web/js/core/config.js';

export const cfg = { ...DEFAULT_CONFIG };
export const PASS_ATT = cfg.attentionChecks.map((c) => c.expect);

// items: { CT1: [4,5,0,3], …, ENG: [...] } – 0 = bỏ trống
export function makeResponse(items, { att = PASS_ATT, id = 'P1', classId = 'A', waveId = 'W1', researchCode = 'NC-001', consent = true, comment = '' } = {}) {
  const v = new Uint8Array(ALL_ITEM_CODES.length);
  for (const [factor, values] of Object.entries(items)) {
    const idx = factor === 'ENG' ? ENG_ITEM_INDEX : FACTOR_ITEM_INDEX[factor];
    values.forEach((x, i) => (v[idx[i]] = x));
  }
  return { id, classId, waveId, researchCode, v, att, consent, comment, time: '2026-10-16T08:00:00.000Z' };
}

// Phiếu có mọi chỉ báo tiêu chí = b (riêng Q_Pt2_5 = b ± 1 để SD > 0), gắn kết = e.
export function uniformResponse(b, opts = {}) {
  const items = {};
  for (const [factor, idx] of Object.entries(FACTOR_ITEM_INDEX)) items[factor] = idx.map(() => b);
  items.PT2 = [...items.PT2];
  items.PT2[items.PT2.length - 1] = b > 1 ? b - 1 : b + 1;
  items.ENG = ENG_ITEM_INDEX.map(() => opts.eng ?? 3);
  return makeResponse(items, opts);
}

export const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
