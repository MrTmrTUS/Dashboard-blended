// Bộ dữ liệu CHẠY THỬ cuối kỳ HK1 2026–2027 cho M6 (học phần Nguyên lý kế toán – ACP0371).
// Mô phỏng phần còn lại của học kỳ đang diễn ra – chấm nốt bài kiểm tra, làm bù, bài tập thực hành, chuyên cần,
// thi cuối kỳ lần 1 (2 đề, chấm 2 vòng), thi lần 2 – thành đúng các tệp người dùng nhập ở M6 › Nhập và kiểm tra điểm.
// Mô hình sinh viên RIÊNG (không dùng bộ sinh dữ liệu M6): chỉ đọc danh sách lớp, điểm bài kiểm tra đã có, đề thi
// và đáp án ngân hàng câu hỏi. Có cài sẵn tình huống để thử chức năng phân tích:
//  - câu thứ 5 của đề D2 ghi nhầm đáp án → độ phân biệt âm ở mục Chất lượng đề và chấm;
//  - lớp N01: cán bộ chấm vòng 2 chặt hơn ở câu TL1 (≈ −0,55 điểm) → nhiều bài lệch quá dung sai;
//  - 3 sinh viên chuyên cần dưới 70% → cấm thi; vài sinh viên vắng thi → thi lần 2;
//  - tệp 6 có 11 loại lỗi cố ý để thử bộ kiểm tra.
// Sinh lại bằng `npm run samples`; tests/clo-chay-thu.test.mjs đối chiếu kết quả của bộ tính với cách tính độc lập.

export const RUN_CLASSES = ['HK1-2627-ACP0371-N01', 'HK1-2627-ACP0371-N02'];
const MARKER_1 = 'GV04'; // giảng viên phụ trách – chấm vòng 1
const MARKER_2 = 'GV01'; // cán bộ chấm thứ hai

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const logistic = (x) => 1 / (1 + Math.exp(-x));
const q25 = (v) => Math.round(v * 4) / 4;
const vn = (v) => (v === null || v === undefined ? '' : String(Math.round(v * 1000) / 1000).replace('.', ','));

const LONG = ['ma_nghien_cuu', 'ma_lop_hp', 'ma_bai_danh_gia', 'lan_thi', 'ma_de', 'ma_cau', 'diem', 'trang_thai', 'ngay', 'nguoi_cham_1', 'diem_cham_1', 'nguoi_cham_2', 'diem_cham_2', 'ma_loi', 'phuong_an'];
const csv = (cols, list) =>
  `﻿${[cols.join(';'), ...list.map((r) => cols.map((c) => { const v = String(r[c] ?? ''); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(';'))].join('\r\n')}\r\n`;

