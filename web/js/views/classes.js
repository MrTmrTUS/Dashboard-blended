// M2 – Lớp học phần: "Lớp này yếu ở đâu, làm gì?"
// Giảng viên chỉ thấy lớp mình phụ trách; lớp dưới 10 phiếu hiện "Chưa đủ dữ liệu để hiển thị".
import { classInScope } from '../access.js';
import { classDetail, classList, visibleWaves, waveLabel } from '../api.js';
import { DIMENSIONS, DOT_LABELS, FACTOR_BY_CODE, GROUPS } from '../core/constants.js';
import { fmtDate, fmtInt, fmtScore } from '../core/format.js';
import { isNum } from '../core/stats.js';
import { plans as planStore, state } from '../store.js';
import { banner, codeTag, dataTable, delta, emptyState, legend, openDialog, pageHead, plainCard, statusChip, toast } from '../ui/components.js';
import { groupColor, theme } from '../ui/charts.js';
import { html, isMobile, on, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { library } from './assistant.js';
import { filterMeta, standardFilterDefs } from './shell.js';

export const PLAN_STATUS = {
  chua_bat_dau: { label: 'Chưa bắt đầu', chip: 'na' },
  dang_thuc_hien: { label: 'Đang thực hiện', chip: 'warn' },
  hoan_thanh: { label: 'Hoàn thành', chip: 'ok' },
};

const VERDICT = {
  pending: { label: 'Chờ đợt sau', cls: 'neutral', icon: '…' },
  reached: { label: 'Đạt ngưỡng', cls: 'ok', icon: '✔' },
  improved: { label: 'Có cải thiện', cls: 'warn', icon: '▲' },
  notImproved: { label: 'Chưa cải thiện', cls: 'alert', icon: '▼' },
};

export function canEditPlans(user, cls) {
  if (!cls) return false;
  if (user.role === 'qlcl' || user.role === 'admin') return true;
  if (user.role === 'khoa' || user.role === 'gv') return classInScope(user, cls);
  return false;
}

// ---- Danh sách lớp --------------------------------------------------------------------------

export const ClassListView = {
  screen: 'M2',
  layout: 'wide',
  filters: (ctx) => standardFilterDefs(ctx, ['ky', 'dot', 'khoa', 'hp']),
  meta: (ctx) => filterMeta(ctx, state.mart.waves.find((w) => w.id === ctx.f.waveId)),
  title: (ctx) => (ctx.user.role === 'gv' ? 'Lớp của tôi' : 'Lớp học phần'),
  prepare(ctx) {
    ctx.data = classList(ctx.user, ctx.f);
  },
  render(ctx) {
    const { items, wave } = ctx.data;
    const counts = { alert: 0, warn: 0, ok: 0, na: 0 };
    items.forEach((i) => counts[i.status]++);
    const title = ctx.user.role === 'gv' ? 'Lớp của tôi' : 'Lớp học phần';
    const needPlan = items.filter((i) => i.needsPlan).length;
    const dotQ = ctx.f.dot ? `?dot=${ctx.f.dot}` : '';
    return html`${pageHead({
      crumbs: [{ label: 'Trường' }, { label: 'Lớp học phần' }],
      title,
      question: `Lớp nào cần hỗ trợ, yếu ở đâu? · ${wave ? waveLabel(wave) : 'chưa có đợt'}`,
    })}
      ${needPlan ? banner({ kind: 'alert', iconText: '✖', title: `${needPlan} lớp ở mức can thiệp chưa có kế hoạch cải tiến`, body: 'Lớp đỏ bắt buộc có kế hoạch cải tiến (PDCA); đợt sau dashboard tự so sánh điểm trước – sau.' }) : ''}
      <div class="page-actions" style="margin-bottom:12px">
        ${statusChip('alert', { label: `Can thiệp ${counts.alert}`, large: true })}
        ${statusChip('warn', { label: `Theo dõi ${counts.warn}`, large: true })}
        ${statusChip('ok', { label: `Đạt ${counts.ok}`, large: true })}
        ${statusChip('na', { label: `Chưa đủ dữ liệu ${counts.na}`, large: true })}
      </div>
      ${plainCard({
        flush: true,
        body: items.length
          ? isMobile()
            ? html`<ul class="list">${items.map(
                (it) => html`<li><a class="list-row" href="#/lop/${encodeURIComponent(it.cls.id)}${dotQ}">${statusChip(it.status)}
                  <span class="list-row__main"><span class="list-row__title">${it.cls.name}</span><br>
                  <span class="list-row__meta">${it.faculty?.short ?? ''} · ${fmtInt(it.n)}/${fmtInt(it.cls.size)} phiếu${it.cw?.reasons?.[0] ? ` · ${it.cw.reasons[0].text}` : ''}</span>
                  ${it.needsPlan ? html`<br><span class="chip chip--alert">Cần lập kế hoạch</span>` : ''}</span>
                  <span class="list-row__value">${fmtScore(it.index)}</span></a></li>`,
              )}</ul>`
            : html`<div style="padding:0 0 4px">${dataTable({
                columns: [
                  { label: 'Lớp học phần', render: (it) => html`<a href="#/lop/${encodeURIComponent(it.cls.id)}${dotQ}"><b>${it.cls.name}</b></a><br><span class="caption">${it.cls.id}</span>` },
                  { label: 'Khoa', render: (it) => it.faculty?.short ?? '' },
                  { label: 'Giảng viên', render: (it) => it.lecturer?.name ?? '' },
                  { label: 'Phiếu hợp lệ', num: true, render: (it) => `${fmtInt(it.n)}/${fmtInt(it.cls.size)}` },
                  { label: 'Chỉ số', num: true, render: (it) => fmtScore(it.index) },
                  { label: 'Trạng thái', render: (it) => statusChip(it.status) },
                  { label: 'Lý do chính', render: (it) => html`<span class="small">${it.cw?.reasons?.[0]?.text ?? (it.status === 'na' ? `Dưới ${state.cfg.nMin} phiếu hợp lệ` : '–')}</span>` },
                  { label: 'Kế hoạch', render: (it) => (it.needsPlan ? html`<span class="chip chip--alert">Cần lập</span>` : it.planCount ? html`<span class="chip chip--neutral">${it.planCount} kế hoạch</span>` : '–') },
                ],
                rows: items,
              })}</div>`
          : emptyState({ title: 'Không có lớp trong phạm vi', text: 'Thử đổi học kỳ hoặc khoa.' }),
      })}`;
  },
};

// ---- Chi tiết lớp ------------------------------------------------------------------------------

export const ClassDetailView = {
  screen: 'M2',
  layout: 'assistant',
  title: (ctx) => ctx.data?.cls?.name ?? 'Lớp học phần',
  filters(ctx) {
    const d = ctx.data;
    if (!d?.cls) return [];
    const classes = state.dataset.classes.filter((c) => c.semesterId === d.cls.semesterId && classInScope(ctx.user, c));
    return [
      { key: 'lop', label: 'Lớp', wide: true, value: d.cls.id, options: classes.map((c) => ({ value: c.id, label: c.name })), toHash: (v) => `#/lop/${encodeURIComponent(v)}${d.wave ? `?dot=${d.wave.dot}` : ''}` },
      { key: 'dot', label: 'Đợt', value: d.wave?.dot ?? '', options: d.waves.map((w) => ({ value: w.dot, label: `${DOT_LABELS[w.dot]} ${d.semester?.label ?? ''}` })) },
    ];
  },
  meta: (ctx) => filterMeta(ctx, ctx.data?.wave),
  prepare(ctx) {
    const wave = visibleWaves(ctx.user).find((w) => w.semesterId === state.mart.classById.get(ctx.params.id)?.semesterId && w.dot === ctx.query.dot);
    ctx.data = classDetail(ctx.user, ctx.params.id, wave?.id);
  },
  render(ctx) {
    const d = ctx.data;
    if (d.notFound) return html`${pageHead({ title: 'Không tìm thấy lớp' })}${plainCard({ body: emptyState({ title: 'Mã lớp không tồn tại trong bộ dữ liệu' }) })}`;
    const crumbs = [
      { label: 'Trường', href: '#/tong-quan' },
      { label: d.faculty?.name ?? d.cls.facultyId, href: `#/lop?ky=${d.cls.semesterId}&khoa=${d.cls.facultyId}` },
      { label: d.cls.name },
    ];
    if (d.noData) {
      return html`${pageHead({ crumbs, title: d.cls.name })}${plainCard({ body: emptyState({ title: 'Chưa có đợt đánh giá', text: 'Lớp chưa có phiếu khảo sát trong học kỳ này.' }) })}${plansCard(ctx, d)}`;
    }
    const cw = d.cw;
    const firstReason = cw.reasons[0];
    return html`${pageHead({
      crumbs,
      title: d.cls.name,
      question: `Lớp này yếu ở đâu, làm gì? · ${waveLabel(d.wave)}`,
      actions: html`<button type="button" class="btn" data-print>${icon('print')}In</button>${canEditPlans(ctx.user, d.cls) ? html`<button type="button" class="btn btn--primary" data-add-plan>${icon('plus')}Lập kế hoạch cải tiến</button>` : ''}`,
    })}
      ${d.needsPlan && canEditPlans(ctx.user, d.cls)
        ? banner({ kind: 'alert', iconText: '✖', title: 'Lớp ở mức can thiệp – bắt buộc có kế hoạch cải tiến', body: 'Lập kế hoạch ngay (Act); đợt sau dashboard tự hiện điểm trước – sau làm minh chứng cho Tiêu chí 6.4.', actions: html`<button type="button" class="btn btn--sm btn--primary" data-add-plan>Lập kế hoạch</button>` })
        : ''}
      <section class="card" aria-label="Thông tin lớp">
        <div class="class-head">
          ${statusChip(cw.status, { large: true, label: `${{ ok: 'Đạt', warn: 'THEO DÕI', alert: 'CAN THIỆP', na: 'CHƯA ĐỦ DỮ LIỆU' }[cw.status]}${firstReason ? ` (${firstReason.code} ${firstReason.rule === 'decline' ? 'giảm liên tiếp' : firstReason.rule === 'funnel' ? `dưới ${Math.abs(firstReason.threshold)}σ` : `< ${fmtScore(firstReason.threshold, 1)}`})` : ''}` })}
          <div class="class-head__meta">
            <span>GV: <b>${d.lecturer?.name ?? d.cls.lecturerId}</b></span>
            <span><b>${fmtInt(cw.n)}/${fmtInt(cw.size)}</b> phiếu hợp lệ${cw.nTotal > cw.n ? ` (${fmtInt(cw.nTotal - cw.n)} phiếu không hợp lệ)` : ''}</span>
            <span>${d.faculty?.name ?? ''} · ${d.semester?.label ?? ''}</span>
            ${!d.hidden ? html`<span>Chỉ số chất lượng <b>${fmtScore(cw.metrics.IDX.mean)}</b> · TB Trường ${fmtScore(d.school.IDX.mean)}</span>` : ''}
          </div>
        </div>
        ${cw.reasons.length
          ? html`<ul class="reasons" aria-label="Lý do cảnh báo">${cw.reasons.slice(0, 6).map((r) => html`<li>${statusChip(r.level)}<span>${r.text}</span></li>`)}${cw.reasons.length > 6 ? html`<li class="caption">và ${cw.reasons.length - 6} lý do khác</li>` : ''}</ul>`
          : ''}
        ${historyStrip(d)}
      </section>
      ${d.hidden
        ? html`<div class="mt-16">${plainCard({ body: emptyState({ title: 'Chưa đủ dữ liệu để hiển thị', text: `Lớp có ${fmtInt(cw.n)} phiếu hợp lệ, dưới ngưỡng ${state.cfg.nMin} phiếu. Điểm lớp vẫn được gộp vào điểm khoa và Trường.`, iconText: '–' }) })}</div>`
        : html`<div class="grid grid--60-40 grid--start mt-16">
            ${profileCard(d)}
            <div class="stack">${lowestCard(d)}${commentsCard(d)}</div>
          </div>`}
      <div class="mt-16">${plansCard(ctx, d)}</div>`;
  },
  mount(root, ctx) {
    const d = ctx.data;
    if (d.notFound) return;
    on(root, 'click', '[data-add-plan]', () => openPlanDialog(ctx, d));
    on(root, 'click', '[data-print]', () => window.print());
    on(root, 'click', '[data-edit-plan]', (e, btn) => openPlanDialog(ctx, d, planStore.all().find((p) => p.id === btn.dataset.editPlan)));
    on(root, 'click', '[data-del-plan]', (e, btn) => {
      if (!confirm('Xóa kế hoạch cải tiến này?')) return;
      planStore.remove(btn.dataset.delPlan);
      toast('Đã xóa kế hoạch');
      ctx.route();
    });
    on(root, 'click', '[data-theme]', (e, btn) => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      root.querySelector(`#${btn.getAttribute('aria-controls')}`).hidden = open;
    });
    if (ctx.params.sub === 'ke-hoach' && canEditPlans(ctx.user, d.cls)) setTimeout(() => openPlanDialog(ctx, d), 50);
  },
  assistant(ctx) {
    const d = ctx.data;
    if (!d?.cw || d.hidden) return null;
    return {
      kind: 'class',
      key: `${d.cls.id}|${d.wave.id}`,
      title: d.cls.name,
      input: { ...d, waveLabel: waveLabel(d.wave) },
      canPlan: canEditPlans(ctx.user, d.cls),
      onApply: ({ measureCode, dimension }) => openPlanDialog(ctx, d, null, { measureCode, dimension }),
    };
  },
};

