// Dữ kiện có mã (mục 5.5): mỗi số liệu đưa vào AI mang mã riêng F1, F2…;
// văn bản AI phải trích mã sau mỗi ý, giao diện đổi mã thành ô xem số liệu gốc.
import { FACTOR_BY_CODE } from '../core/constants.js';
import { fmtInt, fmtPct, fmtScore, fmtSigned } from '../core/format.js';
import { isNum } from '../core/stats.js';

function builder() {
  const facts = [];
  return {
    facts,
    add(text, meta = {}) {
      const ma = `F${facts.length + 1}`;
      facts.push({ ma, noi_dung: text, ...meta });
      return ma;
    },
  };
}

const dimName = (code) => `${code} ${FACTOR_BY_CODE[code]?.short ?? ''}`.trim();

// ---- Lớp học phần (M2) -------------------------------------------------------------------
export function classFacts(d, cfg) {
  const b = builder();
  const cw = d.cw;
  const refs = {};
  refs.overall = b.add(
    `Chỉ số chất lượng ${fmtScore(cw.metrics.IDX.mean)}; TB Trường ${fmtScore(d.school.IDX.mean)}; ${fmtInt(cw.n)}/${fmtInt(cw.size)} phiếu hợp lệ`,
    { kind: 'overall', value: cw.metrics.IDX.mean, ref: d.school.IDX.mean },
  );
  const weakCodes = [...new Set(cw.reasons.filter((r) => r.rule !== 'decline').map((r) => r.code))];
  const weak = d.profile.filter((p) => weakCodes.includes(p.code)).sort((a, b) => a.mean - b.mean).slice(0, 2);
  refs.weak = weak.map((p) => {
    const z = p.z;
    const funnel = isNum(z) && z < -cfg.zRed ? `; thấp hơn giới hạn ${cfg.zRed}σ` : isNum(z) && z < -cfg.zYellow ? `; thấp hơn giới hạn ${cfg.zYellow}σ` : '';
    const below = p.mean < cfg.yellowDim ? `; ngưỡng ${fmtScore(cfg.yellowDim, 1)}` : '';
    return { code: p.code, mean: p.mean, ref: b.add(`${dimName(p.code)} ${fmtScore(p.mean)}${below}; TB Trường ${fmtScore(p.school)}${funnel}`, { kind: 'weak', code: p.code }), below: p.mean < cfg.yellowDim, funnel };
  });
  const drops = d.profile.filter((p) => isNum(p.delta) && p.delta <= -0.1).sort((a, b) => a.delta - b.delta);
  if (drops.length && d.prevWave) {
    const p = drops[0];
    refs.drop = { code: p.code, delta: p.delta, ref: b.add(`${dimName(p.code)} ${fmtScore(p.mean)}; giảm ${fmtScore(-p.delta)} so với đợt trước (${fmtScore(p.prev)})`, { kind: 'drop', code: p.code }) };
  }
  const decline = cw.reasons.find((r) => r.rule === 'decline');
  if (decline) refs.decline = b.add(decline.text, { kind: 'decline' });
  const best = [...d.profile].filter((p) => isNum(p.mean)).sort((a, b) => b.mean - a.mean)[0];
  if (best) refs.best = { code: best.code, mean: best.mean, ref: b.add(`${dimName(best.code)} ${fmtScore(best.mean)} – cao nhất trong 7 phương diện`, { kind: 'best', code: best.code }) };
  const theme = d.themes.items.find((t) => t.neg >= 2 && t.id !== 'khac');
  if (theme) refs.theme = { label: theme.label, n: theme.neg, factor: theme.factor, ref: b.add(`Chủ đề ý kiến nổi bật: ${theme.label} (${fmtInt(theme.neg)} ý kiến)`, { kind: 'theme' }) };
  return { facts: b.facts, refs };
}

