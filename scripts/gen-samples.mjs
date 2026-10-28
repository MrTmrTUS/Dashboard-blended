// Sinh bộ tệp CSV mẫu theo Phụ lục A từ dữ liệu mô phỏng (học kỳ mới nhất) vào web/templates/.
// Dùng: npm run samples
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsv } from '../web/js/core/csv.js';
import { IMPORT_ORDER, TEMPLATES } from '../web/js/core/importer.js';
import { exportCsv } from '../web/js/data/dataset-io.js';
import { buildSyntheticDataset } from '../web/js/data/synthetic.js';

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