// Diễn biến chỉ số của "dòng lớp" qua các đợt (để thấy quy tắc giảm liên tiếp).
function historyStrip(d) {
  if (!d.history.length) return '';
  return html`<div class="card__foot" aria-label="Diễn biến chỉ số chất lượng qua các đợt">
    <span>Diễn biến chỉ số (cùng học phần, nhóm lớp, giảng viên):</span>
    ${d.history.map((h) => html`<span class="chip chip--${h.status}" title="${h.label}: ${h.mean === null ? 'chưa đủ dữ liệu' : fmtScore(h.mean)} · n = ${h.n}"><span class="chip__icon" aria-hidden="true">${{ ok: '✔', warn: '⚠', alert: '✖', na: '–' }[h.status]}</span>${h.label} · ${h.mean === null ? '–' : fmtScore(h.mean)}</span>`)}
  </div>`;
}

// Hồ sơ 7 phương diện: bullet chart ngang (điểm lớp, vạch ngưỡng 3,5, vạch TB Trường), sắp theo khoảng cách có trọng số.
function profileCard(d) {
  const t = theme();
  const pos = (v) => `${((Math.min(5, Math.max(1, v)) - 1) / 4) * 100}%`;
  const thr = state.cfg.yellowDim;
  const rows = d.profile;
  return plainCard({
    title: 'Hồ sơ 7 phương diện',
    sub: `Sắp theo khoảng cách có trọng số tới mục tiêu T = ${fmtScore(state.cfg.target, 1)} · so với ${d.prevWave ? waveLabel(d.prevWave) : 'đợt trước (chưa có)'}`,
    body: html`${legend([
        { kind: 'sq', color: groupColor('PED'), label: GROUPS.PED.short },
        { kind: 'sq', color: groupColor('ORG'), label: GROUPS.ORG.short },
        { kind: 'dash', color: t.ink2, label: `Ngưỡng ${fmtScore(thr, 1)}` },
        { kind: 'tick', color: t.navy, label: 'TB Trường' },
      ])}
      <div class="bullet-axis" aria-hidden="true" style="margin-top:10px"><span></span><span class="bullet-axis__ticks"><span style="left:0">1</span><span style="left:25%">2</span><span style="left:50%">3</span><span style="left:75%">4</span><span style="left:100%">5</span></span><span style="text-align:right">Điểm</span><span style="text-align:right">So đợt trước</span><span></span></div>
      <div class="bullets" role="list">
        ${rows.map(
          (p) => html`<div class="bullet" role="listitem" aria-label="${p.code} ${p.name}: ${fmtScore(p.mean)}; TB Trường ${fmtScore(p.school)}; ${p.status === 'ok' ? 'đạt' : p.status === 'warn' ? 'theo dõi' : 'can thiệp'}">
            <span class="bullet__label">${codeTag(p.code)}<span class="bullet__name" title="${p.fullName}">${p.name}</span></span>
            <span class="bullet__track" aria-hidden="true">
              <span class="bullet__bar bullet__bar--${p.group}" style="${raw(`width:${pos(p.mean)}`)}"></span>
              <span class="bullet__mark bullet__mark--target" style="${raw(`left:${pos(thr)}`)}"></span>
              <span class="bullet__mark bullet__mark--school" style="${raw(`left:${pos(p.school)}`)}" title="TB Trường ${fmtScore(p.school)}"></span>
            </span>
            <span class="bullet__value">${fmtScore(p.mean)}</span>
            <span class="bullet__delta">${isNum(p.delta) ? delta(p.delta) : html`<span class="muted">–</span>`}</span>
            <span class="bullet__status">${statusChip(p.status)}</span>
          </div>`,
        )}
      </div>
      <div class="outcomes"><span>Kết quả học tập cảm nhận (chỉ hiển thị):</span>
        <span>PT1 Hiệu quả, duy trì học tập <b>${fmtScore(d.outcomes.PT1)}</b></span>
        <span>PT2 Phát triển năng lực <b>${fmtScore(d.outcomes.PT2)}</b></span>
      </div>`,
    foot: html`<details class="howto" style="margin:0;border:0;padding:0"><summary>Cách đọc</summary><div class="howto__body">Thanh là điểm lớp trên thang 1 – 5; vạch đứt là ngưỡng theo dõi ${fmtScore(thr, 1)}; vạch đậm là trung bình Trường cùng đợt. Phương diện đứng đầu là nơi cải tiến mang lại nhiều nhất (thiếu hụt lớn × trọng số lớn). Bullet chart dễ đọc hơn biểu đồ radar khi so với mốc.</div></details>`,
  });
}

