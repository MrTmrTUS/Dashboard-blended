// M6 › Nhập và kiểm tra điểm (nghiệp vụ 3): nhập từ Excel/LMS, kiểm tra trùng sinh viên, thiếu điểm, vượt điểm tối đa,
// sai mã đề, sai lần thi; xem trước; xác nhận rồi tính lại. Tệp được đọc ngay trong trình duyệt, không gửi đi đâu.
import { cloCanImport } from '../access.js';
import { cloResult, semesterLabel } from '../api-clo.js';
import { SUB_STATE } from '../core/clo.js';
import { applyCloImport, CLO_IMPORT_ORDER, CLO_TEMPLATES, cloValidationContext, exportCloCsv, ISSUE_LABELS, validateCloCsv } from '../core/clo-import.js';
import { toCsv } from '../core/csv.js';
import { fmtDate, fmtInt, fmtPct, fmtScore } from '../core/format.js';
import { state } from '../store.js';
import { banner, dataTable, emptyState, pageHead, plainCard, statusChip, toast } from '../ui/components.js';
import { downloadText, html, on, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { cloFilterDefs, cloHash, cloMeta, cloPrepare, cloTabsNav } from './clo-common.js';
import { MODES } from '../data/clo-catalog.js';

const wizard = { kind: 'diem_chi_tiet', fileName: '', report: null, mode: 'merge', recheck: null };

const MODE_TEXT = {
  clo_hoc_phan: { merge: 'Tạo hoặc cập nhật bản nháp bộ quy tắc (chờ phê duyệt)', replace: 'Như bổ sung – bộ quy tắc đã phê duyệt không bị ghi đè' },
  ma_tran_danh_gia: { merge: 'Tạo hoặc cập nhật bản nháp bộ quy tắc (chờ phê duyệt)', replace: 'Như bổ sung – bộ quy tắc đã phê duyệt không bị ghi đè' },
  danh_sach_lop: { merge: 'Thêm hoặc cập nhật sinh viên trong danh sách lớp', replace: 'Thay danh sách của các lớp có trong tệp' },
  diem_chi_tiet: { merge: 'Thêm hoặc cập nhật điểm theo (sinh viên, bài, lần)', replace: 'Thay toàn bộ điểm của các (lớp, bài, lần) có trong tệp' },
  diem_theo_bai: { merge: 'Thêm hoặc cập nhật điểm theo (sinh viên, bài, lần)', replace: 'Thay toàn bộ điểm của các (lớp, bài, lần) có trong tệp' },
};

export const CloImportView = {
  screen: 'M6',
  layout: 'wide',
  title: () => 'Nhập và kiểm tra điểm – CLO',
  filters: (ctx) => cloFilterDefs(ctx, 'nhap', ['ky', 'lop']),
  meta: (ctx) => cloMeta(ctx.f2?.rv),
  prepare(ctx) {
    cloPrepare(ctx);
    const f = ctx.f2;
    ctx.data = { res: f.entry?.rv ? cloResult(f.classId, 'latest') : null, canImport: cloCanImport(ctx.user, f.entry?.cls ?? null) };
  },
  render(ctx) {
    const f = ctx.f2;
    const tpl = CLO_TEMPLATES[wizard.kind];
    const steps = ['Chọn loại tệp', 'Chọn tệp', 'Kiểm tra lỗi', 'Xem trước', 'Xác nhận và tính lại'];
    const stage = !wizard.report ? 1 : wizard.report.ok ? 3 : 2;
    return html`${pageHead({
      crumbs: [{ label: 'Kết quả CLO', href: cloHash('lop', { ky: f.semesterId }) }, { label: 'Nhập và kiểm tra điểm' }],
      title: 'Nhập và kiểm tra điểm',
      question: 'Dữ liệu điểm đã đủ, đúng để phân tích CLO chưa?',
    })}
      ${cloTabsNav(ctx, 'nhap')}
      ${banner({ kind: 'info', title: 'Nhập từ Excel hoặc LMS – kiểm tra trước khi tính', body: html`Thứ tự: CLO học phần → ma trận câu hỏi × CLO (tạo bản nháp, cần phê duyệt) → danh sách lớp → điểm chi tiết (dạng dài từ LMS) hoặc điểm theo bài (bảng Excel mỗi sinh viên một dòng). CSV dấu phẩy hoặc chấm phẩy, số kiểu 7,5 hoặc 7.5. <b>Chỉ nhận mã nghiên cứu</b>, không nhận mã sinh viên thật. Tệp được kiểm tra ngay trong trình duyệt.` })}
      <ol class="steps" aria-label="Các bước nhập">${steps.map((s, i) => html`<li class="${i < stage ? 'is-done' : i === stage ? 'is-active' : ''}">${s}</li>`)}</ol>
      <div class="grid grid--40-60 grid--start">
        ${plainCard({
          title: '1. Loại tệp',
          flush: true,
          body: html`<fieldset style="border:0;margin:0;padding:0"><legend class="sr-only">Loại tệp</legend><ul class="list">${CLO_IMPORT_ORDER.map(
            (k) => html`<li><label class="list-row" style="cursor:pointer"><input type="radio" name="clo-kind" value="${k}"${raw(k === wizard.kind ? ' checked' : '')} style="accent-color:var(--navy);width:18px;height:18px">
              <span class="list-row__main"><span class="list-row__title">${CLO_TEMPLATES[k].file}</span><br><span class="list-row__meta">${CLO_TEMPLATES[k].title}</span></span></label></li>`,
          )}</ul></fieldset>`,
          foot: html`<span>${tpl.note}</span>`,
        })}
        <div class="stack">
          ${plainCard({
            title: `2. Chọn tệp ${tpl.file}`,
            sub: `Cột bắt buộc: ${tpl.required.join(', ')}${tpl.optional.length ? ` · tùy chọn: ${tpl.optional.join(', ')}` : ''}`,
            body: html`<label class="dropzone" id="clo-dropzone">${icon('upload', { size: 28 })}<span><b>Kéo thả tệp CSV vào đây</b> hoặc bấm để chọn tệp</span><span class="caption">${wizard.fileName ? `Đã chọn: ${wizard.fileName}` : 'Chưa chọn tệp'}</span><input type="file" accept=".csv,text/csv" id="clo-file" class="sr-only"></label>`,
            foot: html`<button type="button" class="btn btn--sm" data-tpl-empty>${icon('download')}Mẫu trống</button>
              <button type="button" class="btn btn--sm" data-tpl-full>${icon('download')}Mẫu có dữ liệu${f.entry && ['diem_chi_tiet', 'diem_theo_bai', 'danh_sach_lop'].includes(wizard.kind) ? ` (${f.entry.cls.lineage.split('-').pop()} ${semesterLabel(f.semesterId)})` : ''}</button>
              ${wizard.kind === 'diem_chi_tiet' ? html`<button type="button" class="btn btn--sm" data-demo-errors>Thử tệp mẫu có lỗi</button>` : ''}`,
          })}
          <div>${reportCards(ctx)}</div>
        </div>
      </div>
      <div class="mt-16">${completenessCard(ctx)}</div>`;
  },
  mount(root, ctx) {
    const rerender = () => ctx.route();
    on(root, 'change', 'input[name="clo-kind"]', (e, el) => {
      Object.assign(wizard, { kind: el.value, report: null, fileName: '', mode: 'merge' });
      rerender();
    });
    on(root, 'change', 'input[name="clo-mode"]', (e, el) => (wizard.mode = el.value));
    const input = root.querySelector('#clo-file');
    const zone = root.querySelector('#clo-dropzone');
    const readFile = (file) => {
      if (!file) return;
      if (file.size > 30 * 1024 * 1024) return toast('Tệp lớn hơn 30 MB – hãy chia nhỏ theo lớp');
      const reader = new FileReader();
      reader.onload = () => {
        validate(file.name, String(reader.result));
        rerender();
      };
      reader.onerror = () => toast('Không đọc được tệp');
      reader.readAsText(file, 'utf-8');
    };
    input?.addEventListener('change', () => readFile(input.files[0]));
    zone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('is-over');
    });
    zone?.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone?.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('is-over');
      readFile(e.dataTransfer.files[0]);
    });
    on(root, 'click', '[data-tpl-empty]', () => {
      const t = CLO_TEMPLATES[wizard.kind];
      downloadText(t.file.replace('.csv', '_mau_trong.csv'), toCsv([...t.required, ...t.optional], [], { delimiter: ';' }));
    });
    on(root, 'click', '[data-tpl-full]', () => {
      const classIds = ctx.f2.entry ? [ctx.f2.classId] : null;
      const versionId = ctx.f2.rv?.id ?? null;
      downloadText(CLO_TEMPLATES[wizard.kind].file, exportCloCsv(state.dataset, wizard.kind, { classIds, versionId: ['clo_hoc_phan', 'ma_tran_danh_gia'].includes(wizard.kind) ? versionId : null }));
    });
    on(root, 'click', '[data-demo-errors]', async () => {
      try {
        const res = await fetch('templates/diem_chi_tiet_loi_mau.csv');
        if (!res.ok) throw new Error(res.status);
        validate('diem_chi_tiet_loi_mau.csv', await res.text());
        rerender();
      } catch {
        toast('Không tải được tệp mẫu có lỗi');
      }
    });
    on(root, 'click', '[data-recheck]', () => {
      const text = exportCloCsv(state.dataset, 'diem_chi_tiet', { classIds: [ctx.f2.classId] });
      wizard.recheck = { classId: ctx.f2.classId, report: validateCloCsv('diem_chi_tiet', text, cloValidationContext(state.dataset)) };
      rerender();
    });
    on(root, 'click', '[data-confirm-import]', async () => {
      const r = wizard.report;
      if (!r?.ok) return;
      const label = `${fmtInt(r.records.length)} bản ghi từ ${wizard.fileName}`;
      const next = applyCloImport(state.dataset, wizard.kind, r.records, { mode: wizard.mode, user: ctx.user });
      const kind = wizard.kind;
      Object.assign(wizard, { report: null, fileName: '' });
      await ctx.replaceDataset(next, { key: 'import' });
      toast(`Đã nhập ${label} và tính lại${kind === 'clo_hoc_phan' || kind === 'ma_tran_danh_gia' ? ' – bản nháp chờ phê duyệt ở mục Cấu hình ma trận' : ''}`);
    });
  },
};

