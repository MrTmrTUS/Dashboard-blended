// Điểm khởi động: đăng nhập → nạp dữ liệu → tính toán theo lô → dựng khung → định tuyến (mục 5.8).
import { AccessDenied, accountUser, buildUsers, canSee, homeScreen, ROLES, SCREENS } from './access.js';
import { resolveFilters } from './api.js';
import { currentAccount, initAuth, logout, setViewAs, viewAsId } from './auth.js';
import { classifyComment } from './ai/classify.js';
import { DEFAULT_CONFIG, mergeConfig } from './core/config.js';
import { computeMart } from './core/engine.js';
import { buildSyntheticDataset } from './data/synthetic.js';
import { configStore, emit, idb, measureStore, notifRead, state, waveStatus } from './store.js';
import { probeLogo, ORG_NAME } from './ui/brand.js';
import { banner, busy, emptyState, pageHead, plainCard } from './ui/components.js';
import { disposeCharts } from './ui/charts.js';
import { html, isMobile, on, qs, setHTML } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { clearAiCache, renderAssistant } from './views/assistant.js';
import { closePopover, notifMenu, openPopover, renderBottomNav, renderFilterBar, renderFooter, renderTopbar, userMenu } from './views/shell.js';
import { renderLogin } from './views/login.js';
import { OverviewView } from './views/overview.js';
import { ClassListView, ClassDetailView } from './views/classes.js';
import { StudentsView } from './views/students.js';
import { BenchmarkView } from './views/benchmark.js';
import { AdminView } from './views/admin.js';
import { SusView } from './views/sus.js';
import { AboutView } from './views/about.js';

// ---- Dữ liệu ---------------------------------------------------------------------------

function applyOverlays(ds) {
  const statuses = waveStatus.map();
  ds.waves = ds.waves.map((w) => (statuses[w.id] ? { ...w, ...statuses[w.id] } : w));
  const o = measureStore.overlay();
  state.library = [...ds.measures.map((m) => ({ ...m, ...(o.changed[m.code] || {}) })), ...o.added];
  return ds;
}

export function recompute({ reason = '' } = {}) {
  state.cfg = mergeConfig(DEFAULT_CONFIG, configStore.overrides());
  state.mart = computeMart(state.dataset, state.cfg, { classify: classifyComment });
  state.version++;
  clearAiCache();
  emit('recomputed', { reason });
}

export async function loadDataset() {
  const imported = await idb.get('dataset');
  if (imported && imported.classes?.length) {
    state.dataset = imported;
    state.datasetKey = 'import';
  } else {
    state.dataset = buildSyntheticDataset();
    state.datasetKey = 'synthetic';
  }
  applyOverlays(state.dataset);
  state.users = buildUsers(state.dataset);
}

export async function replaceDataset(ds, { key = 'import', persist = true } = {}) {
  busy(true, 'Đang lưu và tính lại…');
  await new Promise((r) => setTimeout(r, 30));
  if (persist && key === 'import') await idb.set('dataset', ds);
  if (key === 'synthetic') await idb.del('dataset');
  state.dataset = key === 'synthetic' ? buildSyntheticDataset() : ds;
  state.datasetKey = key;
  applyOverlays(state.dataset);
  state.users = buildUsers(state.dataset);
  resolveUser();
  recompute({ reason: 'dataset' });
  busy(false);
  route();
}

export function refreshOverlays() {
  applyOverlays(state.dataset);
}

// ---- Tài khoản ------------------------------------------------------------------------------

// Người dùng hiệu lực: chính tài khoản đăng nhập, hoặc người dùng mô phỏng mà quản trị đang "xem thử".
function resolveUser() {
  const acc = state.account;
  const viewId = acc.role === 'admin' ? viewAsId() : null;
  const sim = viewId ? state.users.find((u) => u.id === viewId) : null;
  if (viewId && !sim) setViewAs(null);
  state.user = sim ? { ...sim, viewAs: true } : accountUser(acc, state.dataset);
}

function switchView(id) {
  if (state.account?.role !== 'admin') return;
  setViewAs(id);
  resolveUser();
  closePopover();
  location.hash = `#/${SCREENS[homeScreen(state.user)].route}`;
  route();
}

// Đăng xuất (hoặc phiên hết hiệu lực): tải lại trang để về màn hình đăng nhập, không giữ dữ liệu trong bộ nhớ.
function endSession(notice, { keepPlace = false } = {}) {
  logout(notice);
  if (keepPlace) location.reload();
  else location.replace(location.pathname + location.search);
}

