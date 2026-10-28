// Tầng truy vấn cho giao diện – tương ứng các đường dẫn ở mục 5.8:
//   overview()      ↔ /tong-quan/?ky=&dot=&khoa=        (M1)
//   classList(), classDetail() ↔ /lop/<id>/               (M2)
//   students()      ↔ /sinh-vien/?lop=                   (M3, kiểm tra quyền, ghi nhật ký)
//   benchmark()     ↔ /doi-sanh/                         (M4)
// Mọi hàm đều nhận người dùng hiện tại và lọc theo phạm vi trước khi trả dữ liệu.
import { AccessDenied, canOpenClass, canSee, canSeeWave, classInScope, lockedFilters, studentRowInScope } from './access.js';
import { DIMENSIONS, DOT_LABELS, FACTORS, FACTOR_BY_CODE, INDICATOR_BY_CODE, METRICS, OUTCOMES } from './core/constants.js';
import { aggregateRows } from './core/engine.js';
import { crossValidate } from './core/logistic.js';
import { createRng } from './core/rng.js';
import { quadrant, weightedGaps } from './core/priority.js';
import { itemMeans, level, LEVEL_TO_STATUS } from './core/scoring.js';
import { isNum, mean } from './core/stats.js';
import { TOPIC_BY_ID } from './data/topics.js';
import { accessLog, contacted, plans as planStore, state } from './store.js';

export const FUNNEL_METRIC_OPTIONS = ['IDX', ...DIMENSIONS, ...OUTCOMES];

// ---- Danh mục và đợt ---------------------------------------------------------------

export function lookups() {
  const ds = state.dataset;
  return {
    faculty: new Map(ds.faculties.map((f) => [f.id, f])),
    course: new Map(ds.courses.map((c) => [c.id, c])),
    lecturer: new Map(ds.lecturers.map((l) => [l.id, l])),
    advisor: new Map(ds.advisors.map((a) => [a.id, a])),
    semester: new Map(ds.semesters.map((s) => [s.id, s])),
    wave: new Map(state.mart.waves.map((w) => [w.id, w])),
    cls: state.mart.classById,
  };
}

export function waveLabel(wave, { short = false } = {}) {
  if (!wave) return '–';
  const sem = state.dataset.semesters.find((s) => s.id === wave.semesterId);
  const semLabel = sem?.label ?? wave.semesterId;
  if (short) return `${wave.dot} ${semLabel.replace(/(\d{2})(\d{2})–\d{2}(\d{2})/, '$2–$3')}`;
  return `${DOT_LABELS[wave.dot] ?? wave.dot} ${semLabel}`;
}

export function visibleWaves(user) {
  return state.mart.waves.filter((w) => canSeeWave(user, w));
}

export function visibleSemesters(user) {
  const ids = new Set(visibleWaves(user).map((w) => w.semesterId));
  return state.dataset.semesters.filter((s) => ids.has(s.id));
}

export function facultiesFor(user) {
  const locked = lockedFilters(user);
  return state.dataset.faculties.filter((f) => !locked.facultyId || f.id === locked.facultyId);
}

export function coursesFor(user, facultyId) {
  return state.dataset.courses.filter((c) => (!facultyId || c.facultyId === facultyId) && facultiesFor(user).some((f) => f.id === c.facultyId));
}

// Chuẩn hóa tham số lọc từ đường dẫn, áp phạm vi bị khóa của vai trò.
export function resolveFilters(user, query = {}) {
  const waves = visibleWaves(user);
  const sems = visibleSemesters(user);
  const semesterId = sems.some((s) => s.id === query.ky) ? query.ky : sems[sems.length - 1]?.id ?? null;
  const semWaves = waves.filter((w) => w.semesterId === semesterId);
  const wave = semWaves.find((w) => w.dot === query.dot) || semWaves[semWaves.length - 1] || null;
  const locked = lockedFilters(user);
  let facultyId = locked.facultyId || (state.dataset.faculties.some((f) => f.id === query.khoa) ? query.khoa : '');
  let courseId = state.dataset.courses.some((c) => c.id === query.hp && (!facultyId || c.facultyId === facultyId)) ? query.hp : '';
  const metric = FUNNEL_METRIC_OPTIONS.includes(query.cs) ? query.cs : 'IDX';
  return { semesterId, waveId: wave?.id ?? null, dot: wave?.dot ?? null, facultyId, courseId, metric, locked };
}

