// Bộ tính toán theo lô trên bộ dữ liệu nhỏ có đáp số tính tay (Sprint 2: khớp 100%).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMart } from '../web/js/core/engine.js';
import { cfg, close, uniformResponse } from './helpers.mjs';

// Lớp A: 12 phiếu hợp lệ có mọi phương diện = b ∈ {4×6, 5×4, 3×2} + 1 phiếu sai câu chú ý.
// Lớp B: 3 phiếu hợp lệ b ∈ {2, 3, 2} → dưới 10 phiếu, ẩn.
function smallDataset() {
  const A = [4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 3, 3];
  const B = [2, 3, 2];
  const responses = [];
  A.forEach((b, i) => responses.push(uniformResponse(b, { id: `A${i}`, classId: 'A', waveId: 'W1', researchCode: `NC-A${i}` })));
  responses.push(uniformResponse(1, { id: 'Ax', classId: 'A', waveId: 'W1', researchCode: 'NC-AX', att: [1, 1] }));
  B.forEach((b, i) => responses.push(uniformResponse(b, { id: `B${i}`, classId: 'B', waveId: 'W1', researchCode: `NC-B${i}` })));
  return {
    meta: {},
    semesters: [{ id: 'HK1-2627', label: 'HK1 2026–2027', order: 0 }],
    waves: [{ id: 'W1', semesterId: 'HK1-2627', dot: 'GK', order: 0, date: '2026-10-16', status: 'published' }],
    faculties: [{ id: 'KT', name: 'Khoa Kinh tế' }],
    courses: [{ id: 'MKT', name: 'Marketing', facultyId: 'KT' }],
    lecturers: [{ id: 'GV1', name: 'GV 1', facultyId: 'KT' }],
    advisors: [],
    classes: [
      { id: 'A', lineage: 'MKT-N01', name: 'Marketing – N01', courseId: 'MKT', facultyId: 'KT', lecturerId: 'GV1', semesterId: 'HK1-2627', size: 20 },
      { id: 'B', lineage: 'MKT-N02', name: 'Marketing – N02', courseId: 'MKT', facultyId: 'KT', lecturerId: 'GV1', semesterId: 'HK1-2627', size: 15 },
    ],
    students: [],
    responses,
    grades: [],
    params: { weights: {} },
    measures: [],
  };
}

test('điểm lớp, khoa, Trường; tham số phễu; z; ẩn lớp dưới 10 phiếu', () => {
  const mart = computeMart(smallDataset(), cfg);
  const wave = mart.byWave.get('W1');
  // Trường: 15 phiếu hợp lệ, tổng 57 → μ = 3,8; SS = 14,4 → σ = √(14,4/14)
  assert.equal(wave.school.n, 15);
  assert.equal(wave.school.nTotal, 16);
  assert.ok(close(wave.school.metrics.IDX.mean, 3.8));
  assert.ok(close(wave.funnel.IDX.mu, 3.8));
  assert.ok(close(wave.funnel.IDX.sigma, Math.sqrt(14.4 / 14)));
  assert.ok(close(wave.faculty.get('KT').metrics.CT1.mean, 3.8));

  const A = mart.classWave.get('A|W1');
  assert.equal(A.n, 12);
  assert.equal(A.nTotal, 13);
  assert.ok(close(A.metrics.IDX.mean, 50 / 12));
  // z = (50/12 − 3,8) / (σ/√12) = 1,252405
  assert.ok(close(A.z.IDX, (50 / 12 - 3.8) / (Math.sqrt(14.4 / 14) / Math.sqrt(12)), 1e-9));
  assert.ok(close(A.z.IDX, 1.252405, 1e-6));
  assert.equal(A.status, 'ok');

  const B = mart.classWave.get('B|W1');
  assert.equal(B.n, 3);
  assert.equal(B.hidden, true);
  assert.equal(B.status, 'na');
});

test('trọng số đều 1/7 khi chưa có kết quả Nội dung 2', () => {
  const mart = computeMart(smallDataset(), { ...cfg, weightsSource: 'nd2' });
  for (const w of Object.values(mart.weights)) assert.ok(close(w, 1 / 7));
});
