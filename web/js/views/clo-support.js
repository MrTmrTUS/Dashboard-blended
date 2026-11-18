// M6 › Cần hỗ trợ: "Sinh viên nào thiếu bài, thiếu minh chứng, kết quả thấp – giao việc gì, hạn nào?" (nghiệp vụ 6).
// Giảng viên phụ trách và cố vấn học tập xem danh sách sinh viên; vai trò khác xem số lượng theo lớp.
// Ô "đã liên hệ" dùng chung với M3; nhiệm vụ hỗ trợ có thể đưa vào kế hoạch cải tiến (PDCA) của lớp.
import { cloSupportList, semesterLabel } from '../api-clo.js';
import { fmtDate, fmtInt, fmtPct, fmtScore } from '../core/format.js';
import { isNum } from '../core/stats.js';
import { SUPPORT_STATUS, SUPPORT_TYPES } from '../data/clo-catalog.js';
import { cloSupport, contacted, plans as planStore } from '../store.js';
import { banner, dataTable, emptyState, kpiTile, openDialog, pageHead, plainCard, statusChip, toast } from '../ui/components.js';
import { html, on, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { cloFilterDefs, cloHash, cloMeta, cloPrepare, cloStatusChip, cloTabsNav, keepQuery, scopeLine } from './clo-common.js';

const GROUPS = [
  { id: '', label: 'Cần hỗ trợ', test: (r) => r.need },
  { id: 'thieu-bai', label: 'Thiếu bài', test: (r) => r.issues.some((i) => i.kind === 'missing' || i.kind === 'banned') },
  { id: 'thieu-mc', label: 'Chưa đủ minh chứng', test: (r) => r.issues.some((i) => i.kind === 'insufficient') },
  { id: 'chua-dat', label: 'Chưa đạt', test: (r) => r.issues.some((i) => i.kind === 'not_achieved') },
  { id: 'sat-nguong', label: 'Sát ngưỡng', test: (r) => r.issues.some((i) => i.kind === 'near') },
  { id: 'cho-cham', label: 'Chờ chấm bài', test: (r) => r.issues.some((i) => i.kind === 'pending') },
  { id: 'da-giao', label: 'Đã giao nhiệm vụ', test: (r) => r.records.length > 0 },
];

const ISSUE_CHIP = { banned: 'alert', missing: 'alert', pending: 'neutral', pending_clo: 'neutral', insufficient: 'na', not_achieved: 'alert', near: 'warn' };

export const CloSupportView = {
  screen: 'M6',
  layout: 'wide',
  title: () => 'Cần hỗ trợ – kết quả CLO',
  filters: (ctx) => cloFilterDefs(ctx, 'ho-tro', ['ky', 'lop', 'clo']),
  meta: (ctx) => cloMeta(ctx.f2?.rv),
  prepare(ctx) {
    cloPrepare(ctx);
    ctx.all = ctx.query.tat_ca === '1';
    ctx.group = GROUPS.some((g) => g.id === ctx.query.nhom) ? ctx.query.nhom || '' : '';
    ctx.data = cloSupportList(ctx.user, ctx.f2, { all: ctx.all });
  },
  render(ctx) {
    const d = ctx.data;
    const f = ctx.f2;
    const head = pageHead({
      crumbs: [{ label: 'Kết quả CLO', href: cloHash('lop', { ky: f.semesterId }) }, { label: 'Cần hỗ trợ' }],
      title: 'Sinh viên cần hỗ trợ theo CLO',
      question: `Ai thiếu bài, thiếu minh chứng, chưa đạt – giao việc gì, hạn nào? · ${semesterLabel(f.semesterId)}`,
    });
    if (!d.studentView) {
      return html`${head}${cloTabsNav(ctx, 'ho-tro')}
        ${banner({ kind: 'info', iconText: '🔒', title: 'Danh sách sinh viên chỉ dành cho giảng viên phụ trách và cố vấn học tập', body: 'Vai trò của bạn xem số lượng theo lớp để theo dõi việc hỗ trợ; không hiển thị mã sinh viên.' })}
        ${plainCard({
          title: `Số sinh viên cần hỗ trợ theo lớp – ${semesterLabel(f.semesterId)}`,
          body: dataTable({
            columns: [
              { label: 'Lớp', render: (r) => html`<a href="${cloHash('tong-quan', { ky: f.semesterId, lop: r.cls.id })}">${r.cls.name}</a>` },
              { label: 'Thuộc diện', num: true, render: (r) => fmtInt(r.n) },
              { label: 'Cần hỗ trợ', num: true, render: (r) => fmtInt(r.need) },
              { label: 'Thiếu bài', num: true, render: (r) => fmtInt(r.missing) },
              { label: 'Chưa đủ minh chứng', num: true, render: (r) => fmtInt(r.insufficient) },
              { label: 'Chưa đạt ≥ 1 CLO', num: true, render: (r) => fmtInt(r.not_achieved) },
              { label: 'Sát ngưỡng', num: true, render: (r) => fmtInt(r.near) },
              { label: 'Đã giao nhiệm vụ', num: true, render: (r) => fmtInt(r.supported) },
            ],
            rows: d.perClass,
          }),
        })}`;
    }
    const grp = GROUPS.find((g) => g.id === ctx.group);
    const shown = d.rows.filter((r) => grp.test(r) && (!f.clo || r.issues.some((i) => i.clo === f.clo) || r.records.some((x) => x.clo === f.clo)));
    const need = d.rows.filter((r) => r.need);
    const supported = need.filter((r) => r.records.length);
    const retested = d.rows.flatMap((r) => r.records.filter((x) => x.retested));
    const passedAfter = retested.filter((x) => x.afterStatus === 'achieved');
    const hrefQ = (patch) => cloHash('ho-tro', { ...keepQuery(ctx), tat_ca: ctx.all ? '1' : '', nhom: ctx.group, ...patch });
    return html`${head}${cloTabsNav(ctx, 'ho-tro')}
      ${scopeLine(f, { n: shown.length, extra: ctx.all ? 'tất cả lớp trong học kỳ' : '' })}
      ${banner({ kind: 'sim', iconText: '⚠', title: 'Dùng để hỗ trợ học tập – không dùng để xếp loại hay xử lý học vụ', body: html`Sinh viên hiển thị bằng mã nghiên cứu (bản chính thức hiện mã sinh viên cho giảng viên phụ trách). ${icon('shield', { size: 14 })} Lượt xem đã được ghi vào nhật ký truy cập. Ô “đã liên hệ” dùng chung với M3.` })}
      <div class="grid grid--kpi">
        ${kpiTile({ label: 'Cần hỗ trợ', value: fmtInt(need.length), caption: 'thiếu bài, chưa đủ minh chứng hoặc chưa đạt ít nhất 1 CLO' })}
        ${kpiTile({ label: 'Đã giao nhiệm vụ', value: `${fmtInt(supported.length)}/${fmtInt(need.length)}`, caption: 'sinh viên cần hỗ trợ đã có nhiệm vụ, hạn hoàn thành' })}
        ${kpiTile({ label: 'Đạt sau đánh giá lại', value: retested.length ? `${fmtInt(passedAfter.length)}/${fmtInt(retested.length)}` : '–', caption: 'nhiệm vụ đã đánh giá lại bằng nhiệm vụ tương đương (lần 2)' })}
        ${kpiTile({ label: 'Đã liên hệ', value: fmtInt(need.filter((r) => r.contacted).length), caption: 'đánh dấu chung với M3 (giảng viên, cố vấn)' })}
      </div>
      <div class="page-actions mt-16 support-toolbar">
        <div class="seg" role="group" aria-label="Nhóm sinh viên">${GROUPS.map((g) => html`<a class="seg__item" href="${hrefQ({ nhom: g.id })}"${raw(g.id === ctx.group ? ' aria-current="page"' : '')}>${g.label} <span class="caption">${fmtInt(d.rows.filter(g.test).length)}</span></a>`)}</div>
        <a class="btn btn--sm" href="${hrefQ({ tat_ca: ctx.all ? '' : '1' })}">${ctx.all ? 'Chỉ lớp đang chọn' : 'Tất cả lớp trong học kỳ'}</a>
        ${d.canEdit ? html`<button type="button" class="btn btn--sm btn--primary" data-assign disabled>${icon('plus')}Giao nhiệm vụ cho <span data-count>0</span> sinh viên</button>` : ''}
      </div>
      <div class="mt-16">${plainCard({
        flush: true,
        body: shown.length ? html`<div class="risk-table">${supportTable(shown, d, ctx)}</div><div class="risk-cards">${supportCards(shown, d)}</div>` : emptyState({ title: 'Không có sinh viên trong nhóm này', iconText: '✔' }),
        foot: html`<span>Gợi ý hỗ trợ dựa trên nhóm lỗi chiếm ưu thế ở lần đánh giá đầu của từng sinh viên. Kết quả đánh giá lại tự cập nhật khi nhập điểm lần 2 (đề tương đương).</span>`,
      })}</div>`;
  },
  mount(root, ctx) {
    const d = ctx.data;
    if (!d?.studentView) return;
    const btn = root.querySelector('[data-assign]');
    const sync = () => {
      const n = root.querySelectorAll('[data-pick]:checked').length;
      if (btn) {
        btn.disabled = !n;
        btn.querySelector('[data-count]').textContent = n;
      }
    };
    on(root, 'change', '[data-pick]', sync);
    on(root, 'change', '[data-pick-all]', (e, box) => {
      root.querySelectorAll('.risk-table [data-pick]').forEach((b) => (b.checked = box.checked));
      sync();
    });
    on(root, 'click', '[data-assign]', () => {
      const picked = [...new Set([...root.querySelectorAll('[data-pick]:checked')].map((b) => b.value))];
      const rows = d.rows.filter((r) => picked.includes(`${r.s.code}|${r.cls.id}`));
      openAssignDialog(ctx, rows);
    });
    on(root, 'click', '[data-edit-support]', (e, b) => {
      const rec = cloSupport.all().find((x) => x.id === b.dataset.editSupport);
      if (rec) openRecordDialog(ctx, rec);
    });
    on(root, 'change', '[data-contact]', (e, box) => {
      contacted.set(box.dataset.contact, box.checked, ctx.user);
      root.querySelectorAll(`[data-contact="${CSS.escape(box.dataset.contact)}"]`).forEach((x) => (x.checked = box.checked));
      toast(box.checked ? 'Đã đánh dấu “đã liên hệ”' : 'Đã bỏ đánh dấu');
    });
  },
};

function issueChips(r) {
  return html`<span class="clo-chips">${r.issues.map((i) => html`<span class="chip chip--${ISSUE_CHIP[i.kind]}">${i.label}</span>`)}</span>`;
}

function recordCell(r, d) {
  if (!r.records.length) return html`<span class="caption">Chưa giao</span>`;
  return html`${r.records.map((x) => {
    const st = SUPPORT_STATUS[x.status] || SUPPORT_STATUS.chua_bat_dau;
    const result = x.retested
      ? html`<br><span class="caption">Đánh giá lại: ${fmtScore(x.before)} → <b>${fmtScore(x.after)}</b></span> ${cloStatusChip(x.afterStatus)}`
      : x.reassess
        ? html`<br><span class="caption">Đánh giá lại dự kiến ${fmtDate(x.reassess.date)} (lần ${x.reassess.attempt})</span>`
        : '';
    return html`<div class="support-rec">${statusChip(st.chip, { label: st.label })} <span class="small">${SUPPORT_TYPES[x.type] ?? x.type} · ${x.clo} · hạn ${fmtDate(x.due)}</span>${d.canEdit ? html` <button type="button" class="btn-tool" data-edit-support="${x.id}" aria-label="Cập nhật nhiệm vụ ${x.code}">${icon('edit')}</button>` : ''}<br><span class="caption">${x.content}</span>${result}</div>`;
  })}`;
}

function contactBox(r) {
  const key = `${r.s.code}|${r.cls.id}`;
  return html`<label class="check" title="${r.contacted ? `Đánh dấu bởi ${r.contacted.by}` : 'Chưa liên hệ'}"><input type="checkbox" data-contact="${key}"${raw(r.contacted ? ' checked' : '')}><span class="sr-only">Đã liên hệ ${r.s.code}</span></label>`;
}

function supportTable(rows, d, ctx) {
  return dataTable({
    compact: true,
    columns: [
      ...(d.canEdit ? [{ label: html`<label class="check"><input type="checkbox" data-pick-all><span class="sr-only">Chọn tất cả</span></label>`, render: (r) => html`<label class="check"><input type="checkbox" data-pick value="${r.s.code}|${r.cls.id}"><span class="sr-only">Chọn ${r.s.code}</span></label>` }] : []),
      { label: 'Mã nghiên cứu', render: (r) => html`<b>${r.s.code}</b><br><span class="caption">${ctx.all ? r.cls.name : r.cls.lineage.split('-').pop()}${isNum(r.s.att) ? ` · có mặt ${fmtPct(r.s.att)}` : ''}</span>` },
      { label: 'Vấn đề', render: (r) => issueChips(r) },
      { label: 'Khảo sát BL (gắn kết)', render: (r) => (r.bl && isNum(r.bl.eng) ? html`${fmtScore(r.bl.eng)}${isNum(r.bl.prob) ? html`<br><span class="caption">nguy cơ ${fmtPct(r.bl.prob)}</span>` : ''}` : html`<span class="caption">${r.bl ? 'chưa có phiếu' : 'không liên kết điểm'}</span>`) },
      { label: 'Gợi ý hỗ trợ', render: (r) => html`<span class="small">${r.topGroup ? html`<b>${r.topGroup}</b>: ` : ''}${r.hint}</span>` },
      { label: 'Nhiệm vụ · kết quả đánh giá lại', render: (r) => recordCell(r, d) },
      { label: 'Đã liên hệ', render: contactBox },
    ],
    rows,
  });
}

function supportCards(rows, d) {
  return html`<ul class="list">${rows.map(
    (r) => html`<li class="list-row" style="align-items:flex-start">
      ${d.canEdit ? html`<label class="check"><input type="checkbox" data-pick value="${r.s.code}|${r.cls.id}"><span class="sr-only">Chọn ${r.s.code}</span></label>` : ''}
      <span class="list-row__main"><span class="list-row__title">${r.s.code}</span> <span class="list-row__meta">· ${r.cls.name}</span><br>${issueChips(r)}<br>
        <span class="small">${r.hint}</span>${r.records.length ? html`<br>${recordCell(r, d)}` : ''}</span>
      ${contactBox(r)}
    </li>`,
  )}</ul>`;
}

function openAssignDialog(ctx, rows) {
  if (!rows.length) return;
  const rv = rows[0].rv;
  const clos = [...new Set(rows.flatMap((r) => r.issues.filter((i) => i.clo).map((i) => i.clo)))];
  const clo = ctx.f2.clo || clos[0] || rv.cloCodes[0];
  const group = rows.map((r) => r.topGroup).filter(Boolean).sort((a, b) => rows.filter((r) => r.topGroup === b).length - rows.filter((r) => r.topGroup === a).length)[0];
  const hint = rows.find((r) => r.topGroup === group)?.hint ?? rows[0].hint;
  const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const retakeAs = rv.assessments.filter((a) => (a.maxAttempts || 1) > 1);
  const classes = [...new Set(rows.map((r) => r.cls.id))];
  openDialog({
    title: `Giao nhiệm vụ hỗ trợ cho ${rows.length} sinh viên`,
    body: html`<form id="sup-form" class="form-grid" novalidate>
      <div class="form-field form-field--full"><span class="label">Sinh viên</span><span class="small">${rows.map((r) => r.s.code).join(', ')}</span></div>
      <div class="form-field"><label for="sf-clo">CLO</label><select class="select" id="sf-clo" name="clo">${rv.clos.map((c) => html`<option value="${c.code}"${raw(c.code === clo ? ' selected' : '')}>${c.code} · ${c.short}</option>`)}</select></div>
      <div class="form-field"><label for="sf-type">Loại hỗ trợ</label><select class="select" id="sf-type" name="type">${Object.entries(SUPPORT_TYPES).map(([k, v]) => html`<option value="${k}"${raw(k === 'luyen_tap' ? ' selected' : '')}>${v}</option>`)}</select></div>
      <div class="form-field form-field--full"><label for="sf-content">Nội dung hỗ trợ</label><textarea class="textarea" id="sf-content" name="content" required>${hint}</textarea><span class="hint">Cụ thể: làm gì, tài liệu/bài luyện tập nào, hình thức (LMS, trực tiếp).</span></div>
      <div class="form-field"><label for="sf-owner">Người phụ trách</label><input class="input" id="sf-owner" name="owner" required value="${ctx.user.name}"></div>
      <div class="form-field"><label for="sf-due">Thời hạn</label><input class="input" type="date" id="sf-due" name="due" required value="${due}"></div>
      <div class="form-field form-field--full"><label class="check"><input type="checkbox" name="reassess"${raw(retakeAs.length ? ' checked' : ' disabled')}> Đánh giá lại bằng nhiệm vụ tương đương (lần 2)</label></div>
      <div class="form-field"><label for="sf-ra">Bài đánh giá lại</label><select class="select" id="sf-ra" name="ra">${retakeAs.map((a) => html`<option value="${a.code}">${a.name} (đề ${(a.retakeForms || []).join(', ') || 'tương đương'})</option>`)}</select></div>
      <div class="form-field"><label for="sf-rd">Ngày đánh giá lại</label><input class="input" type="date" id="sf-rd" name="rd" value="${new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10)}"></div>
      ${ctx.user.role === 'gv' && classes.length === 1 ? html`<div class="form-field form-field--full"><label class="check"><input type="checkbox" name="plan"> Ghi vào kế hoạch cải tiến (PDCA) của lớp – dùng chung với M2</label></div>` : ''}
      <p class="caption form-field--full" id="sf-error" role="alert" style="color:var(--alert-ink)"></p>
    </form>`,
    foot: html`<button type="button" class="btn" data-close>Hủy</button><button type="submit" form="sup-form" class="btn btn--primary">${icon('check')}Lưu nhiệm vụ</button>`,
    onMount(dlg) {
      const form = dlg.querySelector('#sup-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const content = String(fd.get('content') || '').trim();
        const owner = String(fd.get('owner') || '').trim();
        const dueV = String(fd.get('due') || '');
        if (!content || !owner || !dueV) {
          form.querySelector('#sf-error').textContent = 'Cần nhập nội dung, người phụ trách và thời hạn.';
          return;
        }
        const reassess = fd.get('reassess') ? { assessment: fd.get('ra'), attempt: 2, date: fd.get('rd') } : null;
        const stamp = Date.now().toString(36);
        cloSupport.upsert(rows.map((r) => ({ id: `HT-${r.cls.id}-${r.s.code}-${stamp}`, classId: r.cls.id, code: r.s.code, clo: fd.get('clo'), type: fd.get('type'), content, owner, due: dueV, status: 'dang_thuc_hien', createdBy: ctx.user.name, reassess })));
        if (fd.get('plan')) {
          const cls = rows[0].cls;
          planStore.upsert({ domain: 'clo', scope: 'class', courseId: cls.courseId, classId: cls.id, semesterId: cls.semesterId, clo: fd.get('clo'), metric: 'retest', dimension: 'PS2', measureCode: null, issue: `${rows.length} sinh viên cần hỗ trợ ${fd.get('clo')}`, evidence: 'M6 › Cần hỗ trợ', action: content, owner, due: dueV, status: 'dang_thuc_hien', reassess: reassess ? `Đánh giá lại ${reassess.date}` : '', createdBy: ctx.user.name, note: '' });
        }
        dlg.close();
        toast(`Đã giao nhiệm vụ cho ${rows.length} sinh viên`);
        ctx.route();
      });
    },
  });
}