function previousWave(user, waveId) {
  const waves = visibleWaves(user);
  const i = waves.findIndex((w) => w.id === waveId);
  return i > 0 ? waves[i - 1] : null;
}

function scopeTest(user, f) {
  const cls = state.mart.classById;
  return (classId) => {
    const c = cls.get(classId);
    return Boolean(c) && classInScope(user, c) && (!f.facultyId || c.facultyId === f.facultyId) && (!f.courseId || c.courseId === f.courseId);
  };
}

function scopeRows(waveId, test) {
  return state.mart.validRows.filter((r) => r.waveId === waveId && test(r.classId));
}

export function scopeLabel(f) {
  const lk = lookups();
  if (f.courseId) return `Học phần ${lk.course.get(f.courseId)?.name ?? f.courseId}`;
  if (f.facultyId) return lk.faculty.get(f.facultyId)?.name ?? f.facultyId;
  return 'Toàn Trường';
}

const statusOfMean = (x) => LEVEL_TO_STATUS[level(x, state.cfg)];

// ---- M1 – Tổng quan Trường, khoa ---------------------------------------------------

export function overview(user, f) {
  if (!canSee(user, 'M1')) throw new AccessDenied();
  const { mart, cfg, dataset: ds } = state;
  const lk = lookups();
  const wave = lk.wave.get(f.waveId);
  if (!wave) return { empty: true };
  const prev = previousWave(user, wave.id);
  const test = scopeTest(user, f);
  const rows = scopeRows(wave.id, test);
  const prevRows = prev ? scopeRows(prev.id, test) : [];
  const agg = aggregateRows(rows);
  const prevAgg = prev ? aggregateRows(prevRows) : null;
  const allRowsWave = mart.rows.filter((r) => r.waveId === wave.id && test(r.classId));

  // Thẻ KPI
  const series = visibleWaves(user)
    .filter((w) => w.order <= wave.order)
    .map((w) => ({ waveId: w.id, label: waveLabel(w, { short: true }), value: mean(scopeRows(w.id, test).map((r) => r.IDX)) }));
  const lowShare = (rs) => {
    const xs = rs.map((r) => r.IDX).filter(isNum);
    return xs.length ? { share: xs.filter((x) => x < cfg.levelLow).length / xs.length, k: xs.filter((x) => x < cfg.levelLow).length, n: xs.length } : null;
  };
  const low = lowShare(rows);
  const lowPrev = prev ? lowShare(prevRows) : null;
  const semClasses = ds.classes.filter((c) => c.semesterId === wave.semesterId && test(c.id));
  const cws = semClasses.map((c) => mart.classWave.get(`${c.id}|${wave.id}`)).filter(Boolean);
  const counts = { ok: 0, warn: 0, alert: 0, na: 0 };
  cws.forEach((cw) => counts[cw.status]++);
  const enrolled = semClasses.reduce((s, c) => s + (c.size || 0), 0);

  // Biểu đồ phễu
  const metric = f.metric;
  const fp = mart.byWave.get(wave.id).funnel[metric];
  const points = cws
    .filter((cw) => !cw.hidden && isNum(cw.metrics[metric].mean))
    .map((cw) => {
      const c = lk.cls.get(cw.classId);
      return {
        classId: cw.classId,
        name: c.name,
        faculty: lk.faculty.get(c.facultyId)?.short ?? c.facultyId,
        n: cw.metrics[metric].n,
        mean: cw.metrics[metric].mean,
        z: cw.z[metric],
        status: cw.status,
        reasons: cw.reasons,
        canOpen: canOpenClass(user, c),
      };
    });

  // Bản đồ nhiệt
  let heat;
  if (f.courseId) {
    heat = {
      rowsKind: 'class',
      rows: semClasses.map((c) => {
        const cw = mart.classWave.get(`${c.id}|${wave.id}`);
        return heatRow(c.id, c.name, cw ? cw.metrics : null, cw ? cw.n : 0, canOpenClass(user, c));
      }),
    };
  } else if (f.facultyId) {
    heat = {
      rowsKind: 'course',
      rows: ds.courses.filter((c) => c.facultyId === f.facultyId).map((c) => {
        const rs = rows.filter((r) => r.courseId === c.id);
        return heatRow(c.id, c.name, aggregateRows(rs), rs.length);
      }),
    };
  } else {
    heat = {
      rowsKind: 'faculty',
      rows: facultiesFor(user).map((fac) => {
        const rs = rows.filter((r) => r.facultyId === fac.id);
        return { ...heatRow(fac.id, fac.short || fac.name, aggregateRows(rs), rs.length), title: fac.name };
      }),
    };
  }

  // Pareto có trọng số, ma trận ưu tiên
  const dimMeans = Object.fromEntries(DIMENSIONS.map((d) => [d, agg[d].mean]));
  const pareto = weightedGaps(dimMeans, mart.weights, cfg.target);
  const inv = ds.params?.invariance || {};
  const ipa = DIMENSIONS.map((d) => ({
    code: d,
    name: FACTOR_BY_CODE[d].short,
    group: FACTOR_BY_CODE[d].group,
    w: mart.weights[d],
    mean: dimMeans[d],
    quadrant: isNum(dimMeans[d]) ? quadrant(mart.weights[d], dimMeans[d], 1 / DIMENSIONS.length, cfg.yellowDim) : null,
    universal: inv[d] ? inv[d].invariant : null,
  }));

  // Histogram (khoảng 0,25 điểm)
  const values = rows.map((r) => r[metric]).filter(isNum);
  const bins = [];
  for (let k = 0; k < 16; k++) {
    const x0 = 1 + k * 0.25;
    const x1 = x0 + 0.25;
    const count = values.filter((v) => v >= x0 && (k === 15 ? v <= x1 : v < x1)).length;
    bins.push({ x0, x1, count, status: statusOfMean(x0 + 0.001) });
  }

  // Xu hướng và biểu đồ kiểm soát (XmR) khi có từ 6 đợt
  const trendWaves = visibleWaves(user).filter((w) => w.order <= wave.order);
  const allTest = (classId) => {
    const c = lk.cls.get(classId);
    return Boolean(c) && classInScope(user, c);
  };
  const trendSchool = trendWaves.map((w) => {
    const rs = scopeRows(w.id, allTest);
    return { waveId: w.id, label: waveLabel(w, { short: true }), mean: mean(rs.map((r) => r[metric])), n: rs.length };
  });
  const isScoped = Boolean(f.facultyId || f.courseId);
  const trendScope = isScoped
    ? trendWaves.map((w) => {
        const rs = scopeRows(w.id, test);
        return { waveId: w.id, label: waveLabel(w, { short: true }), mean: mean(rs.map((r) => r[metric])), n: rs.length };
      })
    : null;
  const controlBase = (trendScope || trendSchool).filter((p) => isNum(p.mean) && p.n >= cfg.nMin);
  let control = { enabled: false, nWaves: controlBase.length, minWaves: cfg.controlChartMinWaves };
  if (controlBase.length >= cfg.controlChartMinWaves) {
    const xs = controlBase.map((p) => p.mean);
    const cl = mean(xs);
    const mr = mean(xs.slice(1).map((x, i) => Math.abs(x - xs[i])));
    control = { ...control, enabled: true, cl, ucl: cl + 2.66 * mr, lcl: cl - 2.66 * mr, mr };
  }

  return {
    wave,
    prev,
    scope: scopeLabel(f),
    isScoped,
    kpi: {
      index: { value: agg.IDX.mean, prev: prevAgg?.IDX.mean ?? null, n: agg.IDX.n, sd: agg.IDX.sd, series },
      low: { value: low?.share ?? null, prev: lowPrev?.share ?? null, k: low?.k ?? 0, n: low?.n ?? 0 },
      alerts: { ...counts, total: cws.length, classes: semClasses.length },
      response: { rate: enrolled ? rows.length / enrolled : null, nValid: rows.length, nTotal: allRowsWave.length, enrolled },
    },
    funnel: { metric, mu: fp.mu, sigma: fp.sigma, points, hidden: cws.filter((cw) => cw.hidden).length, noData: semClasses.length - cws.length },
    heat,
    pareto: { ...pareto, target: cfg.target, weightsSource: weightsSourceLabel() },
    ipa,
    histogram: { metric, bins, n: values.length, mean: mean(values) },
    trend: { metric, school: trendSchool, scope: trendScope, control },
    themes: themesFor(mart.comments.filter((c) => c.waveId === wave.id && test(c.classId)), wave.id),
    agg,
    rows,
  };
}

