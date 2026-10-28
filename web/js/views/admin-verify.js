// M0 › Kiểm chứng (mục 8): TC1 ROC/AUC · TC2 Monte Carlo · TC3 SUS · TC4 giao diện chấm AI cho 2 chuyên gia.
import { classDetail, waveLabel } from '../api.js';
import { generate } from '../ai/generator.js';
import { DIMENSIONS, FACTOR_BY_CODE } from '../core/constants.js';
import { fmtInt, fmtNum, fmtPct, fmtScore } from '../core/format.js';
import { confusion, crossValidate, fitLogistic } from '../core/logistic.js';
import { simulateFalseAlarms } from '../core/montecarlo.js';
import { createRng } from '../core/rng.js';
import { cohenKappa, isNum, mean, sd } from '../core/stats.js';
import { SENTIMENTS, TOPIC_BY_ID } from '../data/topics.js';
import { grading, state, sus } from '../store.js';
import { chartCard, codeTag, dataTable, emptyState, legend, plainCard, statusChip, toast } from '../ui/components.js';
import { falseAlarmOption, mountChart, rocOption, theme } from '../ui/charts.js';
import { html, on, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { bindFactRefs, library } from './assistant.js';

const cache = new Map();
const memo = (key, fn) => {
  const k = `${state.version}:${key}`;
  if (!cache.has(k)) cache.set(k, fn());
  return cache.get(k);
};

const view = { expert: 'E1', set: 'summaries', index: 0, mcRuns: 2000 };

// ---- TC1 ----------------------------------------------------------------------------------
function tc1(semesterId) {
  return memo(`tc1:${semesterId}`, () => {
    const rows = state.mart.students.filter((s) => isNum(s.eng) && isNum(s.process) && s.low !== null && (!semesterId || s.semesterId === semesterId));
    if (rows.length < 40 || !rows.some((r) => r.low) || !rows.some((r) => !r.low)) return { rows, empty: true };
    const X = rows.map((r) => [r.eng, r.process]);
    const y = rows.map((r) => (r.low ? 1 : 0));
    const cv = crossValidate(X, y, { k: 10, rng: createRng(`tc1:${semesterId}`) });
    const model = fitLogistic(X, y);
    const conf = confusion(cv.oof, y, cv.youden.threshold);
    const ruleScores = rows.map((r) => (r.status === 'alert' || r.status === 'warn' ? 1 : 0));
    const rule = confusion(ruleScores, y, 0.5);
    return { rows, cv, model, conf, rule, prevalence: mean(y) };
  });
}

// ---- TC2 ----------------------------------------------------------------------------------
function tc2(waveId, runs, cfg = state.cfg) {
  return memo(`tc2:${waveId}:${runs}:${cfg.declineMin}:${cfg.declineEnabled}:${cfg.zRed}:${cfg.redDim}:${cfg.declineWaves}`, () => {
    const mart = state.mart;
    const pool = mart.validRows.filter((r) => r.waveId === waveId && isNum(r.IDX)).map((r) => Object.fromEntries([...DIMENSIONS, 'IDX'].map((m) => [m, r[m]])));
    const sizes = mart.byWave.get(waveId).classIds.map((id) => mart.classWave.get(`${id}|${waveId}`).n);
    return simulateFalseAlarms({ pool, sizes, cfg, rng: createRng(`tc2:${waveId}`), runs });
  });
}

// ---- TC3 ----------------------------------------------------------------------------------
export function susScore(answers) {
  let s = 0;
  answers.forEach((a, i) => (s += i % 2 === 0 ? a - 1 : 5 - a));
  return s * 2.5;
}

// ---- TC4: mẫu 50 bản tóm tắt và 200 ý kiến ---------------------------------------------------
function tc4Items() {
  return memo('tc4', () => {
    const mart = state.mart;
    const rng = createRng('tc4-sample');
    const cws = [...mart.classWave.values()].filter((cw) => !cw.hidden);
    const summaries = rng.sample(cws, 50).map((cw) => ({ id: `${cw.classId}|${cw.waveId}`, classId: cw.classId, waveId: cw.waveId }));
    const comments = rng.sample(mart.comments, 200).map((c) => ({ id: c.id, text: c.text, ai: { factor: c.nhan_to, sentiment: c.sac_thai, topic: c.chu_de } }));
    return { summaries, comments };
  });
}

function tc4Stats() {
  const { summaries, comments } = tc4Items();
  const g = grading.all();
  const per = {};
  for (const e of ['E1', 'E2']) {
    const sv = summaries.map((s) => g[e]?.summaries?.[s.id]?.verdict).filter(Boolean);
    const cv = comments.map((c) => ({ c, x: g[e]?.comments?.[c.id] })).filter((o) => o.x);
    per[e] = {
      sDone: sv.length,
      sCorrect: sv.filter((v) => v === 'dung').length,
      cDone: cv.length,
      cFactor: cv.filter((o) => o.x.factor === o.c.ai.factor).length,
      cSentiment: cv.filter((o) => o.x.sentiment === o.c.ai.sentiment).length,
      cBoth: cv.filter((o) => o.x.factor === o.c.ai.factor && o.x.sentiment === o.c.ai.sentiment).length,
    };
  }
  const both = comments.filter((c) => g.E1?.comments?.[c.id] && g.E2?.comments?.[c.id]);
  const kappa = both.length >= 5 ? cohenKappa(both.map((c) => g.E1.comments[c.id].factor), both.map((c) => g.E2.comments[c.id].factor)) : null;
  const sAll = per.E1.sDone + per.E2.sDone;
  const cAll = per.E1.cDone + per.E2.cDone;
  return {
    per,
    kappa,
    nBoth: both.length,
    summaryRate: sAll ? (per.E1.sCorrect + per.E2.sCorrect) / sAll : null,
    classRate: cAll ? (per.E1.cFactor + per.E2.cFactor) / cAll : null,
    nSummaries: summaries.length,
    nComments: comments.length,
  };
}

// ---- Giao diện ----------------------------------------------------------------------------------

export function renderVerifyTab(ctx) {
  const mart = state.mart;
  const cfg = state.cfg;
  const labeledSems = [...new Set(mart.students.filter((s) => s.low !== null).map((s) => s.semesterId))];
  const sem = labeledSems.includes(ctx.query.hk) ? ctx.query.hk : '';
  const t1 = tc1(sem);
  const wavesWithData = mart.waves.filter((w) => mart.byWave.get(w.id).school.n > 0);
  const waveId = wavesWithData.some((w) => w.id === ctx.query.dot_mc) ? ctx.query.dot_mc : wavesWithData[wavesWithData.length - 1]?.id;
  const runs = [1000, 2000, 5000, 10000].includes(Number(ctx.query.runs)) ? Number(ctx.query.runs) : view.mcRuns;
  const t2 = waveId ? tc2(waveId, runs) : null;
  const susList = sus.list();
  const susScores = susList.map((r) => r.score);
  const susMean = susScores.length ? mean(susScores) : null;
  const t4 = tc4Stats();
  const pass = (ok) => (ok === null ? statusChip('na', { label: 'Chưa đủ dữ liệu' }) : ok ? statusChip('ok', { label: 'Đạt' }) : statusChip('alert', { label: 'Chưa đạt' }));
  const auc = t1.empty ? null : t1.cv.auc;
  const t = theme();

  return html`
    <div class="score-board" role="list" aria-label="Tiêu chí đạt">
      <div class="score" role="listitem"><div class="score__code">TC1 · CẢNH BÁO SINH VIÊN</div><div class="score__value">${auc === null ? '–' : `AUC ${fmtScore(auc)}`}</div>${pass(auc === null ? null : auc >= 0.7)}<div class="caption">Ngưỡng AUC ≥ 0,70 (kiểm định chéo 10 lần)</div></div>
      <div class="score" role="listitem"><div class="score__code">TC2 · CẢNH BÁO LỚP</div><div class="score__value">${t2 ? fmtPct(t2.redRate, 1) : '–'}</div>${pass(t2 ? t2.redRate <= 0.05 : null)}<div class="caption">Báo động giả đỏ ≤ 5% (Monte Carlo)</div></div>
      <div class="score" role="listitem"><div class="score__code">TC3 · KHẢ DỤNG</div><div class="score__value">${susMean === null ? '–' : `SUS ${fmtNum(susMean, 1)}`}</div>${pass(susScores.length >= 10 ? susMean >= 70 : susScores.length ? susMean >= 70 : null)}<div class="caption">SUS ≥ 70 · ${fmtInt(susScores.length)}/10 – 12 người dùng</div></div>
      <div class="score" role="listitem"><div class="score__code">TC4 · ĐỘ CHÍNH XÁC AI</div><div class="score__value">${t4.summaryRate === null ? '–' : fmtPct(t4.summaryRate)} · ${t4.classRate === null ? '–' : fmtPct(t4.classRate)}</div>${pass(t4.summaryRate === null || t4.classRate === null ? null : t4.summaryRate >= 0.9 && t4.classRate >= 0.8)}<div class="caption">≥ 90% tóm tắt đúng · ≥ 80% phân loại trùng chuyên gia</div></div>
    </div>

    <h2 class="page-title" style="font-size:17px;margin:24px 0 10px">TC1 – Mô hình nguy cơ cấp sinh viên</h2>
    <div class="grid grid--2 grid--start">
      ${chartCard({
        id: 'card-roc',
        title: 'Đường ROC (dự báo ngoài mẫu)',
        sub: `Hồi quy logistic: kết quả thấp (điểm học phần < ${fmtScore(cfg.lowOutcome, 1)}) ~ điểm gắn kết + điểm quá trình`,
        actions: html`<label class="sr-only" for="tc1-sem">Học kỳ</label><select class="select" id="tc1-sem" data-q="hk" style="min-height:30px;font-size:13px"><option value="">Mọi học kỳ có điểm</option>${labeledSems.map((s) => html`<option value="${s}"${raw(s === sem ? ' selected' : '')}>${state.dataset.semesters.find((x) => x.id === s)?.label ?? s}</option>`)}</select>`,
        legend: legend([{ kind: 'line', color: t.navy, label: 'Mô hình logistic' }, { kind: 'dash', color: t.axis, label: 'Đoán ngẫu nhiên' }, { kind: 'dot', color: t.blue, label: 'Ngưỡng Youden' }]),
        chart: t1.empty ? emptyState({ title: 'Chưa đủ sinh viên có điểm học phần', text: 'Cần từ 40 sinh viên có cả điểm gắn kết, điểm quá trình và điểm học phần.' }) : html`<div class="chart" id="chart-roc"></div>`,
        table: t1.empty ? null : dataTable({ compact: true, columns: [{ label: 'Lần', num: true, render: (r) => r.i }, { label: 'AUC', num: true, render: (r) => fmtScore(r.auc) }], rows: t1.cv.foldAuc.map((a, i) => ({ i: i + 1, auc: a })) }),
      })}
      ${t1.empty
        ? plainCard({ title: 'Kết quả', body: emptyState({ title: 'Chưa có dữ liệu' }) })
        : plainCard({
            title: 'Kết quả kiểm định chéo 10 lần',
            body: html`<dl class="kv">
                <dt>Số sinh viên · tỷ lệ kết quả thấp</dt><dd>${fmtInt(t1.rows.length)} · ${fmtPct(t1.prevalence, 1)}</dd>
                <dt>AUC (ngoài mẫu)</dt><dd>${fmtScore(t1.cv.auc)} · các lần: ${fmtScore(Math.min(...t1.cv.foldAuc))} – ${fmtScore(Math.max(...t1.cv.foldAuc))} (SD ${fmtScore(sd(t1.cv.foldAuc))})</dd>
                <dt>Ngưỡng Youden</dt><dd>xác suất ≥ ${fmtPct(t1.cv.youden.threshold, 1)} (J = ${fmtScore(t1.cv.youden.j)})</dd>
                <dt>Độ nhạy · độ đặc hiệu</dt><dd>${fmtPct(t1.conf.sensitivity)} · ${fmtPct(t1.conf.specificity)} (PPV ${fmtPct(t1.conf.ppv)})</dd>
                <dt>Hệ số (thang gốc)</dt><dd>hằng số ${fmtNum(t1.model.intercept, 2)} · gắn kết ${fmtNum(t1.model.coef[0], 2)} · điểm quá trình ${fmtNum(t1.model.coef[1], 2)}</dd>
                <dt>Quy tắc ngưỡng hiện hành (🟡/🔴)</dt><dd>độ nhạy ${fmtPct(t1.rule.sensitivity)} · độ đặc hiệu ${fmtPct(t1.rule.specificity)}</dd>
              </dl>
              ${dataTable({
                compact: true,
                caption: 'Bảng nhầm lẫn tại ngưỡng Youden',
                columns: [{ label: '', key: 'k' }, { label: 'Thực tế: thấp', num: true, key: 'a' }, { label: 'Thực tế: đạt', num: true, key: 'b' }],
                rows: [
                  { k: 'Dự báo: nguy cơ', a: fmtInt(t1.conf.tp), b: fmtInt(t1.conf.fp) },
                  { k: 'Dự báo: không', a: fmtInt(t1.conf.fn), b: fmtInt(t1.conf.tn) },
                ],
              })}
              <p class="caption">Ngưỡng cảnh báo cuối cùng chọn theo đường ROC; trong học kỳ thí điểm chỉ kiểm chứng hồi cứu.</p>`,
          })}
    </div>

    <h2 class="page-title" style="font-size:17px;margin:24px 0 10px">TC2 – Báo động giả của cảnh báo đỏ cấp lớp</h2>
    <div class="grid grid--2 grid--start">
      ${t2
        ? chartCard({
            id: 'card-mc',
            title: 'Tỷ lệ báo động giả theo sĩ số lớp',
            sub: `${fmtInt(t2.runs)} lớp mô phỏng “không khác biệt” · phân bố điểm cá nhân và sĩ số của ${waveLabel(state.mart.waves.find((w) => w.id === waveId))}`,
            actions: html`<select class="select" data-q="dot_mc" aria-label="Đợt dùng để mô phỏng" style="min-height:30px;font-size:13px">${wavesWithData.map((w) => html`<option value="${w.id}"${raw(w.id === waveId ? ' selected' : '')}>${waveLabel(w, { short: true })}</option>`)}</select>
              <select class="select" data-q="runs" aria-label="Số lần mô phỏng" style="min-height:30px;font-size:13px">${[1000, 2000, 5000, 10000].map((n) => html`<option value="${n}"${raw(n === runs ? ' selected' : '')}>${fmtInt(n)} lần</option>`)}</select>`,
            chart: html`<div class="chart chart--sm" id="chart-mc"></div>`,
            table: dataTable({ compact: true, columns: [{ label: 'Sĩ số', render: (b) => `n ${b.label}` }, { label: 'Số lớp mô phỏng', num: true, render: (b) => fmtInt(b.runs) }, { label: 'Cảnh báo đỏ', num: true, render: (b) => fmtInt(b.alert) }, { label: 'Tỷ lệ', num: true, render: (b) => fmtPct(b.runs ? b.alert / b.runs : 0, 1) }], rows: t2.buckets }),
          })
        : plainCard({ body: emptyState({ title: 'Chưa có đợt để mô phỏng' }) })}
      ${t2
        ? plainCard({
            title: 'Kết quả và hiệu chỉnh ngưỡng',
            body: html`<dl class="kv">
                <dt>Tỷ lệ cảnh báo đỏ</dt><dd>${fmtPct(t2.redRate, 2)} · KTC 95% [${fmtPct(t2.ci.lo, 1)}; ${fmtPct(t2.ci.hi, 1)}]</dd>
                <dt>Tỷ lệ cảnh báo vàng</dt><dd>${fmtPct(t2.warnRate, 1)} (không thuộc TC2)</dd>
                <dt>Do dưới ${fmtScore(cfg.redDim, 1)}</dt><dd>${fmtInt(t2.byRule.below)} lớp</dd>
                <dt>Do dưới giới hạn ${cfg.zRed}σ</dt><dd>${fmtInt(t2.byRule.funnel)} lớp</dd>
                <dt>Do giảm liên tiếp ${cfg.declineWaves} đợt (≥ ${fmtScore(cfg.declineMin)})</dt><dd>${fmtInt(t2.byRule.decline)} lớp</dd>
              </dl>
              <div id="mc-compare" class="mt-16"></div>`,
            foot: html`<button type="button" class="btn btn--sm" data-mc-compare>${icon('play')}So sánh các mức “giảm tối thiểu”</button><span>Ba đợt độc lập giảm ngặt có xác suất 1/6 – cần ngưỡng tối thiểu để giữ báo động giả ≤ 5%.</span>`,
          })
        : ''}
    </div>

    <h2 class="page-title" style="font-size:17px;margin:24px 0 10px">TC3 – Khả dụng (SUS)</h2>
    ${plainCard({
      title: `Phiếu SUS trong ứng dụng · ${fmtInt(susScores.length)} phiếu`,
      sub: '10 – 12 người dùng làm tác vụ mẫu: (1) tìm lớp đỏ, (2) đọc lý do cảnh báo, (3) lập kế hoạch cải tiến – rồi trả lời phiếu SUS',
      actions: html`<a class="btn btn--sm btn--primary" href="#/sus">${icon('edit')}Mở phiếu SUS</a>`,
      body: susScores.length
        ? dataTable({
            compact: true,
            columns: [{ label: 'Thời điểm', render: (r) => new Date(r.time).toLocaleString('vi-VN') }, { label: 'Vai trò', key: 'roleLabel' }, { label: 'Điểm SUS', num: true, render: (r) => fmtNum(r.score, 1) }, { label: 'Góp ý', render: (r) => html`<span class="small">${r.comment || ''}</span>` }],
            rows: [...susList].reverse(),
          })
        : emptyState({ title: 'Chưa có phiếu SUS', text: 'Sau buổi thử nghiệm, người dùng mở “Phiếu khảo sát khả dụng (SUS)” ở chân trang.' }),
      foot: susScores.length ? html`<span>Trung bình ${fmtNum(susMean, 1)} · SD ${fmtNum(sd(susScores) ?? 0, 1)} · ${fmtInt(susScores.filter((x) => x >= 70).length)}/${fmtInt(susScores.length)} phiếu ≥ 70</span>${ctx.user.role === 'admin' ? html`<button type="button" class="btn btn--sm btn--danger" data-clear-sus>Xóa phiếu thử</button>` : ''}` : null,
    })}

    <h2 class="page-title" style="font-size:17px;margin:24px 0 10px">TC4 – Chấm độ chính xác AI (2 chuyên gia)</h2>
    ${tc4Panel(t4)}`;
}

function tc4Panel(t4) {
  const { summaries, comments } = tc4Items();
  const list = view.set === 'summaries' ? summaries : comments;
  view.index = Math.min(Math.max(0, view.index), list.length - 1);
  const g = grading.all()[view.expert] || { summaries: {}, comments: {} };
  const doneCount = list.filter((it) => (view.set === 'summaries' ? g.summaries[it.id] : g.comments[it.id])).length;
  const p = t4.per;
  return html`<div class="grid grid--60-40 grid--start">
    ${plainCard({
      title: 'Giao diện chấm',
      sub: `${view.set === 'summaries' ? `${t4.nSummaries} bản tóm tắt` : `${t4.nComments} ý kiến`} chọn ngẫu nhiên có hạt giống · đã chấm ${doneCount}/${list.length}`,
      actions: html`<div class="seg" role="group" aria-label="Chuyên gia">${['E1', 'E2'].map((e) => html`<button type="button" data-expert="${e}" aria-pressed="${view.expert === e}">Chuyên gia ${e.slice(1)}</button>`)}</div>`,
      body: html`<div class="seg" role="group" aria-label="Loại nội dung" style="margin-bottom:12px">
          <button type="button" data-set="summaries" aria-pressed="${view.set === 'summaries'}">Tóm tắt</button>
          <button type="button" data-set="comments" aria-pressed="${view.set === 'comments'}">Phân loại ý kiến</button>
        </div>
        <div id="grade-item" aria-live="polite"><div class="ai-skeleton"></div><div class="ai-skeleton"></div></div>`,
      foot: html`<button type="button" class="btn btn--sm" data-nav="-1">‹ Trước</button><span>Mục ${view.index + 1}/${list.length}</span><button type="button" class="btn btn--sm" data-nav="1">Sau ›</button><button type="button" class="btn btn--sm" data-nav="next-empty">Mục chưa chấm tiếp theo</button>`,
    })}
    ${plainCard({
      title: 'Kết quả chấm',
      body: dataTable({
        compact: true,
        columns: [
          { label: '', key: 'k' },
          { label: 'Chuyên gia 1', num: true, key: 'a' },
          { label: 'Chuyên gia 2', num: true, key: 'b' },
        ],
        rows: [
          { k: 'Tóm tắt đã chấm', a: fmtInt(p.E1.sDone), b: fmtInt(p.E2.sDone) },
          { k: 'Tóm tắt đúng', a: p.E1.sDone ? fmtPct(p.E1.sCorrect / p.E1.sDone) : '–', b: p.E2.sDone ? fmtPct(p.E2.sCorrect / p.E2.sDone) : '–' },
          { k: 'Ý kiến đã chấm', a: fmtInt(p.E1.cDone), b: fmtInt(p.E2.cDone) },
          { k: 'Trùng nhân tố', a: p.E1.cDone ? fmtPct(p.E1.cFactor / p.E1.cDone) : '–', b: p.E2.cDone ? fmtPct(p.E2.cFactor / p.E2.cDone) : '–' },
          { k: 'Trùng sắc thái', a: p.E1.cDone ? fmtPct(p.E1.cSentiment / p.E1.cDone) : '–', b: p.E2.cDone ? fmtPct(p.E2.cSentiment / p.E2.cDone) : '–' },
          { k: 'Trùng cả hai', a: p.E1.cDone ? fmtPct(p.E1.cBoth / p.E1.cDone) : '–', b: p.E2.cDone ? fmtPct(p.E2.cBoth / p.E2.cDone) : '–' },
        ],
      }),
      foot: html`<span>Độ đồng thuận giữa 2 chuyên gia về nhân tố (Cohen's κ): ${t4.kappa === null ? `cần từ 5 ý kiến cả hai cùng chấm (hiện ${t4.nBoth})` : fmtScore(t4.kappa)}</span>`,
    })}
  </div>`;
}

async function renderGradeItem(root, ctx) {
  const box = root.querySelector('#grade-item');
  if (!box) return;
  const { summaries, comments } = tc4Items();
  const g = grading.all()[view.expert] || { summaries: {}, comments: {} };
  if (view.set === 'summaries') {
    const it = summaries[view.index];
    const d = classDetail(ctx.user, it.classId, it.waveId);
    const res = await generate('class', { ...d, waveLabel: waveLabel(d.wave) }, { cfg: { ...state.cfg, aiEngine: 'template' }, library: library() });
    const cur = g.summaries[it.id];
    if (!box.isConnected) return;
    box.innerHTML = String(html`<div class="grade-card">
      <div><div class="caption" style="margin-bottom:6px"><b>${d.cls.name}</b> · ${waveLabel(d.wave)} · n = ${d.cw.n}</div>
        <ul class="facts-list">${res.facts.map((f) => html`<li><b>${f.ma}</b>: ${f.noi_dung}</li>`)}</ul></div>
      <div><span class="ai-label">${icon('sparkle', { size: 14 })}Do AI tạo – đối chiếu số liệu nguồn</span>
        <div class="ai-text" style="margin-top:8px">${raw(String(html`${res.text}`).replace(/\[(F\d+)\]/g, '<button type="button" class="fact-ref" data-fact="$1">$1</button>'))}</div>
        <div class="feedback" style="margin-top:12px">
          <button type="button" class="btn btn--sm${cur?.verdict === 'dung' ? ' btn--primary' : ''}" data-verdict="dung" aria-pressed="${cur?.verdict === 'dung'}">✔ Đúng</button>
          <button type="button" class="btn btn--sm${cur?.verdict === 'sai' ? ' btn--primary' : ''}" data-verdict="sai" aria-pressed="${cur?.verdict === 'sai'}">✖ Chưa đúng</button>
        </div>
        <div class="form-field" style="margin-top:8px"><label for="grade-note">Ghi chú của chuyên gia</label><input class="input" id="grade-note" value="${cur?.note ?? ''}" placeholder="Ý sai, thiếu, diễn đạt chưa trung tính…"></div>
      </div></div>`);
    bindFactRefs(box, res.facts);
  } else {
    const it = comments[view.index];
    const cur = g.comments[it.id];
    const factorOptions = [...DIMENSIONS, 'PT1', 'khac'];
    box.innerHTML = String(html`<blockquote class="quote" style="font-size:15px">“${it.text}”</blockquote>
      <p class="small" style="margin-top:10px">AI phân loại: ${it.ai.factor === 'khac' ? 'Khác' : html`${codeTag(it.ai.factor)} ${FACTOR_BY_CODE[it.ai.factor]?.short ?? ''}`} · ${SENTIMENTS[it.ai.sentiment]?.label} · chủ đề “${TOPIC_BY_ID[it.ai.topic]?.label ?? it.ai.topic}”</p>
      <div class="form-grid" style="margin-top:8px">
        <div class="form-field"><label for="g-factor">Nhân tố theo chuyên gia</label><select class="select" id="g-factor"><option value="">— Chọn —</option>${factorOptions.map((f) => html`<option value="${f}"${raw(cur?.factor === f ? ' selected' : '')}>${f === 'khac' ? 'Khác' : `${f} ${FACTOR_BY_CODE[f]?.short ?? ''}`}</option>`)}</select></div>
        <div class="form-field"><label for="g-sent">Sắc thái theo chuyên gia</label><select class="select" id="g-sent"><option value="">— Chọn —</option>${Object.values(SENTIMENTS).map((s) => html`<option value="${s.code}"${raw(cur?.sentiment === s.code ? ' selected' : '')}>${s.label}</option>`)}</select></div>
      </div>
      <div class="feedback"><button type="button" class="btn btn--sm" data-copy-ai>Giống AI</button><button type="button" class="btn btn--sm btn--primary" data-save-comment>Lưu và sang mục sau</button>${cur ? html`<span class="caption">Đã chấm</span>` : ''}</div>`);
  }
}

export function mountVerifyTab(root, ctx) {
  const mart = state.mart;
  const cfg = state.cfg;
  const labeledSems = [...new Set(mart.students.filter((s) => s.low !== null).map((s) => s.semesterId))];
  const sem = labeledSems.includes(ctx.query.hk) ? ctx.query.hk : '';
  const t1 = tc1(sem);
  const roc = root.querySelector('#chart-roc');
  if (roc && !t1.empty) {
    const step = Math.max(1, Math.floor(t1.cv.roc.length / 300));
    const pts = t1.cv.roc.filter((_, i) => i % step === 0 || i === t1.cv.roc.length - 1);
    mountChart(roc, rocOption({ points: pts, youden: t1.cv.youden }), { ariaLabel: `Đường ROC, AUC ${fmtScore(t1.cv.auc)}` });
  }
  const wavesWithData = mart.waves.filter((w) => mart.byWave.get(w.id).school.n > 0);
  const waveId = wavesWithData.some((w) => w.id === ctx.query.dot_mc) ? ctx.query.dot_mc : wavesWithData[wavesWithData.length - 1]?.id;
  const runs = [1000, 2000, 5000, 10000].includes(Number(ctx.query.runs)) ? Number(ctx.query.runs) : view.mcRuns;
  const mcEl = root.querySelector('#chart-mc');
  if (mcEl && waveId) mountChart(mcEl, falseAlarmOption({ buckets: tc2(waveId, runs).buckets }), { ariaLabel: 'Tỷ lệ báo động giả theo nhóm sĩ số' });

  on(root, 'change', '[data-q]', (e, el) => ctx.navigate({ ...ctx.query, [el.dataset.q]: el.value }));
  on(root, 'click', '[data-mc-compare]', () => {
    const out = root.querySelector('#mc-compare');
    out.innerHTML = '<span class="caption">Đang mô phỏng…</span>';
    setTimeout(() => {
      const rows = [0, 0.2, 0.3, 0.4, 0.5].map((dm) => {
        const r = tc2(waveId, 2000, { ...cfg, declineMin: dm });
        return { dm, red: r.redRate, decline: r.byRule.decline, cur: Math.abs(dm - cfg.declineMin) < 1e-9 };
      });
      out.innerHTML = String(dataTable({
        compact: true,
        caption: 'Tỷ lệ báo động giả đỏ theo “tổng mức giảm tối thiểu” (2.000 lần mỗi mức)',
        columns: [{ label: 'Giảm tối thiểu', render: (r) => html`${fmtScore(r.dm)}${r.cur ? ' (hiện hành)' : ''}` }, { label: 'Báo động giả đỏ', num: true, render: (r) => fmtPct(r.red, 1) }, { label: 'TC2', render: (r) => (r.red <= 0.05 ? statusChip('ok', { label: 'Đạt' }) : statusChip('alert', { label: 'Chưa đạt' })) }],
        rows,
      }));
    }, 20);
  });
  on(root, 'click', '[data-clear-sus]', () => {
    if (!confirm('Xóa toàn bộ phiếu SUS trong trình duyệt này?')) return;
    sus.clear();
    ctx.route();
  });
  // TC4
  on(root, 'click', '[data-expert]', (e, b) => {
    view.expert = b.dataset.expert;
    ctx.route();
  });
  on(root, 'click', '[data-set]', (e, b) => {
    view.set = b.dataset.set;
    view.index = 0;
    ctx.route();
  });
  on(root, 'click', '[data-nav]', (e, b) => {
    const { summaries, comments } = tc4Items();
    const list = view.set === 'summaries' ? summaries : comments;
    if (b.dataset.nav === 'next-empty') {
      const g = grading.all()[view.expert] || { summaries: {}, comments: {} };
      const store = view.set === 'summaries' ? g.summaries : g.comments;
      const idx = list.findIndex((it, i) => i > view.index && !store[it.id]);
      const first = list.findIndex((it) => !store[it.id]);
      view.index = idx >= 0 ? idx : first >= 0 ? first : view.index;
    } else view.index = (view.index + Number(b.dataset.nav) + list.length) % list.length;
    ctx.route();
  });
  on(root, 'click', '[data-verdict]', (e, b) => {
    const { summaries } = tc4Items();
    const it = summaries[view.index];
    grading.set(view.expert, 'summaries', it.id, { verdict: b.dataset.verdict, note: root.querySelector('#grade-note')?.value ?? '', time: new Date().toISOString() });
    toast(b.dataset.verdict === 'dung' ? 'Đã chấm: đúng' : 'Đã chấm: chưa đúng');
    view.index = Math.min(view.index + 1, summaries.length - 1);
    ctx.route();
  });
  on(root, 'click', '[data-copy-ai]', () => {
    const it = tc4Items().comments[view.index];
    root.querySelector('#g-factor').value = it.ai.factor;
    root.querySelector('#g-sent').value = it.ai.sentiment;
  });
  on(root, 'click', '[data-save-comment]', () => {
    const { comments } = tc4Items();
    const it = comments[view.index];
    const factor = root.querySelector('#g-factor').value;
    const sentiment = root.querySelector('#g-sent').value;
    if (!factor || !sentiment) return toast('Chọn nhân tố và sắc thái trước khi lưu');
    grading.set(view.expert, 'comments', it.id, { factor, sentiment, time: new Date().toISOString() });
    view.index = Math.min(view.index + 1, comments.length - 1);
    ctx.route();
  });
  renderGradeItem(root, ctx);
}
