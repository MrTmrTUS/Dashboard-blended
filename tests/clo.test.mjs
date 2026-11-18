// Đánh giá theo CLO (M6): điểm CLO và minh chứng (đáp số tính tay), kiểm tra ma trận, phân tích câu hỏi,
// đối chiếu người chấm, Pareto lỗi, kiểm tra tệp nhập điểm, và "kịch bản" của dữ liệu mô phỏng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxStats, checkMatrix, classResult, errorPareto, evidenceFunnel, histogram, itemAnalysis, pChart, raterAnalysis, resolveVersion, versionForClass } from '../web/js/core/clo.js';
import { applyCloImport, cloValidationContext, exportCloCsv, validateCloCsv } from '../web/js/core/clo-import.js';
import { buildSyntheticDataset } from '../web/js/data/synthetic.js';
import { close } from './helpers.mjs';

// Bộ quy tắc nhỏ để tính tay:
//  QT (A1, 40%): a (max 4) → CLO1, b (max 6) → CLO1        ⇒ g_a = 0,16; g_b = 0,24
//  CK (A2, 60%): c (max 5) → CLO1 + CLO2 (½ – ½), d (max 5) → CLO2 ⇒ g_c = 0,30; g_d = 0,30
//  Thực tế: CLO1 = 0,16 + 0,24 + 0,15 = 0,55; CLO2 = 0,15 + 0,30 = 0,45.
const V = {
  id: 'T@1', courseId: 'T', courseName: 'Học phần thử', version: '1', status: 'approved', effectiveFrom: 'HK1-2526',
  rules: { pass: 5, target: 0.7, minEvidence: 0.6 },
  clos: [
    { code: 'CLO1', weight: 0.5, domain: 'kien_thuc', level: 3, plo: 'P1', text: 'CLO một' },
    { code: 'CLO2', weight: 0.5, domain: 'ky_nang', level: 4, plo: 'P2', text: 'CLO hai' },
  ],
  assessments: [
    { code: 'QT', group: 'A1', name: 'Quá trình', weight: 0.4, forms: ['Q'], maxAttempts: 1, declared: { CLO1: 0.4 }, items: [{ code: 'a', max: 4, clos: { CLO1: 1 } }, { code: 'b', max: 6, clos: { CLO1: 1 } }] },
    { code: 'CK', group: 'A2', name: 'Cuối kỳ', weight: 0.6, forms: ['D1'], retakeForms: ['D2'], maxAttempts: 2, declared: { CLO1: 0.1, CLO2: 0.5 }, items: [{ code: 'c', max: 5, clos: { CLO1: 1, CLO2: 1 } }, { code: 'd', max: 5, clos: { CLO2: 1 } }] },
  ],
};
const rv = resolveVersion(V);
const roster = [{ s: 'S1', st: 'active' }, { s: 'S2', st: 'active' }, { s: 'S3', st: 'active' }, { s: 'S4', st: 'withdrawn' }];
const subs = [
  { c: 'L1', s: 'S1', a: 'QT', t: 1, f: 'Q', st: 'graded', pts: { a: 2, b: 3 } },
  { c: 'L1', s: 'S1', a: 'CK', t: 1, f: 'D1', st: 'graded', pts: { c: 4, d: 1 }, r1: { c: 4, d: 1 }, r2: { c: 3, d: 1 }, err: [['c', 'E1'], ['d', 'E1'], ['d', 'E2']] },
  { c: 'L1', s: 'S2', a: 'QT', t: 1, f: 'Q', st: 'graded', pts: { a: 4, b: 6 } },
  { c: 'L1', s: 'S2', a: 'CK', t: 1, f: null, st: 'absent' },
  { c: 'L1', s: 'S3', a: 'QT', t: 1, f: 'Q', st: 'graded', pts: { a: 1, b: 1 } },
  { c: 'L1', s: 'S3', a: 'CK', t: 1, f: 'D1', st: 'graded', pts: { c: 1, d: 0 }, r1: { c: 1, d: 0 }, r2: { c: 1, d: 0.25 }, err: [['d', 'E1']] },
  { c: 'L1', s: 'S3', a: 'CK', t: 2, f: 'D2', st: 'graded', pts: { c: 5, d: 4 } },
];