function heatRow(id, label, metrics, n, canOpen = false) {
  return {
    id,
    label,
    n,
    canOpen,
    cells: DIMENSIONS.map((d) => {
      const m = metrics?.[d];
      const enough = m && m.n >= state.cfg.nMin && isNum(m.mean);
      return { code: d, mean: enough ? m.mean : null, n: m?.n ?? 0, status: enough ? statusOfMean(m.mean) : 'na' };
    }),
  };
}

export function weightsSourceLabel() {
  const { cfg, dataset } = state;
  const hasNd2 = dataset.params?.weights && DIMENSIONS.every((d) => isNum(dataset.params.weights[d]));
  if (cfg.weightsSource === 'nd2' && hasNd2) return 'Trọng số Nội dung 2';
  return 'Trọng số đều 1/7';
}

// Chủ đề ý kiến: đếm theo chủ đề; câu trích chỉ lấy từ lớp đủ 10 phiếu.
function themesFor(comments) {
  const { mart, cfg } = state;
  const enough = (c) => {
    const cw = mart.classWave.get(`${c.classId}|${c.waveId}`);
    return cw && cw.n >= cfg.nMin;
  };
  const groups = new Map();
  for (const c of comments) {
    const id = c.chu_de || 'khac';
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(c);
  }
  const items = [...groups.entries()].map(([id, list]) => {
    const topic = TOPIC_BY_ID[id] || TOPIC_BY_ID.khac;
    const neg = list.filter((c) => c.sac_thai === 'tieu_cuc').length;
    const pos = list.filter((c) => c.sac_thai === 'tich_cuc').length;
    const quotable = list.filter(enough);
    const quotes = [...quotable.filter((c) => c.sac_thai === 'tieu_cuc'), ...quotable.filter((c) => c.sac_thai !== 'tieu_cuc')]
      .slice(0, 3)
      .map((c) => ({ id: c.id, text: c.text, sentiment: c.sac_thai }));
    return {
      id,
      label: topic.label,
      factor: topic.factor,
      group: FACTOR_BY_CODE[topic.factor]?.group ?? 'OTHER',
      total: list.length,
      neg,
      pos,
      quotes,
      hiddenQuotes: list.length - quotable.length,
    };
  });
  items.sort((a, b) => (a.id === 'khac') - (b.id === 'khac') || b.neg - a.neg || b.total - a.total);
  return { items, n: comments.length };
}