// ---- Trường, khoa (M1) -------------------------------------------------------------------
export function scopeFacts(ov, cfg) {
  const b = builder();
  const refs = {};
  const k = ov.kpi;
  const x = k.index.value;
  const p = k.index.prev;
  refs.overall = {
    value: x,
    prev: p,
    ref: b.add(
      isNum(p)
        ? `Chỉ số chất lượng ${ov.scope} ${fmtScore(x)}; đợt trước ${fmtScore(p)}; thay đổi ${fmtSigned(x - p)}`
        : `Chỉ số chất lượng ${ov.scope} ${fmtScore(x)}; chưa có đợt trước để so sánh`,
      { kind: 'overall' },
    ),
  };
  if (k.low.n) refs.low = b.add(`Phiếu mức thấp ${fmtPct(k.low.value, 1)} (${fmtInt(k.low.k)}/${fmtInt(k.low.n)} phiếu)`, { kind: 'low' });
  refs.alerts = { ...k.alerts, ref: b.add(`${fmtInt(k.alerts.alert)} lớp can thiệp, ${fmtInt(k.alerts.warn)} lớp theo dõi, ${fmtInt(k.alerts.na)} lớp chưa đủ dữ liệu, trên ${fmtInt(k.alerts.total)} lớp có phiếu`, { kind: 'alerts' }) };
  const top = ov.pareto.rows.filter((r) => r.gap > 0);
  if (top.length) {
    const r = top[0];
    refs.pareto = {
      code: r.code,
      share: r.share,
      ref: b.add(`Pareto có trọng số: ${dimName(r.code)} ${fmtScore(r.mean)}, chiếm ${fmtPct(r.share)} tổng khoảng cách có trọng số`, { kind: 'pareto' }),
      second: top[1] ? { code: top[1].code, ref: b.add(`Pareto có trọng số: ${dimName(top[1].code)} ${fmtScore(top[1].mean)}, chiếm ${fmtPct(top[1].share)}`, { kind: 'pareto2' }) } : null,
    };
  }
  let low = null;
  for (const row of ov.heat.rows) for (const c of row.cells) if (isNum(c.mean) && (!low || c.mean < low.mean)) low = { ...c, row: row.label };
  if (low && low.mean < cfg.yellowDim) refs.heat = { ...low, ref: b.add(`${low.row}: ${dimName(low.code)} ${fmtScore(low.mean)} – ô thấp nhất của bản đồ nhiệt`, { kind: 'heat' }) };
  if (k.response.enrolled) refs.response = b.add(`Tỷ lệ phản hồi ${fmtPct(k.response.rate)} (${fmtInt(k.response.nValid)}/${fmtInt(k.response.enrolled)} sinh viên)`, { kind: 'response' });
  const theme = ov.themes.items.find((t) => t.neg >= 3 && t.id !== 'khac');
  if (theme) refs.theme = { label: theme.label, n: theme.neg, ref: b.add(`Chủ đề ý kiến nổi bật: ${theme.label} (${fmtInt(theme.neg)} ý kiến tiêu cực)`, { kind: 'theme' }) };
  return { facts: b.facts, refs };
}

// ---- Sinh viên (M3) ------------------------------------------------------------------------
export function studentFacts(res, cfg) {
  const b = builder();
  const rows = res.rows;
  const need = rows.filter((r) => r.status === 'alert' || r.status === 'warn');
  const kProc = rows.filter((r) => isNum(r.process) && r.process < cfg.stuProcYellow).length;
  const kEng = rows.filter((r) => isNum(r.eng) && r.eng < cfg.stuEngYellow).length;
  const both = rows.filter((r) => isNum(r.process) && r.process < cfg.stuProcYellow && isNum(r.eng) && r.eng < cfg.stuEngYellow).length;
  const done = need.filter((r) => r.contacted).length;
  const refs = {
    overall: b.add(`${fmtInt(rows.length)} sinh viên được liên kết điểm; ${fmtInt(res.counts.alert)} mức can thiệp; ${fmtInt(res.counts.warn)} mức theo dõi`, { kind: 'overall' }),
    reasons: b.add(`${fmtInt(kProc)} sinh viên có điểm quá trình dưới ${fmtScore(cfg.stuProcYellow, 1)}; ${fmtInt(kEng)} sinh viên có điểm gắn kết dưới ${fmtScore(cfg.stuEngYellow, 1)}`, { kind: 'reasons' }),
    both: both ? b.add(`${fmtInt(both)} sinh viên thấp ở cả hai chỉ số`, { kind: 'both' }) : null,
    contacted: need.length ? b.add(`${fmtInt(done)}/${fmtInt(need.length)} sinh viên cần hỗ trợ đã được đánh dấu "đã liên hệ"`, { kind: 'contacted' }) : null,
  };
  return { facts: b.facts, refs, stats: { kProc, kEng, both, done, need: need.length, total: rows.length, ...res.counts } };
}
