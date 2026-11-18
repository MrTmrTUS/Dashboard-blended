// Nhập và kiểm tra dữ liệu đánh giá theo CLO (nghiệp vụ 1 – 3): CLO học phần, ma trận đánh giá,
// danh sách lớp, điểm chi tiết (dạng dài từ LMS hoặc dạng bảng Excel mỗi sinh viên một dòng).
// Báo lỗi theo dòng: trùng sinh viên, thiếu điểm, vượt điểm tối đa, sai mã đề, sai lần thi, sinh viên ngoài lớp…
// Không nhận mã sinh viên thật – chỉ mã nghiên cứu (cùng quy tắc với M0 › Nhập dữ liệu).
import { parseCsv, toCsv } from './csv.js';
import { parseViNumber } from './format.js';
import { itemWeights, resolveVersion, versionForClass } from './clo.js';

export const CLO_TEMPLATES = {
  clo_hoc_phan: {
    file: 'clo_hoc_phan.csv',
    title: 'CLO của học phần (Bảng 2 đề cương)',
    required: ['ma_hoc_phan', 'phien_ban', 'ma_clo', 'mo_ta', 'linh_vuc', 'muc_nang_luc', 'trong_so'],
    optional: ['ma_plo', 'ma_pi', 'chuong', 'nguong_dat'],
    note: 'linh_vuc: kien_thuc / ky_nang / tu_chu. muc_nang_luc dạng 3/6 hoặc 4/5. trong_so tính theo %, tổng mỗi học phần – phiên bản = 100. Bản nhập vào ở trạng thái bản nháp, cần phê duyệt.',
  },
  ma_tran_danh_gia: {
    file: 'ma_tran_danh_gia.csv',
    title: 'Ma trận câu hỏi/tiêu chí × CLO (Bảng 4 – 5, rubric, cấu trúc đề)',
    required: ['ma_hoc_phan', 'phien_ban', 'ma_bai_danh_gia', 'ten_bai', 'nhom', 'trong_so_bai', 'ma_cau', 'noi_dung', 'diem_toi_da', 'ma_clo'],
    optional: ['hinh_thuc', 'ma_de', 'ma_de_lan_2', 'so_lan_toi_da', 'chuong', 'phan_bo_clo', 'ma_loi'],
    note: 'Mỗi dòng một câu hỏi/tiêu chí. ma_clo: "CLO3" hoặc "CLO3:0,5|CLO4:0,5". phan_bo_clo (khai báo ở Bảng 4): "CLO1:10|CLO2:5" (%). nhom: A1 (quá trình) / A2 (cuối kỳ).',
  },
  danh_sach_lop: {
    file: 'danh_sach_lop.csv',
    title: 'Danh sách sinh viên thuộc diện đánh giá',
    required: ['ma_lop_hp', 'ma_nghien_cuu'],
    optional: ['trang_thai', 'ty_le_chuyen_can'],
    note: 'trang_thai: dang_hoc / rut_hoc_phan. ty_le_chuyen_can: % số buổi có mặt (đề cương yêu cầu tối thiểu 70% để dự thi).',
  },
  diem_chi_tiet: {
    file: 'diem_chi_tiet.csv',
    title: 'Điểm chi tiết dạng dài (xuất từ LMS, mỗi dòng một câu/tiêu chí)',
    required: ['ma_nghien_cuu', 'ma_lop_hp', 'ma_bai_danh_gia', 'lan_thi', 'ma_de', 'ma_cau', 'diem'],
    optional: ['trang_thai', 'ngay', 'nguoi_cham_1', 'diem_cham_1', 'nguoi_cham_2', 'diem_cham_2', 'ma_loi', 'phuong_an'],
    note: 'trang_thai: da_cham (mặc định) / chua_cham / vang / cam_thi – với vang, cam_thi, chua_cham để trống điểm. ma_loi: các mã dạng lỗi cách nhau bằng "|". phuong_an: chuỗi phương án đã chọn của phần trắc nghiệm, ví dụ ABDC…',
  },
  diem_theo_bai: {
    file: 'diem_theo_bai.csv',
    title: 'Điểm theo bài dạng bảng (Excel – mỗi sinh viên một dòng)',
    required: ['ma_nghien_cuu', 'ma_lop_hp', 'ma_bai_danh_gia', 'lan_thi', 'ma_de'],
    optional: ['trang_thai', 'ngay', 'tong_diem'],
    note: 'Sau các cột bắt buộc là một cột cho mỗi câu/tiêu chí, đặt tên đúng mã câu trong ma trận (ví dụ TC1, TC2 hoặc TN, TL1, TL2a, TL2b). Ô trống = thiếu điểm.',
  },
};

export const CLO_IMPORT_ORDER = ['clo_hoc_phan', 'ma_tran_danh_gia', 'danh_sach_lop', 'diem_chi_tiet', 'diem_theo_bai'];