// ---- M2 – Lớp học phần ----------------------------------------------------------------

export function classList(user, f) {
  if (!canSee(user, 'M2')) throw new AccessDenied();
  const { mart, dataset: ds } = state;
  const lk = lookups();
  const wave = lk.wave.get(f.waveId);
  if (!wave) return { items: [], wave: null };
  const test = scopeTest(user, f);
  const allPlans = planStore.all();
  const items = ds.classes
    .filter((c) => c.semesterId === wave.semesterId && test(c.id))
    .map((c) => {
      const cw = mart.classWave.get(`${c.id}|${wave.id}`);
      const planCount = allPlans.filter((p) => p.classId === c.id && p.waveId === wave.id).length;
      return {
        cls: c,
        course: lk.course.get(c.courseId),
        faculty: lk.faculty.get(c.facultyId),
        lecturer: lk.lecturer.get(c.lecturerId),
        cw,
        status: cw ? cw.status : 'na',
        index: cw && !cw.hidden ? cw.metrics.IDX.mean : null,
        n: cw?.n ?? 0,
        planCount,
        needsPlan: cw?.status === 'alert' && planCount === 0,
      };
    });
  const rank = { alert: 3, warn: 2, ok: 1, na: 0 };
  items.sort((a, b) => rank[b.status] - rank[a.status] || (a.index ?? 9) - (b.index ?? 9));
  return { items, wave };
}

