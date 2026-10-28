// M1 – Tổng quan Trường, khoa: "Kỳ này chất lượng ở đâu, ai cần chú ý?"
import { canSee } from '../access.js';
import { metricName, overview, waveLabel } from '../api.js';
import { DIMENSIONS, FACTOR_BY_CODE, GROUPS, STATUS } from '../core/constants.js';
import { fmtInt, fmtNum, fmtPct, fmtScore, fmtSigned } from '../core/format.js';
import { isNum } from '../core/stats.js';
import { load, save, state } from '../store.js';
import { banner, chartCard, codeTag, dataTable, delta, emptyState, kpiTile, legend, pageHead, plainCard, sparkline, statusChip } from '../ui/components.js';
import { funnelOption, groupColor, histogramOption, ipaOption, mountChart, paretoOption, theme, trendOption } from '../ui/charts.js';
import { html, isMobile, on, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { filterMeta, standardFilterDefs } from './shell.js';

const STATUS_LEGEND = () => {
  const t = theme();
  return [
    { kind: 'dot', color: t.ok, label: '● ✔ Đạt' },
    { kind: 'dot', color: t.warn, label: '▲ ⚠ Theo dõi' },
    { kind: 'dot', color: t.alert, label: '◆ ✖ Can thiệp' },
  ];
};

export const OverviewView = {
  screen: 'M1',
  layout: 'assistant',
  filters: (ctx) => standardFilterDefs(ctx, ['ky', 'dot', 'khoa', 'hp', 'cs']),
  meta: (ctx) => filterMeta(ctx, state.mart.waves.find((w) => w.id === ctx.f.waveId)),

  prepare(ctx) {
    ctx.data = overview(ctx.user, ctx.f);
  },

  render(ctx) {
    const d = ctx.data;
    const { cfg } = state;
    if (d.empty) {
      return html`${pageHead({ title: 'Tổng quan Trường', question: 'Kỳ này chất lượng ở đâu, ai cần chú ý?' })}
        ${plainCard({ body: emptyState({ title: 'Chưa có đợt đánh giá', text: 'Nhập phiếu khảo sát ở M0 › Nhập dữ liệu rồi công bố đợt.' }) })}`;
    }
    const lk = state.dataset;
    const crumbs = [{ label: 'Trường', href: navHref(ctx, { khoa: '', hp: '' }) }];
    if (ctx.f.facultyId) crumbs.push({ label: lk.faculties.find((x) => x.id === ctx.f.facultyId)?.name, href: navHref(ctx, { hp: '' }) });
    if (ctx.f.courseId) crumbs.push({ label: lk.courses.find((x) => x.id === ctx.f.courseId)?.name });
    if (crumbs.length === 1) crumbs[0] = { label: 'Trường' };
    const k = d.kpi;
    const mName = metricName(d.funnel.metric);
    const welcome = !load('welcome-dismissed', false);
    return html`
      ${pageHead({
        crumbs,
        title: `Tổng quan – ${d.scope}`,
        question: `Kỳ này chất lượng ở đâu, ai cần chú ý? · ${waveLabel(d.wave)}`,
        actions: html`<button type="button" class="btn" data-print>${icon('print')}In báo cáo</button>`,
      })}
      ${welcome
        ? banner({
            kind: 'info',
            title: 'Chào mừng đến bản MVP',
            iconText: '👋',
            body: html`Toàn bộ số liệu là <b>dữ liệu mô phỏng</b> có “kịch bản” để trình diễn.${ctx.account?.role === 'admin' ? html` Bấm vào tên ở góc phải trên cùng › <b>Xem thử dưới vai trò</b> để xem dashboard theo phạm vi của từng nhóm người dùng.` : ''} Mỗi biểu đồ có <b>Cách đọc</b> và <b>Xem dạng bảng</b>.`,
            actions: html`<button type="button" class="btn btn--sm" data-dismiss-welcome>Đã hiểu</button>`,
          })
        : ''}
      ${d.wave.status !== 'published'
        ? banner({
            kind: 'warn',
            title: 'Đợt này chưa công bố',
            iconText: '⚠',
            body: 'Chỉ Phòng QLCL và nhóm quản trị xem được. Công bố đợt sẽ gửi thông báo cho khoa, giảng viên có lớp cảnh báo (mục 6.1).',
            actions: html`<a class="btn btn--sm btn--primary" href="#/quan-tri/du-lieu">Đến trang công bố</a>`,
          })
        : ''}
      <div class="grid grid--kpi" aria-label="Thẻ trạng thái">
        ${kpiTile({
          label: 'Chỉ số chất lượng',
          value: fmtScore(k.index.value),
          deltaHtml: delta(isNum(k.index.prev) ? k.index.value - k.index.prev : null, { label: 'so với đợt trước' }),
          caption: `n = ${fmtInt(k.index.n)} phiếu · thang 1 – 5 · mục tiêu T = ${fmtScore(cfg.target, 1)}`,
          spark: sparkline(k.index.series.map((p) => p.value), { label: `Xu hướng chỉ số chất lượng qua ${k.index.series.length} đợt` }),
        })}
        ${kpiTile({
          label: 'Phiếu mức thấp',
          value: fmtPct(k.low.value, 1),
          deltaHtml: delta(isNum(k.low.prev) && isNum(k.low.value) ? (k.low.value - k.low.prev) * 100 : null, { goodWhen: 'down', digits: 1, unit: ' điểm %', label: 'so với đợt trước' }),
          caption: `${fmtInt(k.low.k)}/${fmtInt(k.low.n)} phiếu có chỉ số < ${fmtScore(cfg.levelLow, 1)}`,
        })}
        ${kpiTile({
          label: 'Lớp cần chú ý',
          value: raw(`<span class="kpi__alerts"><span class="status-count">${fmtInt(k.alerts.warn)} ${statusChip('warn')}</span><span class="status-count">${fmtInt(k.alerts.alert)} ${statusChip('alert')}</span></span>`),
          caption: `trên ${fmtInt(k.alerts.total)} lớp có phiếu · ${fmtInt(k.alerts.na)} lớp chưa đủ dữ liệu (< ${cfg.nMin} phiếu)`,
        })}
        ${kpiTile({
          label: 'Tỷ lệ phản hồi',
          value: fmtPct(k.response.rate),
          caption: `${fmtInt(k.response.nValid)}/${fmtInt(k.response.enrolled)} sinh viên có phiếu hợp lệ · ${fmtInt(k.response.nTotal)} phiếu nhận`,
        })}
      </div>

      <div class="grid grid--2 mt-16">
        ${isMobile() ? classListCard(ctx, d) : funnelCard(ctx, d, mName)}
        ${heatCard(ctx, d)}
      </div>
      <div class="grid grid--2 mt-16">
        ${paretoCard(d)}
        ${ipaCard(d)}
      </div>
      <div class="grid grid--2 mt-16">
        ${histogramCard(d, mName)}
        ${trendCard(d, mName)}
      </div>
      <div class="mt-16">${themesCard(d)}</div>`;
  },

  mount(root, ctx) {
    const d = ctx.data;
    if (d.empty) return;
    const { cfg } = state;
    const mName = metricName(d.funnel.metric);
    if (!isMobile()) {
      const el = root.querySelector('#chart-funnel');
      if (el && d.funnel.points.length) {
        mountChart(el, funnelOption({ points: d.funnel.points, mu: d.funnel.mu, sigma: d.funnel.sigma, metricName: mName, nMin: cfg.nMin, zYellow: cfg.zYellow, zRed: cfg.zRed }), {
          ariaLabel: `Biểu đồ phễu ${mName}: ${d.funnel.points.length} lớp; ${d.funnel.points.filter((p) => p.status === 'alert').length} lớp can thiệp, ${d.funnel.points.filter((p) => p.status === 'warn').length} lớp theo dõi. Xem dạng bảng để đọc từng lớp.`,
          onClick: (p) => {
            const pt = p.data?.p;
            if (pt?.canOpen) location.hash = `#/lop/${encodeURIComponent(pt.classId)}?dot=${ctx.f.dot}`;
          },
        });
      }
    }
    const pareto = root.querySelector('#chart-pareto');
    if (pareto && d.pareto.rows.some((r) => r.gap > 0)) {
      mountChart(pareto, paretoOption({ rows: d.pareto.rows, target: cfg.target }), { ariaLabel: `Pareto có trọng số: ${d.pareto.rows.slice(0, 3).map((r) => `${r.code} ${fmtPct(r.share)}`).join(', ')}` });
    }
    const ipa = root.querySelector('#chart-ipa');
    if (ipa) mountChart(ipa, ipaOption({ points: d.ipa, xCut: 1 / DIMENSIONS.length, yCut: cfg.yellowDim }), { ariaLabel: 'Ma trận tầm quan trọng – mức đạt của 7 phương diện' });
    const hist = root.querySelector('#chart-hist');
    if (hist && d.histogram.n) mountChart(hist, histogramOption({ bins: d.histogram.bins, metricName: mName }), { ariaLabel: `Histogram ${mName} của ${d.histogram.n} phiếu` });
    const trend = root.querySelector('#chart-trend');
    if (trend && d.trend.school.length) {
      mountChart(trend, trendOption({ school: d.trend.school, scope: d.trend.scope, control: d.trend.control, scopeName: d.scope, metricName: mName }), { ariaLabel: `Xu hướng ${mName} qua ${d.trend.school.length} đợt` });
    }
    on(root, 'click', '[data-dismiss-welcome]', (e, btn) => {
      save('welcome-dismissed', true);
      btn.closest('.banner').remove();
    });
    on(root, 'click', '[data-print]', () => window.print());
    on(root, 'click', '[data-theme]', (e, btn) => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      root.querySelector(`#${btn.getAttribute('aria-controls')}`).hidden = open;
    });
  },

  assistant(ctx) {
    const d = ctx.data;
    if (d.empty || !isNum(d.kpi.index.value)) return null;
    return {
      kind: 'scope',
      key: `${ctx.f.waveId}|${ctx.f.facultyId}|${ctx.f.courseId}|${ctx.user.id}`,
      title: d.scope,
      input: { ...d, waveLabel: waveLabel(d.wave) },
    };
  },
};