test('đóng góp của từng câu vào điểm học phần và phân bổ CLO thực tế', () => {
  const g = Object.fromEntries(rv.items.map((it) => [it.key, it.g]));
  assert.ok(close(g['QT:a'], 0.16) && close(g['QT:b'], 0.24) && close(g['CK:c'], 0.3) && close(g['CK:d'], 0.3));
  assert.ok(close(rv.actual.CLO1, 0.55) && close(rv.actual.CLO2, 0.45));
  assert.ok(close(rv.declared.CLO1, 0.5) && close(rv.declared.CLO2, 0.5));
});

test('điểm CLO, độ bao phủ minh chứng, trạng thái và điểm học phần (đáp số tính tay)', () => {
  const res = classResult({ rv, roster, subs, mode: 'latest' });
  assert.equal(res.nActive, 3);
  assert.deepEqual(res.withdrawn, ['S4']);
  const [s1, s2, s3] = res.students;
  // S1: CLO1 = 10 × (0,16·½ + 0,24·½ + 0,15·0,8)/0,55 = 5,82; CLO2 = 10 × (0,15·0,8 + 0,30·0,2)/0,45 = 4,00
  assert.equal(s1.clo.CLO1.score, 5.82);
  assert.equal(s1.clo.CLO1.status, 'achieved');
  assert.equal(s1.clo.CLO2.score, 4);
  assert.equal(s1.clo.CLO2.status, 'not_achieved');
  assert.equal(s1.process, 5);
  assert.equal(s1.exam, 5);
  assert.equal(s1.course, 5);
  // S2 vắng thi: CLO1 chỉ có minh chứng quá trình, bao phủ 0,40/0,55 = 72,7% ≥ 60% → đạt; CLO2 không có minh chứng
  assert.ok(close(s2.clo.CLO1.cov, 0.4 / 0.55));
  assert.equal(s2.clo.CLO1.status, 'achieved');
  assert.equal(s2.clo.CLO2.status, 'insufficient');
  assert.equal(s2.course, 4);
  assert.deepEqual(s2.missingWork, ['CK']);
  // S3 thi lần 2: chế độ "latest" lấy lần 2 cho c, d
  assert.equal(s3.clo.CLO2.score, 8.67);
  assert.equal(s3.clo.CLO2.status, 'achieved');
  assert.equal(s3.clo.CLO1.score, 4.18);
  assert.equal(s3.retaken.CK, true);
  // Tổng hợp lớp: CLO1 đạt 2/3; CLO2 đạt 1/2 (S2 chưa đủ minh chứng không tính vào mẫu số)
  assert.ok(close(res.clo.CLO1.rate, 2 / 3));
  assert.equal(res.clo.CLO2.n, 2);
  assert.equal(res.clo.CLO2.nInsufficient, 1);
  assert.ok(close(res.clo.CLO2.rate, 0.5));
  // Chế độ "initial": S3 chỉ có lần 1 → CLO1 = 10 × (0,04 + 0,04 + 0,03)/0,55 = 2,00
  const init = classResult({ rv, roster, subs, mode: 'initial' });
  assert.equal(init.students[2].clo.CLO1.score, 2);
  assert.equal(init.students[2].clo.CLO2.status, 'not_achieved');
});

test('đánh giá lại một phần (chỉ chấm lại một câu): điểm bài, điểm học phần giữ điểm các câu không chấm lại', () => {
  const partial = [...subs, { c: 'L1', s: 'S1', a: 'CK', t: 2, f: 'D2', st: 'graded', pts: { d: 3 } }];
  const s1 = classResult({ rv, roster, subs: partial, mode: 'latest' }).students[0];
  // c giữ 4 điểm của lần 1, d lấy 3 điểm của lần 2 → bài cuối kỳ 10 × 7/10 = 7 (không phải 3)
  assert.equal(s1.values['CK:c'], 4);
  assert.equal(s1.values['CK:d'], 3);
  assert.equal(s1.exam, 7);
  assert.equal(s1.course, 6.2); // 0,4 × 5 + 0,6 × 7
  assert.equal(s1.clo.CLO2.score, 6.67); // 10 × (0,15·0,8 + 0,30·0,6)/0,45
  assert.equal(classResult({ rv, roster, subs: partial, mode: 'initial' }).students[0].exam, 5);
});

test('phễu minh chứng: thuộc diện → đã nộp → đã chấm → đủ minh chứng → đạt', () => {
  const res = classResult({ rv, roster, subs, mode: 'latest' });
  const f = evidenceFunnel(res, rv, 'CLO2');
  assert.deepEqual(f.stages.map((s) => s.n), [3, 2, 2, 2, 1]);
});