export function classDetail(user, classId, waveIdHint) {
  const { mart, cfg, dataset: ds } = state;
  const lk = lookups();
  const cls = lk.cls.get(classId);
  if (!cls) return { notFound: true };
  if (!canOpenClass(user, cls)) throw new AccessDenied('Bạn chỉ xem được lớp trong phạm vi phụ trách');
  const waves = visibleWaves(user).filter((w) => w.semesterId === cls.semesterId && mart.classWave.has(`${cls.id}|${w.id}`));
  const wave = waves.find((w) => w.id === waveIdHint) || waves[waves.length - 1] || null;
  const base = {
    cls,
    course: lk.course.get(cls.courseId),
    faculty: lk.faculty.get(cls.facultyId),
    lecturer: lk.lecturer.get(cls.lecturerId),
    semester: lk.semester.get(cls.semesterId),
    waves,
    wave,
  };
  if (!wave) return { ...base, noData: true };
  const cw = mart.classWave.get(`${cls.id}|${wave.id}`);
  const school = mart.byWave.get(wave.id).school.metrics;
  // đợt trước của cùng dòng lớp (có thể ở học kỳ trước)
  const series = mart.lineageSeries.get(cls.lineage) || [];
  const t = mart.waveIndex.get(wave.id);
  let prev = null;
  for (let k = t - 1; k >= 0; k--) {
    if (series[k] && canSeeWave(user, mart.waves[k])) {
      prev = series[k];
      break;
    }
  }
  const hidden = cw.hidden;
  const profile = DIMENSIONS.map((d) => {
    const m = cw.metrics[d].mean;
    const w = mart.weights[d];
    return {
      code: d,
      name: FACTOR_BY_CODE[d].short,
      fullName: FACTOR_BY_CODE[d].name,
      group: FACTOR_BY_CODE[d].group,
      mean: hidden ? null : m,
      n: cw.metrics[d].n,
      school: school[d].mean,
      prev: prev && !prev.hidden ? prev.metrics[d].mean : null,
      delta: !hidden && prev && !prev.hidden && isNum(m) ? m - prev.metrics[d].mean : null,
      z: cw.z[d],
      status: hidden ? 'na' : statusOfMean(m),
      gap: isNum(m) ? Math.max(0, cfg.target - m) * w : null,
    };
  });
  profile.sort((a, b) => (b.gap ?? -1) - (a.gap ?? -1) || (a.mean ?? 9) - (b.mean ?? 9));

  const respRows = ds.responses.filter((r) => r.classId === cls.id && r.waveId === wave.id);
  const validIds = new Set(mart.validRows.filter((r) => r.classId === cls.id && r.waveId === wave.id).map((r) => r.id));
  const validResp = respRows.filter((r) => validIds.has(r.id));
  const lowest = hidden
    ? []
    : itemMeans(validResp)
        .filter((it) => isNum(it.mean) && FACTOR_BY_CODE[INDICATOR_BY_CODE[it.code].factor].dimension)
        .sort((a, b) => a.mean - b.mean)
        .slice(0, 5)
        .map((it) => ({ ...it, text: INDICATOR_BY_CODE[it.code].text, factor: INDICATOR_BY_CODE[it.code].factor }));

  const history = series
    .map((s, k) => (s && canSeeWave(user, mart.waves[k]) ? { waveId: s.waveId, label: waveLabel(mart.waves[k], { short: true }), mean: s.hidden ? null : s.metrics.IDX.mean, status: s.status, n: s.n } : null))
    .filter(Boolean)
    .filter((h) => mart.waveIndex.get(h.waveId) <= t);

  const comments = mart.comments.filter((c) => c.classId === cls.id && c.waveId === wave.id);
  const planList = lineagePlans(cls.lineage);
  return {
    ...base,
    cw,
    prev,
    prevWave: prev ? lk.wave.get(prev.waveId) : null,
    hidden,
    school,
    profile,
    outcomes: Object.fromEntries(OUTCOMES.map((o) => [o, hidden ? null : cw.metrics[o].mean])),
    lowest,
    history,
    themes: hidden ? { items: [], n: comments.length, hidden: true } : themesFor(comments),
    plans: planList,
    needsPlan: cw.status === 'alert' && !planList.some((p) => p.classId === cls.id && p.waveId === wave.id),
  };
}

