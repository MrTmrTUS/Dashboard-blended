// Chạy thử M6 bằng dữ liệu cuối kỳ mô phỏng độc lập (scripts/clo-chay-thu.mjs): nhập 6 tệp qua đúng bộ kiểm tra,
// rồi đối chiếu kết quả của bộ tính với một cách tính ĐỘC LẬP viết lại từ quy tắc đã công bố (đầu tệp core/clo.js),
// đọc ma trận từ tệp chính thức web/templates/ma_tran_danh_gia.csv.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classResult, itemAnalysis, raterAnalysis, resolveVersion, versionForClass } from '../web/js/core/clo.js';
import { applyCloImport, cloValidationContext, validateCloCsv } from '../web/js/core/clo-import.js';
import { buildSyntheticDataset } from '../web/js/data/synthetic.js';
import { RUN_CLASSES, simulateEndOfSemester } from '../scripts/clo-chay-thu.mjs';

const base = buildSyntheticDataset();
const sim = simulateEndOfSemester(base);

// Nhập lần lượt 5 tệp dữ liệu như ở màn hình M6 › Nhập (chế độ Bổ sung); tệp 6 chỉ kiểm tra.
const reports = {};
let ds = base;
for (const f of sim.files) {
  reports[f.name] = validateCloCsv(f.kind, f.text, cloValidationContext(ds));
  if (!f.name.startsWith('6_') && reports[f.name].ok) ds = applyCloImport(ds, f.kind, reports[f.name].records, { mode: 'merge' });
}

test('5 tệp chạy thử qua bộ kiểm tra không lỗi; tệp chỉ có một phần lớp được nhắc chọn “Bổ sung”', () => {
  for (const f of sim.files.slice(0, 5)) {
    const r = reports[f.name];
    assert.equal(r.errorCount, 0, `${f.name}: ${JSON.stringify(r.errors.slice(0, 3))}`);
    assert.ok(r.records.length > 0, f.name);
  }
  const kt = reports['3_diem_kiem_tra_thuc_hanh_lms.csv'];
  assert.deepEqual(Object.keys(kt.issues), ['partial']);
  assert.ok(ds.outcomes.submissions.some((x) => x.c === RUN_CLASSES[1] && x.a === 'CK' && x.t === 2));
});

test('tệp có lỗi cố ý: bắt đủ 11 loại lỗi và không cho nhập', () => {
  const r = reports['6_tep_co_loi_de_thu.csv'];
  assert.equal(r.ok, false);
  for (const k of ['over', 'form', 'attempt', 'roster', 'duplicate', 'missing', 'privacy', 'value', 'item']) assert.ok(r.issues[k] >= 1, `thiếu loại lỗi ${k}`);
  const msg = r.errors.map((e) => e.message).join('\n');
  for (const re of [/vượt điểm tối đa/, /D5/, /lần 3/, /NC-99999/, /Trùng dòng/, /Thiếu điểm câu TL1/, /mã sinh viên thật/, /"có mặt"/, /"abc"/, /"TL3"/, /N09/]) assert.match(msg, re);
});

// ---- Cách tính độc lập -----------------------------------------------------------------------------
function readMatrix() {
  const text = readFileSync(new URL('../web/templates/ma_tran_danh_gia.csv', import.meta.url), 'utf8').replace(/^﻿/, '');
  const [head, ...lines] = text.split(/\r?\n/).filter(Boolean).map((l) => l.split(';'));
  const num = (s) => Number(String(s).replace(',', '.'));
  const A = {};
  for (const cells of lines) {
    const r = Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']));
    const a = (A[r.ma_bai_danh_gia] ||= { code: r.ma_bai_danh_gia, group: r.nhom, weight: num(r.trong_so_bai) / 100, items: [] });
    a.items.push({ code: r.ma_cau, max: num(r.diem_toi_da), clos: Object.fromEntries(r.ma_clo.split('|').map((p) => p.split(':')).map(([c, w]) => [c, w ? num(w) : 1])) });
  }
  for (const a of Object.values(A)) a.max = a.items.reduce((s, it) => s + it.max, 0);
  return A;
}

const A = readMatrix();
const ITEMS = Object.values(A).flatMap((a) =>
  a.items.map((it) => {
    const tw = Object.values(it.clos).reduce((s, w) => s + w, 0);
    return { ...it, a: a.code, key: `${a.code}:${it.code}`, g: (a.weight * it.max) / a.max, w: Object.fromEntries(Object.entries(it.clos).map(([c, w]) => [c, w / tw])) };
  }),
);
const CLOS = [...new Set(ITEMS.flatMap((it) => Object.keys(it.w)))].sort();
const r1 = (v) => Math.round(v * 10 + 1e-9) / 10;
const r2 = (v) => Math.round(v * 100 + 1e-9) / 100;

