// Quy tắc tài khoản đăng nhập: kiểm tra dữ liệu nhập, giữ ít nhất một quản trị đang hoạt động,
// đọc/ghi tệp data/accounts.json. Thuần logic – không đụng tới trình duyệt.
import { ROLES } from '../access.js';

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
export const normalizeUsername = (s) => String(s ?? '').trim().toLowerCase();

// Vai trò cần gắn phạm vi: trường lưu mã phạm vi trên tài khoản.
export const SCOPE_FIELD = { khoa: 'facultyId', gv: 'lecturerId', cvht: 'advisorId' };

export const minPasswordLength = (role) => (role === 'admin' ? 8 : 3);

export function findAccount(accounts, username) {
  const u = normalizeUsername(username);
  return accounts.find((a) => a.username === u) || null;
}

export function validateAccount(input, { accounts, editing = null, needPassword = !editing } = {}) {
  const errs = [];
  const username = normalizeUsername(input.username);
  if (!editing) {
    if (!USERNAME_RE.test(username)) errs.push('Tên đăng nhập: 3 – 32 ký tự gồm chữ thường không dấu, số, dấu chấm, gạch dưới, gạch ngang');
    else if (findAccount(accounts, username)) errs.push(`Tên đăng nhập “${username}” đã có`);
  }
  if (!String(input.name ?? '').trim()) errs.push('Cần nhập họ tên hiển thị');
  if (!ROLES[input.role]) errs.push('Vai trò không hợp lệ');
  const scope = SCOPE_FIELD[input.role];
  if (scope && !input[scope]) errs.push('Cần chọn phạm vi cho vai trò này');
  if (needPassword) errs.push(...validatePassword(input.password, input.password2, input.role));
  if (editing && editing.role === 'admin' && input.role !== 'admin' && !editing.disabled && activeAdmins(accounts).length <= 1) {
    errs.push('Phải còn ít nhất một tài khoản quản trị đang hoạt động');
  }
  return errs;
}

export function validatePassword(password, confirm, role) {
  const errs = [];
  const min = minPasswordLength(role);
  if (String(password ?? '').length < min) errs.push(`Mật khẩu cần ít nhất ${min} ký tự${role === 'admin' ? ' với tài khoản quản trị' : ''}`);
  if (password !== confirm) errs.push('Hai lần nhập mật khẩu chưa khớp');
  return errs;
}

export const activeAdmins = (accounts) => accounts.filter((a) => a.role === 'admin' && !a.disabled);

// Khóa hoặc xóa tài khoản: không tự khóa/xóa mình, không làm mất quản trị cuối cùng.
export function guardRemoval(accounts, username, actorUsername, action = 'xóa') {
  const acc = findAccount(accounts, username);
  if (!acc) return 'Không tìm thấy tài khoản';
  if (acc.username === actorUsername) return `Không thể ${action} tài khoản đang đăng nhập`;
  if (acc.role === 'admin' && !acc.disabled && activeAdmins(accounts).length <= 1) return 'Phải còn ít nhất một tài khoản quản trị đang hoạt động';
  return null;
}

// Thông tin tài khoản không kèm muối, mã băm.
export function publicAccount(a) {
  if (!a) return null;
  const { salt, hash, iterations, ...rest } = a;
  return rest;
}

// ---- Tệp data/accounts.json ------------------------------------------------------------------

const FIELDS = ['username', 'name', 'unit', 'role', 'facultyId', 'lecturerId', 'advisorId', 'disabled', 'salt', 'hash', 'iterations', 'createdAt', 'createdBy', 'updatedAt'];

export function serializeAccounts(accounts, { now = new Date() } = {}) {
  const clean = accounts.map((a) => Object.fromEntries(FIELDS.filter((k) => a[k] !== undefined && a[k] !== null && a[k] !== '' && a[k] !== false).map((k) => [k, a[k]])));
  return `${JSON.stringify(
    {
      format: 'tdu-bl-accounts',
      version: 1,
      updatedAt: now.toISOString(),
      note: 'Danh sách tài khoản đăng nhập. Mật khẩu lưu dạng băm PBKDF2-SHA256 có muối, không lưu mật khẩu gốc. Tạo, sửa tài khoản ở M0 › Tài khoản rồi tải tệp này lên web/data/accounts.json.',
      accounts: clean,
    },
    null,
    2,
  )}\n`;
}

export function parseAccounts(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Tệp tài khoản không phải JSON hợp lệ');
  }
  if (data?.format !== 'tdu-bl-accounts' || !Array.isArray(data.accounts)) throw new Error('Không đúng định dạng tệp tài khoản (format: tdu-bl-accounts)');
  const seen = new Set();
  const list = data.accounts.map((a, i) => {
    const username = normalizeUsername(a.username);
    if (!USERNAME_RE.test(username)) throw new Error(`Tài khoản thứ ${i + 1}: tên đăng nhập không hợp lệ`);
    if (seen.has(username)) throw new Error(`Tên đăng nhập “${username}” bị trùng`);
    seen.add(username);
    if (!ROLES[a.role]) throw new Error(`Tài khoản ${username}: vai trò “${a.role}” không hợp lệ`);
    if (!/^[0-9a-f]{32,}$/i.test(a.salt ?? '') || !/^[0-9a-f]{64}$/i.test(a.hash ?? '')) throw new Error(`Tài khoản ${username}: thiếu muối hoặc mã băm mật khẩu`);
    return { ...a, username, disabled: Boolean(a.disabled), iterations: Number(a.iterations) || undefined };
  });
  if (!activeAdmins(list).length) throw new Error('Tệp cần ít nhất một tài khoản quản trị đang hoạt động');
  return list;
}