export function simulateEndOfSemester(ds, { seed = 20261118 } = {}) {
  const rand = mulberry32(seed);
  const normal = (m = 0, s = 1, r = rand) => {
    let u = 0;
    while (!u) u = r();
    return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  };
  const bern = (p) => rand() < p;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const poisson = (lambda) => {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rand();
    } while (p > L && k < 10);
    return k - 1;
  };

  const o = ds.outcomes;
  const version = o.versions.find((v) => v.id === 'ACP0371@2025');
  const A = Object.fromEntries(version.assessments.map((a) => [a.code, a]));
  const existing = o.submissions.filter((x) => RUN_CLASSES.includes(x.c));
  const ktFirst = new Map(existing.filter((x) => x.a === 'KT' && x.t === 1).map((x) => [`${x.c}|${x.s}`, x]));
  const pct = [...ktFirst.values()].filter((x) => x.st === 'graded').map((x) => (x.pts.TC1 + x.pts.TC2) / 10);
  const mu = pct.reduce((s, v) => s + v, 0) / pct.length;
  const sdv = Math.sqrt(pct.reduce((s, v) => s + (v - mu) ** 2, 0) / (pct.length - 1));

  // Năng lực ước từ bài kiểm tra đã có (thêm nhiễu); mức gắn kết ước từ tỷ lệ chuyên cần.
  const students = [];
  for (const c of RUN_CLASSES) {
    for (const r of o.rosters[c]) {
      const kt = ktFirst.get(`${c}|${r.s}`);
      const theta = kt?.st === 'graded' ? 0.75 * (((kt.pts.TC1 + kt.pts.TC2) / 10 - mu) / sdv) + normal(0, 0.55) : normal(-0.2, 0.9);
      const eta = clamp((r.att - 0.92) / 0.05, -3, 2) + normal(0, 0.6);
      students.push({ c, s: r.s, st: r.st, att0: r.att, theta, eta, section: c.slice(-3) });
    }
  }
  // Chuyên cần cuối kỳ hơi giảm; 3 sinh viên gắn kết thấp nhất (1 ở N01, 2 ở N02) dưới 70% → cấm thi.
  for (const st of students) st.att = clamp(st.att0 - Math.abs(normal(0, 0.025)), 0.3, 1);
  for (const [c, n] of [[RUN_CLASSES[0], 1], [RUN_CLASSES[1], 2]]) {
    students.filter((x) => x.c === c && x.st === 'active').sort((a, b) => a.eta - b.eta).slice(0, n).forEach((x) => (x.att = 0.6 + rand() * 0.08));
  }
  for (const st of students) st.att = Math.round(st.att * 100) / 100;
  const active = students.filter((x) => x.st === 'active');

  const rows = { roster: [], wide: [], longKT_TH: [], ck1: [], ck2: [] };
  for (const st of students) rows.roster.push({ ma_lop_hp: st.c, ma_nghien_cuu: st.s, trang_thai: st.st === 'active' ? 'dang_hoc' : 'rut_hoc_phan', ty_le_chuyen_can: Math.round(st.att * 100) });

  const records = []; // bài làm mới { c, s, a, t, f, st, pts } – để kiểm thử tính kết quả mong đợi
  const errorsFor = (it, frac) => {
    if (!it.errors?.length) return [];
    const k = Math.min(3, poisson((1 - frac) * 3));
    return Array.from({ length: k }, () => pick(it.errors));
  };
  const longRow = (st, a, t, f, state, date, extra = {}) => ({ ma_nghien_cuu: st.s, ma_lop_hp: st.c, ma_bai_danh_gia: a, lan_thi: t, ma_de: f ?? '', ma_cau: '', diem: '', trang_thai: state, ngay: date, nguoi_cham_1: '', diem_cham_1: '', nguoi_cham_2: '', diem_cham_2: '', ma_loi: '', phuong_an: '', ...extra });
  const rubric = (skill, max, noise = 0.08) => clamp(q25(clamp(logistic(1.6 * skill) + normal(0, noise), 0, 1) * max), 0, max);

  // Bài kiểm tra: chấm nốt 3 bài chưa chấm (N01); 2 bạn vắng làm bù bằng đề tương đương (lần 2).
  for (const st of active) {
    const kt = ktFirst.get(`${st.c}|${st.s}`);
    if (kt?.st !== 'pending' && kt?.st !== 'absent') continue;
    const [t, f, date, d1, d2] = kt.st === 'pending' ? [1, 'KT1', '30/10/2026', 0.9, 0.5] : [2, 'KT2', '24/11/2026', 0.8, 0.4];
    const pts = { TC1: rubric(st.theta + d1, 6), TC2: rubric(st.theta + d2, 4) };
    records.push({ c: st.c, s: st.s, a: 'KT', t, f, st: 'graded', pts });
    for (const it of A.KT.items) rows.longKT_TH.push(longRow(st, 'KT', t, f, 'da_cham', date, { ma_cau: it.code, diem: vn(pts[it.code]), ma_loi: errorsFor(it, pts[it.code] / it.max).join('|') }));
  }
  // Bài tập thực hành (nộp trên LMS); N02 vẫn yếu hơn ở định khoản.
  for (const st of active) {
    if (bern(st.eta < -1 ? 0.12 : 0.03)) {
      records.push({ c: st.c, s: st.s, a: 'TH', t: 1, f: null, st: 'absent' });
      rows.longKT_TH.push(longRow(st, 'TH', 1, null, 'vang', '11/12/2026'));
      continue;
    }
    const dk = st.section === 'N02' ? 0.25 : 0.55;
    const pts = { TC1: rubric(st.theta + 0.7, 2.5), TC2: rubric(st.theta + dk, 2.5), TC3: rubric(st.theta + 0.45, 2.5), TC4: rubric(0.6 * st.theta + 0.3 * st.eta + 0.6, 2.5) };
    records.push({ c: st.c, s: st.s, a: 'TH', t: 1, f: 'TH', st: 'graded', pts });
    for (const it of A.TH.items) rows.longKT_TH.push(longRow(st, 'TH', 1, 'TH', 'da_cham', '11/12/2026', { ma_cau: it.code, diem: vn(pts[it.code]), ma_loi: errorsFor(it, pts[it.code] / it.max).join('|') }));
  }
  // Chuyên cần, thái độ: bảng Excel, mỗi sinh viên một dòng.
  for (const st of active) {
    const pts = { TC1: clamp(q25(3 * clamp((st.att - 0.5) / 0.5, 0, 1)), 0, 3), TC2: rubric(0.8 * st.eta + 0.35 * st.theta + 0.7, 2, 0.06), TC3: rubric(0.9 * st.eta + 0.3 * st.theta + 1.1, 5, 0.05) };
    records.push({ c: st.c, s: st.s, a: 'CC', t: 1, f: 'CC', st: 'graded', pts });
    rows.wide.push({ ma_nghien_cuu: st.s, ma_lop_hp: st.c, ma_bai_danh_gia: 'CC', lan_thi: 1, ma_de: 'CC', trang_thai: 'da_cham', ngay: '31/12/2026', TC1: vn(pts.TC1), TC2: vn(pts.TC2), TC3: vn(pts.TC3), tong_diem: vn(pts.TC1 + pts.TC2 + pts.TC3) });
  }

  // Thi cuối kỳ: trắc nghiệm theo đề (tham số câu riêng, đáp án theo ngân hàng) + 3 câu tự luận chấm 2 vòng.
  const qParams = (id) => {
    const r = mulberry32(hash(`q:${id}`));
    const wrong = ['A', 'B', 'C', 'D'].filter((x) => x !== o.bank[id].key);
    return { b: normal(-0.2, 0.8, r), a: 0.8 + 0.8 * r(), lure: Object.fromEntries(wrong.map((x) => [x, 0.4 + r()])) };
  };
  const D2 = o.forms['HK1-2627|CK|D2'];
  const trap = { id: D2[4], form: 'D2', position: 5, key: o.bank[D2[4]].key };
  trap.truth = ['A', 'B', 'C', 'D'][(['A', 'B', 'C', 'D'].indexOf(trap.key) + 1) % 4];
  const answer = (id, theta) => {
    const p = qParams(id);
    const key = o.bank[id].key;
    const truth = id === trap.id ? trap.truth : key;
    if (rand() < 0.25 + 0.75 * logistic(1.7 * p.a * (theta - p.b))) return truth;
    const lures = Object.entries(p.lure).filter(([x]) => x !== truth);
    if (id === trap.id) lures.push([key, 1.2]);
    let x = rand() * lures.reduce((s, [, w]) => s + w, 0);
    for (const [opt, w] of lures) if ((x -= w) <= 0) return opt;
    return lures[lures.length - 1][0];
  };
  const raterBias = { [RUN_CLASSES[0]]: { TL1: -0.55, TL2a: 0, TL2b: 0 }, [RUN_CLASSES[1]]: { TL1: 0, TL2a: 0.05, TL2b: 0 } };
  const exam = (st, t, form, boost, date) => {
    const ids = o.forms[`HK1-2627|CK|${form}`];
    const opt = ids.map((id) => answer(id, st.theta + boost)).join('');
    const pts = { TN: [...opt].filter((x, k) => x === o.bank[ids[k]].key).length * 0.25 };
    const dk = st.section === 'N02' ? 0.2 : 0.4;
    const truth = { TL1: st.theta + boost + 0.35, TL2a: st.theta + boost + dk, TL2b: st.theta + boost + 0.3 };
    const out = [longRow(st, 'CK', t, form, 'da_cham', date, { ma_cau: 'TN', diem: vn(pts.TN), phuong_an: opt })];
    for (const it of A.CK.items.filter((x) => x.code !== 'TN')) {
      const real = clamp(logistic(1.6 * truth[it.code]) * it.max + normal(0, 0.12), 0, it.max);
      const r1 = clamp(q25(real + normal(0, 0.14)), 0, it.max);
      const r2 = clamp(q25(real + raterBias[st.c][it.code] + normal(0, 0.14)), 0, it.max);
      pts[it.code] = Math.abs(r1 - r2) <= 0.5 ? clamp(q25((r1 + r2) / 2), 0, it.max) : clamp(q25(real), 0, it.max); // lệch > 0,5 → chấm vòng 3
      out.push(longRow(st, 'CK', t, form, 'da_cham', date, { ma_cau: it.code, diem: vn(pts[it.code]), nguoi_cham_1: MARKER_1, diem_cham_1: vn(r1), nguoi_cham_2: MARKER_2, diem_cham_2: vn(r2), ma_loi: errorsFor(it, pts[it.code] / it.max).join('|') }));
    }
    records.push({ c: st.c, s: st.s, a: 'CK', t, f: form, st: 'graded', pts });
    return out;
  };
  for (const st of active) {
    if (st.att < 0.7) {
      records.push({ c: st.c, s: st.s, a: 'CK', t: 1, f: null, st: 'banned' });
      rows.ck1.push(longRow(st, 'CK', 1, null, 'cam_thi', '07/01/2027'));
    } else if (bern(0.03)) {
      records.push({ c: st.c, s: st.s, a: 'CK', t: 1, f: null, st: 'absent' });
      rows.ck1.push(longRow(st, 'CK', 1, null, 'vang', '07/01/2027'));
    } else rows.ck1.push(...exam(st, 1, bern(0.5) ? 'D1' : 'D2', 0, '07/01/2027'));
  }
  // Thi lần 2 (đề D3/D4): vắng thi lần 1, hoặc điểm học phần lần 1 dưới 4,0; 85% đăng ký thi lại.
  const all = [...existing.filter((x) => !records.some((n) => n.c === x.c && n.s === x.s && n.a === x.a && n.t === x.t)), ...records];
  const scoreOf = (st, a) => {
    const x = all.find((y) => y.c === st.c && y.s === st.s && y.a === a && y.t === 1);
    return x?.st === 'graded' ? (10 * Object.values(x.pts).reduce((s, v) => s + v, 0)) / A[a].items.reduce((s, it) => s + it.max, 0) : 0;
  };
  for (const st of active) {
    const ck1 = records.find((x) => x.s === st.s && x.c === st.c && x.a === 'CK' && x.t === 1);
    const r1 = (v) => Math.round(v * 10 + 1e-9) / 10;
    const course = r1(version.assessments.reduce((s, a) => s + a.weight * (a.group === 'A2' ? r1(scoreOf(st, a.code)) : scoreOf(st, a.code)), 0));
    const eligible = ck1.st === 'absent' || (ck1.st === 'graded' && course < 4);
    if (eligible && bern(0.85)) rows.ck2.push(...exam(st, 2, bern(0.5) ? 'D3' : 'D4', 0.45, '04/02/2027'));
  }

  // Tệp 6: 11 loại lỗi cố ý trên bản sao bài thi lần 1 của 11 sinh viên.
  const good = rows.ck1.filter((r) => r.trang_thai === 'da_cham');
  const codes = [...new Set(good.map((r) => r.ma_nghien_cuu))];
  const take = (i) => good.filter((r) => r.ma_nghien_cuu === codes[i]).map((r) => ({ ...r }));
  const set = (list, field, value) => list.forEach((r) => (r[field] = value));
  const bad = [];
  let x;
  x = take(0); x.find((r) => r.ma_cau === 'TL2a').diem = '3'; bad.push(...x); // vượt điểm tối đa 2,5
  x = take(1); set(x, 'ma_de', 'D5'); bad.push(...x); // sai mã đề
  x = take(2); set(x, 'lan_thi', 3); bad.push(...x); // lần 3 – chỉ có 2 lần
  x = take(3); set(x, 'ma_nghien_cuu', 'NC-99999'); bad.push(...x); // không thuộc lớp
  x = take(4); bad.push(...x, { ...x[1] }); // trùng dòng
  x = take(5); bad.push(...x.filter((r) => r.ma_cau !== 'TL1')); // thiếu điểm câu TL1
  x = take(6); set(x, 'ma_nghien_cuu', '2025123456'); bad.push(...x); // giống mã sinh viên thật
  x = take(7); set(x, 'trang_thai', 'có mặt'); bad.push(...x); // trạng thái không hợp lệ
  x = take(8); x.find((r) => r.ma_cau === 'TL2b').diem = 'abc'; bad.push(...x); // không phải số
  x = take(9); x.find((r) => r.ma_cau === 'TL2b').ma_cau = 'TL3'; bad.push(...x); // câu không có trong đề
  x = take(10); set(x, 'ma_lop_hp', 'HK1-2627-ACP0371-N09'); bad.push(...x); // lớp không có trong danh mục

  const files = [
    { name: '1_danh_sach_lop_cuoi_ky.csv', kind: 'danh_sach_lop', text: csv(['ma_lop_hp', 'ma_nghien_cuu', 'trang_thai', 'ty_le_chuyen_can'], rows.roster) },
    { name: '2_diem_chuyen_can_excel.csv', kind: 'diem_theo_bai', text: csv(['ma_nghien_cuu', 'ma_lop_hp', 'ma_bai_danh_gia', 'lan_thi', 'ma_de', 'trang_thai', 'ngay', 'TC1', 'TC2', 'TC3', 'tong_diem'], rows.wide) },
    { name: '3_diem_kiem_tra_thuc_hanh_lms.csv', kind: 'diem_chi_tiet', text: csv(LONG, rows.longKT_TH) },
    { name: '4_diem_thi_cuoi_ky_lan1_lms.csv', kind: 'diem_chi_tiet', text: csv(LONG, rows.ck1) },
    { name: '5_diem_thi_lan2_lms.csv', kind: 'diem_chi_tiet', text: csv(LONG, rows.ck2) },
    { name: '6_tep_co_loi_de_thu.csv', kind: 'diem_chi_tiet', text: csv(LONG, bad) },
  ];
  const scenario = { trap, raterBias, banned: active.filter((s) => s.att < 0.7).map((s) => s.s) };
  return { files, records, students, scenario };
}
