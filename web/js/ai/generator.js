// Mô-đun AI (mục 3.5, 5.5): dữ kiện → mô hình → bộ kiểm số → hiển thị.
// Bản MVP có 2 "bộ máy":
//   - 'template': sinh văn bản bằng mẫu câu từ chính các dữ kiện (chạy được mọi nơi, kể cả GitHub Pages);
//   - 'ollama'  : gọi mô hình ngôn ngữ mở qua Ollama trong mạng nội bộ của Trường (tùy chọn).
// Cả hai đều đi qua bộ kiểm số; văn bản của mô hình được sinh lại tối đa 2 lần nếu có số lạ.
import { FACTOR_BY_CODE } from '../core/constants.js';
import { checkText } from '../core/factcheck.js';
import { fmtPct, fmtScore, fmtSigned } from '../core/format.js';
import { isNum } from '../core/stats.js';
import { classFacts, scopeFacts, studentFacts } from './facts.js';

export const SYSTEM_PROMPT =
  'Bạn là trợ lý đảm bảo chất lượng. Chỉ dùng các dữ kiện F1 – Fn. Không thêm số liệu, không suy đoán nguyên nhân ngoài dữ kiện. ' +
  'Viết 3 – 5 câu tiếng Việt, giọng trung tính; ghi mã dữ kiện sau mỗi ý, ví dụ [F2]. ' +
  'Gợi ý biện pháp chỉ lấy trong danh sách "bien_phap", ghi mã biện pháp. ' +
  'Trả lời bằng JSON: {"tom_tat": "…", "goi_y": [{"ma_bien_phap": "…", "dien_giai": "…"}]}.';

const name = (code) => FACTOR_BY_CODE[code]?.short ?? code;
const lcFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// ---- Mẫu câu ------------------------------------------------------------------------------

function classTemplate({ refs }) {
  const s = [];
  const o = refs.overallFact;
  const cmp = o.value - o.ref >= 0.05 ? 'cao hơn' : o.value - o.ref <= -0.05 ? 'thấp hơn' : 'tương đương';
  s.push(`Chỉ số chất lượng của lớp đạt ${fmtScore(o.value)}, ${cmp} trung bình Trường (${fmtScore(o.ref)}) [${refs.overall}].`);
  const [w1, w2] = refs.weak;
  if (w1) {
    const why = [w1.below ? 'dưới ngưỡng 3,5' : '', w1.funnel ? w1.funnel.replace(/^; /, '') : ''].filter(Boolean).join(' và ');
    s.push(`Phương diện cần chú ý nhất là ${w1.code} – ${name(w1.code)} (${fmtScore(w1.mean)})${why ? `, ${why}` : ''} [${w1.ref}].`);
  } else {
    s.push(`Không có phương diện nào dưới ngưỡng cảnh báo [${refs.overall}].`);
  }
  if (w2) s.push(`${w2.code} – ${name(w2.code)} cũng cần theo dõi (${fmtScore(w2.mean)}) [${w2.ref}].`);
  if (refs.decline) s.push(`Chỉ số chất lượng giảm liên tiếp qua các đợt gần đây [${refs.decline}].`);
  if (refs.drop && s.length < 5) s.push(`${refs.drop.code} giảm ${fmtScore(-refs.drop.delta)} điểm so với đợt trước [${refs.drop.ref}].`);
  if (refs.theme && s.length < 5) s.push(`Ý kiến sinh viên tập trung vào chủ đề “${lcFirst(refs.theme.label)}” (${refs.theme.n} ý kiến) [${refs.theme.ref}].`);
  if (refs.best && s.length < 5) s.push(`Điểm mạnh là ${refs.best.code} – ${name(refs.best.code)} (${fmtScore(refs.best.mean)}) [${refs.best.ref}].`);
  return s.slice(0, 5).join(' ');
}

