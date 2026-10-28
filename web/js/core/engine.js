// Bộ tính toán theo lô (mục 4.7 – "tinh_dot"): chấm điểm phiếu → tổng hợp lớp, khoa, Trường
// → giới hạn phễu, z → cảnh báo lớp, sinh viên → mô hình logistic → bảng "mart" cho giao diện.
import { classAlert, studentAlert } from './alerts.js';
import { DIMENSIONS, METRIC_CODES, OUTCOMES } from './constants.js';
import { funnelParams, zScore } from './funnel.js';
import { fitLogistic, predictProba } from './logistic.js';
import { redact } from './redact.js';
import { scoreResponse } from './scoring.js';
import { isNum, summarize } from './stats.js';

const FUNNEL_METRICS = ['IDX', ...DIMENSIONS, ...OUTCOMES, 'ENG'];

export function aggregateRows(rows, metrics = METRIC_CODES) {
  const out = {};
  for (const m of metrics) out[m] = summarize(rows.map((r) => r[m]));
  return out;
}

export function getWeights(ds, cfg) {
  if (cfg.weightsSource === 'nd2' && ds.params?.weights) {
    const w = { ...ds.params.weights };
    const total = DIMENSIONS.reduce((s, d) => s + (isNum(w[d]) ? w[d] : 0), 0);
    if (total > 0 && DIMENSIONS.every((d) => isNum(w[d]))) {
      for (const d of DIMENSIONS) w[d] /= total;
      return w;
    }
  }
  return Object.fromEntries(DIMENSIONS.map((d) => [d, 1 / DIMENSIONS.length]));
}

