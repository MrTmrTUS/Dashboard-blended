// Mô hình nguy cơ cấp sinh viên (mục 4.5): hồi quy logistic dự báo kết quả học tập thấp
// từ điểm gắn kết và điểm quá trình; AUC qua kiểm định chéo 10 lần; ngưỡng theo chỉ số Youden.
import { auc, mean, rocCurve, sd, youden } from './stats.js';

const sigmoid = (t) => (t >= 0 ? 1 / (1 + Math.exp(-t)) : Math.exp(t) / (1 + Math.exp(t)));

// Giải hệ tuyến tính A·x = b (khử Gauss có chọn trụ).
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c];
    if (Math.abs(piv) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / piv;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// Ước lượng bằng IRLS (Newton–Raphson) trên biến đã chuẩn hóa, có phạt L2 nhỏ để ổn định.
export function fitLogistic(X, y, { l2 = 1e-3, maxIter = 60, tol = 1e-9 } = {}) {
  const p = X[0]?.length ?? 0;
  const mu = [];
  const sigma = [];
  for (let j = 0; j < p; j++) {
    const col = X.map((r) => r[j]);
    mu.push(mean(col));
    sigma.push(sd(col) || 1);
  }
  const Z = X.map((r) => [1, ...r.map((v, j) => (v - mu[j]) / sigma[j])]);
  let beta = new Array(p + 1).fill(0);
  for (let it = 0; it < maxIter; it++) {
    const H = Array.from({ length: p + 1 }, () => new Array(p + 1).fill(0));
    const g = new Array(p + 1).fill(0);
    for (let i = 0; i < Z.length; i++) {
      const zi = Z[i];
      let eta = 0;
      for (let j = 0; j <= p; j++) eta += beta[j] * zi[j];
      const pi = sigmoid(eta);
      const w = Math.max(pi * (1 - pi), 1e-9);
      const r = y[i] - pi;
      for (let j = 0; j <= p; j++) {
        g[j] += zi[j] * r;
        for (let k = 0; k <= p; k++) H[j][k] += w * zi[j] * zi[k];
      }
    }
    for (let j = 1; j <= p; j++) {
      g[j] -= l2 * beta[j];
      H[j][j] += l2;
    }
    const step = solve(H, g);
    if (!step) break;
    let maxStep = 0;
    beta = beta.map((b, j) => {
      maxStep = Math.max(maxStep, Math.abs(step[j]));
      return b + step[j];
    });
    if (maxStep < tol) break;
  }
  // Đổi hệ số về thang gốc để dễ diễn giải.
  const coefRaw = beta.slice(1).map((b, j) => b / sigma[j]);
  const interceptRaw = beta[0] - coefRaw.reduce((s, c, j) => s + c * mu[j], 0);
  return { beta, mu, sigma, intercept: interceptRaw, coef: coefRaw };
}

export function predictProba(model, x) {
  let eta = model.intercept;
  for (let j = 0; j < x.length; j++) eta += model.coef[j] * x[j];
  return sigmoid(eta);
}

// Chia k phần có phân tầng theo nhãn (giữ tỷ lệ kết quả thấp trong mỗi phần).
export function stratifiedFolds(y, k, rng) {
  const pos = [];
  const neg = [];
  y.forEach((v, i) => (v ? pos : neg).push(i));
  const order = [...rng.shuffle(pos), ...rng.shuffle(neg)];
  const folds = Array.from({ length: k }, () => []);
  order.forEach((idx, i) => folds[i % k].push(idx));
  return folds;
}

export function crossValidate(X, y, { k = 10, rng, l2 } = {}) {
  const folds = stratifiedFolds(y, k, rng);
  const oof = new Array(y.length).fill(null);
  const foldAuc = [];
  for (const test of folds) {
    if (!test.length) continue;
    const testSet = new Set(test);
    const trX = [];
    const trY = [];
    for (let i = 0; i < y.length; i++) {
      if (!testSet.has(i)) {
        trX.push(X[i]);
        trY.push(y[i]);
      }
    }
    const model = fitLogistic(trX, trY, { l2 });
    const scores = test.map((i) => predictProba(model, X[i]));
    test.forEach((i, j) => (oof[i] = scores[j]));
    foldAuc.push(auc(scores, test.map((i) => y[i])));
  }
  const points = rocCurve(oof, y);
  return { oof, foldAuc, auc: auc(oof, y), roc: points, youden: youden(points) };
}

// Bảng nhầm lẫn tại một ngưỡng xác suất.
export function confusion(scores, labels, thr) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  scores.forEach((s, i) => {
    if (s === null || s === undefined) return;
    const pred = s >= thr;
    if (pred && labels[i]) tp++;
    else if (pred && !labels[i]) fp++;
    else if (!pred && labels[i]) fn++;
    else tn++;
  });
  return {
    tp, fp, tn, fn,
    sensitivity: tp + fn ? tp / (tp + fn) : null,
    specificity: tn + fp ? tn / (tn + fp) : null,
    ppv: tp + fp ? tp / (tp + fp) : null,
  };
}