function scopeTemplate({ refs, scope }) {
  const s = [];
  const o = refs.overall;
  if (isNum(o.prev)) {
    const d = o.value - o.prev;
    const dir = Math.abs(d) < 0.005 ? 'không đổi' : d > 0 ? 'tăng' : 'giảm';
    s.push(`Chỉ số chất lượng ${scope} đạt ${fmtScore(o.value)}, ${dir}${dir === 'không đổi' ? '' : ` ${fmtSigned(d).replace(/^[+−]/, '')}`} so với đợt trước (${fmtScore(o.prev)}) [${o.ref}].`);
  } else {
    s.push(`Chỉ số chất lượng ${scope} đạt ${fmtScore(o.value)} [${o.ref}].`);
  }
  const a = refs.alerts;
  if (a.alert) s.push(`Có ${a.alert} lớp cần can thiệp và ${a.warn} lớp cần theo dõi [${a.ref}].`);
  else s.push(`Không có lớp cần can thiệp; ${a.warn} lớp cần theo dõi [${a.ref}].`);
  if (refs.pareto) s.push(`Ưu tiên cải tiến hàng đầu theo Pareto có trọng số là ${refs.pareto.code} – ${name(refs.pareto.code)}, chiếm ${fmtPct(refs.pareto.share)} tổng khoảng cách [${refs.pareto.ref}].`);
  if (refs.heat) s.push(`${refs.heat.row} có ${refs.heat.code} thấp nhất trên bản đồ nhiệt (${fmtScore(refs.heat.mean)}) [${refs.heat.ref}].`);
  if (refs.theme && s.length < 5) s.push(`Ý kiến sinh viên nhắc nhiều nhất đến “${lcFirst(refs.theme.label)}” (${refs.theme.n} ý kiến tiêu cực) [${refs.theme.ref}].`);
  return s.slice(0, 5).join(' ');
}

function studentTemplate({ refs, stats }) {
  const s = [];
  s.push(`Trong ${stats.total} sinh viên được liên kết điểm, ${stats.alert} em ở mức can thiệp và ${stats.warn} em ở mức theo dõi [${refs.overall}].`);
  const first = stats.kProc >= stats.kEng ? `điểm quá trình thấp (${stats.kProc} em)` : `gắn kết thấp (${stats.kEng} em)`;
  const second = stats.kProc >= stats.kEng ? `gắn kết thấp (${stats.kEng} em)` : `điểm quá trình thấp (${stats.kProc} em)`;
  s.push(`Lý do phổ biến nhất là ${first}, tiếp đến là ${second} [${refs.reasons}].`);
  if (refs.both) s.push(`${stats.both} em thấp ở cả hai chỉ số nên được ưu tiên liên hệ trước [${refs.both}].`);
  if (refs.contacted) s.push(`Hiện đã đánh dấu liên hệ ${stats.done}/${stats.need} em cần hỗ trợ [${refs.contacted}].`);
  return s.join(' ');
}

// ---- Gợi ý biện pháp (chỉ lấy từ thư viện đã duyệt) --------------------------------------------