function lowestCard(d) {
  return plainCard({
    title: '5 chỉ báo thấp nhất',
    sub: 'Lời dẫn chỉ báo (minh họa) và điểm trung bình của lớp',
    body: d.lowest.length
      ? html`<ol class="lowest">${d.lowest.map(
          (it) => html`<li><span>${it.text}<br><span class="lowest__code">${codeTag(it.factor)} ${it.code} · ${FACTOR_BY_CODE[it.factor].short} · n = ${it.n}</span></span><span class="lowest__val">${fmtScore(it.mean)}</span></li>`,
        )}</ol>`
      : emptyState({ title: 'Chưa có dữ liệu chỉ báo' }),
  });
}

function commentsCard(d) {
  const items = d.themes.items.slice(0, 5);
  const max = Math.max(1, ...items.map((i) => i.total));
  return plainCard({
    title: 'Ý kiến sinh viên',
    sub: `Chủ đề (AI phân loại) và câu trích ẩn danh · ${fmtInt(d.themes.n)} ý kiến`,
    body: items.length
      ? html`<div class="theme-bars">${items.map((it, i) => {
          const id = `cls-theme-${i}`;
          return html`<div>
            <button type="button" class="theme-bar" data-theme aria-expanded="${i === 0}" aria-controls="${id}">
              <span class="theme-bar__label">${it.factor !== 'khac' ? codeTag(it.factor) : html`<span class="code-tag code-tag--KQ">Khác</span>`}<span>${it.label}</span></span>
              <span class="theme-bar__n">${fmtInt(it.total)}</span>
              <span class="theme-bar__track" aria-hidden="true"><span class="theme-bar__fill" style="${raw(`display:block;width:${(it.total / max) * 100}%;background:${groupColor(it.group)}`)}"></span></span>
            </button>
            <div id="${id}"${raw(i === 0 ? '' : ' hidden')}>${it.quotes.map((q) => html`<blockquote class="quote">“${q.text}”</blockquote>`)}</div>
          </div>`;
        })}</div>`
      : emptyState({ title: 'Lớp chưa có ý kiến tự do' }),
  });
}

