// Phiếu hợp lệ và cách tính điểm một phiếu (mục 4.2).
import {
  ALL_ITEM_CODES,
  DIMENSIONS,
  ENG_ITEM_INDEX,
  FACTORS,
  FACTOR_ITEM_INDEX,
  ITEM_CODES,
  ORG_DIMS,
  PED_DIMS,
} from './constants.js';

const N_ITEMS = ITEM_CODES.length; // 62

// Số chỉ báo tối thiểu phải trả lời để tính điểm nhân tố: từ 2/3 số chỉ báo.
export const minAnswered = (count, share = 2 / 3) => Math.ceil(count * share - 1e-9);

export function emptyAnswers() {
  return new Uint8Array(ALL_ITEM_CODES.length);
}

// Kiểm tra phiếu hợp lệ theo 3 điều kiện (đề xuất, thống nhất với Nội dung 1):
// 1) đạt câu kiểm tra chú ý; 2) không chọn một mức cho toàn bộ chỉ báo (SD = 0);
// 3) trả lời từ 80% chỉ báo.
export function checkValidity(resp, cfg) {
  const reasons = [];
  const checks = cfg.attentionChecks || [];
  checks.forEach((chk, i) => {
    const got = resp.att?.[i] ?? 0;
    if (got !== chk.expect) reasons.push('attention');
  });
  let answered = 0;
  let first = 0;
  let allSame = true;
  for (let i = 0; i < N_ITEMS; i++) {
    const x = resp.v[i];
    if (!x) continue;
    answered++;
    if (!first) first = x;
    else if (x !== first) allSame = false;
  }
  if (answered > 1 && allSame) reasons.push('straightline');
  if (answered < Math.ceil(N_ITEMS * (cfg.minAnsweredShare ?? 0.8) - 1e-9)) reasons.push('incomplete');
  return {
    valid: reasons.length === 0,
    reasons: [...new Set(reasons)],
    answeredShare: answered / N_ITEMS,
  };
}

export const INVALID_REASON_LABELS = {
  attention: 'Không đạt câu kiểm tra chú ý',
  straightline: 'Chọn một mức cho toàn bộ chỉ báo (SD = 0)',
  incomplete: 'Trả lời dưới 80% chỉ báo',
};

function meanOfIndices(v, indices, share) {
  let s = 0;
  let n = 0;
  for (const i of indices) {
    const x = v[i];
    if (x) {
      s += x;
      n++;
    }
  }
  return n >= minAnswered(indices.length, share) && n > 0 ? s / n : null;
}

function meanOfAll(values) {
  let s = 0;
  for (const x of values) {
    if (x === null || x === undefined) return null;
    s += x;
  }
  return values.length ? s / values.length : null;
}

// Điểm một phiếu: 9 nhân tố, chỉ số chất lượng (trung bình 7 phương diện, trọng số như nhau),
// điểm nhóm lõi sư phạm / điều kiện tổ chức, điểm gắn kết (12 chỉ báo).
// Chỉ số chất lượng và điểm nhóm chỉ tính khi đủ mọi phương diện thành phần (đề xuất MVP).
export function scoreResponse(resp, cfg) {
  const share = cfg.minFactorShare ?? 2 / 3;
  const f = {};
  for (const factor of FACTORS) f[factor.code] = meanOfIndices(resp.v, FACTOR_ITEM_INDEX[factor.code], share);
  const IDX = meanOfAll(DIMENSIONS.map((d) => f[d]));
  const PED = meanOfAll(PED_DIMS.map((d) => f[d]));
  const ORG = meanOfAll(ORG_DIMS.map((d) => f[d]));
  const ENG = meanOfIndices(resp.v, ENG_ITEM_INDEX, share);
  const validity = checkValidity(resp, cfg);
  return { ...f, IDX, PED, ORG, ENG, valid: validity.valid, invalid: validity.reasons };
}

// Phân loại 3 mức: Thấp < 2,5 · Trung bình 2,5 – < 3,5 · Cao ≥ 3,5.
export function level(x, cfg = {}) {
  if (x === null || x === undefined || Number.isNaN(x)) return 'na';
  const low = cfg.levelLow ?? 2.5;
  const high = cfg.levelHigh ?? 3.5;
  if (x < low) return 'low';
  if (x < high) return 'mid';
  return 'high';
}

// Mức trạng thái tương ứng với 3 mức điểm (dùng cho bản đồ nhiệt, histogram).
export const LEVEL_TO_STATUS = { low: 'alert', mid: 'warn', high: 'ok', na: 'na' };

// Điểm trung bình theo từng chỉ báo cho một tập phiếu (dùng cho "5 chỉ báo thấp nhất").
export function itemMeans(responses) {
  const sums = new Float64Array(N_ITEMS);
  const counts = new Uint32Array(N_ITEMS);
  for (const r of responses) {
    for (let i = 0; i < N_ITEMS; i++) {
      const x = r.v[i];
      if (x) {
        sums[i] += x;
        counts[i]++;
      }
    }
  }
  return ITEM_CODES.map((code, i) => ({
    code,
    mean: counts[i] ? sums[i] / counts[i] : null,
    n: counts[i],
  }));
}
