// Khung ứng dụng: thanh trên cùng, điều hướng theo vai trò, thanh lọc cố định, chân trang.
import { ROLES, SCREENS, canSee } from '../access.js';
import { coursesFor, facultiesFor, FUNNEL_METRIC_OPTIONS, metricName, notifications, visibleSemesters, visibleWaves, waveLabel } from '../api.js';
import { DOT_LABELS } from '../core/constants.js';
import { fmtDate, fmtDateTime } from '../core/format.js';
import { notifRead, state } from '../store.js';
import { esc, html, qs, raw } from '../ui/dom.js';
import { brandMark, icon } from '../ui/icons.js';

export function renderTopbar(ctx) {
  const { user } = ctx;
  const screens = ROLES[user.role].screens;
  const order = ['M1', 'M2', 'M3', 'M4', 'M0'].filter((s) => screens.includes(s));
  const notif = notifications(user);
  const read = notifRead.set();
  const unread = notif.filter((n) => !read.has(n.id)).length;
  return html`
    <a class="brand" href="#/" aria-label="Trang chính – Dashboard chất lượng giảng dạy BL">
      ${brandMark}
      <span class="brand__text"><span class="brand__name">Chất lượng giảng dạy BL</span><span class="brand__sub">Trường Đại học Thành Đông · MVP</span></span>
    </a>
    <nav class="mainnav" aria-label="Màn hình chính">
      ${order.map((code) => {
        const s = SCREENS[code];
        const current = ctx.screen === code;
        return html`<a href="#/${s.route}"${raw(current ? ' aria-current="page"' : '')}>${icon(s.icon)}<span class="mainnav__label">${s.label}</span><span class="mainnav__code">${code}</span></a>`;
      })}
    </nav>
    <span class="topbar__spacer"></span>
    <button type="button" class="icon-btn" id="btn-notif" aria-haspopup="true" aria-expanded="false" aria-label="Thông báo${unread ? `: ${unread} chưa đọc` : ''}">
      ${icon('bell')}${unread ? html`<span class="badge-count" aria-hidden="true">${unread > 9 ? '9+' : unread}</span>` : ''}
    </button>
    <button type="button" class="user-btn" id="btn-role" aria-haspopup="true" aria-expanded="false" aria-label="Đổi vai trò trình diễn – hiện tại: ${user.name}, ${user.roleLabel}">
      <span class="avatar" aria-hidden="true">${user.initials}</span>
      <span class="user-btn__text"><span class="user-btn__name">${user.name}</span><span class="user-btn__role">${user.roleLabel}</span></span>
    </button>`;
}

export function renderBottomNav(ctx) {
  const screens = ROLES[ctx.user.role].screens;
  const order = ['M1', 'M2', 'M3', 'M4', 'M0'].filter((s) => screens.includes(s));
  return html`${order.map((code) => {
    const s = SCREENS[code];
    return html`<a href="#/${s.route}"${raw(ctx.screen === code ? ' aria-current="page"' : '')}>${icon(s.icon)}<span>${s.label}</span></a>`;
  })}`;
}

// ---- Thanh lọc ---------------------------------------------------------------------------

export function standardFilterDefs(ctx, keys) {
  const { user, f } = ctx;
  const defs = [];
  if (keys.includes('ky')) {
    defs.push({ key: 'ky', label: 'Học kỳ', value: f.semesterId, options: visibleSemesters(user).map((s) => ({ value: s.id, label: s.label })).reverse() });
  }
  if (keys.includes('dot')) {
    const waves = visibleWaves(user).filter((w) => w.semesterId === f.semesterId);
    defs.push({
      key: 'dot',
      label: 'Đợt',
      value: f.dot,
      options: waves.map((w) => ({ value: w.dot, label: `${DOT_LABELS[w.dot]}${w.status !== 'published' ? ' (chưa công bố)' : ''}` })),
    });
  }
  if (keys.includes('khoa')) {
    const facs = facultiesFor(user);
    defs.push({
      key: 'khoa',
      label: 'Khoa',
      value: f.facultyId,
      disabled: Boolean(f.locked.facultyId),
      options: [...(f.locked.facultyId ? [] : [{ value: '', label: 'Tất cả khoa' }]), ...facs.map((x) => ({ value: x.id, label: x.name }))],
    });
  }
  if (keys.includes('hp')) {
    defs.push({
      key: 'hp',
      label: 'Học phần',
      value: f.courseId,
      options: [{ value: '', label: 'Tất cả học phần' }, ...coursesFor(user, f.facultyId).map((c) => ({ value: c.id, label: c.name }))],
    });
  }
  if (keys.includes('cs')) {
    defs.push({ key: 'cs', label: 'Chỉ số', value: f.metric, options: FUNNEL_METRIC_OPTIONS.map((m) => ({ value: m, label: metricName(m) })), hint: 'Áp dụng cho biểu đồ phễu, histogram và xu hướng' });
  }
  return defs;
}

export function renderFilterBar(ctx, defs, meta) {
  const summary = defs
    .filter((d) => d.key !== 'cs')
    .map((d) => d.options.find((o) => o.value === d.value)?.label)
    .filter(Boolean)
    .join(' · ');
  return html`<div class="filterbar__inner">
    ${defs.length
      ? html`<span class="filterbar__summary" aria-hidden="true">${summary}</span>
        <button type="button" class="btn btn--sm filterbar__toggle" id="btn-filters" aria-expanded="false" aria-controls="filter-fields">${icon('filter')}Bộ lọc</button>`
      : ''}
    <div class="filterbar__fields" id="filter-fields" role="group" aria-label="Bộ lọc dữ liệu">
      ${defs.map(
        (d) => html`<div class="field-inline">
          <label for="flt-${d.key}">${d.label}</label>
          <select class="select${d.wide ? ' select--wide' : ''}" id="flt-${d.key}" data-filter="${d.key}"${raw(d.disabled ? ' disabled' : '')}${raw(d.hint ? ` title="${esc(d.hint)}"` : '')}>
            ${d.options.map((o) => html`<option value="${o.value}"${raw(String(o.value) === String(d.value ?? '') ? ' selected' : '')}>${o.label}</option>`)}
          </select>
        </div>`,
      )}
    </div>
    <div class="filterbar__meta">${meta}</div>
  </div>`;
}

