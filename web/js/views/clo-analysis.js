// M6 › Phân tích CLO: "CLO nào yếu, yếu ở tiêu chí, chương, dạng lỗi nào? Đề và chấm điểm có vấn đề không?"
// (nghiệp vụ 4, 5, 7). Ma trận câu hỏi × CLO là cấu trúc dữ liệu; cột và radar lấy số đã tổng hợp từ ma trận.
import { cloAnalysis, cloAssistantInput, cloTrace, semesterLabel } from '../api-clo.js';
import { fmtDate, fmtInt, fmtNum, fmtPct, fmtScore, fmtSigned } from '../core/format.js';
import { isNum } from '../core/stats.js';
import { state } from '../store.js';
import { MODES } from '../data/clo-catalog.js';
import { banner, chartCard, dataTable, emptyState, legend, openDialog, pageHead, plainCard, statusChip } from '../ui/components.js';
import { mountChart, theme } from '../ui/charts.js';
import { cloBarOption, cloRadarOption, errorParetoOption, itemMapOption, raterScatterOption } from '../ui/charts-clo.js';
import { html, on, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { cloFilterDefs, cloHash, cloMeta, cloPrepare, cloStatusChip, cloTabsNav, inProgressBanner, keepQuery, noRulesCard, pctOrDash, scopeLine } from './clo-common.js';

const VIEWS = [
  { id: '', label: 'CLO và sinh viên' },
  { id: 'chan-doan', label: 'Tiêu chí, chương, dạng lỗi' },
  { id: 'de-cham', label: 'Chất lượng đề và chấm' },
];

export const CloAnalysisView = {
  screen: 'M6',
  layout: 'assistant',
  title: (ctx) => `Phân tích CLO – ${ctx.data?.cls?.name ?? ''}`,
  filters: (ctx) => cloFilterDefs(ctx, 'phan-tich', ctx.query.xem === 'de-cham' ? ['ky', 'lop'] : ['ky', 'lop', 'clo', 'lan', 'bai']),
  meta: (ctx) => cloMeta(ctx.f2?.rv),
  prepare(ctx) {
    cloPrepare(ctx);
    const view = VIEWS.some((v) => v.id === ctx.query.xem) ? ctx.query.xem || 'clo' : 'clo';
    ctx.view = view;
    ctx.data = cloAnalysis(ctx.user, ctx.f2, { view });
  },
  render(ctx) {
    const d = ctx.data;
    const f = ctx.f2;
    if (d.empty) return html`${pageHead({ title: 'Phân tích CLO' })}${cloTabsNav(ctx, 'phan-tich')}${plainCard({ body: emptyState({ title: 'Chưa có lớp có dữ liệu CLO trong phạm vi' }) })}`;
    if (d.noRules) return html`${pageHead({ title: d.cls.name })}${cloTabsNav(ctx, 'phan-tich')}${noRulesCard(d.cls)}`;
    const cur = ctx.view === 'clo' ? '' : ctx.view;
    const seg = html`<div class="seg" role="group" aria-label="Nội dung phân tích">${VIEWS.map((v) => html`<a class="seg__item" href="${cloHash('phan-tich', { ...keepQuery(ctx), xem: v.id })}"${raw(v.id === cur ? ' aria-current="page"' : '')}>${v.label}</a>`)}</div>`;
    const body = ctx.view === 'chan-doan' ? diagnosisView(ctx, d) : ctx.view === 'de-cham' ? qualityView(ctx, d) : cloView(ctx, d);
    return html`${pageHead({
      crumbs: [{ label: 'Kết quả CLO', href: cloHash('lop', { ky: f.semesterId }) }, { label: d.cls.name, href: cloHash('tong-quan', keepQuery(ctx)) }, { label: 'Phân tích CLO' }],
      title: `Phân tích CLO – ${d.cls.name}`,
      question: `CLO nào yếu, yếu ở đâu, cần dạy lại hay luyện tập nội dung nào? · ${semesterLabel(d.cls.semesterId)}`,
    })}
      ${cloTabsNav(ctx, 'phan-tich')}
      ${seg}
      ${scopeLine(f, { n: ctx.view === 'de-cham' ? null : d.res.nActive, extra: ctx.view === 'de-cham' ? `đề thi chung của ${d.quality.cohortClasses.length} lớp cùng học kỳ` : '' })}
      ${inProgressBanner(d.res, d.rv, d.cls)}
      ${body}`;
  },
  mount(root, ctx) {
    const d = ctx.data;
    if (!d || d.empty || d.noRules) return;
    if (ctx.view === 'clo') {
      const bar = root.querySelector('#chart-clo-bar');
      if (bar) mountChart(bar, cloBarOption({ bars: d.bars, target: d.target }), { ariaLabel: `Tỷ lệ đạt theo CLO: ${d.bars.map((b) => `${b.code} ${b.notAssessed ? 'chưa đánh giá' : fmtPct(b.rate)}`).join(', ')}` });
      const radar = root.querySelector('#chart-clo-radar');
      if (radar) mountChart(radar, cloRadarOption({ bars: d.bars, target: d.target, showCourse: d.cohortN > 1 }), { ariaLabel: 'Radar hồ sơ tỷ lệ đạt CLO của lớp so với cả học phần và mục tiêu' });
      on(root, 'click', '[data-trace]', (e, btn) => {
        const [code, clo] = btn.dataset.trace.split('|');
        openTrace(ctx, d, code, clo);
      });
    }
    if (ctx.view === 'chan-doan') {
      const el = root.querySelector('#chart-clo-pareto');
      if (el && d.diag.pareto.rows.length) mountChart(el, errorParetoOption({ rows: d.diag.pareto.rows }), { ariaLabel: `Pareto dạng lỗi ${d.diag.clo}: ${d.diag.pareto.rows.slice(0, 3).map((r) => `${r.code} ${fmtPct(r.share)}`).join(', ')}` });
    }
    if (ctx.view === 'de-cham') {
      const map = root.querySelector('#chart-item-map');
      if (map) mountChart(map, itemMapOption({ rows: itemPoints(d), th: d.quality.ia.thresholds }), { ariaLabel: 'Bản đồ độ khó và độ phân biệt của câu hỏi, tiêu chí' });
      const rs = root.querySelector('#chart-rater');
      const row = raterFocus(d);
      if (rs && row) mountChart(rs, raterScatterOption({ points: row.points, max: row.max, tol: d.quality.raters.tol }), { ariaLabel: `Điểm hai cán bộ chấm câu ${row.code}` });
      on(root, 'click', '[data-show-all-mcq]', (e, btn) => {
        root.querySelectorAll('.mcq-ok').forEach((tr) => (tr.hidden = !tr.hidden));
        btn.textContent = btn.textContent.includes('Hiện') ? 'Chỉ câu cần xem lại' : 'Hiện tất cả câu trắc nghiệm';
      });
    }
  },
  assistant(ctx) {
    const d = ctx.data;
    if (!d || d.empty || d.noRules) return null;
    return { kind: 'clo', key: `${d.cls.id}|${ctx.f2.mode}|${ctx.user.id}`, title: d.cls.name, input: cloAssistantInput(d.cls.id, ctx.f2.mode) };
  },
};

// ---- CLO và sinh viên -----------------------------------------------------------------------------

function cloView(ctx, d) {
  const t = theme();
  const radarOk = d.bars.filter((b) => !b.notAssessed && isNum(b.rate)).length >= 3;
  return html`<div class="grid grid--2">
      ${chartCard({
        id: 'card-clo-bar',
        title: 'CLO nào mạnh, CLO nào yếu so với mục tiêu?',
        sub: `Tỷ lệ sinh viên đạt (trên số đủ minh chứng) · mục tiêu ${fmtPct(d.target)}`,
        legend: legend([{ kind: 'sq', color: t.ok, label: '✔ Đạt mục tiêu' }, { kind: 'sq', color: t.warn, label: '⚠ Dưới ≤ 10 điểm %' }, { kind: 'sq', color: t.alert, label: '✖ Dưới > 10 điểm %' }, { kind: 'dash', color: t.ink2, label: 'Mục tiêu' }]),
        chart: html`<div class="chart" id="chart-clo-bar"></div>`,
        table: barTable(d),
        howto: html`Cột và radar dùng <b>cùng một chỉ số</b> (tỷ lệ đạt %), lấy từ ma trận sinh viên × CLO bên dưới. Cột đọc số chính xác; radar cho hồ sơ tổng quan. Sinh viên chưa đủ minh chứng không tính vào mẫu số – xem số lượng ở bảng.`,
      })}
      ${chartCard({
        id: 'card-clo-radar',
        title: 'Hồ sơ CLO của lớp',
        sub: d.cohortN > 1 ? 'Lớp (đậm) so với cả học phần cùng học kỳ (xám) và mục tiêu (đứt)' : 'Lớp so với mục tiêu',
        legend: legend([{ kind: 'line', color: t.navy, label: 'Lớp' }, ...(d.cohortN > 1 ? [{ kind: 'line', color: t.grey, label: 'Cả học phần' }] : []), { kind: 'dash', color: t.ink2, label: 'Mục tiêu' }]),
        chart: radarOk ? html`<div class="chart" id="chart-clo-radar"></div>` : emptyState({ title: 'Radar cần ít nhất 3 CLO đã đánh giá', text: 'Học kỳ đang diễn ra – xem biểu đồ cột hoặc chọn học kỳ đã kết thúc.' }),
        table: barTable(d),
      })}
    </div>
    <div class="mt-16">${heatCard(ctx, d)}</div>`;
}

function barTable(d) {
  return dataTable({
    compact: true,
    columns: [
      { label: 'CLO', render: (b) => html`<b>${b.code}</b> ${b.short}` },
      { label: 'Đạt', num: true, render: (b) => (b.notAssessed ? '–' : `${b.nAchieved}/${b.n}`) },
      { label: 'Tỷ lệ', num: true, render: (b) => (b.notAssessed ? 'chưa đánh giá' : pctOrDash(b.rate)) },
      { label: 'Điểm CLO TB', num: true, render: (b) => fmtScore(b.mean) },
      { label: 'Chưa đủ MC', num: true, render: (b) => fmtInt(b.nInsufficient) },
      { label: 'Cả học phần', num: true, render: (b) => (b.course === null ? '–' : `${fmtPct(b.course)} (n ${b.courseN})`) },
    ],
    rows: d.bars,
  });
}

function heatCard(ctx, d) {
  const h = d.heat;
  const rv = d.rv;
  if (h.kind === 'student') {
    return plainCard({
      title: 'Sinh viên nào đang yếu ở CLO nào?',
      sub: `Ma trận sinh viên × CLO · ô là điểm CLO (thang 10) và trạng thái · sắp theo số CLO chưa đạt · bấm ô để xem điểm nguồn`,
      body: html`<div class="table-wrap heat-scroll"><table class="heat heat--clo">
          <caption class="sr-only">Điểm CLO của từng sinh viên</caption>
          <thead><tr><th scope="col">Mã nghiên cứu</th>${rv.clos.map((c) => html`<th scope="col" title="${c.text}">${c.code}</th>`)}<th scope="col">Ghi chú</th></tr></thead>
          <tbody>${h.rows.map(
            (r) => html`<tr><th scope="row">${r.label}${r.retaken ? html` <span class="caption" title="Có đánh giá lại">↻</span>` : ''}</th>${r.cells.map((c) => {
              const cls = { achieved: 'ok', not_achieved: 'alert', insufficient: 'na', not_assessed: 'blank' }[c.status];
              const ic = { achieved: '✔', not_achieved: '✖', insufficient: '–', not_assessed: '' }[c.status];
              return html`<td class="heat-cell heat-cell--${cls}${c.near ? ' is-near' : ''}">${c.status === 'not_assessed' ? html`<span class="sr-only">chưa đánh giá</span>` : html`<button type="button" class="heat-btn" data-trace="${r.id}|${c.code}" aria-label="${r.label} ${c.code}: ${c.status === 'insufficient' ? 'chưa đủ minh chứng' : fmtScore(c.score)}. Xem điểm nguồn"><span aria-hidden="true">${ic}</span>${c.status === 'insufficient' ? html`<span class="small"> thiếu</span>` : ` ${fmtScore(c.score, 1)}`}</button>`}</td>`;
            })}<td class="small heat-note">${r.notes.join(' · ')}</td></tr>`,
          )}</tbody></table></div>
        <p class="caption" style="margin-top:8px">✔ đạt · ✖ chưa đạt · – chưa đủ minh chứng (vắng, không nộp) · viền vàng: sát ngưỡng ±${fmtScore(state.cfg.cloNearBand ?? 0.5, 1)} · ↻ có đánh giá lại. Lượt xem dữ liệu cấp sinh viên được ghi vào nhật ký.</p>`,
      foot: html`<a href="${cloHash('ho-tro', keepQuery(ctx))}">${icon('arrowRight', { size: 16 })}Lập danh sách hỗ trợ từ ma trận này</a>`,
    });
  }
  return plainCard({
    title: 'Lớp nào đang yếu ở CLO nào?',
    sub: 'Ma trận lớp × CLO · ô là tỷ lệ sinh viên đạt · dữ liệu cấp sinh viên chỉ giảng viên phụ trách xem được',
    body: html`<div class="table-wrap"><table class="heat">
        <caption class="sr-only">Tỷ lệ đạt CLO của từng lớp</caption>
        <thead><tr><th scope="col">Lớp</th><th scope="col">n</th>${rv.clos.map((c) => html`<th scope="col" title="${c.text}">${c.code}</th>`)}</tr></thead>
        <tbody>${h.rows.map(
          (r) => html`<tr${raw(r.current ? ' class="is-current"' : '')}><th scope="row">${r.label}${r.inProgress ? ' *' : ''}</th><td class="n">${fmtInt(r.n)}</td>${r.cells.map((c) => html`<td class="heat-cell heat-cell--${c.status === 'none' ? 'blank' : c.status}">${c.status === 'none' ? html`<span class="caption">chưa ĐG</span>` : html`<span aria-hidden="true">${{ ok: '✔', warn: '⚠', alert: '✖', na: '–' }[c.status]}</span> ${pctOrDash(c.rate)}`}</td>`)}</tr>`,
        )}</tbody></table></div><p class="caption" style="margin-top:8px">* học kỳ đang diễn ra (tạm tính). Màu: ✔ đạt mục tiêu · ⚠ dưới mục tiêu ≤ 10 điểm % · ✖ dưới > 10 điểm %.</p>`,
  });
}

function openTrace(ctx, d, code, clo) {
  let t;
  try {
    t = cloTrace(ctx.user, d.cls.id, code, clo, ctx.f2.mode);
  } catch (e) {
    return;
  }
  const s = t.student?.clo[clo];
  openDialog({
    title: `Điểm nguồn – ${code} · ${clo}`,
    wide: true,
    body: html`<p class="small">${t.cls.name} · ${t.rv.cloByCode.get(clo)?.text ?? ''}</p>
      <p>${cloStatusChip(s?.status, { score: s?.score })} <span class="caption">bao phủ minh chứng ${pctOrDash(s?.cov)} · ngưỡng ${fmtScore(t.rv.rules.pass, 1)}</span></p>
      ${dataTable({
        compact: true,
        columns: [
          { label: 'Bài đánh giá', render: (r) => html`${r.item.aRef} · ${r.item.aName}<br><span class="caption">${MODES[r.item.mode]?.short ?? ''}${r.date ? ` · ${fmtDate(r.date)}` : ''}</span>` },
          { label: 'Câu/tiêu chí', render: (r) => html`<b>${r.item.code}</b> ${r.item.label}` },
          { label: 'Tỷ trọng trong CLO', num: true, render: (r) => fmtPct(r.weight, 1) },
          { label: 'Điểm', num: true, render: (r) => (isNum(r.points) ? `${fmtNum(r.points, 2)}/${fmtNum(r.item.max, 2)}` : '–') },
          { label: 'Lần · đề', render: (r) => (r.attempt ? `lần ${r.attempt}${r.form ? ` · ${r.form}` : ''}` : { absent: 'vắng/không nộp', banned: 'không đủ ĐK dự thi', missing: 'chưa có dữ liệu', not_held: 'chưa tổ chức', pending: 'chưa chấm' }[r.state] ?? '–') },
          { label: 'Chấm 2 vòng', render: (r) => (isNum(r.r1) ? `${fmtNum(r.r1, 2)} / ${fmtNum(r.r2, 2)}` : '–') },
          { label: 'Dạng lỗi', render: (r) => r.errors.join(', ') || '–' },
        ],
        rows: t.rows,
      })}
      <p class="caption">Điểm CLO = trung bình có trọng số (tỷ trọng = phần đóng góp của câu vào điểm học phần) trên các câu đã có điểm. Truy vết này đã được ghi vào nhật ký truy cập.</p>`,
  });
}

// ---- Tiêu chí, chương, dạng lỗi ---------------------------------------------------------------------

function diagnosisView(ctx, d) {
  const g = d.diag;
  const rows = g.items;
  const t = theme();
  const weakest = [...rows].filter((r) => r.row).sort((a, b) => a.row.p - b.row.p)[0];
  const par = g.pareto;
  const top = par.groups[0];
  return html`
    ${plainCard({
      title: `${g.clo} được đo bằng những câu hỏi, tiêu chí nào – yếu ở đâu?`,
      sub: `${g.cloInfo?.text ?? ''}`,
      body: html`${weakest ? html`<p class="small">Tiêu chí có tỷ lệ điểm thấp nhất: <b>${weakest.aName} › ${weakest.code} ${weakest.label}</b> – đạt trung bình ${fmtPct(weakest.row.p)} điểm tối đa; ${fmtPct(weakest.row.below)} sinh viên dưới một nửa số điểm.</p>` : ''}
        ${dataTable({
          compact: true,
          columns: [
            { label: 'Bài đánh giá', render: (r) => html`${r.aRef} · ${r.aName}<br><span class="caption">${MODES[r.mode]?.label ?? ''}</span>` },
            { label: 'Câu/tiêu chí', render: (r) => html`<b>${r.code}</b> ${r.label}` },
            { label: 'Chương', render: (r) => r.chapter ?? 'nhiều chương' },
            { label: 'Tỷ trọng trong CLO', num: true, render: (r) => fmtPct(r.share, 1) },
            { label: 'Điểm TB', num: true, render: (r) => (r.row ? `${fmtNum(r.row.mean, 2)}/${fmtNum(r.max, 2)}` : r.held ? '–' : 'chưa tổ chức') },
            { label: 'Tỷ lệ điểm đạt', render: (r) => (r.row ? pBar(r.row.p) : '–') },
            { label: 'SV dưới ½ điểm', num: true, render: (r) => (r.row ? fmtPct(r.row.below) : '–') },
            { label: 'n', num: true, render: (r) => (r.row ? fmtInt(r.row.n) : '–') },
          ],
          rows,
          rowClass: (r) => (r === weakest ? 'row-focus' : ''),
        })}`,
      foot: html`<span>Lần đánh giá đầu; câu trắc nghiệm gom thành một dòng – xem từng câu ở mục Chất lượng đề và chấm.</span>`,
    })}
    <div class="grid grid--60-40 grid--start mt-16">
      ${chartCard({
        id: 'card-clo-pareto',
        title: `Những dạng lỗi nào chiếm phần lớn số lượt lỗi? (${g.clo})`,
        sub: `Đơn vị đếm: lượt lỗi – ${fmtInt(par.total)} lượt lỗi của ${fmtInt(par.students)} sinh viên (một sinh viên có thể mắc nhiều lỗi)${ctx.f2.assessment ? ` · ${d.rv.aByCode.get(ctx.f2.assessment)?.name}` : ' · mọi bài đánh giá'} · lần đầu`,
        legend: legend([{ kind: 'sq', color: t.navy, label: 'Tỷ trọng lượt lỗi' }, { kind: 'line', color: t.gold, label: 'Cộng dồn' }]),
        chart: par.rows.length ? html`<div class="chart" id="chart-clo-pareto"></div>` : emptyState({ title: 'Chưa ghi nhận dạng lỗi', text: 'Dạng lỗi được ghi khi chấm bài tự luận, bài thực hành (cột ma_loi của tệp điểm).' }),
        table: dataTable({ compact: true, columns: [{ label: 'Mã', key: 'code' }, { label: 'Dạng lỗi', key: 'label' }, { label: 'Nhóm', key: 'group' }, { label: 'Lượt lỗi', num: true, render: (r) => fmtInt(r.count) }, { label: 'Sinh viên mắc', num: true, render: (r) => fmtInt(r.students) }, { label: 'Tỷ trọng', num: true, render: (r) => fmtPct(r.share, 1) }, { label: 'Cộng dồn', num: true, render: (r) => fmtPct(r.cumShare) }], rows: par.rows }),
        howto: html`<ul><li>Pareto xếp các dạng lỗi theo mức đóng góp thực tế trong nhóm vấn đề đã chọn (CLO, bài đánh giá, học kỳ). Không mặc định dữ liệu phải theo tỷ lệ 80/20.</li>
          <li>“50 lượt lỗi” không có nghĩa là 50 sinh viên – cột “Sinh viên mắc” cho biết số người.</li></ul>`,
      })}
      <div class="stack">
        ${plainCard({
          title: 'Theo nhóm lỗi',
          sub: top ? `Nhóm “${top.group}” chiếm ${fmtPct(top.share)} lượt lỗi của ${g.clo}` : '',
          body: par.groups.length ? html`<ul class="group-bars">${par.groups.map((x) => html`<li><span>${x.group}</span><span class="group-bars__track" aria-hidden="true"><span style="${raw(`width:${(x.share * 100).toFixed(1)}%`)}"></span></span><b>${fmtPct(x.share)}</b><span class="caption">${fmtInt(x.count)} lượt</span></li>`)}</ul>` : emptyState({ title: 'Chưa có dữ liệu' }),
          foot: d.studentLevel && top ? html`<a href="${cloHash('ho-tro', { ...keepQuery(ctx), clo: g.clo })}">${icon('arrowRight', { size: 16 })}Chọn nhóm sinh viên cần hỗ trợ ${top.group.toLowerCase()}</a>` : '',
        })}
        ${plainCard({
          title: 'Mức đạt theo chương',
          sub: 'Tỷ lệ điểm đạt được trên điểm tối đa của các câu thuộc chương (mọi bài, lần đầu)',
          body: g.chapters.length ? html`<ul class="group-bars">${g.chapters.map((ch) => html`<li><span title="${ch.name}">${ch.code}</span><span class="group-bars__track" aria-hidden="true"><span style="${raw(`width:${((ch.p ?? 0) * 100).toFixed(1)}%`)}"></span></span><b>${pctOrDash(ch.p)}</b><span class="caption">${ch.items} tiêu chí · ${ch.mcq} câu TN</span></li>`)}</ul><p class="caption">${g.chapters.map((c) => `${c.code}: ${c.name.replace(/^Chương \d+\. /, '')}`).join(' · ')}</p>` : emptyState({ title: 'Chưa có dữ liệu theo chương' }),
        })}
      </div>
    </div>`;
}

function pBar(p) {
  const st = p < 0.5 ? 'alert' : p < 0.65 ? 'warn' : 'ok';
  return html`<span class="pbar"><span class="pbar__track" aria-hidden="true"><span class="pbar__fill pbar__fill--${st}" style="${raw(`width:${(p * 100).toFixed(0)}%`)}"></span></span><span>${fmtPct(p)}</span></span>`;
}

// ---- Chất lượng đề và chấm --------------------------------------------------------------------------

function itemPoints(d) {
  const ia = d.quality.ia;
  return [
    ...ia.rows.filter((r) => !r.mcq && isNum(r.D)).map((r) => ({ ...r, title: `${r.aName} › ${r.code} ${r.label}`, short: r.code })),
    ...ia.mcqRows.filter((q) => isNum(q.D)).map((q) => ({ ...q, title: `Trắc nghiệm ${q.bankId} (${q.form}, câu ${q.position})`, short: q.bankId })),
  ];
}

function raterFocus(d) {
  const rows = d.quality.raters.rows.filter((r) => r.n);
  return [...rows].sort((a, b) => (b.over ?? 0) - (a.over ?? 0))[0] || null;
}

function qualityView(ctx, d) {
  const q = d.quality;
  const ia = q.ia;
  const t = theme();
  const hasExam = ia.mcqRows.length || q.raters.rows.some((r) => r.n);
  const flagged = (r) => r.flags.some((f) => f.level !== 'info');
  const mcqBad = ia.mcqRows.filter(flagged);
  const focus = raterFocus(d);
  const lec = q.lecturers;
  const pairs = [...new Set(q.raters.rows.flatMap((r) => r.points.map((p) => `${lec.get(p.m1) ?? p.m1} – ${lec.get(p.m2) ?? p.m2}`)))];
  return html`
    ${!hasExam ? banner({ kind: 'info', iconText: 'ℹ', title: 'Chưa có bài thi cuối kỳ trong học kỳ này', body: html`Phân tích câu trắc nghiệm và đối chiếu hai cán bộ chấm cần bài thi kết thúc học phần. Chọn học kỳ đã kết thúc, ví dụ <a href="${cloHash('phan-tich', { ky: 'HK1-2526', xem: 'de-cham' })}">HK1 2025–2026</a> hoặc <a href="${cloHash('phan-tich', { ky: 'HK2-2526', xem: 'de-cham' })}">HK2 2025–2026</a>.` }) : ''}
    <div class="grid grid--60-40 grid--start">
      ${chartCard({
        id: 'card-item-map',
        title: 'Câu hỏi nào quá dễ, quá khó, phân biệt kém?',
        sub: `${ia.rows.filter((r) => !r.mcq).length} tiêu chí tự luận/rubric · ${ia.mcqRows.length} lượt câu trắc nghiệm theo mã đề · lần đầu · ${q.cohortClasses.length} lớp`,
        legend: legend([{ kind: 'dot', color: t.navy, label: '● Đạt yêu cầu' }, { kind: 'dot', color: t.warn, label: '▲ ⚠ Cần xem lại' }]),
        chart: itemPoints(d).length ? html`<div class="chart chart--lg" id="chart-item-map"></div>` : emptyState({ title: 'Chưa có dữ liệu' }),
        table: itemTable(ia.rows.filter((r) => !r.mcq)),
        howto: html`<ul><li>Độ khó p = điểm trung bình / điểm tối đa (p cao = dễ). Độ phân biệt D = p của 27% sinh viên điểm cao nhất − p của 27% thấp nhất (theo tổng điểm bài).</li>
          <li>Ngưỡng xem lại (đổi ở M0 › Cấu hình): p > ${fmtNum(ia.thresholds.easy, 2)} quá dễ, p < ${fmtNum(ia.thresholds.hard, 2)} quá khó, D < ${fmtNum(ia.thresholds.disc, 2)} phân biệt kém; D âm thường do đáp án sai hoặc câu hỏi gây hiểu nhầm.</li>
          <li>Câu quá dễ vẫn có thể phù hợp nếu đo đúng chuẩn đầu ra mức thấp – đây là gợi ý rà soát, không phải kết luận.</li></ul>`,
      })}
      ${plainCard({
        title: 'Mã đề có tương đương không?',
        sub: 'Điểm trung bình theo mã đề của cùng bài (lần đầu, cùng học kỳ)',
        body: q.forms.length ? dataTable({ compact: true, columns: [{ label: 'Bài', key: 'assessment' }, { label: 'Mã đề', key: 'form' }, { label: 'n', num: true, render: (x) => fmtInt(x.n) }, { label: 'Điểm TB (thang 10)', num: true, render: (x) => fmtScore(x.mean) }], rows: q.forms }) : emptyState({ title: 'Bài chỉ có một mã đề' }),
        foot: html`<span>Chênh lệch lớn giữa các mã đề cùng bài gợi ý đề chưa tương đương – xem từng câu trắc nghiệm bên dưới.</span>`,
      })}
    </div>
    <div class="mt-16">${plainCard({
      title: 'Câu trắc nghiệm (ngân hàng câu hỏi): phương án sai thường gặp, độ phân biệt',
      sub: `${fmtInt(mcqBad.length)}/${fmtInt(ia.mcqRows.length)} lượt câu cần xem lại · tỷ lệ chọn từng phương án (✔ là đáp án ghi trong ngân hàng)`,
      actions: ia.mcqRows.length > mcqBad.length ? html`<button type="button" class="btn btn--sm" data-show-all-mcq>Hiện tất cả câu trắc nghiệm</button>` : '',
      body: ia.mcqRows.length
        ? html`<div class="table-wrap"><table class="table table--compact"><thead><tr><th scope="col">Câu</th><th scope="col">Đề · vị trí</th><th scope="col">Chương</th><th scope="col" class="n">n</th><th scope="col" class="n">p</th><th scope="col" class="n">D</th><th scope="col">Phương án (cả nhóm · 27% cao · 27% thấp)</th><th scope="col">Cần xem lại</th></tr></thead>
          <tbody>${ia.mcqRows.map((r) => html`<tr${raw(flagged(r) ? '' : ' class="mcq-ok" hidden')}><td><b>${r.bankId}</b></td><td>${r.form} · ${r.position}</td><td>${r.chapter}</td><td class="n">${fmtInt(r.n)}</td><td class="n">${fmtNum(r.p, 2)}</td><td class="n">${fmtSigned(r.D, 2)}</td>
            <td><span class="opt-bars">${r.options.map((o) => html`<span class="opt${o.key ? ' is-key' : ''}" title="${o.o}: ${fmtPct(o.share)} cả nhóm · ${fmtPct(o.top)} nhóm cao · ${fmtPct(o.bottom)} nhóm thấp"><span class="opt__l">${o.o}${o.key ? '✔' : ''}</span><span class="opt__track" aria-hidden="true"><span style="${raw(`width:${(o.share * 100).toFixed(0)}%`)}"></span></span><span class="opt__v">${fmtPct(o.share)}</span><span class="caption">${fmtPct(o.top)} · ${fmtPct(o.bottom)}</span></span>`)}</span></td>
            <td class="small">${r.flags.filter((x) => x.level !== 'info').map((x) => x.label).join('; ') || html`<span class="caption">${r.flags.map((x) => x.label).join('; ') || '–'}</span>`}</td></tr>`)}</tbody></table></div>`
        : emptyState({ title: 'Chưa có dữ liệu trắc nghiệm' }),
    })}</div>
    <div class="grid grid--60-40 grid--start mt-16">
      ${plainCard({
        title: 'Đối chiếu kết quả chấm giữa hai cán bộ chấm',
        sub: `Phần tự luận bài thi cuối kỳ chấm 2 vòng độc lập · dung sai ${fmtScore(q.raters.tol, 1)} điểm/câu · ${fmtInt(q.raters.nScripts)} bài · cặp chấm: ${pairs.join('; ') || '–'}`,
        body: q.raters.rows.some((r) => r.n)
          ? html`<div class="rater-table">${dataTable({
              compact: true,
              columns: [
                { label: 'Câu', render: (r) => html`<span title="${r.label}"><b>${r.code}</b><br><span class="caption">${r.label.replace(/^Tự luận câu \w+ – /, '').slice(0, 30)}${r.label.length > 30 ? '…' : ''}</span></span>` },
                { label: 'n', num: true, render: (r) => fmtInt(r.n) },
                { label: 'Lệch TB (vòng 2 − vòng 1)', num: true, render: (r) => fmtSigned(r.meanDiff, 2) },
                { label: 'Trùng khớp · lệch ≤ 0,25', num: true, render: (r) => `${fmtPct(r.exact)} · ${fmtPct(r.within)}` },
                { label: `Lệch > ${fmtNum(q.raters.tol, 1)}`, render: (r) => statusChip(r.over > 0.15 ? 'alert' : r.over > 0.05 ? 'warn' : 'ok', { label: `${fmtPct(r.over)} (${r.nOver})` }) },
                { label: 'r', num: true, render: (r) => fmtNum(r.r, 2) },
              ],
              rows: q.raters.rows,
            })}</div>
            ${q.ratersClass.scripts.length && d.studentLevel ? html`<p class="small" style="margin-top:8px"><b>Bài của lớp cần chấm thống nhất:</b> ${q.ratersClass.scripts.map((s) => `${s.s} (${s.diffs.filter((x) => Math.abs(x.d) > q.raters.tol).map((x) => `${x.code} ${fmtSigned(x.d, 2)}`).join(', ')})`).join('; ')}</p>` : q.ratersClass.scripts.length ? html`<p class="small" style="margin-top:8px">Lớp này có <b>${q.ratersClass.scripts.length}</b> bài lệch quá dung sai (danh sách bài chỉ giảng viên phụ trách xem được).</p>` : ''}`
          : emptyState({ title: 'Chưa có dữ liệu chấm 2 vòng', text: 'Nhập cột diem_cham_1, diem_cham_2 trong tệp điểm chi tiết.' }),
        foot: html`<span>Lệch TB âm: cán bộ chấm vòng 2 chặt hơn. Tỷ lệ bài lệch quá dung sai cao gợi ý cần đáp án chi tiết và chấm thử chung.</span>`,
      })}
      ${focus
        ? chartCard({
            id: 'card-rater',
            title: `Điểm hai vòng chấm – câu ${focus.code}`,
            sub: `Câu có tỷ lệ lệch cao nhất · bong bóng lớn = nhiều bài cùng cặp điểm · dải đứt ±${fmtNum(q.raters.tol, 1)}`,
            chart: html`<div class="chart" id="chart-rater"></div>`,
            table: dataTable({ compact: true, columns: [{ label: 'Vòng 1', num: true, render: (p) => fmtNum(p.a, 2) }, { label: 'Vòng 2', num: true, render: (p) => fmtNum(p.b, 2) }, { label: 'Điểm chốt', num: true, render: (p) => fmtNum(p.final, 2) }, { label: 'Lần', num: true, key: 't' }], rows: focus.points }),
          })
        : ''}
    </div>`;
}

function itemTable(rows) {
  return dataTable({
    compact: true,
    columns: [
      { label: 'Bài · câu/tiêu chí', render: (r) => html`${r.aName} › <b>${r.code}</b> ${r.label}` },
      { label: 'CLO', render: (r) => r.clos.join(', ') },
      { label: 'n', num: true, render: (r) => fmtInt(r.n) },
      { label: 'p', num: true, render: (r) => fmtNum(r.p, 2) },
      { label: 'D', num: true, render: (r) => fmtSigned(r.D, 2) },
      { label: 'r (câu – phần còn lại)', num: true, render: (r) => fmtNum(r.rit, 2) },
      { label: 'Cần xem lại', render: (r) => r.flags.filter((f) => f.level !== 'info').map((f) => f.label).join('; ') || '–' },
    ],
    rows,
  });
}
