// Mục 4.3 – 4.5: biểu đồ phễu, Pareto có trọng số, ma trận ưu tiên, quy tắc cảnh báo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classAlert, isConsecutiveDecline, studentAlert } from '../web/js/core/alerts.js';
import { DIMENSIONS } from '../web/js/core/constants.js';
import { funnelLimit, zScore } from '../web/js/core/funnel.js';
import { quadrant, weightedGaps } from '../web/js/core/priority.js';
import { cfg, close } from './helpers.mjs';

test('giới hạn phễu μ ± z·σ/√n và z của lớp', () => {
  // μ = 3,8; σ = 0,6; n = 25 → σ/√n = 0,12
  assert.ok(close(funnelLimit(3.8, 0.6, 25, -2), 3.56));
  assert.ok(close(funnelLimit(3.8, 0.6, 25, -3), 3.44));
  assert.ok(close(funnelLimit(3.8, 0.6, 25, 3), 4.16));
  assert.ok(close(zScore(3.5, 25, 3.8, 0.6), -2.5));
  assert.equal(zScore(null, 25, 3.8, 0.6), null);
});

test('Pareto có trọng số: gₖ = max(0, T − x̄ₖ) × wₖ, sắp giảm dần, cộng dồn', () => {
  const means = { CT1: 4.1, IN2: 3.9, PS1: 3.6, PS2: 3.8, CT2: 3.5, IN1: 3.7, IN3: 4.0 };
  const w = Object.fromEntries(DIMENSIONS.map((d) => [d, 1 / 7]));
  const { rows, total } = weightedGaps(means, w, 4.0);
  assert.deepEqual(rows.map((r) => r.code), ['CT2', 'PS1', 'IN1', 'PS2', 'IN2', 'CT1', 'IN3']);
  assert.ok(close(total, 1.5 / 7));
  assert.ok(close(rows[0].share, 1 / 3));
  assert.ok(close(rows[2].cumShare, 0.8), 'ba phương diện đầu chiếm 80% khoảng cách');
  assert.equal(rows[5].gap, 0);

  // trọng số Nội dung 2 đổi thứ tự ưu tiên
  const w2 = { ...w, PS1: 0.3, CT2: 0.05 };
  assert.equal(weightedGaps(means, w2, 4.0).rows[0].code, 'PS1');
});

test('ma trận tầm quan trọng – mức đạt: 4 vùng, cắt tại 1/7 và 3,5', () => {
  assert.equal(quadrant(0.2, 3.4), 'improve');
  assert.equal(quadrant(0.2, 3.6), 'maintain');
  assert.equal(quadrant(0.1, 3.4), 'monitor');
  assert.equal(quadrant(0.1, 3.5), 'enough');
  assert.equal(quadrant(1 / 7, 3.4), 'monitor', 'đúng bằng 1/7 chưa tính là quan trọng hơn');
});

const means = (over = {}) => ({ ...Object.fromEntries(DIMENSIONS.map((d) => [d, 3.8])), ...over });

test('cảnh báo lớp: 🟡 dưới 3,5 hoặc dưới giới hạn 2σ; 🔴 dưới 2,5, dưới 3σ hoặc giảm liên tiếp', () => {
  assert.equal(classAlert({ n: 20, means: means(), z: {}, history: [] }, cfg).status, 'ok');
  const y1 = classAlert({ n: 20, means: means({ IN1: 3.3 }), z: {}, history: [] }, cfg);
  assert.equal(y1.status, 'warn');
  assert.equal(y1.reasons[0].code, 'IN1');
  assert.equal(classAlert({ n: 20, means: means(), z: { PS2: -2.2 }, history: [] }, cfg).status, 'warn');
  assert.equal(classAlert({ n: 20, means: means({ PS1: 2.4 }), z: {}, history: [] }, cfg).status, 'alert');
  assert.equal(classAlert({ n: 20, means: means(), z: { CT2: -3.1 }, history: [] }, cfg).status, 'alert');
  assert.equal(classAlert({ n: 20, means: means(), z: {}, history: [3.9, 3.7, 3.5] }, cfg).status, 'alert');
  assert.equal(classAlert({ n: 20, means: means(), z: {}, history: [3.9, 3.8, 3.7] }, cfg).status, 'ok', 'tổng mức giảm 0,2 < 0,3');
  assert.equal(classAlert({ n: 9, means: means({ PS1: 2 }), z: {}, history: [] }, cfg).status, 'na', 'dưới 10 phiếu: chưa đủ dữ liệu');
  // PT1, PT2 chỉ hiển thị, trừ khi bật cấu hình
  assert.equal(classAlert({ n: 20, means: means({ PT1: 2.0 }), z: {}, history: [] }, cfg).status, 'ok');
  assert.equal(classAlert({ n: 20, means: means({ PT1: 2.0 }), z: {}, history: [] }, { ...cfg, ptAlerts: true }).status, 'alert');
});

test('giảm liên tiếp qua K đợt', () => {
  assert.equal(isConsecutiveDecline([4.0, 3.8, 3.6], 3, 0.3), true);
  assert.equal(isConsecutiveDecline([4.0, 4.1, 3.6], 3, 0.3), false);
  assert.equal(isConsecutiveDecline([4.0, null, 3.6], 3, 0), false);
  assert.equal(isConsecutiveDecline([3.6, 3.5], 3, 0), false);
  assert.equal(isConsecutiveDecline([5, 4.0, 3.9, 3.8], 3, 0), true, 'chỉ xét K đợt gần nhất');
});

test('cảnh báo sinh viên: gắn kết và điểm quá trình', () => {
  assert.equal(studentAlert({ eng: 3.2, process: 6.0 }, cfg).status, 'ok');
  assert.equal(studentAlert({ eng: 2.8, process: 6.0 }, cfg).status, 'warn');
  assert.equal(studentAlert({ eng: 3.2, process: 5.0 }, cfg).status, 'warn');
  assert.equal(studentAlert({ eng: 2.4, process: 6.0 }, cfg).status, 'alert');
  assert.equal(studentAlert({ eng: 3.2, process: 3.9 }, cfg).status, 'alert');
  assert.equal(studentAlert({ eng: null, process: null }, cfg).status, 'na');
});