test('học kỳ đang diễn ra: CLO chưa có bài đánh giá là "chưa đánh giá", điểm học phần chưa tính', () => {
  const partial = subs.filter((x) => x.a === 'QT');
  const res = classResult({ rv, roster, subs: partial });
  assert.equal(res.inProgress, true);
  assert.equal(res.students[0].clo.CLO2.status, 'not_assessed');
  assert.equal(res.students[0].course, null);
  assert.equal(res.students[0].process, 5);
  assert.ok(close(res.clo.CLO1.heldShare, 0.4 / 0.55));
});

test('kiểm tra ma trận: CLO chưa đo, phần điểm chưa gắn CLO, trọng số lệch, phân bổ khai báo khác đề', () => {
  const ok = checkMatrix(rv);
  assert.ok(ok.items.some((x) => x.level === 'warn' && x.code === 'split-mismatch' && x.assessment === 'CK'));
  assert.equal(ok.errors, 0);
  const bad = resolveVersion({
    ...V,
    clos: [...V.clos.map((c) => ({ ...c, weight: 0.4 })), { code: 'CLO3', weight: 0.2, domain: 'kien_thuc', level: 4, plo: 'P3' }],
    assessments: [V.assessments[0], { ...V.assessments[1], items: [...V.assessments[1].items, { code: 'e', max: 2, clos: {} }] }],
  });
  const res = checkMatrix(bad);
  const codes = res.items.filter((x) => x.level === 'error').map((x) => x.code);
  assert.ok(codes.includes('unmeasured'), 'CLO3 chưa được đo');
  assert.ok(codes.includes('unmapped'), 'câu e chưa gắn CLO');
  assert.ok(res.items.some((x) => x.code === 'weight-mismatch' && x.clo === 'CLO1'), 'CLO1: 40% kế hoạch, thực tế lệch');
});

test('chọn bộ quy tắc đã phê duyệt có hiệu lực theo học kỳ', () => {
  const versions = [rv, resolveVersion({ ...V, id: 'T@2', status: 'approved', effectiveFrom: 'HK2-2526', approvedAt: '2026-01-01' }), resolveVersion({ ...V, id: 'T@3', status: 'pending', effectiveFrom: 'HK1-2627' })];
  assert.equal(versionForClass(versions, { courseId: 'T', semesterId: 'HK1-2526' }).id, 'T@1');
  assert.equal(versionForClass(versions, { courseId: 'T', semesterId: 'HK1-2627' }).id, 'T@2');
  assert.equal(versionForClass(versions, { courseId: 'T', semesterId: 'HK2-2425' }), null);
});

test('phân tích câu hỏi: độ khó, độ phân biệt (27% nhóm cao – thấp)', () => {
  const s = [
    { c: 'L', s: 'A', a: 'QT', t: 1, st: 'graded', pts: { a: 4, b: 6 } },
    { c: 'L', s: 'B', a: 'QT', t: 1, st: 'graded', pts: { a: 3, b: 4 } },
    { c: 'L', s: 'C', a: 'QT', t: 1, st: 'graded', pts: { a: 2, b: 3 } },
    { c: 'L', s: 'D', a: 'QT', t: 1, st: 'graded', pts: { a: 1, b: 0 } },
  ];
  const { rows } = itemAnalysis({ rv, subs: s });
  const a = rows.find((r) => r.key === 'QT:a');
  assert.ok(close(a.p, 10 / 16)); // (4+3+2+1)/4 điểm TB / 4
  assert.ok(close(a.D, 1 - 0.25)); // nhóm cao (A) 4/4, nhóm thấp (D) 1/4
  const b = rows.find((r) => r.key === 'QT:b');
  assert.ok(close(b.D, 1));
});

test('đối chiếu hai cán bộ chấm và Pareto dạng lỗi (đơn vị: lượt lỗi)', () => {
  const marked = resolveVersion({ ...V, assessments: [V.assessments[0], { ...V.assessments[1], items: V.assessments[1].items.map((it) => ({ ...it, marked2: true })) }] });
  const ra = raterAnalysis({ rv: marked, subs, tol: 0.5 });
  const c = ra.rows.find((r) => r.code === 'c');
  assert.equal(c.n, 2);
  assert.ok(close(c.meanDiff, -0.5)); // (3 − 4 + 1 − 1)/2
  assert.ok(close(c.over, 0.5)); // 1/2 bài lệch > 0,5
  assert.equal(ra.scripts.length, 1);
  const par = errorPareto({ rv, subs, errorTypes: [{ code: 'E1', label: 'Lỗi 1', group: 'G' }, { code: 'E2', label: 'Lỗi 2', group: 'G' }] });
  assert.equal(par.total, 4);
  assert.equal(par.rows[0].code, 'E1');
  assert.equal(par.rows[0].count, 3);
  assert.equal(par.rows[0].students, 2); // 3 lượt lỗi E1 nhưng chỉ 2 sinh viên
  assert.ok(close(par.rows[1].cumShare, 1));
  const onlyClo1 = errorPareto({ rv, subs, errorTypes: [], clo: 'CLO1' });
  assert.equal(onlyClo1.total, 1); // chỉ câu c đo CLO1
});

