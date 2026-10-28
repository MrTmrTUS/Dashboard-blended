// Mục 4.2 – phiếu hợp lệ và điểm một phiếu (đáp số tính tay ghi trong chú thích).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkValidity, level, minAnswered, scoreResponse } from '../web/js/core/scoring.js';
import { cfg, close, makeResponse, PASS_ATT } from './helpers.mjs';

const base = {
  CT1: [4, 5, 0, 3], //            3/4 câu ≥ 3 → (4+5+3)/3 = 4,0
  IN2: [5, 5, 4, 4, 0], //         4/5 câu ≥ 4 → 18/4 = 4,5
  PS1: [3, 3, 3, 3, 4, 4, 4, 4], // 3,5
  PS2: [4, 4, 4, 4, 4, 4, 4, 4], // 4,0
  CT2: [3, 3, 3, 3, 3, 4, 4, 4, 4, 4], // 3,5
  IN1: [2, 2, 3, 3, 3, 3, 4, 4, 4, 4], // 32/10 = 3,2
  IN3: [5, 4, 0, 0], //             2/4 < 3 → không đủ 2/3 → null
  PT1: [4, 4, 4, 4, 4, 4, 4, 4],
  PT2: [3, 3, 3, 3, 3],
  ENG: [3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4], // 3,5
};

test('ngưỡng 2/3 số chỉ báo của nhân tố', () => {
  assert.equal(minAnswered(4), 3);
  assert.equal(minAnswered(5), 4);
  assert.equal(minAnswered(8), 6);
  assert.equal(minAnswered(10), 7);
  assert.equal(minAnswered(12), 8);
});

test('điểm nhân tố, chỉ số chất lượng và điểm nhóm', () => {
  const s = scoreResponse(makeResponse(base), cfg);
  assert.ok(close(s.CT1, 4.0));
  assert.ok(close(s.IN2, 4.5));
  assert.ok(close(s.PS1, 3.5));
  assert.ok(close(s.PS2, 4.0));
  assert.ok(close(s.CT2, 3.5));
  assert.ok(close(s.IN1, 3.2));
  assert.equal(s.IN3, null);
  assert.equal(s.IDX, null, 'thiếu một phương diện thì không tính chỉ số chất lượng');
  assert.ok(close(s.PED, 4.0), 'nhóm lõi sư phạm đủ 4 phương diện');
  assert.equal(s.ORG, null);
  assert.ok(close(s.ENG, 3.5));
  assert.ok(close(s.PT2, 3.0));
  assert.equal(s.valid, true);

  const full = scoreResponse(makeResponse({ ...base, IN3: [5, 4, 4, 0] }), cfg);
  // IN3 = 13/3; IDX = (4 + 4,5 + 3,5 + 4 + 3,5 + 3,2 + 13/3) / 7 = 3,861905
  assert.ok(close(full.IN3, 13 / 3));
  assert.ok(close(full.IDX, (4 + 4.5 + 3.5 + 4 + 3.5 + 3.2 + 13 / 3) / 7));
  assert.ok(close(full.ORG, (3.5 + 3.2 + 13 / 3) / 3));
});

test('phiếu không hợp lệ: câu kiểm tra chú ý, chọn một mức, trả lời dưới 80%', () => {
  const ok = makeResponse(base);
  assert.equal(checkValidity(ok, cfg).valid, true);

  const att = makeResponse(base, { att: [PASS_ATT[0], PASS_ATT[1] + 1] });
  assert.deepEqual(checkValidity(att, cfg).reasons, ['attention']);

  const same = {};
  for (const k of Object.keys(base)) same[k] = base[k].map(() => 5);
  assert.deepEqual(checkValidity(makeResponse(same), cfg).reasons, ['straightline']);

  // 62 chỉ báo × 80% = 49,6 → cần 50 câu. Bỏ trống 13 câu → còn 49 → không hợp lệ.
  const sparse = structuredClone(base);
  sparse.IN3 = [5, 4, 4, 4];
  sparse.CT1 = [4, 5, 4, 3];
  sparse.IN2 = [5, 5, 4, 4, 4];
  const r = makeResponse(sparse);
  let blanks = 0;
  for (let i = 0; i < 62 && blanks < 13; i++) if (r.v[i]) { r.v[i] = 0; blanks++; }
  assert.deepEqual(checkValidity(r, cfg).reasons, ['incomplete']);
  // bỏ trống 12 câu → còn 50 → hợp lệ
  const r2 = makeResponse(sparse);
  blanks = 0;
  for (let i = 0; i < 62 && blanks < 12; i++) if (r2.v[i]) { r2.v[i] = 0; blanks++; }
  assert.equal(checkValidity(r2, cfg).valid, true);
});

test('phân loại 3 mức', () => {
  assert.equal(level(2.49), 'low');
  assert.equal(level(2.5), 'mid');
  assert.equal(level(3.49), 'mid');
  assert.equal(level(3.5), 'high');
  assert.equal(level(null), 'na');
});
