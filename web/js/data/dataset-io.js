// Xuất bộ dữ liệu ra các tệp CSV theo mẫu (Phụ lục A) và áp dụng tệp đã kiểm tra vào bộ dữ liệu.
import { ALL_ITEM_CODES, DIMENSIONS } from '../core/constants.js';
import { DEFAULT_CONFIG } from '../core/config.js';
import { toCsv } from '../core/csv.js';
import { fmtNum } from '../core/format.js';
import { TEMPLATES } from '../core/importer.js';

const viDateTime = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const num = (v, digits) => (v === null || v === undefined ? '' : fmtNum(v, digits));

export function exportCsv(ds, kind, { limitSemester = null, delimiter = ',' } = {}) {
  const cols = [...TEMPLATES[kind].required, ...TEMPLATES[kind].optional];
  const semOk = (semId) => !limitSemester || semId === limitSemester;
  const classSem = new Map(ds.classes.map((c) => [c.id, c.semesterId]));
  const sem = new Map(ds.semesters.map((s) => [s.id, s]));
  let rows = [];
  if (kind === 'danh_muc_lop') {
    const course = new Map(ds.courses.map((c) => [c.id, c]));
    const fac = new Map(ds.faculties.map((f) => [f.id, f]));
    const lect = new Map(ds.lecturers.map((l) => [l.id, l]));
    rows = ds.classes.filter((c) => semOk(c.semesterId)).map((c) => ({
      ma_lop_hp: c.id,
      ten_hoc_phan: course.get(c.courseId)?.name ?? c.name,
      ma_khoa: c.facultyId,
      ma_giang_vien: c.lecturerId,
      hoc_ky: sem.get(c.semesterId)?.id ?? c.semesterId,
      si_so: c.size,
      ma_hoc_phan: c.courseId,
      nhom: c.lineage.split('-').pop(),
      ten_khoa: fac.get(c.facultyId)?.name ?? '',
      ten_giang_vien: lect.get(c.lecturerId)?.name ?? '',
    }));
  } else if (kind === 'sinh_vien') {
    const adv = new Map(ds.advisors.map((a) => [a.id, a]));
    rows = ds.students.map((s) => ({
      ma_nghien_cuu: s.code,
      lop_sinh_hoat: s.homeroom,
      ma_co_van: s.advisorId ?? '',
      ten_co_van: adv.get(s.advisorId)?.name ?? '',
      ma_khoa: s.facultyId ?? '',
    }));
  } else if (kind === 'phieu_khao_sat') {
    const wave = new Map(ds.waves.map((w) => [w.id, w]));
    rows = ds.responses.filter((r) => semOk(classSem.get(r.classId))).map((r) => {
      const o = {
        ma_phieu: r.id,
        ma_nghien_cuu: r.researchCode,
        ma_lop_hp: r.classId,
        dot: wave.get(r.waveId)?.dot ?? '',
        thoi_gian_tra_loi: viDateTime(r.time),
      };
      ALL_ITEM_CODES.forEach((c, i) => (o[c] = r.v[i] || ''));
      o.kiem_tra_chu_y_1 = r.att?.[0] || '';
      o.kiem_tra_chu_y_2 = r.att?.[1] || '';
      o.y_kien = r.comment || '';
      o.dong_y_lien_ket = r.consent ? 1 : 0;
      return o;
    });
  } else if (kind === 'diem_hoc_vu') {
    rows = ds.grades.filter((g) => semOk(classSem.get(g.classId))).map((g) => ({
      ma_nghien_cuu: g.researchCode,
      ma_lop_hp: g.classId,
      diem_qua_trinh: num(g.process, 1),
      diem_hoc_phan: num(g.final, 1),
      gpa0: num(g.gpa0, 2),
    }));
  } else if (kind === 'tham_so_nghien_cuu') {
    const p = ds.params || {};
    for (const d of DIMENSIONS) {
      if (p.weights?.[d] !== undefined) rows.push({ loai: 'trong_so', ma: d, gia_tri: num(p.weights[d], 2), can_duoi: '', can_tren: '', ghi_chu: 'Nội dung 2' });
    }
    for (const [code, inv] of Object.entries(p.invariance || {})) {
      rows.push({ loai: 'bat_bien', ma: code, gia_tri: inv.invariant ? 1 : 0, can_duoi: '', can_tren: '', ghi_chu: [inv.level, inv.note].filter(Boolean).join('; ') });
    }
    for (const [code, l] of Object.entries(p.latent || {})) {
      rows.push({ loai: 'chenh_lech_tiem_an', ma: code, gia_tri: num(l.est, 2), can_duoi: num(l.lo, 2), can_tren: num(l.hi, 2), ghi_chu: 'TDU − trường đối sánh' });
    }
  } else if (kind === 'thu_vien_bien_phap') {
    rows = ds.measures.map((m) => ({
      ma_bien_phap: m.code,
      ma_phuong_dien: m.dim,
      ma_chi_bao: m.indicator ?? '',
      noi_dung: m.text,
      doi_tuong: m.target,
      nguon: m.source,
      trang_thai_duyet: m.status,
    }));
  }
  // Excel tiếng Việt dùng ';' khi số có dấu phẩy thập phân.
  return toCsv(cols, rows, { delimiter: delimiter === ';' ? ';' : ',' });
}

