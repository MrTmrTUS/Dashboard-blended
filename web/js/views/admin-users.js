// M0 › Tài khoản, nhật ký: quản trị cấp tài khoản đăng nhập (tạo, sửa, đặt lại mật khẩu, khóa, xóa),
// tải tệp accounts.json để áp dụng cho mọi máy; vai trò và phạm vi; nhật ký đăng nhập và truy cập.
import { ROLES, SCREENS } from '../access.js';
import { accounts, accountsStatus, createAccount, deleteAccount, discardLocalAccounts, exportAccounts, setDisabled, setPassword, updateAccount } from '../auth.js';
import { findAccount, guardRemoval, minPasswordLength, validateAccount, validatePassword } from '../core/accounts.js';
import { toCsv } from '../core/csv.js';
import { fmtDateTime, fmtInt } from '../core/format.js';
import { accessLog, state } from '../store.js';
import { banner, dataTable, openDialog, plainCard, statusChip, toast } from '../ui/components.js';
import { downloadText, html, on, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const ROLE_ORDER = ['viewer', 'bgh', 'qlcl', 'khoa', 'gv', 'cvht', 'admin'];

// Chỉ chính tài khoản quản trị (không phải lúc đang "xem thử" vai trò khác) được cấp tài khoản.
const canManage = (ctx) => ctx.user.role === 'admin' && Boolean(ctx.user.account);

function scopeText(a) {
  const ds = state.dataset;
  const missing = (id) => `${id} (không có trong bộ dữ liệu đang dùng)`;
  if (a.role === 'khoa') return ds.faculties.find((f) => f.id === a.facultyId)?.name ?? missing(a.facultyId);
  if (a.role === 'gv') return ds.lecturers.find((l) => l.id === a.lecturerId)?.name ?? missing(a.lecturerId);
  if (a.role === 'cvht') return ds.advisors.find((x) => x.id === a.advisorId)?.name ?? missing(a.advisorId);
  return ROLES[a.role].scope;
}

const roleHint = (r) => `${ROLES[r].screens.map((s) => `${s} ${SCREENS[s].label}`).join(', ')} · ${ROLES[r].scope}`;

export function renderUsersTab(ctx) {
  const log = accessLog.list();
  const list = accounts();
  const status = accountsStatus();
  const me = ctx.account.username;
  const byRole = Object.keys(ROLES).map((r) => ({ role: r, ...ROLES[r], accounts: list.filter((a) => a.role === r).length, sims: state.users.filter((u) => u.role === r).length }));
  const manage = canManage(ctx);
  const actions = (a) => {
    const self = a.username === me;
    const off = (why) => raw(` disabled title="${why}"`);
    return html`<span class="row-actions">
      <button type="button" class="btn btn--sm" data-acc-edit="${a.username}" aria-label="Sửa tài khoản ${a.username}">${icon('edit')}Sửa</button>
      <button type="button" class="btn btn--sm" data-acc-pass="${a.username}" aria-label="Đặt lại mật khẩu ${a.username}">${icon('key')}Đặt lại mật khẩu</button>
      <button type="button" class="btn btn--sm" data-acc-lock="${a.username}" aria-label="${a.disabled ? 'Mở khóa' : 'Khóa'} tài khoản ${a.username}"${self ? off('Không thể khóa tài khoản đang đăng nhập') : ''}>${icon('lock')}${a.disabled ? 'Mở khóa' : 'Khóa'}</button>
      <button type="button" class="btn btn--sm btn--danger" data-acc-del="${a.username}" aria-label="Xóa tài khoản ${a.username}"${self ? off('Không thể xóa tài khoản đang đăng nhập') : ''}>${icon('trash')}Xóa</button>
    </span>`;
  };
  return html`
    ${status.error ? banner({ kind: 'alert', iconText: '✖', title: status.error, body: 'Chỉ đăng nhập được bằng danh sách đã lưu trên máy này (nếu có). Kiểm tra tệp web/data/accounts.json trên GitHub.' }) : ''}
    ${manage
      ? html`
        ${status.local
          ? banner({
              kind: 'warn',
              iconText: '⚠',
              title: 'Máy này đang dùng danh sách tài khoản đã sửa, chưa áp dụng cho các máy khác',
              body: 'Tải tệp accounts.json rồi tải lên GitHub (hướng dẫn bên dưới). Khi trang đã đăng tệp mới, có thể bấm “Bỏ thay đổi trên máy này”.',
              actions: html`<span class="row-actions"><button type="button" class="btn btn--sm btn--primary" data-acc-export>${icon('download')}Tải tệp accounts.json</button><button type="button" class="btn btn--sm" data-acc-discard>Bỏ thay đổi trên máy này</button></span>`,
            })
          : ''}
        ${plainCard({
          title: `Tài khoản đăng nhập (${list.length})`,
          sub: 'Mật khẩu lưu dạng băm PBKDF2-SHA256 có muối – kể cả quản trị cũng không xem được mật khẩu, chỉ đặt lại được',
          actions: html`<button type="button" class="btn btn--sm btn--primary" data-acc-new>${icon('plus')}Tạo tài khoản</button><button type="button" class="btn btn--sm" data-acc-export>${icon('download')}Tải tệp accounts.json</button>`,
          body: html`<div class="table-scroll">${dataTable({
            columns: [
              { label: 'Tài khoản', render: (a) => html`<b>${a.username}</b>${a.username === me ? html` <span class="caption">(đang đăng nhập)</span>` : ''}<br><span class="caption">${a.name}${a.unit ? ` · ${a.unit}` : ''}</span>` },
              { label: 'Vai trò', render: (a) => ROLES[a.role].label },
              { label: 'Phạm vi', render: (a) => html`<span class="small">${scopeText(a)}</span>` },
              { label: 'Trạng thái', render: (a) => (a.disabled ? statusChip('na', { label: 'Đã khóa' }) : statusChip('ok', { label: 'Đang dùng' })) },
              { label: 'Cập nhật', render: (a) => html`${fmtDateTime(a.updatedAt || a.createdAt)}<br><span class="caption">${a.createdBy ? `tạo bởi ${a.createdBy}` : 'tài khoản có sẵn'}</span>` },
              { label: 'Thao tác', render: actions },
            ],
            rows: list,
          })}</div>`,
        })}
        <div class="mt-16">${plainCard({
          title: 'Áp dụng danh sách tài khoản cho mọi máy',
          body: html`<ol class="small steps-plain">
              <li>Tạo hoặc sửa tài khoản ở bảng trên – có hiệu lực ngay trên máy này.</li>
              <li>Bấm <b>Tải tệp accounts.json</b>.</li>
              <li>Trên GitHub, mở thư mục <code>web/data</code> của repo › <b>Add file › Upload files</b>, chọn tệp vừa tải (ghi đè <code>accounts.json</code>) › <b>Commit changes</b>.</li>
              <li>Sau 1 – 2 phút trang được đăng lại; mọi máy dùng danh sách mới. Phiên đăng nhập của tài khoản bị khóa, xóa hoặc đặt lại mật khẩu sẽ hết hiệu lực.</li>
            </ol>
            <p class="caption">Quên mật khẩu quản trị: chạy <code>npm run account -- set-password admin</code> trên máy có mã nguồn rồi commit tệp <code>web/data/accounts.json</code>.</p>`,
        })}</div>`
      : plainCard({ title: 'Tài khoản đăng nhập', body: html`<p class="small" style="margin:0">Chỉ tài khoản quản trị được cấp và quản lý tài khoản đăng nhập.</p>` })}
    ${banner({ kind: 'info', title: 'Đăng nhập trong bản MVP và bản chính thức', body: 'Bản MVP là trang tĩnh: bước đăng nhập kiểm tra trên trình duyệt, đủ để phân quyền khi thử nghiệm nhưng không thay được máy chủ xác thực – không đưa dữ liệu thật lên trang công khai. Bản chính thức dùng tài khoản Trường (LDAP/OIDC) nếu đơn vị CNTT hỗ trợ, nếu không thì tài khoản nội bộ trên máy chủ Django (mục 10).' })}
    <div class="mt-16">${plainCard({
      title: 'Vai trò và phạm vi dữ liệu (mục 2)',
      body: html`<div class="table-scroll">${dataTable({
        columns: [
          { label: 'Vai trò', render: (r) => html`<b>${r.label}</b>` },
          { label: 'Câu hỏi chính', key: 'question' },
          { label: 'Màn hình', render: (r) => r.screens.map((s) => `${s} ${SCREENS[s].label}`).join(', ') },
          { label: 'Phạm vi dữ liệu', key: 'scope' },
          { label: 'Tài khoản đăng nhập', num: true, render: (r) => fmtInt(r.accounts) },
          { label: 'Người dùng mô phỏng (xem thử)', num: true, render: (r) => fmtInt(r.sims) },
        ],
        rows: byRole,
      })}</div>`,
    })}</div>
    <div class="mt-16">${plainCard({
      title: 'Nhật ký đăng nhập và truy cập',
      sub: `Ghi trên trình duyệt này: đăng nhập, đăng xuất, thay đổi tài khoản và mọi lượt xem dữ liệu cấp sinh viên (mục 5.6) · ${fmtInt(log.length)} lượt`,
      actions: html`<button type="button" class="btn btn--sm" data-export-log>${icon('download')}CSV</button>${manage ? html`<button type="button" class="btn btn--sm btn--danger" data-clear-log>Xóa nhật ký</button>` : ''}`,
      body: html`<div class="table-scroll">${dataTable({
        compact: true,
        emptyText: 'Chưa có lượt nào được ghi',
        columns: [
          { label: 'Thời điểm', render: (l) => fmtDateTime(l.time) },
          { label: 'Tài khoản', render: (l) => l.account || '–' },
          { label: 'Người dùng', render: (l) => html`${l.userName}<br><span class="caption">${l.role}</span>` },
          { label: 'Hành động', key: 'action' },
          { label: 'Đối tượng', key: 'target' },
          { label: 'Số bản ghi', num: true, render: (l) => fmtInt(l.count) },
        ],
        rows: log.slice(0, 300),
      })}</div>`,
    })}</div>`;
}

export function mountUsersTab(root, ctx) {
  on(root, 'click', '[data-export-log]', () => {
    const rows = accessLog.list().map((l) => ({ thoi_diem: fmtDateTime(l.time), tai_khoan: l.account ?? '', nguoi_dung: l.userName, vai_tro: l.role, hanh_dong: l.action, doi_tuong: l.target, so_ban_ghi: l.count ?? '' }));
    downloadText('nhat_ky_truy_cap.csv', toCsv(['thoi_diem', 'tai_khoan', 'nguoi_dung', 'vai_tro', 'hanh_dong', 'doi_tuong', 'so_ban_ghi'], rows));
  });
  if (!canManage(ctx)) return;
  on(root, 'click', '[data-clear-log]', () => {
    if (!confirm('Xóa toàn bộ nhật ký đăng nhập và truy cập trong trình duyệt này?')) return;
    accessLog.clear();
    ctx.route();
  });
  on(root, 'click', '[data-acc-export]', () => {
    downloadText('accounts.json', exportAccounts(), 'application/json;charset=utf-8');
    toast('Đã tải accounts.json – tải tệp lên web/data trên GitHub để áp dụng cho mọi máy');
  });
  on(root, 'click', '[data-acc-discard]', () => {
    if (!confirm('Bỏ mọi thay đổi tài khoản trên máy này và dùng lại danh sách trong tệp data/accounts.json đã đăng?')) return;
    discardLocalAccounts();
    toast('Đã dùng lại danh sách tài khoản đã đăng');
    ctx.accountsChanged();
  });
  on(root, 'click', '[data-acc-new]', () => openAccountDialog(ctx));
  on(root, 'click', '[data-acc-edit]', (e, btn) => openAccountDialog(ctx, findAccount(accounts(), btn.dataset.accEdit)));
  on(root, 'click', '[data-acc-pass]', (e, btn) => openPasswordDialog(ctx, findAccount(accounts(), btn.dataset.accPass)));
  on(root, 'click', '[data-acc-lock]', (e, btn) => {
    const acc = findAccount(accounts(), btn.dataset.accLock);
    if (!acc) return;
    if (!acc.disabled) {
      const why = guardRemoval(accounts(), acc.username, ctx.account.username, 'khóa');
      if (why) return toast(why);
      if (!confirm(`Khóa tài khoản ${acc.username}? Người dùng sẽ không đăng nhập được cho tới khi mở khóa.`)) return;
    }
    setDisabled(acc.username, !acc.disabled);
    toast(`${acc.disabled ? 'Đã mở khóa' : 'Đã khóa'} tài khoản ${acc.username}`);
    ctx.accountsChanged();
  });
  on(root, 'click', '[data-acc-del]', (e, btn) => {
    const acc = findAccount(accounts(), btn.dataset.accDel);
    const why = guardRemoval(accounts(), btn.dataset.accDel, ctx.account.username, 'xóa');
    if (why) return toast(why);
    if (!confirm(`Xóa hẳn tài khoản ${acc.username} (${acc.name})?`)) return;
    deleteAccount(acc.username);
    toast(`Đã xóa tài khoản ${acc.username}`);
    ctx.accountsChanged();
  });
}

function scopeOptions(kind, value) {
  const ds = state.dataset;
  const fac = new Map(ds.faculties.map((f) => [f.id, f]));
  const items = {
    khoa: ds.faculties.map((f) => [f.id, f.name]),
    gv: ds.lecturers.map((l) => [l.id, `${l.name} – ${fac.get(l.facultyId)?.short ?? l.facultyId}`]),
    cvht: ds.advisors.map((a) => [a.id, `${a.name} – ${fac.get(a.facultyId)?.short ?? a.facultyId ?? ''}`]),
  }[kind];
  return html`<option value="">— Chọn —</option>${items.map(([id, label]) => html`<option value="${id}"${raw(id === value ? ' selected' : '')}>${label}</option>`)}`;
}

function openAccountDialog(ctx, acc = null) {
  const role = acc?.role ?? 'viewer';
  openDialog({
    title: acc ? `Sửa tài khoản ${acc.username}` : 'Tạo tài khoản đăng nhập',
    body: html`<form id="acc-form" class="form-grid" novalidate>
      <div class="form-field"><label for="af-username">Tên đăng nhập</label>
        <input class="input" id="af-username" name="username" value="${acc?.username ?? ''}" autocomplete="off" autocapitalize="none" spellcheck="false" required${raw(acc ? ' readonly' : '')}>
        <span class="hint">${acc ? 'Không đổi được tên đăng nhập' : '3 – 32 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới, gạch ngang'}</span></div>
      <div class="form-field"><label for="af-name">Họ tên hiển thị</label>
        <input class="input" id="af-name" name="name" value="${acc?.name ?? ''}" required></div>
      <div class="form-field"><label for="af-unit">Đơn vị (không bắt buộc)</label>
        <input class="input" id="af-unit" name="unit" value="${acc?.unit ?? ''}"></div>
      <div class="form-field"><label for="af-role">Vai trò</label>
        <select class="select" id="af-role" name="role">${ROLE_ORDER.map((r) => html`<option value="${r}"${raw(r === role ? ' selected' : '')}>${ROLES[r].label}</option>`)}</select>
        <span class="hint" id="af-role-hint">${roleHint(role)}</span></div>
      <div class="form-field" data-scope="khoa"${raw(role === 'khoa' ? '' : ' hidden')}><label for="af-faculty">Khoa phụ trách</label>
        <select class="select" id="af-faculty" name="facultyId">${scopeOptions('khoa', acc?.facultyId)}</select></div>
      <div class="form-field" data-scope="gv"${raw(role === 'gv' ? '' : ' hidden')}><label for="af-lecturer">Giảng viên (lớp mình phụ trách)</label>
        <select class="select" id="af-lecturer" name="lecturerId">${scopeOptions('gv', acc?.lecturerId)}</select></div>
      <div class="form-field" data-scope="cvht"${raw(role === 'cvht' ? '' : ' hidden')}><label for="af-advisor">Cố vấn học tập (sinh viên mình phụ trách)</label>
        <select class="select" id="af-advisor" name="advisorId">${scopeOptions('cvht', acc?.advisorId)}</select></div>
      ${acc
        ? ''
        : html`<div class="form-field"><label for="af-pass">Mật khẩu</label>
            <input class="input" type="password" id="af-pass" name="password" autocomplete="new-password" required>
            <span class="hint" id="af-pass-hint">Ít nhất ${minPasswordLength(role)} ký tự${role === 'admin' ? '' : ' (nên từ 8 ký tự)'}</span></div>
          <div class="form-field"><label for="af-pass2">Nhập lại mật khẩu</label>
            <input class="input" type="password" id="af-pass2" name="password2" autocomplete="new-password" required></div>`}
      <p class="caption form-field--full" id="af-error" role="alert" style="color:var(--alert-ink)"></p>
    </form>`,
    foot: html`<button type="button" class="btn" data-close>Hủy</button><button type="submit" form="acc-form" class="btn btn--primary">${icon('check')}${acc ? 'Lưu thay đổi' : 'Tạo tài khoản'}</button>`,
    onMount(dlg) {
      const form = dlg.querySelector('#acc-form');
      const roleSel = form.elements.role;
      roleSel.addEventListener('change', () => {
        const r = roleSel.value;
        form.querySelectorAll('[data-scope]').forEach((el) => (el.hidden = el.dataset.scope !== r));
        dlg.querySelector('#af-role-hint').textContent = roleHint(r);
        const ph = dlg.querySelector('#af-pass-hint');
        if (ph) ph.textContent = `Ít nhất ${minPasswordLength(r)} ký tự${r === 'admin' ? '' : ' (nên từ 8 ký tự)'}`;
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = Object.fromEntries(new FormData(form));
        const errs = validateAccount(input, { accounts: accounts(), editing: acc });
        const out = dlg.querySelector('#af-error');
        out.textContent = errs.join(' · ');
        if (errs.length) return;
        const submit = dlg.querySelector('[type="submit"]');
        submit.disabled = true;
        if (acc) updateAccount(acc.username, input);
        else await createAccount(input, ctx.account);
        dlg.close();
        toast(acc ? `Đã lưu tài khoản ${acc.username}` : `Đã tạo tài khoản ${input.username.trim().toLowerCase()} – tải tệp accounts.json để áp dụng cho mọi máy`);
        ctx.accountsChanged();
      });
      (acc ? form.elements.name : form.elements.username).focus();
    },
  });
}

function openPasswordDialog(ctx, acc) {
  if (!acc) return;
  openDialog({
    title: `Đặt lại mật khẩu – ${acc.username}`,
    body: html`<form id="pw-form" class="form-grid" novalidate>
      <p class="small form-field--full" style="margin:0">${acc.name} · ${ROLES[acc.role].label}. Mật khẩu cũ không xem được; đặt mật khẩu mới rồi báo cho người dùng.</p>
      <div class="form-field"><label for="pw-new">Mật khẩu mới</label>
        <input class="input" type="password" id="pw-new" name="password" autocomplete="new-password" required>
        <span class="hint">Ít nhất ${minPasswordLength(acc.role)} ký tự${acc.role === 'admin' ? '' : ' (nên từ 8 ký tự)'}</span></div>
      <div class="form-field"><label for="pw-new2">Nhập lại mật khẩu mới</label>
        <input class="input" type="password" id="pw-new2" name="password2" autocomplete="new-password" required></div>
      <p class="caption form-field--full" id="pw-error" role="alert" style="color:var(--alert-ink)"></p>
    </form>`,
    foot: html`<button type="button" class="btn" data-close>Hủy</button><button type="submit" form="pw-form" class="btn btn--primary">${icon('key')}Lưu mật khẩu mới</button>`,
    onMount(dlg) {
      const form = dlg.querySelector('#pw-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errs = validatePassword(form.elements.password.value, form.elements.password2.value, acc.role);
        dlg.querySelector('#pw-error').textContent = errs.join(' · ');
        if (errs.length) return;
        dlg.querySelector('[type="submit"]').disabled = true;
        await setPassword(acc.username, form.elements.password.value);
        dlg.close();
        toast(`Đã đặt lại mật khẩu cho ${acc.username}`);
        ctx.accountsChanged();
      });
      form.elements.password.focus();
    },
  });
}