test('thống kê cho biểu đồ: histogram, box plot, biểu đồ p', () => {
  const bins = histogram([0.2, 4.6, 5, 9.9, 10], { pass: 5, near: 0.5 });
  assert.equal(bins.length, 20);
  assert.equal(bins[9].status, 'warn'); // 4,5 – < 5: sát ngưỡng
  assert.equal(bins[10].status, 'ok');
  assert.equal(bins[19].count, 2); // 9,9 và 10
  const b = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 30]);
  assert.ok(close(b.q1, 3.25) && close(b.median, 5.5) && close(b.q3, 7.75));
  assert.deepEqual(b.outliers, [30]);
  assert.equal(b.whiskerHi, 9);
  const p = pChart([{ k: 5, n: 50 }, { k: 10, n: 50 }], { minRounds: 2 });
  assert.ok(p.enabled && close(p.pbar, 0.15));
  assert.ok(close(p.points[0].ucl, 0.15 + 3 * Math.sqrt((0.15 * 0.85) / 50)));
  assert.equal(p.points[0].lcl, 0);
  assert.equal(pChart([{ k: 5, n: 50 }], { minRounds: 8 }).enabled, false);
});

// ---- Kiểm tra tệp nhập điểm -------------------------------------------------------------------------------
const dsLike = {
  classes: [{ id: 'L1', courseId: 'T', semesterId: 'HK1-2526', name: 'Lớp thử' }],
  courses: [{ id: 'T', name: 'Học phần thử' }],
  outcomes: { versions: [V], rosters: { L1: [{ s: 'NC-001', st: 'active' }, { s: 'NC-002', st: 'active' }, { s: 'NC-003', st: 'active' }] }, submissions: [], errorTypes: [] },
};

test('điểm chi tiết dạng dài: trùng dòng, vượt điểm tối đa, sai mã đề, sai lần thi, ngoài lớp, thiếu điểm', () => {
  const csv = [
    'ma_nghien_cuu,ma_lop_hp,ma_bai_danh_gia,lan_thi,ma_de,ma_cau,diem',
    'NC-001,L1,QT,1,Q,a,2',
    'NC-001,L1,QT,1,Q,a,3',
    'NC-001,L1,QT,1,Q,b,7',
    'NC-002,L1,CK,1,D9,c,3',
    'NC-002,L1,CK,1,D9,d,3',
    'NC-002,L1,CK,3,D1,c,3',
    'NC-003,L1,CK,2,D2,c,4',
    'NC-009,L1,QT,1,Q,a,1',
    'NC-009,L1,QT,1,Q,b,1',
    '2021123456,L1,QT,1,Q,a,1',
    'NC-003,L1,QT,1,Q,a,1',
    'NC-002,L1,QT,1,Q,a,"3,5"',
    'NC-002,L1,QT,1,Q,b,4',
  ].join('\n');
  const r = validateCloCsv('diem_chi_tiet', csv, cloValidationContext(dsLike));
  assert.equal(r.ok, false);
  for (const k of ['duplicate', 'over', 'form', 'attempt', 'roster', 'privacy', 'missing']) assert.ok(r.issues[k] >= 1, `thiếu loại lỗi ${k}`);
  assert.ok(r.issues.attempt >= 2, 'lần 3 vượt số lần tối đa và lần 2 khi chưa có lần 1');
  assert.ok(r.errors.some((e) => e.line === 3 && e.issue === 'duplicate'));
  // "3,5" kiểu Việt Nam đọc đúng và hợp lệ
  assert.ok(r.records.some((x) => x.s === 'NC-002' && x.a === 'QT' && x.pts.a === 3.5));
});

