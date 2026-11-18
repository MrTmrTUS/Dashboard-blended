// Tầng truy vấn của M6 – Kết quả học tập theo CLO (bản chính thức: /clo/… trên máy chủ).
// Dùng chung danh mục lớp, sinh viên, phân quyền và kế hoạch cải tiến với dashboard BL; mọi hàm nhận người dùng
// hiện tại và lọc theo phạm vi trước khi trả dữ liệu; dữ liệu cấp sinh viên chỉ giảng viên phụ trách (và cố vấn
// với danh sách cần hỗ trợ) được xem, mỗi lượt xem đều ghi nhật ký.
import { AccessDenied, canSee, classInScope, cloCanApprove, cloCanDraft, cloCanImport, cloCanPlan, cloStudentLevel, isReadOnly } from './access.js';
import { boxStats, chapterAnalysis, checkMatrix, classResult, CLO_STATUS, correlation, errorPareto, evidenceFunnel, gapCases, histogram, itemAnalysis, pChart, passOf, raterAnalysis, rateStatus, resolveVersion, runChart, semKey, versionForClass } from './core/clo.js';
import { ITEM_CODES } from './core/constants.js';
import { itemMeans } from './core/scoring.js';
import { isNum, mean } from './core/stats.js';
import { LEVEL_SCALES, SUPPORT_HINTS } from './data/clo-catalog.js';
import { accessLog, cloRev, cloSupport, cloVersions, contacted, plans as planStore, state } from './store.js';

export { CLO_STATUS };

const EMPTY = { versions: [], rosters: {}, submissions: [], support: [], errorTypes: [], bank: {}, forms: {}, programs: [] };

// ---- Bộ quy tắc (phiên bản dữ liệu + bản sửa, bản nháp của người dùng) ---------------------------------

export function mergeVersions(base, overlay) {
  const out = base.map((v) => (overlay.patch?.[v.id] ? { ...v, ...overlay.patch[v.id] } : v));
  for (const v of overlay.added || []) if (!out.some((x) => x.id === v.id)) out.push(v);
  return out.filter((v) => v.status !== 'deleted');
}

let mart = { key: null };

export function cloMart() {
  const key = `${state.version}|${cloRev()}|${state.datasetKey}`;
  if (mart.key === key) return mart;
  const ds = state.dataset;
  const o = { ...EMPTY, ...(ds.outcomes || {}) };
  const raw = mergeVersions(o.versions || [], cloVersions.overlay());
  const versions = raw.map(resolveVersion);
  const subsByClass = new Map();
  for (const x of o.submissions || []) {
    if (!subsByClass.has(x.c)) subsByClass.set(x.c, []);
    subsByClass.get(x.c).push(x);
  }
  const ids = new Set([...Object.keys(o.rosters || {}), ...subsByClass.keys()]);
  const entries = ds.classes
    .filter((c) => ids.has(c.id))
    .map((cls) => {
      const subs = subsByClass.get(cls.id) || [];
      const roster = o.rosters?.[cls.id]?.length ? o.rosters[cls.id] : [...new Set(subs.map((x) => x.s))].map((s) => ({ s, st: 'active', att: null }));
      return { cls, rv: versionForClass(versions, cls), roster, subs };
    });
  mart = { key, o, raw, versions, entries, byId: new Map(entries.map((e) => [e.cls.id, e])), results: new Map(), cohorts: new Map() };
  return mart;
}

export function cloResult(classId, mode = 'latest') {
  const m = cloMart();
  const e = m.byId.get(classId);
  if (!e?.rv) return null;
  const k = `${classId}|${mode}`;
  if (!m.results.has(k)) m.results.set(k, classResult({ rv: e.rv, roster: e.roster, subs: e.subs, mode, nearBand: state.cfg.cloNearBand ?? 0.5 }));
  return m.results.get(k);
}

export const levelLabel = (domain, level) => {
  const sc = LEVEL_SCALES[domain];
  return sc ? `${level}/${sc.scale} · ${sc.names[level - 1] ?? ''}` : String(level ?? '–');
};

const advisorCodes = (user) => new Set(state.dataset.students.filter((s) => s.advisorId === user.advisorId).map((s) => s.code));

export function cloEntriesFor(user) {
  const m = cloMart();
  if (user.role === 'cvht') {
    const codes = advisorCodes(user);
    return m.entries.filter((e) => e.roster.some((r) => codes.has(r.s)));
  }
  return m.entries.filter((e) => classInScope(user, e.cls));
}

export function cloSemesters(user) {
  const ids = new Set(cloEntriesFor(user).map((e) => e.cls.semesterId));
  return state.dataset.semesters.filter((s) => ids.has(s.id));
}

export const semesterLabel = (id) => state.dataset.semesters.find((s) => s.id === id)?.label ?? id;
const shortSem = (id) => semesterLabel(id).replace(/HK(\d) (\d{2})(\d{2})–\d{2}(\d{2})/, 'HK$1 $3–$4');
export const classShort = (cls) => `${cls.lineage.split('-').pop()} · ${shortSem(cls.semesterId)}`;

// Bộ lọc dùng chung của M6 (học kỳ, lớp, CLO, lần đánh giá, bài đánh giá).
export function resolveCloFilters(user, query = {}) {
  const entries = cloEntriesFor(user);
  const sems = state.dataset.semesters.filter((s) => entries.some((e) => e.cls.semesterId === s.id));
  let semesterId = sems.some((s) => s.id === query.ky) ? query.ky : sems[sems.length - 1]?.id ?? '';
  const byQuery = entries.find((e) => e.cls.id === query.lop);
  if (byQuery && !query.ky) semesterId = byQuery.cls.semesterId;
  const classes = entries.filter((e) => e.cls.semesterId === semesterId);
  const entry = classes.find((e) => e.cls.id === query.lop) || classes[0] || null;
  const rv = entry?.rv ?? null;
  const course = entry ? state.dataset.courses.find((c) => c.id === entry.cls.courseId) : null;
  return {
    semesterId,
    sems,
    classes,
    classId: entry?.cls.id ?? '',
    entry,
    rv,
    course,
    clo: rv?.cloCodes.includes(query.clo) ? query.clo : '',
    mode: query.lan === 'dau' ? 'initial' : 'latest',
    assessment: rv?.aByCode.has(query.bai) ? query.bai : '',
  };
}

