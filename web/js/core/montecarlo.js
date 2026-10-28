// TC2 – mô phỏng Monte Carlo tỷ lệ báo động giả của cảnh báo đỏ cấp lớp (mục 8).
// Giả định "lớp không khác biệt": mọi lớp lấy mẫu từ cùng phân bố điểm cá nhân toàn Trường
// (lấy mẫu lại có hoàn lại từ phiếu thật, giữ nguyên tương quan giữa các phương diện),
// sĩ số lấy theo phân bố số phiếu hợp lệ thực tế của các lớp.
import { classAlert } from './alerts.js';
import { DIMENSIONS } from './constants.js';
import { zScore } from './funnel.js';
import { mean, sd, wilson } from './stats.js';

const SIZE_BUCKETS = [
  { label: '10 – 14', lo: 10, hi: 14 },
  { label: '15 – 19', lo: 15, hi: 19 },
  { label: '20 – 29', lo: 20, hi: 29 },
  { label: '≥ 30', lo: 30, hi: Infinity },
];

export function simulateFalseAlarms({ pool, sizes, cfg, rng, runs = 2000 }) {
  const metrics = [...DIMENSIONS, 'IDX'];
  const params = {};
  for (const m of metrics) {
    const xs = pool.map((r) => r[m]);
    params[m] = { mu: mean(xs), sigma: sd(xs) };
  }
  const eligible = sizes.filter((n) => n >= cfg.nMin);
  const waves = cfg.declineEnabled === false ? 1 : Math.max(1, cfg.declineWaves);
  const counts = { alert: 0, warn: 0, ok: 0 };
  const byRule = { below: 0, funnel: 0, decline: 0 };
  const buckets = SIZE_BUCKETS.map((b) => ({ ...b, runs: 0, alert: 0 }));
  if (!pool.length || !eligible.length) {
    return { runs: 0, counts, byRule, buckets, redRate: null, warnRate: null, ci: wilson(0, 0) };
  }
  for (let r = 0; r < runs; r++) {
    const n = rng.pick(eligible);
    const history = [];
    let lastMeans = null;
    for (let w = 0; w < waves; w++) {
      const sums = Object.fromEntries(metrics.map((m) => [m, 0]));
      for (let i = 0; i < n; i++) {
        const row = pool[Math.floor(rng.random() * pool.length)];
        for (const m of metrics) sums[m] += row[m];
      }
      lastMeans = Object.fromEntries(metrics.map((m) => [m, sums[m] / n]));
      history.push(lastMeans[cfg.declineMetric || 'IDX']);
    }
    const z = Object.fromEntries(DIMENSIONS.map((d) => [d, zScore(lastMeans[d], n, params[d].mu, params[d].sigma)]));
    const res = classAlert({ n, means: lastMeans, z, history }, cfg);
    counts[res.status] = (counts[res.status] || 0) + 1;
    if (res.status === 'alert') {
      const rules = new Set(res.reasons.filter((x) => x.level === 'alert').map((x) => x.rule));
      for (const rule of rules) byRule[rule]++;
    }
    const bucket = buckets.find((b) => n >= b.lo && n <= b.hi);
    if (bucket) {
      bucket.runs++;
      if (res.status === 'alert') bucket.alert++;
    }
  }
  return {
    runs,
    counts,
    byRule,
    buckets,
    redRate: counts.alert / runs,
    warnRate: counts.warn / runs,
    ci: wilson(counts.alert, runs),
    params,
    sizes: eligible,
  };
}
