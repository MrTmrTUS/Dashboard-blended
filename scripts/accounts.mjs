// Quản lý web/data/accounts.json từ dòng lệnh – dùng khi chưa vào được M0 (ví dụ quên mật khẩu quản trị).
//   npm run account -- list
//   npm run account -- set-password <tên-đăng-nhập> [vai-trò] ["Họ tên"]   (tạo mới nếu chưa có)
// Mật khẩu nhập ẩn từ bàn phím, hoặc truyền qua stdin: printf 'mật-khẩu' | npm run account -- set-password admin
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ROLES } from '../web/js/access.js';
import { findAccount, minPasswordLength, normalizeUsername, parseAccounts, serializeAccounts, USERNAME_RE } from '../web/js/core/accounts.js';
import { hashPassword } from '../web/js/core/password.js';

const FILE = fileURLToPath(new URL('../web/data/accounts.json', import.meta.url));
const [cmd, user, role, name] = process.argv.slice(2);

async function readAccounts() {
  try {
    return parseAccounts(await readFile(FILE, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

function askPassword(question) {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (c) => (data += c));
      stdin.on('end', () => resolve(data.replace(/\r?\n$/, '')));
    });
  }
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve) => {
    let pw = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(pw);
        }
        if (ch === '\u0003') process.exit(130);
        pw = ch === '\u007f' || ch === '\b' ? pw.slice(0, -1) : pw + ch;
      }
    };
    stdin.on('data', onData);
  });
}

const list = await readAccounts();

if (cmd === 'list') {
  for (const a of list) console.log(`${a.username.padEnd(20)} ${a.role.padEnd(7)} ${a.disabled ? 'đã khóa ' : '        '} ${a.name}`);
} else if (cmd === 'set-password' && user) {
  const username = normalizeUsername(user);
  if (!USERNAME_RE.test(username)) throw new Error('Tên đăng nhập: 3 – 32 ký tự a-z, 0-9, dấu chấm, gạch dưới, gạch ngang');
  const existing = findAccount(list, username);
  const r = existing?.role ?? role ?? 'viewer';
  if (!ROLES[r]) throw new Error(`Vai trò “${r}” không hợp lệ: ${Object.keys(ROLES).join(', ')}`);
  if (!existing && ['khoa', 'gv', 'cvht'].includes(r)) throw new Error('Vai trò có phạm vi (khoa, gv, cvht) hãy tạo ở M0 › Tài khoản');
  const password = await askPassword(`Mật khẩu mới cho ${username}: `);
  if (password.length < minPasswordLength(r)) throw new Error(`Mật khẩu cần ít nhất ${minPasswordLength(r)} ký tự`);
  const now = new Date().toISOString();
  const rec = { ...(await hashPassword(password)) };
  const next = existing
    ? list.map((a) => (a.username === username ? { ...a, ...rec, disabled: false, updatedAt: now } : a))
    : [...list, { username, name: name || username, role: r, ...rec, createdAt: now }];
  await writeFile(FILE, serializeAccounts(next));
  console.log(`${existing ? 'Đã đặt lại mật khẩu' : 'Đã tạo tài khoản'} ${username} (${ROLES[r].label}) trong web/data/accounts.json – commit và push để áp dụng.`);
} else {
  console.log('Dùng: npm run account -- list | set-password <tên-đăng-nhập> [vai-trò] ["Họ tên"]');
  process.exitCode = 1;
}
