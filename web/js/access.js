// Phân quyền theo vai trò và theo phạm vi (mục 2, 5.6).
// Mọi truy vấn dữ liệu trong api.js đều đi qua các hàm lọc ở đây – không chỉ ẩn trên giao diện.
// LƯU Ý MVP: ứng dụng tĩnh chạy hoàn toàn trên trình duyệt nên không thay được kiểm soát truy cập
// phía máy chủ; bản chính thức (Django) thực hiện cùng logic này ở tầng truy vấn của máy chủ.

export const SCREENS = {
  M1: { code: 'M1', route: 'tong-quan', label: 'Tổng quan', icon: 'overview' },
  M2: { code: 'M2', route: 'lop', label: 'Lớp học phần', icon: 'class' },
  M3: { code: 'M3', route: 'sinh-vien', label: 'Sinh viên', icon: 'students' },
  M4: { code: 'M4', route: 'doi-sanh', label: 'Đối sánh', icon: 'compare' },
  M0: { code: 'M0', route: 'quan-tri', label: 'Quản trị', icon: 'admin' },
};

export const ROLES = {
  bgh: { label: 'Ban Giám hiệu', screens: ['M1'], scope: 'Tổng hợp toàn Trường', home: 'M1', question: 'Chất lượng giảng dạy BL toàn Trường thế nào, có cải thiện không?' },
  qlcl: { label: 'Phòng Quản lý chất lượng', screens: ['M1', 'M2', 'M4', 'M0'], scope: 'Toàn Trường đến lớp; không xem sinh viên', home: 'M1', question: 'Khoa, lớp nào cần can thiệp? Cải tiến có hiệu quả không?' },
  khoa: { label: 'Lãnh đạo khoa', screens: ['M1', 'M2'], scope: 'Khoa mình', home: 'M1', question: 'Lớp nào trong khoa cần hỗ trợ, ưu tiên phương diện nào?' },
  gv: { label: 'Giảng viên', screens: ['M2', 'M3'], scope: 'Lớp mình phụ trách', home: 'M2', question: 'Lớp tôi mạnh, yếu ở đâu? Sinh viên nào cần nhắc?' },
  cvht: { label: 'Cố vấn học tập', screens: ['M3'], scope: 'Sinh viên mình phụ trách', home: 'M3', question: 'Sinh viên nào tôi phụ trách cần hỗ trợ?' },
  admin: { label: 'Nhóm nghiên cứu, quản trị', screens: ['M0', 'M1', 'M2', 'M4'], scope: 'Toàn bộ dữ liệu đã mã hóa', home: 'M0', question: 'Dữ liệu đã đúng chưa? Ngưỡng có phù hợp? Đạt TC1 – TC4 chưa?' },
};

export class AccessDenied extends Error {
  constructor(message = 'Vai trò hiện tại không có quyền xem nội dung này') {
    super(message);
    this.name = 'AccessDenied';
  }
}

const initials = (name) =>
  String(name)
    .replace(/^(PGS\.TS\.|TS\.|ThS\.|CN\.)\s*/u, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

// Tài khoản trình diễn dựng từ danh mục (tên người đều là tên mô phỏng).
export function buildUsers(ds) {
  const users = [
    { id: 'qlcl', role: 'qlcl', name: 'ThS. Nguyễn Thị Lan', unit: 'Phòng Quản lý chất lượng' },
    { id: 'bgh', role: 'bgh', name: 'PGS.TS. Hoàng Minh Đức', unit: 'Phó Hiệu trưởng' },
    ...ds.faculties.map((f) => ({ id: `khoa:${f.id}`, role: 'khoa', name: `Lãnh đạo ${f.name}`, unit: f.name, facultyId: f.id })),
    ...ds.lecturers.map((l) => ({
      id: `gv:${l.id}`,
      role: 'gv',
      name: l.name,
      unit: ds.faculties.find((f) => f.id === l.facultyId)?.name ?? '',
      lecturerId: l.id,
      facultyId: l.facultyId,
    })),
    ...ds.advisors.map((a) => ({
      id: `cvht:${a.id}`,
      role: 'cvht',
      name: a.name,
      unit: `Cố vấn – ${ds.faculties.find((f) => f.id === a.facultyId)?.name ?? ''}`,
      advisorId: a.id,
      facultyId: a.facultyId,
    })),
    { id: 'admin', role: 'admin', name: 'Nhóm nghiên cứu Nội dung 3', unit: 'Quản trị hệ thống' },
  ];
  const fixed = { admin: 'NC', bgh: 'BGH', qlcl: 'QL' };
  return users.map((u) => ({ ...u, roleLabel: ROLES[u.role].label, initials: fixed[u.id] || initials(u.name) || 'TDU' }));
}

export function canSee(user, screen) {
  return Boolean(user && ROLES[user.role]?.screens.includes(screen));
}

export function homeScreen(user) {
  return ROLES[user.role]?.home ?? 'M1';
}

// Lớp học phần trong phạm vi của người dùng.
export function classInScope(user, cls) {
  if (!user || !cls) return false;
  switch (user.role) {
    case 'bgh':
    case 'qlcl':
    case 'admin':
      return true;
    case 'khoa':
      return cls.facultyId === user.facultyId;
    case 'gv':
      return cls.lecturerId === user.lecturerId;
    default:
      return false;
  }
}

// Được mở trang chi tiết lớp (M2)?
export function canOpenClass(user, cls) {
  return canSee(user, 'M2') && classInScope(user, cls);
}

// Dữ liệu cấp sinh viên: chỉ giảng viên phụ trách và cố vấn học tập.
export function studentRowInScope(user, row, classById) {
  if (user.role === 'gv') return classById.get(row.classId)?.lecturerId === user.lecturerId;
  if (user.role === 'cvht') return row.advisorId === user.advisorId;
  return false;
}

// Bộ lọc bị khóa theo phạm vi (ví dụ lãnh đạo khoa chỉ xem khoa mình).
export function lockedFilters(user) {
  if (user.role === 'khoa') return { facultyId: user.facultyId };
  return {};
}

// Đợt chưa công bố chỉ Phòng QLCL và quản trị xem được (mục 6.1).
export function canSeeWave(user, wave) {
  if (wave.status === 'published') return true;
  return user.role === 'qlcl' || user.role === 'admin';
}