function navHref(ctx, patch) {
  const q = { ky: ctx.f.semesterId, dot: ctx.f.dot, khoa: ctx.f.facultyId, hp: ctx.f.courseId, cs: ctx.f.metric === 'IDX' ? '' : ctx.f.metric, ...patch };
  const s = Object.entries(q).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `#/tong-quan${s ? `?${s}` : ''}`;
}

// ---- Biểu đồ phễu ----------------------------------------------------------------------
function funnelCard(ctx, d, mName) {
  const { cfg } = state;
  const t = theme();
  const pts = [...d.funnel.points].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const table = dataTable({
    caption: `Các lớp sắp theo z (${mName}); μ = ${fmtScore(d.funnel.mu)}, σ = ${fmtScore(d.funnel.sigma)}`,
    compact: true,
    columns: [
      { label: 'Lớp học phần', render: (p) => (p.canOpen ? html`<a href="#/lop/${encodeURIComponent(p.classId)}?dot=${ctx.f.dot}">${p.name}</a>` : p.name) },
      { label: 'Khoa', key: 'faculty' },
      { label: 'n', num: true, render: (p) => fmtInt(p.n) },
      { label: mName, num: true, render: (p) => fmtScore(p.mean) },
      { label: 'z', num: true, render: (p) => fmtSigned(p.z) },
      { label: 'Trạng thái lớp', render: (p) => statusChip(p.status) },
    ],
    rows: pts,
  });
  return chartCard({
    id: 'card-funnel',
    title: 'Lớp nào bất thường?',
    sub: `Biểu đồ phễu – ${mName} · mỗi chấm là 1 lớp · ${d.funnel.points.length} lớp${d.funnel.points.some((p) => p.canOpen) ? ' · bấm chấm để mở lớp' : ''}`,
    legend: legend([...STATUS_LEGEND(), { kind: 'line', color: t.navy, label: 'μ toàn Trường' }, { kind: 'dash', color: t.grey, label: `±${cfg.zYellow}σ cảnh báo` }, { kind: 'line', color: t.grey, label: `±${cfg.zRed}σ kiểm soát` }]),
    chart: d.funnel.points.length
      ? html`<div class="chart chart--funnel" id="chart-funnel"></div>`
      : emptyState({ title: 'Chưa đủ dữ liệu', text: `Không có lớp nào đủ ${cfg.nMin} phiếu hợp lệ trong phạm vi này.` }),
    table,
    howto: html`<ul>
      <li>Trục ngang là số phiếu hợp lệ n của lớp, trục dọc là điểm lớp (trục được thu hẹp để thấy rõ khác biệt; thang gốc 1 – 5).</li>
      <li>Hai đường cong bao quanh μ là giới hạn μ ± z·σ/√n: lớp ít phiếu có giới hạn rộng hơn nên được so sánh công bằng.</li>
      <li>Chấm nằm dưới đường −${cfg.zYellow}σ là bất thường cần theo dõi; dưới −${cfg.zRed}σ là cần can thiệp. Màu và hình chấm theo trạng thái chung của lớp (xét cả 7 phương diện).</li>
    </ul>`,
    foot: html`<span>μ = ${fmtScore(d.funnel.mu)}; σ = ${fmtScore(d.funnel.sigma)} (điểm cá nhân toàn Trường, đợt này)</span><span>Ẩn ${fmtInt(d.funnel.hidden)} lớp dưới ${cfg.nMin} phiếu</span>`,
  });
}

