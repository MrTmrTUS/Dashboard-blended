// Nhập và kiểm tra dữ liệu (mục 5.2, Phụ lục A): kiểm tra mã, phạm vi giá trị, trùng lặp; báo lỗi theo dòng.
// Không nhận mã sinh viên thật – chỉ nhận mã nghiên cứu.
import { ALL_ITEM_CODES, DIMENSIONS, ENG_CODES, FACTOR_CODES, INDICATOR_BY_CODE, ITEM_CODES } from './constants.js';
import { parseCsv } from './csv.js';
import { parseViNumber } from './format.js';
import { containsPii } from './redact.js';

export const TEMPLATES = {
  danh_muc_lop: {
    file: 'danh_muc_lop.csv',
    title: 'Danh mục lớp học phần',
    required: ['ma_lop_hp', 'ten_hoc_phan', 'ma_khoa', 'ma_giang_vien', 'hoc_ky', 'si_so'],
    optional: ['ma_hoc_phan', 'nhom', 'ten_khoa', 'ten_giang_vien'],
    note: 'Mỗi dòng một lớp học phần trong một học kỳ. Học kỳ dạng HK1-2627 hoặc HK1 2026-2027.',
  },
  sinh_vien: {
    file: 'sinh_vien.csv',
    title: 'Sinh viên (mã nghiên cứu) và cố vấn',
    required: ['ma_nghien_cuu', 'lop_sinh_hoat', 'ma_co_van'],
    optional: ['ten_co_van', 'ma_khoa'],
    note: 'Bổ sung đề xuất của MVP để phân quyền cố vấn học tập (M3). Không chứa mã sinh viên thật.',
  },
  phieu_khao_sat: {
    file: 'phieu_khao_sat.csv',
    title: 'Phiếu khảo sát sinh viên',
    required: [
      'ma_phieu', 'ma_nghien_cuu', 'ma_lop_hp', 'dot', 'thoi_gian_tra_loi',
      ...ITEM_CODES, ...ENG_CODES,
      'kiem_tra_chu_y_1', 'kiem_tra_chu_y_2', 'y_kien', 'dong_y_lien_ket',
    ],
    optional: [],
    note: 'dot: GK (giữa kỳ) hoặc CK (cuối kỳ). Chỉ báo nhận số nguyên 1 – 5 hoặc để trống.',
  },
  diem_hoc_vu: {
    file: 'diem_hoc_vu.csv',
    title: 'Điểm học vụ (đã mã hóa)',
    required: ['ma_nghien_cuu', 'ma_lop_hp', 'diem_qua_trinh', 'diem_hoc_phan', 'gpa0'],
    optional: [],
    note: 'Điểm thang 10; GPA0 thang 4. Để trống điểm học phần nếu chưa có.',
  },
  tham_so_nghien_cuu: {
    file: 'tham_so_nghien_cuu.csv',
    title: 'Tham số từ nghiên cứu (R)',
    required: ['loai', 'ma', 'gia_tri', 'can_duoi', 'can_tren', 'ghi_chu'],
    optional: [],
    note: 'loai: trong_so (wₖ, Nội dung 2) · bat_bien (1/0, Nội dung 1) · chenh_lech_tiem_an (ước lượng, KTC 95%).',
  },
  thu_vien_bien_phap: {
    file: 'thu_vien_bien_phap.csv',
    title: 'Thư viện biện pháp',
    required: ['ma_bien_phap', 'ma_phuong_dien', 'ma_chi_bao', 'noi_dung', 'doi_tuong', 'nguon', 'trang_thai_duyet'],
    optional: [],
    note: 'doi_tuong: GV / khoa / Trường. trang_thai_duyet: da_duyet / cho_duyet / tu_choi.',
  },
};

export const IMPORT_ORDER = ['danh_muc_lop', 'sinh_vien', 'phieu_khao_sat', 'diem_hoc_vu', 'tham_so_nghien_cuu', 'thu_vien_bien_phap'];