function validate(fileName, text) {
  wizard.fileName = fileName;
  try {
    wizard.report = validateCloCsv(wizard.kind, text, cloValidationContext(state.dataset));
  } catch (e) {
    wizard.report = null;
    toast(`Không đọc được tệp: ${e.message}`);
  }
}

function issueSummary(r) {
  const entries = Object.entries(r.issues || {}).filter(([, n]) => n);
  if (!entries.length) return '';
  return html`<div class="clo-chips" style="margin:8px 0">${entries.map(([k, n]) => html`<span class="chip chip--${['absentWork', 'partial'].includes(k) ? 'warn' : 'alert'}">${ISSUE_LABELS[k] ?? k}: ${fmtInt(n)}</span>`)}</div>`;
}

function reportCards(ctx) {
  const r = wizard.report;
  if (!r) return plainCard({ body: emptyState({ title: 'Chưa có tệp để kiểm tra', text: 'Chọn tệp ở bước 2, hoặc bấm “Thử tệp mẫu có lỗi” để xem cách báo lỗi theo dòng.', iconText: '📄' }) });
  const canEdit = ctx.data.canImport;
  const cols = r.header.filter((h) => h).slice(0, 10);
  const summaryText = Object.entries(r.summary).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ');
  return html`${plainCard({
    title: '3. Kết quả kiểm tra',
    sub: `${wizard.fileName} · ${fmtInt(r.totalRows)} dòng · dấu phân cách “${r.delimiter === '\t' ? 'tab' : r.delimiter}”`,
    body: html`<div class="page-actions" style="margin-bottom:6px">${r.ok ? statusChip('ok', { label: 'Không có lỗi', large: true }) : statusChip('alert', { label: `${fmtInt(r.errorCount)} lỗi`, large: true })}${r.warningCount ? statusChip('warn', { label: `${fmtInt(r.warningCount)} cảnh báo`, large: true }) : ''}<span class="chip chip--neutral">${fmtInt(r.records.length)} bản ghi hợp lệ</span></div>
      ${issueSummary(r)}
      ${summaryText ? html`<p class="caption">${summaryText}</p>` : ''}
      ${r.errors.length ? html`<h3 class="card__title" style="font-size:14px;margin:12px 0 6px">Lỗi (báo theo dòng của tệp)</h3><div class="table-scroll">${dataTable({ compact: true, columns: [{ label: 'Dòng', num: true, render: (e) => e.line ?? '–' }, { label: 'Cột', render: (e) => e.column ?? '–' }, { label: 'Loại', render: (e) => (e.issue ? ISSUE_LABELS[e.issue] ?? '' : '') }, { label: 'Mô tả', key: 'message' }], rows: r.errors })}</div>` : ''}
      ${r.warnings.length ? html`<h3 class="card__title" style="font-size:14px;margin:12px 0 6px">Cảnh báo</h3><div class="table-scroll" style="max-height:220px">${dataTable({ compact: true, columns: [{ label: 'Dòng', num: true, render: (e) => e.line ?? '–' }, { label: 'Cột', render: (e) => e.column ?? '–' }, { label: 'Mô tả', key: 'message' }], rows: r.warnings })}</div>` : ''}`,
  })}
  ${r.preview.length ? html`<div class="mt-16">${plainCard({ title: '4. Xem trước', sub: `${Math.min(10, r.preview.length)} dòng đầu · ${cols.length}/${r.header.length} cột đầu`, body: html`<div class="table-scroll" style="max-height:300px">${dataTable({ compact: true, columns: cols.map((c) => ({ label: c, render: (row) => html`<span class="small">${String(row[c] ?? '').slice(0, 50)}</span>` })), rows: r.preview })}</div>` })}</div>` : ''}
  <div class="mt-16">${plainCard({
    title: '5. Xác nhận',
    body: html`<div class="form-field" role="radiogroup" aria-label="Cách áp dụng">${['merge', 'replace'].map((m) => html`<label class="check"><input type="radio" name="clo-mode" value="${m}"${raw(wizard.mode === m ? ' checked' : '')}> ${m === 'merge' ? 'Bổ sung' : 'Thay thế'} – ${MODE_TEXT[wizard.kind][m]}</label>`)}</div>
      ${!r.ok ? html`<p class="small" style="color:var(--alert-ink);margin-top:8px">Sửa các lỗi trong tệp gốc (Excel, LMS) rồi chọn lại tệp. Không nhập một phần tệp có lỗi.</p>` : ''}
      ${!canEdit ? html`<p class="small" style="margin-top:8px">Giảng viên của lớp, Phòng QLCL và nhóm quản trị được xác nhận nhập điểm.</p>` : ''}`,
    foot: html`<button type="button" class="btn btn--primary" data-confirm-import${raw(r.ok && canEdit ? '' : ' disabled')}>${icon('check')}Xác nhận nhập và tính lại</button><span>Dữ liệu lưu trong trình duyệt này (bản chính thức lưu trên máy chủ).</span>`,
  })}</div>`;
}

