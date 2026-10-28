// M0 – Quản trị và kiểm chứng (mục 3.6): dữ liệu và công bố đợt, nhập dữ liệu, cấu hình có lịch sử,
// danh mục, người dùng và nhật ký, thư viện biện pháp, kiểm chứng TC1 – TC4, mô-đun AI.
import { ROLES, SCREENS } from '../access.js';
import { lineagePlans, waveLabel } from '../api.js';
import { checkText } from '../core/factcheck.js';
import { CONFIG_FIELDS, DEFAULT_CONFIG, mergeConfig } from '../core/config.js';
import { DIMENSIONS, FACTOR_BY_CODE, INDICATORS } from '../core/constants.js';
import { toCsv } from '../core/csv.js';
import { computeMart } from '../core/engine.js';
import { fmtDate, fmtDateTime, fmtInt, fmtNum, fmtScore } from '../core/format.js';
import { IMPORT_ORDER, TEMPLATES } from '../core/importer.js';
import { classifyComment } from '../ai/classify.js';
import { allowedConstants, SYSTEM_PROMPT, testOllama } from '../ai/generator.js';
import { exportCsv } from '../data/dataset-io.js';
import { MEASURE_STATUS, MEASURE_TARGETS } from '../data/measures.js';
import { accessLog, configStore, feedback, measureStore, plans as planStore, state, waveStatus } from '../store.js';
import { banner, codeTag, dataTable, openDialog, pageHead, plainCard, statusChip, toast } from '../ui/components.js';
import { downloadText, esc, html, on, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { renderImportTab, mountImportTab } from './admin-import.js';
import { renderVerifyTab, mountVerifyTab } from './admin-verify.js';
import { library } from './assistant.js';
import { PLAN_STATUS } from './classes.js';

const TABS = [
  { id: 'du-lieu', label: 'Dữ liệu và công bố', icon: 'refresh' },
  { id: 'nhap', label: 'Nhập dữ liệu', icon: 'upload' },
  { id: 'cau-hinh', label: 'Cấu hình', icon: 'admin' },
  { id: 'danh-muc', label: 'Danh mục', icon: 'book' },
  { id: 'nguoi-dung', label: 'Người dùng, nhật ký', icon: 'user' },
  { id: 'thu-vien', label: 'Thư viện biện pháp', icon: 'book' },
  { id: 'kiem-chung', label: 'Kiểm chứng TC1 – TC4', icon: 'check' },
  { id: 'tro-ly-ai', label: 'Mô-đun AI', icon: 'sparkle' },
];

export const AdminView = {
  screen: 'M0',
  layout: 'wide',
  title: (ctx) => `Quản trị – ${TABS.find((t) => t.id === tabOf(ctx))?.label}`,
  render(ctx) {
    const tab = tabOf(ctx);
    const body = {
      'du-lieu': renderDataTab,
      nhap: renderImportTab,
      'cau-hinh': renderConfigTab,
      'danh-muc': renderCatalogTab,
      'nguoi-dung': renderUsersTab,
      'thu-vien': renderLibraryTab,
      'kiem-chung': renderVerifyTab,
      'tro-ly-ai': renderAiTab,
    }[tab](ctx);
    return html`${pageHead({
      crumbs: [{ label: 'Quản trị và kiểm chứng' }, { label: TABS.find((t) => t.id === tab).label }],
      title: 'Quản trị và kiểm chứng',
      question: ROLES[ctx.user.role].question,
    })}
      <nav class="tabs" aria-label="Mục quản trị">${TABS.map((t) => html`<a href="#/quan-tri/${t.id}"${raw(t.id === tab ? ' aria-current="page"' : '')}>${icon(t.icon)}${t.label}</a>`)}</nav>
      ${body}`;
  },
  mount(root, ctx) {
    const tab = tabOf(ctx);
    const fn = { 'du-lieu': mountDataTab, nhap: mountImportTab, 'cau-hinh': mountConfigTab, 'nguoi-dung': mountUsersTab, 'thu-vien': mountLibraryTab, 'kiem-chung': mountVerifyTab, 'tro-ly-ai': mountAiTab }[tab];
    fn?.(root, ctx);
  },
};

function tabOf(ctx) {
  return TABS.some((t) => t.id === ctx.params.tab) ? ctx.params.tab : 'du-lieu';
}

// ---- Dữ liệu và công bố đợt (mục 6.1) ----------------------------------------------------------

function renderDataTab(ctx) {
  const { dataset: ds, mart } = state;
  const sim = ds.meta?.source === 'synthetic';
  const nValid = mart.validRows.length;
  const steps = ['Sinh viên trả lời phiếu (LimeSurvey)', 'Xuất CSV câu trả lời', 'Phòng QLĐT thay mã SV bằng mã nghiên cứu', 'Nhập vào M0: kiểm tra, xem trước', 'Bộ tính toán chạy theo lô', 'Bảng tổng hợp + cảnh báo', 'AI sinh sẵn tóm tắt, phân loại ý kiến', 'Phòng QLCL bấm “Công bố”', 'Thông báo cho khoa, giảng viên'];
  const waveRows = [...mart.waves].reverse().map((w) => {
    const bw = mart.byWave.get(w.id);
    const cws = bw.classIds.map((id) => mart.classWave.get(`${id}|${w.id}`));
    return { w, bw, warn: cws.filter((c) => c.status === 'warn').length, alert: cws.filter((c) => c.status === 'alert').length, classes: cws.length };
  });
  const canPublish = ['qlcl', 'admin'].includes(ctx.user.role);
  const pending = mart.waves.some((w) => w.status !== 'published');
  return html`
    <div class="grid grid--2 grid--start">
      ${plainCard({
        title: 'Bộ dữ liệu đang dùng',
        sub: sim ? 'Dữ liệu mô phỏng có hạt giống cố định – dùng để thử kỹ thuật và phỏng vấn người dùng' : 'Dữ liệu nhập từ tệp CSV (lưu trong trình duyệt này)',
        body: html`<dl class="kv">
            <dt>Nguồn</dt><dd>${sim ? 'Mô phỏng' : 'Nhập từ tệp'} · ${ds.meta?.label ?? ''}</dd>
            <dt>Học kỳ · đợt</dt><dd>${fmtInt(ds.semesters.length)} học kỳ · ${fmtInt(mart.waves.length)} đợt</dd>
            <dt>Khoa · học phần · lớp</dt><dd>${fmtInt(ds.faculties.length)} khoa · ${fmtInt(ds.courses.length)} học phần · ${fmtInt(ds.classes.length)} lớp học phần</dd>
            <dt>Phiếu khảo sát</dt><dd>${fmtInt(ds.responses.length)} phiếu · ${fmtInt(nValid)} hợp lệ (${fmtNum((nValid / Math.max(1, ds.responses.length)) * 100, 1)}%)</dd>
            <dt>Sinh viên · điểm học vụ</dt><dd>${fmtInt(ds.students.length)} mã nghiên cứu · ${fmtInt(ds.grades.length)} bản ghi điểm</dd>
            <dt>Lần tính gần nhất</dt><dd>${fmtDateTime(mart.builtAt)} · ${fmtInt(mart.durationMs)} ms</dd>
          </dl>`,
        foot: html`<button type="button" class="btn btn--sm" data-recompute>${icon('refresh')}Tính lại</button>
          ${!sim ? html`<button type="button" class="btn btn--sm btn--danger" data-reset-synthetic>Khôi phục dữ liệu mô phỏng</button>` : ''}
          <a class="btn btn--sm" href="#/quan-tri/nhap">${icon('upload')}Nhập dữ liệu</a>`,
      })}
      ${plainCard({
        title: 'Tải dữ liệu theo mẫu (Phụ lục A)',
        sub: 'Xuất bộ dữ liệu hiện tại ra đúng định dạng tệp nhập – dùng làm mẫu hoặc sao lưu',
        body: html`<ul class="list">${IMPORT_ORDER.map(
          (k) => html`<li class="list-row" style="padding:8px 0"><span class="list-row__main"><span class="list-row__title">${TEMPLATES[k].file}</span><br><span class="list-row__meta">${TEMPLATES[k].title}</span></span>
            <button type="button" class="btn btn--sm" data-export="${k}">${icon('download')}CSV</button></li>`,
        )}</ul>`,
        foot: html`<button type="button" class="btn btn--sm" data-export-pdca>${icon('download')}Xuất minh chứng PDCA (CSV)</button><span>Kế hoạch cải tiến kèm điểm trước – sau, phục vụ Tiêu chí 6.4, 6.5, 10.1.</span>`,
      })}
    </div>
    <div class="mt-16">${plainCard({
      title: 'Các đợt đánh giá',
      sub: 'Đợt mới nhập ở trạng thái “chờ công bố”: chỉ Phòng QLCL, quản trị xem được. Công bố đợt sẽ gửi thông báo trong ứng dụng.',
      body: dataTable({
        columns: [
          { label: 'Đợt', render: (r) => html`<b>${waveLabel(r.w)}</b><br><span class="caption">${r.w.id}</span>` },
          { label: 'Ngày khảo sát', render: (r) => fmtDate(r.w.date) },
          { label: 'Phiếu hợp lệ / nhận', num: true, render: (r) => `${fmtInt(r.bw.school.n)} / ${fmtInt(r.bw.school.nTotal)}` },
          { label: 'Lớp có phiếu', num: true, render: (r) => fmtInt(r.classes) },
          { label: 'Chỉ số', num: true, render: (r) => fmtScore(r.bw.school.metrics.IDX.mean) },
          { label: 'Cảnh báo', render: (r) => html`${statusChip('warn', { label: `${r.warn}` })} ${statusChip('alert', { label: `${r.alert}` })}` },
          { label: 'Trạng thái', render: (r) => (r.w.status === 'published' ? html`${statusChip('ok', { label: 'Đã công bố' })}<br><span class="caption">${fmtDate(r.w.publishedAt)}${r.w.by ? ` · ${r.w.by}` : ''}</span>` : statusChip('warn', { label: 'Chờ công bố' })) },
          { label: '', render: (r) => (r.w.status !== 'published' && canPublish ? html`<button type="button" class="btn btn--sm btn--primary" data-publish="${r.w.id}">Công bố</button>` : '') },
        ],
        rows: waveRows,
      }),
    })}</div>
    <div class="mt-16">${plainCard({
      title: 'Luồng dữ liệu mỗi đợt đánh giá (mục 6.1)',
      body: html`<ol class="steps">${steps.map((s, i) => html`<li class="${!pending || i < 7 ? 'is-done' : i === 7 ? 'is-active' : ''}">${s}</li>`)}</ol>
        <p class="caption">Trong học kỳ thí điểm của đề tài chỉ có một đợt khảo sát (tuần 12 – 14), mục tiêu 300 phiếu hợp lệ, ít nhất 20 lớp học phần, 3 khối ngành.</p>`,
    })}</div>`;
}

function mountDataTab(root, ctx) {
  on(root, 'click', '[data-recompute]', () => {
    ctx.recompute({ reason: 'manual' });
    toast('Đã tính lại toàn bộ chỉ số');
    ctx.route();
  });
  on(root, 'click', '[data-reset-synthetic]', async () => {
    if (!confirm('Xóa dữ liệu đã nhập trong trình duyệt và quay về bộ dữ liệu mô phỏng?')) return;
    await ctx.replaceDataset(null, { key: 'synthetic' });
    toast('Đã khôi phục dữ liệu mô phỏng');
  });
  on(root, 'click', '[data-export]', (e, btn) => {
    const k = btn.dataset.export;
    downloadText(TEMPLATES[k].file, exportCsv(state.dataset, k));
  });
  on(root, 'click', '[data-export-pdca]', () => downloadText('minh_chung_pdca.csv', pdcaCsv()));
  on(root, 'click', '[data-publish]', (e, btn) => {
    const w = state.mart.waves.find((x) => x.id === btn.dataset.publish);
    if (!confirm(`Công bố ${waveLabel(w)}? Khoa và giảng viên có lớp cảnh báo sẽ nhận thông báo.`)) return;
    waveStatus.publish(w.id, ctx.user);
    ctx.refreshOverlays();
    ctx.recompute({ reason: 'publish' });
    toast(`Đã công bố ${waveLabel(w)}`);
    ctx.route();
  });
}

function pdcaCsv() {
  const lineages = [...new Set(planStore.all().map((p) => state.mart.classById.get(p.classId)?.lineage).filter(Boolean))];
  const rows = lineages.flatMap((l) => lineagePlans(l)).map((p) => {
    const cls = state.mart.classById.get(p.classId);
    return {
      ma_ke_hoach: p.id,
      lop_hoc_phan: cls?.name ?? p.classId,
      ma_lop_hp: p.classId,
      dot_lap: p.wave ? waveLabel(p.wave) : p.waveId,
      phuong_dien: p.dimension,
      ma_bien_phap: p.measureCode ?? '',
      noi_dung: p.action,
      nguoi_phu_trach: p.owner,
      han: p.due,
      trang_thai: PLAN_STATUS[p.status]?.label ?? p.status,
      diem_truoc: p.before === null ? '' : fmtScore(p.before),
      diem_sau: p.after === null ? '' : fmtScore(p.after),
      dot_sau: p.afterWave ? waveLabel(p.afterWave) : '',
      ket_qua: { pending: 'Chờ đợt sau', reached: 'Đạt ngưỡng', improved: 'Có cải thiện', notImproved: 'Chưa cải thiện' }[p.verdict],
    };
  });
  const cols = ['ma_ke_hoach', 'lop_hoc_phan', 'ma_lop_hp', 'dot_lap', 'phuong_dien', 'ma_bien_phap', 'noi_dung', 'nguoi_phu_trach', 'han', 'trang_thai', 'diem_truoc', 'diem_sau', 'dot_sau', 'ket_qua'];
  return toCsv(cols, rows);
}

// ---- Cấu hình (mọi thay đổi có lịch sử) ---------------------------------------------------------

function renderConfigTab(ctx) {
  const cfg = state.cfg;
  const groups = [...new Set(CONFIG_FIELDS.map((f) => f.group))];
  const hist = configStore.history();
  const field = (f) => {
    const v = cfg[f.key];
    const def = DEFAULT_CONFIG[f.key];
    const changed = v !== def;
    const defText = typeof def === 'boolean' ? (def ? 'bật' : 'tắt') : typeof def === 'number' ? fmtNum(def, String(def).includes('.') ? String(def).split('.')[1].length : 0) : f.options?.find((o) => o[0] === def)?.[1] ?? def;
    const hint = html`<span class="hint">Mục ${f.ref} · mặc định ${defText}${changed ? html` · <b>đang khác mặc định</b>` : ''}${f.note ? html`<br>${f.note}` : ''}</span>`;
    if (f.type === 'boolean') {
      return html`<div class="form-field"><span class="label">${f.label}</span><label class="check"><input type="checkbox" name="${f.key}"${raw(v ? ' checked' : '')}> Bật</label>${hint}</div>`;
    }
    if (f.type === 'select') {
      return html`<div class="form-field"><label for="cf-${f.key}">${f.label}</label><select class="select" id="cf-${f.key}" name="${f.key}">${f.options.map(([val, lab]) => html`<option value="${val}"${raw(val === v ? ' selected' : '')}>${lab}</option>`)}</select>${hint}</div>`;
    }
    return html`<div class="form-field"><label for="cf-${f.key}">${f.label}</label><input class="input" type="number" id="cf-${f.key}" name="${f.key}" value="${v}" step="${f.step}" min="${f.min}" max="${f.max}" inputmode="decimal">${hint}</div>`;
  };
  return html`
    <form id="cfg-form" novalidate>
      ${groups.map((g) => html`<div class="mt-16">${plainCard({ title: g, body: html`<div class="form-grid">${CONFIG_FIELDS.filter((f) => f.group === g).map(field)}</div>` })}</div>`)}
      <div class="mt-16">${plainCard({
        title: 'Lưu thay đổi',
        body: html`<div class="form-grid">
          <div class="form-field form-field--full"><label for="cf-note">Ghi chú thay đổi (bắt buộc khi đổi ngưỡng)</label><input class="input" id="cf-note" name="__note" placeholder="Ví dụ: hiệu chỉnh theo kết quả Monte Carlo đợt CK HK2"></div>
          <div class="form-field form-field--full" id="cfg-impact" aria-live="polite"></div>
          <p class="caption form-field--full" id="cfg-error" role="alert" style="color:var(--alert-ink)"></p>
        </div>`,
        foot: html`<button type="button" class="btn btn--sm" data-preview>${icon('play')}Xem trước tác động</button>
          <button type="submit" class="btn btn--sm btn--primary">${icon('check')}Lưu và tính lại</button>
          <button type="button" class="btn btn--sm btn--danger" data-reset-cfg>Khôi phục mặc định</button>`,
      })}</div>
    </form>
    <div class="mt-16">${plainCard({
      title: 'Lịch sử thay đổi cấu hình',
      sub: 'Mọi thay đổi đều được ghi: thời điểm, người đổi, giá trị cũ → mới, lý do',
      body: dataTable({
        compact: true,
        emptyText: 'Chưa có thay đổi – đang dùng giá trị khởi đầu',
        columns: [
          { label: 'Thời điểm', render: (h) => fmtDateTime(h.time) },
          { label: 'Người đổi', render: (h) => html`${h.userName}<br><span class="caption">${h.role}</span>` },
          { label: 'Tham số', render: (h) => CONFIG_FIELDS.find((f) => f.key === h.key)?.label ?? h.key },
          { label: 'Cũ → mới', render: (h) => `${fmtVal(h.from)} → ${fmtVal(h.to)}` },
          { label: 'Ghi chú', key: 'note' },
        ],
        rows: hist,
      }),
    })}</div>`;
}

const fmtVal = (v) => (typeof v === 'boolean' ? (v ? 'bật' : 'tắt') : typeof v === 'number' ? fmtNum(v, Number.isInteger(v) ? 0 : 2) : String(v));

function readConfigForm(form) {
  const out = {};
  for (const f of CONFIG_FIELDS) {
    const el = form.elements[f.key];
    if (!el) continue;
    if (f.type === 'boolean') out[f.key] = el.checked;
    else if (f.type === 'select') out[f.key] = el.value;
    else out[f.key] = Number(el.value);
  }
  return out;
}

function validateConfig(c) {
  const errs = [];
  for (const f of CONFIG_FIELDS) {
    if (f.type !== 'number') continue;
    const v = c[f.key];
    if (!Number.isFinite(v) || v < f.min || v > f.max) errs.push(`${f.label}: cần trong khoảng ${f.min} – ${f.max}`);
  }
  if (c.redDim >= c.yellowDim) errs.push('Ngưỡng đỏ phải thấp hơn ngưỡng vàng');
  if (c.zRed <= c.zYellow) errs.push('Giới hạn phễu cho 🔴 phải lớn hơn cho 🟡');
  if (c.stuEngRed >= c.stuEngYellow) errs.push('Ngưỡng gắn kết đỏ phải thấp hơn ngưỡng vàng');
  if (c.stuProcRed >= c.stuProcYellow) errs.push('Ngưỡng điểm quá trình đỏ phải thấp hơn ngưỡng vàng');
  if (!Number.isInteger(c.nMin) || !Number.isInteger(c.declineWaves)) errs.push('Ngưỡng ẩn và số đợt phải là số nguyên');
  return errs;
}

function latestCounts(mart) {
  const w = mart.waves[mart.waves.length - 1];
  const cws = mart.byWave.get(w.id).classIds.map((id) => mart.classWave.get(`${id}|${w.id}`));
  return { wave: w, warn: cws.filter((c) => c.status === 'warn').length, alert: cws.filter((c) => c.status === 'alert').length, na: cws.filter((c) => c.status === 'na').length };
}

function mountConfigTab(root, ctx) {
  const form = root.querySelector('#cfg-form');
  const err = root.querySelector('#cfg-error');
  on(root, 'click', '[data-preview]', () => {
    const next = mergeConfig(state.cfg, readConfigForm(form));
    const errs = validateConfig(next);
    err.textContent = errs.join(' · ');
    if (errs.length) return;
    const a = latestCounts(state.mart);
    const b = latestCounts(computeMart(state.dataset, next, { classify: classifyComment }));
    root.querySelector('#cfg-impact').innerHTML = String(html`<div class="banner banner--info" style="margin:0"><div class="banner__icon" aria-hidden="true">ℹ</div><div class="banner__body small">
      <b>Tác động ở ${waveLabel(a.wave)}:</b> lớp theo dõi ${a.warn} → <b>${b.warn}</b> · lớp can thiệp ${a.alert} → <b>${b.alert}</b> · chưa đủ dữ liệu ${a.na} → <b>${b.na}</b>.
      Kiểm tra tỷ lệ báo động giả ở M0 › Kiểm chứng › TC2 trước khi chốt.</div></div>`);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const next = readConfigForm(form);
    const merged = mergeConfig(state.cfg, next);
    const errs = validateConfig(merged);
    const changes = Object.entries(next).filter(([k, v]) => v !== state.cfg[k]).map(([key, to]) => ({ key, from: state.cfg[key], to }));
    const note = form.elements.__note.value.trim();
    if (!changes.length) errs.push('Chưa có thay đổi nào');
    if (changes.length && !note) errs.push('Cần ghi chú lý do thay đổi');
    err.textContent = errs.join(' · ');
    if (errs.length) return;
    configStore.apply(changes, ctx.user, note);
    ctx.recompute({ reason: 'config' });
    toast(`Đã lưu ${changes.length} thay đổi và tính lại`);
    ctx.route();
  });
  on(root, 'click', '[data-reset-cfg]', () => {
    if (!confirm('Khôi phục toàn bộ tham số về giá trị khởi đầu?')) return;
    configStore.reset(ctx.user, DEFAULT_CONFIG);
    ctx.recompute({ reason: 'config' });
    toast('Đã khôi phục cấu hình mặc định');
    ctx.route();
  });
}

// ---- Danh mục ------------------------------------------------------------------------------

function renderCatalogTab() {
  const { dataset: ds, mart } = state;
  const latestSem = ds.semesters[ds.semesters.length - 1]?.id;
  const classes = ds.classes.filter((c) => c.semesterId === latestSem);
  const fac = new Map(ds.faculties.map((f) => [f.id, f]));
  const lect = new Map(ds.lecturers.map((l) => [l.id, l]));
  const studentsByAdvisor = new Map();
  for (const s of ds.students) studentsByAdvisor.set(s.advisorId, (studentsByAdvisor.get(s.advisorId) || 0) + 1);
  return html`
    <div class="grid grid--2 grid--start">
      ${plainCard({
        title: `Khoa (${ds.faculties.length})`,
        body: dataTable({
          compact: true,
          columns: [
            { label: 'Mã', key: 'id' },
            { label: 'Tên khoa', key: 'name' },
            { label: 'Khối ngành', render: (f) => f.block || '–' },
            { label: 'Học phần', num: true, render: (f) => fmtInt(ds.courses.filter((c) => c.facultyId === f.id).length) },
            { label: 'Lớp HK mới nhất', num: true, render: (f) => fmtInt(classes.filter((c) => c.facultyId === f.id).length) },
          ],
          rows: ds.faculties,
        }),
      })}
      ${plainCard({
        title: `Cố vấn học tập (${ds.advisors.length}) và phân công`,
        body: dataTable({
          compact: true,
          columns: [
            { label: 'Mã', key: 'id' },
            { label: 'Cố vấn', key: 'name' },
            { label: 'Khoa', render: (a) => fac.get(a.facultyId)?.short ?? a.facultyId ?? '–' },
            { label: 'Sinh viên phụ trách', num: true, render: (a) => fmtInt(studentsByAdvisor.get(a.id) || 0) },
          ],
          rows: ds.advisors,
        }),
        foot: html`<span>${fmtInt(ds.students.length)} sinh viên (mã nghiên cứu) · ${fmtInt(ds.students.filter((s) => !s.advisorId).length)} chưa phân công cố vấn</span>`,
      })}
    </div>
    <div class="mt-16">${plainCard({
      title: `Lớp học phần – ${ds.semesters.find((s) => s.id === latestSem)?.label ?? ''} (${classes.length})`,
      sub: '“Dòng lớp” nối cùng học phần, nhóm lớp, giảng viên qua các học kỳ – dùng cho quy tắc giảm liên tiếp và so sánh trước – sau',
      body: html`<div class="table-scroll">${dataTable({
        compact: true,
        columns: [
          { label: 'Mã lớp học phần', key: 'id' },
          { label: 'Tên', key: 'name' },
          { label: 'Khoa', render: (c) => fac.get(c.facultyId)?.short ?? c.facultyId },
          { label: 'Giảng viên', render: (c) => lect.get(c.lecturerId)?.name ?? c.lecturerId },
          { label: 'Sĩ số', num: true, render: (c) => fmtInt(c.size) },
          { label: 'Dòng lớp', key: 'lineage' },
          { label: 'Đợt có phiếu', num: true, render: (c) => fmtInt(mart.waves.filter((w) => mart.classWave.has(`${c.id}|${w.id}`)).length) },
        ],
        rows: classes,
      })}</div>`,
    })}</div>
    <div class="grid grid--2 grid--start mt-16">
      ${plainCard({
        title: `Học phần (${ds.courses.length})`,
        body: html`<div class="table-scroll">${dataTable({ compact: true, columns: [{ label: 'Mã', key: 'id' }, { label: 'Tên học phần', key: 'name' }, { label: 'Khoa', render: (c) => fac.get(c.facultyId)?.short ?? c.facultyId }], rows: ds.courses })}</div>`,
      })}
      ${plainCard({
        title: `Giảng viên (${ds.lecturers.length})`,
        body: html`<div class="table-scroll">${dataTable({ compact: true, columns: [{ label: 'Mã', key: 'id' }, { label: 'Họ tên', key: 'name' }, { label: 'Khoa', render: (l) => fac.get(l.facultyId)?.short ?? l.facultyId }, { label: 'Lớp HK mới nhất', num: true, render: (l) => fmtInt(classes.filter((c) => c.lecturerId === l.id).length) }], rows: ds.lecturers })}</div>`,
      })}
    </div>
    <div class="mt-16">${plainCard({
      title: `Bộ tiêu chí: 9 nhân tố, ${INDICATORS.length} chỉ báo`,
      sub: 'Lời dẫn chỉ báo trong MVP là bản minh họa – thay bằng lời dẫn chính thức của bộ tiêu chí',
      body: html`<div class="table-scroll">${dataTable({ compact: true, columns: [{ label: 'Mã chỉ báo', key: 'code' }, { label: 'Nhân tố', render: (i) => codeTag(i.factor) }, { label: 'Lời dẫn', key: 'text' }], rows: INDICATORS })}</div>`,
    })}</div>`;
}

// ---- Người dùng, vai trò, nhật ký truy cập -------------------------------------------------------

function renderUsersTab(ctx) {
  const log = accessLog.list();
  const byRole = Object.keys(ROLES).map((r) => ({ role: r, ...ROLES[r], count: state.users.filter((u) => u.role === r).length }));
  return html`
    ${banner({ kind: 'info', title: 'Đăng nhập trong bản chính thức', body: 'Tài khoản Trường (LDAP/OIDC) nếu đơn vị CNTT hỗ trợ; nếu không thì tài khoản nội bộ cho học kỳ thí điểm (mục 10). Bản MVP dùng tài khoản mô phỏng để trình diễn phân quyền theo vai trò và phạm vi.' })}
    ${plainCard({
      title: 'Vai trò và phạm vi dữ liệu (mục 2)',
      body: dataTable({
        columns: [
          { label: 'Vai trò', render: (r) => html`<b>${r.label}</b>` },
          { label: 'Câu hỏi chính', key: 'question' },
          { label: 'Màn hình', render: (r) => r.screens.map((s) => `${s} ${SCREENS[s].label}`).join(', ') },
          { label: 'Phạm vi dữ liệu', key: 'scope' },
          { label: 'Tài khoản mô phỏng', num: true, render: (r) => fmtInt(r.count) },
        ],
        rows: byRole,
      }),
    })}
    <div class="mt-16">${plainCard({
      title: 'Nhật ký truy cập dữ liệu cấp sinh viên',
      sub: `Mọi lượt xem dữ liệu cấp sinh viên đều được ghi (mục 5.6) · ${fmtInt(log.length)} lượt`,
      actions: html`<button type="button" class="btn btn--sm" data-export-log>${icon('download')}CSV</button>${ctx.user.role === 'admin' ? html`<button type="button" class="btn btn--sm btn--danger" data-clear-log>Xóa nhật ký</button>` : ''}`,
      body: html`<div class="table-scroll">${dataTable({
        compact: true,
        emptyText: 'Chưa có lượt xem nào – thử vai trò Giảng viên hoặc Cố vấn học tập rồi mở màn hình Sinh viên',
        columns: [
          { label: 'Thời điểm', render: (l) => fmtDateTime(l.time) },
          { label: 'Người xem', render: (l) => html`${l.userName}<br><span class="caption">${l.role}</span>` },
          { label: 'Hành động', key: 'action' },
          { label: 'Đối tượng', key: 'target' },
          { label: 'Số bản ghi', num: true, render: (l) => fmtInt(l.count) },
        ],
        rows: log.slice(0, 300),
      })}</div>`,
    })}</div>`;
}

function mountUsersTab(root, ctx) {
  on(root, 'click', '[data-export-log]', () => {
    const rows = accessLog.list().map((l) => ({ thoi_diem: fmtDateTime(l.time), nguoi_xem: l.userName, vai_tro: l.role, hanh_dong: l.action, doi_tuong: l.target, so_ban_ghi: l.count }));
    downloadText('nhat_ky_truy_cap.csv', toCsv(['thoi_diem', 'nguoi_xem', 'vai_tro', 'hanh_dong', 'doi_tuong', 'so_ban_ghi'], rows));
  });
  on(root, 'click', '[data-clear-log]', () => {
    if (!confirm('Xóa toàn bộ nhật ký truy cập trong trình duyệt này?')) return;
    accessLog.clear();
    ctx.route();
  });
}

// ---- Thư viện biện pháp -----------------------------------------------------------------------

function renderLibraryTab(ctx) {
  const lib = library();
  const q = ctx.query;
  const rows = lib.filter((m) => (!q.pd || m.dim === q.pd) && (!q.tt || m.status === q.tt));
  const canApprove = ['qlcl', 'admin'].includes(ctx.user.role);
  const counts = Object.fromEntries(Object.keys(MEASURE_STATUS).map((k) => [k, lib.filter((m) => m.status === k).length]));
  return html`${plainCard({
    title: `Thư viện biện pháp cải tiến (${lib.length})`,
    sub: 'Gắn mã phương diện, chỉ báo; chuyên gia duyệt trước khi trợ lý AI được phép gợi ý',
    actions: html`<button type="button" class="btn btn--sm btn--primary" data-add-measure>${icon('plus')}Thêm biện pháp</button>`,
    body: html`<form class="page-actions" style="margin-bottom:12px" data-lib-filter>
        <div class="field-inline"><label for="lib-pd">Phương diện</label><select class="select" id="lib-pd" name="pd"><option value="">Tất cả</option>${DIMENSIONS.map((d) => html`<option value="${d}"${raw(q.pd === d ? ' selected' : '')}>${d} ${FACTOR_BY_CODE[d].short}</option>`)}</select></div>
        <div class="field-inline"><label for="lib-tt">Trạng thái</label><select class="select" id="lib-tt" name="tt"><option value="">Tất cả</option>${Object.entries(MEASURE_STATUS).map(([k, v]) => html`<option value="${k}"${raw(q.tt === k ? ' selected' : '')}>${v} (${counts[k]})</option>`)}</select></div>
      </form>
      ${dataTable({
        compact: true,
        columns: [
          { label: 'Mã', render: (m) => html`<b>${m.code}</b>` },
          { label: 'Phương diện', render: (m) => html`${codeTag(m.dim)}${m.indicator ? html`<br><span class="caption">${m.indicator}</span>` : ''}` },
          { label: 'Nội dung', key: 'text' },
          { label: 'Đối tượng', render: (m) => MEASURE_TARGETS[m.target] ?? m.target },
          { label: 'Nguồn', render: (m) => html`<span class="small">${m.source}</span>` },
          { label: 'Trạng thái', render: (m) => statusChip({ da_duyet: 'ok', cho_duyet: 'warn', tu_choi: 'na' }[m.status], { label: MEASURE_STATUS[m.status] }) },
          ...(canApprove ? [{ label: '', render: (m) => (m.status === 'cho_duyet' ? html`<span style="white-space:nowrap"><button type="button" class="btn btn--sm" data-approve="${m.code}">Duyệt</button> <button type="button" class="btn-tool" data-reject="${m.code}">Từ chối</button></span>` : '') }] : []),
        ],
        rows,
      })}`,
  })}`;
}

function mountLibraryTab(root, ctx) {
  root.querySelector('[data-lib-filter]')?.addEventListener('change', (e) => {
    const form = e.currentTarget;
    ctx.navigate({ pd: form.elements.pd.value, tt: form.elements.tt.value });
  });
  on(root, 'click', '[data-approve]', (e, btn) => {
    measureStore.change(btn.dataset.approve, { status: 'da_duyet', reviewedBy: ctx.user.name, reviewedAt: new Date().toISOString() });
    ctx.refreshOverlays();
    toast(`Đã duyệt ${btn.dataset.approve}`);
    ctx.route();
  });
  on(root, 'click', '[data-reject]', (e, btn) => {
    measureStore.change(btn.dataset.reject, { status: 'tu_choi', reviewedBy: ctx.user.name, reviewedAt: new Date().toISOString() });
    ctx.refreshOverlays();
    toast(`Đã từ chối ${btn.dataset.reject}`);
    ctx.route();
  });
  on(root, 'click', '[data-add-measure]', () => {
    const lib = library();
    const indicatorOptions = (dim) => [html`<option value="">— Cả phương diện —</option>`, ...INDICATORS.filter((i) => i.factor === dim).map((i) => html`<option value="${i.code}">${i.code} · ${i.text.slice(0, 60)}</option>`)];
    openDialog({
      title: 'Thêm biện pháp vào thư viện',
      body: html`<form id="ms-form" class="form-grid">
        <div class="form-field"><label for="ms-dim">Phương diện</label><select class="select" id="ms-dim" name="dim">${DIMENSIONS.map((d) => html`<option value="${d}">${d} · ${FACTOR_BY_CODE[d].short}</option>`)}</select></div>
        <div class="form-field"><label for="ms-ind">Chỉ báo</label><select class="select" id="ms-ind" name="indicator">${indicatorOptions(DIMENSIONS[0])}</select></div>
        <div class="form-field form-field--full"><label for="ms-text">Nội dung biện pháp</label><textarea class="textarea" id="ms-text" name="text" required></textarea></div>
        <div class="form-field"><label for="ms-target">Đối tượng thực hiện</label><select class="select" id="ms-target" name="target">${Object.entries(MEASURE_TARGETS).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
        <div class="form-field"><label for="ms-src">Nguồn</label><input class="input" id="ms-src" name="source" placeholder="Văn bản, hướng dẫn, kinh nghiệm…"></div>
        <p class="caption form-field--full">Biện pháp mới ở trạng thái “Chờ duyệt”; chỉ biện pháp đã duyệt mới được trợ lý AI gợi ý.</p>
        <p class="caption form-field--full" id="ms-err" role="alert" style="color:var(--alert-ink)"></p>
      </form>`,
      foot: html`<button type="button" class="btn" data-close>Hủy</button><button type="submit" form="ms-form" class="btn btn--primary">Thêm</button>`,
      onMount(dlg) {
        const form = dlg.querySelector('#ms-form');
        form.elements.dim.addEventListener('change', () => {
          form.elements.indicator.innerHTML = indicatorOptions(form.elements.dim.value).map(String).join('');
        });
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = Object.fromEntries(new FormData(form));
          if (!fd.text.trim()) {
            dlg.querySelector('#ms-err').textContent = 'Cần nhập nội dung biện pháp';
            return;
          }
          const n = lib.filter((m) => m.dim === fd.dim).length + 1;
          let code = `BP-${fd.dim}-${String(n).padStart(2, '0')}`;
          let k = n;
          while (lib.some((m) => m.code === code)) code = `BP-${fd.dim}-${String(++k).padStart(2, '0')}`;
          measureStore.add({ code, dim: fd.dim, indicator: fd.indicator || null, text: fd.text.trim(), target: fd.target, source: fd.source.trim() || `Đề xuất của ${ctx.user.name}`, status: 'cho_duyet', createdBy: ctx.user.name });
          ctx.refreshOverlays();
          dlg.close();
          toast(`Đã thêm ${code} – chờ duyệt`);
          ctx.route();
        });
      },
    });
  });
}

