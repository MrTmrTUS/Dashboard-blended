// Giữ ổn định "kịch bản" của bộ dữ liệu mô phỏng mà giao diện và tài liệu hướng dẫn dựa vào.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMart } from '../web/js/core/engine.js';
import { crossValidate } from '../web/js/core/logistic.js';
import { createRng } from '../web/js/core/rng.js';
import { buildSyntheticDataset } from '../web/js/data/synthetic.js';
import { cfg } from './helpers.mjs';

const ds = buildSyntheticDataset();
const mart = computeMart(ds, cfg);
const latest = mart.waves[mart.waves.length - 1];
const status = (lineage) => {
  const cls = ds.classes.find((c) => c.semesterId === latest.semesterId && c.lineage === lineage);
  return mart.classWave.get(`${cls.id}|${latest.id}`).status;
};

test('dữ liệu mô phỏng tái lập được với cùng hạt giống', () => {
  const again = buildSyntheticDataset();
  assert.equal(again.responses.length, ds.responses.length);
  assert.deepEqual(Array.from(again.responses[123].v), Array.from(ds.responses[123].v));
});

test('đợt mới nhất có đủ các tình huống trình diễn', () => {
  assert.equal(latest.id, 'HK1-2627-GK');
  assert.equal(status('INF202-N02'), 'alert');
  assert.equal(status('LAW201-N01'), 'alert');
  assert.equal(status('MKT101-N03'), 'warn');
  assert.equal(status('INF301-N01'), 'na');
  assert.equal(status('ENG301-N01'), 'na');
  const school = mart.byWave.get(latest.id).school;
  assert.ok(school.n >= 300, 'đủ 300 phiếu hợp lệ');
});

test('mô hình nguy cơ đạt TC1 (AUC ≥ 0,70) trên dữ liệu mô phỏng', () => {
  const lab = mart.students.filter((s) => s.eng !== null && s.process !== null && s.low !== null);
  const cv = crossValidate(lab.map((s) => [s.eng, s.process]), lab.map((s) => (s.low ? 1 : 0)), { k: 10, rng: createRng('t') });
  assert.ok(cv.auc >= 0.7, `AUC = ${cv.auc}`);
});
