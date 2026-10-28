// Biểu đồ phễu (mục 4.3).
// μ, σ: trung bình và độ lệch chuẩn điểm cá nhân toàn Trường, tính riêng cho từng chỉ số, từng đợt.
// Giới hạn cho lớp j có nⱼ phiếu: μ ± z·σ/√nⱼ; độ lệch chuẩn hóa zⱼ = (x̄ⱼ − μ) / (σ/√nⱼ).
import { isNum, mean, sd } from './stats.js';

export function funnelParams(individualScores) {
  return { mu: mean(individualScores), sigma: sd(individualScores) };
}

export function funnelLimit(mu, sigma, n, z) {
  return mu + (z * sigma) / Math.sqrt(n);
}

export function zScore(classMean, n, mu, sigma) {
  if (!isNum(classMean) || !isNum(mu) || !isNum(sigma) || !sigma || !n) return null;
  return (classMean - mu) / (sigma / Math.sqrt(n));
}

// Các đường giới hạn để vẽ: z = ±2 (cảnh báo) và z = ±3 (kiểm soát), theo n liên tục.
export function funnelCurves(mu, sigma, nFrom, nTo, zs = [2, 3], steps = 60) {
  const lo = Math.max(2, Math.floor(nFrom));
  const hi = Math.max(lo + 1, Math.ceil(nTo));
  const ns = [];
  for (let k = 0; k <= steps; k++) {
    // lấy mẫu dày ở vùng n nhỏ, nơi đường cong thay đổi nhanh
    const t = k / steps;
    ns.push(lo + (hi - lo) * t * t);
  }
  const curves = {};
  for (const z of zs) {
    curves[`+${z}`] = ns.map((n) => [n, funnelLimit(mu, sigma, n, z)]);
    curves[`-${z}`] = ns.map((n) => [n, funnelLimit(mu, sigma, n, -z)]);
  }
  return { ns, curves };
}