export const modeLabel = (mode) => (mode === 'initial' ? 'Lần đánh giá đầu' : 'Sau đánh giá lại (lần gần nhất)');

export function scopeText(f) {
  const parts = [semesterLabel(f.semesterId)];
  if (f.entry) parts.push(f.entry.cls.name);
  parts.push(f.clo ? f.clo : 'Tất cả CLO');
  parts.push(modeLabel(f.mode));
  if (f.assessment) parts.push(f.rv.aByCode.get(f.assessment)?.name ?? f.assessment);
  return parts.join(' · ');
}

// ---- Danh sách lớp (trang đầu M6) --------------------------------------------------------------------

const lcFirst = (t) => String(t || '').charAt(0).toLowerCase() + String(t || '').slice(1);

export function needOf(s, rv) {
  const issues = [];
  // Chưa đủ minh chứng chỉ vì bài đã nộp chưa được chấm: việc của giảng viên, không phải sinh viên cần hỗ trợ.
  const onlyPending = s.pendingWork.length && !s.missingWork.length && !s.banned.length;
  if (s.banned.length) issues.push({ kind: 'banned', label: 'Không đủ điều kiện dự thi' });
  for (const a of s.missingWork) issues.push({ kind: 'missing', label: `Thiếu ${lcFirst(rv.aByCode.get(a)?.name ?? a)}`, assessment: a });
  for (const a of s.pendingWork) issues.push({ kind: 'pending', label: `Chờ chấm ${lcFirst(rv.aByCode.get(a)?.name ?? a)}`, assessment: a });
  for (const c of rv.cloCodes) {
    const x = s.clo[c];
    if (x.status === 'insufficient') issues.push(onlyPending ? { kind: 'pending_clo', label: `${c} chờ chấm bài`, clo: c } : { kind: 'insufficient', label: `${c} chưa đủ minh chứng`, clo: c });
    else if (x.status === 'not_achieved') issues.push({ kind: 'not_achieved', label: `${c} ${fmt1(x.score)} < ${fmt1(passOf(rv, c))}`, clo: c, score: x.score });
    else if (x.near) issues.push({ kind: 'near', label: `${c} sát ngưỡng (${fmt1(x.score)})`, clo: c, score: x.score });
  }
  const need = issues.some((i) => ['banned', 'missing', 'insufficient', 'not_achieved'].includes(i.kind));
  return { issues, need };
}

const fmt1 = (v) => (isNum(v) ? v.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '–');

export function cloHome(user, f) {
  if (!canSee(user, 'M6')) throw new AccessDenied();
  const ds = state.dataset;
  const m = cloMart();
  const lect = new Map(ds.lecturers.map((l) => [l.id, l]));
  const rows = f.classes.map((e) => {
    const res = e.rv ? cloResult(e.cls.id, 'latest') : null;
    const need = res ? res.students.filter((s) => needOf(s, e.rv).need).length : 0;
    return { ...e, res, lecturer: lect.get(e.cls.lecturerId), need };
  });
  const facultyOk = (c) => user.role !== 'khoa' || c.facultyId === user.facultyId;
  const courses = ds.courses.filter(facultyOk);
  const configured = courses.filter((c) => m.versions.some((v) => v.courseId === c.id && v.status === 'approved'));
  const pending = m.versions.filter((v) => ['pending', 'draft'].includes(v.status) && courses.some((c) => c.id === v.courseId));
  return { rows, courses, configured, pending, studentLevel: rows.some((r) => cloStudentLevel(user, r.cls)) };
}

// ---- Cấu hình ma trận (nghiệp vụ 1 – 2) ------------------------------------------------------------------

export function cloCourses(user) {
  const m = cloMart();
  const ds = state.dataset;
  const ids = new Set(m.versions.map((v) => v.courseId));
  return ds.courses.filter((c) => ids.has(c.id) && (user.role !== 'khoa' || c.facultyId === user.facultyId) && (user.role !== 'gv' || ds.classes.some((x) => x.courseId === c.id && x.lecturerId === user.lecturerId) || true));
}

export function cloConfig(user, { courseId, versionId }) {
  if (!canSee(user, 'M6') || user.role === 'cvht') throw new AccessDenied('Cố vấn học tập chỉ xem danh sách sinh viên cần hỗ trợ');
  const ds = state.dataset;
  const m = cloMart();
  const courses = cloCourses(user);
  const course = courses.find((c) => c.id === courseId) || courses[0] || null;
  if (!course) return { empty: true, courses };
  const versions = m.versions.filter((v) => v.courseId === course.id).sort((a, b) => semKey(b.effectiveFrom) - semKey(a.effectiveFrom) || String(b.createdAt || b.approvedAt || '').localeCompare(String(a.createdAt || a.approvedAt || '')));
  const rv = versions.find((v) => v.id === versionId) || versions.find((v) => v.status === 'approved') || versions[0];
  const applying = m.entries.filter((e) => e.rv?.id === rv.id);
  const teaches = ds.classes.some((x) => x.courseId === course.id && x.lecturerId === user.lecturerId);
  const program = (m.o.programs || []).find((p) => p.id === rv.programId) || null;
  const checks = checkMatrix(rv, { weightTol: state.cfg.cloWeightTol ?? 0.05 });
  const history = cloVersions.overlay().history.filter((h) => versions.some((v) => v.id === h.versionId));
  return {
    course,
    courses,
    versions,
    rv,
    checks,
    applying,
    program,
    history,
    canDraft: cloCanDraft(user, course, teaches),
    canApprove: cloCanApprove(user, course),
    editable: ['draft', 'pending'].includes(rv.status) && cloCanDraft(user, course, teaches),
  };
}