// ---- Mô-đun AI -------------------------------------------------------------------------------

const DEMO_FACTS = `F1: Chỉ số chất lượng 3,52; TB Trường 3,72
F2: IN1 Học liệu số và hạ tầng 3,21; mục tiêu 3,5; thấp hơn giới hạn 2σ
F3: PS1 Đánh giá, phản hồi 3,48; giảm 0,20 so với đợt trước
F4: Chủ đề ý kiến nổi bật: tài liệu trên LMS khó tìm (6 ý kiến)`;
const DEMO_TEXT = 'Lớp có chỉ số chất lượng 3,52, thấp hơn trung bình Trường 3,72 [F1]. Học liệu số và hạ tầng chỉ đạt 3,12, dưới mục tiêu 3,5 [F2]. PS1 giảm 0,20 điểm so với đợt trước [F3]. Nên sắp xếp lại học liệu theo tuần.';

function renderAiTab(ctx) {
  const cfg = state.cfg;
  const fb = feedback.list();
  const up = fb.filter((f) => f.value === 'up').length;
  const down = fb.filter((f) => f.value === 'down').length;
  const editable = ['qlcl', 'admin'].includes(ctx.user.role);
  return html`
    <div class="grid grid--2 grid--start">
      ${plainCard({
        title: 'Bộ máy sinh văn bản',
        sub: 'AI chạy trong máy chủ của Trường, dữ liệu không ra ngoài (mục 5.3)',
        body: html`<form id="ai-form" class="form-grid">
          <div class="form-field form-field--full"><span class="label">Bộ máy</span>
            <label class="check"><input type="radio" name="aiEngine" value="template"${raw(cfg.aiEngine === 'template' ? ' checked' : '')}${raw(editable ? '' : ' disabled')}> Mẫu câu từ dữ kiện (MVP – chạy mọi nơi, kể cả GitHub Pages)</label>
            <label class="check"><input type="radio" name="aiEngine" value="ollama"${raw(cfg.aiEngine === 'ollama' ? ' checked' : '')}${raw(editable ? '' : ' disabled')}> Ollama nội bộ – mô hình mở 7 – 14 tỷ tham số</label></div>
          <div class="form-field"><label for="ai-url">Địa chỉ Ollama</label><input class="input" id="ai-url" name="ollamaUrl" value="${cfg.ollamaUrl}"${raw(editable ? '' : ' disabled')}></div>
          <div class="form-field"><label for="ai-model">Mô hình</label><input class="input" id="ai-model" name="ollamaModel" value="${cfg.ollamaModel}"${raw(editable ? '' : ' disabled')}><span class="hint">Chọn theo 3 tiêu chí: hỗ trợ tốt tiếng Việt, giấy phép phù hợp, vừa cấu hình máy chủ.</span></div>
          <div class="form-field form-field--full"><label class="check"><input type="checkbox" name="expertReview"${raw(cfg.expertReview ? ' checked' : '')}${raw(editable ? '' : ' disabled')}> Chế độ “chuyên gia duyệt trước khi hiển thị” (học kỳ thí điểm)</label></div>
          <div class="form-field form-field--full" id="ai-test" aria-live="polite"></div>
        </form>`,
        foot: editable ? html`<button type="button" class="btn btn--sm" data-test-ollama>${icon('link')}Kiểm tra kết nối</button><button type="button" class="btn btn--sm btn--primary" data-save-ai>${icon('check')}Lưu</button>
          <span>Khi chạy dashboard trên máy chủ nội bộ, đặt OLLAMA_ORIGINS cho phép địa chỉ của dashboard.</span>` : html`<span>Chỉ Phòng QLCL và quản trị đổi được thiết lập này.</span>`,
      })}
      ${plainCard({
        title: 'Phản hồi 👍/👎 của người dùng',
        sub: 'Dữ liệu phản hồi phục vụ đánh giá độ chính xác AI (TC4)',
        body: html`<dl class="kv"><dt>Hữu ích</dt><dd>${fmtInt(up)}</dd><dt>Chưa đúng</dt><dd>${fmtInt(down)}</dd><dt>Tỷ lệ hữu ích</dt><dd>${up + down ? `${fmtNum((up / (up + down)) * 100, 0)}%` : '–'}</dd></dl>
          ${dataTable({ compact: true, emptyText: 'Chưa có phản hồi', columns: [{ label: 'Thời điểm', render: (f) => fmtDateTime(f.time) }, { label: 'Nội dung', render: (f) => html`<span class="small">${f.target}</span>` }, { label: 'Đánh giá', render: (f) => (f.value === 'up' ? '👍' : '👎') }, { label: 'Bộ máy', key: 'engine' }], rows: fb.slice(0, 12) })}`,
      })}
    </div>
    <div class="mt-16">${plainCard({
      title: 'Thử bộ kiểm số',
      sub: 'Mọi con số trong văn bản AI phải có trong dữ kiện; mọi câu phải có mã nguồn [F…]. Nếu không, hệ thống sinh lại (tối đa 2 lần) rồi gắn cờ “cần xem lại”.',
      body: html`<div class="grid grid--2">
          <div class="form-field"><label for="fc-facts">Dữ kiện (mỗi dòng “Fn: nội dung”)</label><textarea class="textarea" id="fc-facts" rows="7" style="min-height:150px">${DEMO_FACTS}</textarea></div>
          <div class="form-field"><label for="fc-text">Văn bản cần kiểm</label><textarea class="textarea" id="fc-text" rows="7" style="min-height:150px">${DEMO_TEXT}</textarea></div>
        </div>
        <div id="fc-result" class="mt-16" aria-live="polite"></div>`,
      foot: html`<button type="button" class="btn btn--sm btn--primary" data-factcheck>${icon('check')}Kiểm tra</button><span>Ví dụ có sẵn chứa 1 số lạ (3,12) và 1 câu thiếu mã nguồn.</span>`,
    })}</div>
    <div class="mt-16">${plainCard({
      title: 'Lời nhắc hệ thống (Phụ lục B)',
      body: html`<pre style="white-space:pre-wrap;margin:0;font:inherit;font-size:13px;background:var(--surface-2);padding:12px;border-radius:8px">${SYSTEM_PROMPT}</pre>`,
    })}</div>`;
}