// ---- Kế hoạch cải tiến (PDCA) ------------------------------------------------------------------

function plansCard(ctx, d) {
  const editable = canEditPlans(ctx.user, d.cls);
  const plans = d.plans || [];
  return plainCard({
    title: 'Kế hoạch cải tiến (PDCA)',
    sub: 'Phương diện · biện pháp · người phụ trách · hạn · trạng thái · kết quả đợt sau (tự so sánh trước – sau)',
    actions: editable ? html`<button type="button" class="btn btn--sm" data-add-plan>${icon('plus')}Thêm kế hoạch</button>` : '',
    body: plans.length
      ? dataTable({
          columns: [
            { label: 'Đợt lập', render: (p) => html`${p.wave ? waveLabel(p.wave, { short: true }) : p.waveId}<br><span class="caption">${p.id}</span>` },
            { label: 'Phương diện', render: (p) => html`${codeTag(p.dimension)} ${FACTOR_BY_CODE[p.dimension]?.short ?? ''}` },
            { label: 'Biện pháp', render: (p) => html`${p.action}${p.measureCode ? html`<br><span class="caption">${p.measureCode}</span>` : ''}${p.note ? html`<br><span class="caption">${p.note}</span>` : ''}` },
            { label: 'Người phụ trách', key: 'owner' },
            { label: 'Hạn', render: (p) => fmtDate(p.due) },
            { label: 'Trạng thái', render: (p) => statusChip(PLAN_STATUS[p.status]?.chip ?? 'na', { label: PLAN_STATUS[p.status]?.label ?? p.status }) },
            {
              label: 'Kết quả đợt sau',
              render: (p) => {
                const v = VERDICT[p.verdict];
                return html`<span class="chip chip--${v.cls}"><span class="chip__icon" aria-hidden="true">${v.icon}</span>${v.label}</span>${isNum(p.before)
                  ? html`<br><span class="caption">${fmtScore(p.before)} → ${isNum(p.after) ? fmtScore(p.after) : '…'}${isNum(p.delta) ? ` (${p.delta >= 0 ? '+' : '−'}${fmtScore(Math.abs(p.delta))})` : ''}${p.afterWave ? ` · ${waveLabel(p.afterWave, { short: true })}` : ''}</span>`
                  : ''}`;
              },
            },
            ...(editable
              ? [{ label: '', render: (p) => html`<span style="white-space:nowrap"><button type="button" class="btn-tool" data-edit-plan="${p.id}" aria-label="Sửa ${p.id}">${icon('edit')}</button><button type="button" class="btn-tool" data-del-plan="${p.id}" aria-label="Xóa ${p.id}">${icon('trash')}</button></span>` }]
              : []),
          ],
          rows: plans,
        })
      : emptyState({ title: 'Chưa có kế hoạch cải tiến', text: editable ? 'Dùng nút “Thêm kế hoạch” hoặc “Áp dụng vào kế hoạch” từ gợi ý của trợ lý AI.' : '' }),
    foot: html`<span>Kế hoạch được lưu theo “dòng lớp” (cùng học phần, nhóm, giảng viên) để đối chiếu qua các đợt – minh chứng cho Tiêu chí 6.4, 6.5.</span>`,
  });
}