// Màn hình nhỏ: biểu đồ phễu chuyển sang danh sách lớp sắp theo mức cảnh báo.
function classListCard(ctx, d) {
  const rank = { alert: 3, warn: 2, ok: 1, na: 0 };
  const pts = [...d.funnel.points].sort((a, b) => rank[b.status] - rank[a.status] || a.mean - b.mean);
  const attention = pts.filter((p) => p.status === 'alert' || p.status === 'warn');
  const rest = pts.filter((p) => !(p.status === 'alert' || p.status === 'warn'));
  const item = (p) => html`<li>${p.canOpen
    ? html`<a class="list-row" href="#/lop/${encodeURIComponent(p.classId)}?dot=${ctx.f.dot}">${rowInner(p)}</a>`
    : html`<div class="list-row">${rowInner(p)}</div>`}</li>`;
  return plainCard({
    title: 'Lớp nào cần chú ý?',
    sub: `Sắp theo mức cảnh báo · ${metricName(d.funnel.metric)} · ẩn ${d.funnel.hidden} lớp dưới ${state.cfg.nMin} phiếu`,
    flush: true,
    body: pts.length
      ? html`<ul class="list">${attention.map(item)}</ul>
        ${rest.length ? html`<details class="more-classes"><summary>Các lớp đạt (${rest.length})</summary><ul class="list">${rest.map(item)}</ul></details>` : ''}`
      : emptyState({ title: 'Chưa đủ dữ liệu' }),
  });
}

