// M6 › Cải tiến và báo cáo: "Biện pháp đã làm chưa, kết quả thay đổi thế nào?" (nghiệp vụ 8 – 10)
// Kế hoạch cải tiến CLO lưu chung kho PDCA với khảo sát BL (hiện cả ở M2 và M0 › Xuất minh chứng PDCA).
import { canSee, cloCanPlan, cloStudentLevel } from '../access.js';
import { cloEntriesFor, cloImprovement, cloMart, cloResult, cloPlans, needOf, semesterLabel } from '../api-clo.js';
import { checkMatrix, errorPareto, itemAnalysis, raterAnalysis } from '../core/clo.js';
import { exportCloCsv } from '../core/clo-import.js';
import { toCsv } from '../core/csv.js';
import { DIMENSIONS, FACTOR_BY_CODE } from '../core/constants.js';
import { fmtDate, fmtDateTime, fmtInt, fmtNum, fmtPct, fmtScore } from '../core/format.js';
import { isNum } from '../core/stats.js';
import { MODES } from '../data/clo-catalog.js';
import { cloNotes, plans as planStore, state } from '../store.js';
import { banner, chartCard, codeTag, dataTable, emptyState, legend, openDialog, pageHead, plainCard, statusChip, toast } from '../ui/components.js';
import { mountChart, theme } from '../ui/charts.js';
import { cloBoxOption, cloRunOption } from '../ui/charts-clo.js';
import { downloadText, html, on, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { library } from './assistant.js';
import { PLAN_STATUS } from './classes.js';
import { cloHash, cloMeta, cloPrepare, cloTabsNav, pctOrDash, rateChip } from './clo-common.js';

export const VERDICT_CLO = {
  pending: { label: 'Chờ đánh giá lại', cls: 'neutral', icon: '…' },
  reached: { label: 'Đạt mục tiêu', cls: 'ok', icon: '✔' },
  improved: { label: 'Có cải thiện', cls: 'warn', icon: '▲' },
  notImproved: { label: 'Chưa cải thiện', cls: 'alert', icon: '▼' },
};
const METRICS = { rate: 'Tỷ lệ đạt CLO học kỳ sau', retest: 'Tỷ lệ đạt sau kiểm tra lại (cùng học kỳ)', rater: 'Độ lệch giữa hai cán bộ chấm', design: 'Kiểm tra ma trận sau phê duyệt' };

function courseDefs(ctx) {
  const d = ctx.data;
  if (!d || d.empty) return [];
  const courses = [...new Map(cloEntriesFor(ctx.user).map((e) => [e.cls.courseId, state.dataset.courses.find((c) => c.id === e.cls.courseId)])).values()].filter(Boolean);
  return [
    { key: 'hp', label: 'Học phần', wide: true, value: d.course.id, options: courses.map((c) => ({ value: c.id, label: c.name })), toHash: (v) => cloHash('cai-tien', { hp: v }) },
    { key: 'clo', label: 'Chỉ số', value: d.clo, options: [{ value: '', label: 'Đạt mọi CLO đã đánh giá' }, ...(d.rv?.clos || []).map((c) => ({ value: c.code, label: `Tỷ lệ đạt ${c.code}` }))], toHash: (v) => cloHash('cai-tien', { hp: d.course.id, clo: v }) },
  ];
}

export const CloImproveView = {
  screen: 'M6',
  layout: 'wide',
  title: () => 'Cải tiến và báo cáo – kết quả CLO',
  filters: courseDefs,
  meta: (ctx) => cloMeta(ctx.data?.rv),
  prepare(ctx) {
    cloPrepare(ctx);
    ctx.data = cloImprovement(ctx.user, { courseId: ctx.query.hp, clo: ctx.query.clo ?? 'CLO3' });
  },
  render(ctx) {
    const d = ctx.data;
    if (d.empty) return html`${pageHead({ title: 'Cải tiến và báo cáo' })}${cloTabsNav(ctx, 'cai-tien')}${plainCard({ body: emptyState({ title: 'Chưa có học phần có dữ liệu CLO trong phạm vi' }) })}`;
    const t = theme();
    const metricName = d.clo ? `Tỷ lệ đạt ${d.clo}` : 'Tỷ lệ đạt mọi CLO đã đánh giá';
    return html`${pageHead({
      crumbs: [{ label: 'Kết quả CLO', href: cloHash('lop') }, { label: 'Cải tiến và báo cáo' }],
      title: `Cải tiến và báo cáo – ${d.course.name}`,
      question: 'Biện pháp cải tiến đã thực hiện chưa, kết quả thay đổi thế nào qua các học kỳ?',
    })}
      ${cloTabsNav(ctx, 'cai-tien')}
      <p class="scope-line" role="status"><span class="scope-line__label">${icon('filter', { size: 15 })}Đang phân tích:</span> ${d.course.name} · ${metricName} · ${d.series.length} học kỳ · <b>n = ${fmtInt(d.series.reduce((s, p) => s + p.n, 0))}</b> lượt sinh viên đủ minh chứng</p>
      <div class="grid grid--60-40 grid--start">
        ${chartCard({
          id: 'card-clo-run',
          title: `${metricName} qua các học kỳ`,
          sub: 'Biểu đồ diễn biến (run chart): cùng chỉ số, cùng cách tính · đường trung vị · mốc vàng là thời điểm thực hiện cải tiến · chấm rỗng: tạm tính',
          legend: legend([{ kind: 'line', color: t.blue, label: metricName }, { kind: 'line', color: t.grey, label: 'Trung vị' }, { kind: 'dash', color: t.ink2, label: 'Mục tiêu' }, { kind: 'line', color: t.gold, label: 'Thực hiện cải tiến' }]),
          chart: d.series.length ? html`<div class="chart" id="chart-clo-run"></div>` : emptyState({ title: 'Chưa có dữ liệu' }),
          table: dataTable({ compact: true, columns: [{ label: 'Học kỳ', render: (p) => semesterLabel(p.semesterId) }, { label: 'Đạt / đủ minh chứng', num: true, render: (p) => `${fmtInt(p.k)}/${fmtInt(p.n)}` }, { label: 'Tỷ lệ', num: true, render: (p) => pctOrDash(p.value) }, { label: 'Lớp', num: true, render: (p) => fmtInt(p.classes) }, { label: 'Bộ quy tắc', key: 'version' }, { label: '', render: (p) => (p.inProgress ? 'tạm tính' : '') }], rows: d.series }),
          howto: html`<ul><li>Run chart theo dõi một chỉ số nhất quán qua các đợt; với vài học kỳ ban đầu, biểu đồ này dễ diễn giải hơn biểu đồ kiểm soát.</li><li>Đường mục tiêu ${fmtPct(d.target)} là mục tiêu của bộ quy tắc, không phải giới hạn kiểm soát thống kê.</li><li>Chỉ so sánh các học kỳ cùng bộ quy tắc (cùng đề cương, cấu trúc đề, thang điểm).</li></ul>`,
        })}
        ${plainCard({
          title: 'Biểu đồ kiểm soát (giai đoạn sau)',
          sub: 'Biểu đồ p cho tỷ lệ chưa đạt qua các đợt tương đương',
          body: d.control.enabled
            ? dataTable({ compact: true, columns: [{ label: 'Đợt', key: 'label' }, { label: 'Tỷ lệ chưa đạt', num: true, render: (p) => fmtPct(p.p) }, { label: 'LCL – UCL', num: true, render: (p) => `${fmtPct(p.lcl)} – ${fmtPct(p.ucl)}` }, { label: '', render: (p) => (p.out ? statusChip('alert', { label: 'Ngoài giới hạn' }) : '') }], rows: d.control.points })
            : html`<div class="gate"><span class="gate__n">${fmtInt(d.control.rounds)}/${fmtInt(d.control.minRounds)}</span><span>đợt tương đương có kết quả cuối kỳ</span></div>
              <p class="small">Chưa bật: giới hạn kiểm soát phụ thuộc cỡ nhóm từng đợt (p̄ ± 3√(p̄(1 − p̄)/nᵢ)) và giả định các đợt tương đương. Cần chuỗi đủ dài (đổi ở M0 › Cấu hình) – trong lúc chờ, dùng biểu đồ diễn biến bên cạnh.</p>`,
          foot: html`<span>Đường mục tiêu “70% sinh viên đạt” không phải giới hạn kiểm soát.</span>`,
        })}
      </div>
      <div class="mt-16">${plansCard(ctx, d)}</div>
      <div class="grid grid--2 grid--start mt-16">
        ${chartCard({
          id: 'card-clo-sem-box',
          title: 'So sánh học kỳ',
          sub: `${d.clo ? `Điểm ${d.clo}` : 'Điểm học phần'} của tất cả lớp trong học kỳ · cùng thang điểm 10 · n dưới mỗi hộp`,
          chart: d.semBoxes.some((b) => b.stats) ? html`<div class="chart" id="chart-clo-sem-box"></div>` : emptyState({ title: 'Chưa có dữ liệu' }),
          table: dataTable({ compact: true, columns: [{ label: 'Học kỳ', key: 'label' }, { label: 'n', num: true, render: (b) => fmtInt(b.n) }, { label: 'Trung vị', num: true, render: (b) => fmtScore(b.stats?.median) }, { label: 'TB', num: true, render: (b) => fmtScore(b.stats?.mean) }], rows: d.semBoxes }),
        })}
        ${compareCard(d)}
      </div>
      <div class="mt-16">${exportCard(ctx, d)}</div>`;
  },
  mount(root, ctx) {
    const d = ctx.data;
    if (!d || d.empty) return;
    const run = root.querySelector('#chart-clo-run');
    if (run) {
      const markers = d.plans
        .filter((p) => p.metric === 'rate' || p.metric === 'rater')
        .map((p) => {
          const after = d.series.find((s) => semOrder(s.semesterId) > semOrder(p.semesterId));
          return after ? { at: after.label, label: p.id } : null;
        })
        .filter(Boolean);
      const uniq = [...new Map(markers.map((m) => [m.at, { at: m.at, label: markers.filter((x) => x.at === m.at).map((x) => x.label).join(', ') }])).values()];
      mountChart(run, cloRunOption({ points: d.series, median: d.run.median, target: d.target, markers: uniq }), { ariaLabel: `Diễn biến tỷ lệ đạt qua ${d.series.length} học kỳ` });
    }
    const box = root.querySelector('#chart-clo-sem-box');
    if (box) mountChart(box, cloBoxOption({ boxes: d.semBoxes.map((b) => ({ ...b, cls: { name: b.label } })), label: d.clo ? `Điểm ${d.clo}` : 'Điểm học phần', pass: d.clo ? d.rv.rules.pass : d.rv.rules.coursePass }), { ariaLabel: 'Box plot điểm theo học kỳ' });
    on(root, 'click', '[data-add-clo-plan]', () => openCloPlanDialog(ctx, d));
    on(root, 'click', '[data-edit-clo-plan]', (e, b) => openCloPlanDialog(ctx, d, planStore.all().find((p) => p.id === b.dataset.editCloPlan)));
    on(root, 'click', '[data-del-clo-plan]', (e, b) => {
      if (!confirm('Xóa kế hoạch cải tiến này?')) return;
      planStore.remove(b.dataset.delCloPlan);
      toast('Đã xóa kế hoạch');
      ctx.route();
    });
    on(root, 'click', '[data-csv]', (e, b) => exportFile(ctx, d, b.dataset.csv, root.querySelector('#rep-class')?.value));
    on(root, 'change', '#rep-class', (e, sel) => {
      const a = root.querySelector('#rep-open');
      if (a) a.href = cloHash('bao-cao', { lop: sel.value });
    });
  },
};

const semOrder = (id) => {
  const m = String(id).match(/^HK([123])-(\d{2})(\d{2})$/);
  return m ? Number(m[2]) * 10 + Number(m[1]) : 0;
};

function verdictCell(p) {
  const e = p.eval;
  const v = VERDICT_CLO[e.verdict] || VERDICT_CLO.pending;
  const fmtV = (x) => (isNum(x) ? fmtPct(x) : '…');
  return html`<span class="chip chip--${v.cls}"><span class="chip__icon" aria-hidden="true">${v.icon}</span>${v.label}</span>${e.text ? html`<br><span class="caption">${e.text}</span>` : isNum(e.before) ? html`<br><span class="caption">${e.label}: ${fmtV(e.before)} → <b>${fmtV(e.after)}</b>${e.afterLabel ? ` · ${e.afterLabel}` : ''}</span>` : ''}`;
}

function plansCard(ctx, d) {
  const editable = d.canPlan;
  return plainCard({
    title: 'Theo dõi cải tiến học phần',
    sub: 'Vấn đề · minh chứng · biện pháp (gắn phương diện giảng dạy BL) · người phụ trách · hạn · kết quả đánh giá lại tự động',
    actions: editable ? html`<button type="button" class="btn btn--sm" data-add-clo-plan>${icon('plus')}Thêm cải tiến</button>` : '',
    body: d.plans.length
      ? dataTable({
          columns: [
            { label: 'Mã · học kỳ', render: (p) => html`<b>${p.id}</b><br><span class="caption">${semesterLabel(p.semesterId)} · ${p.scope === 'class' ? 'cấp lớp' : 'cấp học phần'}</span>` },
            { label: 'Vấn đề · minh chứng', render: (p) => html`${p.clo ? html`<span class="code-tag code-tag--KQ">${p.clo}</span> ` : ''}${p.issue}${p.evidence ? html`<br><span class="caption">Minh chứng: ${p.evidence}</span>` : ''}` },
            { label: 'Biện pháp', render: (p) => html`${p.action}${p.dimension ? html`<br><span class="caption">${codeTag(p.dimension)} ${FACTOR_BY_CODE[p.dimension]?.short ?? ''}${p.measureCode ? ` · ${p.measureCode}` : ''}</span>` : ''}` },
            { label: 'Người phụ trách · hạn', render: (p) => html`${p.owner}<br><span class="caption">hạn ${fmtDate(p.due)}</span>` },
            { label: 'Trạng thái', render: (p) => statusChip(PLAN_STATUS[p.status]?.chip ?? 'na', { label: PLAN_STATUS[p.status]?.label ?? p.status }) },
            { label: 'Đánh giá lại', render: (p) => html`${verdictCell(p)}${p.reassess ? html`<br><span class="caption">${p.reassess}</span>` : ''}` },
            ...(editable ? [{ label: '', render: (p) => html`<span style="white-space:nowrap"><button type="button" class="btn-tool" data-edit-clo-plan="${p.id}" aria-label="Sửa ${p.id}">${icon('edit')}</button><button type="button" class="btn-tool" data-del-clo-plan="${p.id}" aria-label="Xóa ${p.id}">${icon('trash')}</button></span>` }] : []),
          ],
          rows: d.plans,
        })
      : emptyState({ title: 'Chưa có kế hoạch cải tiến', text: editable ? 'Thêm từ đây, hoặc ghi nhiệm vụ hỗ trợ vào kế hoạch ở mục Cần hỗ trợ.' : '' }),
    foot: html`<span>Kế hoạch lưu chung với kế hoạch PDCA của khảo sát BL – xem cả ở trang lớp (M2) và M0 › Xuất minh chứng PDCA.</span>`,
  });
}

function compareCard(d) {
  return plainCard({
    title: 'So sánh lớp và học kỳ',
    sub: 'Chỉ so sánh khi cùng bộ quy tắc, cùng cấu trúc đánh giá và thang điểm · luôn kèm sĩ số',
    body: html`<div class="table-scroll">${dataTable({
      compact: true,
      columns: [
        { label: 'Lớp', render: (r) => html`<span title="${r.cls.name} · ${r.lecturer?.name ?? ''}"><b>${r.cls.lineage.split('-').pop()}</b> ${semesterLabel(r.cls.semesterId).replace(/(\d{2})(\d{2})–\d{2}(\d{2})/, '$2–$3')}</span>` },
        { label: 'n', num: true, render: (r) => fmtInt(r.res.nActive) },
        { label: 'Bộ quy tắc', render: (r) => html`${r.rv.version}${r.comparable ? '' : html` <span class="chip chip--warn">khác cấu trúc</span>`}${r.res.inProgress ? html` <span class="chip chip--neutral">tạm tính</span>` : ''}` },
        ...d.rv.cloCodes.map((c) => ({ label: c, render: (r) => rateChip(r.res.clo[c]) })),
        { label: 'Điểm HP TB', num: true, render: (r) => (r.res.complete ? fmtScore(r.res.course.mean) : '–') },
      ],
      rows: d.comparison,
    })}</div>`,
  });
}

function exportCard(ctx, d) {
  const classes = d.anchors.filter((c) => canSee(ctx.user, 'M6'));
  const def = classes[classes.length - 1];
  const studentLevel = classes.some((c) => cloStudentLevel(ctx.user, c));
  return plainCard({
    title: 'Lập báo cáo học phần',
    sub: 'Kết quả CLO, dữ liệu còn thiếu, nhận định của giảng viên, kế hoạch cải tiến; truy lại được điểm nguồn',
    body: html`<div class="form-grid">
        <div class="form-field"><label for="rep-class">Lớp học phần</label><select class="select" id="rep-class">${classes.map((c) => html`<option value="${c.id}"${raw(c.id === def?.id ? ' selected' : '')}>${c.name} · ${semesterLabel(c.semesterId)}</option>`)}</select></div>
        <div class="form-field"><span class="label">Báo cáo in được (PDF qua lệnh In)</span><a class="btn btn--primary" id="rep-open" href="${cloHash('bao-cao', { lop: def?.id })}">${icon('print')}Mở báo cáo học phần</a></div>
      </div>
      <div class="page-actions" style="margin-top:12px">
        <button type="button" class="btn btn--sm" data-csv="lop">${icon('download')}Kết quả CLO theo lớp (CSV)</button>
        ${studentLevel ? html`<button type="button" class="btn btn--sm" data-csv="sv">${icon('download')}Kết quả CLO từng sinh viên (CSV)</button><button type="button" class="btn btn--sm" data-csv="thieu">${icon('download')}Dữ liệu còn thiếu (CSV)</button>` : ''}
        ${['gv', 'qlcl', 'admin'].includes(ctx.user.role) ? html`<button type="button" class="btn btn--sm" data-csv="nguon">${icon('download')}Điểm nguồn của lớp (CSV)</button>` : ''}
        <button type="button" class="btn btn--sm" data-csv="ke-hoach">${icon('download')}Kế hoạch cải tiến (CSV)</button>
      </div>`,
    foot: html`<span>Mỗi số trong báo cáo truy được về câu hỏi/tiêu chí, lần đánh giá, mã đề, người chấm của điểm nguồn (diem_chi_tiet.csv).</span>`,
  });
}

function exportFile(ctx, d, kind, classId) {
  const ds = state.dataset;
  const e = cloMart().byId.get(classId);
  const v = (x, n = 2) => (isNum(x) ? fmtNum(x, n) : '');
  if (kind === 'lop') {
    const cols = ['ma_lop_hp', 'lop', 'hoc_ky', 'bo_quy_tac', 'tam_tinh', 'si_so', ...d.rv.cloCodes.flatMap((c) => [`${c}_dat`, `${c}_n`, `${c}_ty_le`, `${c}_diem_tb`, `${c}_thieu_minh_chung`]), 'diem_hoc_phan_tb'];
    const rows = d.comparison.map((r) => {
      const o = { ma_lop_hp: r.cls.id, lop: r.cls.name, hoc_ky: semesterLabel(r.cls.semesterId), bo_quy_tac: r.rv.version, tam_tinh: r.res.inProgress ? 1 : 0, si_so: r.res.nActive, diem_hoc_phan_tb: r.res.complete ? v(r.res.course.mean) : '' };
      for (const c of d.rv.cloCodes) {
        const x = r.res.clo[c];
        Object.assign(o, { [`${c}_dat`]: x.notAssessed ? '' : x.nAchieved, [`${c}_n`]: x.notAssessed ? '' : x.n, [`${c}_ty_le`]: x.notAssessed ? '' : v(x.rate, 3), [`${c}_diem_tb`]: v(x.mean), [`${c}_thieu_minh_chung`]: x.nInsufficient });
      }
      return o;
    });
    downloadText(`ket_qua_clo_theo_lop_${d.course.id}.csv`, toCsv(cols, rows, { delimiter: ';' }));
    return;
  }
  if (!e) return toast('Chọn lớp học phần');
  if ((kind === 'sv' || kind === 'thieu') && !cloStudentLevel(ctx.user, e.cls)) return toast('Chỉ giảng viên phụ trách lớp tải được dữ liệu cấp sinh viên');
  if (kind === 'sv' || kind === 'thieu') {
    const res = cloResult(classId, 'latest');
    const rv = e.rv;
    if (kind === 'sv') {
      const cols = ['ma_nghien_cuu', ...rv.cloCodes.flatMap((c) => [`${c}_diem`, `${c}_trang_thai`, `${c}_bao_phu`]), 'diem_qua_trinh', 'diem_thi', 'diem_hoc_phan'];
      const lab = { achieved: 'dat', not_achieved: 'chua_dat', insufficient: 'chua_du_minh_chung', not_assessed: 'chua_danh_gia' };
      downloadText(`ket_qua_clo_${classId}.csv`, toCsv(cols, res.students.map((s) => ({ ma_nghien_cuu: s.code, ...Object.fromEntries(rv.cloCodes.flatMap((c) => [[`${c}_diem`, v(s.clo[c].score)], [`${c}_trang_thai`, lab[s.clo[c].status]], [`${c}_bao_phu`, v(s.clo[c].cov, 3)]])), diem_qua_trinh: v(s.process, 1), diem_thi: v(s.exam, 1), diem_hoc_phan: v(s.course, 1) })), { delimiter: ';' }));
    } else {
      const rows = res.students.map((s) => ({ s, n: needOf(s, rv) })).filter((x) => x.n.issues.some((i) => ['missing', 'banned', 'pending', 'insufficient'].includes(i.kind)));
      downloadText(`du_lieu_con_thieu_${classId}.csv`, toCsv(['ma_nghien_cuu', 'van_de'], rows.map((x) => ({ ma_nghien_cuu: x.s.code, van_de: x.n.issues.filter((i) => ['missing', 'banned', 'pending', 'insufficient'].includes(i.kind)).map((i) => i.label).join('; ') })), { delimiter: ';' }));
    }
    return;
  }
  if (kind === 'nguon') {
    downloadText(`diem_chi_tiet_${classId}.csv`, exportCloCsv(ds, 'diem_chi_tiet', { classIds: [classId] }));
    return;
  }
  if (kind === 'ke-hoach') {
    const cols = ['ma_ke_hoach', 'hoc_ky', 'pham_vi', 'clo', 'van_de', 'minh_chung', 'bien_phap', 'phuong_dien_bl', 'ma_bien_phap', 'nguoi_phu_trach', 'han', 'trang_thai', 'chi_so_danh_gia_lai', 'truoc', 'sau', 'ket_qua'];
    downloadText(`cai_tien_clo_${d.course.id}.csv`, toCsv(cols, d.plans.map((p) => ({ ma_ke_hoach: p.id, hoc_ky: semesterLabel(p.semesterId), pham_vi: p.scope === 'class' ? 'lớp' : 'học phần', clo: p.clo, van_de: p.issue, minh_chung: p.evidence, bien_phap: p.action, phuong_dien_bl: p.dimension, ma_bien_phap: p.measureCode ?? '', nguoi_phu_trach: p.owner, han: p.due, trang_thai: PLAN_STATUS[p.status]?.label ?? p.status, chi_so_danh_gia_lai: METRICS[p.metric] ?? '', truoc: isNum(p.eval.before) ? v(p.eval.before, 3) : '', sau: isNum(p.eval.after) ? v(p.eval.after, 3) : '', ket_qua: VERDICT_CLO[p.eval.verdict]?.label ?? '' })), { delimiter: ';' }));
  }
}

function openCloPlanDialog(ctx, d, plan = null) {
  const classes = d.anchors.filter((c) => cloCanPlan(ctx.user, c));
  if (!classes.length) return;
  const lib = library().filter((m) => m.status === 'da_duyet');
  const cls0 = plan ? state.dataset.classes.find((c) => c.id === plan.classId) : classes[classes.length - 1];
  const dims = DIMENSIONS;
  const due = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  openDialog({
    title: plan ? `Sửa kế hoạch ${plan.id}` : 'Thêm cải tiến học phần',
    wide: true,
    body: html`<form id="cp-form" class="form-grid" novalidate>
      <div class="form-field"><label for="cp-class">Lớp (học kỳ phát hiện vấn đề)</label><select class="select" id="cp-class" name="classId">${classes.map((c) => html`<option value="${c.id}"${raw(c.id === cls0?.id ? ' selected' : '')}>${c.name} · ${semesterLabel(c.semesterId)}</option>`)}</select></div>
      <div class="form-field"><label for="cp-scope">Phạm vi</label><select class="select" id="cp-scope" name="scope"><option value="course"${raw(plan?.scope !== 'class' ? ' selected' : '')}>Cấp học phần (mọi lớp, học kỳ sau)</option><option value="class"${raw(plan?.scope === 'class' ? ' selected' : '')}>Cấp lớp</option></select></div>
      <div class="form-field"><label for="cp-clo">CLO</label><select class="select" id="cp-clo" name="clo"><option value="">(thiết kế đánh giá – nhiều CLO)</option>${d.rv.clos.map((c) => html`<option value="${c.code}"${raw(c.code === (plan?.clo ?? d.clo) ? ' selected' : '')}>${c.code} · ${c.short}</option>`)}</select></div>
      <div class="form-field"><label for="cp-metric">Đánh giá lại bằng</label><select class="select" id="cp-metric" name="metric">${Object.entries(METRICS).map(([k, v]) => html`<option value="${k}"${raw(k === (plan?.metric ?? 'rate') ? ' selected' : '')}>${v}</option>`)}</select></div>
      <div class="form-field form-field--full"><label for="cp-issue">Vấn đề</label><textarea class="textarea" id="cp-issue" name="issue" required>${plan?.issue ?? ''}</textarea></div>
      <div class="form-field form-field--full"><label for="cp-evidence">Minh chứng</label><input class="input" id="cp-evidence" name="evidence" value="${plan?.evidence ?? ''}" placeholder="Ví dụ: Pareto dạng lỗi HK1 2025–2026; phân tích câu hỏi câu 2a"></div>
      <div class="form-field"><label for="cp-dim">Phương diện giảng dạy (BL)</label><select class="select" id="cp-dim" name="dimension">${dims.map((c) => html`<option value="${c}"${raw(c === (plan?.dimension ?? 'PS2') ? ' selected' : '')}>${c} · ${FACTOR_BY_CODE[c].short}</option>`)}</select></div>
      <div class="form-field"><label for="cp-measure">Biện pháp từ thư viện</label><select class="select" id="cp-measure" name="measureCode"><option value="">— Tự soạn —</option>${lib.map((m) => html`<option value="${m.code}"${raw(m.code === plan?.measureCode ? ' selected' : '')}>${m.code} · ${m.text.slice(0, 60)}…</option>`)}</select></div>
      <div class="form-field form-field--full"><label for="cp-action">Biện pháp</label><textarea class="textarea" id="cp-action" name="action" required>${plan?.action ?? ''}</textarea></div>
      <div class="form-field"><label for="cp-owner">Người phụ trách</label><input class="input" id="cp-owner" name="owner" required value="${plan?.owner ?? ctx.user.name}"></div>
      <div class="form-field"><label for="cp-due">Hạn</label><input class="input" type="date" id="cp-due" name="due" required value="${plan?.due ?? due}"></div>
      <div class="form-field"><label for="cp-status">Trạng thái</label><select class="select" id="cp-status" name="status">${Object.entries(PLAN_STATUS).map(([k, v]) => html`<option value="${k}"${raw(k === (plan?.status ?? 'dang_thuc_hien') ? ' selected' : '')}>${v.label}</option>`)}</select></div>
      <div class="form-field"><label for="cp-reassess">Cách đánh giá lại</label><input class="input" id="cp-reassess" name="reassess" value="${plan?.reassess ?? ''}" placeholder="Ví dụ: nhiệm vụ tương đương lần 2; kết quả học kỳ sau"></div>
      <p class="caption form-field--full" id="cp-error" role="alert" style="color:var(--alert-ink)"></p>
    </form>`,
    foot: html`<button type="button" class="btn" data-close>Hủy</button><button type="submit" form="cp-form" class="btn btn--primary">${icon('check')}Lưu</button>`,
    onMount(dlg) {
      const form = dlg.querySelector('#cp-form');
      form.querySelector('#cp-measure').addEventListener('change', (e) => {
        const m = lib.find((x) => x.code === e.target.value);
        if (m) {
          form.querySelector('#cp-action').value = m.text;
          form.querySelector('#cp-dim').value = m.dim;
        }
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(form));
        if (!fd.issue.trim() || !fd.action.trim() || !fd.owner.trim() || !fd.due) {
          form.querySelector('#cp-error').textContent = 'Cần nhập vấn đề, biện pháp, người phụ trách và hạn.';
          return;
        }
        const cls = state.dataset.classes.find((c) => c.id === fd.classId);
        planStore.upsert({ ...(plan || {}), id: plan?.id, domain: 'clo', scope: fd.scope, courseId: cls.courseId, classId: cls.id, semesterId: cls.semesterId, clo: fd.clo, metric: fd.metric, item: plan?.item ?? (fd.metric === 'rater' ? 'CK:TL2a' : undefined), dimension: fd.dimension, measureCode: fd.measureCode || null, issue: fd.issue.trim(), evidence: fd.evidence.trim(), action: fd.action.trim(), owner: fd.owner.trim(), due: fd.due, status: fd.status, reassess: fd.reassess.trim(), createdBy: plan?.createdBy ?? ctx.user.name, note: plan?.note ?? '' });
        dlg.close();
        toast(plan ? 'Đã cập nhật kế hoạch' : 'Đã lưu kế hoạch cải tiến');
        ctx.route();
      });
    },
  });
}

