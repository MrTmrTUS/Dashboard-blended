// Bộ dữ liệu MÔ PHỎNG cho MVP (không phải dữ liệu thật của Trường).
// Sinh có hạt giống nên mọi lần mở trang đều ra cùng một bộ số; có sẵn vài "kịch bản"
// để trình diễn: lớp theo dõi, lớp can thiệp, vấn đề chung của một khoa, lớp dưới 10 phiếu.
import { DEFAULT_CONFIG } from '../core/config.js';
import { ALL_ITEM_CODES, ENG_ITEM_INDEX, FACTORS, FACTOR_ITEM_INDEX } from '../core/constants.js';
import { createRng } from '../core/rng.js';
import { COURSES, FACULTIES, SEMESTERS, personName } from './catalog.js';
import { COMMENT_TEMPLATES, PII_WRAPPERS } from './comments.js';
import { MEASURES } from './measures.js';
import { RESEARCH_PARAMS } from './params.js';
import { TOPIC_BY_ID } from './topics.js';

// Mức nền của từng nhân tố (học kỳ gần nhất) và xu hướng cải thiện dần theo học kỳ.
const BASE = { CT1: 4.0, IN2: 4.1, PS1: 3.93, PS2: 3.9, CT2: 3.76, IN1: 3.86, IN3: 3.84, PT1: 3.9, PT2: 3.85 };
const SEMESTER_TREND = [-0.12, -0.08, -0.04, 0];
const DOT_EFFECT = { GK: 0, CK: 0.03 };
const FACULTY_EFFECT = {
  KT: {},
  CNTT: { IN1: 0.08, CT2: -0.06 },
  KTCN: { IN1: -0.45, CT2: -0.12, IN3: -0.05 },
  NN: { IN2: 0.1, PS2: 0.12 },
  LUAT: { PS2: -0.14, CT1: 0.04 },
  YD: { IN3: -0.12, PS2: 0.05 },
};