test('điểm theo bài dạng bảng Excel: ô trống = thiếu điểm, cột lạ, trùng sinh viên; áp dụng và xuất lại', () => {
  const csv = [
    'ma_nghien_cuu;ma_lop_hp;ma_bai_danh_gia;lan_thi;ma_de;a;b',
    'NC-001;L1;QT;1;Q;2;3',
    'NC-001;L1;QT;1;Q;2;3',
    'NC-002;L1;QT;1;Q;;4',
    'NC-003;L1;QT;1;Q;5;1',
  ].join('\n');
  const r = validateCloCsv('diem_theo_bai', csv, cloValidationContext(dsLike));
  assert.equal(r.issues.duplicate, 1);
  assert.equal(r.issues.missing, 1);
  assert.equal(r.issues.over, 1);
  assert.equal(r.records.length, 1);
  const good = validateCloCsv('diem_theo_bai', 'ma_nghien_cuu;ma_lop_hp;ma_bai_danh_gia;lan_thi;ma_de;a;b\nNC-001;L1;QT;1;Q;2;3\nNC-002;L1;QT;1;Q;4;6', cloValidationContext(dsLike));
  assert.equal(good.ok, true);
  const next = applyCloImport(dsLike, 'diem_theo_bai', good.records);
  assert.equal(next.outcomes.submissions.length, 2);
  const out = exportCloCsv(next, 'diem_chi_tiet');
  const back = validateCloCsv('diem_chi_tiet', out, cloValidationContext(next));
  assert.equal(back.ok, true, JSON.stringify(back.errors.slice(0, 3)));
  assert.equal(back.records.length, 2);
});

test('tệp điểm chỉ có một phần lớp: không báo thiếu bài với sinh viên đã có điểm, nhắc chọn “Bổ sung”', () => {
  const head = 'ma_nghien_cuu;ma_lop_hp;ma_bai_danh_gia;lan_thi;ma_de;a;b';
  const base = applyCloImport(dsLike, 'diem_theo_bai', validateCloCsv('diem_theo_bai', `${head}\nNC-001;L1;QT;1;Q;2;3\nNC-002;L1;QT;1;Q;4;6`, cloValidationContext(dsLike)).records);
  const r = validateCloCsv('diem_theo_bai', `${head}\nNC-002;L1;QT;1;Q;3;5`, cloValidationContext(base));
  assert.equal(r.ok, true);
  assert.equal(r.issues.partial, 1); // NC-001 đã có điểm từ trước
  assert.equal(r.issues.absentWork, 1); // NC-003 chưa có điểm ở đâu cả
  assert.match(r.warnings.find((w) => w.issue === 'absentWork').message, /NC-003/);
  assert.doesNotMatch(r.warnings.find((w) => w.issue === 'absentWork').message, /NC-001/);
});

test('nhập CLO và ma trận tạo bản nháp chờ phê duyệt; trọng số phải cộng đủ 100%', () => {
  const clo = 'ma_hoc_phan,phien_ban,ma_clo,mo_ta,linh_vuc,muc_nang_luc,trong_so\nT,2,CLO1,Một,kien_thuc,3/6,60\nT,2,CLO2,Hai,ky_nang,4/5,30';
  const r = validateCloCsv('clo_hoc_phan', clo, cloValidationContext(dsLike));
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /90%/);
  const ok = validateCloCsv('clo_hoc_phan', clo.replace(',30', ',40'), cloValidationContext(dsLike));
  assert.equal(ok.ok, true);
  const next = applyCloImport(dsLike, 'clo_hoc_phan', ok.records, { user: { name: 'GV' } });
  const v = next.outcomes.versions.find((x) => x.id === 'T@2');
  assert.equal(v.status, 'draft');
  assert.equal(v.clos.length, 2);
  const again = validateCloCsv('clo_hoc_phan', clo.replace('T,2', 'T,1'), cloValidationContext(dsLike));
  assert.ok(again.errors.some((e) => /đã được phê duyệt/.test(e.message)));
});

// ---- Kịch bản dữ liệu mô phỏng (đề cương Nguyên lý kế toán) ------------------------------------------------
const ds = buildSyntheticDataset();
const o = ds.outcomes;
const versions = o.versions.map(resolveVersion);
const v2025 = versions.find((v) => v.id === 'ACP0371@2025');
const cohort = (sem, mode = 'latest') => {
  const cls = ds.classes.filter((c) => c.courseId === 'ACP0371' && c.semesterId === sem);
  return cls.map((c) => classResult({ rv: versionForClass(versions, c), roster: o.rosters[c.id], subs: o.submissions.filter((x) => x.c === c.id), mode }));
};
const pooledRate = (results, clo) => {
  const n = results.reduce((s, r) => s + r.clo[clo].n, 0);
  return results.reduce((s, r) => s + r.clo[clo].nAchieved, 0) / n;
};

