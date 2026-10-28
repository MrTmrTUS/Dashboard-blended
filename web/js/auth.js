// Đăng nhập cho bản MVP chạy tĩnh (GitHub Pages hoặc máy chủ tĩnh của Trường).
// Tài khoản lấy từ data/accounts.json (mật khẩu đã băm). Quản trị tạo, sửa tài khoản ở M0 › Tài khoản:
// thay đổi có hiệu lực ngay trên máy đó; khi đã kết nối GitHub (github.js), trang tự đăng tệp mới lên repo
// để mọi máy đăng nhập được sau khoảng 1 – 2 phút (hoặc quản trị tải tệp lên thủ công).
// LƯU Ý: kiểm tra đăng nhập chạy trên trình duyệt nên chỉ chặn truy cập thông thường; không thay được
// xác thực phía máy chủ của bản chính thức (Django) – không đưa dữ liệu thật lên trang tĩnh công khai.
import { ROLES } from './access.js';
import { findAccount, mergeAccounts, normalizeUsername, parseAccounts, publicAccount, SCOPE_FIELD, serializeAccounts } from './core/accounts.js';
import { hashPassword, verifyPassword } from './core/password.js';
import { connection, GitHubError, readAccountsFile, writeAccountsFile } from './github.js';
import { accessLog, load, remove, save } from './store.js';

const SESSION = 'tdu-bl:auth:session';
const VIEW_AS = 'tdu-bl:auth:view-as';
const NOTICE = 'tdu-bl:auth:notice';
const HOUR = 3600 * 1000;
const SESSION_TTL = 12 * HOUR; // phiên thường: đến khi đóng thẻ, tối đa 12 giờ
const REMEMBER_TTL = 7 * 24 * HOUR; // "Ghi nhớ đăng nhập trên máy này"
const MAX_FAILS = 5;
const LOCK_MS = 30 * 1000;

let deployed = [];
let deployedAt = '';
let deployedError = null;

// Trên máy quản trị, ngoài tệp đã đăng còn có thể có (localStorage):
//   auth:accounts  – danh sách đã sửa trên máy này (dùng thay tệp đã đăng)
//   auth:base      – bản gốc lúc bắt đầu sửa (để gộp 3 chiều khi đăng lên GitHub)
//   auth:dirty     – còn thay đổi chưa đăng
//   auth:published – lần đăng gần nhất { at, fileUpdatedAt, commitUrl }
const LOCAL_KEYS = ['auth:accounts', 'auth:base', 'auth:dirty', 'auth:published'];

export async function initAuth(url = 'data/accounts.json') {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    deployed = parseAccounts(text);
    deployedAt = JSON.parse(text).updatedAt ?? '';
    deployedError = null;
  } catch (e) {
    deployed = [];
    deployedError = `Không tải được danh sách tài khoản (data/accounts.json): ${e.message}`;
  }
  // Trang đã đăng xong bản mà máy này đưa lên GitHub và không còn sửa gì thêm → dùng lại tệp đã đăng.
  const pub = load('auth:published', null);
  if (pub && !load('auth:dirty', false) && deployedAt && deployedAt >= pub.fileUpdatedAt) LOCAL_KEYS.forEach(remove);
}

// ---- Danh sách tài khoản: tệp đã đăng, hoặc bản đã sửa trên máy này -----------------------------

export function accounts() {
  const local = load('auth:accounts', null);
  return Array.isArray(local) && local.length ? local : deployed;
}

export const accountsStatus = () => ({
  local: Array.isArray(load('auth:accounts', null)),
  dirty: load('auth:dirty', false),
  published: load('auth:published', null),
  connection: connection(),
  error: deployedError,
  deployedCount: deployed.length,
});

function commit(list) {
  if (!load('auth:base', null)) save('auth:base', deployed);
  save('auth:accounts', list);
  save('auth:dirty', true);
  restamp();
}

export function discardLocalAccounts() {
  LOCAL_KEYS.forEach(remove);
  restamp();
}

