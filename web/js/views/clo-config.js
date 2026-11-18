// M6 › Cấu hình ma trận (nghiệp vụ 1 – 2): CLO, PLO/PI, mức năng lực, ngưỡng đạt, trọng số, phiên bản đề cương;
// ma trận câu hỏi/tiêu chí × CLO và kiểm tra thiết kế đánh giá trước khi triển khai. Chỉ bộ quy tắc ĐÃ PHÊ DUYỆT
// được dùng để tính kết quả của lớp; mọi sửa đổi, phê duyệt đều ghi lịch sử.
import { cloConfig, cloMart, cloPreview, levelLabel, mergeVersions, semesterLabel } from '../api-clo.js';
import { fmtDate, fmtDateTime, fmtInt, fmtNum, fmtPct, fmtScore, parseViNumber } from '../core/format.js';
import { MODES } from '../data/clo-catalog.js';
import { cloVersions, state } from '../store.js';
import { banner, dataTable, emptyState, openDialog, pageHead, plainCard, statusChip, toast } from '../ui/components.js';
import { html, on, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { cloHash, cloMeta, cloPrepare, cloTabsNav } from './clo-common.js';

const VSTATUS = {
  approved: { label: 'Đã phê duyệt', chip: 'ok' },
  pending: { label: 'Chờ phê duyệt', chip: 'warn' },
  draft: { label: 'Bản nháp', chip: 'neutral' },
};
const LEVEL = { error: { chip: 'alert', label: 'Cần sửa' }, warn: { chip: 'warn', label: 'Xem lại' }, info: { chip: 'neutral', label: 'Lưu ý' }, ok: { chip: 'ok', label: 'Đạt' } };

const nextSemester = (id) => {
  const m = String(id).match(/^HK([12])-(\d{2})(\d{2})$/);
  if (!m) return id;
  return m[1] === '1' ? `HK2-${m[2]}${m[3]}` : `HK1-${m[3]}${String(Number(m[3]) + 1).padStart(2, '0')}`;
};
const semLabelAny = (id) => state.dataset.semesters.find((s) => s.id === id)?.label ?? id.replace(/^HK(\d)-(\d{2})(\d{2})$/, 'HK$1 20$2–20$3');

export const CloConfigView = {
  screen: 'M6',
  layout: 'wide',
  title: () => 'Cấu hình ma trận CLO',
  filters(ctx) {
    const d = ctx.data;
    if (!d || d.empty) return [];
    return [
      { key: 'hp', label: 'Học phần', wide: true, value: d.course.id, options: d.courses.map((c) => ({ value: c.id, label: c.name })), toHash: (v) => cloHash('cau-hinh', { hp: v }) },
      { key: 'pb', label: 'Phiên bản', value: d.rv.id, options: d.versions.map((v) => ({ value: v.id, label: `${v.version} – ${VSTATUS[v.status]?.label ?? v.status}` })), toHash: (v) => cloHash('cau-hinh', { hp: d.course.id, pb: v }) },
    ];
  },
  meta: (ctx) => cloMeta(ctx.data?.rv),
  prepare(ctx) {
    cloPrepare(ctx);
    ctx.data = cloConfig(ctx.user, { courseId: ctx.query.hp, versionId: ctx.query.pb });
  },
  render(ctx) {
    const d = ctx.data;
    if (d.empty) return html`${pageHead({ title: 'Cấu hình ma trận CLO' })}${cloTabsNav(ctx, 'cau-hinh')}${plainCard({ body: emptyState({ title: 'Chưa có học phần nào có bộ quy tắc CLO trong phạm vi', text: 'Nhập CLO và ma trận đánh giá ở mục Nhập và kiểm tra điểm.' }) })}`;
    const rv = d.rv;
    const st = VSTATUS[rv.status] || VSTATUS.draft;
    return html`${pageHead({
      crumbs: [{ label: 'Kết quả CLO', href: cloHash('lop') }, { label: 'Cấu hình ma trận' }],
      title: `Cấu hình ma trận – ${d.course.name}`,
      question: 'Bộ quy tắc nào được áp dụng? Mỗi CLO được đo bằng câu hỏi, tiêu chí nào, trọng số có khớp đề cương không?',
    })}
      ${cloTabsNav(ctx, 'cau-hinh')}
      <div class="version-strip" role="list" aria-label="Các phiên bản bộ quy tắc">${d.versions.map(
        (v) => html`<a role="listitem" class="version-chip${v.id === rv.id ? ' is-current' : ''}" href="${cloHash('cau-hinh', { hp: d.course.id, pb: v.id })}"${raw(v.id === rv.id ? ' aria-current="page"' : '')}>
          <b>${v.version}</b> ${statusChip(VSTATUS[v.status]?.chip ?? 'na', { label: VSTATUS[v.status]?.label ?? v.status })}<span class="caption">${v.status === 'approved' ? `hiệu lực từ ${semLabelAny(v.effectiveFrom)}` : v.effectiveFrom ? `dự kiến từ ${semLabelAny(v.effectiveFrom)}` : ''}</span></a>`,
      )}</div>
      ${rv.status !== 'approved' ? banner({ kind: 'warn', iconText: '⚠', title: `${st.label}: chưa dùng để tính kết quả của lớp`, body: html`${rv.note ? html`${rv.note} ` : ''}${d.canApprove ? 'Bạn có quyền phê duyệt – xem trước tác động trước khi phê duyệt.' : 'Lãnh đạo khoa hoặc Phòng QLCL phê duyệt.'}` }) : ''}
      <div class="grid grid--60-40 grid--start mt-16">
        ${rulesCard(d)}
        ${checksCard(d)}
      </div>
      <div class="mt-16">${closCard(d)}</div>
      <div class="mt-16">${matrixCard(d)}</div>
      <div class="grid grid--2 grid--start mt-16">
        ${alignCard(d)}
        ${assessCard(d)}
      </div>
      <div id="clo-preview" class="mt-16" aria-live="polite"></div>
      <div class="mt-16">${historyCard(d)}</div>`;
  },
  mount(root, ctx) {
    const d = ctx.data;
    if (!d || d.empty) return;
    const rv = d.rv;
    on(root, 'click', '[data-new-draft]', () => createDraft(ctx, d));
    on(root, 'click', '[data-edit-rules]', () => editRules(ctx, d));
    on(root, 'click', '[data-submit]', () => {
      updateVersion(rv.id, (v) => (v.status = 'pending'), ctx.user, 'Gửi phê duyệt');
      toast('Đã gửi phê duyệt');
      ctx.route();
    });
    on(root, 'click', '[data-approve]', () => approveDialog(ctx, d));
    on(root, 'click', '[data-del-draft]', () => {
      if (!confirm(`Xóa bản nháp ${rv.version}?`)) return;
      updateVersion(rv.id, (v) => (v.status = 'deleted'), ctx.user, 'Xóa bản nháp');
      toast('Đã xóa bản nháp');
      location.hash = cloHash('cau-hinh', { hp: d.course.id });
    });
    on(root, 'click', '[data-edit-clo]', (e, b) => editClo(ctx, d, b.dataset.editClo));
    on(root, 'click', '[data-cell]', (e, b) => {
      const [aCode, iCode, clo] = b.dataset.cell.split('|');
      updateVersion(
        rv.id,
        (v) => {
          const it = v.assessments.find((a) => a.code === aCode).items.find((i) => i.code === iCode);
          it.clos = { ...(it.clos || {}) };
          if (it.clos[clo]) delete it.clos[clo];
          else it.clos[clo] = 1;
        },
        ctx.user,
        'Sửa ma trận',
        `${aCode} › ${iCode}: ${b.getAttribute('aria-pressed') === 'true' ? 'bỏ' : 'gắn'} ${clo}`,
      );
      ctx.route();
      requestAnimationFrame(() => document.querySelector(`[data-cell="${CSS.escape(b.dataset.cell)}"]`)?.focus());
    });
    on(root, 'click', '[data-preview]', () => {
      const rows = cloPreview(rv, d.course.id);
      const box = root.querySelector('#clo-preview');
      box.innerHTML = String(plainCard({
        title: `Xem trước tác động – nếu áp dụng bộ quy tắc ${rv.version}`,
        sub: rows.length ? `Tính lại ${rows.length} lớp ${semesterLabel(rows[0].cls.semesterId)} bằng ma trận, ngưỡng của bản này (không lưu)` : '',
        body: rows.length
          ? dataTable({
              compact: true,
              columns: [
                { label: 'Lớp', render: (r) => r.cls.name },
                ...rows[0].codes.map((c) => ({
                  label: `${c} tỷ lệ đạt`,
                  render: (r) => {
                    const a = r.cur.clo[c];
                    const b = r.next.clo[c];
                    return html`${a && !a.notAssessed ? fmtPct(a.rate) : '–'} → <b>${b && !b.notAssessed ? fmtPct(b.rate) : '–'}</b>`;
                  },
                })),
                { label: 'Đạt mọi CLO', render: (r) => html`${fmtPct(r.cur.all.rate)} → <b>${fmtPct(r.next.all.rate)}</b>` },
              ],
              rows,
            })
          : emptyState({ title: 'Chưa có lớp có dữ liệu để xem trước' }),
        foot: html`<span>Kết quả hiện tại (bên trái) theo bộ quy tắc đang áp dụng cho lớp. Đổi ma trận làm đổi điểm CLO vì mỗi câu chuyển minh chứng sang CLO khác.</span>`,
      }));
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    on(root, 'click', '[data-reset-overlay]', () => {
      if (!confirm('Xóa mọi bản nháp, phê duyệt và chỉnh sửa bộ quy tắc CLO đã làm trên máy này?')) return;
      cloVersions.write({ patch: {}, added: [], history: [] });
      toast('Đã khôi phục bộ quy tắc của bộ dữ liệu');
      location.hash = cloHash('cau-hinh', { hp: d.course.id });
    });
  },
};

// Ghi một thay đổi vào bản sửa của phiên bản (bản của bộ dữ liệu → patch; bản người dùng tạo → added).
function updateVersion(id, mutate, user, action, detail = '') {
  const o = cloVersions.overlay();
  const added = o.added.find((v) => v.id === id);
  if (added) mutate(added);
  else {
    const base = mergeVersions(state.dataset.outcomes?.versions || [], o).find((v) => v.id === id);
    const copy = JSON.parse(JSON.stringify(base));
    mutate(copy);
    o.patch[id] = copy;
  }
  cloVersions.log(o, user, id, action, detail);
  cloVersions.write(o);
}

function createDraft(ctx, d) {
  const o = cloVersions.overlay();
  const base = JSON.parse(JSON.stringify(cloMart().raw.find((v) => v.id === d.rv.id)));
  const latest = state.dataset.semesters[state.dataset.semesters.length - 1]?.id;
  let n = 1;
  const all = cloMart().raw;
  while (all.some((v) => v.id === `${d.course.id}@nhap-${n}`)) n++;
  const draft = { ...base, id: `${d.course.id}@nhap-${n}`, version: `Nháp ${n} (từ ${d.rv.version})`, status: 'draft', approvedAt: null, approvedBy: null, effectiveFrom: nextSemester(latest), basedOn: d.rv.id, createdAt: new Date().toISOString(), createdBy: ctx.user.name, note: '', source: `Bản nháp từ ${d.rv.version}` };
  o.added.push(draft);
  cloVersions.log(o, ctx.user, draft.id, 'Tạo bản nháp', `từ ${d.rv.version}`);
  cloVersions.write(o);
  toast('Đã tạo bản nháp – bấm vào ô ma trận để gắn, bỏ CLO');
  location.hash = cloHash('cau-hinh', { hp: d.course.id, pb: draft.id });
}

function editRules(ctx, d) {
  const r = d.rv.rules;
  openDialog({
    title: `Quy tắc đánh giá – ${d.rv.version}`,
    body: html`<form id="rule-form" class="form-grid" novalidate>
      <div class="form-field"><label for="rl-pass">Ngưỡng đạt CLO (thang 10)</label><input class="input" id="rl-pass" name="pass" inputmode="decimal" value="${fmtNum(r.pass, 1)}"></div>
      <div class="form-field"><label for="rl-target">Mục tiêu tỷ lệ sinh viên đạt (%)</label><input class="input" id="rl-target" name="target" inputmode="decimal" value="${fmtNum(r.target * 100, 0)}"></div>
      <div class="form-field"><label for="rl-ev">Minh chứng tối thiểu để kết luận (%)</label><input class="input" id="rl-ev" name="minEvidence" inputmode="decimal" value="${fmtNum(r.minEvidence * 100, 0)}"></div>
      <div class="form-field"><label for="rl-miss">Bài không nộp, vắng thi</label><select class="select" id="rl-miss" name="missing"><option value="no_evidence"${raw(r.missing !== 'zero' ? ' selected' : '')}>Chưa có minh chứng (đề xuất)</option><option value="zero"${raw(r.missing === 'zero' ? ' selected' : '')}>Tính là 0 điểm</option></select></div>
      <p class="caption form-field--full" id="rl-error" role="alert" style="color:var(--alert-ink)"></p>
    </form>`,
    foot: html`<button type="button" class="btn" data-close>Hủy</button><button type="submit" form="rule-form" class="btn btn--primary">${icon('check')}Lưu vào bản nháp</button>`,
    onMount(dlg) {
      const form = dlg.querySelector('#rule-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(form));
        const pass = parseViNumber(fd.pass);
        const target = parseViNumber(fd.target);
        const ev = parseViNumber(fd.minEvidence);
        if (!(pass > 0 && pass <= 10) || !(target > 0 && target <= 100) || !(ev > 0 && ev <= 100)) {
          form.querySelector('#rl-error').textContent = 'Ngưỡng đạt trong (0; 10], mục tiêu và minh chứng trong (0; 100] %.';
          return;
        }
        updateVersion(d.rv.id, (v) => (v.rules = { ...v.rules, pass, target: target / 100, minEvidence: ev / 100, missing: fd.missing }), ctx.user, 'Sửa quy tắc', `ngưỡng ${pass}, mục tiêu ${target}%, minh chứng ${ev}%`);
        dlg.close();
        toast('Đã lưu quy tắc vào bản nháp');
        ctx.route();
      });
    },
  });
}

function editClo(ctx, d, code) {
  const c = d.rv.cloByCode.get(code);
  openDialog({
    title: `Sửa ${code} – ${d.rv.version}`,
    body: html`<form id="clo-form" class="form-grid" novalidate>
      <div class="form-field form-field--full"><span class="label">Mô tả</span><span class="small">${c.text}</span></div>
      <div class="form-field"><label for="cf-w">Trọng số trong đề cương (%)</label><input class="input" id="cf-w" name="weight" inputmode="decimal" value="${fmtNum(c.weight * 100, 1)}"></div>
      <div class="form-field"><label for="cf-p">Ngưỡng đạt riêng (để trống = theo quy tắc chung)</label><input class="input" id="cf-p" name="pass" inputmode="decimal" value="${c.pass ?? ''}"></div>
      <div class="form-field"><label for="cf-plo">PLO</label><input class="input" id="cf-plo" name="plo" value="${c.plo ?? ''}"></div>
      <div class="form-field"><label for="cf-pi">PI</label><input class="input" id="cf-pi" name="pi" value="${c.pi ?? ''}"></div>
      <p class="caption form-field--full" id="cf-error" role="alert" style="color:var(--alert-ink)"></p>
    </form>`,
    foot: html`<button type="button" class="btn" data-close>Hủy</button><button type="submit" form="clo-form" class="btn btn--primary">${icon('check')}Lưu vào bản nháp</button>`,
    onMount(dlg) {
      const form = dlg.querySelector('#clo-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(form));
        const w = parseViNumber(fd.weight);
        const p = fd.pass.trim() ? parseViNumber(fd.pass) : null;
        if (!(w > 0 && w <= 100) || (fd.pass.trim() && !(p > 0 && p <= 10))) {
          form.querySelector('#cf-error').textContent = 'Trọng số trong (0; 100] %, ngưỡng trong (0; 10].';
          return;
        }
        updateVersion(d.rv.id, (v) => {
          const x = v.clos.find((y) => y.code === code);
          x.weight = w / 100;
          if (p === null) delete x.pass;
          else x.pass = p;
          x.plo = fd.plo.trim();
          x.pi = fd.pi.trim();
        }, ctx.user, 'Sửa CLO', `${code}: trọng số ${w}%${p !== null ? `, ngưỡng ${p}` : ''}`);
        dlg.close();
        toast(`Đã lưu ${code} vào bản nháp`);
        ctx.route();
      });
    },
  });
}

function approveDialog(ctx, d) {
  const rv = d.rv;
  const sems = state.dataset.semesters.map((s) => s.id);
  const options = [...sems, nextSemester(sems[sems.length - 1])];
  const chk = d.checks;
  openDialog({
    title: `Phê duyệt bộ quy tắc ${rv.version}`,
    body: html`${chk.errors ? banner({ kind: 'alert', iconText: '✖', title: `Kiểm tra ma trận còn ${chk.errors} lỗi`, body: 'Nên sửa trước khi phê duyệt; vẫn có thể phê duyệt nếu Khoa chấp nhận.' }) : banner({ kind: 'info', iconText: '✔', title: `Kiểm tra ma trận: không có lỗi · ${chk.warnings} cảnh báo` })}
      <form id="ap-form" class="form-grid" novalidate>
        <div class="form-field"><label for="ap-from">Áp dụng từ học kỳ</label><select class="select" id="ap-from" name="from">${options.map((s) => html`<option value="${s}"${raw(s === (rv.effectiveFrom || options[options.length - 1]) ? ' selected' : '')}>${semLabelAny(s)}</option>`)}</select>
          <span class="hint">Lớp từ học kỳ này trở đi tính theo bộ quy tắc mới; lớp trước đó giữ bộ quy tắc đã dùng.</span></div>
        <div class="form-field"><label for="ap-name">Tên phiên bản</label><input class="input" id="ap-name" name="name" required value="${rv.version.replace(/\s*\(nháp\)$/i, '').replace(/^Nháp (\d+) \(từ (.+)\)$/, '$2.$1')}"></div>
        <div class="form-field form-field--full"><label for="ap-note">Ghi chú phê duyệt</label><input class="input" id="ap-note" name="note" placeholder="Ví dụ: Họp bộ môn ngày …"></div>
      </form>`,
    foot: html`<button type="button" class="btn" data-close>Hủy</button><button type="submit" form="ap-form" class="btn btn--primary">${icon('check')}Phê duyệt</button>`,
    onMount(dlg) {
      const form = dlg.querySelector('#ap-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(form));
        const name = String(fd.name || '').trim() || rv.version;
        updateVersion(rv.id, (v) => Object.assign(v, { version: name, status: 'approved', approvedAt: new Date().toISOString(), approvedBy: `${ctx.user.name} (${ctx.user.roleLabel})`, effectiveFrom: fd.from }), ctx.user, 'Phê duyệt', `${name} – áp dụng từ ${semLabelAny(fd.from)}${fd.note ? ` · ${fd.note}` : ''}`);
        dlg.close();
        toast(`Đã phê duyệt ${rv.version}`);
        ctx.route();
      });
    },
  });
}

