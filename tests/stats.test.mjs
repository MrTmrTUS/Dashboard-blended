import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auc, cohenKappa, mean, normalCdf, rocCurve, sd, summarize, wilson, youden } from '../web/js/core/stats.js';
import { close } from './helpers.mjs';

test('trung bình, độ lệch chuẩn mẫu, bỏ qua giá trị trống', () => {
  assert.equal(mean([2, 4, 4, 4, 5, 5, 7, 9]), 5);
  assert.ok(close(sd([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7)));
  assert.deepEqual(summarize([1, null, 3, undefined, NaN]), { mean: 2, sd: Math.SQRT2, n: 2 });
  assert.equal(sd([5]), null);
});

test('AUC theo Mann–Whitney, kể cả điểm trùng', () => {
  assert.equal(auc([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1]), 0.75);
  assert.equal(auc([0.5, 0.5], [1, 0]), 0.5);
  assert.equal(auc([1, 2, 3], [1, 1, 1]), null);
});

test('đường ROC và ngưỡng Youden', () => {
  const pts = rocCurve([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1]);
  assert.deepEqual(pts.map((p) => [p.fpr, p.tpr]), [[0, 0], [0, 0.5], [0.5, 0.5], [0.5, 1], [1, 1]]);
  const best = youden(pts);
  assert.equal(best.j, 0.5);
});

test('khoảng tin cậy Wilson, kappa, hàm phân phối chuẩn', () => {
  const w = wilson(5, 100);
  assert.ok(close(w.lo, 0.02154, 1e-4) && close(w.hi, 0.11175, 1e-4));
  assert.equal(cohenKappa([1, 1, 0, 0], [1, 0, 0, 0]), 0.5);
  assert.ok(close(normalCdf(1.96), 0.975, 1e-4));
  assert.ok(close(normalCdf(-3), 0.00135, 1e-4));
});