export function pickMeasures(library, dims, { lowIndicators = [], preferTargets = null, max = 3 } = {}) {
  const approved = library.filter((m) => m.status === 'da_duyet');
  const out = [];
  for (const dim of dims) {
    const cands = approved.filter((m) => m.dim === dim.code && !out.some((o) => o.measure.code === m.code));
    cands.sort((a, b) => {
      const ia = lowIndicators.includes(a.indicator) ? 0 : 1;
      const ib = lowIndicators.includes(b.indicator) ? 0 : 1;
      const ta = preferTargets && preferTargets.includes(a.target) ? 0 : 1;
      const tb = preferTargets && preferTargets.includes(b.target) ? 0 : 1;
      return ia - ib || ta - tb || a.code.localeCompare(b.code);
    });
    const take = dims.length === 1 ? 2 : 1;
    for (const m of cands.slice(0, take)) out.push({ measure: m, dim: dim.code, mean: dim.mean, ref: dim.ref });
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

// ---- Gọi Ollama (mạng nội bộ) --------------------------------------------------------------

export async function ollamaChat(cfg, messages, { json = true, timeoutMs = 90000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.ollamaModel, stream: false, format: json ? 'json' : undefined, options: { temperature: 0.2 }, messages }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Ollama trả về mã ${res.status}`);
    const data = await res.json();
    return data.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

export async function testOllama(cfg) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${cfg.ollamaUrl.replace(/\/$/, '')}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, message: `Mã phản hồi ${res.status}` };
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    return { ok: true, models, hasModel: models.includes(cfg.ollamaModel) };
  } catch (e) {
    return { ok: false, message: e.name === 'AbortError' ? 'Hết thời gian chờ' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function generateWithOllama({ facts, measures, context, cfg }) {
  const payload = {
    ...context,
    du_kien: facts.map(({ ma, noi_dung }) => ({ ma, noi_dung })),
    bien_phap: measures.map((m) => ({ ma: m.measure.code, noi_dung: m.measure.text })),
  };
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(payload) },
  ];
  let last = null;
  for (let attempt = 0; attempt <= cfg.aiMaxRetries; attempt++) {
    const content = await ollamaChat(cfg, messages);
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { tom_tat: content, goi_y: [] };
    }
    const text = String(parsed.tom_tat || '').trim();
    const check = checkText(text, facts, { extraAllowed: allowedConstants(cfg) });
    const allowedCodes = new Set(measures.map((m) => m.measure.code));
    const goi_y = (parsed.goi_y || []).filter((g) => allowedCodes.has(g.ma_bien_phap));
    last = { text, check, attempts: attempt + 1, goi_y };
    if (check.ok) return last;
    messages.push({ role: 'assistant', content });
    messages.push({
      role: 'user',
      content: `Văn bản có vấn đề: ${[
        check.unknownNumbers.length ? `số không có trong dữ kiện (${check.unknownNumbers.join(', ')})` : '',
        check.badCodes.length ? `mã nguồn không tồn tại (${check.badCodes.join(', ')})` : '',
        check.uncited.length ? 'có câu thiếu mã dữ kiện' : '',
      ].filter(Boolean).join('; ')}. Hãy viết lại, chỉ dùng số trong dữ kiện và ghi mã sau mỗi câu.`,
    });
  }
  return { ...last, flagged: true };
}

export const allowedConstants = (cfg) => [cfg.yellowDim, cfg.redDim, cfg.target, cfg.nMin, cfg.zYellow, cfg.zRed, cfg.declineWaves, 7];

// ---- Điểm vào: tóm tắt + gợi ý -------------------------------------------------------------

export async function generate(kind, input, { cfg, library = [] }) {
  let facts;
  let refs;
  let text;
  let measures = [];
  let context = {};
  if (kind === 'class') {
    ({ facts, refs } = classFacts(input, cfg));
    refs.overallFact = { value: input.cw.metrics.IDX.mean, ref: input.school.IDX.mean };
    const dims = (refs.weak.length ? refs.weak : input.profile.slice(0, 2).map((p) => ({ code: p.code, mean: p.mean, ref: refs.overall }))).map((w) => ({ code: w.code, mean: w.mean, ref: w.ref }));
    measures = pickMeasures(library, dims, { lowIndicators: input.lowest.map((l) => l.code), preferTargets: ['GV'] });
    context = { lop: input.cls.name, dot: input.waveLabel, n: input.cw.n, si_so: input.cw.size };
    text = classTemplate({ refs });
  } else if (kind === 'scope') {
    ({ facts, refs } = scopeFacts(input, cfg));
    const top = input.pareto.rows.filter((r) => r.gap > 0).slice(0, 2);
    const dims = top.map((r, i) => ({ code: r.code, mean: r.mean, ref: i === 0 ? refs.pareto?.ref : refs.pareto?.second?.ref ?? refs.pareto?.ref }));
    measures = pickMeasures(library, dims, { preferTargets: ['khoa', 'Trường'] });
    context = { pham_vi: input.scope, dot: input.waveLabel };
    text = scopeTemplate({ refs, scope: input.scope });
  } else {
    const r = studentFacts(input, cfg);
    facts = r.facts;
    refs = r.refs;
    context = { pham_vi: 'Sinh viên trong phạm vi phụ trách', dot: input.semesterLabel };
    text = studentTemplate({ refs, stats: r.stats });
  }

  const base = { kind, facts, measures, engine: 'template', attempts: 1, flagged: false, generatedAt: new Date().toISOString() };
  if (cfg.aiEngine === 'ollama' && kind !== 'students') {
    try {
      const res = await generateWithOllama({ facts, measures, context, cfg });
      const notes = Object.fromEntries((res.goi_y || []).map((g) => [g.ma_bien_phap, g.dien_giai]));
      return {
        ...base,
        engine: 'ollama',
        text: res.text,
        check: res.check,
        attempts: res.attempts,
        flagged: Boolean(res.flagged),
        measures: measures.map((m) => ({ ...m, note: notes[m.measure.code] || '' })),
      };
    } catch (e) {
      const check = checkText(text, facts, { extraAllowed: allowedConstants(cfg) });
      return { ...base, text, check, fallback: `Không gọi được Ollama (${e.message}) – hiển thị bản sinh bằng mẫu câu.` };
    }
  }
  const check = checkText(text, facts, { extraAllowed: allowedConstants(cfg) });
  return { ...base, text, check, flagged: !check.ok };
}
