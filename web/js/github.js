// Kết nối GitHub để quản trị đăng danh sách tài khoản lên repo ngay từ M0 (không cần máy chủ):
// trang ghi tệp web/data/accounts.json qua GitHub REST API bằng token của quản trị, GitHub Pages
// đăng lại trang, các máy khác đăng nhập được sau khoảng 1 – 2 phút.
// Token (fine-grained, chỉ quyền Contents của đúng repo này) chỉ lưu trong trình duyệt của quản trị.
import { load, remove, save } from './store.js';

const API = 'https://api.github.com';
export const ACCOUNTS_PATH = 'web/data/accounts.json';

// https://<chủ>.github.io/<repo>/… → { owner, repo }; chạy trên máy khác thì để quản trị tự nhập.
export function detectRepo(loc = globalThis.location) {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(loc?.hostname ?? '');
  const repo = (loc?.pathname ?? '').split('/').filter(Boolean)[0];
  return m && repo ? `${m[1]}/${repo}` : '';
}

export const connection = () => load('auth:github', null);
export const disconnect = () => remove('auth:github');

// Base64 cho nội dung UTF-8 (tiếng Việt) theo đúng định dạng API contents.
export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

const MESSAGES = {
  401: 'Token không hợp lệ hoặc đã hết hạn – tạo token mới',
  403: 'Token chưa có quyền ghi vào repo (cần Contents: Read and write) hoặc đã vượt giới hạn gọi API',
  404: 'Không thấy repo hoặc tệp – kiểm tra tên repo và phạm vi của token (Only select repositories)',
  409: 'Tệp trên GitHub vừa thay đổi',
  422: 'GitHub từ chối nội dung gửi lên',
};

async function call(path, token, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new GitHubError(0, 'Không kết nối được tới GitHub (mạng hoặc tường lửa)');
  }
  if (!res.ok) throw new GitHubError(res.status, MESSAGES[res.status] ?? `GitHub báo lỗi HTTP ${res.status}`);
  return res.json();
}

const repoPath = (full) => `/repos/${full.split('/').map(encodeURIComponent).join('/')}`;

// Kiểm tra token đọc được repo và tệp tài khoản, lấy nhánh mặc định (nhánh mà trang được đăng từ đó).
export async function connect(repo, token) {
  const full = String(repo).trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/+$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(full)) throw new GitHubError(0, 'Tên repo cần dạng chủ/tên-repo, ví dụ MrTmrTUS/Dashboard-blended');
  if (!/^(github_pat_|ghp_)\w{20,}$/.test(String(token).trim())) throw new GitHubError(0, 'Token GitHub bắt đầu bằng github_pat_ (fine-grained) hoặc ghp_');
  const t = String(token).trim();
  const info = await call(repoPath(full), t);
  await call(`${repoPath(full)}/contents/${ACCOUNTS_PATH}?ref=${encodeURIComponent(info.default_branch)}`, t);
  const conn = { repo: info.full_name, branch: info.default_branch, token: t, connectedAt: new Date().toISOString() };
  save('auth:github', conn);
  return conn;
}

export async function readAccountsFile(conn) {
  const data = await call(`${repoPath(conn.repo)}/contents/${ACCOUNTS_PATH}?ref=${encodeURIComponent(conn.branch)}`, conn.token);
  return { sha: data.sha, text: fromBase64(data.content) };
}

export async function writeAccountsFile(conn, { text, sha, message }) {
  const data = await call(`${repoPath(conn.repo)}/contents/${ACCOUNTS_PATH}`, conn.token, {
    method: 'PUT',
    body: { message, content: toBase64(text), sha, branch: conn.branch },
  });
  return { sha: data.content?.sha, commitUrl: data.commit?.html_url };
}