function rowInner(p) {
  return html`${statusChip(p.status)}<span class="list-row__main"><span class="list-row__title">${p.name}</span><br><span class="list-row__meta">${p.faculty} · n = ${fmtInt(p.n)}${p.reasons[0] ? ` · ${p.reasons[0].text}` : ''}</span></span><span class="list-row__value">${fmtScore(p.mean)}</span>`;
}

// ---- Bản đồ nhiệt khoa × 7 phương diện (bảng HTML tô màu theo 3 mức) ------------------------
function heatCard(ctx, d) {
  const { cfg } = state;
  const rowsLabel = { faculty: 'Khoa', course: 'Học phần', class: 'Lớp học phần' }[d.heat.rowsKind];
  const rowLink = (r) => {
    if (d.heat.rowsKind === 'faculty') return navHref(ctx, { khoa: r.id, hp: '' });
    if (d.heat.rowsKind === 'course') return navHref(ctx, { hp: r.id });
    return r.canOpen ? `#/lop/${encodeURIComponent(r.id)}?dot=${ctx.f.dot}` : null;
  };
  const cell = (c) => {
    const s = STATUS[c.status];
    const label = c.mean === null ? (c.n ? `n = ${c.n}` : '–') : fmtScore(c.mean);
    const title = c.mean === null ? `${c.code}: chưa đủ dữ liệu (${c.n} phiếu)` : `${c.code} ${FACTOR_BY_CODE[c.code].short}: ${fmtScore(c.mean)} · ${s.label} · n = ${c.n}`;
    return html`<td class="heat-cell heat-cell--${c.status}" title="${title}"><span aria-hidden="true">${c.mean === null ? '' : s.icon} </span>${label}<span class="sr-only"> ${s.label}</span></td>`;
  };
  const table = html`<div class="table-wrap heat-wrap"><table class="table heat">
      <caption class="sr-only">Bản đồ nhiệt ${rowsLabel.toLowerCase()} × 7 phương diện</caption>
      <thead><tr><th scope="col">${rowsLabel}</th>${DIMENSIONS.map((dm) => html`<th scope="col" class="heat-col" title="${FACTOR_BY_CODE[dm].name}">${codeTag(dm)}</th>`)}<th scope="col" class="n">n</th></tr></thead>
      <tbody>${d.heat.rows.map((r) => {
        const href = rowLink(r);
        return html`<tr><th scope="row" title="${r.title || r.label}">${href ? html`<a href="${href}">${r.label}</a>` : r.label}</th>${r.cells.map(cell)}<td class="n">${fmtInt(r.n)}</td></tr>`;
      })}</tbody>
    </table></div>`;
  const mobile = html`<ul class="list">${d.heat.rows.map((r) => {
    const href = rowLink(r);
    const inner = html`<span class="list-row__main"><span class="list-row__title">${r.label}</span> <span class="list-row__meta">· n = ${fmtInt(r.n)}</span>
      <span class="mini-cells">${r.cells.map((c) => html`<span class="mini-cell mini-cell--${c.status}" title="${c.code}">${c.code} ${c.mean === null ? '–' : fmtScore(c.mean)}</span>`)}</span></span>`;
    return html`<li>${href ? html`<a class="list-row" href="${href}">${inner}</a>` : html`<div class="list-row">${inner}</div>`}</li>`;
  })}</ul>`;
  return plainCard({
    id: 'card-heat',
    title: d.heat.rowsKind === 'faculty' ? 'Khoa nào yếu ở phương diện nào?' : d.heat.rowsKind === 'course' ? 'Học phần nào yếu ở phương diện nào?' : 'Lớp nào yếu ở phương diện nào?',
    sub: `Bản đồ nhiệt ${rowsLabel.toLowerCase()} × 7 phương diện · ✔ ≥ 3,5 · ⚠ 2,5 – < 3,5 · ✖ < 2,5 · ô xám khi n < ${cfg.nMin}`,
    flush: isMobile(),
    body: html`${isMobile() ? mobile : table}
      ${attentionList(ctx, d)}
      ${howToInline(html`<ul>
        <li>Cả một <b>cột</b> vàng/đỏ: vấn đề chung toàn Trường, thường là điều kiện tổ chức (CT2, IN1, IN3).</li>
        <li>Một <b>hàng</b> vàng/đỏ: vấn đề riêng của một ${rowsLabel.toLowerCase()}. Bấm tên hàng để đi sâu.</li>
        <li>Mã cột tô màu nhóm: <span class="code-tag code-tag--PED">xanh</span> ${GROUPS.PED.short}, <span class="code-tag code-tag--ORG">vàng đồng</span> ${GROUPS.ORG.short}.</li></ul>`)}`,
  });
}