// Kịch bản theo "dòng lớp" (cùng học phần, cùng nhóm, cùng giảng viên qua các học kỳ).
// wave: chỉ số đợt toàn cục 0…6 (HK2 24–25 GK … HK1 26–27 GK).
const SCRIPTS = {
  'MKT101-N03': {
    effect: (w) => ({ ALL: -0.04, IN1: w === 6 ? -0.36 : -0.08, PS1: w === 6 ? -0.24 : 0.1 }),
    topics: (w) => (w === 6 ? { lms_kho_tim: 0.6 } : {}),
    size: (w) => (w >= 6 ? 32 : null),
    responses: { 6: 20 },
  },
  'INF202-N02': {
    effect: (w) => (w === 6 ? { PS1: -1.55, PS2: -0.3 } : w >= 4 ? { PS1: -0.42 } : {}),
    topics: (w) => (w === 6 ? { phan_hoi_cham: 0.5, tieu_chi_cham: 0.25 } : {}),
  },
  'LAW201-N01': {
    effect: (w) => ({ ALL: w === 4 ? 0.16 : w === 5 ? -0.08 : w === 6 ? -0.44 : 0, PS2: w === 6 ? -0.15 : 0 }),
    topics: (w) => (w === 6 ? { it_tuong_tac: 0.45 } : {}),
  },
  'KTO201-N01': {
    effect: (w) => (w === 4 ? { PS2: -0.68 } : w === 5 ? { PS2: -0.12 } : {}),
    topics: (w) => (w === 4 ? { it_tuong_tac: 0.4 } : {}),
  },
  'KTC201-N01': { effect: (w) => (w === 6 ? { ALL: 0.2, CT2: 0.15, IN3: 0.15, IN1: 0.06 } : {}), topics: (w) => (w === 6 ? { mang: 0.35 } : {}) },
  'LAW202-N01': { effect: (w) => (w === 6 ? { ALL: 0.2, IN2: 0.1 } : {}) },
  'KTC202-N02': { effect: (w) => (w === 6 ? { IN1: 0.06 } : {}) },
  'INF301-N01': { responses: { 6: 7 }, size: (w) => (w >= 6 ? 18 : null) },
  'ENG301-N01': { responses: { 6: 8 }, size: (w) => (w >= 6 ? 20 : null) },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

export function buildSyntheticDataset({ seed = 'tdu-bl-2026' } = {}) {
  const rng = createRng(seed);
  const cfg = DEFAULT_CONFIG;

  // ---- Danh mục -------------------------------------------------------------
  const semesters = SEMESTERS.map((s, i) => ({ id: s.id, label: s.label, order: i }));
  const waves = [];
  for (const s of SEMESTERS) {
    for (const dot of ['GK', 'CK']) {
      if (!s.waves[dot]) continue;
      const date = s.waves[dot];
      const pub = new Date(`${date}T09:00:00`);
      pub.setDate(pub.getDate() + 8);
      waves.push({
        id: `${s.id}-${dot}`,
        semesterId: s.id,
        dot,
        order: waves.length,
        date,
        status: 'published',
        publishedAt: pub.toISOString(),
      });
    }
  }

  const faculties = FACULTIES.map((f) => ({ ...f }));
  const courses = COURSES.map(({ sections, ...c }) => ({ ...c }));
  const lecturers = [];
  const sectionLecturer = {};
  const lrng = rng.fork('lecturers');
  for (const c of COURSES) {
    const nLect = Math.max(1, Math.ceil(c.sections / 2));
    const ids = [];
    for (let k = 0; k < nLect; k++) {
      const id = `GV${String(lecturers.length + 1).padStart(2, '0')}`;
      lecturers.push({ id, name: personName(lrng), facultyId: c.facultyId });
      ids.push(id);
    }
    for (let s = 1; s <= c.sections; s++) sectionLecturer[`${c.id}-N0${s}`] = ids[(s - 1) % ids.length];
  }

  // Sinh viên theo khoa (mã nghiên cứu – không lưu mã sinh viên thật), lớp sinh hoạt, cố vấn.
  const advisors = [];
  const students = [];
  const traits = {};
  const srng = rng.fork('students');
  let stuSeq = 10000;
  for (const f of faculties) {
    const advIds = [];
    for (let k = 0; k < 2; k++) {
      const id = `CV${String(advisors.length + 1).padStart(2, '0')}`;
      advisors.push({ id, name: personName(srng), facultyId: f.id });
      advIds.push(id);
    }
    for (let i = 0; i < 150; i++) {
      stuSeq += srng.int(1, 9);
      const code = `NC-${stuSeq}`;
      const homeroom = `K${srng.int(17, 19)}-${f.id}${(i % 2) + 1}`;
      const ability = srng.normal(0, 1);
      traits[code] = {
        ability,
        engagement: 0.45 * ability + srng.normal(0, 0.9),
        leniency: srng.normal(0, 0.42),
        consent: srng.bool(0.88),
        gpa0: clamp(Math.round((2.75 + 0.42 * ability + srng.normal(0, 0.28)) * 100) / 100, 1.2, 4),
      };
      students.push({ code, homeroom, advisorId: advIds[i % 2], facultyId: f.id });
    }
  }
  const studentsByFaculty = {};
  for (const s of students) (studentsByFaculty[s.facultyId] ||= []).push(s.code);

  // ---- Lớp học phần theo học kỳ ----------------------------------------------
  const classes = [];
  const lineageEffect = {};
  const crng = rng.fork('classes');
  for (const c of COURSES) {
    for (let s = 1; s <= c.sections; s++) {
      const lineage = `${c.id}-N0${s}`;
      const dims = {};
      for (const f of FACTORS) dims[f.code] = crng.normal(0, 0.05);
      lineageEffect[lineage] = { all: crng.normal(0, 0.06), dims };
    }
  }
  const enrolment = {};
  semesters.forEach((sem, si) => {
    const firstWave = waves.find((w) => w.semesterId === sem.id).order;
    for (const c of COURSES) {
      const pool = crng.shuffle(studentsByFaculty[c.facultyId]);
      let cursor = 0;
      for (let s = 1; s <= c.sections; s++) {
        const lineage = `${c.id}-N0${s}`;
        const script = SCRIPTS[lineage];
        const size = script?.size?.(firstWave) ?? crng.int(24, 48);
        const id = `${sem.id}-${lineage}`;
        classes.push({
          id,
          code: id,
          lineage,
          name: `${c.name} – N0${s}`,
          courseId: c.id,
          facultyId: c.facultyId,
          lecturerId: sectionLecturer[lineage],
          semesterId: sem.id,
          size,
          drift: crng.normal(0, 0.04),
          semesterIndex: si,
        });
        enrolment[id] = pool.slice(cursor, cursor + size);
        cursor += size;
        if (cursor + 48 > pool.length) cursor = 0;
      }
    }
  });

  // ---- Phiếu khảo sát ----------------------------------------------------------
  const responses = [];
  const grades = [];
  const truthLabels = {};
  const prng = rng.fork('responses');
  const itemOffset = new Float64Array(ALL_ITEM_CODES.length).map(() => prng.normal(0, 0.12));
  const templatesByTopic = {};
  for (const t of COMMENT_TEMPLATES) (templatesByTopic[t.topic] ||= []).push(t);
  let respSeq = 0;

  for (const cls of classes) {
    const facEff = FACULTY_EFFECT[cls.facultyId] || {};
    const lin = lineageEffect[cls.lineage];
    const script = SCRIPTS[cls.lineage];
    const classWaves = waves.filter((w) => w.semesterId === cls.semesterId);
    const enrolled = enrolment[cls.id];
    // độ gắn kết của sinh viên trong lớp này (ổn định trong học kỳ)
    const classEng = {};
    for (const code of enrolled) classEng[code] = traits[code].engagement + prng.normal(0, 0.35);

    for (const wave of classWaves) {
      const w = wave.order;
      const scriptEff = script?.effect?.(w) || {};
      const mean = {};
      for (const f of FACTORS) {
        mean[f.code] =
          BASE[f.code] +
          SEMESTER_TREND[cls.semesterIndex] +
          DOT_EFFECT[wave.dot] +
          (facEff[f.code] || 0) +
          lin.all +
          lin.dims[f.code] +
          cls.drift +
          (scriptEff.ALL || 0) +
          (scriptEff[f.code] || 0);
      }
      const avgDim = (mean.CT1 + mean.CT2 + mean.IN1 + mean.IN2 + mean.IN3 + mean.PS1 + mean.PS2) / 7;
      const dissatisfiedShare = clamp(0.05 + (3.85 - avgDim) * 0.12, 0.02, 0.25);
      const rate = prng.uniform(0.52, 0.86);
      const target = script?.responses?.[w] ?? Math.max(4, Math.round(cls.size * rate));
      const respondents = prng.sample(enrolled, Math.min(target, enrolled.length));
      const scriptTopics = script?.topics?.(w) || {};

      for (const code of respondents) {
        const tr = traits[code];
        const v = new Uint8Array(ALL_ITEM_CODES.length);
        const dissatisfied = prng.bool(dissatisfiedShare);
        const general = dissatisfied ? prng.normal(-1.25, 0.35) : prng.normal(0, 0.34);
        const style = prng.random();
        const careless = prng.bool(0.03);
        const dimLatent = {};
        for (const f of FACTORS) {
          const theta = mean[f.code] + tr.leniency + general + prng.normal(0, 0.3);
          dimLatent[f.code] = theta;
          for (const i of FACTOR_ITEM_INDEX[f.code]) {
            v[i] = clamp(Math.round(theta + itemOffset[i] + prng.normal(0, 0.55)), 1, 5);
          }
        }
        // gắn kết học tập (12 chỉ báo)
        const engTheta =
          3.6 + 0.36 * classEng[code] + 0.3 * (avgDim - 3.85) + 0.3 * general + prng.normal(0, 0.18);
        for (const i of ENG_ITEM_INDEX) v[i] = clamp(Math.round(engTheta + itemOffset[i] + prng.normal(0, 0.55)), 1, 5);

        // các kiểu phiếu không hợp lệ
        if (style < 0.018) v.fill(5, 0, 62);
        else if (style < 0.028) v.fill(4, 0, 62);
        else if (style < 0.042) {
          for (let i = 0; i < 62; i++) if (prng.bool(0.45)) v[i] = 0;
        }
        // bỏ trống ngẫu nhiên một ít
        for (let i = 0; i < v.length; i++) if (v[i] && prng.bool(0.012)) v[i] = 0;

        const att = careless
          ? [prng.int(1, 5), prng.int(1, 5)]
          : [cfg.attentionChecks[0].expect, cfg.attentionChecks[1].expect];

        // ý kiến tự do
        let comment = '';
        let truth = null;
        const writes = prng.bool(dissatisfied ? 0.7 : 0.32);
        if (writes) {
          let topicId = null;
          const scripted = Object.entries(scriptTopics);
          for (const [tid, p] of scripted) if (!topicId && prng.bool(p)) topicId = tid;
          if (!topicId) {
            const dims = FACTORS.filter((f) => f.dimension).map((f) => f.code);
            const sorted = dims.sort((a, b) => dimLatent[a] - dimLatent[b]);
            const negative = dissatisfied || prng.bool(0.6);
            const factor = negative ? sorted[prng.int(0, 1)] : sorted[sorted.length - 1 - prng.int(0, 1)];
            const cands = COMMENT_TEMPLATES.filter(
              (t) => TOPIC_BY_ID[t.topic].factor === factor && t.s === (negative ? 'tieu_cuc' : 'tich_cuc'),
            );
            const pick = cands.length ? prng.pick(cands) : prng.pick(COMMENT_TEMPLATES);
            topicId = pick.topic;
            comment = pick.text;
            truth = { topic: pick.topic, s: pick.s };
          } else {
            const pick = prng.pick(templatesByTopic[topicId]);
            comment = pick.text;
            truth = { topic: pick.topic, s: pick.s };
          }
          if (prng.bool(0.04)) {
            const wrap = prng.pick(PII_WRAPPERS);
            const phone = `09${prng.int(10, 99)} ${prng.int(100, 999)} ${prng.int(100, 999)}`;
            comment = wrap(comment, personName(prng, { title: false }), phone, `2021${prng.int(100000, 999999)}`);
          }
        }

        const day = new Date(`${wave.date}T08:00:00`);
        day.setDate(day.getDate() + prng.int(-4, 3));
        day.setHours(prng.int(7, 17), prng.int(0, 59));
        respSeq++;
        const id = `P${String(respSeq).padStart(6, '0')}`;
        responses.push({
          id,
          researchCode: code,
          classId: cls.id,
          waveId: wave.id,
          time: day.toISOString(),
          v,
          att,
          comment,
          consent: tr.consent,
        });
        if (truth) truthLabels[id] = { factor: TOPIC_BY_ID[truth.topic].factor, topic: truth.topic, sentiment: truth.s };
      }
    }

    // điểm quá trình, điểm học phần (học kỳ hiện tại chưa có điểm học phần)
    const isCurrent = cls.semesterIndex === semesters.length - 1;
    for (const code of enrolled) {
      const tr = traits[code];
      if (!tr.consent) continue;
      const eng = classEng[code];
      const process = clamp(round1(6.7 + 1.1 * tr.ability + 0.55 * eng + prng.normal(0, 0.9)), 0, 10);
      const final = isCurrent
        ? null
        : clamp(round1(4.2 + 0.42 * process + 0.45 * tr.ability + 0.22 * eng + prng.normal(0, 1.45)), 0, 10);
      grades.push({ researchCode: code, classId: cls.id, process, final, gpa0: tr.gpa0 });
    }
  }

  // Kế hoạch cải tiến mẫu (để trình diễn chu trình PDCA "trước – sau").
  const findClass = (sem, lineage) => classes.find((c) => c.semesterId === sem && c.lineage === lineage);
  const kto = findClass('HK2-2526', 'KTO201-N01');
  const ktc = findClass('HK1-2627', 'KTC201-N01');
  const seedPlans = [
    {
      id: 'KH-0001',
      classId: kto.id,
      waveId: 'HK2-2526-GK',
      dimension: 'PS2',
      measureCode: 'BP-PS2-02',
      action: 'Tăng hoạt động nhóm, dự án gắn với tình huống thực tế; phân vai rõ trong nhóm.',
      owner: lecturers.find((l) => l.id === kto.lecturerId)?.name || 'Giảng viên',
      due: '2026-04-30',
      status: 'hoan_thanh',
      createdAt: '2026-03-30T08:30:00.000Z',
      createdBy: 'Giảng viên phụ trách',
      note: 'Bổ sung 3 bài tập nhóm theo tình huống doanh nghiệp.',
    },
    {
      id: 'KH-0002',
      classId: ktc.id,
      waveId: 'HK1-2627-GK',
      dimension: 'IN1',
      measureCode: 'BP-IN1-04',
      action: 'Rà soát đường truyền, điểm phát wifi tại phòng học kết hợp; ưu tiên khu có nhiều phản ánh.',
      owner: 'Lãnh đạo Khoa Kỹ thuật – Công nghệ',
      due: '2026-11-20',
      status: 'dang_thuc_hien',
      createdAt: '2026-10-26T02:00:00.000Z',
      createdBy: 'Lãnh đạo khoa',
      note: '',
    },
  ];

  return {
    meta: {
      source: 'synthetic',
      label: 'Bộ dữ liệu mô phỏng (hạt giống cố định)',
      seed,
      createdAt: '2026-10-24T09:00:00.000Z',
    },
    semesters,
    waves,
    faculties,
    courses,
    lecturers,
    advisors,
    classes: classes.map(({ drift, semesterIndex, ...c }) => c),
    students,
    responses,
    grades,
    params: structuredClone(RESEARCH_PARAMS),
    measures: MEASURES.map((m) => ({ ...m })),
    seedPlans,
    truthLabels,
  };
}
