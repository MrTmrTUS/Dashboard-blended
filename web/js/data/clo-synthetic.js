// Dữ liệu điểm MÔ PHỎNG cho mô-đun đánh giá theo CLO (M6) – học phần Nguyên lý kế toán (ACP0371).
// Sinh viên, lớp, giảng viên dùng chung danh mục của dashboard BL (cùng mã nghiên cứu, cùng lớp học phần);
// năng lực và mức gắn kết của sinh viên lấy từ cùng "đặc điểm ẩn" của bộ sinh dữ liệu BL nên hai mô-đun nhất quán.
// Kịch bản để trình diễn (giữ ổn định bằng tests/clo.test.mjs):
//  - HK1 2025–2026: CLO3 dưới mục tiêu 70% ở cả hai lớp, lỗi định khoản chiếm phần lớn lượt lỗi; hai cán bộ
//    chấm lệch nhau ở câu 2a (định khoản) của lớp N02 → kế hoạch cải tiến cấp học phần.
//  - HK2 2025–2026: sau cải tiến, CLO3 vượt mục tiêu; độ lệch giữa người chấm giảm.
//  - HK1 2026–2027 (đang học, mới có bài kiểm tra): lớp N02 yếu tiêu chí "Hạch toán nghiệp vụ" → nhóm phụ đạo,
//    kiểm tra lại bằng đề tương đương (lần 2) ngày 13/11/2026.
//  - Ngân hàng trắc nghiệm có vài câu lỗi để thử rà soát đề: đáp án sai, quá dễ, phương án nhiễu mạnh, không phân biệt.
import { classResult, resolveVersion, versionForClass } from '../core/clo.js';
import { ASSESSMENT_CALENDAR, CLO_VERSIONS, ERROR_TYPES, PROGRAMS } from './clo-catalog.js';

export const CLO_COURSE = 'ACP0371';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const logistic = (x) => 1 / (1 + Math.exp(-x));
const q25 = (v) => Math.round(v * 4) / 4;

// Mức độ khó (thang ẩn) của từng câu/tiêu chí – hiệu chỉnh để điểm trung bình hợp lý.
const ITEM_B = {
  'KT:TC1': -0.75, 'KT:TC2': -0.5,
  'TH:TC1': -0.55, 'TH:TC2': -0.3, 'TH:TC3': -0.35, 'TH:TC4': -0.55,
  'CK:TL1': -0.35, 'CK:TL2a': -0.1, 'CK:TL2b': -0.2,
};

// Hiệu ứng theo học kỳ (chỉ số 0…3) và lớp đối với từng kỹ năng ẩn.
function effects(si, section) {
  const n2 = section === 'N02';
  const e = { k1: 0.25, k2: 0, dk: 0, bc: 0, ct: 0, pf: 0, rater: { TL1: 0, TL2a: 0, TL2b: 0 } };
  if (si === 0) Object.assign(e, { dk: -0.3, bc: -0.15 });
  if (si === 1) Object.assign(e, { dk: n2 ? -0.75 : -0.5, bc: -0.12, ct: -0.05, rater: { TL1: -0.05, TL2a: n2 ? -0.62 : -0.12, TL2b: 0 } });
  if (si === 2) Object.assign(e, { dk: n2 ? 0.25 : 0.35, bc: 0.1, ct: 0.05, rater: { TL1: 0, TL2a: -0.05, TL2b: 0 } });
  if (si === 3) Object.assign(e, { dk: n2 ? -0.75 : 0.35, k1: 0.3 });
  return e;
}

function poisson(rng, lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.random();
  } while (p > L && k < 20);
  return k - 1;
}