// Danh sách lớp cần chú ý nhất – lối vào M2 dùng được bằng bàn phím (thay cho bấm chấm trên biểu đồ).
function attentionList(ctx, d) {
  if (isMobile()) return '';
  const rank = { alert: 2, warn: 1 };
  const items = d.funnel.points.filter((p) => rank[p.status]).sort((a, b) => rank[b.status] - rank[a.status] || a.mean - b.mean).slice(0, 4);
  if (!items.length) return html`<div class="attention"><p class="attention__title">Lớp cần chú ý nhất</p><p class="caption">Không có lớp nào cần theo dõi hoặc can thiệp.</p></div>`;
  const more = d.funnel.points.filter((p) => rank[p.status]).length - items.length;
  return html`<div class="attention"><p class="attention__title">Lớp cần chú ý nhất</p>
    <ul class="list">${items.map((p) => html`<li>${p.canOpen ? html`<a class="list-row" href="#/lop/${encodeURIComponent(p.classId)}?dot=${ctx.f.dot}">${rowInner(p)}</a>` : html`<div class="list-row">${rowInner(p)}</div>`}</li>`)}</ul>
    ${more > 0 ? html`<p class="caption">và ${more} lớp khác – xem bảng của biểu đồ phễu${canSee(ctx.user, 'M2') ? html` hoặc <a href="#/lop?ky=${ctx.f.semesterId}&dot=${ctx.f.dot}${ctx.f.facultyId ? `&khoa=${ctx.f.facultyId}` : ''}">danh sách lớp</a>` : ''}.</p>` : ''}
  </div>`;
}