// ---- Thẻ nội dung ----------------------------------------------------------------------------------------

function rulesCard(d) {
  const rv = d.rv;
  const r = rv.rules;
  const st = VSTATUS[rv.status] || VSTATUS.draft;
  const isDraft = ['draft', 'pending'].includes(rv.status);
  return plainCard({
    title: 'Bộ quy tắc đánh giá',
    sub: rv.source ?? '',
    body: html`<dl class="kv">
        <dt>Phiên bản</dt><dd><b>${rv.version}</b> ${statusChip(st.chip, { label: st.label })}${rv.approvedAt ? html`<br><span class="caption">Duyệt ${fmtDate(rv.approvedAt)} · ${rv.approvedBy ?? ''}</span>` : ''}${rv.createdAt && !rv.approvedAt ? html`<br><span class="caption">Tạo ${fmtDate(rv.createdAt)} · ${rv.createdBy ?? ''}</span>` : ''}</dd>
        <dt>Hiệu lực</dt><dd>${rv.effectiveFrom ? `${rv.status === 'approved' ? 'Từ' : 'Dự kiến từ'} ${semLabelAny(rv.effectiveFrom)}` : 'Chưa đặt'} · ${fmtInt(d.applying.length)} lớp đang áp dụng${d.applying.length ? html`<br><span class="caption">${d.applying.map((e) => e.cls.name.replace(rv.courseName ?? '', '').replace(/^ – /, '') + ' ' + semesterLabel(e.cls.semesterId)).join(' · ')}</span>` : ''}</dd>
        <dt>Học phần</dt><dd>${rv.courseName} (${rv.courseId}) · ${rv.credits ?? '–'} tín chỉ · ${rv.hours ?? ''}</dd>
        <dt>Đạt CLO</dt><dd>Điểm CLO ≥ <b>${fmtScore(r.pass, 1)}</b>/10 và minh chứng ≥ <b>${fmtPct(r.minEvidence)}</b> dự kiến</dd>
        <dt>Mục tiêu lớp</dt><dd>≥ <b>${fmtPct(r.target)}</b> sinh viên đạt mỗi CLO</dd>
        <dt>Thiếu bài, vắng thi</dt><dd>${r.missing === 'zero' ? 'Tính là 0 điểm' : 'Chưa có minh chứng (không tính là 0)'}</dd>
        <dt>Đánh giá lại</dt><dd>Lấy kết quả lần gần nhất của từng câu/tiêu chí (nhiệm vụ tương đương, thi lần 2)</dd>
        <dt>Điều kiện dự thi</dt><dd>Có mặt ≥ ${fmtPct(r.attendanceMin)} số buổi; đạt học phần khi điểm ≥ ${fmtScore(r.coursePass, 1)}</dd>
        ${rv.requirements?.length ? html`<dt>Yêu cầu học phần</dt><dd class="small">${rv.requirements.join(' · ')}</dd>` : ''}
        ${rv.examBank ? html`<dt>Ngân hàng đề</dt><dd class="small">${rv.examBank.note}</dd>` : ''}
      </dl>`,
    foot: html`${rv.status === 'approved' && d.canDraft ? html`<button type="button" class="btn btn--sm" data-new-draft>${icon('plus')}Tạo bản nháp từ phiên bản này</button>` : ''}
      ${d.editable ? html`<button type="button" class="btn btn--sm" data-edit-rules>${icon('edit')}Sửa quy tắc</button>` : ''}
      ${isDraft ? html`<button type="button" class="btn btn--sm" data-preview>${icon('play')}Xem trước tác động</button>` : ''}
      ${rv.status === 'draft' && d.editable ? html`<button type="button" class="btn btn--sm" data-submit>Gửi phê duyệt</button>` : ''}
      ${isDraft && d.canApprove ? html`<button type="button" class="btn btn--sm btn--primary" data-approve>${icon('check')}Phê duyệt</button>` : ''}
      ${rv.status === 'draft' && d.editable ? html`<button type="button" class="btn btn--sm btn--danger" data-del-draft>Xóa bản nháp</button>` : ''}`,
  });
}