function mountAiTab(root, ctx) {
  const form = root.querySelector('#ai-form');
  on(root, 'click', '[data-test-ollama]', async () => {
    const box = root.querySelector('#ai-test');
    box.innerHTML = '<span class="caption">Đang kiểm tra…</span>';
    const res = await testOllama({ ...state.cfg, ollamaUrl: form.elements.ollamaUrl.value.trim() || state.cfg.ollamaUrl, ollamaModel: form.elements.ollamaModel.value.trim() });
    box.innerHTML = String(res.ok
      ? html`<div class="check-line check-line--ok">${icon('check', { size: 14 })}<span>Kết nối được. Mô hình hiện có: ${res.models.join(', ') || 'không có'}${res.hasModel ? '' : ' – chưa có mô hình đã chọn'}</span></div>`
      : html`<div class="check-line check-line--bad"><span aria-hidden="true">⚠</span><span>Không kết nối được (${res.message}). Trên GitHub Pages dùng bộ máy mẫu câu; Ollama dùng khi chạy trong mạng nội bộ.</span></div>`);
  });
  on(root, 'click', '[data-save-ai]', () => {
    const next = {
      aiEngine: form.elements.aiEngine.value,
      ollamaUrl: form.elements.ollamaUrl.value.trim() || DEFAULT_CONFIG.ollamaUrl,
      ollamaModel: form.elements.ollamaModel.value.trim() || DEFAULT_CONFIG.ollamaModel,
      expertReview: form.elements.expertReview.checked,
    };
    const changes = Object.entries(next).filter(([k, v]) => v !== state.cfg[k]).map(([key, to]) => ({ key, from: state.cfg[key], to }));
    if (!changes.length) return toast('Không có thay đổi');
    configStore.apply(changes, ctx.user, 'Thiết lập mô-đun AI');
    ctx.recompute({ reason: 'ai' });
    toast('Đã lưu thiết lập mô-đun AI');
    ctx.route();
  });
  on(root, 'click', '[data-factcheck]', () => {
    const facts = root.querySelector('#fc-facts').value.split(/\n+/).map((l) => l.match(/^\s*(F\d+)\s*[:：]\s*(.+)$/)).filter(Boolean).map((m) => ({ ma: m[1], noi_dung: m[2] }));
    const text = root.querySelector('#fc-text').value;
    const res = checkText(text, facts, { extraAllowed: allowedConstants(state.cfg) });
    let marked = esc(text);
    for (const n of res.unknownNumbers) marked = marked.split(esc(n)).join(`<mark style="background:var(--alert-tint);padding:0 2px;border-radius:3px">${esc(n)}</mark>`);
    root.querySelector('#fc-result').innerHTML = String(html`${res.ok
      ? html`<div class="banner banner--info" style="margin:0"><div class="banner__icon">✔</div><div class="banner__body"><div class="banner__title">Đạt: mọi con số và mã nguồn khớp dữ kiện</div></div></div>`
      : html`<div class="banner banner--alert" style="margin:0"><div class="banner__icon">⚠</div><div class="banner__body"><div class="banner__title">Cần xem lại</div>
          <div class="small">${res.unknownNumbers.length ? html`Số không có trong dữ kiện: <b>${res.unknownNumbers.join(', ')}</b>. ` : ''}${res.badCodes.length ? html`Mã nguồn không tồn tại: <b>${res.badCodes.join(', ')}</b>. ` : ''}${res.uncited.length ? html`Câu thiếu mã nguồn: “${res.uncited.join('”, “')}”.` : ''}</div></div></div>`}
      <p class="small mt-16">${raw(marked)}</p>`);
  });
}
