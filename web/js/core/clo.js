// Bộ tính toán đánh giá theo chuẩn đầu ra học phần (CLO) – mô-đun M6.
// Thuần JavaScript, không phụ thuộc giao diện; kiểm thử bằng Node (tests/clo.test.mjs).
//
// Cách tính (đề xuất MVP, chốt ở công việc 3.1):
//  - Mỗi câu/tiêu chí i của bài đánh giá a đóng góp gᵢ = Wₐ × maxᵢ / Σmaxₐ vào điểm học phần.
//  - Điểm CLO c của sinh viên (thang 10) = 10 × Σ gᵢ·wᵢc·(điểmᵢ/maxᵢ) / Σ gᵢ·wᵢc, chỉ trên các câu đã có điểm.
//  - Độ bao phủ minh chứng = Σ gᵢ·wᵢc (câu đã có điểm) / Σ gᵢ·wᵢc (mọi câu của các bài ĐÃ tổ chức).
//  - Trạng thái: chưa đánh giá (chưa tổ chức bài nào đo CLO) · chưa đủ minh chứng (bao phủ < ngưỡng)
//    · đạt (điểm ≥ ngưỡng đạt) · chưa đạt. Vắng thi, không nộp bài = "chưa có minh chứng", không tính là 0.
//  - Đánh giá lại (lần 2, đề tương đương): chế độ "latest" lấy điểm lần gần nhất của từng câu.
import { isNum, mean, quantile, sd } from './stats.js';

export const CLO_STATUS = {
  achieved: { code: 'achieved', label: 'Đạt', icon: '✔', chip: 'ok' },
  not_achieved: { code: 'not_achieved', label: 'Chưa đạt', icon: '✖', chip: 'alert' },
  insufficient: { code: 'insufficient', label: 'Chưa đủ minh chứng', icon: '–', chip: 'na' },
  not_assessed: { code: 'not_assessed', label: 'Chưa đánh giá', icon: '○', chip: 'neutral' },
};

// Quy tắc mặc định khi bộ quy tắc của học phần không ghi (đề xuất MVP).
export const CLO_RULE_DEFAULTS = Object.freeze({
  pass: 5.0, // điểm CLO tối thiểu (thang 10) để "đạt"
  target: 0.7, // mục tiêu: tỷ lệ sinh viên đạt CLO của lớp
  minEvidence: 0.6, // tỷ lệ minh chứng (theo trọng số) tối thiểu để kết luận đạt/chưa đạt
  retake: 'latest', // đánh giá lại: lấy kết quả lần gần nhất của từng câu/tiêu chí
  missing: 'no_evidence', // bài không nộp, vắng thi: "chưa có minh chứng" (không tính là 0)
  attendanceMin: 0.7, // thời gian có mặt tối thiểu để dự thi
  coursePass: 4.0, // điểm học phần đạt (mức D)
});

export const SUB_STATE = {
  graded: 'Đã chấm',
  pending: 'Đã nộp, chưa chấm',
  absent: 'Vắng thi / không nộp',
  banned: 'Không đủ điều kiện dự thi',
  missing: 'Chưa có dữ liệu',
  not_held: 'Chưa tổ chức',
};

const EPS = 1e-9;
const r1 = (v) => (isNum(v) ? Math.round(v * 10 + EPS) / 10 : null);
const r2 = (v) => (isNum(v) ? Math.round(v * 100 + EPS) / 100 : null);

// Học kỳ 'HK1-2526' → 251 (năm học bắt đầu × 10 + kỳ) để so thứ tự hiệu lực.
export function semKey(id) {
  const m = String(id || '').match(/^HK([123])-(\d{2})(\d{2})$/);
  return m ? Number(m[2]) * 10 + Number(m[1]) : 0;
}