function checksCard(d) {
  const c = d.checks;
  return plainCard({
    title: 'Kiểm tra thiết kế đánh giá',
    sub: `${c.errors} cần sửa · ${c.warnings} xem lại · rà soát trước khi triển khai`,
    body: html`<ul class="checks">${c.items.map((x) => html`<li class="checks__item checks__item--${x.level}">${statusChip(LEVEL[x.level].chip, { label: LEVEL[x.level].label })}<span><b>${x.title}</b>${x.detail ? html`<br><span class="small">${x.detail}</span>` : ''}</span></li>`)}</ul>`,
    foot: html`<span>Ngưỡng lệch trọng số ${fmtPct(state.cfg.cloWeightTol ?? 0.05)} (M0 › Cấu hình). So sánh 3 nguồn: trọng số CLO (Bảng 2), phân bổ theo bài (Bảng 4), câu hỏi/tiêu chí thực tế (rubric, cấu trúc đề).</span>`,
  });
}

function closCard(d) {
  const rv = d.rv;
  const delta = (a, p) => {
    const x = a - p;
    const abs = Math.abs(x);
    const tol = state.cfg.cloWeightTol ?? 0.05;
    const chip = abs > 2 * tol + 1e-9 ? 'alert' : abs > tol + 1e-9 ? 'warn' : 'ok';
    return statusChip(chip, { label: `${x >= 0 ? '+' : '−'}${fmtNum(abs * 100, 1)}` });
  };
  return plainCard({
    title: 'Chuẩn đầu ra học phần (CLO)',
    sub: 'Mô tả, mức năng lực cần đạt, liên kết PLO/PI; trọng số theo 3 nguồn và mức lệch (điểm %)',
    body: dataTable({
      columns: [
        { label: 'CLO', render: (c) => html`<b>${c.code}</b>` },
        { label: 'Mô tả', render: (c) => html`<span class="small">${c.text}</span>` },
        { label: 'Mức năng lực', render: (c) => html`<span class="small">${levelLabel(c.domain, c.level)}</span>` },
        { label: 'PLO · PI', render: (c) => html`${c.plo || '–'}<br><span class="caption">${c.pi || ''}</span>` },
        { label: 'Đề cương', num: true, render: (c) => fmtPct(rv.planned[c.code], 1) },
        { label: 'Theo bài (Bảng 4)', num: true, render: (c) => html`${fmtPct(rv.declared[c.code], 1)}<br>${delta(rv.declared[c.code], rv.planned[c.code])}` },
        { label: 'Thực tế câu hỏi', num: true, render: (c) => html`<b>${fmtPct(rv.actual[c.code], 1)}</b><br>${delta(rv.actual[c.code], rv.planned[c.code])}` },
        { label: 'Đo bằng', render: (c) => html`<span class="small">${rv.measuredBy[c.code].map((a) => rv.aByCode.get(a)?.name).join(', ') || html`<span class="chip chip--alert">chưa đo</span>`}</span>` },
        ...(d.editable ? [{ label: '', render: (c) => html`<button type="button" class="btn-tool" data-edit-clo="${c.code}" aria-label="Sửa ${c.code}">${icon('edit')}</button>` }] : []),
      ],
      rows: rv.clos,
    }),
  });
}