// ---- Chuẩn hóa giá trị --------------------------------------------------------

export function normalizeSemester(text) {
  const s = String(text || '').trim().replace(/\s+/g, ' ');
  let m = s.match(/^HK\s?([123])[-\s](\d{2})(\d{2})$/i);
  if (m) {
    const y1 = 2000 + Number(m[2]);
    const y2 = 2000 + Number(m[3]);
    if (y2 !== y1 + 1) return null;
    return { id: `HK${m[1]}-${m[2]}${m[3]}`, label: `HK${m[1]} ${y1}–${y2}` };
  }
  m = s.match(/^HK\s?([123])[-\s/]*(\d{4})\s?[-–/]\s?(\d{4})$/i);
  if (m) {
    const y1 = Number(m[2]);
    const y2 = Number(m[3]);
    if (y2 !== y1 + 1) return null;
    return { id: `HK${m[1]}-${String(y1).slice(2)}${String(y2).slice(2)}`, label: `HK${m[1]} ${y1}–${y2}` };
  }
  return null;
}

export function parseDateTime(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
    return d.toISOString();
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (m) {
    const d = new Date(s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export function parseBool(text) {
  const s = String(text ?? '').trim().toLowerCase();
  if (['1', 'co', 'có', 'true', 'x', 'yes', 'dong_y', 'đồng ý'].includes(s)) return true;
  if (['0', 'khong', 'không', 'false', '', 'no'].includes(s)) return false;
  return null;
}

const looksLikeRealStudentId = (code) => /^\d{8,12}$/.test(code);
const RESEARCH_CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,29}$/;

function parseLikert(text) {
  const s = String(text ?? '').trim();
  if (s === '') return { value: 0 };
  if (!/^\d+$/.test(s)) return { error: `"${s}" không phải số nguyên` };
  const v = Number(s);
  if (v < 1 || v > 5) return { error: `"${s}" ngoài phạm vi 1 – 5` };
  return { value: v };
}

function parseScore(text, lo, hi) {
  const s = String(text ?? '').trim();
  if (s === '') return { value: null };
  const v = parseViNumber(s);
  if (v === null) return { error: `"${s}" không phải số` };
  if (v < lo || v > hi) return { error: `"${s}" ngoài phạm vi ${lo} – ${hi}` };
  return { value: v };
}

// ---- Kiểm tra từng loại tệp -----------------------------------------------------

const MAX_REPORTED = 300;

function makeReport(kind, parsed) {
  return {
    kind,
    template: TEMPLATES[kind],
    header: parsed.header,
    delimiter: parsed.delimiter,
    totalRows: parsed.rows.length,
    errors: [],
    warnings: [],
    errorCount: 0,
    warningCount: 0,
    records: [],
    preview: parsed.rows.slice(0, 10),
    summary: {},
  };
}

function push(report, type, line, column, message) {
  const list = type === 'error' ? report.errors : report.warnings;
  if (type === 'error') report.errorCount++;
  else report.warningCount++;
  if (list.length < MAX_REPORTED) list.push({ line, column, message });
}

// context: { classIds: Set, classSemester: Map(classId → semesterId), cfg }
export function validateCsv(kind, text, context = {}) {
  const tpl = TEMPLATES[kind];
  if (!tpl) throw new Error(`Không có mẫu tệp "${kind}"`);
  const parsed = parseCsv(text);
  const report = makeReport(kind, parsed);
  if (!parsed.header.length) {
    push(report, 'error', 1, null, 'Tệp rỗng hoặc không đọc được dòng tiêu đề');
    return finalize(report);
  }
  const missing = tpl.required.filter((c) => !parsed.header.includes(c));
  if (missing.length) {
    const shown = missing.slice(0, 8).join(', ') + (missing.length > 8 ? `… (+${missing.length - 8})` : '');
    push(report, 'error', 1, null, `Thiếu cột bắt buộc: ${shown}`);
    return finalize(report);
  }
  const known = new Set([...tpl.required, ...tpl.optional]);
  const unknown = parsed.header.filter((h) => h && !known.has(h));
  if (unknown.length) push(report, 'warning', 1, null, `Bỏ qua cột không có trong mẫu: ${unknown.slice(0, 6).join(', ')}`);
  const dupHeader = parsed.header.filter((h, i) => parsed.header.indexOf(h) !== i);
  if (dupHeader.length) push(report, 'error', 1, null, `Cột bị trùng tên: ${[...new Set(dupHeader)].join(', ')}`);
  if (!parsed.rows.length) push(report, 'error', 2, null, 'Tệp không có dòng dữ liệu');

  const validators = { danh_muc_lop: checkClasses, sinh_vien: checkStudents, phieu_khao_sat: checkResponses, diem_hoc_vu: checkGrades, tham_so_nghien_cuu: checkParams, thu_vien_bien_phap: checkMeasures };
  validators[kind](parsed, report, context);
  return finalize(report);
}

function finalize(report) {
  report.ok = report.errorCount === 0;
  return report;
}

function checkClasses(parsed, report) {
  const seen = new Set();
  const semesters = new Set();
  const faculties = new Set();
  parsed.rows.forEach((row, i) => {
    const line = parsed.lines[i];
    let bad = false;
    for (const c of TEMPLATES.danh_muc_lop.required) {
      if (!row[c]) {
        push(report, 'error', line, c, 'Không được để trống');
        bad = true;
      }
    }
    const sem = normalizeSemester(row.hoc_ky);
    if (row.hoc_ky && !sem) {
      push(report, 'error', line, 'hoc_ky', `"${row.hoc_ky}" không đúng dạng (ví dụ HK1-2627 hoặc HK1 2026-2027)`);
      bad = true;
    }
    const size = Number(row.si_so);
    if (row.si_so && (!Number.isInteger(size) || size < 1 || size > 500)) {
      push(report, 'error', line, 'si_so', `"${row.si_so}" phải là số nguyên 1 – 500`);
      bad = true;
    }
    if (row.ma_lop_hp && seen.has(row.ma_lop_hp)) {
      push(report, 'error', line, 'ma_lop_hp', `Trùng mã lớp học phần "${row.ma_lop_hp}"`);
      bad = true;
    }
    seen.add(row.ma_lop_hp);
    if (bad) return;
    semesters.add(sem.id);
    faculties.add(row.ma_khoa);
    const courseId = row.ma_hoc_phan || row.ten_hoc_phan;
    report.records.push({
      id: row.ma_lop_hp,
      code: row.ma_lop_hp,
      name: row.nhom ? `${row.ten_hoc_phan} – ${row.nhom}` : row.ten_hoc_phan,
      courseId,
      courseName: row.ten_hoc_phan,
      facultyId: row.ma_khoa,
      facultyName: row.ten_khoa || row.ma_khoa,
      lecturerId: row.ma_giang_vien,
      lecturerName: row.ten_giang_vien || row.ma_giang_vien,
      semesterId: sem.id,
      semesterLabel: sem.label,
      size,
      lineage: `${courseId}-${row.nhom || row.ma_giang_vien}`,
    });
  });
  report.summary = { classes: report.records.length, semesters: [...semesters], faculties: faculties.size };
}

function checkStudents(parsed, report) {
  const seen = new Set();
  parsed.rows.forEach((row, i) => {
    const line = parsed.lines[i];
    const code = row.ma_nghien_cuu;
    if (!code) return push(report, 'error', line, 'ma_nghien_cuu', 'Không được để trống');
    if (looksLikeRealStudentId(code)) return push(report, 'error', line, 'ma_nghien_cuu', 'Có vẻ là mã sinh viên thật – chỉ nhận mã nghiên cứu');
    if (!RESEARCH_CODE.test(code)) return push(report, 'error', line, 'ma_nghien_cuu', `"${code}" không hợp lệ (3 – 30 ký tự chữ, số, "-", "_")`);
    if (seen.has(code)) return push(report, 'error', line, 'ma_nghien_cuu', `Trùng mã "${code}"`);
    seen.add(code);
    if (!row.ma_co_van) push(report, 'warning', line, 'ma_co_van', 'Chưa phân công cố vấn');
    report.records.push({
      code,
      homeroom: row.lop_sinh_hoat,
      advisorId: row.ma_co_van || null,
      advisorName: row.ten_co_van || row.ma_co_van || null,
      facultyId: row.ma_khoa || null,
    });
  });
  report.summary = { students: report.records.length };
}

function checkResponses(parsed, report, context) {
  const ids = new Set();
  const triples = new Set();
  const classIds = context.classIds || new Set();
  const classSemester = context.classSemester || new Map();
  const attention = context.cfg?.attentionChecks || [];
  let piiCount = 0;
  const waves = new Map();
  parsed.rows.forEach((row, i) => {
    const line = parsed.lines[i];
    let bad = false;
    const err = (col, msg) => {
      push(report, 'error', line, col, msg);
      bad = true;
    };
    if (!row.ma_phieu) err('ma_phieu', 'Không được để trống');
    else if (ids.has(row.ma_phieu)) err('ma_phieu', `Trùng mã phiếu "${row.ma_phieu}"`);
    ids.add(row.ma_phieu);
    const code = row.ma_nghien_cuu;
    if (!code) err('ma_nghien_cuu', 'Không được để trống');
    else if (looksLikeRealStudentId(code)) err('ma_nghien_cuu', 'Có vẻ là mã sinh viên thật – chỉ nhận mã nghiên cứu');
    else if (!RESEARCH_CODE.test(code)) err('ma_nghien_cuu', `"${code}" không hợp lệ`);
    if (!row.ma_lop_hp) err('ma_lop_hp', 'Không được để trống');
    else if (!classIds.has(row.ma_lop_hp)) err('ma_lop_hp', `Lớp "${row.ma_lop_hp}" không có trong danh mục`);
    const dot = String(row.dot || '').toUpperCase();
    if (!['GK', 'CK'].includes(dot)) err('dot', `"${row.dot}" phải là GK hoặc CK`);
    const time = parseDateTime(row.thoi_gian_tra_loi);
    if (!time) err('thoi_gian_tra_loi', `"${row.thoi_gian_tra_loi}" không đúng dạng dd/mm/yyyy hh:mm`);
    const v = new Uint8Array(ALL_ITEM_CODES.length);
    ALL_ITEM_CODES.forEach((c, j) => {
      const r = parseLikert(row[c]);
      if (r.error) err(c, r.error);
      else v[j] = r.value;
    });
    const att = attention.map((chk) => {
      const r = parseLikert(row[chk.col]);
      if (r.error) err(chk.col, r.error);
      return r.value || 0;
    });
    const consent = parseBool(row.dong_y_lien_ket);
    if (consent === null) err('dong_y_lien_ket', `"${row.dong_y_lien_ket}" phải là 1/0 hoặc có/không`);
    const key = `${code}|${row.ma_lop_hp}|${dot}`;
    if (code && row.ma_lop_hp && triples.has(key)) err('ma_nghien_cuu', `Sinh viên đã có phiếu cho lớp này trong đợt ${dot}`);
    triples.add(key);
    if (row.y_kien && containsPii(row.y_kien)) {
      piiCount++;
      push(report, 'warning', line, 'y_kien', 'Ý kiến có thông tin nhận diện – sẽ được xóa trước khi hiển thị');
    }
    if (bad) return;
    const semesterId = classSemester.get(row.ma_lop_hp);
    const waveId = `${semesterId}-${dot}`;
    waves.set(waveId, (waves.get(waveId) || 0) + 1);
    report.records.push({
      id: row.ma_phieu,
      researchCode: code,
      classId: row.ma_lop_hp,
      waveId,
      semesterId,
      dot,
      time,
      v,
      att,
      comment: row.y_kien || '',
      consent,
    });
  });
  report.summary = { responses: report.records.length, waves: Object.fromEntries(waves), pii: piiCount };
}

function checkGrades(parsed, report, context) {
  const classIds = context.classIds || new Set();
  const seen = new Set();
  let missingFinal = 0;
  parsed.rows.forEach((row, i) => {
    const line = parsed.lines[i];
    let bad = false;
    const err = (col, msg) => {
      push(report, 'error', line, col, msg);
      bad = true;
    };
    const code = row.ma_nghien_cuu;
    if (!code) err('ma_nghien_cuu', 'Không được để trống');
    else if (looksLikeRealStudentId(code)) err('ma_nghien_cuu', 'Có vẻ là mã sinh viên thật – chỉ nhận mã nghiên cứu');
    if (!classIds.has(row.ma_lop_hp)) err('ma_lop_hp', `Lớp "${row.ma_lop_hp}" không có trong danh mục`);
    const key = `${code}|${row.ma_lop_hp}`;
    if (seen.has(key)) err('ma_nghien_cuu', 'Trùng điểm của sinh viên trong cùng lớp');
    seen.add(key);
    const p = parseScore(row.diem_qua_trinh, 0, 10);
    const f = parseScore(row.diem_hoc_phan, 0, 10);
    const g = parseScore(row.gpa0, 0, 10);
    if (p.error) err('diem_qua_trinh', p.error);
    if (f.error) err('diem_hoc_phan', f.error);
    if (g.error) err('gpa0', g.error);
    if (!g.error && g.value !== null && g.value > 4) push(report, 'warning', line, 'gpa0', 'GPA0 lớn hơn 4 – kiểm tra lại thang điểm');
    if (!f.error && f.value === null) missingFinal++;
    if (bad) return;
    report.records.push({ researchCode: code, classId: row.ma_lop_hp, process: p.value, final: f.value, gpa0: g.value });
  });
  report.summary = { grades: report.records.length, missingFinal };
}

function checkParams(parsed, report) {
  const weights = {};
  const invariance = {};
  const latent = {};
  parsed.rows.forEach((row, i) => {
    const line = parsed.lines[i];
    const kind = row.loai;
    const code = row.ma;
    const value = parseViNumber(row.gia_tri);
    if (!['trong_so', 'bat_bien', 'chenh_lech_tiem_an'].includes(kind)) {
      push(report, 'error', line, 'loai', `"${kind}" phải là trong_so, bat_bien hoặc chenh_lech_tiem_an`);
      return;
    }
    const validCode = FACTOR_CODES.includes(code) || Boolean(INDICATOR_BY_CODE[code]);
    if (!validCode) {
      push(report, 'error', line, 'ma', `Mã "${code}" không thuộc bộ tiêu chí`);
      return;
    }
    if (value === null) {
      push(report, 'error', line, 'gia_tri', `"${row.gia_tri}" không phải số`);
      return;
    }
    if (kind === 'trong_so') {
      if (!DIMENSIONS.includes(code)) return push(report, 'error', line, 'ma', 'Trọng số chỉ áp dụng cho 7 phương diện');
      if (value < 0 || value > 1) return push(report, 'error', line, 'gia_tri', 'Trọng số phải trong khoảng 0 – 1');
      weights[code] = value;
    } else if (kind === 'bat_bien') {
      if (![0, 1].includes(value)) return push(report, 'error', line, 'gia_tri', 'Cờ bất biến là 1 (đạt) hoặc 0 (không đạt)');
      invariance[code] = { invariant: value === 1, level: value === 1 ? 'Đạt bất biến' : 'Không đạt bất biến', note: row.ghi_chu || '' };
    } else {
      const lo = parseViNumber(row.can_duoi);
      const hi = parseViNumber(row.can_tren);
      if (lo === null || hi === null) return push(report, 'error', line, 'can_duoi', 'Cần cận dưới và cận trên của KTC 95%');
      if (!(lo <= value && value <= hi)) return push(report, 'error', line, 'gia_tri', 'Ước lượng phải nằm giữa cận dưới và cận trên');
      latent[code] = { est: value, lo, hi };
    }
  });
  const wCodes = Object.keys(weights);
  if (wCodes.length && wCodes.length !== DIMENSIONS.length) {
    push(report, 'warning', null, 'ma', `Mới có trọng số cho ${wCodes.length}/7 phương diện – hệ thống sẽ dùng trọng số đều cho đến khi đủ`);
  }
  const total = wCodes.reduce((s, c) => s + weights[c], 0);
  if (wCodes.length === DIMENSIONS.length && Math.abs(total - 1) > 0.02) {
    push(report, 'warning', null, 'gia_tri', `Tổng trọng số = ${total.toFixed(3)} – sẽ được chuẩn hóa về 1`);
  }
  report.records = [{ weights, invariance, latent }];
  report.summary = { weights: wCodes.length, invariance: Object.keys(invariance).length, latent: Object.keys(latent).length };
}

function checkMeasures(parsed, report) {
  const seen = new Set();
  const statuses = { da_duyet: 'da_duyet', 'đã duyệt': 'da_duyet', cho_duyet: 'cho_duyet', 'chờ duyệt': 'cho_duyet', tu_choi: 'tu_choi', 'từ chối': 'tu_choi' };
  const targets = { gv: 'GV', khoa: 'khoa', 'trường': 'Trường', truong: 'Trường' };
  parsed.rows.forEach((row, i) => {
    const line = parsed.lines[i];
    if (!row.ma_bien_phap) return push(report, 'error', line, 'ma_bien_phap', 'Không được để trống');
    if (seen.has(row.ma_bien_phap)) return push(report, 'error', line, 'ma_bien_phap', `Trùng mã "${row.ma_bien_phap}"`);
    seen.add(row.ma_bien_phap);
    if (!DIMENSIONS.includes(row.ma_phuong_dien)) return push(report, 'error', line, 'ma_phuong_dien', `"${row.ma_phuong_dien}" không thuộc 7 phương diện`);
    if (row.ma_chi_bao && !INDICATOR_BY_CODE[row.ma_chi_bao]) return push(report, 'error', line, 'ma_chi_bao', `Chỉ báo "${row.ma_chi_bao}" không có trong bộ tiêu chí`);
    if (row.ma_chi_bao && INDICATOR_BY_CODE[row.ma_chi_bao].factor !== row.ma_phuong_dien) {
      push(report, 'warning', line, 'ma_chi_bao', `Chỉ báo ${row.ma_chi_bao} thuộc ${INDICATOR_BY_CODE[row.ma_chi_bao].factor}, không thuộc ${row.ma_phuong_dien}`);
    }
    if (!row.noi_dung) return push(report, 'error', line, 'noi_dung', 'Không được để trống');
    const target = targets[String(row.doi_tuong).toLowerCase()];
    if (!target) return push(report, 'error', line, 'doi_tuong', `"${row.doi_tuong}" phải là GV, khoa hoặc Trường`);
    const status = statuses[String(row.trang_thai_duyet).toLowerCase()];
    if (!status) return push(report, 'error', line, 'trang_thai_duyet', `"${row.trang_thai_duyet}" phải là da_duyet, cho_duyet hoặc tu_choi`);
    report.records.push({
      code: row.ma_bien_phap,
      dim: row.ma_phuong_dien,
      indicator: row.ma_chi_bao || null,
      text: row.noi_dung,
      target,
      source: row.nguon || '',
      status,
    });
  });
  report.summary = { measures: report.records.length };
}