const STATE_IN = { '': 'graded', da_cham: 'graded', 'đã chấm': 'graded', chua_cham: 'pending', 'chưa chấm': 'pending', vang: 'absent', 'vắng': 'absent', khong_nop: 'absent', cam_thi: 'banned', 'cấm thi': 'banned' };
export const STATE_OUT = { graded: 'da_cham', pending: 'chua_cham', absent: 'vang', banned: 'cam_thi' };
const DOMAIN_IN = { kien_thuc: 'kien_thuc', 'kiến thức': 'kien_thuc', ky_nang: 'ky_nang', 'kỹ năng': 'ky_nang', tu_chu: 'tu_chu', 'tự chủ': 'tu_chu', 'tự chủ và trách nhiệm': 'tu_chu' };
const MODE_IN = { '': 'truc_tiep', truc_tiep: 'truc_tiep', 'trực tiếp': 'truc_tiep', truc_tuyen: 'truc_tuyen', 'trực tuyến': 'truc_tuyen', lms: 'truc_tuyen', ket_hop: 'ket_hop', 'kết hợp': 'ket_hop' };
const looksLikeRealStudentId = (code) => /^\d{8,12}$/.test(code);
const lc = (t) => String(t || '').charAt(0).toLowerCase() + String(t || '').slice(1);
const RESEARCH_CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,29}$/;
const MAX_REPORTED = 300;

function makeReport(kind, parsed) {
  return { kind, template: CLO_TEMPLATES[kind], header: parsed.header, delimiter: parsed.delimiter, totalRows: parsed.rows.length, errors: [], warnings: [], errorCount: 0, warningCount: 0, records: [], preview: parsed.rows.slice(0, 10), summary: {}, issues: {} };
}

function push(report, type, line, column, message, issue) {
  const list = type === 'error' ? report.errors : report.warnings;
  if (type === 'error') report.errorCount++;
  else report.warningCount++;
  if (issue) report.issues[issue] = (report.issues[issue] || 0) + 1;
  if (list.length < MAX_REPORTED) list.push({ line, column, message, issue: issue || null });
}

export const ISSUE_LABELS = {
  duplicate: 'Trùng sinh viên / trùng dòng',
  missing: 'Thiếu điểm',
  over: 'Vượt điểm tối đa',
  form: 'Sai mã đề',
  attempt: 'Sai lần thi',
  roster: 'Sinh viên không thuộc lớp',
  item: 'Mã câu, mã bài không có trong ma trận',
  value: 'Giá trị không hợp lệ',
  class: 'Lớp chưa có bộ quy tắc CLO',
  privacy: 'Có vẻ là mã sinh viên thật',
  total: 'Tổng điểm không khớp',
  absentWork: 'Thiếu bài (cảnh báo)',
};

// Ngữ cảnh kiểm tra: danh mục lớp, bộ quy tắc, danh sách lớp, điểm đã có (để xét lần thi 2).
export function cloValidationContext(ds) {
  const o = ds.outcomes || {};
  const versions = (o.versions || []).map(resolveVersion);
  const submissions = o.submissions || [];
  const attempt1 = new Set(submissions.filter((x) => x.t === 1).map((x) => `${x.c}|${x.s}|${x.a}`));
  return {
    classes: new Map(ds.classes.map((c) => [c.id, c])),
    courses: new Map(ds.courses.map((c) => [c.id, c])),
    versions,
    rosters: o.rosters || {},
    attempt1,
    errorCodes: new Set((o.errorTypes || []).map((e) => e.code)),
  };
}

export function validateCloCsv(kind, text, ctx) {
  const tpl = CLO_TEMPLATES[kind];
  if (!tpl) throw new Error(`Không có mẫu tệp "${kind}"`);
  const parsed = parseCsv(text);
  const report = makeReport(kind, parsed);
  if (!parsed.header.length) {
    push(report, 'error', 1, null, 'Tệp rỗng hoặc không đọc được dòng tiêu đề');
    return finalize(report);
  }
  const missing = tpl.required.filter((c) => !parsed.header.includes(c));
  if (missing.length) {
    push(report, 'error', 1, null, `Thiếu cột bắt buộc: ${missing.join(', ')}`);
    return finalize(report);
  }
  const dupHeader = parsed.header.filter((h, i) => h && parsed.header.indexOf(h) !== i);
  if (dupHeader.length) push(report, 'error', 1, null, `Cột bị trùng tên: ${[...new Set(dupHeader)].join(', ')}`);
  if (!parsed.rows.length) push(report, 'error', 2, null, 'Tệp không có dòng dữ liệu');
  const fn = { clo_hoc_phan: checkClos, ma_tran_danh_gia: checkMatrixFile, danh_sach_lop: checkRoster, diem_chi_tiet: checkScoresLong, diem_theo_bai: checkScoresWide }[kind];
  fn(parsed, report, ctx);
  return finalize(report);
}

function finalize(report) {
  report.ok = report.errorCount === 0;
  return report;
}

const num = (s) => parseViNumber(s);

// ---- CLO, ma trận ------------------------------------------------------------------------------------

