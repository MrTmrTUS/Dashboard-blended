// Danh mục mẫu cho dữ liệu mô phỏng: khoa, học phần, lớp học phần, học kỳ, đợt.
// Tên khoa, học phần mang tính minh họa; người dùng thay bằng danh mục thật qua M0 › Nhập dữ liệu.

export const FACULTIES = [
  { id: 'KT', name: 'Khoa Kinh tế', short: 'Kinh tế', block: 'Kinh tế – Quản lý' },
  { id: 'CNTT', name: 'Khoa Công nghệ thông tin', short: 'CNTT', block: 'Kỹ thuật – Công nghệ' },
  { id: 'KTCN', name: 'Khoa Kỹ thuật – Công nghệ', short: 'Kỹ thuật – CN', block: 'Kỹ thuật – Công nghệ' },
  { id: 'NN', name: 'Khoa Ngoại ngữ', short: 'Ngoại ngữ', block: 'Xã hội – Nhân văn' },
  { id: 'LUAT', name: 'Khoa Luật', short: 'Luật', block: 'Xã hội – Nhân văn' },
  { id: 'YD', name: 'Khoa Y Dược', short: 'Y Dược', block: 'Sức khỏe' },
];

// sections: số nhóm lớp mở mỗi học kỳ.
export const COURSES = [
  { id: 'MKT101', name: 'Marketing căn bản', facultyId: 'KT', sections: 3 },
  { id: 'KTE102', name: 'Kinh tế vi mô', facultyId: 'KT', sections: 2 },
  { id: 'KTO201', name: 'Nguyên lý kế toán', facultyId: 'KT', sections: 2 },
  { id: 'INF201', name: 'Lập trình cơ bản', facultyId: 'CNTT', sections: 2 },
  { id: 'INF202', name: 'Cơ sở dữ liệu', facultyId: 'CNTT', sections: 2 },
  { id: 'INF301', name: 'Mạng máy tính', facultyId: 'CNTT', sections: 1 },
  { id: 'KTC101', name: 'Vẽ kỹ thuật', facultyId: 'KTCN', sections: 2 },
  { id: 'KTC201', name: 'Điện tử cơ bản', facultyId: 'KTCN', sections: 1 },
  { id: 'KTC202', name: 'Cơ học ứng dụng', facultyId: 'KTCN', sections: 2 },
  { id: 'ENG101', name: 'Tiếng Anh 1', facultyId: 'NN', sections: 3 },
  { id: 'ENG202', name: 'Nghe – Nói 2', facultyId: 'NN', sections: 2 },
  { id: 'ENG301', name: 'Biên dịch 1', facultyId: 'NN', sections: 1 },
  { id: 'LAW101', name: 'Pháp luật đại cương', facultyId: 'LUAT', sections: 2 },
  { id: 'LAW201', name: 'Luật Dân sự 1', facultyId: 'LUAT', sections: 2 },
  { id: 'LAW202', name: 'Luật Hành chính', facultyId: 'LUAT', sections: 1 },
  { id: 'PHA201', name: 'Hóa dược 1', facultyId: 'YD', sections: 2 },
  { id: 'MED101', name: 'Giải phẫu', facultyId: 'YD', sections: 2 },
  { id: 'NUR101', name: 'Điều dưỡng cơ bản', facultyId: 'YD', sections: 1 },
];

// Học kỳ: mã ngắn dùng trong mã lớp học phần, ví dụ HK1-2627-MKT101-N03.
export const SEMESTERS = [
  { id: 'HK2-2425', label: 'HK2 2024–2025', waves: { GK: '2025-03-21', CK: '2025-05-16' } },
  { id: 'HK1-2526', label: 'HK1 2025–2026', waves: { GK: '2025-10-17', CK: '2025-12-12' } },
  { id: 'HK2-2526', label: 'HK2 2025–2026', waves: { GK: '2026-03-20', CK: '2026-05-15' } },
  { id: 'HK1-2627', label: 'HK1 2026–2027', waves: { GK: '2026-10-16' } },
];

const SURNAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương', 'Lý', 'Đinh', 'Mai', 'Trịnh', 'Phan'];
const MIDDLE = ['Thị', 'Văn', 'Minh', 'Thu', 'Thanh', 'Đức', 'Ngọc', 'Hữu', 'Quang', 'Thùy', 'Hải', 'Kim'];
const GIVEN = ['Hà', 'Lan', 'Minh', 'Anh', 'Hương', 'Tuấn', 'Hùng', 'Trang', 'Hạnh', 'Nam', 'Linh', 'Dũng', 'Thảo', 'Quân', 'Huyền', 'Long', 'Phương', 'Sơn', 'Yến', 'Khánh', 'Vy', 'Bình', 'Giang', 'Hiếu'];
const TITLES = ['ThS.', 'ThS.', 'ThS.', 'TS.', 'TS.', 'PGS.TS.'];

export function personName(rng, { title = true } = {}) {
  const name = `${rng.pick(SURNAMES)} ${rng.pick(MIDDLE)} ${rng.pick(GIVEN)}`;
  return title ? `${rng.pick(TITLES)} ${name}` : name;
}