// Xem trước tác động: tính lại các lớp có dữ liệu của học phần bằng bộ quy tắc khác (không lưu).
export function cloPreview(rvDraft, courseId) {
  const m = cloMart();
  const entries = m.entries.filter((e) => e.cls.courseId === courseId && e.rv);
  // Học kỳ đã kết thúc gần nhất (đủ bài đánh giá) và học kỳ hiện tại (nếu khác).
  const sems = [...new Set(entries.map((e) => e.cls.semesterId))].sort((a, b) => semKey(b) - semKey(a));
  const complete = sems.find((s) => entries.some((e) => e.cls.semesterId === s && cloResult(e.cls.id)?.complete));
  const pick = new Set([complete, sems[0]].filter(Boolean));
  const target = entries.filter((e) => pick.has(e.cls.semesterId));
  return target.map((e) => {
    const cur = cloResult(e.cls.id, 'latest');
    const next = classResult({ rv: rvDraft, roster: e.roster, subs: e.subs, mode: 'latest' });
    return { cls: e.cls, codes: [...new Set([...e.rv.cloCodes, ...rvDraft.cloCodes])], cur, next, curRv: e.rv };
  });
}

// ---- Tổng quan lớp (nghiệp vụ 4) ----------------------------------------------------------------------

function assertClass(user, f) {
  if (!canSee(user, 'M6')) throw new AccessDenied();
  if (!f.entry) return false;
  if (user.role === 'cvht') throw new AccessDenied('Cố vấn học tập xem kết quả CLO ở mục "Cần hỗ trợ"');
  if (!classInScope(user, f.entry.cls)) throw new AccessDenied('Bạn chỉ xem được lớp trong phạm vi phụ trách');
  return true;
}

function metricValues(res, f, kind = null) {
  if (kind === 'process') return { values: res.students.map((s) => s.process).filter(isNum), label: 'Điểm quá trình tạm tính (thang 10)', pass: f.rv.rules.coursePass, kind: 'process' };
  if (kind === 'course') return { values: res.complete ? res.students.map((s) => s.course).filter(isNum) : [], label: 'Điểm học phần (thang 10)', pass: f.rv.rules.coursePass, kind: 'course' };
  if (f.clo) return { values: res.students.map((s) => s.clo[f.clo].score).filter((v, i) => ['achieved', 'not_achieved'].includes(res.students[i].clo[f.clo].status)), label: `Điểm ${f.clo} (thang 10)`, pass: passOf(f.rv, f.clo), kind: 'clo' };
  if (f.assessment) return { values: res.students.map((s) => s.aScore[f.assessment]).filter(isNum), label: `Điểm ${f.rv.aByCode.get(f.assessment).name} (thang 10)`, pass: f.rv.rules.coursePass, kind: 'assessment' };
  if (res.complete) return { values: res.students.map((s) => s.course).filter(isNum), label: 'Điểm học phần (thang 10)', pass: f.rv.rules.coursePass, kind: 'course' };
  return { values: res.students.map((s) => s.process).filter(isNum), label: 'Điểm quá trình tạm tính (thang 10)', pass: f.rv.rules.coursePass, kind: 'process' };
}

export function cloOverview(user, f) {
  if (!assertClass(user, f)) return { empty: true };
  const { entry, rv } = f;
  if (!rv) return { noRules: true, cls: entry.cls };
  const res = cloResult(entry.cls.id, f.mode);
  const resLatest = cloResult(entry.cls.id, 'latest');
  const studentLevel = cloStudentLevel(user, entry.cls);
  const metric = metricValues(res, f);
  const bins = histogram(metric.values, { pass: metric.pass, near: state.cfg.cloNearBand ?? 0.5 });
  // So sánh lớp và học kỳ (cùng học phần) – box plot theo cùng chỉ số
  const peers = cloEntriesFor(user)
    .filter((e) => e.cls.courseId === entry.cls.courseId && e.rv)
    .sort((a, b) => semKey(a.cls.semesterId) - semKey(b.cls.semesterId) || a.cls.lineage.localeCompare(b.cls.lineage));
  const boxes = peers.map((e) => {
    const r = cloResult(e.cls.id, f.mode);
    const v = metricValues(r, { ...f, rv: e.rv, entry: e }, metric.kind === 'process' || metric.kind === 'course' ? metric.kind : null);
    return { cls: e.cls, label: classShort(e.cls), stats: boxStats(v.values), n: v.values.length, version: e.rv.version, comparable: e.rv.id === rv.id || sameStructure(e.rv, rv), inProgress: r.inProgress, current: e.cls.id === entry.cls.id, kind: v.kind };
  });
  const funnel = evidenceFunnel(res, rv, f.clo);
  const gaps = gapCases(res.students, { gap: state.cfg.cloGapFlag ?? 3 });
  const lowest = rv.cloCodes.map((c) => res.clo[c]).filter((x) => !x.notAssessed && isNum(x.rate)).sort((a, b) => a.rate - b.rate)[0] || null;
  const needs = res.students.map((s) => needOf(s, rv)).filter((x) => x.need).length;
  return {
    cls: entry.cls,
    rv,
    res,
    resLatest,
    studentLevel,
    metric,
    bins,
    boxes,
    funnel,
    gaps,
    lowest,
    needs,
    scatter: studentLevel ? res.students.filter((s) => isNum(s.process) && isNum(s.exam)).map((s) => ({ code: s.code, x: s.process, y: s.exam, flagged: gaps.some((g) => g.code === s.code) })) : null,
    survey: surveyLink(entry.cls, res, rv),
    lecturer: state.dataset.lecturers.find((l) => l.id === entry.cls.lecturerId),
  };
}