test('đề cương 2025: kiểm tra ma trận phát hiện trọng số CLO3 và phân bổ bài thi cuối kỳ lệch', () => {
  assert.ok(close(v2025.planned.CLO3, 0.45));
  assert.ok(close(v2025.actual.CLO3, 0.3125));
  assert.ok(close(v2025.declared.CLO3, 0.3));
  const chk = checkMatrix(v2025);
  assert.ok(chk.items.some((x) => x.level === 'error' && x.clo === 'CLO3'));
  assert.ok(chk.items.some((x) => x.code === 'split-mismatch' && x.assessment === 'CK'));
  assert.ok(chk.items.some((x) => x.level === 'ok' && x.code === 'unmapped'));
  const draft = versions.find((v) => v.id === 'ACP0371@2026');
  assert.equal(checkMatrix(draft).errors, 0);
});

test('mô phỏng: CLO3 dưới mục tiêu ở HK1 2025–2026, vượt mục tiêu sau cải tiến ở HK2 2025–2026', () => {
  assert.ok(pooledRate(cohort('HK1-2526'), 'CLO3') < 0.6);
  assert.ok(pooledRate(cohort('HK2-2526'), 'CLO3') >= 0.7);
  const subs = o.submissions.filter((x) => x.c.startsWith('HK1-2526'));
  const par = errorPareto({ rv: v2025, subs, errorTypes: o.errorTypes, clo: 'CLO3' });
  assert.equal(par.groups[0].group, 'Định khoản');
  assert.ok(par.groups[0].share >= 0.45);
});

test('mô phỏng: học kỳ hiện tại lớp N02 đạt CLO2 thấp ở lần 1, đạt mục tiêu sau kiểm tra lại', () => {
  const [n01, n02] = cohort('HK1-2627', 'initial');
  const [, n02b] = cohort('HK1-2627', 'latest');
  assert.equal(n02.inProgress, true);
  assert.ok(n02.clo.CLO2.rate < 0.6);
  assert.ok(n02b.clo.CLO2.rate >= 0.7);
  assert.ok(n01.clo.CLO2.rate >= 0.7);
  assert.equal(n02.clo.CLO3.notAssessed, true);
  assert.ok(o.support.some((x) => x.classId.endsWith('ACP0371-N02') && x.reassess?.attempt === 2));
});

test('mô phỏng: rà soát đề và chấm – câu ghi nhầm đáp án, hai cán bộ chấm lệch ở câu 2a', () => {
  const subs = o.submissions.filter((x) => x.c.startsWith('HK2-2526'));
  const ia = itemAnalysis({ rv: v2025, subs, semesterId: 'HK2-2526', outcomes: o });
  const q = ia.mcqRows.find((x) => x.bankId === 'TN087');
  assert.ok(q && q.D < 0 && q.flags.some((f) => f.code === 'key'));
  const n02 = (sem) => o.submissions.filter((x) => x.c === `${sem}-ACP0371-N02`);
  const before = raterAnalysis({ rv: v2025, subs: n02('HK1-2526') }).rows.find((r) => r.code === 'TL2a');
  const after = raterAnalysis({ rv: v2025, subs: n02('HK2-2526') }).rows.find((r) => r.code === 'TL2a');
  assert.ok(before.over > 0.15, `trước: ${before.over}`);
  assert.ok(after.over < 0.05, `sau: ${after.over}`);
});

test('điểm học vụ của lớp có dữ liệu CLO được tính từ điểm chi tiết (một nguồn số liệu cho M3 và M6)', () => {
  const cls = ds.classes.find((c) => c.id === 'HK2-2526-ACP0371-N01');
  const res = classResult({ rv: versionForClass(versions, cls), roster: o.rosters[cls.id], subs: o.submissions.filter((x) => x.c === cls.id), mode: 'initial' });
  const g = ds.grades.filter((x) => x.classId === cls.id);
  assert.ok(g.length > 10);
  for (const row of g) {
    const s = res.students.find((x) => x.code === row.researchCode);
    assert.equal(row.source, 'clo');
    assert.equal(row.process, s.process);
    assert.equal(row.final, s.course);
  }
});