export function filterMeta(ctx, wave) {
  const ds = state.dataset;
  const sim = ds.meta?.source === 'synthetic';
  const when = wave?.publishedAt ? fmtDate(wave.publishedAt) : wave ? 'chưa công bố' : fmtDate(ds.meta?.updatedAt || ds.meta?.createdAt);
  return html`<span>Cập nhật: <b>${when}</b></span>
    <span class="data-badge ${sim ? 'data-badge--sim' : 'data-badge--import'}" title="${sim ? 'Bộ dữ liệu mô phỏng có hạt giống cố định – không phải dữ liệu thật của Trường' : `Dữ liệu nhập từ tệp lúc ${fmtDateTime(ds.meta?.updatedAt)}`}">${sim ? 'Dữ liệu mô phỏng' : 'Dữ liệu nhập'}</span>`;
}

// ---- Bảng chọn vai trò và thông báo --------------------------------------------------------

export function roleMenu(ctx) {
  const groups = [
    ['qlcl', 'bgh', 'admin'],
    ['khoa'],
    ['gv'],
    ['cvht'],
  ];
  const titles = ['Cấp Trường', 'Lãnh đạo khoa', 'Giảng viên', 'Cố vấn học tập'];
  return html`<div class="popover__head"><span>Chọn vai trò trình diễn</span><button type="button" class="icon-btn" data-close-pop aria-label="Đóng">${icon('close', { size: 18 })}</button></div>
    <p class="caption" style="padding:8px 14px 0;margin:0">Bản MVP không có đăng nhập; chọn một tài khoản mô phỏng để thấy dữ liệu theo đúng phạm vi của vai trò đó.</p>
    ${groups.map(
      (roles, gi) => html`<div class="role-group" role="group" aria-label="${titles[gi]}">
        <div class="role-group__title">${titles[gi]}</div>
        ${state.users
          .filter((u) => roles.includes(u.role))
          .map(
            (u) => html`<button type="button" class="role-item" role="menuitemradio" aria-checked="${u.id === ctx.user.id}" data-user="${u.id}">
              <span class="avatar" aria-hidden="true">${u.initials}</span>
              <span><span class="role-item__name">${u.name}</span><br><span class="role-item__scope">${u.role === 'gv' || u.role === 'cvht' || u.role === 'khoa' ? u.unit : `${u.unit} · ${ROLES[u.role].scope}`}</span></span>
            </button>`,
          )}
      </div>`,
    )}`;
}

export function notifMenu(ctx) {
  const items = notifications(ctx.user);
  const read = notifRead.set();
  return html`<div class="popover__head"><span>Thông báo</span><button type="button" class="icon-btn" data-close-pop aria-label="Đóng">${icon('close', { size: 18 })}</button></div>
    ${items.length
      ? items.map(
          (n) => html`<a class="notif${read.has(n.id) ? '' : ' is-unread'}" href="${n.href || '#/'}">
            <span aria-hidden="true">${n.level === 'alert' ? '✖' : '⚠'}</span>
            <span><span class="notif__text">${n.text}</span>${n.detail ? html`<br><span class="notif__meta">${n.detail}</span>` : ''}<br><span class="notif__meta">${n.meta}</span></span>
          </a>`,
        )
      : html`<div class="empty"><div class="empty__title">Không có thông báo</div><div class="small">Các cảnh báo của đợt mới công bố sẽ hiện ở đây.</div></div>`}`;
}

export function openPopover(anchor, content, onMount) {
  closePopover();
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.setAttribute('role', 'dialog');
  pop.innerHTML = String(content);
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const width = pop.offsetWidth;
  pop.style.top = `${window.scrollY + r.bottom + 6}px`;
  pop.style.left = `${Math.max(12, Math.min(window.scrollX + r.right - width, window.innerWidth - width - 12))}px`;
  anchor.setAttribute('aria-expanded', 'true');
  const onDown = (e) => {
    if (!pop.contains(e.target) && !anchor.contains(e.target)) closePopover();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      closePopover();
      anchor.focus();
    }
  };
  pop._cleanup = () => {
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('keydown', onKey);
    anchor.setAttribute('aria-expanded', 'false');
  };
  setTimeout(() => {
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
  });
  pop.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-pop]')) closePopover();
  });
  onMount?.(pop);
  pop.querySelector('[aria-checked="true"], a, button')?.focus();
  return pop;
}

export function closePopover() {
  const pop = qs('.popover');
  if (pop) {
    pop._cleanup?.();
    pop.remove();
  }
}

export function renderFooter() {
  return html`<p>Bản MVP thiết kế cho Nội dung 3 – đề tài đánh giá chất lượng giảng dạy BL tại Trường Đại học Thành Đông.
    Dữ liệu, tên người và lời dẫn chỉ báo trong bản này là <b>mô phỏng</b>. ·
    <a href="#/gioi-thieu">Giới thiệu và hướng dẫn</a> · <a href="#/sus">Phiếu khảo sát khả dụng (SUS)</a> · Biểu đồ: Apache ECharts 5.6 (Apache-2.0)</p>`;
}

export function screenAllowed(user, screen) {
  return !screen || canSee(user, screen);
}

export { waveLabel };