// Bộ dữ liệu rỗng để bắt đầu nhập dữ liệu thật.
export function emptyDataset(base) {
  return {
    meta: { source: 'import', label: 'Dữ liệu nhập từ tệp', createdAt: new Date().toISOString() },
    semesters: [],
    waves: [],
    faculties: [],
    courses: [],
    lecturers: [],
    advisors: [],
    classes: [],
    students: [],
    responses: [],
    grades: [],
    params: base?.params ? structuredClone(base.params) : { weights: {}, invariance: {}, latent: {} },
    measures: base?.measures ? base.measures.map((m) => ({ ...m })) : [],
    seedPlans: [],
    truthLabels: {},
  };
}

function upsert(list, items, key) {
  const map = new Map(list.map((x) => [x[key], x]));
  for (const it of items) map.set(it[key], { ...map.get(it[key]), ...it });
  return [...map.values()];
}

// Áp dụng bản ghi đã kiểm tra. mode: 'merge' (bổ sung/cập nhật) hoặc 'replace' (thay thế phần tương ứng).
export function applyImport(ds, kind, records, { mode = 'merge' } = {}) {
  let out = { ...ds, meta: { ...ds.meta, source: 'import', label: 'Dữ liệu nhập từ tệp', updatedAt: new Date().toISOString() } };
  if (kind === 'danh_muc_lop') {
    if (mode === 'replace') out = { ...emptyDataset(ds), meta: out.meta };
    const sems = new Map(out.semesters.map((s) => [s.id, s]));
    for (const r of records) if (!sems.has(r.semesterId)) sems.set(r.semesterId, { id: r.semesterId, label: r.semesterLabel });
    out.semesters = [...sems.values()].sort((a, b) => semesterKey(a.id) - semesterKey(b.id)).map((s, i) => ({ ...s, order: i }));
    out.faculties = upsert(out.faculties, records.map((r) => ({ id: r.facultyId, name: r.facultyName, short: r.facultyName, block: '' })), 'id');
    out.courses = upsert(out.courses, records.map((r) => ({ id: r.courseId, name: r.courseName, facultyId: r.facultyId })), 'id');
    out.lecturers = upsert(out.lecturers, records.map((r) => ({ id: r.lecturerId, name: r.lecturerName, facultyId: r.facultyId })), 'id');
    out.classes = upsert(out.classes, records.map((r) => ({
      id: r.id, code: r.code, lineage: r.lineage, name: r.name, courseId: r.courseId, facultyId: r.facultyId,
      lecturerId: r.lecturerId, semesterId: r.semesterId, size: r.size,
    })), 'id');
  } else if (kind === 'sinh_vien') {
    out.students = upsert(mode === 'replace' ? [] : out.students, records.map(({ advisorName, ...s }) => s), 'code');
    const adv = records.filter((r) => r.advisorId).map((r) => ({ id: r.advisorId, name: r.advisorName || r.advisorId, facultyId: r.facultyId }));
    out.advisors = upsert(mode === 'replace' ? [] : out.advisors, adv, 'id');
  } else if (kind === 'phieu_khao_sat') {
    const wavesInFile = new Set(records.map((r) => r.waveId));
    const kept = mode === 'replace' ? out.responses.filter((r) => !wavesInFile.has(r.waveId)) : out.responses;
    out.responses = upsert(kept, records.map(({ semesterId, dot, ...r }) => r), 'id');
    const waves = new Map(out.waves.map((w) => [w.id, w]));
    for (const id of wavesInFile) {
      const rec = records.filter((r) => r.waveId === id);
      const times = rec.map((r) => r.time).sort();
      const median = times[Math.floor(times.length / 2)];
      if (!waves.has(id)) {
        waves.set(id, { id, semesterId: rec[0].semesterId, dot: rec[0].dot, date: median.slice(0, 10), status: 'pending', publishedAt: null });
      }
    }
    out.waves = orderWaves([...waves.values()], out.semesters);
    const known = new Set(out.students.map((s) => s.code));
    const classFaculty = new Map(out.classes.map((c) => [c.id, c.facultyId]));
    const extra = [];
    for (const r of records) {
      if (!known.has(r.researchCode)) {
        known.add(r.researchCode);
        extra.push({ code: r.researchCode, homeroom: '', advisorId: null, facultyId: classFaculty.get(r.classId) ?? null });
      }
    }
    out.students = [...out.students, ...extra];
  } else if (kind === 'diem_hoc_vu') {
    const key = (g) => `${g.researchCode}|${g.classId}`;
    const map = new Map((mode === 'replace' ? [] : out.grades).map((g) => [key(g), g]));
    for (const g of records) map.set(key(g), g);
    out.grades = [...map.values()];
  } else if (kind === 'tham_so_nghien_cuu') {
    const p = records[0];
    const prev = out.params || {};
    out.params = {
      ...prev,
      source: 'Nhập từ tham_so_nghien_cuu.csv',
      weights: Object.keys(p.weights).length ? p.weights : prev.weights,
      invariance: { ...(mode === 'replace' ? {} : prev.invariance), ...p.invariance },
      latent: { ...(mode === 'replace' ? {} : prev.latent), ...p.latent },
    };
  } else if (kind === 'thu_vien_bien_phap') {
    out.measures = upsert(mode === 'replace' ? [] : out.measures, records, 'code');
  }
  return out;
}

function semesterKey(id) {
  const m = String(id).match(/^HK([123])-(\d{2})(\d{2})$/);
  return m ? Number(m[2]) * 10 + Number(m[1]) : 0;
}

export function orderWaves(waves, semesters) {
  const semOrder = new Map(semesters.map((s, i) => [s.id, i]));
  return [...waves]
    .sort((a, b) => (semOrder.get(a.semesterId) ?? 0) - (semOrder.get(b.semesterId) ?? 0) || (a.dot === 'GK' ? -1 : 1) - (b.dot === 'GK' ? -1 : 1))
    .map((w, i) => ({ ...w, order: i }));
}

export function validationContext(ds, pending = {}) {
  const classes = pending.danh_muc_lop ? [...ds.classes, ...pending.danh_muc_lop] : ds.classes;
  return {
    classIds: new Set(classes.map((c) => c.id)),
    classSemester: new Map(classes.map((c) => [c.id, c.semesterId])),
    cfg: DEFAULT_CONFIG,
  };
}