// Kế hoạch của cả "dòng lớp" để thấy chu trình qua các đợt; kèm kết quả trước – sau tự động.
export function lineagePlans(lineage) {
  const { mart } = state;
  const lk = lookups();
  const series = mart.lineageSeries.get(lineage) || [];
  return planStore
    .all()
    .filter((p) => lk.cls.get(p.classId)?.lineage === lineage)
    .map((p) => {
      const t = mart.waveIndex.get(p.waveId);
      const before = series[t];
      let after = null;
      for (let k = t + 1; k < series.length; k++) {
        if (series[k]) {
          after = series[k];
          break;
        }
      }
      const b = before && !before.hidden ? before.metrics[p.dimension]?.mean : null;
      const a = after && !after.hidden ? after.metrics[p.dimension]?.mean : null;
      let verdict = 'pending';
      if (isNum(a) && isNum(b)) verdict = a - b > 0 ? (a >= state.cfg.yellowDim ? 'reached' : 'improved') : 'notImproved';
      return {
        ...p,
        before: b,
        after: a,
        afterWave: after ? lk.wave.get(after.waveId) : null,
        delta: isNum(a) && isNum(b) ? a - b : null,
        verdict,
        wave: lk.wave.get(p.waveId),
      };
    })
    .sort((x, y) => (mart.waveIndex.get(y.waveId) ?? 0) - (mart.waveIndex.get(x.waveId) ?? 0));
}

// ---- M3 – Sinh viên (chế độ mô phỏng) -------------------------------------------------

export function studentScopeClasses(user, semesterId) {
  const { mart, dataset: ds } = state;
  if (user.role === 'gv') return ds.classes.filter((c) => c.semesterId === semesterId && c.lecturerId === user.lecturerId);
  if (user.role === 'cvht') {
    const ids = new Set(mart.students.filter((s) => s.semesterId === semesterId && s.advisorId === user.advisorId).map((s) => s.classId));
    return ds.classes.filter((c) => ids.has(c.id));
  }
  return [];
}

export function students(user, { semesterId, classId }) {
  if (!canSee(user, 'M3')) throw new AccessDenied('Chỉ giảng viên phụ trách và cố vấn học tập được xem dữ liệu cấp sinh viên');
  const { mart, cfg } = state;
  const lk = lookups();
  let rows = mart.students.filter((s) => s.semesterId === semesterId && studentRowInScope(user, s, mart.classById));
  if (classId) {
    const cls = lk.cls.get(classId);
    if (!cls) return { rows: [], classes: [] };
    if (user.role === 'gv' && cls.lecturerId !== user.lecturerId) throw new AccessDenied('Bạn không phụ trách lớp này');
    rows = rows.filter((s) => s.classId === classId);
  }
  const contactMap = contacted.map();
  const out = rows.map((s) => ({
    ...s,
    cls: lk.cls.get(s.classId),
    contacted: contactMap[`${s.researchCode}|${s.classId}`] || null,
    suggestion: supportSuggestion(s, cfg),
  }));
  const rank = { alert: 3, warn: 2, ok: 1, na: 0 };
  out.sort((a, b) => rank[b.status] - rank[a.status] || (b.prob ?? -1) - (a.prob ?? -1));
  accessLog.add({
    userId: user.id,
    userName: user.name,
    role: user.roleLabel,
    action: 'Xem dữ liệu cấp sinh viên (M3)',
    target: classId ? lk.cls.get(classId)?.name : `Tất cả trong phạm vi – ${lk.semester.get(semesterId)?.label ?? semesterId}`,
    count: out.length,
  });
  const counts = { alert: 0, warn: 0, ok: 0, na: 0 };
  out.forEach((r) => counts[r.status]++);
  return { rows: out, counts, hasOutcome: out.some((r) => r.final !== null) };
}

export function supportSuggestion(s, cfg) {
  const lowEng = isNum(s.eng) && s.eng < cfg.stuEngYellow;
  const lowProc = isNum(s.process) && s.process < cfg.stuProcYellow;
  if (lowEng && lowProc) return 'Hẹn gặp trực tiếp, lập kế hoạch học tập cá nhân; phối hợp cố vấn học tập';
  if (lowProc) return 'Hướng dẫn ôn phần kiến thức còn hổng; nhắc hạn nộp bài, giới thiệu giờ giải đáp';
  if (lowEng) return 'Trao đổi riêng về mức độ tham gia; mời vào nhóm học tập, theo dõi hoạt động trên LMS';
  return 'Tiếp tục theo dõi định kỳ';
}