function matrixCard(d) {
  const rv = d.rv;
  const clos = rv.clos.map((c) => c.code);
  const sumBy = (fn) => clos.map((c) => fn(c));
  return plainCard({
    title: 'Ma trận câu hỏi/tiêu chí × CLO',
    sub: d.editable ? 'Bản nháp: bấm vào ô để gắn hoặc bỏ CLO (câu gắn nhiều CLO chia đều) – kiểm tra cập nhật ngay' : 'Mỗi dòng một câu hỏi hoặc tiêu chí rubric; % điểm HP là phần đóng góp vào điểm học phần',
    body: html`<div class="table-wrap"><table class="table table--compact matrix">
      <caption class="sr-only">Ma trận câu hỏi và tiêu chí theo CLO</caption>
      <thead><tr><th scope="col">Bài · câu/tiêu chí</th><th scope="col">Chương</th><th scope="col" class="n">Điểm tối đa</th><th scope="col" class="n">% điểm HP</th>${clos.map((c) => html`<th scope="col" class="matrix__clo">${c}</th>`)}</tr></thead>
      <tbody>${rv.assessments.map(
        (a) => html`<tr class="matrix__group"><th scope="rowgroup" colspan="${4 + clos.length}">${a.ref} · ${a.name} – ${fmtPct(a.weight)} · ${MODES[a.mode]?.label ?? ''} · ${a.rubric ?? ''}${(a.forms || []).length > 1 ? ` · mã đề ${a.forms.join(', ')}` : ''}</th></tr>
          ${a.items.map((it0) => {
            const it = rv.itemByKey.get(`${a.code}:${it0.code}`);
            const unmapped = !Object.keys(it.w).length;
            return html`<tr${raw(unmapped ? ' class="row-alert"' : '')}><th scope="row"><b>${it.code}</b> ${it.label}${unmapped ? html` <span class="chip chip--alert">chưa gắn CLO</span>` : ''}</th><td>${it.chapter ?? '–'}</td><td class="n">${fmtNum(it.max, 2)}</td><td class="n">${fmtNum(it.g * 100, 2)}</td>
              ${clos.map((c) => {
                const w = it.w[c];
                const mark = w ? (w < 1 ? html`<span aria-hidden="true">◐</span> ${fmtNum(w, 2)}` : html`<span aria-hidden="true">●</span>`) : html`<span class="muted" aria-hidden="true">·</span>`;
                return d.editable
                  ? html`<td class="matrix__cell"><button type="button" class="matrix__btn${w ? ' is-on' : ''}" data-cell="${a.code}|${it.code}|${c}" aria-pressed="${Boolean(w)}" aria-label="${a.name} ${it.code} – ${c}">${mark}</button></td>`
                  : html`<td class="matrix__cell${w ? ' is-on' : ''}">${mark}${w ? html`<span class="sr-only">gắn ${c}</span>` : ''}</td>`;
              })}</tr>`;
          })}`,
      )}</tbody>
      <tfoot>
        <tr><th scope="row" colspan="4">Thực tế theo câu hỏi/tiêu chí</th>${sumBy((c) => html`<td class="n"><b>${fmtPct(rv.actual[c], 1)}</b></td>`)}</tr>
        <tr><th scope="row" colspan="4">Khai báo theo bài (Bảng 4)</th>${sumBy((c) => html`<td class="n">${fmtPct(rv.declared[c], 1)}</td>`)}</tr>
        <tr><th scope="row" colspan="4">Trọng số CLO (đề cương, Bảng 2)</th>${sumBy((c) => html`<td class="n">${fmtPct(rv.planned[c], 1)}</td>`)}</tr>
      </tfoot></table></div>`,
    foot: html`<span>● gắn toàn phần · ◐ gắn một phần (trọng số) · dòng đỏ: phần điểm chưa gắn CLO. Ma trận là cấu trúc dữ liệu; biểu đồ cột, radar CLO ở mục Phân tích lấy số đã tổng hợp từ ma trận này.</span>`,
  });
}