function sameStructure(a, b) {
  if (!a || !b || a.courseId !== b.courseId) return false;
  const sig = (v) => v.items.map((it) => `${it.key}:${it.max}:${Object.keys(it.w).sort().join('+')}`).join('|') + `|${v.rules.pass}`;
  return sig(a) === sig(b);
}

// Đối chiếu với khảo sát BL của cùng lớp: cảm nhận của sinh viên về CLO và đánh giá ↔ kết quả đo được.
const SURVEY_ITEMS = ['Q_C1_1', 'Q_P1_1', 'Q_P1_2', 'Q_P1_4', 'Q_P1_5', 'Q_Pt1_1'];

export function surveyLink(cls, res, rv) {
  const bl = state.mart;
  if (!bl) return null;
  const waves = bl.waves.filter((w) => w.semesterId === cls.semesterId && bl.classWave.has(`${cls.id}|${w.id}`));
  const wave = waves[waves.length - 1];
  if (!wave) return null;
  const cw = bl.classWave.get(`${cls.id}|${wave.id}`);
  const validIds = new Set(bl.validRows.filter((r) => r.waveId === wave.id).map((r) => r.id));
  const all = state.dataset.responses.filter((r) => r.waveId === wave.id && validIds.has(r.id));
  const mine = all.filter((r) => r.classId === cls.id);
  const im = new Map(itemMeans(mine).map((x) => [x.code, x]));
  const sm = new Map(itemMeans(all).map((x) => [x.code, x]));
  const idx = ITEM_CODES.indexOf('Q_Pt1_1');
  const answered = mine.filter((r) => r.v[idx]);
  const agree = answered.length ? answered.filter((r) => r.v[idx] >= 4).length / answered.length : null;
  // Gắn kết (khảo sát) × điểm CLO của sinh viên đồng ý liên kết.
  const students = bl.students.filter((s) => s.classId === cls.id && isNum(s.eng));
  const engByCode = new Map(students.map((s) => [s.researchCode, s]));
  const corr = rv.cloCodes
    .filter((c) => !res.clo[c].notAssessed)
    .map((c) => {
      const pairs = res.students.filter((s) => engByCode.has(s.code) && isNum(s.clo[c].score) && s.clo[c].status !== 'insufficient');
      return { clo: c, n: pairs.length, r: correlation(pairs.map((s) => engByCode.get(s.code).eng), pairs.map((s) => s.clo[c].score)) };
    });
  return {
    wave,
    waveLabel: wave ? `${wave.dot === 'GK' ? 'Giữa kỳ' : 'Cuối kỳ'} ${semesterLabel(wave.semesterId)}` : '',
    hidden: cw.hidden,
    n: cw.n,
    status: cw.status,
    ps1: cw.metrics.PS1.mean,
    ps1School: bl.byWave.get(wave.id).school.metrics.PS1.mean,
    items: SURVEY_ITEMS.map((code) => ({ code, mean: cw.hidden ? null : im.get(code)?.mean ?? null, school: sm.get(code)?.mean ?? null, n: im.get(code)?.n ?? 0 })),
    perceived: cw.hidden ? null : agree,
    actual: res.all.rate,
    corr,
  };
}

// ---- Phân tích CLO (nghiệp vụ 4 – 5, 7) ---------------------------------------------------------------

function cohortResults(user, courseId, semesterId, mode) {
  return cloEntriesFor(user).filter((e) => e.cls.courseId === courseId && e.cls.semesterId === semesterId && e.rv).map((e) => ({ e, res: cloResult(e.cls.id, mode) }));
}

export function pooledClo(results, code) {
  const n = results.reduce((s, x) => s + x.res.clo[code].n, 0);
  const k = results.reduce((s, x) => s + x.res.clo[code].nAchieved, 0);
  return { n, k, rate: n ? k / n : null };
}