function checkClos(parsed, report, ctx) {
  const groups = new Map();
  parsed.rows.forEach((row, i) => {
    const line = parsed.lines[i];
    const err = (col, msg) => push(report, 'error', line, col, msg, 'value');
    for (const c of CLO_TEMPLATES.clo_hoc_phan.required) if (!row[c]) return err(c, 'Không được để trống');
    if (!ctx.courses.has(row.ma_hoc_phan)) return push(report, 'error', line, 'ma_hoc_phan', `Học phần "${row.ma_hoc_phan}" không có trong danh mục`, 'item');
    if (!/^CLO\d{1,2}$/i.test(row.ma_clo)) return err('ma_clo', `"${row.ma_clo}" phải có dạng CLO1, CLO2…`);
    const domain = DOMAIN_IN[String(row.linh_vuc).trim().toLowerCase()];
    if (!domain) return err('linh_vuc', `"${row.linh_vuc}" phải là kien_thuc, ky_nang hoặc tu_chu`);
    const m = String(row.muc_nang_luc).match(/^(\d)(?:\s*\/\s*(\d))?$/);
    const scale = domain === 'kien_thuc' ? 6 : 5;
    if (!m || Number(m[1]) < 1 || Number(m[1]) > scale || (m[2] && Number(m[2]) !== scale)) return err('muc_nang_luc', `"${row.muc_nang_luc}" phải là bậc 1 – ${scale} trên thang ${scale} (ví dụ 3/${scale})`);
    const w = num(row.trong_so);
    if (w === null || w <= 0 || w > 100) return err('trong_so', `"${row.trong_so}" phải là số % trong khoảng (0; 100]`);
    const thr = row.nguong_dat ? num(row.nguong_dat) : null;
    if (row.nguong_dat && (thr === null || thr < 0 || thr > 10)) return err('nguong_dat', `"${row.nguong_dat}" phải trong khoảng 0 – 10`);
    const id = `${row.ma_hoc_phan}@${row.phien_ban}`;
    const existing = ctx.versions.find((v) => v.id === id);
    if (existing && existing.status === 'approved') return push(report, 'error', line, 'phien_ban', `Phiên bản ${row.phien_ban} của ${row.ma_hoc_phan} đã được phê duyệt – đặt tên phiên bản mới`, 'value');
    if (!groups.has(id)) groups.set(id, { id, courseId: row.ma_hoc_phan, version: row.phien_ban, clos: [], lines: [] });
    const g = groups.get(id);
    const code = row.ma_clo.toUpperCase();
    if (g.clos.some((c) => c.code === code)) return push(report, 'error', line, 'ma_clo', `Trùng ${code} trong phiên bản ${row.phien_ban}`, 'duplicate');
    g.clos.push({ code, text: row.mo_ta, short: row.mo_ta.slice(0, 60), domain, level: Number(m[1]), plo: row.ma_plo || '', pi: row.ma_pi || '', weight: w / 100, chapters: row.chuong ? row.chuong.split('|').map((x) => x.trim()) : [], ...(thr !== null ? { pass: thr } : {}) });
    g.lines.push(line);
  });
  for (const g of groups.values()) {
    const total = g.clos.reduce((s, c) => s + c.weight, 0);
    if (Math.abs(total - 1) > 0.005) push(report, 'error', g.lines[0], 'trong_so', `Tổng trọng số CLO của ${g.courseId} phiên bản ${g.version} là ${Math.round(total * 1000) / 10}%, phải bằng 100%`, 'value');
    report.records.push(g);
  }
  report.summary = { 'phiên bản': report.records.map((g) => `${g.courseId} ${g.version}`), CLO: report.records.reduce((s, g) => s + g.clos.length, 0) };
}

function parseCloMap(text) {
  const s = String(text || '').trim();
  if (!s) return {};
  const out = {};
  for (const part of s.split('|')) {
    const [code, w] = part.split(':').map((x) => x.trim());
    if (!/^CLO\d{1,2}$/i.test(code)) return null;
    const v = w === undefined || w === '' ? 1 : num(w);
    if (v === null || v <= 0) return null;
    out[code.toUpperCase()] = v;
  }
  return out;
}