// Đăng danh sách lên GitHub: đọc tệp hiện có, gộp 3 chiều, ghi; tệp vừa bị đổi (409) thì đọc lại và thử tiếp.
// Các lần đăng chạy nối tiếp nhau để không giẫm lên nhau.
let queue = Promise.resolve();
export function publishAccounts() {
  const run = queue.then(async () => {
    const conn = connection();
    if (!conn) throw new GitHubError(0, 'Chưa kết nối GitHub');
    if (!load('auth:dirty', false)) return load('auth:published', null);
    for (let attempt = 0; ; attempt++) {
      const remote = await readAccountsFile(conn);
      const merged = mergeAccounts(load('auth:base', deployed), accounts(), parseAccounts(remote.text));
      const text = serializeAccounts(merged);
      try {
        const res = await writeAccountsFile(conn, { text, sha: remote.sha, message: `Cập nhật tài khoản đăng nhập (M0 › Tài khoản, ${merged.length} tài khoản)` });
        const pub = { at: new Date().toISOString(), fileUpdatedAt: JSON.parse(text).updatedAt, commitUrl: res.commitUrl };
        save('auth:accounts', merged);
        save('auth:base', merged);
        save('auth:dirty', false);
        save('auth:published', pub);
        restamp();
        accessLog.add({ userId: 'github', userName: 'GitHub (tự đăng)', role: '', action: 'Đăng danh sách tài khoản lên GitHub', target: `${conn.repo} › ${conn.branch}`, count: merged.length });
        return pub;
      } catch (e) {
        if (!(e instanceof GitHubError && e.status === 409 && attempt < 2)) throw e;
      }
    }
  });
  queue = run.catch(() => {});
  return run;
}

export const exportAccounts = () => serializeAccounts(accounts());

const scopeOf = (input) => {
  const f = SCOPE_FIELD[input.role];
  return f ? { [f]: input[f] } : {};
};

export async function createAccount(input, actor) {
  const rec = {
    username: normalizeUsername(input.username),
    name: input.name.trim(),
    unit: input.unit?.trim() || undefined,
    role: input.role,
    ...scopeOf(input),
    ...(await hashPassword(input.password)),
    createdAt: new Date().toISOString(),
    createdBy: actor.username,
  };
  commit([...accounts(), rec]);
  logAccount('Tạo tài khoản', rec);
  return publicAccount(rec);
}

export function updateAccount(username, input) {
  const list = accounts().map((a) => {
    if (a.username !== username) return a;
    const { facultyId, lecturerId, advisorId, ...rest } = a;
    return { ...rest, name: input.name.trim(), unit: input.unit?.trim() || undefined, role: input.role, ...scopeOf(input), updatedAt: new Date().toISOString() };
  });
  commit(list);
  logAccount('Sửa tài khoản', findAccount(list, username));
}

export async function setPassword(username, password) {
  const h = await hashPassword(password);
  const list = accounts().map((a) => (a.username === username ? { ...a, ...h, updatedAt: new Date().toISOString() } : a));
  commit(list);
  logAccount('Đặt lại mật khẩu', findAccount(list, username));
}

export function setDisabled(username, disabled) {
  const list = accounts().map((a) => (a.username === username ? { ...a, disabled, updatedAt: new Date().toISOString() } : a));
  commit(list);
  logAccount(disabled ? 'Khóa tài khoản' : 'Mở khóa tài khoản', findAccount(list, username));
}

export function deleteAccount(username) {
  const acc = findAccount(accounts(), username);
  commit(accounts().filter((a) => a.username !== username));
  logAccount('Xóa tài khoản', acc);
}

function logAccount(action, acc) {
  accessLog.add({ userId: `acc:${acc?.username}`, userName: acc?.name ?? '', role: ROLES[acc?.role]?.label ?? '', action, target: `Tài khoản ${acc?.username}` });
}

// ---- Phiên đăng nhập -------------------------------------------------------------------------

function storages() {
  const out = [];
  for (const name of ['sessionStorage', 'localStorage']) {
    try {
      out.push(window[name]);
    } catch {
      /* trình duyệt chặn bộ nhớ */
    }
  }
  return out;
}

function readSession() {
  for (const st of storages()) {
    try {
      const s = JSON.parse(st.getItem(SESSION) || 'null');
      if (s) return { s, st };
    } catch {
      /* bỏ qua */
    }
  }
  return null;
}

function clearSession() {
  for (const st of storages()) {
    try {
      st.removeItem(SESSION);
      st.removeItem(VIEW_AS);
    } catch {
      /* bỏ qua */
    }
  }
}