function howToInline(content) {
  return html`<details class="howto" style="margin:12px 0 0"><summary>Cách đọc</summary><div class="howto__body">${content}</div></details>`;
}

// ---- Pareto, ma trận ưu tiên --------------------------------------------------------------
function paretoCard(d) {
  const { cfg } = state;
  const t = theme();
  const rows = d.pareto.rows;
  const any = rows.some((r) => r.gap > 0);
  return chartCard({
    id: 'card-pareto',
    title: 'Ưu tiên cải tiến gì trước?',
    sub: `Pareto có trọng số · gₖ = max(0; T − x̄ₖ) × wₖ · T = ${fmtScore(cfg.target, 1)} · ${d.pareto.weightsSource}`,
    legend: legend([{ kind: 'sq', color: groupColor('PED'), label: GROUPS.PED.short }, { kind: 'sq', color: groupColor('ORG'), label: GROUPS.ORG.short }, { kind: 'line', color: t.navy, label: 'Tỷ trọng cộng dồn' }, { kind: 'dash', color: t.grey, label: '80%' }]),
    chart: any ? html`<div class="chart" id="chart-pareto"></div>` : emptyState({ title: 'Mọi phương diện đã đạt mục tiêu T', iconText: '✔' }),
    table: dataTable({
      compact: true,
      columns: [
        { label: 'Phương diện', render: (r) => html`${codeTag(r.code)} ${FACTOR_BY_CODE[r.code].short}` },
        { label: 'x̄ₖ', num: true, render: (r) => fmtScore(r.mean) },
        { label: 'wₖ', num: true, render: (r) => fmtNum(r.w, 3) },
        { label: 'gₖ', num: true, render: (r) => fmtNum(r.gap, 3) },
        { label: 'Tỷ trọng', num: true, render: (r) => fmtPct(r.share, 1) },
        { label: 'Cộng dồn', num: true, render: (r) => fmtPct(r.cumShare, 0) },
      ],
      rows,
    }),
    howto: html`<ul><li>Cột là tỷ trọng của từng phương diện trong tổng khoảng cách có trọng số so với mục tiêu T; đường là tỷ trọng cộng dồn.</li>
      <li>Phương diện vừa thiếu hụt nhiều vừa quan trọng với kết quả học tập (wₖ lớn) đứng đầu. Nhóm phương diện chạm mốc 80% là nhóm nên ưu tiên.</li>
      <li>Biểu đồ dùng một trục 0 – 100% cho cả cột và đường để không tạo tương quan giả.</li></ul>`,
  });
}