// Gọi sau khi quản trị sửa danh sách tài khoản trên máy này.
export function accountsChanged() {
  const acc = currentAccount();
  if (!acc) return endSession('Tài khoản đang dùng đã thay đổi – vui lòng đăng nhập lại.');
  state.account = acc;
  resolveUser();
  route();
}

// ---- Định tuyến ---------------------------------------------------------------------------

function parseHash() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [path, qstr = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(qstr));
  return { parts, query };
}

function resolveView(r, user) {
  const [a, b] = r.parts;
  switch (a) {
    case undefined:
      return { view: viewFor(homeScreen(user)), params: {} };
    case 'tong-quan':
      return { view: OverviewView, params: {} };
    case 'lop':
      return b ? { view: ClassDetailView, params: { id: b, sub: r.parts[2] } } : { view: ClassListView, params: {} };
    case 'sinh-vien':
      return { view: StudentsView, params: {} };
    case 'doi-sanh':
      return { view: BenchmarkView, params: {} };
    case 'quan-tri':
      return { view: AdminView, params: { tab: b } };
    case 'sus':
      return { view: SusView, params: {} };
    case 'gioi-thieu':
      return { view: AboutView, params: {} };
    default:
      return { view: null, params: {} };
  }
}

function viewFor(screen) {
  return { M1: OverviewView, M2: ClassListView, M3: StudentsView, M4: BenchmarkView, M0: AdminView }[screen] || OverviewView;
}

let current = null;

export function navigate(query, { replace = false, path } = {}) {
  const r = parseHash();
  const base = path ?? `#/${r.parts.join('/')}`;
  const q = Object.entries(query).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  const s = q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const target = `${base}${s ? `?${s}` : ''}`;
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
  if (replace) route();
}

export function route() {
  const acc = currentAccount();
  if (!acc || acc.username !== state.account?.username) return endSession('Phiên đăng nhập đã hết hạn hoặc tài khoản đã thay đổi – vui lòng đăng nhập lại.', { keepPlace: true });
  if (acc.updatedAt !== state.account.updatedAt) {
    state.account = acc;
    resolveUser();
  }
  const user = state.user;
  const r = parseHash();
  const { view, params } = resolveView(r, user);
  const shell = qs('#app');
  disposeCharts(qs('#main'));
  closePopover();

  const ctx = { user, account: state.account, params, query: r.query, f: resolveFilters(user, r.query), screen: view?.screen ?? null, navigate, route, recompute, replaceDataset, refreshOverlays, accountsChanged };
  const viewing = user.viewAs
    ? banner({
        kind: 'warn',
        iconText: '👁',
        title: `Đang xem thử dưới vai trò ${user.roleLabel} – ${user.name}`,
        body: `Màn hình và dữ liệu hiển thị đúng phạm vi của vai trò này. Nhật ký vẫn ghi theo tài khoản ${state.account.username}.`,
        actions: html`<button type="button" class="btn btn--sm" data-view-self>Trở về tài khoản quản trị</button>`,
      })
    : '';
  let content;
  try {
    if (!view) throw Object.assign(new Error('notfound'), { notFound: true });
    if (view.screen && !canSee(user, view.screen)) throw new AccessDenied();
    view.prepare?.(ctx);
    content = view.render(ctx);
  } catch (e) {
    ctx.screen = view?.screen ?? null;
    content = errorPage(e, user);
    current = { view: null, ctx };
    renderChrome(ctx, null);
    freshMain(html`${viewing}${content}`);
    renderAside(null, ctx);
    if (!(e instanceof AccessDenied) && !e.notFound) console.error(e);
    return;
  }
  current = { view, ctx };
  renderChrome(ctx, view);
  const main = freshMain(html`${viewing}${content}`);
  shell.classList.toggle('is-wide', view.layout !== 'assistant');
  try {
    view.mount?.(main, ctx);
  } catch (e) {
    console.error(e);
  }
  renderAside(view, ctx);
  makeScrollRegionsFocusable(main);
  const key = `${r.parts.join('/')}`;
  if (route.lastKey !== key) {
    window.scrollTo({ top: 0 });
    qs('.page-title', main)?.setAttribute('tabindex', '-1');
    if (route.lastKey !== undefined) qs('.page-title', main)?.focus({ preventScroll: true });
  }
  route.lastKey = key;
  document.title = `${view.title?.(ctx) ?? SCREENS[view.screen]?.label ?? 'Dashboard'} · Chất lượng giảng dạy BL · ${ORG_NAME}`;
}