export function cloAnalysis(user, f, { view = 'clo' } = {}) {
  if (!assertClass(user, f)) return { empty: true };
  const { entry, rv } = f;
  if (!rv) return { noRules: true, cls: entry.cls };
  const cls = entry.cls;
  const res = cloResult(cls.id, f.mode);
  const studentLevel = cloStudentLevel(user, cls);
  const cohort = cohortResults(user, cls.courseId, cls.semesterId, f.mode);
  const target = rv.rules.target;
  const bars = rv.cloCodes.map((c) => {
    const x = res.clo[c];
    const pooled = pooledClo(cohort, c);
    return { code: c, short: rv.cloByCode.get(c)?.short ?? c, rate: x.rate, n: x.n, nAchieved: x.nAchieved, mean: x.mean, status: x.notAssessed ? 'none' : x.status, notAssessed: x.notAssessed, nInsufficient: x.nInsufficient, heldShare: x.heldShare, course: pooled.rate, courseN: pooled.n };
  });
  const out = { cls, rv, res, studentLevel, bars, target, cohortN: cohort.length, view };
  if (view === 'clo') {
    if (studentLevel) {
      out.heat = {
        kind: 'student',
        rows: [...res.students]
          .sort((a, b) => b.nNotAchieved - a.nNotAchieved || b.nInsufficient - a.nInsufficient || mean(rv.cloCodes.map((c) => a.clo[c].score)) - mean(rv.cloCodes.map((c) => b.clo[c].score)))
          .map((s) => ({ id: s.code, label: s.code, cells: rv.cloCodes.map((c) => ({ code: c, ...s.clo[c] })), retaken: Object.values(s.retaken).some(Boolean), notes: needOf(s, rv).issues.filter((i) => ['banned', 'missing', 'pending'].includes(i.kind)).map((i) => i.label) })),
      };
      accessLog.add({ userId: user.id, userName: user.name, role: user.roleLabel, action: 'Xem kết quả CLO cấp sinh viên (M6)', target: cls.name, count: res.students.length });
    } else {
      const peers = cloEntriesFor(user).filter((e) => e.cls.courseId === cls.courseId && e.rv).sort((a, b) => semKey(a.cls.semesterId) - semKey(b.cls.semesterId) || a.cls.lineage.localeCompare(b.cls.lineage));
      out.heat = {
        kind: 'class',
        rows: peers.map((e) => {
          const r = cloResult(e.cls.id, f.mode);
          return { id: e.cls.id, label: classShort(e.cls), current: e.cls.id === cls.id, inProgress: r.inProgress, n: r.nActive, cells: rv.cloCodes.map((c) => ({ code: c, rate: r.clo[c]?.rate ?? null, n: r.clo[c]?.n ?? 0, status: r.clo[c]?.notAssessed ? 'none' : r.clo[c]?.status ?? 'na' })) };
        }),
      };
    }
  }
  if (view === 'chan-doan') {
    const lowest = bars.filter((b) => !b.notAssessed && isNum(b.rate)).sort((a, b) => a.rate - b.rate)[0];
    const clo = f.clo || lowest?.code || rv.cloCodes[0];
    const subs = entry.subs;
    const ia = itemAnalysis({ rv, subs, semesterId: cls.semesterId, outcomes: cloMart().o, thresholds: thresholds() });
    const items = rv.items
      .filter((it) => it.w[clo])
      .map((it) => {
        const row = ia.rows.find((r) => r.key === it.key);
        const held = res.held.includes(it.assessment);
        return { ...it, held, row, share: it.g * it.w[clo] / (rv.actual[clo] || 1) };
      });
    const mcqClass = ia.mcqRows;
    out.diag = {
      clo,
      cloInfo: rv.cloByCode.get(clo),
      items,
      chapters: chapterAnalysis(ia.rows, mcqClass, rv.chapters || []).filter((ch) => ch.items || ch.mcq),
      pareto: errorPareto({ rv, subs, errorTypes: cloMart().o.errorTypes, clo, assessment: f.assessment }),
      paretoAll: errorPareto({ rv, subs, errorTypes: cloMart().o.errorTypes, assessment: f.assessment }),
    };
  }
  if (view === 'de-cham') {
    const subs = cohort.flatMap((x) => x.e.subs);
    const ia = itemAnalysis({ rv, subs, semesterId: cls.semesterId, outcomes: cloMart().o, thresholds: thresholds() });
    const forms = {};
    for (const x of subs.filter((s) => s.st === 'graded' && s.t === 1)) {
      const a = rv.aByCode.get(x.a);
      if (!a || (a.forms || []).length < 2) continue;
      const total = a.items.reduce((sum, it) => sum + (isNum(x.pts?.[it.code]) ? x.pts[it.code] : 0), 0);
      const k = `${x.a}|${x.f}`;
      (forms[k] ||= { assessment: a.name, form: x.f, values: [] }).values.push((10 * total) / rv.aMax[x.a]);
    }
    out.quality = {
      ia,
      forms: Object.values(forms).map((x) => ({ ...x, n: x.values.length, mean: mean(x.values) })),
      raters: raterAnalysis({ rv, subs, tol: state.cfg.cloRaterTol ?? 0.5 }),
      ratersClass: raterAnalysis({ rv, subs: entry.subs, tol: state.cfg.cloRaterTol ?? 0.5 }),
      cohortClasses: cohort.map((x) => x.e.cls),
      lecturers: new Map(state.dataset.lecturers.map((l) => [l.id, l.name])),
    };
  }
  return out;
}

const thresholds = () => ({ easy: state.cfg.cloItemEasy ?? 0.9, hard: state.cfg.cloItemHard ?? 0.3, disc: state.cfg.cloItemDisc ?? 0.2 });

// Truy vết điểm nguồn của một sinh viên × CLO (chỉ giảng viên phụ trách lớp).
export function cloTrace(user, classId, code, clo, mode = 'latest') {
  const e = cloMart().byId.get(classId);
  if (!e || !cloStudentLevel(user, e.cls)) throw new AccessDenied('Chỉ giảng viên phụ trách lớp xem được điểm nguồn của sinh viên');
  const rv = e.rv;
  const res = cloResult(classId, mode);
  const s = res.students.find((x) => x.code === code);
  const subs = e.subs.filter((x) => x.s === code && (mode === 'initial' ? x.t === 1 : true)).sort((a, b) => a.t - b.t);
  const rows = rv.items
    .filter((it) => it.w[clo])
    .map((it) => {
      let used = null;
      for (const x of subs) if (x.a === it.assessment && x.st === 'graded' && isNum(x.pts?.[it.code])) used = x;
      const first = subs.find((x) => x.a === it.assessment && x.t === 1);
      return {
        item: it,
        weight: (it.g * it.w[clo]) / (rv.actual[clo] || 1),
        points: used ? used.pts[it.code] : null,
        attempt: used?.t ?? null,
        form: used?.f ?? first?.f ?? null,
        date: used?.d ?? first?.d ?? null,
        state: used ? 'graded' : first?.st ?? (res.held.includes(it.assessment) ? 'missing' : 'not_held'),
        r1: used?.r1?.[it.code] ?? null,
        r2: used?.r2?.[it.code] ?? null,
        errors: (used?.err || []).filter(([c]) => c === it.code).map(([, x]) => x),
      };
    });
  accessLog.add({ userId: user.id, userName: user.name, role: user.roleLabel, action: 'Xem điểm nguồn CLO của sinh viên (M6)', target: `${e.cls.name} · ${code} · ${clo}`, count: rows.length });
  return { cls: e.cls, rv, student: s, clo, rows };
}

// ---- Cần hỗ trợ (nghiệp vụ 6) -------------------------------------------------------------------------

