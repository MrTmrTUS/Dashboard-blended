// M3 – Sinh viên: "Ai cần hỗ trợ ngay?" – chế độ MÔ PHỎNG trong đề tài.
// Chỉ giảng viên phụ trách và cố vấn học tập được xem; mọi lượt xem đều được ghi nhật ký.
import { modelSummary, students, studentScopeClasses, visibleSemesters } from '../api.js';
import { fmtInt, fmtPct, fmtScore } from '../core/format.js';
import { auc, isNum } from '../core/stats.js';
import { contacted, state } from '../store.js';
import { banner, chartCard, dataTable, emptyState, kpiTile, legend, pageHead, plainCard, statusChip, toast } from '../ui/components.js';
import { mountChart, studentScatterOption, theme } from '../ui/charts.js';
import { html, on, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

export const StudentsView = {
  screen: 'M3',
  layout: 'assistant',
  title: () => 'Sinh viên (mô phỏng)',
  filters(ctx) {
    const sems = visibleSemesters(ctx.user);
    const semesterId = ctx.data?.semesterId;
    const classes = studentScopeClasses(ctx.user, semesterId);
    return [
      { key: 'ky', label: 'Học kỳ', value: semesterId, options: [...sems].reverse().map((s) => ({ value: s.id, label: s.label })) },
      {
        key: 'lop',
        label: 'Lớp',
        wide: true,
        value: ctx.data?.classId ?? '',
        options: [{ value: '', label: ctx.user.role === 'cvht' ? 'Tất cả sinh viên tôi phụ trách' : 'Tất cả lớp của tôi' }, ...classes.map((c) => ({ value: c.id, label: c.name }))],
      },
    ];
  },
  meta: () => html`<span class="data-badge data-badge--sim">Mô phỏng – không dùng để xếp loại</span>`,
  prepare(ctx) {
    const sems = visibleSemesters(ctx.user);
    const semesterId = sems.some((s) => s.id === ctx.query.ky) ? ctx.query.ky : sems[sems.length - 1]?.id;
    const classes = studentScopeClasses(ctx.user, semesterId);
    const classId = classes.some((c) => c.id === ctx.query.lop) ? ctx.query.lop : '';
    const res = students(ctx.user, { semesterId, classId });
    const labeled = res.rows.filter((r) => isNum(r.prob) && r.low !== null);
    ctx.data = {
      ...res,
      semesterId,
      classId,
      semester: state.dataset.semesters.find((s) => s.id === semesterId),
      showAll: ctx.query.tat_ca === '1',
      retroAuc: labeled.length >= 20 && labeled.some((r) => r.low) && labeled.some((r) => !r.low) ? auc(labeled.map((r) => r.prob), labeled.map((r) => (r.low ? 1 : 0))) : null,
      nLabeled: labeled.length,
      model: modelSummary(),
    };
  },
  render(ctx) {
    const d = ctx.data;
    const cfg = state.cfg;
    const t = theme();
    const need = d.rows.filter((r) => r.status === 'alert' || r.status === 'warn');
    const shown = d.showAll ? d.rows : need;
    const scopeText = ctx.user.role === 'cvht' ? 'sinh viên do tôi làm cố vấn' : 'sinh viên các lớp tôi phụ trách';
    return html`${pageHead({
      crumbs: [{ label: 'Trường' }, { label: 'Sinh viên' }],
      title: 'Ai cần hỗ trợ ngay?',
      question: `Sinh viên – ${scopeText} · ${d.semester?.label ?? ''}`,
    })}
      ${banner({
        kind: 'sim',
        iconText: '⚠',
        title: 'Mô phỏng – không dùng để xếp loại hay xử lý học vụ',
        body: html`Dữ liệu cấp sinh viên đã mã hóa (mã nghiên cứu, không lưu mã sinh viên thật) và chỉ gồm sinh viên đồng ý liên kết điểm. Trong đề tài, cảnh báo cấp sinh viên chỉ được kiểm chứng hồi cứu. ${icon('shield', { size: 14 })} Lượt xem này đã được ghi vào nhật ký truy cập.`,
      })}
      <div class="grid grid--kpi">
        ${kpiTile({ label: 'Sinh viên được liên kết', value: fmtInt(d.rows.length), caption: 'có điểm quá trình hoặc điểm gắn kết trong phạm vi' })}
        ${kpiTile({ label: 'Mức can thiệp', value: raw(`<span class="status-count">${fmtInt(d.counts.alert)} ${statusChip('alert')}</span>`), caption: `gắn kết < ${fmtScore(cfg.stuEngRed, 1)} hoặc điểm quá trình < ${fmtScore(cfg.stuProcRed, 1)}` })}
        ${kpiTile({ label: 'Mức theo dõi', value: raw(`<span class="status-count">${fmtInt(d.counts.warn)} ${statusChip('warn')}</span>`), caption: `gắn kết < ${fmtScore(cfg.stuEngYellow, 1)} hoặc điểm quá trình < ${fmtScore(cfg.stuProcYellow, 1)}` })}
        ${kpiTile({
          label: 'Mô hình nguy cơ (logistic)',
          value: d.retroAuc !== null ? html`AUC ${fmtScore(d.retroAuc)}` : d.model ? html`AUC ${fmtScore(d.model.auc)}` : '–',
          caption: d.retroAuc !== null
            ? `kiểm chứng hồi cứu trên ${fmtInt(d.nLabeled)} sinh viên đã có điểm học phần (huấn luyện trên học kỳ khác)`
            : d.model
              ? `học kỳ chưa có điểm học phần: mô hình huấn luyện trên ${fmtInt(d.model.n)} sinh viên các học kỳ trước (kiểm định chéo 10 lần)`
              : 'chưa đủ dữ liệu có điểm học phần để huấn luyện',
        })}
      </div>
      ${d.rows.length
        ? html`<div class="mt-16">${chartCard({
            id: 'card-scatter',
            title: 'Gắn kết × điểm quá trình',
            sub: `${fmtInt(d.rows.filter((r) => isNum(r.eng) && isNum(r.process)).length)} sinh viên có cả hai chỉ số · đường ngưỡng chia 4 vùng`,
            legend: legend([{ kind: 'dot', color: t.ok, label: '● ✔ Ổn định' }, { kind: 'dot', color: t.warn, label: '▲ ⚠ Theo dõi' }, { kind: 'dot', color: t.alert, label: '◆ ✖ Can thiệp' }, { kind: 'dash', color: t.warn, label: 'Ngưỡng theo dõi' }, { kind: 'dash', color: t.alert, label: 'Ngưỡng can thiệp' }]),
            chart: html`<div class="chart chart--lg" id="chart-students"></div>`,
            table: riskTable(d.rows, d, true),
            howto: html`<ul><li>Trục ngang là điểm gắn kết học tập (12 chỉ báo hành vi, cảm xúc, nhận thức), trục dọc là điểm quá trình (thang 10).</li>
              <li>Góc trái dưới là nhóm nguy cơ cao nhất: vừa ít gắn kết vừa có điểm quá trình thấp.</li>
              <li>Xác suất nguy cơ do mô hình logistic dự báo khả năng điểm học phần dưới ${fmtScore(cfg.lowOutcome, 1)}; ngưỡng cuối cùng chọn theo đường ROC (M0 › Kiểm chứng › TC1).</li></ul>`,
          })}</div>`
        : html`<div class="mt-16">${plainCard({ body: emptyState({ title: 'Chưa có sinh viên trong phạm vi', text: 'Chọn học kỳ khác hoặc kiểm tra phân công cố vấn ở M0 › Danh mục.' }) })}</div>`}
      ${d.rows.length
        ? html`<div class="mt-16">${plainCard({
            title: 'Danh sách nguy cơ',
            sub: d.showAll ? `Tất cả ${fmtInt(d.rows.length)} sinh viên` : `${fmtInt(need.length)} sinh viên cần hỗ trợ (mức theo dõi, can thiệp) · sắp theo mức và xác suất nguy cơ`,
            actions: html`<a class="btn btn--sm" href="${hrefWith(ctx, { tat_ca: d.showAll ? '' : '1' })}">${d.showAll ? 'Chỉ sinh viên cần hỗ trợ' : `Hiện cả ${fmtInt(d.rows.length - need.length)} sinh viên ổn định`}</a>`,
            body: shown.length ? html`<div class="risk-table">${riskTable(shown, d)}</div><div class="risk-cards">${riskCards(shown, d)}</div>` : emptyState({ title: 'Không có sinh viên cần hỗ trợ', iconText: '✔' }),
            foot: html`<span>Ô “đã liên hệ” giúp giảng viên, cố vấn theo dõi việc hỗ trợ; trạng thái lưu kèm người đánh dấu và thời điểm.</span>`,
          })}</div>`
        : ''}`;
  },
  mount(root, ctx) {
    const d = ctx.data;
    const el = root.querySelector('#chart-students');
    const pts = d.rows.filter((r) => isNum(r.eng) && isNum(r.process));
    if (el && pts.length) {
      mountChart(el, studentScatterOption({ points: pts, cfg: state.cfg }), {
        ariaLabel: `Biểu đồ phân tán ${pts.length} sinh viên: ${d.counts.alert} mức can thiệp, ${d.counts.warn} mức theo dõi. Xem dạng bảng để đọc từng sinh viên.`,
      });
    }
    on(root, 'change', '[data-contact]', (e, box) => {
      contacted.set(box.dataset.contact, box.checked, ctx.user);
      root.querySelectorAll(`[data-contact="${CSS.escape(box.dataset.contact)}"]`).forEach((b) => (b.checked = box.checked));
      toast(box.checked ? 'Đã đánh dấu “đã liên hệ”' : 'Đã bỏ đánh dấu');
    });
  },
  assistant(ctx) {
    const d = ctx.data;
    if (!d.rows.length) return null;
    return {
      kind: 'students',
      key: `${ctx.user.id}|${d.semesterId}|${d.classId}`,
      title: d.classId ? state.mart.classById.get(d.classId)?.name : 'sinh viên phụ trách',
      input: { ...d, semesterLabel: d.semester?.label },
      extra: html`<section class="ai-section"><div class="ai-section__title">Gợi ý hỗ trợ (hướng dẫn mẫu)</div>
        <ul class="small" style="margin:0;padding-left:18px">
          <li>Gắn kết thấp: trao đổi riêng, mời vào nhóm học tập, theo dõi hoạt động LMS hằng tuần.</li>
          <li>Điểm quá trình thấp: chỉ ra phần kiến thức còn hổng, nhắc hạn nộp bài, giới thiệu giờ giải đáp.</li>
          <li>Thấp cả hai: hẹn gặp trực tiếp cùng cố vấn học tập, lập kế hoạch học tập cá nhân.</li>
        </ul></section>`,
    };
  },
};

function hrefWith(ctx, patch) {
  const q = { ky: ctx.data.semesterId, lop: ctx.data.classId, tat_ca: ctx.data.showAll ? '1' : '', ...patch };
  const s = Object.entries(q).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `#/sinh-vien${s ? `?${s}` : ''}`;
}

function contactBox(r) {
  const key = `${r.researchCode}|${r.classId}`;
  return html`<label class="check" title="${r.contacted ? `Đánh dấu bởi ${r.contacted.by}` : 'Chưa liên hệ'}"><input type="checkbox" data-contact="${key}"${raw(r.contacted ? ' checked' : '')}><span class="sr-only">Đã liên hệ ${r.researchCode}</span></label>`;
}

function prob(p) {
  if (!isNum(p)) return html`<span class="muted">–</span>`;
  return html`<span class="prob"><span class="prob__track" aria-hidden="true"><span class="prob__fill" style="${raw(`display:block;width:${(p * 100).toFixed(0)}%`)}"></span></span><span class="prob__val">${fmtPct(p)}</span></span>`;
}

function outcome(r) {
  if (r.final === null) return html`<span class="muted">Chưa có</span>`;
  return r.low ? html`<span class="chip chip--alert">${fmtScore(r.final, 1)} · thấp</span>` : html`<span class="chip chip--ok">${fmtScore(r.final, 1)}</span>`;
}

function riskTable(rows, d, compact = false) {
  return dataTable({
    compact,
    columns: [
      { label: 'Mã nghiên cứu', render: (r) => html`<b>${r.researchCode}</b>${r.homeroom ? html`<br><span class="caption">${r.homeroom}</span>` : ''}` },
      { label: 'Lớp học phần', render: (r) => r.cls?.name ?? r.classId },
      { label: 'Mức', render: (r) => statusChip(r.status, { label: r.status === 'ok' ? 'Ổn định' : undefined }) },
      { label: 'Gắn kết', num: true, render: (r) => fmtScore(r.eng) },
      { label: 'Điểm QT', num: true, render: (r) => fmtScore(r.process, 1) },
      { label: 'Xác suất nguy cơ', render: (r) => prob(r.prob) },
      ...(compact ? [] : [{ label: 'Gợi ý hỗ trợ', render: (r) => html`<span class="small">${r.suggestion}</span>` }]),
      ...(d.hasOutcome ? [{ label: 'Kết quả thực tế (hồi cứu)', render: outcome }] : []),
      ...(compact ? [] : [{ label: 'Đã liên hệ', render: contactBox }]),
    ],
    rows,
  });
}

function riskCards(rows, d) {
  return html`<ul class="list">${rows.map(
    (r) => html`<li class="list-row" style="align-items:flex-start">
      ${statusChip(r.status, { label: r.status === 'ok' ? 'Ổn định' : undefined })}
      <span class="list-row__main"><span class="list-row__title">${r.researchCode}</span> <span class="list-row__meta">· ${r.cls?.name ?? ''}</span><br>
        <span class="list-row__meta">Gắn kết ${fmtScore(r.eng)} · Điểm QT ${fmtScore(r.process, 1)} · Nguy cơ ${isNum(r.prob) ? fmtPct(r.prob) : '–'}${d.hasOutcome && r.final !== null ? ` · Điểm HP ${fmtScore(r.final, 1)}` : ''}</span><br>
        <span class="small">${r.suggestion}</span></span>
      ${contactBox(r)}
    </li>`,
  )}</ul>`;
}