function checkMatrixFile(parsed, report, ctx) {
  const groups = new Map();
  parsed.rows.forEach((row, i) => {
    const line = parsed.lines[i];
    const err = (col, msg, issue = 'value') => push(report, 'error', line, col, msg, issue);
    for (const c of ['ma_hoc_phan', 'phien_ban', 'ma_bai_danh_gia', 'ten_bai', 'nhom', 'trong_so_bai', 'ma_cau', 'noi_dung', 'diem_toi_da']) if (!row[c]) return err(c, 'Không được để trống');
    if (!ctx.courses.has(row.ma_hoc_phan)) return err('ma_hoc_phan', `Học phần "${row.ma_hoc_phan}" không có trong danh mục`, 'item');
    const id = `${row.ma_hoc_phan}@${row.phien_ban}`;
    const existing = ctx.versions.find((v) => v.id === id);
    if (existing && existing.status === 'approved') return err('phien_ban', `Phiên bản ${row.phien_ban} đã được phê duyệt – đặt tên phiên bản mới`);
    if (!['A1', 'A2'].includes(String(row.nhom).toUpperCase())) return err('nhom', `"${row.nhom}" phải là A1 (quá trình) hoặc A2 (cuối kỳ)`);
    const wa = num(row.trong_so_bai);
    if (wa === null || wa <= 0 || wa > 100) return err('trong_so_bai', `"${row.trong_so_bai}" phải là số % trong khoảng (0; 100]`);
    const max = num(row.diem_toi_da);
    if (max === null || max <= 0 || max > 100) return err('diem_toi_da', `"${row.diem_toi_da}" phải là số dương`);
    const clos = parseCloMap(row.ma_clo);
    if (clos === null) return err('ma_clo', `"${row.ma_clo}" phải có dạng CLO3 hoặc CLO3:0,5|CLO4:0,5`);
    if (!Object.keys(clos).length) push(report, 'warning', line, 'ma_clo', `Câu ${row.ma_cau} chưa gắn CLO – sẽ bị báo ở bước kiểm tra ma trận`, 'value');
    const mode = MODE_IN[String(row.hinh_thuc || '').trim().toLowerCase()];
    if (!mode) return err('hinh_thuc', `"${row.hinh_thuc}" phải là truc_tiep, truc_tuyen hoặc ket_hop`);
    const declared = row.phan_bo_clo ? parseCloMap(row.phan_bo_clo) : null;
    if (row.phan_bo_clo && declared === null) return err('phan_bo_clo', `"${row.phan_bo_clo}" phải có dạng CLO1:10|CLO2:5`);
    if (!groups.has(id)) groups.set(id, { id, courseId: row.ma_hoc_phan, version: row.phien_ban, assessments: new Map(), line });
    const g = groups.get(id);
    const code = row.ma_bai_danh_gia;
    if (!g.assessments.has(code)) {
      g.assessments.set(code, {
        code,
        ref: String(row.nhom).toUpperCase(),
        group: String(row.nhom).toUpperCase(),
        name: row.ten_bai,
        weight: wa / 100,
        mode,
        forms: row.ma_de ? row.ma_de.split('|').map((x) => x.trim()).filter(Boolean) : [code],
        retakeForms: row.ma_de_lan_2 ? row.ma_de_lan_2.split('|').map((x) => x.trim()).filter(Boolean) : [],
        maxAttempts: row.so_lan_toi_da ? Math.max(1, Math.round(num(row.so_lan_toi_da) || 1)) : 1,
        declared: declared ? Object.fromEntries(Object.entries(declared).map(([c, v]) => [c, v / 100])) : null,
        items: [],
        line,
      });
    } else if (Math.abs(g.assessments.get(code).weight - wa / 100) > 1e-9) {
      return err('trong_so_bai', `Bài ${code} có trọng số khác nhau giữa các dòng`);
    }
    const a = g.assessments.get(code);
    if (a.items.some((it) => it.code === row.ma_cau)) return err('ma_cau', `Trùng mã câu ${row.ma_cau} trong bài ${code}`, 'duplicate');
    const errs = row.ma_loi ? row.ma_loi.split('|').map((x) => x.trim()).filter(Boolean) : undefined;
    a.items.push({ code: row.ma_cau, label: row.noi_dung, max, clos, chapter: row.chuong || null, ...(errs ? { errors: errs } : {}) });
  });
  for (const g of groups.values()) {
    const assessments = [...g.assessments.values()];
    const total = assessments.reduce((s, a) => s + a.weight, 0);
    if (Math.abs(total - 1) > 0.005) push(report, 'error', g.line, 'trong_so_bai', `Tổng trọng số các bài đánh giá của ${g.courseId} phiên bản ${g.version} là ${Math.round(total * 1000) / 10}%, phải bằng 100%`, 'value');
    report.records.push({ id: g.id, courseId: g.courseId, version: g.version, assessments: assessments.map(({ line, ...a }) => a) });
  }
  report.summary = { 'phiên bản': report.records.map((g) => `${g.courseId} ${g.version}`), 'bài đánh giá': report.records.reduce((s, g) => s + g.assessments.length, 0), 'câu/tiêu chí': report.records.reduce((s, g) => s + g.assessments.reduce((t, a) => t + a.items.length, 0), 0) };
}

function checkRoster(parsed, report, ctx) {
  const seen = new Set();
  parsed.rows.forEach((row, i) => {
    const line = parsed.lines[i];
    if (!ctx.classes.has(row.ma_lop_hp)) return push(report, 'error', line, 'ma_lop_hp', `Lớp "${row.ma_lop_hp}" không có trong danh mục`, 'item');
    const code = row.ma_nghien_cuu;
    if (looksLikeRealStudentId(code)) return push(report, 'error', line, 'ma_nghien_cuu', 'Có vẻ là mã sinh viên thật – chỉ nhận mã nghiên cứu', 'privacy');
    if (!RESEARCH_CODE.test(code)) return push(report, 'error', line, 'ma_nghien_cuu', `"${code}" không hợp lệ`, 'value');
    const key = `${row.ma_lop_hp}|${code}`;
    if (seen.has(key)) return push(report, 'error', line, 'ma_nghien_cuu', `Trùng sinh viên ${code} trong lớp`, 'duplicate');
    seen.add(key);
    const stIn = String(row.trang_thai || '').trim().toLowerCase();
    if (stIn && !['dang_hoc', 'đang học', 'rut_hoc_phan', 'rút học phần'].includes(stIn)) return push(report, 'error', line, 'trang_thai', `"${row.trang_thai}" phải là dang_hoc hoặc rut_hoc_phan`, 'value');
    const att = row.ty_le_chuyen_can ? num(row.ty_le_chuyen_can) : null;
    if (row.ty_le_chuyen_can && (att === null || att < 0 || att > 100)) return push(report, 'error', line, 'ty_le_chuyen_can', `"${row.ty_le_chuyen_can}" phải trong khoảng 0 – 100`, 'value');
    report.records.push({ c: row.ma_lop_hp, s: code, st: stIn.startsWith('r') ? 'withdrawn' : 'active', att: att === null ? null : att / 100 });
  });
  report.summary = { 'sinh viên': report.records.length, lớp: new Set(report.records.map((r) => r.c)).size };
}

// ---- Điểm chi tiết -----------------------------------------------------------------------------------

function scoreContext(ctx, classId) {
  const cls = ctx.classes.get(classId);
  if (!cls) return { error: `Lớp "${classId}" không có trong danh mục`, issue: 'item' };
  const rv = versionForClass(ctx.versions, cls);
  if (!rv) return { error: `Lớp "${classId}" chưa có bộ quy tắc CLO đã phê duyệt cho học kỳ này`, issue: 'class' };
  return { cls, rv };
}

