// Pareto có trọng số và ma trận tầm quan trọng – mức đạt (mục 4.4).
import { DIMENSIONS } from './constants.js';
import { isNum } from './stats.js';

// Khoảng cách có trọng số gₖ = max(0, T − x̄ₖ) × wₖ.
// Trả về danh sách đã sắp giảm dần, kèm tỷ trọng và tỷ trọng cộng dồn (0 – 1).
export function weightedGaps(dimMeans, weights, target) {
  const rows = DIMENSIONS.map((code) => {
    const mean = dimMeans[code];
    const w = weights[code] ?? 1 / DIMENSIONS.length;
    const gap = isNum(mean) ? Math.max(0, target - mean) * w : null;
    return { code, mean, w, gap };
  }).filter((r) => isNum(r.gap));
  rows.sort((a, b) => b.gap - a.gap || a.code.localeCompare(b.code));
  const total = rows.reduce((s, r) => s + r.gap, 0);
  let cum = 0;
  for (const r of rows) {
    r.share = total > 0 ? r.gap / total : 0;
    cum += r.gap;
    r.cumShare = total > 0 ? cum / total : 0;
  }
  return { rows, total };
}

// Bốn vùng của ma trận: trục x = wₖ (tầm quan trọng), trục y = x̄ₖ (mức đạt).
// Đường cắt x = 1/7, y = 3,5.
export const QUADRANTS = {
  improve: { code: 'improve', label: 'Ưu tiên cải tiến', hint: 'Quan trọng nhưng mức đạt thấp' },
  maintain: { code: 'maintain', label: 'Duy trì', hint: 'Quan trọng và đạt tốt' },
  monitor: { code: 'monitor', label: 'Theo dõi', hint: 'Ít quan trọng hơn, mức đạt thấp' },
  enough: { code: 'enough', label: 'Không cần đầu tư thêm', hint: 'Ít quan trọng hơn, đạt tốt' },
};

export function quadrant(w, mean, xCut = 1 / 7, yCut = 3.5) {
  const important = w > xCut + 1e-12;
  const good = mean >= yCut;
  if (important) return good ? 'maintain' : 'improve';
  return good ? 'enough' : 'monitor';
}