// ---- Báo cáo học phần (in được) ---------------------------------------------------------------------

export const CloReportView = {
  screen: 'M6',
  layout: 'wide',
  title: (ctx) => `Báo cáo CLO – ${ctx.data?.cls?.name ?? ''}`,
  meta: (ctx) => cloMeta(ctx.data?.rv),
  prepare(ctx) {
    const f = cloPrepare(ctx);
    if (ctx.user.role === 'cvht' || !f.entry || !f.rv) {
      ctx.data = { empty: true };
      return;
    }
    const e = f.entry;
    const rv = f.rv;
    const res = cloResult(e.cls.id, 'latest');
    const init = cloResult(e.cls.id, 'initial');
    const pareto = errorPareto({ rv, subs: e.subs, errorTypes: cloMart().o.errorTypes });
    const ia = itemAnalysis({ rv, subs: e.subs, semesterId: e.cls.semesterId, outcomes: cloMart().o });
    const raters = raterAnalysis({ rv, subs: e.subs, tol: state.cfg.cloRaterTol ?? 0.5 });
    const plans = cloPlans(ctx.user, e.cls.courseId).filter((p) => p.semesterId === e.cls.semesterId || p.classId === e.cls.id || semOrder(p.semesterId) < semOrder(e.cls.semesterId));
    ctx.data = { cls: e.cls, rv, res, init, pareto, ia, raters, plans, checks: checkMatrix(rv), note: cloNotes.get(e.cls.id), studentLevel: cloStudentLevel(ctx.user, e.cls), lecturer: state.dataset.lecturers.find((l) => l.id === e.cls.lecturerId), faculty: state.dataset.faculties.find((x) => x.id === e.cls.facultyId) };
  },
  render(ctx) {
    const d = ctx.data;
    if (d.empty) return html`${pageHead({ title: 'Báo cáo học phần' })}${plainCard({ body: emptyState({ title: 'Chọn lớp có dữ liệu CLO và bộ quy tắc đã phê duyệt' }) })}`;
    const { res, rv } = d;
    const missing = res.students.filter((s) => s.missingWork.length || s.banned.length);
    const pending = res.students.filter((s) => s.pendingWork.length);
    const insufficient = res.students.filter((s) => s.nInsufficient);
    const flagged = [...d.ia.rows, ...d.ia.mcqRows].filter((r) => r.flags.some((f) => f.level !== 'info'));
    const top = d.pareto.groups[0];
    const lowest = rv.cloCodes.map((c) => res.clo[c]).filter((x) => !x.notAssessed && isNum(x.rate)).sort((a, b) => a.rate - b.rate)[0];
    const canNote = cloStudentLevel(ctx.user, d.cls);
    return html`<div class="report">
      ${pageHead({
        crumbs: [{ label: 'Kết quả CLO', href: cloHash('lop') }, { label: 'Cải tiến và báo cáo', href: cloHash('cai-tien', { hp: d.cls.courseId }) }, { label: 'Báo cáo học phần' }],
        title: `Báo cáo kết quả đánh giá theo CLO – ${d.cls.name}`,
        question: `${semesterLabel(d.cls.semesterId)} · ${d.faculty?.name ?? ''} · GV ${d.lecturer?.name ?? ''}`,
        actions: html`<button type="button" class="btn btn--primary" data-print>${icon('print')}In / lưu PDF</button>`,
      })}
      ${res.inProgress ? banner({ kind: 'warn', iconText: '⏳', title: 'Báo cáo tạm thời – học kỳ chưa kết thúc', body: `Đã tổ chức ${res.held.length}/${rv.assessments.length} bài đánh giá; CLO chưa có minh chứng ghi “chưa đánh giá”.` }) : ''}
      ${plainCard({
        title: '1. Thông tin học phần và bộ quy tắc áp dụng',
        body: html`<dl class="kv">
          <dt>Học phần</dt><dd>${rv.courseName} (${rv.courseId}) · ${rv.credits ?? '–'} tín chỉ · CTĐT ${rv.programId ?? ''}</dd>
          <dt>Bộ quy tắc</dt><dd>${rv.version} · ${rv.status === 'approved' ? `phê duyệt ${fmtDate(rv.approvedAt)} (${rv.approvedBy ?? ''})` : 'chưa phê duyệt'} · ${rv.source ?? ''}</dd>
          <dt>Quy tắc kết luận</dt><dd>Đạt CLO khi điểm CLO ≥ ${fmtScore(rv.rules.pass, 1)}/10 và minh chứng ≥ ${fmtPct(rv.rules.minEvidence)}; mục tiêu lớp ${fmtPct(rv.rules.target)} sinh viên đạt; vắng thi, không nộp bài là chưa có minh chứng; đánh giá lại lấy kết quả lần gần nhất</dd>
          <dt>Sinh viên</dt><dd>${fmtInt(res.nActive)} thuộc diện đánh giá · ${fmtInt(res.withdrawn.length)} rút học phần</dd>
          <dt>Kiểm tra ma trận</dt><dd>${d.checks.errors} lỗi · ${d.checks.warnings} cảnh báo ${d.checks.items.filter((x) => x.level === 'error' || x.level === 'warn').slice(0, 3).map((x) => html`<br><span class="small">– ${x.title}</span>`)}</dd>
        </dl>`,
      })}
      <div class="mt-16">${plainCard({
        title: '2. Kết quả CLO',
        body: dataTable({
          columns: [
            { label: 'CLO', render: (c) => html`<b>${c.code}</b> · ${c.short}<br><span class="caption">${c.plo} ${c.pi} · trọng số ${fmtPct(c.weight)}</span>` },
            { label: 'Đạt (lần đầu)', num: true, render: (c) => (d.init.clo[c.code].notAssessed ? '–' : `${d.init.clo[c.code].nAchieved}/${d.init.clo[c.code].n} · ${pctOrDash(d.init.clo[c.code].rate)}`) },
            { label: 'Đạt (sau đánh giá lại)', num: true, render: (c) => (res.clo[c.code].notAssessed ? '–' : `${res.clo[c.code].nAchieved}/${res.clo[c.code].n} · ${pctOrDash(res.clo[c.code].rate)}`) },
            { label: 'Điểm CLO TB', num: true, render: (c) => fmtScore(res.clo[c.code].mean) },
            { label: 'Chưa đủ MC', num: true, render: (c) => fmtInt(res.clo[c.code].nInsufficient) },
            { label: 'So với mục tiêu', render: (c) => rateChip(res.clo[c.code]) },
            { label: 'Đo bằng', render: (c) => html`<span class="small">${rv.measuredBy[c.code].map((a) => rv.aByCode.get(a)?.name).join(', ')}</span>` },
          ],
          rows: rv.clos,
        }),
      })}</div>
      <div class="grid grid--2 grid--start mt-16">
        ${plainCard({
          title: '3. Dữ liệu còn thiếu',
          body: html`<ul class="small" style="margin:0;padding-left:18px">
            <li>${fmtInt(missing.length)} sinh viên thiếu bài hoặc không đủ điều kiện dự thi</li>
            <li>${fmtInt(pending.length)} sinh viên có bài đã nộp chưa chấm</li>
            <li>${fmtInt(insufficient.length)} sinh viên chưa đủ minh chứng cho ít nhất 1 CLO</li>
            <li>Bài đánh giá chưa tổ chức: ${rv.assessments.filter((a) => !res.held.includes(a.code)).map((a) => a.name).join(', ') || 'không có'}</li></ul>
            ${d.studentLevel && missing.length ? html`<p class="small" style="margin-top:6px">${missing.map((s) => `${s.code} (${[...s.missingWork, ...s.banned].join(', ')})`).join('; ')}</p>` : ''}`,
        })}
        ${plainCard({
          title: '4. Phân tích chính',
          body: html`<ul class="small" style="margin:0;padding-left:18px">
            ${lowest ? html`<li>CLO thấp nhất: <b>${lowest.code}</b> ${fmtPct(lowest.rate)} đạt (mục tiêu ${fmtPct(rv.rules.target)}).</li>` : ''}
            ${top ? html`<li>Nhóm lỗi chiếm nhiều nhất: <b>${top.group}</b> ${fmtPct(top.share)} trong ${fmtInt(d.pareto.total)} lượt lỗi của ${fmtInt(d.pareto.students)} sinh viên.</li>` : ''}
            <li>${fmtInt(flagged.length)} câu hỏi/tiêu chí cần rà soát (quá dễ, quá khó, phân biệt kém hoặc âm).</li>
            ${d.raters.nScripts ? html`<li>Chấm 2 vòng: ${fmtInt(d.raters.scripts.length)}/${fmtInt(d.raters.nScripts)} bài lệch quá ${fmtScore(d.raters.tol, 1)} điểm ở ít nhất một câu.</li>` : ''}
          </ul>`,
        })}
      </div>
      <div class="mt-16">${plainCard({
        title: '5. Nhận định của giảng viên',
        body: canNote
          ? html`<textarea class="textarea report-note" id="rep-note" rows="5" placeholder="Nhận định về kết quả CLO, nguyên nhân, đề xuất…">${d.note?.text ?? ''}</textarea>
            <p class="caption">${d.note ? `Lưu lần cuối ${fmtDateTime(d.note.time)} · ${d.note.by}` : 'Chưa có nhận định'}</p>`
          : html`<p class="small">${d.note?.text ?? 'Giảng viên phụ trách chưa nhập nhận định.'}</p>`,
        foot: canNote ? html`<button type="button" class="btn btn--sm btn--primary" data-save-note>${icon('check')}Lưu nhận định</button>` : '',
      })}</div>
      <div class="mt-16">${plainCard({
        title: '6. Kế hoạch cải tiến và kết quả đánh giá lại',
        body: d.plans.length
          ? dataTable({ compact: true, columns: [{ label: 'Mã', key: 'id' }, { label: 'Vấn đề', key: 'issue' }, { label: 'Biện pháp', key: 'action' }, { label: 'Phụ trách · hạn', render: (p) => `${p.owner} · ${fmtDate(p.due)}` }, { label: 'Trạng thái', render: (p) => PLAN_STATUS[p.status]?.label ?? p.status }, { label: 'Kết quả', render: (p) => verdictCell(p) }], rows: d.plans })
          : emptyState({ title: 'Chưa có kế hoạch cải tiến' }),
      })}</div>
      <div class="mt-16">${plainCard({
        title: '7. Truy vết điểm nguồn',
        sub: 'Mỗi CLO được tính từ các câu hỏi/tiêu chí dưới đây; điểm nguồn từng sinh viên ở tệp diem_chi_tiet.csv (M6 › Cải tiến và báo cáo)',
        body: dataTable({
          compact: true,
          columns: [
            { label: 'CLO', render: (r) => html`<b>${r.clo}</b>` },
            { label: 'Bài · câu/tiêu chí', render: (r) => html`${r.it.aRef} ${r.it.aName} › <b>${r.it.code}</b> ${r.it.label}` },
            { label: 'Hình thức', render: (r) => MODES[r.it.mode]?.short ?? '' },
            { label: 'Tỷ trọng trong CLO', num: true, render: (r) => fmtPct(r.share, 1) },
            { label: 'Đã có điểm', num: true, render: (r) => fmtInt(res.students.filter((s) => isNum(s.values[r.it.key])).length) },
          ],
          rows: rv.cloCodes.flatMap((c) => rv.items.filter((it) => it.w[c]).map((it) => ({ clo: c, it, share: (it.g * it.w[c]) / (rv.actual[c] || 1) }))),
        }),
      })}</div>
      <p class="caption" style="margin-top:12px">Lập lúc ${fmtDateTime(new Date())} từ dashboard (bản MVP). Điểm số trong bản trình diễn là dữ liệu mô phỏng.</p>
    </div>`;
  },
  mount(root, ctx) {
    on(root, 'click', '[data-print]', () => window.print());
    on(root, 'click', '[data-save-note]', () => {
      cloNotes.set(ctx.data.cls.id, root.querySelector('#rep-note').value.trim(), ctx.user);
      toast('Đã lưu nhận định');
      ctx.route();
    });
  },
};