// Trọng số gán CLO của một câu, chuẩn hóa tổng = 1.
export function itemWeights(clos) {
  const entries = Object.entries(clos || {}).filter(([, w]) => isNum(w) && w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  return total > 0 ? Object.fromEntries(entries.map(([c, w]) => [c, w / total])) : {};
}

// ---- Bộ quy tắc (phiên bản đề cương) -----------------------------------------------------------

export function resolveVersion(v) {
  const cloCodes = v.clos.map((c) => c.code);
  const items = [];
  const aMax = {};
  const aByCode = new Map();
  const actualByAssessment = {};
  for (const a of v.assessments) {
    aByCode.set(a.code, a);
    const max = a.items.reduce((s, it) => s + (it.max || 0), 0);
    aMax[a.code] = max;
    actualByAssessment[a.code] = Object.fromEntries(cloCodes.map((c) => [c, 0]));
    for (const it of a.items) {
      const w = itemWeights(it.clos);
      const g = max > 0 ? (a.weight * it.max) / max : 0;
      const item = { ...it, key: `${a.code}:${it.code}`, assessment: a.code, aRef: a.ref, aName: a.name, mode: a.mode, g, w };
      items.push(item);
      for (const [c, wc] of Object.entries(w)) if (c in actualByAssessment[a.code]) actualByAssessment[a.code][c] += g * wc;
    }
  }
  const planned = Object.fromEntries(v.clos.map((c) => [c.code, c.weight ?? 0]));
  const actual = Object.fromEntries(cloCodes.map((c) => [c, items.reduce((s, it) => s + it.g * (it.w[c] || 0), 0)]));
  const declared = Object.fromEntries(cloCodes.map((c) => [c, v.assessments.reduce((s, a) => s + (a.declared?.[c] || 0), 0)]));
  const measuredBy = Object.fromEntries(cloCodes.map((c) => [c, [...new Set(items.filter((it) => it.w[c]).map((it) => it.assessment))]]));
  return {
    ...v,
    rules: { ...CLO_RULE_DEFAULTS, ...(v.rules || {}) },
    cloCodes,
    cloByCode: new Map(v.clos.map((c) => [c.code, c])),
    items,
    itemByKey: new Map(items.map((it) => [it.key, it])),
    aByCode,
    aMax,
    planned,
    declared,
    actual,
    actualByAssessment,
    measuredBy,
    unmapped: items.filter((it) => !Object.keys(it.w).length),
  };
}

// Bộ quy tắc đã phê duyệt có hiệu lực cho lớp (cùng học phần, hiệu lực từ học kỳ ≤ học kỳ của lớp).
export function versionForClass(versions, cls) {
  const k = semKey(cls.semesterId);
  return versions
    .filter((v) => v.courseId === cls.courseId && v.status === 'approved' && semKey(v.effectiveFrom) <= k)
    .sort((a, b) => semKey(b.effectiveFrom) - semKey(a.effectiveFrom) || String(b.approvedAt || '').localeCompare(String(a.approvedAt || '')))[0] || null;
}

// ---- Kiểm tra ma trận đánh giá (nghiệp vụ 2) ----------------------------------------------------

const pct = (v) => `${(Math.round(v * 1000) / 10).toLocaleString('vi-VN')}%`;

export function checkMatrix(rv, { weightTol = 0.05, splitTol = 0.02 } = {}) {
  const out = [];
  const add = (level, code, title, detail = '', extra = {}) => out.push({ level, code, title, detail, ...extra });
  const sumA = rv.assessments.reduce((s, a) => s + (a.weight || 0), 0);
  const sumC = rv.clos.reduce((s, c) => s + (c.weight || 0), 0);
  if (Math.abs(sumA - 1) > 0.001) add('error', 'weights-assessment', `Tổng trọng số các bài đánh giá là ${pct(sumA)}, phải bằng 100%`);
  if (Math.abs(sumC - 1) > 0.001) add('error', 'weights-clo', `Tổng trọng số CLO là ${pct(sumC)}, phải bằng 100%`);
  if (Math.abs(sumA - 1) <= 0.001 && Math.abs(sumC - 1) <= 0.001) add('ok', 'weights-sum', 'Tổng trọng số bài đánh giá và tổng trọng số CLO đều bằng 100%');
  if (!rv.unmapped.length) add('ok', 'unmapped', 'Mọi câu hỏi, tiêu chí đều đã gắn CLO');
  else {
    const share = rv.unmapped.reduce((s, it) => s + it.g, 0);
    add('error', 'unmapped', `${rv.unmapped.length} câu/tiêu chí chưa gắn CLO – ${pct(share)} điểm học phần không làm minh chứng cho CLO nào`, rv.unmapped.map((it) => `${it.aName} › ${it.code} ${it.label}`).join('; '), { items: rv.unmapped.map((it) => it.key) });
  }
  const unmeasured = rv.cloCodes.filter((c) => rv.actual[c] <= EPS);
  if (!unmeasured.length) add('ok', 'unmeasured', `Cả ${rv.cloCodes.length} CLO đều có câu hỏi/tiêu chí đo`);
  for (const c of unmeasured) add('error', 'unmeasured', `${c} chưa được đo – không có câu hỏi hay tiêu chí nào gắn ${c}`, rv.cloByCode.get(c)?.text ?? '', { clo: c });
  for (const c of rv.cloCodes) {
    if (rv.actual[c] <= EPS) continue;
    const by = rv.measuredBy[c];
    if (by.length === 1) {
      const a = rv.aByCode.get(by[0]);
      add(a.group === 'A2' ? 'warn' : 'info', 'single-source', `${c} chỉ được đo bằng 1 bài đánh giá (${a.name})`, a.group === 'A2' ? 'Không có minh chứng trong quá trình để phát hiện sớm và hỗ trợ trước khi thi.' : 'Kết luận về CLO phụ thuộc vào một lần đánh giá.', { clo: c });
    }
  }
  // Trọng số CLO trong đề cương (Bảng 2) – phân bổ khai báo theo bài (Bảng 4) – thực tế theo câu/tiêu chí.
  for (const c of rv.cloCodes) {
    const p = rv.planned[c];
    const a = rv.actual[c];
    const d = a - p;
    const decl = rv.declared[c];
    const declOff = Math.abs(decl - p) > weightTol + EPS;
    if (Math.abs(d) > 2 * weightTol + EPS) add('error', 'weight-mismatch', `${c}: trọng số trong đề cương ${pct(p)}, nhưng câu hỏi/tiêu chí đo ${c} chỉ chiếm ${pct(a)} điểm học phần (lệch ${d > 0 ? '+' : '−'}${pct(Math.abs(d))})`, declOff ? `Bảng phân bổ theo bài đánh giá ghi ${pct(decl)}.` : '', { clo: c, planned: p, actual: a, declared: decl });
    else if (Math.abs(d) > weightTol + EPS) add('warn', 'weight-mismatch', `${c}: trọng số trong đề cương ${pct(p)}, thực tế ${pct(a)} (lệch ${d > 0 ? '+' : '−'}${pct(Math.abs(d))})`, declOff ? `Bảng phân bổ theo bài đánh giá ghi ${pct(decl)}.` : '', { clo: c, planned: p, actual: a, declared: decl });
    else if (declOff) add('warn', 'declared-mismatch', `${c}: bảng phân bổ theo bài đánh giá ghi ${pct(decl)}, khác trọng số CLO ${pct(p)}`, `Theo câu hỏi/tiêu chí thực tế: ${pct(a)}.`, { clo: c, planned: p, actual: a, declared: decl });
  }
  if (rv.cloCodes.every((c) => Math.abs(rv.actual[c] - rv.planned[c]) <= weightTol + EPS && Math.abs(rv.declared[c] - rv.planned[c]) <= weightTol + EPS)) {
    add('ok', 'weight-mismatch', `Phân bổ điểm khớp trọng số CLO (sai lệch ≤ ${pct(weightTol)})`);
  }
  // Phân bổ CLO khai báo của từng bài đánh giá so với câu hỏi/tiêu chí của bài.
  for (const a of rv.assessments) {
    if (!a.declared) continue;
    const diffs = rv.cloCodes
      .map((c) => ({ c, decl: a.declared[c] || 0, act: rv.actualByAssessment[a.code][c] || 0 }))
      .filter((x) => Math.abs(x.decl - x.act) > splitTol + EPS);
    if (diffs.length) {
      add('warn', 'split-mismatch', `${a.name}: phân bổ CLO khai báo khác cấu trúc câu hỏi/tiêu chí`, diffs.map((x) => `${x.c} khai báo ${pct(x.decl)}, thực tế ${pct(x.act)}`).join(' · '), { assessment: a.code });
    }
  }
  // Mức năng lực cao chỉ đo bằng trắc nghiệm.
  for (const c of rv.clos) {
    const its = rv.items.filter((it) => it.w[c.code]);
    if (c.domain === 'kien_thuc' && c.level >= 4 && its.length && its.every((it) => it.mcq)) {
      add('warn', 'level-format', `${c.code} yêu cầu mức ${c.level}/6 nhưng chỉ đo bằng trắc nghiệm`, 'Trắc nghiệm khó đo mức phân tích trở lên; cân nhắc câu tự luận hoặc tình huống.', { clo: c.code });
    }
    if (!c.plo && !c.pi) add('warn', 'no-plo', `${c.code} chưa liên kết PLO/PI của chương trình đào tạo`, '', { clo: c.code });
  }
  if (rv.status !== 'approved') add('warn', 'not-approved', 'Bộ quy tắc chưa được phê duyệt – chưa dùng để tính kết quả của lớp', rv.note || '');
  const rank = { error: 0, warn: 1, info: 2, ok: 3 };
  out.sort((a, b) => rank[a.level] - rank[b.level]);
  return { items: out, errors: out.filter((x) => x.level === 'error').length, warnings: out.filter((x) => x.level === 'warn').length };
}

// ---- Điểm bài, điểm CLO của sinh viên trong một lớp (nghiệp vụ 4) ----------------------------------

function assessmentScore10(sub, a, aMax) {
  if (!sub || sub.st !== 'graded') return null;
  let s = 0;
  for (const it of a.items) s += isNum(sub.pts?.[it.code]) ? sub.pts[it.code] : 0;
  return aMax > 0 ? (10 * s) / aMax : null;
}

// mode: 'initial' (chỉ lần 1) | 'latest' (lần gần nhất của từng câu). Trả về kết quả từng sinh viên và tổng hợp lớp.
export function classResult({ rv, roster, subs, mode = 'latest', rules: rulesIn, nearBand = 0.5 }) {
  const rules = { ...rv.rules, ...(rulesIn || {}) };
  const held = new Set(subs.filter((x) => x.t === 1).map((x) => x.a));
  const byStu = new Map();
  for (const x of subs) {
    if (!byStu.has(x.s)) byStu.set(x.s, {});
    (byStu.get(x.s)[x.a] ||= []).push(x);
  }
  const heldItems = rv.items.filter((it) => held.has(it.assessment));
  const gHeld = Object.fromEntries(rv.cloCodes.map((c) => [c, heldItems.reduce((s, it) => s + it.g * (it.w[c] || 0), 0)]));
  const heldShare = Object.fromEntries(rv.cloCodes.map((c) => [c, rv.actual[c] > EPS ? gHeld[c] / rv.actual[c] : 0]));
  const complete = rv.assessments.every((a) => held.has(a.code));
  const students = [];
  const withdrawn = [];
  for (const r of roster) {
    if (r.st === 'withdrawn') {
      withdrawn.push(r.s);
      continue;
    }
    const per = byStu.get(r.s) || {};
    const aState = {};
    const values = {};
    const aScore = {};
    const retaken = {};
    const first = {};
    for (const a of rv.assessments) {
      const list = (per[a.code] || []).filter((x) => (mode === 'initial' ? x.t === 1 : true)).sort((x, y) => x.t - y.t);
      if (!held.has(a.code)) {
        aState[a.code] = 'not_held';
        for (const it of a.items) values[`${a.code}:${it.code}`] = null;
        continue;
      }
      const f = list.find((x) => x.t === 1);
      first[a.code] = f || null;
      aState[a.code] = f ? f.st : 'missing';
      let last = null;
      for (const it of a.items) {
        let v = null;
        for (const x of list) {
          if (x.st !== 'graded') continue;
          if (isNum(x.pts?.[it.code])) v = x.pts[it.code];
        }
        values[`${a.code}:${it.code}`] = v;
      }
      for (const x of list) if (x.st === 'graded') last = x;
      retaken[a.code] = list.some((x) => x.t > 1 && x.st === 'graded');
      if (last && last.t > 1 && aState[a.code] !== 'graded') aState[a.code] = 'graded';
      aScore[a.code] = last ? assessmentScore10(last, a, rv.aMax[a.code]) : null;
    }
    const clo = {};
    for (const c of rv.cloCodes) {
      let E = 0;
      let P = 0;
      for (const it of heldItems) {
        const w = it.w[c];
        if (!w) continue;
        let v = values[it.key];
        if (!isNum(v) && rules.missing === 'zero' && ['absent', 'missing', 'banned'].includes(aState[it.assessment])) v = 0;
        if (!isNum(v)) continue;
        E += it.g * w;
        P += it.g * w * (v / it.max);
      }
      const cov = gHeld[c] > EPS ? E / gHeld[c] : null;
      const score = E > EPS ? r2((10 * P) / E) : null;
      const pass = passOf(rv, c, rules);
      let status;
      if (gHeld[c] <= EPS) status = 'not_assessed';
      else if (cov < rules.minEvidence - EPS) status = 'insufficient';
      else status = score >= pass - EPS ? 'achieved' : 'not_achieved';
      clo[c] = { score, cov, status, near: isNum(score) && status !== 'insufficient' && Math.abs(score - pass) < nearBand - EPS };
    }
    // Điểm quá trình (nhóm A1), điểm thi (A2) và điểm học phần theo trọng số đề cương.
    let wp = 0;
    let sp = 0;
    let pendingA1 = false;
    for (const a of rv.assessments.filter((x) => x.group === 'A1' && held.has(x.code))) {
      if (aState[a.code] === 'pending') {
        pendingA1 = true;
        continue;
      }
      wp += a.weight;
      sp += a.weight * (aScore[a.code] ?? 0);
    }
    const process = wp > 0 ? r1(sp / wp) : null;
    const finalA = rv.assessments.find((x) => x.group === 'A2');
    const exam = finalA && held.has(finalA.code) && aState[finalA.code] !== 'pending' ? r1(aScore[finalA.code] ?? 0) : null;
    let course = null;
    if (complete && !pendingA1 && exam !== null) {
      course = r1(rv.assessments.reduce((s, a) => s + a.weight * (a.group === 'A2' ? exam : aScore[a.code] ?? 0), 0));
    }
    const missingWork = rv.assessments.filter((a) => ['absent', 'missing'].includes(aState[a.code])).map((a) => a.code);
    const pendingWork = rv.assessments.filter((a) => aState[a.code] === 'pending').map((a) => a.code);
    const banned = rv.assessments.filter((a) => aState[a.code] === 'banned').map((a) => a.code);
    const assessed = rv.cloCodes.filter((c) => clo[c].status === 'achieved' || clo[c].status === 'not_achieved');
    students.push({
      code: r.s,
      att: r.att ?? null,
      aState,
      aScore,
      values,
      retaken,
      first,
      clo,
      process,
      exam,
      course,
      missingWork,
      pendingWork,
      banned,
      nNotAchieved: rv.cloCodes.filter((c) => clo[c].status === 'not_achieved').length,
      nInsufficient: rv.cloCodes.filter((c) => clo[c].status === 'insufficient').length,
      achievedAll: assessed.length > 0 && rv.cloCodes.every((c) => clo[c].status === 'achieved' || clo[c].status === 'not_assessed'),
    });
  }
  // Tổng hợp lớp theo CLO.
  const target = rules.target;
  const cloAgg = {};
  for (const c of rv.cloCodes) {
    const st = students.map((s) => s.clo[c]);
    const assessedScores = st.filter((x) => x.status === 'achieved' || x.status === 'not_achieved');
    const nAchieved = st.filter((x) => x.status === 'achieved').length;
    const n = assessedScores.length;
    const rate = n ? nAchieved / n : null;
    const scores = assessedScores.map((x) => x.score);
    cloAgg[c] = {
      code: c,
      nActive: students.length,
      n,
      nAchieved,
      nNot: n - nAchieved,
      nInsufficient: st.filter((x) => x.status === 'insufficient').length,
      nNear: st.filter((x) => x.near).length,
      notAssessed: gHeld[c] <= EPS,
      heldShare: heldShare[c],
      rate,
      mean: mean(scores),
      sd: sd(scores),
      median: quantile(scores, 0.5),
      status: rateStatus(rate, target, n),
    };
  }
  const assessedAny = students.filter((s) => rv.cloCodes.some((c) => ['achieved', 'not_achieved'].includes(s.clo[c].status)));
  const allOk = assessedAny.filter((s) => s.achievedAll).length;
  const aAgg = {};
  for (const a of rv.assessments) {
    const states = students.map((s) => s.aState[a.code]);
    const sc = students.map((s) => s.aScore[a.code]).filter(isNum);
    aAgg[a.code] = {
      code: a.code,
      held: held.has(a.code),
      graded: states.filter((x) => x === 'graded').length,
      pending: states.filter((x) => x === 'pending').length,
      absent: states.filter((x) => x === 'absent').length,
      banned: states.filter((x) => x === 'banned').length,
      missing: states.filter((x) => x === 'missing').length,
      retaken: students.filter((s) => s.retaken[a.code]).length,
      mean: mean(sc),
      dates: [...new Set(subs.filter((x) => x.a === a.code && x.d).map((x) => `${x.t}|${x.d}`))].sort(),
    };
  }
  const courseScores = students.map((s) => s.course).filter(isNum);
  return {
    mode,
    rules,
    held: [...held],
    complete,
    inProgress: !complete,
    students,
    withdrawn,
    nActive: students.length,
    clo: cloAgg,
    all: { n: assessedAny.length, nAchieved: allOk, rate: assessedAny.length ? allOk / assessedAny.length : null, status: rateStatus(assessedAny.length ? allOk / assessedAny.length : null, target, assessedAny.length) },
    assessments: aAgg,
    course: {
      n: courseScores.length,
      mean: mean(courseScores),
      pass: courseScores.filter((x) => x >= (rules.coursePass ?? 4) - EPS).length,
    },
  };
}

// Ngưỡng đạt của CLO: ghi riêng cho CLO (nếu có) hoặc ngưỡng chung của bộ quy tắc.
export function passOf(rv, code, rules = rv.rules) {
  const c = rv.cloByCode?.get(code);
  return isNum(c?.pass) ? c.pass : rules.pass;
}

export function rateStatus(rate, target, n, { minN = 5, band = 0.1 } = {}) {
  if (!isNum(rate) || n < minN) return 'na';
  if (rate >= target - EPS) return 'ok';
  if (rate >= target - band - EPS) return 'warn';
  return 'alert';
}

// Phễu minh chứng: thuộc diện đánh giá → đã nộp → đã chấm → đủ minh chứng → đạt (CLO c hoặc tất cả).
export function evidenceFunnel(res, rv, clo = '') {
  const codes = clo ? [clo] : rv.cloCodes.filter((c) => !res.clo[c].notAssessed);
  const measuring = new Set(rv.items.filter((it) => codes.some((c) => it.w[c])).map((it) => it.assessment));
  const relevant = rv.assessments.filter((a) => measuring.has(a.code) && res.held.includes(a.code)).map((a) => a.code);
  const s1 = res.students;
  const s2 = s1.filter((s) => relevant.some((a) => ['graded', 'pending'].includes(s.aState[a])));
  const s3 = s2.filter((s) => relevant.some((a) => s.aState[a] === 'graded'));
  const s4 = s3.filter((s) => codes.every((c) => s.clo[c].status === 'achieved' || s.clo[c].status === 'not_achieved'));
  const s5 = s4.filter((s) => codes.every((c) => s.clo[c].status === 'achieved'));
  const stages = [
    { key: 'roster', label: 'Thuộc diện đánh giá', n: s1.length, note: res.withdrawn.length ? `${res.withdrawn.length} sinh viên rút học phần không tính` : '' },
    { key: 'submitted', label: 'Đã nộp bài / dự thi', n: s2.length, lost: s1.length - s2.length, lostLabel: 'vắng, không nộp hoặc không đủ điều kiện dự thi' },
    { key: 'graded', label: 'Đã chấm', n: s3.length, lost: s2.length - s3.length, lostLabel: 'đã nộp nhưng chưa chấm' },
    { key: 'evidence', label: 'Đủ minh chứng', n: s4.length, lost: s3.length - s4.length, lostLabel: 'chưa đủ minh chứng' },
    { key: 'achieved', label: clo ? `Đạt ${clo}` : 'Đạt tất cả CLO đã đánh giá', n: s5.length, lost: s4.length - s5.length, lostLabel: 'chưa đạt' },
  ];
  return { clo, codes, assessments: relevant, stages };
}

// ---- Thống kê mô tả cho biểu đồ ---------------------------------------------------------------------

export function histogram(values, { min = 0, max = 10, step = 0.5, pass = 5, near = 0.5 } = {}) {
  const bins = [];
  const nb = Math.round((max - min) / step);
  for (let k = 0; k < nb; k++) {
    const x0 = min + k * step;
    const x1 = x0 + step;
    const count = values.filter((v) => isNum(v) && v >= x0 - EPS && (k === nb - 1 ? v <= x1 + EPS : v < x1 - EPS)).length;
    const status = x0 < pass - EPS ? (x0 >= pass - near - EPS ? 'warn' : 'alert') : 'ok';
    bins.push({ x0, x1, count, status });
  }
  return bins;
}

export function boxStats(values) {
  const xs = values.filter(isNum).sort((a, b) => a - b);
  if (!xs.length) return null;
  const q1 = quantile(xs, 0.25);
  const med = quantile(xs, 0.5);
  const q3 = quantile(xs, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const inside = xs.filter((v) => v >= lo - EPS && v <= hi + EPS);
  return {
    n: xs.length,
    min: xs[0],
    max: xs[xs.length - 1],
    q1,
    median: med,
    q3,
    whiskerLo: inside[0],
    whiskerHi: inside[inside.length - 1],
    outliers: xs.filter((v) => v < lo - EPS || v > hi + EPS),
    mean: mean(xs),
    sd: sd(xs),
  };
}

export function correlation(xs, ys) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => isNum(x) && isNum(y));
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

// Biểu đồ diễn biến (run chart): trung vị làm đường tâm; đánh dấu mốc cải tiến ở giao diện.
export function runChart(points) {
  const vals = points.map((p) => p.value).filter(isNum);
  return { points, median: vals.length ? quantile(vals, 0.5) : null };
}

// Biểu đồ p cho tỷ lệ chưa đạt qua các đợt tương đương: CL = p̄, giới hạn ±3σ theo cỡ nhóm từng đợt.
// Chỉ bật khi đủ chuỗi dữ liệu (minRounds) – đường mục tiêu không phải giới hạn kiểm soát.
export function pChart(points, { minRounds = 8 } = {}) {
  const ok = points.filter((p) => p.n > 0 && isNum(p.k));
  const N = ok.reduce((s, p) => s + p.n, 0);
  const K = ok.reduce((s, p) => s + p.k, 0);
  const pbar = N ? K / N : null;
  const enabled = ok.length >= minRounds;
  return {
    enabled,
    rounds: ok.length,
    minRounds,
    pbar,
    points: ok.map((p) => {
      const s = pbar !== null ? Math.sqrt((pbar * (1 - pbar)) / p.n) : null;
      const ucl = s !== null ? Math.min(1, pbar + 3 * s) : null;
      const lcl = s !== null ? Math.max(0, pbar - 3 * s) : null;
      const prop = p.k / p.n;
      return { ...p, p: prop, ucl, lcl, out: enabled && s !== null && (prop > ucl + EPS || prop < lcl - EPS) };
    }),
  };
}

// ---- Chẩn đoán: câu hỏi, tiêu chí, chương, dạng lỗi (nghiệp vụ 5) --------------------------------

function groups27(rows, scoreOf) {
  const sorted = [...rows].sort((a, b) => scoreOf(b) - scoreOf(a));
  const k = Math.max(1, Math.round(sorted.length * 0.27));
  return { top: sorted.slice(0, k), bottom: sorted.slice(-k) };
}

// Phân tích câu hỏi/tiêu chí (lần 1): độ khó p = điểm TB/điểm tối đa; độ phân biệt D = p(27% cao) − p(27% thấp);
// r = tương quan câu – phần còn lại của bài. Trắc nghiệm phân tích theo câu trong ngân hàng (theo mã đề).
export function itemAnalysis({ rv, subs, semesterId, outcomes, thresholds = {} }) {
  const th = { easy: 0.9, hard: 0.3, disc: 0.2, minN: 15, ...thresholds };
  const rows = [];
  const mcqRows = [];
  for (const a of rv.assessments) {
    if (a.itemAnalysis === false) continue;
    const graded = subs.filter((x) => x.a === a.code && x.t === 1 && x.st === 'graded');
    if (!graded.length) continue;
    const total = (x) => a.items.reduce((s, it) => s + (isNum(x.pts?.[it.code]) ? x.pts[it.code] : 0), 0);
    const { top, bottom } = groups27(graded, total);
    for (const it of a.items) {
      const vals = graded.map((x) => x.pts?.[it.code]).filter(isNum);
      if (!vals.length) continue;
      const p = mean(vals) / it.max;
      const pT = mean(top.map((x) => x.pts?.[it.code]).filter(isNum)) / it.max;
      const pB = mean(bottom.map((x) => x.pts?.[it.code]).filter(isNum)) / it.max;
      const D = isNum(pT) && isNum(pB) ? pT - pB : null;
      const rit = correlation(graded.map((x) => x.pts?.[it.code]), graded.map((x) => total(x) - (isNum(x.pts?.[it.code]) ? x.pts[it.code] : 0)));
      rows.push({
        key: `${a.code}:${it.code}`,
        assessment: a.code,
        aName: a.name,
        code: it.code,
        label: it.label,
        max: it.max,
        chapter: it.chapter,
        clos: Object.keys(itemWeights(it.clos)),
        n: vals.length,
        mean: mean(vals),
        p,
        D,
        rit,
        below: vals.filter((v) => v / it.max < 0.5 - EPS).length / vals.length,
        flags: itemFlags(p, D, vals.length, th),
        mcq: Boolean(it.mcq),
      });
      if (it.mcq && outcomes) {
        // Câu trắc nghiệm trong ngân hàng: gom theo mã đề.
        const byForm = new Map();
        for (const x of graded) {
          if (!x.opt) continue;
          if (!byForm.has(x.f)) byForm.set(x.f, []);
          byForm.get(x.f).push(x);
        }
        for (const [form, list] of byForm) {
          const ids = outcomes.forms?.[`${semesterId}|${a.code}|${form}`] || [];
          const g = groups27(list, total);
          ids.forEach((bankId, k) => {
            const q = outcomes.bank?.[bankId];
            if (!q) return;
            const chosen = list.map((x) => x.opt[k]);
            const n = chosen.length;
            const share = (arr, o) => (arr.length ? arr.filter((c) => c === o).length / arr.length : 0);
            const topC = g.top.map((x) => x.opt[k]);
            const botC = g.bottom.map((x) => x.opt[k]);
            const pq = share(chosen, q.key);
            const Dq = share(topC, q.key) - share(botC, q.key);
            const options = ['A', 'B', 'C', 'D'].map((o) => ({ o, share: share(chosen, o), top: share(topC, o), bottom: share(botC, o), key: o === q.key }));
            const flags = itemFlags(pq, Dq, n, th);
            const wrong = options.filter((x) => !x.key).sort((x, y) => y.share - x.share);
            if (wrong[0] && wrong[0].share >= 0.3 - EPS) flags.push({ code: 'distractor', label: `Phương án sai ${wrong[0].o} được chọn nhiều (${Math.round(wrong[0].share * 100)}%)` });
            if (wrong[0] && wrong[0].top > EPS && wrong[0].top >= share(topC, q.key) - EPS) flags.push({ code: 'key', label: `Nhóm điểm cao chọn ${wrong[0].o} nhiều bằng hoặc hơn đáp án – kiểm tra đáp án` });
            const weak = options.filter((x) => !x.key && x.share < 0.05 - EPS);
            if (weak.length && n >= th.minN) flags.push({ code: 'weak-distractor', level: 'info', label: `Phương án nhiễu ít người chọn (< 5%): ${weak.map((x) => x.o).join(', ')}` });
            mcqRows.push({ bankId, form, position: k + 1, chapter: q.chapter, key: q.key, n, p: pq, D: Dq, options, flags });
          });
        }
      }
    }
  }
  return { rows, mcqRows, thresholds: th };
}

function itemFlags(p, D, n, th) {
  const f = [];
  if (n < th.minN) f.push({ code: 'small', level: 'info', label: `Ít dữ liệu (n = ${n})` });
  if (isNum(p) && p > th.easy + EPS) f.push({ code: 'easy', label: 'Quá dễ' });
  if (isNum(p) && p < th.hard - EPS) f.push({ code: 'hard', label: 'Quá khó' });
  if (isNum(D) && D < -EPS) f.push({ code: 'negative', label: 'Phân biệt âm' });
  else if (isNum(D) && D < th.disc - EPS) f.push({ code: 'low-disc', label: 'Phân biệt kém' });
  return f;
}

// Mức đạt theo chương: tỷ lệ điểm đạt được trên điểm tối đa của các câu thuộc chương.
export function chapterAnalysis(items, mcqRows, chapters) {
  return chapters.map((ch) => {
    const its = items.filter((it) => it.chapter === ch.code && !it.mcq);
    const mq = mcqRows.filter((q) => q.chapter === ch.code);
    const wSum = its.reduce((s, it) => s + it.max, 0) + mq.length * 0.25;
    const pSum = its.reduce((s, it) => s + it.max * it.p, 0) + mq.reduce((s, q) => s + 0.25 * q.p, 0);
    return { ...ch, items: its.length, mcq: mq.length, p: wSum > 0 ? pSum / wSum : null };
  });
}

// Pareto dạng lỗi: đơn vị đếm là "lượt lỗi"; kèm số sinh viên mắc (một sinh viên có thể mắc nhiều lỗi).
export function errorPareto({ rv, subs, errorTypes, clo = '', assessment = '', attempt = 1 }) {
  const okItem = (a, code) => {
    const it = rv.itemByKey.get(`${a}:${code}`);
    if (!it) return false;
    if (assessment && a !== assessment) return false;
    if (clo && !it.w[clo]) return false;
    return true;
  };
  const byCode = new Map();
  let total = 0;
  const studentsWithAny = new Set();
  for (const x of subs) {
    if (x.t !== attempt || x.st !== 'graded' || !x.err) continue;
    for (const [itemCode, code] of x.err) {
      if (!okItem(x.a, itemCode)) continue;
      if (!byCode.has(code)) byCode.set(code, { code, count: 0, students: new Set(), items: new Map() });
      const e = byCode.get(code);
      e.count++;
      e.students.add(x.s);
      e.items.set(`${x.a}:${itemCode}`, (e.items.get(`${x.a}:${itemCode}`) || 0) + 1);
      studentsWithAny.add(x.s);
      total++;
    }
  }
  const types = new Map((errorTypes || []).map((t) => [t.code, t]));
  const rows = [...byCode.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  let cum = 0;
  const out = rows.map((r) => {
    cum += r.count;
    const t = types.get(r.code);
    return {
      code: r.code,
      label: t?.label ?? r.code,
      group: t?.group ?? 'Khác',
      count: r.count,
      students: r.students.size,
      share: total ? r.count / total : 0,
      cumShare: total ? cum / total : 0,
      items: [...r.items.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, n })),
    };
  });
  const groups = new Map();
  for (const r of out) groups.set(r.group, (groups.get(r.group) || 0) + r.count);
  return { rows: out, total, students: studentsWithAny.size, groups: [...groups.entries()].map(([g, n]) => ({ group: g, count: n, share: total ? n / total : 0 })).sort((a, b) => b.count - a.count) };
}

