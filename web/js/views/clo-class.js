// M6 › Tổng quan lớp: "Lớp đang đạt chuẩn đầu ra đến đâu?" (nghiệp vụ 4, 8).
// Phân bố điểm được quan sát như thực tế – hình dạng phân bố tự nó không chứng minh đề dễ hay chấm lỏng.
import { cloAssistantInput, cloOverview, semesterLabel } from '../api-clo.js';
import { fmtInt, fmtNum, fmtPct, fmtScore, fmtSigned } from '../core/format.js';
import { isNum } from '../core/stats.js';
import { state } from '../store.js';
import { chartCard, dataTable, emptyState, kpiTile, legend, pageHead, plainCard, statusChip } from '../ui/components.js';
import { mountChart, theme } from '../ui/charts.js';
import { cloBoxOption, cloHistogramOption, gapScatterOption } from '../ui/charts-clo.js';
import { html, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { cloFilterDefs, cloHash, cloMeta, cloPrepare, cloTabsNav, inProgressBanner, keepQuery, noRulesCard, pctOrDash, rateChip, scopeLine } from './clo-common.js';

const SURVEY_TEXT = {
  Q_C1_1: 'Mục tiêu và chuẩn đầu ra của học phần được công bố rõ ràng ngay từ đầu',
  Q_P1_1: 'Tiêu chí đánh giá được công bố rõ ràng từ đầu học phần',
  Q_P1_2: 'Hình thức đánh giá phù hợp với chuẩn đầu ra',
  Q_P1_4: 'Phản hồi của giảng viên về bài làm giúp tôi tiến bộ',
  Q_P1_5: 'Việc đánh giá công bằng, khách quan',
  Q_Pt1_1: 'Tôi đạt được chuẩn đầu ra của học phần',
};

export const CloClassView = {
  screen: 'M6',
  layout: 'assistant',
  title: (ctx) => `CLO – ${ctx.data?.cls?.name ?? 'Tổng quan lớp'}`,
  filters: (ctx) => cloFilterDefs(ctx, 'tong-quan', ['ky', 'lop', 'clo', 'lan', 'bai']),
  meta: (ctx) => cloMeta(ctx.f2?.rv),
  prepare(ctx) {
    cloPrepare(ctx);
    ctx.data = cloOverview(ctx.user, ctx.f2);
  },
  render(ctx) {
    const d = ctx.data;
    const f = ctx.f2;
    if (d.empty) return html`${pageHead({ title: 'Tổng quan lớp (CLO)' })}${cloTabsNav(ctx, 'tong-quan')}${plainCard({ body: emptyState({ title: 'Chưa có lớp có dữ liệu CLO trong phạm vi' }) })}`;
    if (d.noRules) return html`${pageHead({ title: d.cls.name })}${cloTabsNav(ctx, 'tong-quan')}${noRulesCard(d.cls)}`;
    const { res, rv } = d;
    const target = rv.rules.target;
    const lowest = d.lowest;
    const missing = res.students.filter((s) => s.missingWork.length || s.banned.length).length;
    const insufficient = res.students.filter((s) => s.nInsufficient).length;
    return html`${pageHead({
      crumbs: [{ label: 'Kết quả CLO', href: cloHash('lop', { ky: f.semesterId }) }, { label: d.cls.name }],
      title: d.cls.name,
      question: `Lớp đang đạt chuẩn đầu ra đến đâu? · ${semesterLabel(d.cls.semesterId)} · GV ${d.lecturer?.name ?? ''}`,
      actions: html`<a class="btn" href="${cloHash('bao-cao', { lop: d.cls.id })}">${icon('print')}Báo cáo học phần</a><a class="btn btn--primary" href="${cloHash('phan-tich', keepQuery(ctx))}">${icon('target')}Phân tích CLO</a>`,
    })}
      ${cloTabsNav(ctx, 'tong-quan')}
      ${scopeLine(f, { n: res.nActive, extra: res.withdrawn.length ? `${res.withdrawn.length} sinh viên rút học phần không tính` : '' })}
      ${inProgressBanner(res, rv, d.cls)}
      <div class="grid grid--kpi">
        ${kpiTile({ label: 'Thuộc diện đánh giá', value: fmtInt(res.nActive), caption: `${fmtInt(res.withdrawn.length)} rút học phần · bộ quy tắc ${rv.version}` })}
        ${kpiTile({ label: 'Đạt mọi CLO đã đánh giá', value: pctOrDash(res.all.rate), caption: `${fmtInt(res.all.nAchieved)}/${fmtInt(res.all.n)} sinh viên đủ minh chứng · mục tiêu ${fmtPct(target)} cho từng CLO` })}
        ${kpiTile({ label: 'CLO thấp nhất', value: lowest ? raw(`${lowest.code} <small>${fmtPct(lowest.rate)}</small>`) : '–', caption: lowest ? `${lowest.nAchieved}/${lowest.n} đạt · điểm CLO TB ${fmtScore(lowest.mean)} · mục tiêu ${fmtPct(target)}` : 'chưa có CLO được đánh giá' })}
        ${kpiTile({ label: 'Thiếu bài · chưa đủ minh chứng', value: `${fmtInt(missing)} · ${fmtInt(insufficient)}`, caption: html`sinh viên · <a href="${cloHash('ho-tro', keepQuery(ctx))}">${fmtInt(d.needs)} sinh viên cần hỗ trợ</a>` })}
      </div>
      <div class="grid grid--60-40 grid--start mt-16">
        ${cloProfileCard(d, f)}
        ${funnelCard(d, f)}
      </div>
      <div class="grid grid--2 mt-16">
        ${histCard(d)}
        ${boxCard(d)}
      </div>
      <div class="grid grid--2 grid--start mt-16">
        ${scatterCard(d)}
        ${surveyCard(d, f)}
      </div>`;
  },
  mount(root, ctx) {
    const d = ctx.data;
    if (!d || d.empty || d.noRules) return;
    const h = root.querySelector('#chart-clo-hist');
    if (h && d.metric.values.length) mountChart(h, cloHistogramOption({ bins: d.bins, label: d.metric.label, pass: d.metric.pass, near: d.metric.kind === 'clo' ? state.cfg.cloNearBand ?? 0.5 : 0 }), { ariaLabel: `Histogram ${d.metric.label} của ${d.metric.values.length} sinh viên; ngưỡng ${fmtScore(d.metric.pass, 1)}` });
    const b = root.querySelector('#chart-clo-box');
    if (b && d.boxes.some((x) => x.stats)) mountChart(b, cloBoxOption({ boxes: d.boxes, label: d.metric.label, pass: d.metric.pass }), { ariaLabel: `Box plot ${d.metric.label} của ${d.boxes.length} lớp cùng học phần` });
    const s = root.querySelector('#chart-clo-gap');
    if (s && d.scatter?.length) mountChart(s, gapScatterOption({ points: d.scatter, gap: state.cfg.cloGapFlag ?? 3 }), { ariaLabel: `Điểm quá trình và điểm thi của ${d.scatter.length} sinh viên; ${d.gaps.length} trường hợp chênh lệch lớn` });
  },
  assistant(ctx) {
    const d = ctx.data;
    if (!d || d.empty || d.noRules) return null;
    return { kind: 'clo', key: `${d.cls.id}|${ctx.f2.mode}|${ctx.user.id}`, title: d.cls.name, input: cloAssistantInput(d.cls.id, ctx.f2.mode) };
  },
};

// Hồ sơ CLO của lớp: thanh tỷ lệ đạt, vạch mục tiêu (HTML – đọc được bằng trình đọc màn hình).
function cloProfileCard(d, f) {
  const { res, rv } = d;
  const target = rv.rules.target;
  const t = theme();
  return plainCard({
    title: 'Tỷ lệ đạt theo CLO',
    sub: `Trên số sinh viên đủ minh chứng · vạch đứt là mục tiêu ${fmtPct(target)} · ${f.mode === 'initial' ? 'lần đánh giá đầu' : 'sau đánh giá lại'}`,
    body: html`${legend([{ kind: 'dash', color: t.ink2, label: `Mục tiêu ${fmtPct(target)}` }])}
      <div class="clo-bars" role="list">${rv.clos.map((c) => {
        const x = res.clo[c.code];
        const w = x.notAssessed || x.rate === null ? 0 : x.rate * 100;
        return html`<div class="clo-bar" role="listitem" aria-label="${c.code}: ${x.notAssessed ? 'chưa đánh giá' : `${fmtPct(x.rate)} đạt, n ${x.n}`}">
          <span class="clo-bar__label"><span class="code-tag code-tag--KQ">${c.code}</span><span class="clo-bar__name" title="${c.text}">${c.short ?? ''}</span></span>
          <span class="clo-bar__status">${rateChip(x)}</span>
          <span class="bullet__track" aria-hidden="true"><span class="clo-bar__fill clo-bar__fill--${x.notAssessed ? 'na' : x.status}" style="${raw(`width:${w}%`)}"></span><span class="bullet__mark bullet__mark--target" style="${raw(`left:${target * 100}%`)}"></span></span>
          <span class="clo-bar__value">${x.notAssessed ? '–' : fmtPct(x.rate)}</span>
          <span class="clo-bar__meta caption">${x.notAssessed ? 'chưa có bài đánh giá trong học kỳ' : `${x.nAchieved}/${x.n} đủ minh chứng đạt · điểm CLO TB ${fmtScore(x.mean)}${x.nInsufficient ? ` · ${x.nInsufficient} chưa đủ minh chứng` : ''}${res.inProgress ? ` · đã có ${fmtPct(x.heldShare)} minh chứng dự kiến` : ''}`}</span>
        </div>`;
      })}</div>`,
    foot: html`<details class="howto" style="margin:0;border:0;padding:0"><summary>Cách tính</summary><div class="howto__body">Điểm CLO (thang 10) của mỗi sinh viên là trung bình có trọng số các câu hỏi, tiêu chí gắn CLO đó (trọng số = phần đóng góp vào điểm học phần). Sinh viên “đạt” khi điểm CLO ≥ ${fmtScore(rv.rules.pass, 1)} và có ít nhất ${fmtPct(rv.rules.minEvidence)} minh chứng dự kiến; vắng thi, không nộp bài là “chưa có minh chứng”, không tính là 0. Mục tiêu ${fmtPct(target)} là mục tiêu của lớp, không phải giới hạn thống kê.</div></details>`,
  });
}

// Phễu minh chứng: thuộc diện đánh giá → đã nộp → đã chấm → đủ minh chứng → đạt.
function funnelCard(d, f) {
  const st = d.funnel.stages;
  const top = Math.max(1, st[0].n);
  return plainCard({
    title: 'Phễu minh chứng',
    sub: `${f.clo ? `${f.clo} – các bài đánh giá đo ${f.clo}` : 'Tất cả CLO đã có bài đánh giá'} · mỗi bước là tập con của bước trước`,
    body: html`<ol class="funnel" aria-label="Phễu minh chứng">${st.map(
      (s, i) => html`<li class="funnel__row">
        <span class="funnel__label">${s.label}</span>
        <span class="funnel__track"><span class="funnel__bar funnel__bar--${i === st.length - 1 ? 'end' : 'mid'}" style="${raw(`width:${Math.max(2, (s.n / top) * 100)}%`)}"><b>${fmtInt(s.n)}</b></span></span>
        <span class="funnel__pct">${fmtPct(s.n / top)}</span>
        ${s.lost ? html`<span class="funnel__lost">−${fmtInt(s.lost)} ${s.lostLabel}</span>` : s.note ? html`<span class="funnel__lost">${s.note}</span>` : ''}
      </li>`,
    )}</ol>`,
    foot: html`<a href="${cloHash('ho-tro', { ky: f.semesterId, lop: f.classId, clo: f.clo })}">${icon('arrowRight', { size: 16 })}Danh sách sinh viên ở từng bước</a>`,
  });
}

function histCard(d) {
  const m = d.metric;
  const below = m.values.filter((v) => v < m.pass - 1e-9).length;
  const near = m.kind === 'clo' ? m.values.filter((v) => Math.abs(v - m.pass) < (state.cfg.cloNearBand ?? 0.5) - 1e-9).length : null;
  const t = theme();
  return chartCard({
    id: 'card-clo-hist',
    title: 'Phân bố điểm',
    sub: `${m.label} · n = ${fmtInt(m.values.length)} · ${fmtInt(below)} dưới ngưỡng ${fmtScore(m.pass, 1)}${near !== null ? ` · ${fmtInt(near)} sát ngưỡng (±${fmtScore(state.cfg.cloNearBand ?? 0.5, 1)})` : ''}`,
    legend: legend([{ kind: 'sq', color: t.alert, label: '✖ Dưới ngưỡng' }, ...(m.kind === 'clo' ? [{ kind: 'sq', color: t.warn, label: '⚠ Sát ngưỡng' }] : []), { kind: 'sq', color: t.ok, label: '✔ Đạt ngưỡng' }, { kind: 'dash', color: t.ink2, label: 'Ngưỡng' }]),
    chart: m.values.length ? html`<div class="chart" id="chart-clo-hist"></div>` : emptyState({ title: 'Chưa có điểm', text: 'Chọn bài đánh giá hoặc CLO đã có điểm.' }),
    table: dataTable({ compact: true, caption: m.label, columns: [{ label: 'Khoảng điểm', render: (b) => `${fmtScore(b.x0, 1)} – ${b.x1 >= 10 ? '10' : `< ${fmtScore(b.x1, 1)}`}` }, { label: 'Số sinh viên', num: true, render: (b) => fmtInt(b.count) }, { label: 'So với ngưỡng', render: (b) => statusChip(b.status, { label: b.status === 'alert' ? 'Dưới ngưỡng' : b.status === 'warn' ? 'Sát ngưỡng' : 'Đạt' }) }], rows: d.bins.filter((b) => b.count) }),
    howto: html`<ul><li>Bộ lọc “CLO” vẽ phân bố điểm CLO; “Bài đánh giá” vẽ điểm bài; mặc định là điểm học phần (học kỳ đang diễn ra: điểm quá trình tạm tính).</li>
      <li>Hãy đọc phân bố như dữ liệu thực tế: nhiều sinh viên điểm cao có thể là đã đạt chuẩn; hình dạng biểu đồ tự nó không chứng minh đề dễ hay chấm lỏng – đối chiếu với tiêu chí và ma trận đánh giá.</li>
      <li>Chú ý nhóm sát ngưỡng (vùng vàng nhạt) và dấu hiệu hai nhóm kết quả tách biệt.</li></ul>`,
  });
}

function boxCard(d) {
  return chartCard({
    id: 'card-clo-box',
    title: 'So sánh lớp và học kỳ',
    sub: `${d.metric.label} · cùng học phần, cùng thang điểm · khung đậm là lớp đang xem · * tạm tính`,
    chart: d.boxes.some((b) => b.stats) ? html`<div class="chart" id="chart-clo-box"></div>` : emptyState({ title: 'Chưa có dữ liệu để so sánh' }),
    table: dataTable({
      compact: true,
      columns: [
        { label: 'Lớp', render: (b) => html`${b.current ? html`<b>${b.cls.name}</b>` : b.cls.name}<br><span class="caption">${b.label}</span>` },
        { label: 'n', num: true, render: (b) => fmtInt(b.n) },
        { label: 'Trung vị', num: true, render: (b) => fmtScore(b.stats?.median) },
        { label: 'Tứ phân vị', num: true, render: (b) => (b.stats ? `${fmtScore(b.stats.q1)} – ${fmtScore(b.stats.q3)}` : '–') },
        { label: 'Bộ quy tắc', render: (b) => html`${b.version}${b.comparable === false ? html` <span class="chip chip--warn">khác cấu trúc</span>` : ''}${b.inProgress ? html` <span class="chip chip--neutral">tạm tính</span>` : ''}` },
      ],
      rows: d.boxes,
    }),
    howto: html`<ul><li>Chỉ so sánh khi nội dung, chuẩn đánh giá và thang điểm tương đương: cùng bộ quy tắc (phiên bản đề cương), cùng cấu trúc bài đánh giá; luôn xem kèm sĩ số n.</li>
      <li>Hộp là khoảng tứ phân vị, vạch giữa là trung vị, râu tới 1,5 lần khoảng tứ phân vị; chấm rỗng là giá trị ngoại lai.</li>
      <li>Học kỳ đang diễn ra (*) chỉ có một phần bài đánh giá – không so trực tiếp với học kỳ đã kết thúc.</li></ul>`,
  });
}

function scatterCard(d) {
  const gap = state.cfg.cloGapFlag ?? 3;
  if (!d.studentLevel) {
    return plainCard({
      title: 'Điểm quá trình và điểm thi',
      sub: 'Mỗi điểm là một sinh viên – chỉ giảng viên phụ trách lớp xem được',
      body: html`<p class="small">${d.res.complete ? html`<b>${fmtInt(d.gaps.length)}</b> sinh viên có điểm thi chênh với điểm quá trình từ ${fmtScore(gap, 1)} điểm trở lên (trường hợp cần tìm hiểu, không phải kết luận).` : 'Học kỳ đang diễn ra – chưa có điểm thi cuối kỳ.'}</p>`,
    });
  }
  const t = theme();
  if (!d.scatter?.length) {
    return plainCard({ title: 'Điểm quá trình và điểm thi', body: emptyState({ title: 'Chưa có điểm thi cuối kỳ', text: 'Biểu đồ hiện khi lớp đã có điểm quá trình và điểm thi.' }) });
  }
  return chartCard({
    id: 'card-clo-gap',
    title: 'Điểm quá trình và điểm thi',
    sub: `Mỗi điểm là một sinh viên · ${fmtInt(d.scatter.length)} sinh viên · ${fmtInt(d.gaps.length)} trường hợp chênh ≥ ${fmtScore(gap, 1)} điểm`,
    legend: legend([{ kind: 'dot', color: t.navy, label: '● Sinh viên' }, { kind: 'dot', color: t.warn, label: '▲ ⚠ Chênh lệch lớn – cần xem lại' }, { kind: 'line', color: t.axis, label: 'Quá trình = thi' }]),
    chart: html`<div class="chart" id="chart-clo-gap"></div>`,
    table: dataTable({ compact: true, caption: 'Trường hợp chênh lệch lớn', emptyText: 'Không có trường hợp chênh lệch lớn', columns: [{ label: 'Mã nghiên cứu', key: 'code' }, { label: 'Quá trình', num: true, render: (g) => fmtScore(g.process, 1) }, { label: 'Thi', num: true, render: (g) => fmtScore(g.exam, 1) }, { label: 'Chênh', num: true, render: (g) => fmtSigned(g.diff, 1) }], rows: d.gaps }),
    howto: html`<ul><li>Điểm nằm gần đường chéo: kết quả quá trình và cuối kỳ nhất quán. Điểm ngoài dải đứt (chênh ≥ ${fmtScore(gap, 1)}) là trường hợp nên tìm hiểu – có thể do vắng, sự cố khi thi, hoặc bài quá trình chưa phản ánh đúng năng lực.</li>
      <li>Biểu đồ dùng để phát hiện trường hợp cần xem lại, không dùng để kết luận về một sinh viên.</li></ul>`,
  });
}

// Đối chiếu với khảo sát BL của cùng lớp (hai nguồn minh chứng: sinh viên cảm nhận – kết quả đo được).
function surveyCard(d, f) {
  const sv = d.survey;
  if (!sv) return plainCard({ title: 'Đối chiếu với khảo sát BL của lớp', body: emptyState({ title: 'Lớp chưa có đợt khảo sát trong học kỳ này' }) });
  const corr = sv.corr.filter((x) => x.n >= 8 && isNum(x.r));
  return plainCard({
    title: 'Đối chiếu với khảo sát BL của lớp',
    sub: `Đợt ${sv.waveLabel} · ${fmtInt(sv.n)} phiếu hợp lệ · cùng lớp, cùng mã nghiên cứu`,
    body: sv.hidden
      ? emptyState({ title: 'Chưa đủ phiếu để hiển thị', text: `Lớp có ${sv.n} phiếu hợp lệ, dưới ngưỡng ${state.cfg.nMin}.` })
      : html`<div class="kv-compare">
          <div><span class="caption">Sinh viên tự đánh giá “đạt chuẩn đầu ra” (Q_Pt1_1 ≥ 4)</span><b>${pctOrDash(sv.perceived)}</b></div>
          <div><span class="caption">Thực tế đạt mọi CLO đã đánh giá</span><b>${pctOrDash(sv.actual)}</b></div>
        </div>
        ${dataTable({
          compact: true,
          columns: [
            { label: 'Chỉ báo khảo sát liên quan CLO và đánh giá', render: (x) => html`${SURVEY_TEXT[x.code]}<br><span class="caption">${x.code}</span>` },
            { label: 'Lớp', num: true, render: (x) => fmtScore(x.mean) },
            { label: 'TB Trường', num: true, render: (x) => fmtScore(x.school) },
          ],
          rows: sv.items,
        })}
        ${corr.length ? html`<p class="small" style="margin-top:8px">Tương quan điểm gắn kết (khảo sát) với điểm CLO của sinh viên đồng ý liên kết: ${corr.map((x) => html`<b>${x.clo}</b> r = ${fmtNum(x.r, 2)} (n ${x.n})`).reduce((a, b) => html`${a} · ${b}`)}.</p>` : ''}`,
    foot: html`<a href="#/lop/${encodeURIComponent(d.cls.id)}">${icon('arrowRight', { size: 16 })}Hồ sơ 7 phương diện của lớp (M2)</a><span>PS1 “Đánh giá, phản hồi” của lớp ${fmtScore(sv.ps1)} · TB Trường ${fmtScore(sv.ps1School)}</span>`,
  });
}