// Tình trạng thu thập minh chứng của lớp: đã chấm, chưa chấm, vắng, không đủ điều kiện, chưa có dữ liệu.
function completenessCard(ctx) {
  const f = ctx.f2;
  const res = ctx.data.res;
  if (!f.entry) return plainCard({ body: emptyState({ title: 'Chưa có lớp có dữ liệu CLO trong phạm vi' }) });
  if (!res) return plainCard({ title: `Tình trạng dữ liệu – ${f.entry.cls.name}`, body: emptyState({ title: 'Lớp chưa có bộ quy tắc CLO đã phê duyệt' }) });
  const rv = f.rv;
  const lowAtt = res.students.filter((s) => s.att !== null && s.att < rv.rules.attendanceMin).length;
  const rc = wizard.recheck?.classId === f.classId ? wizard.recheck.report : null;
  return plainCard({
    title: `Tình trạng thu thập minh chứng – ${f.entry.cls.name}`,
    sub: `${semesterLabel(f.semesterId)} · bộ quy tắc ${rv.version} · ${res.inProgress ? 'học kỳ đang diễn ra' : 'học kỳ đã kết thúc'}`,
    body: html`<p class="small">${fmtInt(res.nActive)} sinh viên thuộc diện đánh giá · ${fmtInt(res.withdrawn.length)} rút học phần · ${fmtInt(lowAtt)} có mặt dưới ${fmtPct(rv.rules.attendanceMin)} (không đủ điều kiện dự thi theo đề cương)</p>
      ${dataTable({
        compact: true,
        columns: [
          { label: 'Bài đánh giá', render: (a) => html`<b>${a.ref}</b> ${a.name}<br><span class="caption">${MODES[a.mode]?.label ?? ''}</span>` },
          { label: 'Ngày (lần 1 · lần 2)', render: (a) => (res.assessments[a.code].dates.length ? res.assessments[a.code].dates.map((x) => { const [t, dd] = x.split('|'); return `lần ${t}: ${fmtDate(dd)}`; }).join(' · ') : html`<span class="caption">${SUB_STATE.not_held}</span>`) },
          { label: 'Đã chấm', num: true, render: (a) => fmtInt(res.assessments[a.code].graded) },
          { label: 'Chưa chấm', num: true, render: (a) => fmtInt(res.assessments[a.code].pending) },
          { label: 'Vắng / không nộp', num: true, render: (a) => fmtInt(res.assessments[a.code].absent) },
          { label: 'Không đủ ĐK dự thi', num: true, render: (a) => fmtInt(res.assessments[a.code].banned) },
          { label: 'Chưa có dữ liệu', num: true, render: (a) => (res.assessments[a.code].held ? fmtInt(res.assessments[a.code].missing) : '–') },
          { label: 'Đánh giá lại', num: true, render: (a) => fmtInt(res.assessments[a.code].retaken) },
          { label: 'Điểm TB', num: true, render: (a) => fmtScore(res.assessments[a.code].mean) },
        ],
        rows: rv.assessments,
      })}
      ${rc ? html`<div class="mt-16">${rc.ok ? banner({ kind: 'info', iconText: '✔', title: `Dữ liệu đã lưu của lớp hợp lệ: ${fmtInt(rc.records.length)} bài làm, không có lỗi`, body: rc.warningCount ? `${rc.warningCount} cảnh báo (ví dụ sinh viên thuộc diện chưa có dòng điểm).` : '' }) : banner({ kind: 'alert', iconText: '✖', title: `Dữ liệu đã lưu có ${rc.errorCount} lỗi`, body: rc.errors.slice(0, 3).map((e) => e.message).join('; ') })}</div>` : ''}`,
    foot: html`<button type="button" class="btn btn--sm" data-recheck>${icon('refresh')}Kiểm tra lại dữ liệu đã lưu của lớp</button><span>Chạy lại đúng bộ kiểm tra của bước nhập trên dữ liệu đang dùng.</span>`,
  });
}