// Kiểm tra một bản ghi (sinh viên × bài × lần) đã gom điểm từng câu.
function checkSubmission(report, ctx, rec, lines, seenAttempt1) {
  const { rv } = rec;
  const a = rv.aByCode.get(rec.a);
  const line = lines[0];
  const err = (col, msg, issue) => {
    push(report, 'error', line, col, msg, issue);
    return false;
  };
  if (!a) return err('ma_bai_danh_gia', `Mã bài "${rec.a}" không có trong ma trận của ${rv.courseName ?? rv.courseId} (${rv.version})`, 'item');
  if (!Number.isInteger(rec.t) || rec.t < 1) return err('lan_thi', `Lần thi "${rec.rawT}" phải là số nguyên ≥ 1`, 'attempt');
  if (rec.t > (a.maxAttempts || 1)) return err('lan_thi', `${a.name} chỉ có tối đa ${a.maxAttempts || 1} lần đánh giá, tệp ghi lần ${rec.t}`, 'attempt');
  if (rec.t > 1 && !seenAttempt1.has(`${rec.c}|${rec.s}|${rec.a}`) && !ctx.attempt1.has(`${rec.c}|${rec.s}|${rec.a}`)) {
    return err('lan_thi', `Sinh viên ${rec.s} có lần ${rec.t} nhưng chưa có lần 1 của ${lc(a.name)}`, 'attempt');
  }
  const allowed = rec.t === 1 ? a.forms || [] : [...(a.retakeForms || []), ...(a.forms || [])];
  if (rec.st !== 'banned' && rec.st !== 'absent' && allowed.length && !allowed.includes(rec.f)) {
    return err('ma_de', `Mã đề "${rec.f || '(trống)'}" không thuộc ${rec.t === 1 ? 'đề lần 1' : 'đề lần 2'} của ${lc(a.name)} (${allowed.join(', ')})`, 'form');
  }
  const roster = ctx.rosters[rec.c];
  if (roster && roster.length && !roster.some((r) => r.s === rec.s)) return err('ma_nghien_cuu', `Sinh viên ${rec.s} không có trong danh sách lớp ${rec.c}`, 'roster');
  let ok = true;
  for (const code of Object.keys(rec.pts)) {
    if (!a.items.some((it) => it.code === code)) {
      ok = err('ma_cau', `Câu "${code}" không có trong ${lc(a.name)}`, 'item');
    }
  }
  if (rec.st === 'graded') {
    const needed = rec.t > 1 ? Object.keys(rec.pts) : a.items.map((it) => it.code);
    for (const code of needed) {
      const it = a.items.find((x) => x.code === code);
      if (!it) continue;
      const v = rec.pts[code];
      if (v === undefined || v === null) {
        ok = err(code, `Thiếu điểm câu ${code} của sinh viên ${rec.s} (${lc(a.name)}, lần ${rec.t})`, 'missing');
        continue;
      }
      if (v < 0) ok = err(code, `Điểm âm (${v}) ở câu ${code}`, 'value');
      else if (v > it.max + 1e-9) ok = err(code, `Điểm ${String(v).replace('.', ',')} vượt điểm tối đa ${String(it.max).replace('.', ',')} của câu ${code}`, 'over');
    }
    if (rec.total !== null && rec.total !== undefined) {
      const sum = Object.values(rec.pts).reduce((s, v) => s + (v || 0), 0);
      if (Math.abs(sum - rec.total) > 0.011) ok = err('tong_diem', `Tổng điểm ${rec.total} khác tổng các câu ${Math.round(sum * 100) / 100}`, 'total');
    }
    for (const [itemCode, code] of rec.err || []) {
      if (ctx.errorCodes.size && !ctx.errorCodes.has(code)) push(report, 'warning', line, 'ma_loi', `Mã lỗi "${code}" (câu ${itemCode}) chưa có trong danh mục dạng lỗi`, 'value');
    }
  } else if (Object.values(rec.pts).some((v) => v !== null && v !== undefined)) {
    push(report, 'warning', line, 'trang_thai', `Trạng thái "${STATE_OUT[rec.st]}" nhưng có điểm – điểm sẽ bị bỏ qua`, 'value');
  }
  return ok;
}

function baseFields(row, line, report, ctx) {
  const code = row.ma_nghien_cuu;
  if (!code) return push(report, 'error', line, 'ma_nghien_cuu', 'Không được để trống', 'value'), null;
  if (looksLikeRealStudentId(code)) return push(report, 'error', line, 'ma_nghien_cuu', 'Có vẻ là mã sinh viên thật – chỉ nhận mã nghiên cứu', 'privacy'), null;
  if (!RESEARCH_CODE.test(code)) return push(report, 'error', line, 'ma_nghien_cuu', `"${code}" không hợp lệ`, 'value'), null;
  const sc = scoreContext(ctx, row.ma_lop_hp);
  if (sc.error) return push(report, 'error', line, 'ma_lop_hp', sc.error, sc.issue), null;
  const st = STATE_IN[String(row.trang_thai || '').trim().toLowerCase()];
  if (!st) return push(report, 'error', line, 'trang_thai', `"${row.trang_thai}" phải là da_cham, chua_cham, vang hoặc cam_thi`, 'value'), null;
  const t = Number(String(row.lan_thi).trim());
  return { c: row.ma_lop_hp, s: code, a: row.ma_bai_danh_gia, t, rawT: row.lan_thi, f: row.ma_de || null, st, d: normDate(row.ngay), rv: sc.rv };
}