// Mỗi lần vẽ thay #main bằng phần tử mới: trình nghe sự kiện mà màn hình trước gắn vào #main (qua mount)
// không sót lại – nếu không, quay lại một trang rồi bấm nút sẽ chạy cả trình nghe cũ (mở hai hộp thoại…).
function freshMain(content) {
  const old = qs('#main');
  const main = old.cloneNode(false);
  setHTML(main, content);
  old.replaceWith(main);
  return main;
}

// Vùng cuộn (bảng rộng trên điện thoại) phải dùng được bằng bàn phím (WCAG 2.1.1).
function makeScrollRegionsFocusable(root) {
  requestAnimationFrame(() => {
    for (const el of root.querySelectorAll('.table-wrap, .table-scroll')) {
      const scrolls = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      if (scrolls && !el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'region');
        const label = el.querySelector('caption')?.textContent || el.closest('.card')?.querySelector('.card__title')?.textContent || 'Bảng dữ liệu';
        el.setAttribute('aria-label', `${label.trim()} (cuộn để xem thêm)`);
      }
    }
  });
}

function errorPage(e, user) {
  if (e instanceof AccessDenied) {
    return html`${pageHead({ title: 'Không có quyền truy cập' })}${plainCard({
      body: html`${emptyState({ title: e.message, text: `Vai trò ${ROLES[user.role].label}: ${ROLES[user.role].scope}.`, iconText: '🔒' })}
        <p style="text-align:center"><a class="btn" href="#/">Về trang của tôi</a></p>`,
    })}`;
  }
  if (e.notFound) {
    return html`${pageHead({ title: 'Không tìm thấy trang' })}${plainCard({ body: html`${emptyState({ title: 'Đường dẫn không tồn tại' })}<p style="text-align:center"><a class="btn" href="#/">Về trang chính</a></p>` })}`;
  }
  return html`${pageHead({ title: 'Đã có lỗi' })}${plainCard({ body: emptyState({ title: 'Không hiển thị được trang này', text: e.message }) })}`;
}

function renderChrome(ctx, view) {
  setHTML(qs('#topbar'), renderTopbar(ctx));
  setHTML(qs('#bottomnav'), renderBottomNav(ctx));
  const defs = view?.filters ? view.filters(ctx) : [];
  const meta = view?.meta ? view.meta(ctx) : '';
  const fb = qs('#filterbar');
  fb.hidden = !defs.length && !meta;
  fb.classList.remove('is-open');
  setHTML(fb, renderFilterBar(ctx, defs, meta));
}

function renderAside(view, ctx) {
  const aside = qs('#assistant');
  const fab = qs('#assistant-fab');
  const layout = qs('.layout');
  const req = view?.layout === 'assistant' && view.assistant ? view.assistant(ctx) : null;
  const show = view?.layout === 'assistant';
  aside.hidden = !show;
  fab.hidden = !show;
  layout.classList.toggle('layout--wide', !show);
  aside.classList.remove('is-open');
  qs('.scrim')?.remove();
  if (show) renderAssistant(aside, req, ctx);
}

// ---- Sự kiện khung -------------------------------------------------------------------------