function ipaCard(d) {
  const quadrantLabel = { improve: 'Ưu tiên cải tiến', maintain: 'Duy trì', monitor: 'Theo dõi', enough: 'Không cần đầu tư thêm' };
  return chartCard({
    id: 'card-ipa',
    title: 'Chiến lược cho từng phương diện?',
    sub: 'Ma trận tầm quan trọng – mức đạt · đường cắt x = 1/7, y = 3,5 · ◆ phổ quát · ○ phụ thuộc bối cảnh (Nội dung 1)',
    legend: legend([{ kind: 'sq', color: groupColor('PED'), label: GROUPS.PED.short }, { kind: 'sq', color: groupColor('ORG'), label: GROUPS.ORG.short }]),
    chart: html`<div class="chart" id="chart-ipa"></div>`,
    table: dataTable({
      compact: true,
      columns: [
        { label: 'Phương diện', render: (r) => html`${codeTag(r.code)} ${r.name}` },
        { label: 'wₖ', num: true, render: (r) => fmtNum(r.w, 3) },
        { label: 'x̄ₖ', num: true, render: (r) => fmtScore(r.mean) },
        { label: 'Vùng', render: (r) => quadrantLabel[r.quadrant] ?? '–' },
        { label: 'Bất biến', render: (r) => (r.universal === true ? '◆ Phổ quát' : r.universal === false ? '○ Phụ thuộc bối cảnh' : '–') },
      ],
      rows: d.ipa,
    }),
    howto: html`<ul><li>Trục ngang: trọng số tương đối wₖ từ Nội dung 2 (khi chưa có thì mọi điểm nằm trên đường 1/7). Trục dọc: mức đạt (trục thu hẹp quanh ngưỡng 3,5).</li>
      <li>Góc phải dưới <b>Ưu tiên cải tiến</b>: quan trọng nhưng mức đạt thấp. Góc phải trên <b>Duy trì</b>. Bên trái: <b>Theo dõi</b> (đạt thấp) và <b>Không cần đầu tư thêm</b>.</li></ul>`,
  });
}

// ---- Histogram, xu hướng ------------------------------------------------------------------
function histogramCard(d, mName) {
  const t = theme();
  return chartCard({
    id: 'card-hist',
    title: 'Phân bố có đồng đều không?',
    sub: `Histogram ${mName} · ${fmtInt(d.histogram.n)} phiếu · khoảng 0,25 điểm · trung bình ${fmtScore(d.histogram.mean)}`,
    legend: legend([{ kind: 'sq', color: t.alert, label: '✖ Thấp < 2,5' }, { kind: 'sq', color: t.warn, label: '⚠ Trung bình 2,5 – < 3,5' }, { kind: 'sq', color: t.ok, label: '✔ Cao ≥ 3,5' }]),
    chart: d.histogram.n ? html`<div class="chart chart--sm" id="chart-hist"></div>` : emptyState({ title: 'Chưa có phiếu hợp lệ' }),
    table: dataTable({
      compact: true,
      columns: [
        { label: 'Khoảng điểm', render: (b) => `${fmtScore(b.x0)} – ${b.x1 >= 5 ? '5,00' : `< ${fmtScore(b.x1)}`}` },
        { label: 'Mức', render: (b) => statusChip(b.status, { label: { alert: 'Thấp', warn: 'Trung bình', ok: 'Cao' }[b.status] }) },
        { label: 'Số phiếu', num: true, render: (b) => fmtInt(b.count) },
      ],
      rows: d.histogram.bins.filter((b) => b.count),
    }),
    howto: html`Chú ý <b>đuôi trái</b> (các cột đỏ, vàng): nhóm sinh viên phản hồi kém có thể bị che khuất bởi điểm trung bình cao.`,
  });
}