function alignCard(d) {
  const rv = d.rv;
  const p = d.program;
  const pis = p ? p.plos.flatMap((plo) => plo.pis.map((pi) => ({ plo, pi }))) : rv.clos.map((c) => ({ plo: { code: c.plo, group: '' }, pi: { code: c.pi, text: '', level: '' } }));
  return plainCard({
    title: 'Liên kết CLO – PI – PLO',
    sub: p ? `Chuẩn đầu ra CTĐT ngành ${p.name} (${p.id}) phân nhiệm cho học phần` : 'Theo khai báo của CLO',
    body: html`<div class="table-wrap"><table class="table table--compact">
      <thead><tr><th scope="col">PLO · PI</th><th scope="col">Mức NL</th>${rv.clos.map((c) => html`<th scope="col" class="matrix__clo">${c.code}</th>`)}</tr></thead>
      <tbody>${pis.map(({ plo, pi }) => html`<tr><th scope="row"><b>${plo.code}</b> ${plo.ref ? `(${plo.ref})` : ''} · ${pi.code}<br><span class="caption">${pi.text}</span></th><td>${pi.level}</td>${rv.clos.map((c) => html`<td class="matrix__cell${c.pi === pi.code ? ' is-on' : ''}">${c.pi === pi.code ? html`<span aria-hidden="true">●</span><span class="sr-only">${c.code} đáp ứng ${pi.code}</span>` : html`<span class="muted" aria-hidden="true">·</span>`}</td>`)}</tr>`)}</tbody></table></div>`,
  });
}