function bindChrome() {
  const app = qs('#app');
  on(app, 'change', '[data-filter]', (e, el) => {
    const { ctx, view } = current;
    const def = view?.filters?.(ctx)?.find((x) => x.key === el.dataset.filter);
    if (def?.toHash) {
      location.hash = def.toHash(el.value);
      return;
    }
    const q = { ...ctx.query };
    q[el.dataset.filter] = el.value;
    if (el.dataset.filter === 'ky') delete q.dot;
    if (el.dataset.filter === 'khoa') delete q.hp;
    if (el.dataset.filter === 'cs' && el.value === 'IDX') delete q.cs;
    navigate(q);
  });
  on(app, 'click', '#btn-filters', (e, btn) => {
    const fb = qs('#filterbar');
    const open = !fb.classList.contains('is-open');
    fb.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
  });
  on(app, 'click', '#btn-user', (e, btn) => {
    if (qs('.popover')) return closePopover();
    openPopover(btn, userMenu(current.ctx), (pop) => {
      pop.setAttribute('aria-label', 'Tài khoản');
      pop.style.width = 'min(400px, calc(100vw - 24px))';
      on(pop, 'click', '[data-user]', (ev, item) => switchView(item.dataset.user));
      on(pop, 'click', '[data-view-self]', () => switchView(null));
      on(pop, 'click', '[data-logout]', () => endSession('Bạn đã đăng xuất.'));
    });
  });
  on(app, 'click', '#main [data-view-self]', () => switchView(null));
  on(app, 'click', '#btn-notif', (e, btn) => {
    if (qs('.popover')) return closePopover();
    const pop = openPopover(btn, notifMenu(current.ctx));
    pop.setAttribute('aria-label', 'Thông báo');
    const ids = [...pop.querySelectorAll('.notif')].length;
    if (ids) {
      import('./api.js').then(({ notifications }) => {
        notifRead.markAll(notifications(current.ctx.user).map((n) => n.id));
        setHTML(qs('#topbar'), renderTopbar(current.ctx));
      });
    }
    on(pop, 'click', 'a', () => closePopover());
  });
  on(document.body, 'click', '[data-toggle-table]', (e, btn) => {
    const card = document.getElementById(btn.dataset.toggleTable);
    const pressed = btn.getAttribute('aria-pressed') === 'true';
    btn.setAttribute('aria-pressed', String(!pressed));
    btn.querySelector('span').textContent = pressed ? 'Xem dạng bảng' : 'Xem biểu đồ';
    card.querySelector('[data-view="chart"]').hidden = !pressed;
    card.querySelector('[data-view="table"]').hidden = pressed;
    if (pressed) window.dispatchEvent(new Event('resize'));
  });
  const fab = qs('#assistant-fab');
  fab.addEventListener('click', () => {
    const aside = qs('#assistant');
    aside.classList.add('is-open');
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.addEventListener('click', closeDrawer);
    document.body.appendChild(scrim);
    aside.querySelector('.assistant__close')?.focus();
  });
  qs('#assistant').addEventListener('click', (e) => {
    if (e.target.closest('.assistant__close')) closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && qs('#assistant').classList.contains('is-open')) closeDrawer();
  });
  let wasMobile = isMobile();
  window.addEventListener('resize', () => {
    const now = isMobile();
    if (now !== wasMobile) {
      wasMobile = now;
      route();
    }
  });
  window.addEventListener('hashchange', route);
  // Liên kết "Bỏ qua đến nội dung chính": href="#main" sẽ đổi đường dẫn #/… của bộ định tuyến, nên chỉ chuyển tiêu điểm.
  qs('.skip-link').addEventListener('click', (e) => {
    e.preventDefault();
    const main = qs('#main');
    main.focus();
    main.scrollIntoView();
  });
}

function closeDrawer() {
  qs('#assistant').classList.remove('is-open');
  qs('.scrim')?.remove();
  qs('#assistant-fab')?.focus();
}

// ---- Khởi động ---------------------------------------------------------------------------

function showLogin() {
  qs('#app').hidden = true;
  document.body.classList.add('is-login');
  document.title = `Đăng nhập · Chất lượng giảng dạy BL · ${ORG_NAME}`;
  const root = qs('#login-root');
  root.hidden = false;
  renderLogin(root, {
    onSuccess(acc) {
      root.hidden = true;
      root.innerHTML = '';
      document.body.classList.remove('is-login');
      startApp(acc);
    },
  });
}

async function startApp(acc) {
  state.account = acc;
  qs('#app').hidden = false;
  const main = qs('#main');
  setHTML(main, html`<div class="empty" style="min-height:50vh"><span class="spinner" aria-hidden="true"></span><div class="empty__title">Đang tính toán dữ liệu…</div></div>`);
  await new Promise((r) => setTimeout(r, 20));
  try {
    await loadDataset();
    recompute({ reason: 'boot' });
    resolveUser();
  } catch (e) {
    console.error(e);
    setHTML(main, html`${plainCard({ body: emptyState({ title: 'Không khởi động được ứng dụng', text: e.message }) })}`);
    return;
  }
  setHTML(qs('#footer'), renderFooter());
  qs('#assistant').innerHTML = String(html`<div class="assistant__head">${icon('sparkle')}<span class="assistant__title">Trợ lý AI</span>
    <button type="button" class="icon-btn assistant__close" aria-label="Đóng trợ lý">${icon('close')}</button></div><div class="assistant__body" aria-live="polite"></div>`);
  bindChrome();
  route();
}

async function boot() {
  await Promise.all([initAuth(), probeLogo()]);
  const acc = currentAccount();
  if (acc) startApp(acc);
  else showLogin();
}

if (!window.echarts) console.warn('Không tải được ECharts – biểu đồ sẽ không hiển thị.');
boot();