function trendCard(d, mName) {
  const { cfg } = state;
  const t = theme();
  const c = d.trend.control;
  const rows = d.trend.school.map((p, i) => ({ ...p, scope: d.trend.scope?.[i] }));
  return chartCard({
    id: 'card-trend',
    title: 'Có cải thiện theo thời gian?',
    sub: c.enabled
      ? `${mName} theo đợt · biểu đồ kiểm soát XmR (${c.nWaves} đợt): CL ${fmtScore(c.cl)}, UCL ${fmtScore(c.ucl)}, LCL ${fmtScore(c.lcl)}`
      : `${mName} theo đợt · biểu đồ kiểm soát cần từ ${cfg.controlChartMinWaves} đợt (hiện có ${c.nWaves})`,
    legend: legend(d.trend.scope ? [{ kind: 'line', color: t.blue, label: d.scope }, { kind: 'line', color: t.na, label: 'Toàn Trường' }] : [{ kind: 'line', color: t.blue, label: 'Toàn Trường' }]),
    chart: html`<div class="chart chart--sm" id="chart-trend"></div>`,
    table: dataTable({
      compact: true,
      columns: [
        { label: 'Đợt', key: 'label' },
        { label: 'Toàn Trường', num: true, render: (r) => fmtScore(r.mean) },
        { label: 'n', num: true, render: (r) => fmtInt(r.n) },
        ...(d.trend.scope ? [{ label: d.scope, num: true, render: (r) => fmtScore(r.scope?.mean) }, { label: 'n', num: true, render: (r) => fmtInt(r.scope?.n) }] : []),
      ],
      rows,
    }),
    howto: html`<ul><li>Đường xu hướng cho biết chỉ số thay đổi qua các đợt (trục thu hẹp để thấy dao động).</li>
      <li>Từ ${cfg.controlChartMinWaves} đợt, biểu đồ kiểm soát XmR được bật: CL là trung bình các đợt, UCL/LCL = CL ± 2,66 × biên độ dịch chuyển trung bình. Điểm ngoài giới hạn được tô đỏ – dấu hiệu thay đổi thật, không phải dao động ngẫu nhiên.</li></ul>`,
  });
}

// ---- Chủ đề ý kiến -------------------------------------------------------------------------
function themesCard(d) {
  const items = d.themes.items.slice(0, 8);
  const max = Math.max(1, ...items.map((i) => i.total));
  return plainCard({
    id: 'card-themes',
    title: 'Sinh viên phàn nàn gì?',
    sub: `Chủ đề ý kiến tự do (AI phân loại theo nhân tố) · ${fmtInt(d.themes.n)} ý kiến · bấm một chủ đề để xem câu trích ẩn danh`,
    body: items.length
      ? html`<div class="grid grid--2">${[items.slice(0, Math.ceil(items.length / 2)), items.slice(Math.ceil(items.length / 2))].map(
          (col, ci) => html`<div class="theme-bars">${col.map((it, i) => {
            const id = `theme-q-${ci}-${i}`;
            return html`<div>
              <button type="button" class="theme-bar" data-theme aria-expanded="false" aria-controls="${id}">
                <span class="theme-bar__label">${it.factor !== 'khac' ? codeTag(it.factor) : html`<span class="code-tag code-tag--KQ">Khác</span>`}<span>${it.label}</span></span>
                <span class="theme-bar__n">${fmtInt(it.total)}</span>
                <span class="theme-bar__track" aria-hidden="true"><span class="theme-bar__fill" style="${raw(`display:block;width:${(it.total / max) * 100}%;background:${groupColor(it.group)}`)}"></span></span>
                <span class="caption" style="grid-column:1/-1">${fmtInt(it.neg)} tiêu cực · ${fmtInt(it.pos)} tích cực</span>
              </button>
              <div id="${id}" hidden>
                ${it.quotes.length ? it.quotes.map((q) => html`<blockquote class="quote">“${q.text}”</blockquote>`) : html`<p class="caption">Không có câu trích hiển thị được.</p>`}
                ${it.hiddenQuotes ? html`<p class="caption">${fmtInt(it.hiddenQuotes)} ý kiến của lớp dưới ${state.cfg.nMin} phiếu không hiện nguyên văn.</p>` : ''}
              </div>
            </div>`;
          })}</div>`,
        )}</div>
        <p class="caption" style="margin-top:12px">Câu trích đã xóa tên người, số điện thoại, mã số. Phân loại bằng bộ quy tắc từ khóa của MVP – đối chiếu với mã hóa chuyên gia ở M0 › Kiểm chứng (TC4).</p>`
      : emptyState({ title: 'Chưa có ý kiến tự do' }),
  });
}

export function canViewOverview(user) {
  return canSee(user, 'M1');
}
