// Mô hình logistic + kiểm định chéo (TC1) và Monte Carlo báo động giả (TC2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confusion, crossValidate, fitLogistic, predictProba } from '../web/js/core/logistic.js';
import { simulateFalseAlarms } from '../web/js/core/montecarlo.js';
import { createRng } from '../web/js/core/rng.js';
import { DIMENSIONS } from '../web/js/core/constants.js';
import { cfg } from './helpers.mjs';

function simulatedStudents(n, seed) {
  const rng = createRng(seed);
  const X = [];
  const y = [];
  for (let i = 0; i < n; i++) {
    const eng = rng.normal(3.5, 0.5);
    const proc = rng.normal(6.5, 1.5);
    const eta = 4 - 0.8 * (eng - 3.5) * 2 - 1.1 * (proc - 6.5) - 5.5;
    const p = 1 / (1 + Math.exp(-eta));
    X.push([eng, proc]);
    y.push(rng.random() < p ? 1 : 0);
  }
  return { X, y };
}

test('hồi quy logistic khôi phục đúng chiều tác động', () => {
  const { X, y } = simulatedStudents(1500, 'logit');
  const m = fitLogistic(X, y);
  assert.ok(m.coef[0] < 0, 'gắn kết cao → nguy cơ thấp');
  assert.ok(m.coef[1] < 0, 'điểm quá trình cao → nguy cơ thấp');
  assert.ok(predictProba(m, [2.5, 4]) > predictProba(m, [4.2, 8]));
});

test('kiểm định chéo 10 lần cho AUC ổn định và ngưỡng Youden hợp lệ', () => {
  const { X, y } = simulatedStudents(1200, 'cv');
  const cv = crossValidate(X, y, { k: 10, rng: createRng('folds') });
  assert.equal(cv.foldAuc.length, 10);
  assert.ok(cv.auc > 0.75 && cv.auc <= 1);
  assert.ok(cv.youden.threshold > 0 && cv.youden.threshold < 1);
  const c = confusion(cv.oof, y, cv.youden.threshold);
  assert.equal(c.tp + c.fp + c.tn + c.fn, y.length);
});

test('Monte Carlo: lớp không khác biệt hiếm khi bị cảnh báo đỏ khi có ngưỡng giảm tối thiểu', () => {
  const rng = createRng('pool');
  const pool = [];
  for (let i = 0; i < 800; i++) {
    const g = rng.normal(0, 0.45);
    const row = {};
    for (const d of DIMENSIONS) row[d] = Math.min(5, Math.max(1, 3.8 + g + rng.normal(0, 0.4)));
    row.IDX = DIMENSIONS.reduce((s, d) => s + row[d], 0) / DIMENSIONS.length;
    pool.push(row);
  }
  const sizes = [12, 15, 18, 20, 22, 25, 28, 30, 35];
  const strict = simulateFalseAlarms({ pool, sizes, cfg: { ...cfg, declineMin: 0 }, rng: createRng('mc1'), runs: 3000 });
  const tuned = simulateFalseAlarms({ pool, sizes, cfg, rng: createRng('mc2'), runs: 3000 });
  // giảm ngặt qua 3 đợt độc lập có xác suất 1/6 → báo động giả quá cao nếu không đặt ngưỡng
  assert.ok(strict.redRate > 0.12, `declineMin = 0 → ${strict.redRate}`);
  assert.ok(tuned.redRate < 0.05, `cấu hình mặc định → ${tuned.redRate}`);
  assert.equal(tuned.runs, 3000);
});
