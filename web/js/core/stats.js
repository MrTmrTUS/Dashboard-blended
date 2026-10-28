// Hàm thống kê cơ bản dùng cho bộ tính toán. Các hàm bỏ qua giá trị null/undefined/NaN.

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function values(arr) {
  const out = [];
  for (const v of arr) if (isNum(v)) out.push(v);
  return out;
}

export function sum(arr) {
  let s = 0;
  for (const v of arr) if (isNum(v)) s += v;
  return s;
}

export function mean(arr) {
  let s = 0;
  let n = 0;
  for (const v of arr) {
    if (isNum(v)) {
      s += v;
      n++;
    }
  }
  return n ? s / n : null;
}

// Độ lệch chuẩn mẫu (chia n − 1).
export function sd(arr) {
  const xs = values(arr);
  const n = xs.length;
  if (n < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / n;
  let ss = 0;
  for (const v of xs) ss += (v - m) ** 2;
  return Math.sqrt(ss / (n - 1));
}

// Tóm tắt {mean, sd, n} – dạng lưu chuẩn của mọi điểm lớp, khoa, Trường (mục 4.2).
export function summarize(arr) {
  const xs = values(arr);
  return { mean: xs.length ? mean(xs) : null, sd: sd(xs), n: xs.length };
}

export function quantile(arr, q) {
  const xs = values(arr).sort((a, b) => a - b);
  if (!xs.length) return null;
  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

export const round = (v, d = 2) => (isNum(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Hàm phân phối chuẩn (xấp xỉ Abramowitz–Stegun 7.1.26, sai số < 1,5e-7).
export function normalCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

// Khoảng tin cậy Wilson cho một tỷ lệ.
export function wilson(k, n, z = 1.96) {
  if (!n) return { p: null, lo: null, hi: null };
  const p = k / n;
  const den = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

// AUC theo thống kê Mann–Whitney (xử lý điểm trùng bằng hạng trung bình).
export function auc(scores, labels) {
  const pairs = scores.map((s, i) => [s, labels[i] ? 1 : 0]).filter(([s]) => isNum(s));
  const nPos = pairs.filter((p) => p[1] === 1).length;
  const nNeg = pairs.length - nPos;
  if (!nPos || !nNeg) return null;
  pairs.sort((a, b) => a[0] - b[0]);
  let rankSumPos = 0;
  let i = 0;
  while (i < pairs.length) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1][0] === pairs[i][0]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (pairs[k][1] === 1) rankSumPos += avgRank;
    i = j + 1;
  }
  return (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

// Đường ROC: điểm càng cao càng nguy cơ. Trả về các điểm từ (0,0) đến (1,1).
export function rocCurve(scores, labels) {
  const pairs = scores
    .map((s, i) => [s, labels[i] ? 1 : 0])
    .filter(([s]) => isNum(s))
    .sort((a, b) => b[0] - a[0]);
  const nPos = pairs.filter((p) => p[1] === 1).length;
  const nNeg = pairs.length - nPos;
  const points = [{ fpr: 0, tpr: 0, threshold: Infinity }];
  if (!nPos || !nNeg) return points;
  let tp = 0;
  let fp = 0;
  let i = 0;
  while (i < pairs.length) {
    const thr = pairs[i][0];
    while (i < pairs.length && pairs[i][0] === thr) {
      if (pairs[i][1]) tp++;
      else fp++;
      i++;
    }
    points.push({ fpr: fp / nNeg, tpr: tp / nPos, threshold: thr });
  }
  return points;
}

// Ngưỡng theo chỉ số Youden J = độ nhạy + độ đặc hiệu − 1.
export function youden(points) {
  let best = null;
  for (const p of points) {
    if (!Number.isFinite(p.threshold)) continue;
    const j = p.tpr - p.fpr;
    if (!best || j > best.j) best = { ...p, j };
  }
  return best;
}

// Hệ số Cohen's kappa cho hai người chấm trên cùng tập nhãn.
export function cohenKappa(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return null;
  const cats = [...new Set([...a.slice(0, n), ...b.slice(0, n)])];
  let agree = 0;
  for (let i = 0; i < n; i++) if (a[i] === b[i]) agree++;
  const po = agree / n;
  let pe = 0;
  for (const c of cats) {
    const pa = a.slice(0, n).filter((x) => x === c).length / n;
    const pb = b.slice(0, n).filter((x) => x === c).length / n;
    pe += pa * pb;
  }
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}