// Chất lượng mô hình nguy cơ trên toàn bộ dữ liệu đã có điểm học phần (kiểm định chéo 10 lần).
const modelCache = { version: -1, value: null };
export function modelSummary() {
  if (modelCache.version === state.version) return modelCache.value;
  const rows = state.mart.students.filter((s) => isNum(s.eng) && isNum(s.process) && s.low !== null);
  let value = null;
  if (rows.length >= 40 && rows.some((r) => r.low) && rows.some((r) => !r.low)) {
    const cv = crossValidate(rows.map((r) => [r.eng, r.process]), rows.map((r) => (r.low ? 1 : 0)), { k: 10, rng: createRng('model-summary') });
    value = { auc: cv.auc, n: rows.length };
  }
  modelCache.version = state.version;
  modelCache.value = value;
  return value;
}

// ---- M4 – Đối sánh liên trường ---------------------------------------------------------

export function benchmark(user) {
  if (!canSee(user, 'M4')) throw new AccessDenied();
  const p = state.dataset.params || {};
  const rows = FACTORS.map((f) => {
    const inv = p.invariance?.[f.code];
    const lat = p.latent?.[f.code];
    const comparable = Boolean(inv?.invariant && lat);
    let reading = 'Không đủ điều kiện so sánh';
    if (comparable) {
      if (lat.lo > 0) reading = 'TDU cao hơn có ý nghĩa thống kê';
      else if (lat.hi < 0) reading = 'TDU thấp hơn có ý nghĩa thống kê';
      else reading = 'Khác biệt không có ý nghĩa thống kê';
    }
    return {
      code: f.code,
      name: f.short,
      fullName: f.name,
      group: f.group,
      invariant: inv ? inv.invariant : null,
      level: inv?.level ?? 'Chưa có kết quả kiểm định',
      note: inv?.note ?? '',
      est: comparable ? lat.est : null,
      lo: comparable ? lat.lo : null,
      hi: comparable ? lat.hi : null,
      comparable,
      reading,
      reason: comparable ? '' : !inv ? 'Chưa có kết quả kiểm định bất biến' : !inv.invariant ? `${inv.level}${inv.note ? ` – ${inv.note}` : ''}` : 'Chưa có ước lượng chênh lệch',
    };
  });
  return { rows, name: p.benchmarkName || 'Trường đối sánh', source: p.source || '' };
}

// ---- Thông báo trong ứng dụng (mục 6.1) -------------------------------------------------

export function notifications(user) {
  const { mart, dataset: ds } = state;
  const waves = visibleWaves(user).filter((w) => w.status === 'published');
  const wave = waves[waves.length - 1];
  if (!wave) return [];
  const lk = lookups();
  const label = waveLabel(wave);
  const items = [];
  if (user.role === 'cvht' || user.role === 'gv') {
    const rows = mart.students.filter((s) => s.semesterId === wave.semesterId && studentRowInScope(user, s, mart.classById));
    const red = rows.filter((s) => s.status === 'alert').length;
    if (red) items.push({ id: `stu:${wave.id}:${user.id}`, level: 'alert', text: `${red} sinh viên trong phạm vi phụ trách ở mức 🔴 Can thiệp (mô phỏng)`, href: '#/sinh-vien', meta: label });
  }
  if (user.role === 'cvht') return items;
  const classes = ds.classes.filter((c) => c.semesterId === wave.semesterId && classInScope(user, c));
  for (const c of classes) {
    const cw = mart.classWave.get(`${c.id}|${wave.id}`);
    if (!cw || (cw.status !== 'alert' && cw.status !== 'warn')) continue;
    if (user.role === 'bgh' && cw.status !== 'alert') continue;
    const reason = cw.reasons[0]?.text ?? '';
    const plansHere = planStore.all().filter((p) => p.classId === c.id && p.waveId === wave.id).length;
    items.push({
      id: `cls:${wave.id}:${c.id}:${cw.status}`,
      level: cw.status,
      text: cw.status === 'alert'
        ? `${c.name}: 🔴 Can thiệp${plansHere ? '' : ' – cần lập kế hoạch cải tiến'}`
        : `${c.name}: 🟡 Theo dõi`,
      detail: reason,
      href: canOpenClass(user, c) ? `#/lop/${encodeURIComponent(c.id)}?dot=${wave.dot}` : null,
      meta: `${lk.faculty.get(c.facultyId)?.short ?? ''} · ${label}`,
    });
  }
  const rank = { alert: 2, warn: 1 };
  items.sort((a, b) => rank[b.level] - rank[a.level]);
  return items.slice(0, 30);
}

export function metricName(code) {
  return code === 'IDX' ? 'Chỉ số chất lượng' : `${code} ${METRICS[code]?.short ?? ''}`;
}