function pickWeighted(rng, entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = rng.random() * total;
  for (const [v, w] of entries) {
    x -= w;
    if (x <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

const ERROR_BASE = { DK1: 3.2, DK2: 2.2, DK3: 1.6, TG1: 1.1, CT1: 1.3, KQ1: 0.7, SS1: 1.1, HT1: 1.3, BC1: 1.25, TT1: 0.6 };

// ---- Ngân hàng trắc nghiệm (200 câu – CLO1) và đề thi -------------------------------------------------
function buildBank(rng) {
  const chapterOf = (i) => (i <= 40 ? 'C1' : i <= 85 ? 'C2' : i <= 130 ? 'C3' : i <= 170 ? 'C4' : 'C5');
  const bank = {};
  const gen = {};
  for (let i = 1; i <= 200; i++) {
    const id = `TN${String(i).padStart(3, '0')}`;
    const key = 'ABCD'[rng.int(0, 3)];
    const wrong = ['A', 'B', 'C', 'D'].filter((o) => o !== key);
    const attract = Object.fromEntries(wrong.map((o) => [o, 0.4 + rng.random()]));
    bank[id] = { chapter: chapterOf(i), key };
    gen[id] = { b: rng.normal(-0.3, 0.75), a: rng.uniform(0.8, 1.6), trueKey: key, attract };
  }
  // Câu có vấn đề (để thử chức năng rà soát đề):
  gen.TN087 = { ...gen.TN087, trueKey: 'A', b: 0.4, a: 2.0, attract: { B: 0.3, C: 3.5, D: 0.3 } }; // đáp án ghi nhầm 'C'
  bank.TN087.key = 'C';
  gen.TN143 = { ...gen.TN143, b: -3.4, a: 1.2 }; // quá dễ
  gen.TN056 = { ...gen.TN056, b: 1.25, a: 1.1 }; // quá khó, có phương án nhiễu mạnh
  {
    const wrong = ['A', 'B', 'C', 'D'].filter((o) => o !== bank.TN056.key);
    gen.TN056.attract = Object.fromEntries(wrong.map((o, k) => [o, k === 0 ? 4 : 0.6]));
  }
  gen.TN121 = { ...gen.TN121, b: -0.2, a: 0.05 }; // gần như không phân biệt
  return { bank, gen };
}

function buildForms(rng, semesterIds) {
  const plan = { C1: 2, C2: 3, C3: 3, C4: 2, C5: 2 };
  const ranges = { C1: [1, 40], C2: [41, 85], C3: [86, 130], C4: [131, 170], C5: [171, 200] };
  const forced = {
    'HK1-2526|CK|D2': ['TN056'],
    'HK2-2526|CK|D1': ['TN087', 'TN143'],
    'HK2-2526|CK|D2': ['TN121'],
    'HK1-2627|CK|D1': ['TN087'],
  };
  const chapterOf = (id) => {
    const i = Number(id.slice(2));
    return Object.entries(ranges).find(([, [lo, hi]]) => i >= lo && i <= hi)[0];
  };
  const forms = {};
  for (const sem of semesterIds) {
    const used = new Set();
    for (const f of ['D1', 'D2', 'D3', 'D4']) {
      const key = `${sem}|CK|${f}`;
      const must = forced[key] || [];
      const ids = [];
      for (const [ch, k] of Object.entries(plan)) {
        const mustHere = must.filter((id) => chapterOf(id) === ch);
        const pool = [];
        for (let i = ranges[ch][0]; i <= ranges[ch][1]; i++) {
          const id = `TN${String(i).padStart(3, '0')}`;
          if (!used.has(id) && !must.includes(id)) pool.push(id);
        }
        const picked = [...mustHere, ...rng.sample(pool, k - mustHere.length)];
        picked.forEach((id) => used.add(id));
        ids.push(...picked);
      }
      forms[key] = ids;
    }
  }
  return forms;
}

// ---- Điểm từng câu ----------------------------------------------------------------------------------
function rubricPoints(rng, skill, b, max, noise = 0.08) {
  const f = clamp(logistic(1.7 * (skill - b)) + rng.normal(0, noise), 0, 1);
  return clamp(q25(f * max), 0, max);
}

function attendancePoints(att, rng) {
  // Rubric 1 – tiêu chí "Tham gia học tập": mức A ≥ 95% buổi, B 80–90%, C 60–80%, D 50–60%, F < 50%.
  let s10;
  if (att >= 0.95) s10 = rng.uniform(8.6, 10);
  else if (att >= 0.85) s10 = rng.uniform(7.0, 8.4);
  else if (att >= 0.7) s10 = rng.uniform(5.5, 6.9);
  else if (att >= 0.55) s10 = rng.uniform(4.0, 5.4);
  else s10 = rng.uniform(1.5, 3.9);
  return clamp(q25((s10 / 10) * 3), 0, 3);
}

function errorsFor(rng, item, frac, si) {
  if (!item.errors) return [];
  const dkItem = item.errors.some((c) => c.startsWith('DK'));
  const lambda = (1 - frac) * (item.max >= 2.5 ? 3.6 : 2.6) * (dkItem && si === 1 ? 1.35 : 1);
  const k = Math.min(4, poisson(rng, lambda));
  const dkBoost = si === 1 ? 2.8 : si === 0 ? 1.5 : si === 3 ? 1.8 : 1;
  const entries = item.errors.map((c) => [c, (ERROR_BASE[c] || 1) * (c.startsWith('DK') ? dkBoost : 1)]);
  const out = [];
  for (let j = 0; j < k; j++) out.push(pickWeighted(rng, entries));
  return out;
}

function mcqAnswers(rng, ids, gen, theta) {
  let opt = '';
  for (const id of ids) {
    const g = gen[id];
    const p = 0.25 + 0.75 * logistic(1.7 * g.a * (theta - g.b));
    let o;
    if (rng.random() < p) o = g.trueKey;
    else o = pickWeighted(rng, Object.entries(g.attract));
    opt += o;
  }
  return { opt };
}

// ---- Bộ sinh chính ---------------------------------------------------------------------------------
export function buildCloOutcomes({ rng, classes, enrolment, traits, engByClass, semesters, lecturers }) {
  const versions = JSON.parse(JSON.stringify(CLO_VERSIONS));
  const approved = resolveVersion(versions.find((v) => v.status === 'approved'));
  const semIndex = new Map(semesters.map((s, i) => [s.id, i]));
  const current = semesters[semesters.length - 1].id;
  const cloClasses = classes.filter((c) => c.courseId === CLO_COURSE);
  const { bank, gen } = buildBank(rng.fork('bank'));
  const forms = buildForms(rng.fork('forms'), semesters.map((s) => s.id));
  const lect = new Map(lecturers.map((l) => [l.id, l]));
  // Cán bộ chấm thứ hai: giảng viên khác của khoa (đề thi kết thúc học phần chấm 2 vòng độc lập).
  const coMarker = lecturers.find((l) => l.facultyId === 'KT' && !cloClasses.some((c) => c.lecturerId === l.id)) || lecturers[0];
  const rosters = {};
  const submissions = [];
  const support = [];
  const srng = rng.fork('scores');
  const markerName = (id) => lect.get(id)?.name ?? id;

  for (const cls of cloClasses) {
    const si = semIndex.get(cls.semesterId);
    const section = cls.lineage.split('-').pop();
    const fx = effects(si, section);
    const cal = ASSESSMENT_CALENDAR[cls.semesterId] || {};
    const isCurrent = cls.semesterId === current;
    const codes = enrolment[cls.id] || [];
    const roster = [];
    const latent = {};
    for (const s of codes) {
      const tr = traits[s];
      const eZ = (engByClass[cls.id]?.[s] ?? tr.engagement) / 1.05;
      const theta = tr.ability;
      const withdrawn = srng.bool(0.02);
      const att = clamp(0.94 + 0.055 * eZ + srng.normal(0, 0.055) - (withdrawn ? 0.3 : 0), 0.3, 1);
      roster.push({ s, st: withdrawn ? 'withdrawn' : 'active', att: Math.round(att * 100) / 100 });
      latent[s] = {
        eZ,
        att,
        withdrawn,
        k1: 0.85 * theta + 0.15 * eZ + fx.k1 + srng.normal(0, 0.45),
        k2: 0.8 * theta + 0.15 * eZ + fx.k2 + srng.normal(0, 0.5),
        dk: 0.8 * theta + 0.2 * eZ + fx.dk + srng.normal(0, 0.5),
        bc: 0.75 * theta + 0.2 * eZ + fx.bc + srng.normal(0, 0.5),
        ct: 0.7 * theta + 0.25 * eZ + fx.ct + srng.normal(0, 0.5),
        pf: 0.3 * theta + 0.75 * eZ + srng.normal(0, 0.45),
        prep: 0.25 * theta + 0.8 * eZ + srng.normal(0, 0.4),
      };
    }
    rosters[cls.id] = roster;
    const active = roster.filter((r) => r.st === 'active').map((r) => r.s);
    const sub = (s, a, t, f, st, d, extra = {}) => {
      const x = { c: cls.id, s, a, t, f, st, d, ...extra };
      submissions.push(x);
      return x;
    };

    // A1.2 – Bài kiểm tra (LMS, kết thúc Chương 3)
    if (cal.KT) {
      for (const s of active) {
        const L = latent[s];
        const absent = srng.bool(L.eZ < -1 ? 0.07 : 0.025);
        if (absent) {
          sub(s, 'KT', 1, 'KT1', 'absent', cal.KT[0]);
          continue;
        }
        const late = isCurrent && section === 'N01' && srng.bool(0.08);
        const pts = { TC1: rubricPoints(srng, L.k1, ITEM_B['KT:TC1'], 6), TC2: rubricPoints(srng, L.dk, ITEM_B['KT:TC2'], 4) };
        const err = errorsFor(srng, approved.aByCode.get('KT').items[1], pts.TC2 / 4, si).map((e) => ['TC2', e]);
        if (late) sub(s, 'KT', 1, 'KT1', 'pending', cal.KT[0]);
        else sub(s, 'KT', 1, 'KT1', 'graded', cal.KT[0], { pts, err });
      }
    }
    if (isCurrent) continue; // học kỳ hiện tại: mới có bài kiểm tra (xử lý nhóm hỗ trợ ở dưới)

    // A1.2 – Bài tập thực hành (nộp trên LMS, kết thúc Chương 5)
    for (const s of active) {
      const L = latent[s];
      if (srng.bool(L.eZ < -1 ? 0.09 : 0.025)) {
        sub(s, 'TH', 1, 'TH', 'absent', cal.TH[0]);
        continue;
      }
      const a = approved.aByCode.get('TH');
      const pts = {
        TC1: rubricPoints(srng, L.ct, ITEM_B['TH:TC1'], 2.5),
        TC2: rubricPoints(srng, L.dk, ITEM_B['TH:TC2'], 2.5),
        TC3: rubricPoints(srng, L.bc, ITEM_B['TH:TC3'], 2.5),
        TC4: rubricPoints(srng, 0.5 * L.k1 + 0.5 * L.pf, ITEM_B['TH:TC4'], 2.5),
      };
      const err = [];
      for (const it of a.items) for (const e of errorsFor(srng, it, pts[it.code] / it.max, si)) err.push([it.code, e]);
      sub(s, 'TH', 1, 'TH', 'graded', cal.TH[0], { pts, err });
    }
    // A1.1 – Chuyên cần, thái độ (chốt cuối kỳ)
    for (const s of active) {
      const L = latent[s];
      sub(s, 'CC', 1, 'CC', 'graded', cal.CC[0], {
        pts: { TC1: attendancePoints(L.att, srng), TC2: rubricPoints(srng, L.prep, -0.9, 2, 0.07), TC3: rubricPoints(srng, L.pf, -1.15, 5, 0.06) },
      });
    }
    // A2 – Thi cuối kỳ lần 1 (2 đề, chấm 2 vòng độc lập phần tự luận)
    const ck = approved.aByCode.get('CK');
    const examSub = (s, t, form, L, boost = 0) => {
      const ids = forms[`${cls.semesterId}|CK|${form}`];
      const { opt } = mcqAnswers(srng, ids, gen, L.k1 + boost * 0.4);
      const correct = [...opt].filter((o, k) => o === bank[ids[k]].key).length;
      const truth = {
        TL1: rubricPoints(srng, L.k2 + boost * 0.4, ITEM_B['CK:TL1'], 3),
        TL2a: rubricPoints(srng, L.dk + boost, ITEM_B['CK:TL2a'], 2.5),
        TL2b: rubricPoints(srng, L.bc + boost * 0.6, ITEM_B['CK:TL2b'], 1.5),
      };
      const rA = {};
      const rB = {};
      const pts = { TN: correct * 0.25 };
      for (const code of ['TL1', 'TL2a', 'TL2b']) {
        const max = ck.items.find((i) => i.code === code).max;
        rA[code] = clamp(q25(truth[code] + srng.normal(0, 0.16)), 0, max);
        rB[code] = clamp(q25(truth[code] + fx.rater[code] + srng.normal(0, 0.16)), 0, max);
        pts[code] = Math.abs(rA[code] - rB[code]) <= 0.5 ? clamp(q25((rA[code] + rB[code]) / 2), 0, max) : truth[code];
      }
      const err = [];
      for (const code of ['TL1', 'TL2a', 'TL2b']) {
        const it = ck.items.find((i) => i.code === code);
        for (const e of errorsFor(srng, it, pts[code] / it.max, si)) err.push([code, e]);
      }
      return sub(s, 'CK', t, form, 'graded', cal.CK[t - 1], { pts, r1: rA, r2: rB, m1: cls.lecturerId, m2: coMarker.id, err, opt });
    };
    for (const s of active) {
      const L = latent[s];
      if (L.att < 0.7) {
        sub(s, 'CK', 1, null, 'banned', cal.CK[0]);
        continue;
      }
      if (srng.bool(0.02)) {
        sub(s, 'CK', 1, null, 'absent', cal.CK[0]);
        continue;
      }
      examSub(s, 1, srng.bool(0.5) ? 'D1' : 'D2', L);
    }
    // Thi lần 2 (đề tương đương D3/D4) cho sinh viên chưa đạt học phần lần 1 hoặc vắng thi; một phần được ôn tập trước.
    const subsHere = submissions.filter((x) => x.c === cls.id);
    const res = classResult({ rv: approved, roster, subs: subsHere, mode: 'initial' });
    for (const st of res.students) {
      const L = latent[st.code];
      const failed = (st.course !== null && st.course < 4) || st.aState.CK === 'absent';
      if (!failed || st.aState.CK === 'banned' || !srng.bool(0.88)) continue;
      const coached = si === 1 && srng.bool(0.75);
      if (coached) {
        support.push({
          id: `HT-${cls.id}-${st.code}`,
          classId: cls.id,
          code: st.code,
          clo: 'CLO3',
          type: 'phu_dao',
          content: 'Ôn tập định khoản các quá trình kinh doanh trước thi lần 2: 2 buổi phụ đạo, bộ 40 nghiệp vụ tự chấm trên LMS',
          owner: markerName(cls.lecturerId),
          due: '2026-01-30',
          status: 'hoan_thanh',
          createdAt: '2026-01-15T02:00:00.000Z',
          createdBy: markerName(cls.lecturerId),
          reassess: { assessment: 'CK', attempt: 2, date: cal.CK[1] },
        });
      }
      examSub(st.code, 2, srng.bool(0.5) ? 'D3' : 'D4', L, coached ? 0.55 : 0.25);
    }
  }

  // ---- Học kỳ hiện tại: nhóm hỗ trợ sau bài kiểm tra và kiểm tra lại bằng đề tương đương -------------
  for (const cls of cloClasses.filter((c) => c.semesterId === current)) {
    const section = cls.lineage.split('-').pop();
    const subsHere = submissions.filter((x) => x.c === cls.id && x.a === 'KT');
    const cal = ASSESSMENT_CALENDAR[cls.semesterId];
    for (const x of subsHere) {
      if (x.st === 'absent') {
        support.push({
          id: `HT-${cls.id}-${x.s}`,
          classId: cls.id,
          code: x.s,
          clo: 'CLO1',
          type: 'lam_bu',
          content: 'Liên hệ sinh viên, bố trí làm bài kiểm tra bù trên LMS (đề tương đương)',
          owner: markerName(cls.lecturerId),
          due: '2026-11-25',
          status: 'dang_thuc_hien',
          createdAt: '2026-11-04T02:00:00.000Z',
          createdBy: markerName(cls.lecturerId),
        });
      }
      if (section !== 'N02' || x.st !== 'graded' || x.pts.TC2 >= 2) continue;
      const done = srng.bool(0.86);
      support.push({
        id: `HT-${cls.id}-${x.s}`,
        classId: cls.id,
        code: x.s,
        clo: 'CLO2',
        type: 'luyen_tap',
        content: 'Nhóm phụ đạo định khoản: bộ 30 nghiệp vụ tự chấm trên LMS (làm nhiều lần) và buổi phụ đạo 90 phút ngày 06/11/2026',
        owner: markerName(cls.lecturerId),
        due: '2026-11-12',
        status: done ? 'hoan_thanh' : 'dang_thuc_hien',
        createdAt: '2026-11-03T02:00:00.000Z',
        createdBy: markerName(cls.lecturerId),
        reassess: { assessment: 'KT', attempt: 2, date: cal.KT[1] },
      });
      if (!done || !srng.bool(0.92)) continue;
      const tr = traits[x.s];
      const eZ = (engByClass[cls.id]?.[x.s] ?? tr.engagement) / 1.05;
      const skill = 0.8 * tr.ability + 0.2 * eZ + effects(3, section).dk + 1.5 + srng.normal(0, 0.45);
      const tc2 = rubricPoints(srng, skill, ITEM_B['KT:TC2'], 4);
      const err = errorsFor(srng, { max: 4, errors: ['DK1', 'DK2', 'DK3', 'TG1'] }, tc2 / 4, 3).map((e) => ['TC2', e]);
      submissions.push({ c: cls.id, s: x.s, a: 'KT', t: 2, f: 'KT2', st: 'graded', d: cal.KT[1], pts: { TC2: tc2 }, err });
    }
  }

  return {
    meta: { source: 'synthetic', note: 'Điểm mô phỏng – CLO và cấu trúc đánh giá theo đề cương chi tiết học phần Nguyên lý kế toán (2025)' },
    programs: JSON.parse(JSON.stringify(PROGRAMS)),
    versions,
    errorTypes: ERROR_TYPES.map((e) => ({ ...e })),
    bank,
    forms,
    rosters,
    submissions,
    support,
  };
}

// Điểm học vụ của lớp có dữ liệu CLO = tính từ điểm chi tiết (một nguồn số liệu cho cả M3 và M6):
// điểm quá trình = nhóm A1 (tạm tính khi học kỳ chưa xong), điểm học phần = lần thi đầu.
export function deriveGrades(outcomes, classes, grades) {
  const versions = outcomes.versions.map(resolveVersion);
  const byClass = new Map();
  for (const x of outcomes.submissions) {
    if (!byClass.has(x.c)) byClass.set(x.c, []);
    byClass.get(x.c).push(x);
  }
  const derived = new Map();
  for (const cls of classes) {
    const subs = byClass.get(cls.id);
    if (!subs) continue;
    const rv = versionForClass(versions, cls);
    if (!rv) continue;
    const res = classResult({ rv, roster: outcomes.rosters[cls.id] || [], subs, mode: 'initial' });
    for (const s of res.students) derived.set(`${s.code}|${cls.id}`, s);
  }
  return grades.map((g) => {
    const d = derived.get(`${g.researchCode}|${g.classId}`);
    if (!d) return g;
    return { ...g, process: d.process, final: d.course, source: 'clo' };
  });
}