export function cloSupportList(user, f, { all = false } = {}) {
  if (!canSee(user, 'M6')) throw new AccessDenied();
  const ds = state.dataset;
  const studentView = user.role === 'gv' || user.role === 'cvht';
  const advisees = user.role === 'cvht' ? advisorCodes(user) : null;
  const entries = (f.entry && !all ? [f.entry] : f.classes).filter((e) => e.rv && (user.role !== 'gv' || e.cls.lecturerId === user.lecturerId));
  const records = cloSupport.all();
  const contactMap = contacted.map();
  const blStudents = new Map((state.mart?.students || []).map((s) => [`${s.researchCode}|${s.classId}`, s]));
  const types = new Map((cloMart().o.errorTypes || []).map((t) => [t.code, t]));
  const rows = [];
  const perClass = [];
  for (const e of entries) {
    const res = cloResult(e.cls.id, 'latest');
    const init = cloResult(e.cls.id, 'initial');
    const counts = { need: 0, missing: 0, insufficient: 0, not_achieved: 0, near: 0, supported: 0 };
    for (const s of res.students) {
      const { issues, need } = needOf(s, e.rv);
      const recs = records.filter((r) => r.classId === e.cls.id && r.code === s.code);
      for (const k of ['missing', 'insufficient', 'not_achieved', 'near']) if (issues.some((i) => i.kind === k || (k === 'missing' && i.kind === 'banned'))) counts[k]++;
      if (need) counts.need++;
      if (recs.length) counts.supported++;
      if (!studentView) continue;
      if (advisees && !advisees.has(s.code)) continue;
      if (!need && !recs.length && !issues.some((i) => i.kind === 'near' || i.kind === 'pending')) continue;
      // Dạng lỗi của sinh viên ở lần đánh giá đầu → gợi ý hỗ trợ theo nhóm lỗi chiếm ưu thế.
      const errs = {};
      for (const x of e.subs) if (x.s === s.code && x.t === 1 && x.err) for (const [, c] of x.err) errs[types.get(c)?.group ?? 'Khác'] = (errs[types.get(c)?.group ?? 'Khác'] || 0) + 1;
      const topGroup = Object.entries(errs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const s0 = init.students.find((x) => x.code === s.code);
      const bl = blStudents.get(`${s.code}|${e.cls.id}`) || null;
      rows.push({
        cls: e.cls,
        rv: e.rv,
        s,
        issues,
        need,
        errs,
        topGroup,
        hint: issues.some((i) => i.kind === 'missing' || i.kind === 'banned')
          ? 'Liên hệ sinh viên, tìm hiểu lý do, bố trí làm bài bù hoặc hướng dẫn thủ tục'
          : topGroup && SUPPORT_HINTS[topGroup] && issues.some((i) => i.kind === 'not_achieved' || i.kind === 'near')
            ? SUPPORT_HINTS[topGroup]
            : issues.some((i) => i.kind === 'pending_clo' || i.kind === 'pending')
              ? 'Giảng viên chấm bài đã nộp để có đủ minh chứng (không cần sinh viên làm thêm)'
              : issues.some((i) => i.kind === 'insufficient')
                ? 'Bổ sung minh chứng: làm bài bù, nộp lại bài còn thiếu trước hạn'
                : 'Ôn tập theo tiêu chí còn yếu, làm bài luyện tập tương đương',
        records: recs.map((r) => ({ ...r, before: s0?.clo[r.clo]?.score ?? null, beforeStatus: s0?.clo[r.clo]?.status ?? null, after: s.clo[r.clo]?.score ?? null, afterStatus: s.clo[r.clo]?.status ?? null, retested: Boolean(r.reassess && s.retaken[r.reassess.assessment]) })),
        bl: bl ? { eng: bl.eng, prob: bl.prob, status: bl.status } : null,
        contacted: contactMap[`${s.code}|${e.cls.id}`] || null,
      });
    }
    perClass.push({ cls: e.cls, n: res.nActive, ...counts });
  }
  const rank = (r) => (r.issues.some((i) => i.kind === 'banned' || i.kind === 'missing') ? 3 : 0) + (r.issues.some((i) => i.kind === 'not_achieved') ? 2 : 0) + (r.issues.some((i) => i.kind === 'insufficient') ? 1 : 0);
  rows.sort((a, b) => rank(b) - rank(a) || a.s.code.localeCompare(b.s.code));
  if (studentView && rows.length) {
    accessLog.add({ userId: user.id, userName: user.name, role: user.roleLabel, action: 'Xem danh sách cần hỗ trợ theo CLO (M6)', target: f.entry && !all ? f.entry.cls.name : `Tất cả lớp – ${semesterLabel(f.semesterId)}`, count: rows.length });
  }
  return { rows, perClass, studentView, canEdit: studentView && !isReadOnly(user) };
}

// ---- Theo dõi cải tiến, so sánh học kỳ, báo cáo (nghiệp vụ 8 – 10) ---------------------------------------

export function cloImprovement(user, { courseId, clo }) {
  if (!canSee(user, 'M6') || user.role === 'cvht') throw new AccessDenied();
  const m = cloMart();
  const ds = state.dataset;
  const entries = cloEntriesFor(user).filter((e) => e.rv && (!courseId || e.cls.courseId === courseId));
  const course = ds.courses.find((c) => c.id === (courseId || entries[0]?.cls.courseId)) || null;
  if (!course) return { empty: true };
  const mine = entries.filter((e) => e.cls.courseId === course.id);
  const rv = mine[mine.length - 1]?.rv ?? m.versions.find((v) => v.courseId === course.id);
  const code = rv?.cloCodes.includes(clo) ? clo : '';
  const sems = [...new Set(mine.map((e) => e.cls.semesterId))].sort((a, b) => semKey(a) - semKey(b));
  const series = sems.map((sem) => {
    const rs = mine.filter((e) => e.cls.semesterId === sem).map((e) => ({ e, res: cloResult(e.cls.id, 'latest') }));
    const inProgress = rs.some((x) => x.res.inProgress);
    let n = 0;
    let k = 0;
    if (code) {
      for (const x of rs) if (!x.res.clo[code].notAssessed) {
        n += x.res.clo[code].n;
        k += x.res.clo[code].nAchieved;
      }
    } else {
      for (const x of rs) {
        n += x.res.all.n;
        k += x.res.all.nAchieved;
      }
    }
    const version = [...new Set(rs.map((x) => x.e.rv.version))].join(', ');
    return { semesterId: sem, label: shortSem(sem), n, k, value: n ? k / n : null, inProgress, version, classes: rs.length };
  });
  const complete = series.filter((p) => !p.inProgress && p.n);
  const run = runChart(complete.map((p) => ({ ...p })));
  const control = pChart(complete.map((p) => ({ label: p.label, n: p.n, k: p.n - p.k })), { minRounds: state.cfg.cloControlMin ?? 8 });
  const comparison = mine.map((e) => {
    const res = cloResult(e.cls.id, 'latest');
    return { cls: e.cls, rv: e.rv, res, comparable: e.rv.id === rv.id || sameStructure(e.rv, rv), lecturer: ds.lecturers.find((l) => l.id === e.cls.lecturerId) };
  });
  const semBoxes = sems.map((sem) => {
    const vals = mine.filter((e) => e.cls.semesterId === sem).flatMap((e) => {
      const r = cloResult(e.cls.id, 'latest');
      if (code) return r.students.filter((s) => ['achieved', 'not_achieved'].includes(s.clo[code].status)).map((s) => s.clo[code].score);
      return r.complete ? r.students.map((s) => s.course).filter(isNum) : [];
    });
    return { label: shortSem(sem), stats: boxStats(vals), n: vals.length, inProgress: series.find((p) => p.semesterId === sem)?.inProgress, kind: code ? 'clo' : 'course' };
  });
  return { course, rv, clo: code, series, run, control, comparison, semBoxes, plans: cloPlans(user, course.id), target: rv?.rules.target ?? 0.7, canPlan: mine.some((e) => cloCanPlan(user, e.cls)), anchors: mine.map((e) => e.cls) };
}

// Kế hoạch cải tiến CLO (dùng chung kho kế hoạch PDCA với khảo sát BL) kèm đánh giá lại tự động.
export function cloPlans(user, courseId) {
  const m = cloMart();
  const ds = state.dataset;
  const list = planStore.all().filter((p) => p.domain === 'clo' && (!courseId || p.courseId === courseId));
  return list
    .filter((p) => {
      const cls = ds.classes.find((c) => c.id === p.classId);
      return !cls || classInScope(user, cls) || user.role === 'bgh';
    })
    .map((p) => ({ ...p, eval: evaluatePlan(p, m) }))
    .sort((a, b) => semKey(b.semesterId) - semKey(a.semesterId) || String(b.id).localeCompare(String(a.id)));
}

export function evaluatePlan(p, m = cloMart()) {
  const entries = m.entries.filter((e) => e.cls.courseId === p.courseId && e.rv);
  const pooled = (sem, mode = 'latest') => {
    const rs = entries.filter((e) => e.cls.semesterId === sem).map((e) => cloResult(e.cls.id, mode));
    if (!rs.length) return null;
    const n = rs.reduce((s, r) => s + (r.clo[p.clo]?.n ?? 0), 0);
    const k = rs.reduce((s, r) => s + (r.clo[p.clo]?.nAchieved ?? 0), 0);
    return { n, rate: n ? k / n : null, inProgress: rs.some((r) => r.inProgress) };
  };
  const next = [...new Set(entries.map((e) => e.cls.semesterId))].filter((s) => semKey(s) > semKey(p.semesterId)).sort((a, b) => semKey(a) - semKey(b));
  const target = entries[0]?.rv.rules.target ?? 0.7;
  if (p.metric === 'rate') {
    const b = pooled(p.semesterId);
    const afterSem = next.find((s) => pooled(s)?.inProgress === false && isNum(pooled(s)?.rate) && (pooled(s)?.n ?? 0) > 0);
    const a = afterSem ? pooled(afterSem) : null;
    return verdict({ before: b?.rate ?? null, after: a?.rate ?? null, afterLabel: afterSem ? semesterLabel(afterSem) : '', unit: 'rate', good: (x, y) => y > x, reached: (y) => y >= target, nBefore: b?.n, nAfter: a?.n, label: `Tỷ lệ đạt ${p.clo}` });
  }
  if (p.metric === 'rater') {
    const share = (sem) => {
      const subs = entries.filter((e) => e.cls.semesterId === sem).flatMap((e) => e.subs);
      const rv = entries.find((e) => e.cls.semesterId === sem)?.rv;
      if (!rv) return null;
      const r = raterAnalysis({ rv, subs, tol: state.cfg.cloRaterTol ?? 0.5 }).rows.find((x) => x.key === p.item);
      return r?.n ? r.over : null;
    };
    const afterSem = next.find((s) => isNum(share(s)));
    return verdict({ before: share(p.semesterId), after: afterSem ? share(afterSem) : null, afterLabel: afterSem ? semesterLabel(afterSem) : '', unit: 'rate', good: (x, y) => y < x, reached: (y) => y <= 0.05, label: 'Tỷ lệ bài lệch > 0,5 điểm giữa hai cán bộ chấm', lowerIsBetter: true });
  }
  if (p.metric === 'retest') {
    const b = cloResult(p.classId, 'initial');
    const a = cloResult(p.classId, 'latest');
    const retested = a ? a.students.filter((s) => Object.values(s.retaken).some(Boolean)).length : 0;
    return verdict({ before: b?.clo[p.clo]?.rate ?? null, after: retested ? a?.clo[p.clo]?.rate ?? null : null, afterLabel: retested ? `sau kiểm tra lại (${retested} sinh viên)` : '', unit: 'rate', good: (x, y) => y > x, reached: (y) => y >= target, label: `Tỷ lệ đạt ${p.clo} của lớp` });
  }
  if (p.metric === 'design') {
    const draft = m.versions.find((v) => v.courseId === p.courseId && v.basedOn && semKey(v.effectiveFrom) > semKey(p.semesterId));
    const ok = draft && draft.status === 'approved';
    const chk = draft ? checkMatrix(draft) : null;
    return { verdict: ok ? 'reached' : 'pending', text: draft ? `${ok ? 'Đã phê duyệt' : 'Chờ phê duyệt'} bộ quy tắc ${draft.version} – kiểm tra ma trận: ${chk.errors} lỗi, ${chk.warnings} cảnh báo` : 'Chưa có bản nháp chỉnh ma trận' };
  }
  return { verdict: 'pending', text: '' };
}

function verdict({ before, after, afterLabel, good, reached, label, nBefore, nAfter, lowerIsBetter = false }) {
  if (!isNum(before) || !isNum(after)) return { verdict: 'pending', before, after, afterLabel, label, lowerIsBetter, nBefore, nAfter };
  const v = reached(after) ? 'reached' : good(before, after) ? 'improved' : 'notImproved';
  return { verdict: v, before, after, afterLabel, label, lowerIsBetter, nBefore, nAfter };
}

// ---- Thông báo trong ứng dụng ---------------------------------------------------------------------------

export function cloNotifications(user) {
  if (!canSee(user, 'M6')) return [];
  const items = [];
  const m = cloMart();
  const entries = cloEntriesFor(user).filter((e) => e.rv);
  const latestSem = entries.map((e) => e.cls.semesterId).sort((a, b) => semKey(b) - semKey(a))[0];
  if (user.role === 'gv' || user.role === 'khoa' || user.role === 'qlcl') {
    for (const e of entries.filter((x) => x.cls.semesterId === latestSem)) {
      const res = cloResult(e.cls.id, 'latest');
      for (const c of e.rv.cloCodes) {
        const x = res.clo[c];
        if (x.notAssessed || x.status !== 'alert') continue;
        items.push({ id: `clo:${e.cls.id}:${c}:${Math.round((x.rate || 0) * 100)}`, level: 'alert', text: `${e.cls.name}: ${c} đạt ${Math.round(x.rate * 100)}% (mục tiêu ${Math.round(e.rv.rules.target * 100)}%)${res.inProgress ? ' – tạm tính' : ''}`, href: `#/clo/phan-tich?lop=${encodeURIComponent(e.cls.id)}&clo=${c}`, meta: `Kết quả CLO · ${semesterLabel(e.cls.semesterId)}` });
      }
    }
  }
  if (user.role === 'gv') {
    const open = cloSupport.all().filter((r) => r.status !== 'hoan_thanh' && entries.some((e) => e.cls.id === r.classId));
    if (open.length) items.push({ id: `clo-support:${user.id}:${open.length}`, level: 'warn', text: `${open.length} nhiệm vụ hỗ trợ sinh viên theo CLO chưa hoàn thành`, href: '#/clo/ho-tro', meta: 'Kết quả CLO · cần hỗ trợ' });
  }
  if (user.role === 'cvht') {
    const codes = advisorCodes(user);
    let k = 0;
    for (const e of entries.filter((x) => x.cls.semesterId === latestSem)) for (const s of cloResult(e.cls.id, 'latest').students) if (codes.has(s.code) && needOf(s, e.rv).need) k++;
    if (k) items.push({ id: `clo-cvht:${user.id}:${latestSem}:${k}`, level: 'warn', text: `${k} sinh viên bạn phụ trách chưa đạt hoặc thiếu minh chứng CLO`, href: '#/clo/ho-tro', meta: `Kết quả CLO · ${semesterLabel(latestSem)}` });
  }
  if (user.role === 'khoa' || user.role === 'qlcl' || user.role === 'admin') {
    for (const v of m.versions.filter((x) => x.status === 'pending')) {
      const course = state.dataset.courses.find((c) => c.id === v.courseId);
      if (!course || !cloCanApprove(user, course)) continue;
      items.push({ id: `clo-approve:${v.id}`, level: 'warn', text: `Bộ quy tắc CLO ${course.name} – ${v.version} chờ phê duyệt`, href: `#/clo/cau-hinh?hp=${encodeURIComponent(v.courseId)}&pb=${encodeURIComponent(v.id)}`, meta: 'Kết quả CLO · cấu hình ma trận' });
    }
  }
  return items;
}

// Dữ kiện cho trợ lý AI (tóm tắt có mã nguồn) của một lớp.
export function cloAssistantInput(classId, mode = 'latest') {
  const e = cloMart().byId.get(classId);
  if (!e?.rv) return null;
  return {
    cls: e.cls,
    rv: e.rv,
    res: cloResult(classId, mode),
    initial: mode === 'latest' ? cloResult(classId, 'initial') : null,
    pareto: errorPareto({ rv: e.rv, subs: e.subs, errorTypes: cloMart().o.errorTypes }),
    semesterLabel: semesterLabel(e.cls.semesterId),
  };
}

// Tóm tắt CLO của một lớp cho trang M2 (lớp học phần) – dùng chung một nguồn số liệu.
export function cloClassSummary(user, classId) {
  const e = cloMart().byId.get(classId);
  if (!e?.rv || !canSee(user, 'M6') || !classInScope(user, e.cls)) return null;
  const res = cloResult(classId, 'latest');
  return { cls: e.cls, rv: e.rv, res, needs: res.students.filter((s) => needOf(s, e.rv).need).length, studentLevel: cloStudentLevel(user, e.cls) };
}

// Trạng thái CLO của sinh viên cho M3 (cùng mã nghiên cứu, cùng lớp).
export function cloStudentStatus(classId, code) {
  const e = cloMart().byId.get(classId);
  if (!e?.rv) return null;
  const s = cloResult(classId, 'latest').students.find((x) => x.code === code);
  if (!s) return null;
  return { ...needOf(s, e.rv), s, rv: e.rv };
}

export function cloCanImportClass(user, cls) {
  return cloCanImport(user, cls);
}

export function statusLabel(code) {
  return CLO_STATUS[code]?.label ?? code;
}

export { rateStatus };
