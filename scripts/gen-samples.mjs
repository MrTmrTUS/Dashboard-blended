// Sinh bộ tệp CSV mẫu theo Phụ lục A từ dữ liệu mô phỏng (học kỳ mới nhất) vào web/templates/.
// Dùng: npm run samples
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsv } from '../web/js/core/csv.js';
import { IMPORT_ORDER, TEMPLATES } from '../web/js/core/importer.js';
import { CLO_IMPORT_ORDER, CLO_TEMPLATES, exportCloCsv } from '../web/js/core/clo-import.js';
import { exportCsv } from '../web/js/data/dataset-io.js';
import { buildSyntheticDataset } from '../web/js/data/synthetic.js';
import { simulateEndOfSemester } from './clo-chay-thu.mjs';

const OUT = fileURLToPath(new URL('../web/templates/', import.meta.url));
process.env.TZ = 'Asia/Ho_Chi_Minh';

const ds = buildSyntheticDataset();
const latest = ds.semesters[ds.semesters.length - 1].id;
await mkdir(OUT, { recursive: true });

for (const kind of IMPORT_ORDER) {
  const perSemester = ['danh_muc_lop', 'phieu_khao_sat', 'diem_hoc_vu'].includes(kind);
  const csv = exportCsv(ds, kind, { limitSemester: perSemester ? latest : null });
  await writeFile(`${OUT}${TEMPLATES[kind].file}`, csv);
  console.log(`${TEMPLATES[kind].file}: ${csv.split('\r\n').length - 2} dòng`);
}

// Tệp phiếu cố ý có lỗi để thử chức năng báo lỗi theo dòng.
const sample = parseCsv(exportCsv(ds, 'phieu_khao_sat', { limitSemester: latest }));
const cols = sample.header;
const rows = sample.rows.slice(0, 14).map(({ __extra, ...r }) => ({ ...r }));
rows[1].Q_C1_3 = '7';
rows[2].ma_nghien_cuu = '2021123456';
rows[3].ma_lop_hp = 'HK1-2627-XYZ999-N01';
rows[4].dot = 'GIUA';
rows[5].thoi_gian_tra_loi = '31/02/2026 08:00';
rows[6].ma_phieu = rows[0].ma_phieu;
rows[7].dong_y_lien_ket = 'có thể';
rows[8].Q_I1_2 = 'a';
rows[9].y_kien = 'Em là Nguyễn Văn Nam, SĐT 0912 345 678. Tài liệu trên LMS khó tìm.';
rows[10] = { ...rows[11], ma_phieu: `${rows[11].ma_phieu}B` };
const bad = toCsv(cols, rows);
await writeFile(`${OUT}phieu_khao_sat_loi_mau.csv`, bad);
console.log('phieu_khao_sat_loi_mau.csv: 14 dòng (có lỗi cố ý)');

// Tệp chỉ có dòng tiêu đề cho từng mẫu.
for (const kind of IMPORT_ORDER) {
  const t = TEMPLATES[kind];
  await writeFile(`${OUT}${t.file.replace('.csv', '_mau_trong.csv')}`, toCsv([...t.required, ...t.optional], []));
}
console.log('Đã ghi mẫu trống cho', IMPORT_ORDER.length, 'loại tệp');

// ---- Đánh giá theo CLO (M6): bộ quy tắc 2025 của Nguyên lý kế toán và điểm học kỳ đã kết thúc gần nhất ----
const cloSem = 'HK2-2526';
const cloClasses = ds.classes.filter((c) => c.courseId === 'ACP0371' && c.semesterId === cloSem).map((c) => c.id);
for (const kind of CLO_IMPORT_ORDER) {
  const opts = ['clo_hoc_phan', 'ma_tran_danh_gia'].includes(kind) ? { versionId: 'ACP0371@2025' } : { classIds: cloClasses };
  const csv = exportCloCsv(ds, kind, opts);
  await writeFile(`${OUT}${CLO_TEMPLATES[kind].file}`, csv);
  console.log(`${CLO_TEMPLATES[kind].file}: ${csv.split('\r\n').length - 2} dòng`);
  const t = CLO_TEMPLATES[kind];
  await writeFile(`${OUT}${t.file.replace('.csv', '_mau_trong.csv')}`, toCsv([...t.required, ...t.optional], [], { delimiter: ';' }));
}