// ---- Đối chiếu kết quả chấm giữa hai cán bộ chấm (nghiệp vụ 7) -------------------------------------

export function raterAnalysis({ rv, subs, tol = 0.5 }) {
  const items = rv.items.filter((it) => it.marked2);
  const rows = items.map((it) => {
    const pairs = subs.filter((x) => x.a === it.assessment && x.st === 'graded' && x.r1 && x.r2 && isNum(x.r1[it.code]) && isNum(x.r2[it.code]));
    const d = pairs.map((x) => x.r2[it.code] - x.r1[it.code]);
    const abs = d.map(Math.abs);
    return {
      key: it.key,
      code: it.code,
      label: it.label,
      max: it.max,
      n: pairs.length,
      meanDiff: mean(d),
      mae: mean(abs),
      exact: pairs.length ? abs.filter((v) => v < EPS).length / pairs.length : null,
      within: pairs.length ? abs.filter((v) => v <= 0.25 + EPS).length / pairs.length : null,
      over: pairs.length ? abs.filter((v) => v > tol + EPS).length / pairs.length : null,
      nOver: abs.filter((v) => v > tol + EPS).length,
      r: correlation(pairs.map((x) => x.r1[it.code]), pairs.map((x) => x.r2[it.code])),
      points: pairs.map((x) => ({ s: x.s, c: x.c, f: x.f, t: x.t, a: x.r1[it.code], b: x.r2[it.code], final: x.pts?.[it.code], m1: x.m1, m2: x.m2 })),
    };
  });
  const scripts = subs
    .filter((x) => x.r1 && x.r2 && x.st === 'graded')
    .map((x) => {
      const diffs = items.filter((it) => it.assessment === x.a && isNum(x.r1[it.code]) && isNum(x.r2[it.code])).map((it) => ({ code: it.code, d: x.r2[it.code] - x.r1[it.code] }));
      return { s: x.s, c: x.c, t: x.t, f: x.f, m1: x.m1, m2: x.m2, diffs, maxAbs: Math.max(0, ...diffs.map((v) => Math.abs(v.d))) };
    })
    .filter((x) => x.maxAbs > tol + EPS)
    .sort((a, b) => b.maxAbs - a.maxAbs);
  const nScripts = subs.filter((x) => x.r1 && x.r2 && x.st === 'graded').length;
  return { rows, scripts, nScripts, tol, overShare: nScripts ? scripts.length / nScripts : null };
}

// Chênh lệch lớn giữa điểm quá trình và điểm thi – trường hợp cần xem lại (không kết luận gian lận hay chấm sai).
export function gapCases(students, { gap = 3 } = {}) {
  return students
    .filter((s) => isNum(s.process) && isNum(s.exam) && Math.abs(s.exam - s.process) >= gap - EPS)
    .map((s) => ({ code: s.code, process: s.process, exam: s.exam, diff: s.exam - s.process }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}
