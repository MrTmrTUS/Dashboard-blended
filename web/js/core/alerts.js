// Quy tắc cảnh báo (mục 4.5) – giá trị khởi đầu, hiệu chỉnh bằng mô phỏng Monte Carlo (công việc 3.3).
import { DIMENSIONS, OUTCOMES, metricLabel } from './constants.js';
import { fmtScore, fmtSigned } from './format.js';
import { isNum } from './stats.js';

const RANK = { na: 0, ok: 1, warn: 2, alert: 3 };

export function worstStatus(list) {
  let best = 'ok';
  for (const s of list) if (RANK[s] > RANK[best]) best = s;
  return best;
}

// Kiểm tra "giảm liên tiếp qua K đợt": K giá trị gần nhất (đủ dữ liệu) giảm ngặt từng đợt
// và tổng mức giảm ≥ ngưỡng tối thiểu (tham số đề xuất của MVP để kiểm soát báo động giả).
export function isConsecutiveDecline(series, k, minTotal = 0) {
  if (!Array.isArray(series) || series.length < k || k < 2) return false;
  const last = series.slice(-k);
  if (last.some((v) => !isNum(v))) return false;
  for (let i = 1; i < last.length; i++) if (!(last[i] < last[i - 1])) return false;
  return last[0] - last[last.length - 1] >= minTotal - 1e-12;
}

// Cảnh báo cấp lớp, tính trên 7 phương diện (PT1, PT2 chỉ hiển thị, trừ khi bật trong cấu hình).
// input: { n, means: {CT1: x̄, …}, z: {CT1: z, …}, history: [giá trị chỉ số theo đợt, cũ → mới] }
export function classAlert(input, cfg) {
  if (!input || !isNum(input.n) || input.n < cfg.nMin) {
    return { status: 'na', reasons: [] };
  }
  const codes = cfg.ptAlerts ? [...DIMENSIONS, ...OUTCOMES] : DIMENSIONS;
  const reasons = [];
  for (const code of codes) {
    const x = input.means?.[code];
    const z = input.z?.[code];
    if (!isNum(x)) continue;
    const label = metricLabel(code);
    if (x < cfg.redDim) {
      reasons.push({ level: 'alert', code, rule: 'below', value: x, threshold: cfg.redDim,
        text: `${label} ${fmtScore(x)} < ${fmtScore(cfg.redDim, 1)}` });
    } else if (x < cfg.yellowDim) {
      reasons.push({ level: 'warn', code, rule: 'below', value: x, threshold: cfg.yellowDim,
        text: `${label} ${fmtScore(x)} < ${fmtScore(cfg.yellowDim, 1)}` });
    }
    if (isNum(z)) {
      if (z < -cfg.zRed) {
        reasons.push({ level: 'alert', code, rule: 'funnel', value: z, threshold: -cfg.zRed,
          text: `${code} thấp hơn giới hạn ${cfg.zRed}σ của biểu đồ phễu (z = ${fmtSigned(z)})` });
      } else if (z < -cfg.zYellow) {
        reasons.push({ level: 'warn', code, rule: 'funnel', value: z, threshold: -cfg.zYellow,
          text: `${code} thấp hơn giới hạn ${cfg.zYellow}σ của biểu đồ phễu (z = ${fmtSigned(z)})` });
      }
    }
  }
  if (cfg.declineEnabled !== false && isConsecutiveDecline(input.history, cfg.declineWaves, cfg.declineMin)) {
    const last = input.history.slice(-cfg.declineWaves);
    reasons.push({ level: 'alert', code: cfg.declineMetric || 'IDX', rule: 'decline', value: last[last.length - 1] - last[0],
      text: `${metricLabel(cfg.declineMetric || 'IDX')} giảm liên tiếp qua ${cfg.declineWaves} đợt (${last.map((v) => fmtScore(v)).join(' → ')})` });
  }
  // nặng trước; cùng mức thì phương diện có điểm thấp hơn đứng trước
  const meanOf = (r) => (r.rule === 'decline' ? -Infinity : input.means?.[r.code] ?? 9);
  reasons.sort((a, b) => RANK[b.level] - RANK[a.level] || meanOf(a) - meanOf(b) || (a.rule === 'below' ? -1 : 1));
  return { status: reasons.length ? worstStatus(reasons.map((r) => r.level)) : 'ok', reasons };
}

// Cảnh báo cấp sinh viên: điểm gắn kết (thang 1 – 5) và điểm quá trình (thang 10).
export function studentAlert({ eng, process }, cfg) {
  if (!isNum(eng) && !isNum(process)) return { status: 'na', reasons: [] };
  const reasons = [];
  if (isNum(eng)) {
    if (eng < cfg.stuEngRed) reasons.push({ level: 'alert', rule: 'eng', text: `Gắn kết ${fmtScore(eng)} < ${fmtScore(cfg.stuEngRed, 1)}` });
    else if (eng < cfg.stuEngYellow) reasons.push({ level: 'warn', rule: 'eng', text: `Gắn kết ${fmtScore(eng)} < ${fmtScore(cfg.stuEngYellow, 1)}` });
  }
  if (isNum(process)) {
    if (process < cfg.stuProcRed) reasons.push({ level: 'alert', rule: 'process', text: `Điểm quá trình ${fmtScore(process, 1)} < ${fmtScore(cfg.stuProcRed, 1)}` });
    else if (process < cfg.stuProcYellow) reasons.push({ level: 'warn', rule: 'process', text: `Điểm quá trình ${fmtScore(process, 1)} < ${fmtScore(cfg.stuProcYellow, 1)}` });
  }
  reasons.sort((a, b) => RANK[b.level] - RANK[a.level]);
  return { status: reasons.length ? worstStatus(reasons.map((r) => r.level)) : 'ok', reasons };
}