function normDate(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function parsePoint(text) {
  const s = String(text ?? '').trim();
  if (s === '') return { value: null };
  const v = num(s);
  if (v === null) return { error: `"${s}" không phải số` };
  return { value: v };
}

function checkScoresLong(parsed, report, ctx) {
  const groups = new Map();
  const seenRows = new Set();
  parsed.rows.forEach((row, i) => {
    const line = parsed.lines[i];
    const b = baseFields(row, line, report, ctx);
    if (!b) return;
    if (!row.ma_cau && b.st === 'graded') return push(report, 'error', line, 'ma_cau', 'Không được để trống', 'value');
    const rowKey = `${b.c}|${b.s}|${b.a}|${b.t}|${row.ma_cau}`;
    if (row.ma_cau && seenRows.has(rowKey)) return push(report, 'error', line, 'ma_nghien_cuu', `Trùng dòng: ${b.s} – bài ${b.a} – lần ${b.rawT} – câu ${row.ma_cau}`, 'duplicate');
    seenRows.add(rowKey);
    const p = parsePoint(row.diem);
    if (p.error) return push(report, 'error', line, 'diem', p.error, 'value');
    const key = `${b.c}|${b.s}|${b.a}|${b.t}`;
    if (!groups.has(key)) groups.set(key, { ...b, pts: {}, r1: null, r2: null, err: [], opt: null, lines: [], forms: new Set(), states: new Set() });
    const g = groups.get(key);
    g.lines.push(line);
    g.forms.add(b.f);
    g.states.add(b.st);
    if (row.ma_cau) g.pts[row.ma_cau] = b.st === 'graded' ? p.value : null;
    const c1 = parsePoint(row.diem_cham_1);
    const c2 = parsePoint(row.diem_cham_2);
    if (c1.error || c2.error) return push(report, 'error', line, c1.error ? 'diem_cham_1' : 'diem_cham_2', c1.error || c2.error, 'value');
    if (c1.value !== null && c2.value !== null) {
      g.r1 ||= {};
      g.r2 ||= {};
      g.r1[row.ma_cau] = c1.value;
      g.r2[row.ma_cau] = c2.value;
      g.m1 = row.nguoi_cham_1 || g.m1 || null;
      g.m2 = row.nguoi_cham_2 || g.m2 || null;
    }
    if (row.ma_loi) for (const e of row.ma_loi.split('|').map((x) => x.trim()).filter(Boolean)) g.err.push([row.ma_cau, e]);
    if (row.phuong_an) g.opt = row.phuong_an.trim().toUpperCase();
  });
  finishScores(report, ctx, groups);
}

function checkScoresWide(parsed, report, ctx) {
  const groups = new Map();
  const base = new Set([...CLO_TEMPLATES.diem_theo_bai.required, ...CLO_TEMPLATES.diem_theo_bai.optional]);
  const itemCols = parsed.header.filter((h) => h && !base.has(h));
  if (!itemCols.length) push(report, 'error', 1, null, 'Không thấy cột điểm câu/tiêu chí nào sau các cột bắt buộc', 'item');
  parsed.rows.forEach((row, i) => {
    const line = parsed.lines[i];
    const b = baseFields(row, line, report, ctx);
    if (!b) return;
    const key = `${b.c}|${b.s}|${b.a}|${b.t}`;
    if (groups.has(key)) return push(report, 'error', line, 'ma_nghien_cuu', `Trùng sinh viên ${b.s} – bài ${b.a} – lần ${b.rawT} (đã có ở dòng ${groups.get(key).lines[0]})`, 'duplicate');
    const a = b.rv.aByCode.get(b.a);
    const pts = {};
    let bad = false;
    for (const col of itemCols) {
      const known = a?.items.some((it) => it.code === col);
      const p = parsePoint(row[col]);
      if (p.error) {
        push(report, 'error', line, col, p.error, 'value');
        bad = true;
        continue;
      }
      if (!known) {
        if (p.value !== null) {
          push(report, 'error', line, col, `Cột "${col}" không phải câu/tiêu chí của ${lc(a?.name ?? b.a)}`, 'item');
          bad = true;
        }
        continue;
      }
      if (b.t > 1 && p.value === null) continue; // lần 2 có thể chỉ đánh giá lại một phần
      pts[col] = b.st === 'graded' ? p.value : null;
    }
    if (bad) return;
    const total = row.tong_diem ? num(row.tong_diem) : null;
    groups.set(key, { ...b, pts, total, r1: null, r2: null, err: [], opt: null, lines: [line], forms: new Set([b.f]), states: new Set([b.st]) });
  });
  finishScores(report, ctx, groups);
}

function finishScores(report, ctx, groups) {
  const seenAttempt1 = new Set([...groups.values()].filter((g) => g.t === 1).map((g) => `${g.c}|${g.s}|${g.a}`));
  const byClassAssessment = new Map();
  for (const g of groups.values()) {
    if (g.forms.size > 1) {
      push(report, 'error', g.lines[0], 'ma_de', `Sinh viên ${g.s} có nhiều mã đề trong cùng một bài (${g.a}, lần ${g.t})`, 'form');
      continue;
    }
    if (g.states.size > 1) {
      push(report, 'error', g.lines[0], 'trang_thai', `Sinh viên ${g.s} có nhiều trạng thái trong cùng một bài (${g.a}, lần ${g.t})`, 'value');
      continue;
    }
    if (!checkSubmission(report, ctx, g, g.lines, seenAttempt1)) continue;
    const a = g.rv.aByCode.get(g.a);
    const mcq = a.items.find((it) => it.mcq);
    if (g.opt && mcq && g.opt.length !== mcq.mcq.count) push(report, 'warning', g.lines[0], 'phuong_an', `Chuỗi phương án có ${g.opt.length} ký tự, phần trắc nghiệm có ${mcq.mcq.count} câu`, 'value');
    const rec = { c: g.c, s: g.s, a: g.a, t: g.t, f: g.f, st: g.st, d: g.d, pts: g.st === 'graded' ? g.pts : undefined };
    if (g.r1) Object.assign(rec, { r1: g.r1, r2: g.r2, m1: g.m1, m2: g.m2 });
    if (g.err.length) rec.err = g.err;
    if (g.opt) rec.opt = g.opt;
    report.records.push(rec);
    const k = `${g.c}|${g.a}|${g.t}`;
    if (!byClassAssessment.has(k)) byClassAssessment.set(k, new Set());
    byClassAssessment.get(k).add(g.s);
  }
  // Thiếu bài: sinh viên thuộc diện đánh giá nhưng không có dòng nào cho bài lần 1 trong tệp.
  for (const [k, set] of byClassAssessment) {
    const [c, a, t] = k.split('|');
    if (t !== '1') continue;
    const roster = (ctx.rosters[c] || []).filter((r) => r.st !== 'withdrawn');
    const absent = roster.filter((r) => !set.has(r.s));
    if (absent.length) push(report, 'warning', null, 'ma_nghien_cuu', `Lớp ${c} – bài ${a}: ${absent.length} sinh viên thuộc diện đánh giá chưa có dòng điểm (${absent.slice(0, 5).map((r) => r.s).join(', ')}${absent.length > 5 ? '…' : ''})`, 'absentWork');
  }
  report.summary = {
    'bài làm': report.records.length,
    lớp: new Set(report.records.map((r) => r.c)).size,
    'bài đánh giá': [...new Set(report.records.map((r) => `${r.a} lần ${r.t}`))],
  };
}

// ---- Áp dụng vào bộ dữ liệu ---------------------------------------------------------------------------

export function applyCloImport(ds, kind, records, { mode = 'merge', user = null } = {}) {
  const o = structuredClone(ds.outcomes || { versions: [], rosters: {}, submissions: [], support: [], errorTypes: [], programs: [], bank: {}, forms: {} });
  const now = new Date().toISOString();
  if (kind === 'clo_hoc_phan' || kind === 'ma_tran_danh_gia') {
    for (const g of records) {
      let v = o.versions.find((x) => x.id === g.id);
      if (!v) {
        const course = ds.courses.find((c) => c.id === g.courseId);
        const base = o.versions.filter((x) => x.courseId === g.courseId && x.status === 'approved').sort((a, b) => String(b.approvedAt).localeCompare(String(a.approvedAt)))[0];
        v = {
          ...(base ? structuredClone(base) : { rules: {}, chapters: [], clos: [], assessments: [] }),
          id: g.id,
          courseId: g.courseId,
          courseName: course?.name ?? g.courseId,
          version: g.version,
          status: 'draft',
          approvedAt: null,
          approvedBy: null,
          effectiveFrom: null,
          basedOn: base?.id ?? null,
          createdAt: now,
          createdBy: user?.name ?? 'Nhập từ tệp',
          source: `Nhập từ ${CLO_TEMPLATES[kind].file}`,
        };
        o.versions.push(v);
      }
      if (kind === 'clo_hoc_phan') v.clos = g.clos;
      else v.assessments = g.assessments;
      v.updatedAt = now;
    }
  } else if (kind === 'danh_sach_lop') {
    const byClass = new Map();
    for (const r of records) {
      if (!byClass.has(r.c)) byClass.set(r.c, []);
      byClass.get(r.c).push({ s: r.s, st: r.st, att: r.att });
    }
    for (const [c, list] of byClass) {
      if (mode === 'replace' || !o.rosters[c]) o.rosters[c] = list;
      else {
        const m = new Map(o.rosters[c].map((r) => [r.s, r]));
        for (const r of list) m.set(r.s, { ...m.get(r.s), ...r });
        o.rosters[c] = [...m.values()];
      }
    }
  } else {
    const keyOf = (x) => `${x.c}|${x.s}|${x.a}|${x.t}`;
    const groups = new Set(records.map((r) => `${r.c}|${r.a}|${r.t}`));
    let kept = o.submissions;
    if (mode === 'replace') kept = kept.filter((x) => !groups.has(`${x.c}|${x.a}|${x.t}`));
    const m = new Map(kept.map((x) => [keyOf(x), x]));
    for (const r of records) m.set(keyOf(r), r);
    o.submissions = [...m.values()];
    // Lớp chưa có danh sách: suy ra từ điểm.
    for (const c of new Set(records.map((r) => r.c))) {
      if (o.rosters[c]?.length) continue;
      o.rosters[c] = [...new Set(o.submissions.filter((x) => x.c === c).map((x) => x.s))].map((s) => ({ s, st: 'active', att: null }));
    }
  }
  return { ...ds, outcomes: o, meta: { ...ds.meta, source: 'import', label: 'Dữ liệu nhập từ tệp', updatedAt: now } };
}

// ---- Xuất theo mẫu ------------------------------------------------------------------------------------

const vn = (v) => (v === null || v === undefined ? '' : String(Math.round(v * 1000) / 1000).replace('.', ','));

export function exportCloCsv(ds, kind, { classIds = null, versionId = null } = {}) {
  const o = ds.outcomes || {};
  const tpl = CLO_TEMPLATES[kind];
  const okClass = (c) => !classIds || classIds.includes(c);
  const versions = (o.versions || []).filter((v) => !versionId || v.id === versionId);
  let cols = [...tpl.required, ...tpl.optional];
  let rows = [];
  if (kind === 'clo_hoc_phan') {
    rows = versions.flatMap((v) =>
      v.clos.map((c) => ({
        ma_hoc_phan: v.courseId,
        phien_ban: v.version.replace(/\s*\(.*\)$/, ''),
        ma_clo: c.code,
        mo_ta: c.text,
        linh_vuc: c.domain,
        muc_nang_luc: `${c.level}/${c.domain === 'kien_thuc' ? 6 : 5}`,
        trong_so: vn(c.weight * 100),
        ma_plo: c.plo || '',
        ma_pi: c.pi || '',
        chuong: (c.chapters || []).join('|'),
        nguong_dat: c.pass !== undefined ? vn(c.pass) : '',
      })),
    );
  } else if (kind === 'ma_tran_danh_gia') {
    rows = versions.flatMap((v) =>
      v.assessments.flatMap((a) =>
        a.items.map((it) => ({
          ma_hoc_phan: v.courseId,
          phien_ban: v.version.replace(/\s*\(.*\)$/, ''),
          ma_bai_danh_gia: a.code,
          ten_bai: a.name,
          nhom: a.group,
          trong_so_bai: vn(a.weight * 100),
          ma_cau: it.code,
          noi_dung: it.label,
          diem_toi_da: vn(it.max),
          ma_clo: Object.entries(itemWeights(it.clos)).map(([c, w]) => (w === 1 ? c : `${c}:${vn(w)}`)).join('|'),
          hinh_thuc: a.mode,
          ma_de: (a.forms || []).join('|'),
          ma_de_lan_2: (a.retakeForms || []).join('|'),
          so_lan_toi_da: a.maxAttempts || 1,
          chuong: it.chapter || '',
          phan_bo_clo: a.declared ? Object.entries(a.declared).map(([c, w]) => `${c}:${vn(w * 100)}`).join('|') : '',
          ma_loi: (it.errors || []).join('|'),
        })),
      ),
    );
  } else if (kind === 'danh_sach_lop') {
    rows = Object.entries(o.rosters || {})
      .filter(([c]) => okClass(c))
      .flatMap(([c, list]) => list.map((r) => ({ ma_lop_hp: c, ma_nghien_cuu: r.s, trang_thai: r.st === 'withdrawn' ? 'rut_hoc_phan' : 'dang_hoc', ty_le_chuyen_can: r.att === null || r.att === undefined ? '' : vn(r.att * 100) })));
  } else if (kind === 'diem_chi_tiet') {
    const vers = (o.versions || []).map(resolveVersion);
    const clsMap = new Map(ds.classes.map((c) => [c.id, c]));
    for (const x of (o.submissions || []).filter((s) => okClass(s.c))) {
      const cls = clsMap.get(x.c);
      const rv = cls && versionForClass(vers, cls);
      const a = rv?.aByCode.get(x.a);
      if (!a) continue;
      const base = { ma_nghien_cuu: x.s, ma_lop_hp: x.c, ma_bai_danh_gia: x.a, lan_thi: x.t, ma_de: x.f || '', trang_thai: STATE_OUT[x.st], ngay: x.d ? x.d.split('-').reverse().join('/') : '' };
      if (x.st !== 'graded') {
        rows.push({ ...base, ma_cau: '', diem: '' });
        continue;
      }
      for (const it of a.items) {
        if (!(it.code in (x.pts || {}))) continue;
        rows.push({
          ...base,
          ma_cau: it.code,
          diem: vn(x.pts[it.code]),
          nguoi_cham_1: x.r1 && it.code in x.r1 ? x.m1 || '' : '',
          diem_cham_1: x.r1 && it.code in x.r1 ? vn(x.r1[it.code]) : '',
          nguoi_cham_2: x.r2 && it.code in x.r2 ? x.m2 || '' : '',
          diem_cham_2: x.r2 && it.code in x.r2 ? vn(x.r2[it.code]) : '',
          ma_loi: (x.err || []).filter(([c]) => c === it.code).map(([, e]) => e).join('|'),
          phuong_an: it.mcq && x.opt ? x.opt : '',
        });
      }
    }
  } else if (kind === 'diem_theo_bai') {
    const vers = (o.versions || []).map(resolveVersion);
    const clsMap = new Map(ds.classes.map((c) => [c.id, c]));
    const itemCodes = new Set();
    for (const x of (o.submissions || []).filter((s) => okClass(s.c))) {
      const cls = clsMap.get(x.c);
      const rv = cls && versionForClass(vers, cls);
      const a = rv?.aByCode.get(x.a);
      if (!a) continue;
      a.items.forEach((it) => itemCodes.add(it.code));
      const row = { ma_nghien_cuu: x.s, ma_lop_hp: x.c, ma_bai_danh_gia: x.a, lan_thi: x.t, ma_de: x.f || '', trang_thai: STATE_OUT[x.st], ngay: x.d ? x.d.split('-').reverse().join('/') : '' };
      if (x.st === 'graded') {
        let total = 0;
        for (const it of a.items) {
          if (it.code in (x.pts || {})) {
            row[it.code] = vn(x.pts[it.code]);
            total += x.pts[it.code] || 0;
          }
        }
        row.tong_diem = vn(total);
      }
      rows.push(row);
    }
    cols = [...tpl.required, 'trang_thai', 'ngay', ...itemCodes, 'tong_diem'];
  }
  return toCsv(cols, rows, { delimiter: ';' });
}