// Phiên gắn với một đoạn mã băm: đặt lại mật khẩu, khóa hay xóa tài khoản là phiên cũ hết hiệu lực.
const stampOf = (acc) => acc.hash.slice(0, 16);

export function currentAccount() {
  const found = readSession();
  if (!found || !(found.s.exp > Date.now())) return null;
  const acc = findAccount(accounts(), found.s.username);
  if (!acc || acc.disabled || stampOf(acc) !== found.s.stamp) return null;
  return publicAccount(acc);
}

// Quản trị sửa danh sách trên chính máy đang đăng nhập (kể cả tự đổi mật khẩu) thì vẫn giữ phiên đang dùng.
function restamp() {
  const found = readSession();
  if (!found) return;
  const acc = findAccount(accounts(), found.s.username);
  if (acc && !acc.disabled) {
    try {
      found.st.setItem(SESSION, JSON.stringify({ ...found.s, stamp: stampOf(acc) }));
    } catch {
      /* bỏ qua */
    }
  }
}

export async function login(username, password, { remember = false } = {}) {
  const fails = load('auth:fails', { count: 0, until: 0 });
  if (fails.until > Date.now()) return { ok: false, code: 'locked', wait: Math.ceil((fails.until - Date.now()) / 1000) };
  const name = normalizeUsername(username);
  const acc = findAccount(accounts(), name);
  if (!acc || !(await verifyPassword(password, acc))) {
    const count = fails.count + 1;
    const locked = count >= MAX_FAILS;
    save('auth:fails', locked ? { count: 0, until: Date.now() + LOCK_MS } : { count, until: 0 });
    accessLog.add({ userId: `acc:${name}`, userName: name || '(trống)', role: acc ? ROLES[acc.role]?.label : '', action: 'Đăng nhập không thành công', target: 'Hệ thống', account: name });
    return locked ? { ok: false, code: 'locked', wait: LOCK_MS / 1000 } : { ok: false, code: 'invalid', left: MAX_FAILS - count };
  }
  if (acc.disabled) return { ok: false, code: 'disabled' };
  save('auth:fails', { count: 0, until: 0 });
  clearSession();
  const now = Date.now();
  const session = { username: acc.username, stamp: stampOf(acc), at: new Date(now).toISOString(), exp: now + (remember ? REMEMBER_TTL : SESSION_TTL) };
  try {
    (remember ? window.localStorage : window.sessionStorage).setItem(SESSION, JSON.stringify(session));
  } catch {
    return { ok: false, code: 'storage' };
  }
  accessLog.add({ userId: `acc:${acc.username}`, userName: acc.name, role: ROLES[acc.role].label, action: 'Đăng nhập', target: 'Hệ thống', account: acc.username });
  return { ok: true, account: publicAccount(acc) };
}

export function logout(notice = '') {
  const acc = currentAccount();
  if (acc) accessLog.add({ userId: `acc:${acc.username}`, userName: acc.name, role: ROLES[acc.role].label, action: 'Đăng xuất', target: 'Hệ thống', account: acc.username });
  clearSession();
  setNotice(notice);
}

// Lời nhắn hiện trên màn hình đăng nhập sau khi tải lại trang (đã đăng xuất, phiên hết hạn…).
export function setNotice(text) {
  try {
    if (text) window.sessionStorage.setItem(NOTICE, text);
    else window.sessionStorage.removeItem(NOTICE);
  } catch {
    /* bỏ qua */
  }
}

export function takeNotice() {
  try {
    const t = window.sessionStorage.getItem(NOTICE);
    window.sessionStorage.removeItem(NOTICE);
    return t || '';
  } catch {
    return '';
  }
}

// ---- Quản trị "xem thử dưới vai trò" (chỉ tài khoản quản trị) -------------------------------------

export function viewAsId() {
  try {
    return window.sessionStorage.getItem(VIEW_AS);
  } catch {
    return null;
  }
}

export function setViewAs(id) {
  try {
    if (id) window.sessionStorage.setItem(VIEW_AS, id);
    else window.sessionStorage.removeItem(VIEW_AS);
  } catch {
    /* bỏ qua */
  }
}