function openRecordDialog(ctx, rec) {
  openDialog({
    title: `Cập nhật nhiệm vụ hỗ trợ – ${rec.code}`,
    body: html`<form id="rec-form" class="form-grid" novalidate>
      <div class="form-field form-field--full"><span class="label">Nội dung</span><span class="small">${rec.content}</span></div>
      <div class="form-field"><label for="rf-status">Trạng thái</label><select class="select" id="rf-status" name="status">${Object.entries(SUPPORT_STATUS).map(([k, v]) => html`<option value="${k}"${raw(k === rec.status ? ' selected' : '')}>${v.label}</option>`)}</select></div>
      <div class="form-field"><label for="rf-due">Thời hạn</label><input class="input" type="date" id="rf-due" name="due" value="${rec.due}"></div>
      <div class="form-field form-field--full"><label for="rf-note">Ghi chú kết quả hỗ trợ</label><input class="input" id="rf-note" name="note" value="${rec.note ?? ''}"></div>
    </form>`,
    foot: html`<button type="button" class="btn btn--danger" data-del>Xóa</button><button type="button" class="btn" data-close>Hủy</button><button type="submit" form="rec-form" class="btn btn--primary">${icon('check')}Lưu</button>`,
    onMount(dlg) {
      const form = dlg.querySelector('#rec-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        cloSupport.upsert([{ id: rec.id, status: fd.get('status'), due: fd.get('due'), note: String(fd.get('note') || '').trim(), updatedBy: ctx.user.name }]);
        dlg.close();
        toast('Đã cập nhật nhiệm vụ hỗ trợ');
        ctx.route();
      });
      dlg.querySelector('[data-del]').addEventListener('click', () => {
        if (!confirm('Xóa nhiệm vụ hỗ trợ này?')) return;
        cloSupport.remove(rec.id);
        dlg.close();
        toast('Đã xóa nhiệm vụ');
        ctx.route();
      });
    },
  });
}