// Điểm CLO = 10 × Σ gᵢ·wᵢc·(điểmᵢ/maxᵢ) / Σ gᵢ·wᵢc trên câu đã có điểm; bao phủ < 60% = chưa đủ minh chứng; đạt khi ≥ 5.
// Chế độ "latest": mỗi câu lấy lần gần nhất có điểm câu đó. Điểm bài cộng theo câu; vắng, không nộp = 0 khi cộng điểm học phần.
function independent(classId, mode) {
  const subs = ds.outcomes.submissions.filter((x) => x.c === classId);
  const held = new Set(subs.filter((x) => x.t === 1).map((x) => x.a));
  const heldItems = ITEMS.filter((it) => held.has(it.a));
  const gHeld = Object.fromEntries(CLOS.map((c) => [c, heldItems.reduce((s, it) => s + it.g * (it.w[c] || 0), 0)]));
  const out = {};
  for (const r of ds.outcomes.rosters[classId].filter((x) => x.st === 'active')) {
    const mine = subs.filter((x) => x.s === r.s && (mode === 'latest' || x.t === 1)).sort((a, b) => a.t - b.t);
    const val = {};
    for (const it of heldItems) {
      val[it.key] = null;
      for (const x of mine) if (x.a === it.a && x.st === 'graded' && typeof x.pts?.[it.code] === 'number') val[it.key] = x.pts[it.code];
    }
    const clo = {};
    for (const c of CLOS) {
      let E = 0;
      let P = 0;
      for (const it of heldItems) {
        if (!it.w[c] || val[it.key] === null) continue;
        E += it.g * it.w[c];
        P += (it.g * it.w[c] * val[it.key]) / it.max;
      }
      const cov = E / gHeld[c];
      const score = E > 0 ? r2((10 * P) / E) : null;
      clo[c] = { score, cov, status: cov < 0.6 - 1e-9 ? 'insufficient' : score >= 5 - 1e-9 ? 'achieved' : 'not_achieved' };
    }
    const aScore = Object.fromEntries(
      Object.values(A).map((a) => {
        const vals = a.items.map((it) => val[`${a.code}:${it.code}`]);
        return [a.code, vals.some((v) => v !== null) ? (10 * vals.reduce((s, v) => s + (v ?? 0), 0)) / a.max : null];
      }),
    );
    const a1 = Object.values(A).filter((a) => a.group === 'A1');
    const process = r1(a1.reduce((s, a) => s + a.weight * (aScore[a.code] ?? 0), 0) / a1.reduce((s, a) => s + a.weight, 0));
    const exam = r1(aScore.CK ?? 0);
    const course = r1(Object.values(A).reduce((s, a) => s + a.weight * (a.code === 'CK' ? exam : aScore[a.code] ?? 0), 0));
    out[r.s] = { clo, process, exam, course };
  }
  return out;
}

test('kết quả bộ tính trùng cách tính độc lập: điểm, trạng thái, bao phủ CLO và điểm quá trình, thi, học phần', () => {
  const versions = ds.outcomes.versions.map(resolveVersion);
  let compared = 0;
  for (const classId of RUN_CLASSES) {
    const rv = versionForClass(versions, ds.classes.find((c) => c.id === classId));
    for (const mode of ['initial', 'latest']) {
      const want = independent(classId, mode);
      const res = classResult({ rv, roster: ds.outcomes.rosters[classId], subs: ds.outcomes.submissions.filter((x) => x.c === classId), mode });
      assert.equal(res.inProgress, false);
      for (const st of res.students) {
        const w = want[st.code];
        for (const c of CLOS) {
          const at = `${classId} ${mode} ${st.code} ${c}`;
          assert.equal(st.clo[c].score, w.clo[c].score, at);
          assert.equal(st.clo[c].status, w.clo[c].status, at);
          assert.ok(Math.abs(st.clo[c].cov - w.clo[c].cov) < 1e-9, at);
          compared += 3;
        }
        for (const k of ['process', 'exam', 'course']) {
          assert.equal(st[k], w[k], `${classId} ${mode} ${st.code} ${k}`);
          compared++;
        }
      }
    }
  }
  assert.ok(compared > 900);
});

test('tình huống cài sẵn được phát hiện: câu ghi nhầm đáp án (D âm) và cán bộ chấm vòng 2 chặt hơn ở TL1 lớp N01', () => {
  const versions = ds.outcomes.versions.map(resolveVersion);
  const rv = versionForClass(versions, ds.classes.find((c) => c.id === RUN_CLASSES[0]));
  const subs = ds.outcomes.submissions.filter((x) => RUN_CLASSES.includes(x.c));
  const { mcqRows } = itemAnalysis({ rv, subs, semesterId: 'HK1-2627', outcomes: ds.outcomes });
  const trap = mcqRows.find((r) => r.bankId === sim.scenario.trap.id && r.form === 'D2');
  assert.ok(trap.D < 0, `D = ${trap.D}`);
  assert.ok(trap.flags.some((f) => f.code === 'key'), 'gợi ý kiểm tra đáp án');
  const ra = raterAnalysis({ rv, subs: subs.filter((x) => x.c === RUN_CLASSES[0]) });
  const tl1 = ra.rows.find((r) => r.code === 'TL1');
  assert.ok(tl1.meanDiff < -0.3 && tl1.over > 0.2, JSON.stringify({ meanDiff: tl1.meanDiff, over: tl1.over }));
  assert.ok(Math.abs(ra.rows.find((r) => r.code === 'TL2a').meanDiff) < 0.15);
  // 3 sinh viên chuyên cần dưới 70% bị cấm thi
  assert.equal(sim.scenario.banned.length, 3);
  assert.equal(ds.outcomes.submissions.filter((x) => RUN_CLASSES.includes(x.c) && x.a === 'CK' && x.st === 'banned').length, 3);
});