function assessCard(d) {
  const rv = d.rv;
  return plainCard({
    title: 'Kế hoạch đánh giá',
    sub: 'Bài đánh giá, trọng số, hình thức (trực tiếp – trực tuyến LMS), mã đề, số lần đánh giá',
    body: dataTable({
      compact: true,
      columns: [
        { label: 'Bài', render: (a) => html`<b>${a.ref}</b> ${a.name}<br><span class="caption">${a.when ?? ''}</span>` },
        { label: 'Trọng số', num: true, render: (a) => fmtPct(a.weight) },
        { label: 'Hình thức', render: (a) => MODES[a.mode]?.label ?? a.mode },
        { label: 'Mã đề · số lần', render: (a) => html`${(a.forms || []).join(', ')}${a.retakeForms?.length ? html`<br><span class="caption">lần 2: ${a.retakeForms.join(', ')}</span>` : ''}<br><span class="caption">tối đa ${a.maxAttempts || 1} lần</span>` },
        { label: 'Phân bổ CLO khai báo', render: (a) => html`<span class="small">${Object.entries(a.declared || {}).map(([c, w]) => `${c} ${fmtPct(w)}`).join(' · ') || '–'}</span>` },
      ],
      rows: rv.assessments,
    }),
  });
}

function historyCard(d) {
  return plainCard({
    title: 'Lịch sử thay đổi và phê duyệt',
    sub: 'Ghi trên máy này (bản chính thức lưu trên máy chủ): thời điểm, người, phiên bản, nội dung',
    body: dataTable({
      compact: true,
      emptyText: 'Chưa có thay đổi trên máy này – đang dùng bộ quy tắc của bộ dữ liệu',
      columns: [
        { label: 'Thời điểm', render: (h) => fmtDateTime(h.time) },
        { label: 'Người', render: (h) => html`${h.userName}<br><span class="caption">${h.role}${h.account ? ` · ${h.account}` : ''}</span>` },
        { label: 'Phiên bản', render: (h) => cloMart().raw.find((v) => v.id === h.versionId)?.version ?? h.versionId },
        { label: 'Thao tác', key: 'action' },
        { label: 'Chi tiết', key: 'detail' },
      ],
      rows: d.history,
    }),
    foot: d.history.length && ['admin', 'qlcl'].includes(state.user?.role) ? html`<button type="button" class="btn btn--sm btn--danger" data-reset-overlay>Khôi phục bộ quy tắc của bộ dữ liệu</button>` : '',
  });
}