export function computeMart(ds, cfg, { classify } = {}) {
  const started = Date.now();
  const waves = [...ds.waves].sort((a, b) => a.order - b.order);
  const waveIndex = new Map(waves.map((w, i) => [w.id, i]));
  const classById = new Map(ds.classes.map((c) => [c.id, c]));
  const studentByCode = new Map(ds.students.map((s) => [s.code, s]));

  // 1) Chấm điểm từng phiếu.
  const rows = [];
  for (const r of ds.responses) {
    const cls = classById.get(r.classId);
    if (!cls) continue;
    const s = scoreResponse(r, cfg);
    rows.push({
      id: r.id,
      classId: r.classId,
      waveId: r.waveId,
      facultyId: cls.facultyId,
      courseId: cls.courseId,
      lineage: cls.lineage,
      researchCode: r.researchCode,
      time: r.time,
      ...s,
    });
  }
  const validRows = rows.filter((r) => r.valid);

  // 2) Tổng hợp theo đợt.
  const byWave = new Map();
  const classWave = new Map();
  const rowsByClassWave = new Map();
  for (const r of rows) {
    const key = `${r.classId}|${r.waveId}`;
    if (!rowsByClassWave.has(key)) rowsByClassWave.set(key, []);
    rowsByClassWave.get(key).push(r);
  }

  for (const wave of waves) {
    const wRows = validRows.filter((r) => r.waveId === wave.id);
    const funnel = {};
    for (const m of FUNNEL_METRICS) funnel[m] = funnelParams(wRows.map((r) => r[m]));
    const facultyAgg = new Map();
    for (const f of ds.faculties) {
      const fr = wRows.filter((r) => r.facultyId === f.id);
      facultyAgg.set(f.id, { metrics: aggregateRows(fr), n: fr.length });
    }
    const waveClasses = ds.classes.filter((c) => c.semesterId === wave.semesterId);
    const classIds = [];
    for (const cls of waveClasses) {
      const all = rowsByClassWave.get(`${cls.id}|${wave.id}`) || [];
      if (!all.length) continue;
      const valid = all.filter((r) => r.valid);
      const metrics = aggregateRows(valid);
      const z = {};
      for (const m of FUNNEL_METRICS) {
        z[m] = zScore(metrics[m].mean, metrics[m].n, funnel[m].mu, funnel[m].sigma);
      }
      classWave.set(`${cls.id}|${wave.id}`, {
        classId: cls.id,
        waveId: wave.id,
        n: valid.length,
        nTotal: all.length,
        size: cls.size,
        metrics,
        z,
        hidden: valid.length < cfg.nMin,
      });
      classIds.push(cls.id);
    }
    byWave.set(wave.id, {
      wave,
      funnel,
      school: { metrics: aggregateRows(wRows), n: wRows.length, nTotal: rows.filter((r) => r.waveId === wave.id).length },
      faculty: facultyAgg,
      classIds,
    });
  }

  // 3) Chuỗi theo "dòng lớp" để xét quy tắc giảm liên tiếp, so sánh với đợt trước.
  const lineageSeries = new Map();
  for (const cw of classWave.values()) {
    const cls = classById.get(cw.classId);
    if (!lineageSeries.has(cls.lineage)) lineageSeries.set(cls.lineage, new Array(waves.length).fill(null));
    lineageSeries.get(cls.lineage)[waveIndex.get(cw.waveId)] = cw;
  }

  // 4) Cảnh báo cấp lớp.
  const declineMetric = cfg.declineMetric || 'IDX';
  for (const cw of classWave.values()) {
    const cls = classById.get(cw.classId);
    const series = lineageSeries.get(cls.lineage);
    const t = waveIndex.get(cw.waveId);
    const history = [];
    for (let k = Math.max(0, t - cfg.declineWaves + 1); k <= t; k++) {
      const item = series[k];
      history.push(item && !item.hidden ? item.metrics[declineMetric].mean : null);
    }
    const means = Object.fromEntries(Object.entries(cw.metrics).map(([k, v]) => [k, v.mean]));
    const res = classAlert({ n: cw.n, means, z: cw.z, history }, cfg);
    cw.status = res.status;
    cw.reasons = res.reasons;
    // đợt trước của cùng dòng lớp
    let prev = null;
    for (let k = t - 1; k >= 0; k--) {
      if (series[k]) {
        prev = series[k];
        break;
      }
    }
    cw.prevWaveId = prev ? prev.waveId : null;
  }

  // 5) Ý kiến tự do: xóa thông tin nhận diện → phân loại (chạy theo lô sau mỗi đợt).
  const respById = new Map(ds.responses.map((r) => [r.id, r]));
  const comments = [];
  for (const r of validRows) {
    const raw = respById.get(r.id)?.comment;
    if (!raw || !raw.trim()) continue;
    const red = redact(raw);
    const label = classify ? classify(red.text) : null;
    comments.push({
      id: r.id,
      classId: r.classId,
      waveId: r.waveId,
      facultyId: r.facultyId,
      courseId: r.courseId,
      text: red.text,
      pii: red.found,
      ...(label || {}),
    });
  }

  // 6) Dữ liệu cấp sinh viên (chỉ sinh viên đồng ý liên kết điểm) và cảnh báo sinh viên.
  const gradeKey = (code, classId) => `${code}|${classId}`;
  const gradeMap = new Map(ds.grades.map((g) => [gradeKey(g.researchCode, g.classId), g]));
  const consented = new Set(ds.responses.filter((r) => r.consent).map((r) => r.researchCode));
  const engByStudentClass = new Map();
  for (const r of validRows) {
    if (!isNum(r.ENG)) continue;
    const key = gradeKey(r.researchCode, r.classId);
    const prev = engByStudentClass.get(key);
    if (!prev || waveIndex.get(r.waveId) > waveIndex.get(prev.waveId)) engByStudentClass.set(key, { eng: r.ENG, waveId: r.waveId });
  }
  const students = [];
  for (const g of ds.grades) {
    const cls = classById.get(g.classId);
    if (!cls) continue;
    if (consented.size && !consented.has(g.researchCode)) continue;
    const e = engByStudentClass.get(gradeKey(g.researchCode, g.classId));
    const stu = studentByCode.get(g.researchCode);
    const row = {
      researchCode: g.researchCode,
      classId: g.classId,
      semesterId: cls.semesterId,
      facultyId: cls.facultyId,
      advisorId: stu?.advisorId ?? null,
      homeroom: stu?.homeroom ?? '',
      eng: e?.eng ?? null,
      engWaveId: e?.waveId ?? null,
      process: isNum(g.process) ? g.process : null,
      final: isNum(g.final) ? g.final : null,
      gpa0: isNum(g.gpa0) ? g.gpa0 : null,
    };
    row.low = isNum(row.final) ? row.final < cfg.lowOutcome : null;
    const a = studentAlert({ eng: row.eng, process: row.process }, cfg);
    row.status = a.status;
    row.reasons = a.reasons;
    students.push(row);
  }

  // Mô hình logistic: học kỳ đã có điểm học phần → huấn luyện trên các học kỳ khác (tránh rò rỉ);
  // học kỳ hiện tại → huấn luyện trên toàn bộ dữ liệu đã có kết quả.
  const labeled = students.filter((s) => isNum(s.eng) && isNum(s.process) && s.low !== null);
  const models = new Map();
  const semesterIds = [...new Set(students.map((s) => s.semesterId))];
  for (const sem of semesterIds) {
    const train = labeled.filter((s) => s.semesterId !== sem);
    if (train.length >= 30 && train.some((s) => s.low) && train.some((s) => !s.low)) {
      models.set(sem, fitLogistic(train.map((s) => [s.eng, s.process]), train.map((s) => (s.low ? 1 : 0))));
    }
  }
  for (const s of students) {
    const model = models.get(s.semesterId);
    s.prob = model && isNum(s.eng) && isNum(s.process) ? predictProba(model, [s.eng, s.process]) : null;
  }
  const fullModel =
    labeled.length >= 30
      ? fitLogistic(labeled.map((s) => [s.eng, s.process]), labeled.map((s) => (s.low ? 1 : 0)))
      : null;

  return {
    cfg,
    builtAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    waves,
    waveIndex,
    classById,
    rows,
    validRows,
    byWave,
    classWave,
    lineageSeries,
    comments,
    students,
    model: fullModel,
    weights: getWeights(ds, cfg),
  };
}