// Tệp điểm chi tiết cố ý có lỗi (bài kiểm tra lớp N02, học kỳ hiện tại) để thử báo lỗi theo dòng ở M6.
const curClass = ds.classes.find((c) => c.courseId === 'ACP0371' && c.semesterId === latest && c.lineage.endsWith('N02'));
const otherClass = ds.classes.find((c) => c.courseId === 'ACP0371' && c.semesterId === latest && c.lineage.endsWith('N01'));
const kt = parseCsv(exportCloCsv(ds, 'diem_chi_tiet', { classIds: [curClass.id] }));
const head = ['ma_nghien_cuu', 'ma_lop_hp', 'ma_bai_danh_gia', 'lan_thi', 'ma_de', 'ma_cau', 'diem', 'trang_thai', 'ngay', 'ma_loi'];
const graded = kt.rows.filter((r) => r.ma_bai_danh_gia === 'KT' && r.lan_thi === '1' && r.trang_thai === 'da_cham');
const codes = [...new Set(graded.map((r) => r.ma_nghien_cuu))].slice(0, 10);
const rowOf = (code, item) => Object.fromEntries(head.map((h) => [h, graded.find((r) => r.ma_nghien_cuu === code && r.ma_cau === item)?.[h] ?? '']));
const outsiders = ds.outcomes.rosters[otherClass.id].filter((r) => r.st === 'active').map((r) => r.s);
const rowsBad = [];
codes.forEach((code, k) => {
  for (const item of ['TC1', 'TC2']) {
    const r = rowOf(code, item);
    if (k === 1 && item === 'TC2') r.diem = '4,5'; // vượt điểm tối đa (4)
    if (k === 2) r.ma_de = 'KT3'; // sai mã đề
    if (k === 3) Object.assign(r, { lan_thi: '3', ma_de: 'KT2' }); // sai lần thi (tối đa 2 lần)
    if (k === 4) r.ma_nghien_cuu = outsiders[0]; // sinh viên không thuộc lớp
    if (k === 5) r.ma_nghien_cuu = '2021123456'; // mã sinh viên thật
    if (k === 7 && item === 'TC2') r.diem = ''; // thiếu điểm
    if (k === 8 && item === 'TC1') r.diem = '7,5đ'; // không phải số
    if (k === 9) r.ma_lop_hp = curClass.id.replace('N02', 'N09'); // lớp không có trong danh mục
    rowsBad.push(r);
  }
  if (k === 0) rowsBad.push(rowOf(code, 'TC1')); // trùng dòng
  if (k === 6) rowsBad.push({ ...rowOf(code, 'TC1'), ma_cau: 'TC5', ma_loi: '' }); // câu không có trong ma trận
});
rowsBad.push({ ...rowOf(codes[0], 'TC2'), ma_nghien_cuu: outsiders[1], lan_thi: '2', ma_de: 'KT2' }); // lần 2 khi chưa có lần 1
await writeFile(`${OUT}diem_chi_tiet_loi_mau.csv`, toCsv(head, rowsBad, { delimiter: ';' }));
console.log(`diem_chi_tiet_loi_mau.csv: ${rowsBad.length} dòng (có lỗi cố ý)`);

// ---- Bộ dữ liệu chạy thử cuối kỳ HK1 2026–2027 cho M6 (scripts/clo-chay-thu.mjs) ----
const RUN_DIR = `${OUT}chay-thu-clo/`;
await mkdir(RUN_DIR, { recursive: true });
for (const f of simulateEndOfSemester(ds).files) await writeFile(`${RUN_DIR}${f.name}`, f.text);
console.log('chay-thu-clo/: 6 tệp chạy thử cuối kỳ HK1 2026–2027');