export function openPlanDialog(ctx, d, plan = null, preset = {}) {
  if (!canEditPlans(ctx.user, d.cls)) return;
  const lib = library().filter((m) => m.status === 'da_duyet');
  const weakest = d.profile?.[0]?.code ?? DIMENSIONS[0];
  const dim = plan?.dimension ?? preset.dimension ?? weakest;
  const measure = lib.find((m) => m.code === (plan?.measureCode ?? preset.measureCode));
  const defaultDue = new Date(Date.now() + 28 * 864e5).toISOString().slice(0, 10);
  const measureOptions = (code) => [
    html`<option value="">— Tự soạn biện pháp —</option>`,
    ...lib.filter((m) => m.dim === code).map((m) => html`<option value="${m.code}"${raw(m.code === measure?.code ? ' selected' : '')}>${m.code} · ${m.text.slice(0, 70)}${m.text.length > 70 ? '…' : ''}</option>`),
  ];
  const dlg = openDialog({
    title: plan ? `Sửa kế hoạch ${plan.id}` : 'Lập kế hoạch cải tiến',
    body: html`<form id="plan-form" class="form-grid" novalidate>
      <div class="form-field form-field--full"><span class="label">Lớp</span><span>${d.cls.name} · ${d.wave ? waveLabel(d.wave) : ''}</span></div>
      <div class="form-field"><label for="pf-dim">Phương diện</label>
        <select class="select" id="pf-dim" name="dimension" required>${DIMENSIONS.map((c) => html`<option value="${c}"${raw(c === dim ? ' selected' : '')}>${c} · ${FACTOR_BY_CODE[c].short}${d.profile ? ` (${fmtScore(d.profile.find((p) => p.code === c)?.mean)})` : ''}</option>`)}</select></div>
      <div class="form-field"><label for="pf-measure">Biện pháp từ thư viện</label>
        <select class="select" id="pf-measure" name="measureCode">${measureOptions(dim)}</select></div>
      <div class="form-field form-field--full"><label for="pf-action">Nội dung hành động</label>
        <textarea class="textarea" id="pf-action" name="action" required>${plan?.action ?? measure?.text ?? ''}</textarea>
        <span class="hint">Diễn đạt cụ thể theo bối cảnh lớp: làm gì, cho ai, đo bằng gì.</span></div>
      <div class="form-field"><label for="pf-owner">Người phụ trách</label>
        <input class="input" id="pf-owner" name="owner" required value="${plan?.owner ?? (ctx.user.role === 'gv' ? ctx.user.name : d.lecturer?.name ?? '')}"></div>
      <div class="form-field"><label for="pf-due">Hạn hoàn thành</label>
        <input class="input" type="date" id="pf-due" name="due" required value="${plan?.due ?? defaultDue}"></div>
      <div class="form-field"><label for="pf-status">Trạng thái</label>
        <select class="select" id="pf-status" name="status">${Object.entries(PLAN_STATUS).map(([k, v]) => html`<option value="${k}"${raw(k === (plan?.status ?? 'dang_thuc_hien') ? ' selected' : '')}>${v.label}</option>`)}</select></div>
      <div class="form-field"><label for="pf-note">Ghi chú</label>
        <input class="input" id="pf-note" name="note" value="${plan?.note ?? ''}"></div>
      <p class="caption form-field--full" id="pf-error" role="alert" style="color:var(--alert-ink)"></p>
    </form>`,
    foot: html`<button type="button" class="btn" data-close>Hủy</button><button type="submit" form="plan-form" class="btn btn--primary">${icon('check')}Lưu kế hoạch</button>`,
    onMount(dlgEl) {
      const form = dlgEl.querySelector('#plan-form');
      const dimSel = form.querySelector('#pf-dim');
      const mSel = form.querySelector('#pf-measure');
      dimSel.addEventListener('change', () => {
        mSel.innerHTML = measureOptions(dimSel.value).map(String).join('');
      });
      mSel.addEventListener('change', () => {
        const m = lib.find((x) => x.code === mSel.value);
        if (m) form.querySelector('#pf-action').value = m.text;
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(form));
        if (!fd.action.trim() || !fd.owner.trim() || !fd.due) {
          form.querySelector('#pf-error').textContent = 'Cần nhập nội dung hành động, người phụ trách và hạn.';
          return;
        }
        planStore.upsert({
          ...(plan || {}),
          id: plan?.id,
          classId: plan?.classId ?? d.cls.id,
          waveId: plan?.waveId ?? d.wave?.id,
          dimension: fd.dimension,
          measureCode: fd.measureCode || null,
          action: fd.action.trim(),
          owner: fd.owner.trim(),
          due: fd.due,
          status: fd.status,
          note: fd.note.trim(),
          createdBy: plan?.createdBy ?? ctx.user.name,
        });
        dlgEl.close();
        toast(plan ? 'Đã cập nhật kế hoạch' : 'Đã lưu kế hoạch cải tiến');
        if (ctx.params.sub === 'ke-hoach') history.replaceState(null, '', `#/lop/${encodeURIComponent(d.cls.id)}${d.wave ? `?dot=${d.wave.dot}` : ''}`);
        ctx.route();
      });
    },
  });
  return dlg;
}

