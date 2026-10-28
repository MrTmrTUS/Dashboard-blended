// Đăng nhập: băm mật khẩu PBKDF2-SHA256, quy tắc tài khoản, tệp data/accounts.json, vai trò khách chỉ xem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { accountUser, canSee, classInScope, isReadOnly, studentRowInScope } from '../web/js/access.js';
import { guardRemoval, mergeAccounts, parseAccounts, publicAccount, serializeAccounts, validateAccount } from '../web/js/core/accounts.js';
import { deriveKey, hashPassword, hmacSha256, pbkdf2Sha256, sha256, toHex, verifyPassword } from '../web/js/core/password.js';
import { detectRepo, fromBase64, toBase64 } from '../web/js/github.js';

// Tệp đang đăng có thể được quản trị đổi bất cứ lúc nào (M0 › Tài khoản) nên chỉ kiểm tra cấu trúc;
// mật khẩu mặc định kiểm tra trên bản sao lúc giao (tests/fixtures/accounts-default.json).
const liveFile = readFileSync(new URL('../web/data/accounts.json', import.meta.url), 'utf8');
const accountsFile = readFileSync(new URL('./fixtures/accounts-default.json', import.meta.url), 'utf8');

test('SHA-256, HMAC bằng JavaScript khớp node:crypto (gồm các độ dài sát biên khối 64 byte)', () => {
  assert.equal(toHex(sha256(new TextEncoder().encode('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
    const d = randomBytes(n);
    assert.equal(toHex(sha256(d)), createHash('sha256').update(d).digest('hex'), `sha256 ${n} byte`);
  }
  for (const kl of [0, 20, 64, 65, 131]) {
    const k = randomBytes(kl);
    const m = randomBytes(77);
    assert.equal(toHex(hmacSha256(k, m)), createHmac('sha256', k).update(m).digest('hex'), `hmac khóa ${kl} byte`);
  }
});

test('PBKDF2-HMAC-SHA256: vector chuẩn và đối chiếu node:crypto; bản Web Crypto cho cùng kết quả', async () => {
  const P = Buffer.from('password');
  const S = Buffer.from('salt');
  assert.equal(toHex(pbkdf2Sha256(P, S, 1)), '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
  assert.equal(toHex(pbkdf2Sha256(P, S, 2)), 'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43');
  assert.equal(toHex(pbkdf2Sha256(P, S, 4096)), 'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a');
  for (const [pl, c] of [[0, 3], [8, 77], [70, 150]]) {
    const p = randomBytes(pl);
    const s = randomBytes(16);
    assert.equal(toHex(pbkdf2Sha256(p, s, c)), pbkdf2Sync(p, s, c, 32, 'sha256').toString('hex'));
  }
  const salt = '00112233445566778899aabbccddeeff';
  const viaWebCrypto = await deriveKey('Mật-khẩu@2026', salt, 1000);
  const viaJs = toHex(pbkdf2Sha256(new TextEncoder().encode('Mật-khẩu@2026'.normalize('NFC')), Buffer.from(salt, 'hex'), 1000));
  assert.equal(viaWebCrypto, viaJs);
});

test('hashPassword → verifyPassword: đúng mật khẩu mới qua, muối khác nhau mỗi lần', async () => {
  const a = await hashPassword('abc123', 1000);
  const b = await hashPassword('abc123', 1000);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.equal(await verifyPassword('abc123', a), true);
  assert.equal(await verifyPassword('abc124', a), false);
  assert.equal(await verifyPassword('abc123', { salt: a.salt }), false);
});

test('web/data/accounts.json đang đăng: đúng định dạng, còn quản trị hoạt động, không có trường mật khẩu gốc', () => {
  const list = parseAccounts(liveFile);
  assert.ok(list.some((a) => a.role === 'admin' && !a.disabled));
  for (const a of JSON.parse(liveFile).accounts) assert.deepEqual(Object.keys(a).filter((k) => /pass|mat_khau/i.test(k)), [], a.username);
});

test('tài khoản lúc giao: admin / TDU@2026 (quản trị) và guess / 123 (khách chỉ xem), không chứa mật khẩu gốc', async () => {
  assert.ok(!accountsFile.includes('TDU@2026'));
  const list = parseAccounts(accountsFile);
  const admin = list.find((a) => a.username === 'admin');
  const guest = list.find((a) => a.username === 'guess');
  assert.equal(admin.role, 'admin');
  assert.equal(guest.role, 'viewer');
  assert.equal(await verifyPassword('TDU@2026', admin), true);
  assert.equal(await verifyPassword('tdu@2026', admin), false);
  assert.equal(await verifyPassword('123', guest), true);
  assert.equal(await verifyPassword('1234', guest), false);
  assert.deepEqual(Object.keys(publicAccount(admin)).filter((k) => ['salt', 'hash', 'iterations'].includes(k)), []);
});

test('tệp tài khoản: ghi rồi đọc lại giữ nguyên; tệp sai định dạng hoặc không còn quản trị bị từ chối', () => {
  const list = parseAccounts(accountsFile);
  assert.deepEqual(parseAccounts(serializeAccounts(list)).map(publicAccount), list.map(publicAccount));
  assert.throws(() => parseAccounts('{'), /JSON/);
  assert.throws(() => parseAccounts(JSON.stringify({ accounts: [] })), /định dạng/);
  const noAdmin = serializeAccounts(list.map((a) => ({ ...a, disabled: a.role === 'admin' })));
  assert.throws(() => parseAccounts(noAdmin), /quản trị/);
  const dup = serializeAccounts([...list, { ...list[1], username: 'ADMIN ' }]);
  assert.throws(() => parseAccounts(dup), /trùng/);
});

test('tạo, sửa tài khoản: kiểm tra tên đăng nhập, phạm vi, độ dài mật khẩu; giữ ít nhất một quản trị', () => {
  const accounts = parseAccounts(accountsFile);
  const ok = { username: 'gv.binh', name: 'ThS. Hoàng Hữu Bình', role: 'gv', lecturerId: 'GV01', password: 'abc', password2: 'abc' };
  assert.deepEqual(validateAccount(ok, { accounts }), []);
  assert.match(validateAccount({ ...ok, username: 'Bình' }, { accounts }).join(), /Tên đăng nhập/);
  assert.match(validateAccount({ ...ok, username: 'Admin' }, { accounts }).join(), /đã có/);
  assert.match(validateAccount({ ...ok, lecturerId: '' }, { accounts }).join(), /phạm vi/);
  assert.match(validateAccount({ ...ok, password2: 'abd' }, { accounts }).join(), /chưa khớp/);
  assert.match(validateAccount({ ...ok, role: 'admin', password: 'ngan', password2: 'ngan' }, { accounts }).join(), /ít nhất 8/);
  const admin = accounts.find((a) => a.username === 'admin');
  assert.match(validateAccount({ ...admin, role: 'viewer' }, { accounts, editing: admin }).join(), /ít nhất một tài khoản quản trị/);
  assert.equal(guardRemoval(accounts, 'admin', 'guess'), 'Phải còn ít nhất một tài khoản quản trị đang hoạt động');
  assert.match(guardRemoval(accounts, 'guess', 'guess', 'khóa'), /đang đăng nhập/);
  assert.equal(guardRemoval(accounts, 'guess', 'admin'), null);
});

test('vai trò khách chỉ xem: M1, M2, M4 toàn Trường; không M0, M3, không dữ liệu sinh viên; tài khoản gắn đúng phạm vi', () => {
  const ds = { faculties: [{ id: 'KT', name: 'Khoa Kinh tế' }], lecturers: [{ id: 'GV01', facultyId: 'KT' }], advisors: [] };
  const guest = accountUser({ username: 'guess', name: 'Tài khoản khách', role: 'viewer' }, ds);
  assert.deepEqual(['M1', 'M2', 'M3', 'M4', 'M0'].filter((s) => canSee(guest, s)), ['M1', 'M2', 'M4']);
  assert.equal(classInScope(guest, { facultyId: 'KT', lecturerId: 'GV09' }), true);
  assert.equal(studentRowInScope(guest, { classId: 'A' }, new Map()), false);
  assert.equal(isReadOnly(guest), true);
  const admin = accountUser({ username: 'admin', name: 'Quản trị hệ thống', role: 'admin' }, ds);
  assert.equal(isReadOnly(admin), false);
  assert.equal(canSee(admin, 'M0'), true);
  const gv = accountUser({ username: 'gv.binh', name: 'ThS. Hoàng Hữu Bình', role: 'gv', lecturerId: 'GV01' }, ds);
  assert.deepEqual([gv.lecturerId, gv.facultyId, gv.unit, gv.initials], ['GV01', 'KT', 'Khoa Kinh tế', 'HB']);
  assert.equal(classInScope(gv, { lecturerId: 'GV01' }), true);
  assert.equal(classInScope(gv, { lecturerId: 'GV02' }), false);
});

test('gộp 3 chiều khi đăng lên GitHub: giữ thay đổi của máy này và của quản trị khác', () => {
  const acc = (username, name, extra = {}) => ({ username, name, role: 'viewer', salt: '0'.repeat(32), hash: '1'.repeat(64), ...extra });
  const base = [acc('admin', 'QT', { role: 'admin' }), acc('guess', 'Khách'), acc('cu', 'Tài khoản cũ')];
  // Máy này: tạo "moi", sửa tên "guess", xóa "cu"
  const local = [base[0], acc('guess', 'Khách mời'), acc('moi', 'Mới tạo')];
  // Trên GitHub trong lúc đó: quản trị khác tạo "khac" và khóa "admin2"
  const remote = [...base, acc('khac', 'Máy khác tạo'), acc('admin2', 'QT2', { role: 'admin', disabled: true })];
  const merged = mergeAccounts(base, local, remote);
  assert.deepEqual(merged.map((a) => `${a.username}:${a.name}`), ['admin:QT', 'guess:Khách mời', 'khac:Máy khác tạo', 'admin2:QT2', 'moi:Mới tạo']);
  // Máy này không sửa gì thì lấy đúng bản trên GitHub
  assert.deepEqual(mergeAccounts(base, base, remote), remote);
  // Hai bên cùng sửa một tài khoản: bản của máy đang đăng thắng
  const both = mergeAccounts(base, [acc('admin', 'QT sửa', { role: 'admin' })], [acc('admin', 'QT khác', { role: 'admin' })]);
  assert.equal(both[0].name, 'QT sửa');
});

test('mã hóa Base64 tiếng Việt cho GitHub API và nhận repo từ địa chỉ GitHub Pages', () => {
  const text = serializeAccounts(parseAccounts(accountsFile));
  assert.equal(fromBase64(toBase64(text)), text);
  assert.equal(fromBase64('VHLGsOG7nW5nIMSQ4bqhaSBo4buNYw=='), 'Trường Đại học');
  assert.equal(toBase64('Trường Đại học'), Buffer.from('Trường Đại học').toString('base64'));
  assert.equal(detectRepo({ hostname: 'mrtmrtus.github.io', pathname: '/Dashboard-blended/web/' }), 'mrtmrtus/Dashboard-blended');
  assert.equal(detectRepo({ hostname: 'localhost', pathname: '/' }), '');
  assert.equal(detectRepo({ hostname: 'mrtmrtus.github.io', pathname: '/' }), '');
});
