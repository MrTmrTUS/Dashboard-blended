// M0 › Nhập dữ liệu: tải tệp theo mẫu → kiểm tra lỗi → xem trước → xác nhận → hệ thống tính lại.
// Tệp được đọc và kiểm tra ngay trong trình duyệt, không gửi đi đâu.
import { toCsv } from '../core/csv.js';
import { fmtInt } from '../core/format.js';
import { IMPORT_ORDER, TEMPLATES, validateCsv } from '../core/importer.js';
import { applyImport, exportCsv, validationContext } from '../data/dataset-io.js';
import { state } from '../store.js';
import { banner, dataTable, emptyState, plainCard, statusChip, toast } from '../ui/components.js';
import { downloadText, html, on, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const wizard = { kind: 'phieu_khao_sat', fileName: '', text: '', report: null, mode: 'merge' };

const MODE_TEXT = {
  danh_muc_lop: { merge: 'Thêm hoặc cập nhật lớp theo mã lớp học phần', replace: 'Bắt đầu bộ dữ liệu mới: xóa phiếu, điểm, danh mục cũ (giữ tham số và thư viện biện pháp)' },
  sinh_vien: { merge: 'Thêm hoặc cập nhật sinh viên theo mã nghiên cứu', replace: 'Thay toàn bộ danh sách sinh viên và phân công cố vấn' },
  phieu_khao_sat: { merge: 'Thêm hoặc cập nhật phiếu theo mã phiếu', replace: 'Thay toàn bộ phiếu của các đợt có trong tệp' },
  diem_hoc_vu: { merge: 'Cập nhật điểm theo (mã nghiên cứu, lớp học phần)', replace: 'Thay toàn bộ điểm học vụ' },
  tham_so_nghien_cuu: { merge: 'Cập nhật các tham số có trong tệp', replace: 'Thay cờ bất biến và chênh lệch tiềm ẩn bằng nội dung tệp' },
  thu_vien_bien_phap: { merge: 'Thêm hoặc cập nhật biện pháp theo mã', replace: 'Thay toàn bộ thư viện biện pháp' },
};

export function renderImportTab(ctx) {
  const tpl = TEMPLATES[wizard.kind];
  const steps = ['Chọn loại tệp', 'Chọn tệp', 'Kiểm tra lỗi', 'Xem trước', 'Xác nhận và tính lại'];
  const stage = !wizard.report ? 1 : wizard.report.ok ? 3 : 2;
  return html`
    ${banner({ kind: 'info', title: 'Quy trình nhập theo mục 3.6 và Phụ lục A', body: html`Nhập lần lượt: danh mục lớp → (sinh viên, cố vấn) → phiếu khảo sát → điểm học vụ → tham số nghiên cứu → thư viện biện pháp. Tệp CSV dấu phẩy hoặc chấm phẩy (Excel tiếng Việt), mã hóa UTF-8. <b>Không nhận mã sinh viên thật</b> – chỉ mã nghiên cứu do Phòng QLĐT cấp. Tệp được kiểm tra ngay trong trình duyệt, không gửi đi đâu.` })}
    <ol class="steps" aria-label="Các bước nhập">${steps.map((s, i) => html`<li class="${i < stage ? 'is-done' : i === stage ? 'is-active' : ''}">${s}</li>`)}</ol>
    <div class="grid grid--40-60 grid--start">
      ${plainCard({
        title: '1. Loại tệp',
        flush: true,
        body: html`<fieldset style="border:0;margin:0;padding:0"><legend class="sr-only">Loại tệp</legend><ul class="list">${IMPORT_ORDER.map(
          (k) => html`<li><label class="list-row" style="cursor:pointer">
            <input type="radio" name="kind" value="${k}"${raw(k === wizard.kind ? ' checked' : '')} style="accent-color:var(--navy);width:18px;height:18px">
            <span class="list-row__main"><span class="list-row__title">${TEMPLATES[k].file}</span><br><span class="list-row__meta">${TEMPLATES[k].title} · ${fmtInt(TEMPLATES[k].required.length)} cột bắt buộc</span></span>
          </label></li>`,
        )}</ul></fieldset>`,
        foot: html`<span>${tpl.note}</span>`,
      })}
      <div class="stack">
        ${plainCard({
          title: `2. Chọn tệp ${tpl.file}`,
          sub: `Cột bắt buộc: ${tpl.required.length > 14 ? `${tpl.required.slice(0, 5).join(', ')}, Q_C1_1 … Q_Pt2_5 (62 cột), EB1 … EC4 (12 cột), ${tpl.required.slice(-4).join(', ')}` : tpl.required.join(', ')}${tpl.optional.length ? ` · tùy chọn: ${tpl.optional.join(', ')}` : ''}`,
          body: html`<label class="dropzone" id="dropzone">
              ${icon('upload', { size: 28 })}
              <span><b>Kéo thả tệp CSV vào đây</b> hoặc bấm để chọn tệp</span>
              <span class="caption">${wizard.fileName ? `Đã chọn: ${wizard.fileName}` : 'Chưa chọn tệp'}</span>
              <input type="file" accept=".csv,text/csv" id="file-input" class="sr-only">
            </label>`,
          foot: html`<button type="button" class="btn btn--sm" data-tpl-empty>${icon('download')}Mẫu trống</button>
            <button type="button" class="btn btn--sm" data-tpl-full>${icon('download')}Mẫu có dữ liệu hiện tại</button>
            ${wizard.kind === 'phieu_khao_sat' ? html`<button type="button" class="btn btn--sm" data-demo-errors>Thử tệp mẫu có lỗi</button>` : ''}`,
        })}
        <div id="import-result">${renderReport(ctx)}</div>
      </div>
    </div>`;
}

function renderReport(ctx) {
  const r = wizard.report;
  if (!r) return plainCard({ body: emptyState({ title: 'Chưa có tệp để kiểm tra', text: 'Chọn tệp ở bước 2; kết quả kiểm tra lỗi theo dòng sẽ hiện ở đây.', iconText: '📄' }) });
  const canEdit = ['qlcl', 'admin'].includes(ctx.user.role);
  const cols = r.header.filter((h) => h).slice(0, 9);
  const summaryText = Object.entries(r.summary)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? (Array.isArray(v) ? v.join(', ') : Object.entries(v).map(([a, b]) => `${a} (${b})`).join(', ')) : v}`)
    .join(' · ');
  return html`
    ${plainCard({
      title: '3. Kết quả kiểm tra',
      sub: `${wizard.fileName} · ${fmtInt(r.totalRows)} dòng dữ liệu · dấu phân cách “${r.delimiter === '\t' ? 'tab' : r.delimiter}”`,
      body: html`<div class="page-actions" style="margin-bottom:10px">
          ${r.ok ? statusChip('ok', { label: 'Không có lỗi', large: true }) : statusChip('alert', { label: `${fmtInt(r.errorCount)} lỗi`, large: true })}
          ${r.warningCount ? statusChip('warn', { label: `${fmtInt(r.warningCount)} cảnh báo`, large: true }) : ''}
          <span class="chip chip--neutral">${fmtInt(r.records.length)} bản ghi hợp lệ</span>
        </div>
        ${summaryText ? html`<p class="caption">${summaryText}</p>` : ''}
        ${r.errors.length ? html`<h3 class="card__title" style="font-size:14px;margin:12px 0 6px">Lỗi (báo theo dòng của tệp)</h3><div class="table-scroll">${dataTable({ compact: true, columns: [{ label: 'Dòng', num: true, render: (e) => e.line ?? '–' }, { label: 'Cột', render: (e) => e.column ?? '–' }, { label: 'Mô tả', key: 'message' }], rows: r.errors })}</div>${r.errorCount > r.errors.length ? html`<p class="caption">Hiển thị ${r.errors.length}/${r.errorCount} lỗi đầu tiên.</p>` : ''}` : ''}
        ${r.warnings.length ? html`<h3 class="card__title" style="font-size:14px;margin:12px 0 6px">Cảnh báo</h3><div class="table-scroll" style="max-height:220px">${dataTable({ compact: true, columns: [{ label: 'Dòng', num: true, render: (e) => e.line ?? '–' }, { label: 'Cột', render: (e) => e.column ?? '–' }, { label: 'Mô tả', key: 'message' }], rows: r.warnings })}</div>` : ''}`,
    })}
    ${r.preview.length
      ? html`<div class="mt-16">${plainCard({
          title: '4. Xem trước',
          sub: `${Math.min(10, r.preview.length)} dòng đầu · ${cols.length}/${r.header.length} cột đầu`,
          body: html`<div class="table-scroll" style="max-height:300px">${dataTable({ compact: true, columns: cols.map((c) => ({ label: c, render: (row) => html`<span class="small">${String(row[c] ?? '').slice(0, 60)}</span>` })), rows: r.preview })}</div>`,
        })}</div>`
      : ''}
    <div class="mt-16">${plainCard({
      title: '5. Xác nhận',
      body: html`<div class="form-field" role="radiogroup" aria-label="Cách áp dụng">
          ${['merge', 'replace'].map((m) => html`<label class="check"><input type="radio" name="mode" value="${m}"${raw(wizard.mode === m ? ' checked' : '')}> ${m === 'merge' ? 'Bổ sung' : 'Thay thế'} – ${MODE_TEXT[wizard.kind][m]}</label>`)}
        </div>
        ${!r.ok ? html`<p class="small" style="color:var(--alert-ink);margin-top:8px">Sửa các lỗi trên trong tệp gốc (hoặc gửi lại Phòng QLĐT) rồi chọn lại tệp. Không nhập một phần tệp có lỗi.</p>` : ''}
        ${!canEdit ? html`<p class="small" style="margin-top:8px">Chỉ Phòng QLCL và nhóm quản trị được xác nhận nhập dữ liệu.</p>` : ''}`,
      foot: html`<button type="button" class="btn btn--primary" data-confirm-import${raw(r.ok && canEdit ? '' : ' disabled')}>${icon('check')}Xác nhận nhập và tính lại</button>
        <span>Đợt mới nhập ở trạng thái “chờ công bố”.</span>`,
    })}</div>`;
}

function validateText(ctx, fileName, text) {
  wizard.fileName = fileName;
  wizard.text = text;
  try {
    wizard.report = validateCsv(wizard.kind, text, validationContext(state.dataset));
  } catch (e) {
    wizard.report = null;
    toast(`Không đọc được tệp: ${e.message}`);
  }
}

export function mountImportTab(root, ctx) {
  const rerender = () => ctx.route();
  on(root, 'change', 'input[name="kind"]', (e, el) => {
    wizard.kind = el.value;
    wizard.report = null;
    wizard.fileName = '';
    wizard.mode = 'merge';
    rerender();
  });
  on(root, 'change', 'input[name="mode"]', (e, el) => {
    wizard.mode = el.value;
  });
  const input = root.querySelector('#file-input');
  const zone = root.querySelector('#dropzone');
  const readFile = (file) => {
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) return toast('Tệp lớn hơn 30 MB – hãy chia nhỏ theo đợt');
    const reader = new FileReader();
    reader.onload = () => {
      validateText(ctx, file.name, String(reader.result));
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
    const t = TEMPLATES[wizard.kind];
    downloadText(t.file.replace('.csv', '_mau_trong.csv'), toCsv([...t.required, ...t.optional], []));
  });
  on(root, 'click', '[data-tpl-full]', () => downloadText(TEMPLATES[wizard.kind].file, exportCsv(state.dataset, wizard.kind)));
  on(root, 'click', '[data-demo-errors]', async () => {
    try {
      const res = await fetch('templates/phieu_khao_sat_loi_mau.csv');
      if (!res.ok) throw new Error(res.status);
      validateText(ctx, 'phieu_khao_sat_loi_mau.csv', await res.text());
      rerender();
    } catch {
      toast('Không tải được tệp mẫu có lỗi');
    }
  });
  on(root, 'click', '[data-confirm-import]', async () => {
    const r = wizard.report;
    if (!r?.ok) return;
    if (wizard.kind === 'danh_muc_lop' && wizard.mode === 'replace' && !confirm('Bắt đầu bộ dữ liệu mới? Phiếu, điểm và danh mục hiện có sẽ bị thay thế (chỉ trong trình duyệt này).')) return;
    const next = applyImport(state.dataset, wizard.kind, r.records, { mode: wizard.mode });
    const label = `${fmtInt(r.records.length)} bản ghi từ ${wizard.fileName}`;
    wizard.report = null;
    wizard.fileName = '';
    await ctx.replaceDataset(next, { key: 'import' });
    toast(`Đã nhập ${label} và tính lại`);
  });
}
