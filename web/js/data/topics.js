// Danh mục chủ đề ý kiến (gắn với nhân tố) dùng cho phân loại ý kiến tự do (mục 3.5, 5.5).
// keywords: từ khóa nhận diện chủ đề cho bộ phân loại của MVP (khi chưa bật mô hình ngôn ngữ).

export const TOPICS = [
  { id: 'muc_tieu', factor: 'CT1', label: 'Mục tiêu, chuẩn đầu ra chưa rõ', keywords: ['mục tiêu', 'chuẩn đầu ra', 'đề cương'] },
  { id: 'thuc_tien', factor: 'CT1', label: 'Mức gắn nội dung với thực tiễn', keywords: ['thực tế nghề', 'thực tiễn', 'lý thuyết', 'sát với thực tế'] },
  { id: 'ty_le_bl', factor: 'CT1', label: 'Tỷ lệ trực tiếp – trực tuyến', keywords: ['tỷ lệ', 'buổi trực tiếp', 'học online nhiều'] },
  { id: 'lich_hoc', factor: 'CT2', label: 'Lịch học trực tuyến hay thay đổi', keywords: ['lịch học', 'đổi lịch', 'lịch online', 'dời lịch'] },
  { id: 'huong_dan_lms', factor: 'CT2', label: 'Thiếu hướng dẫn sử dụng LMS', keywords: ['hướng dẫn dùng', 'hướng dẫn sử dụng', 'lúng túng', 'chưa biết dùng'] },
  { id: 'ke_hoach', factor: 'CT2', label: 'Kế hoạch học tập thông báo rõ', keywords: ['kế hoạch học', 'thông báo rõ', 'thông báo đầy đủ'] },
  { id: 'lms_kho_tim', factor: 'IN1', label: 'Tài liệu trên LMS khó tìm', keywords: ['khó tìm', 'lẫn lộn', 'không biết tìm', 'để lung tung'] },
  { id: 'mang', factor: 'IN1', label: 'Mạng, LMS không ổn định', keywords: ['mạng', 'wifi', 'chập chờn', 'mất kết nối', 'bị lỗi', 'văng ra'] },
  { id: 'video', factor: 'IN1', label: 'Chất lượng video bài giảng', keywords: ['video', 'âm thanh', 'nghe không rõ'] },
  { id: 'hoc_lieu', factor: 'IN1', label: 'Học liệu số đầy đủ, dễ dùng', keywords: ['học liệu', 'tài liệu đầy đủ', 'xem lại được', 'slide'] },
  { id: 'giang_de_hieu', factor: 'IN2', label: 'Giảng viên dễ hiểu, nhiệt tình', keywords: ['dễ hiểu', 'nhiệt tình', 'truyền cảm hứng', 'tận tâm', 'giảng hay'] },
  { id: 'giang_nhanh', factor: 'IN2', label: 'Giảng nhanh, khó theo kịp', keywords: ['giảng nhanh', 'nói nhanh', 'khó theo kịp', 'khó theo'] },
  { id: 'ho_tro_ky_thuat', factor: 'IN3', label: 'Hỗ trợ kỹ thuật chậm', keywords: ['hỗ trợ kỹ thuật', 'bộ phận hỗ trợ', 'phòng đào tạo trả lời', 'không ai trả lời'] },
  { id: 'tu_van', factor: 'IN3', label: 'Thiếu tư vấn phương pháp học', keywords: ['tư vấn', 'cách học', 'phương pháp tự học'] },
  { id: 'phan_hoi_cham', factor: 'PS1', label: 'Phản hồi bài tập chậm', keywords: ['trả bài', 'có điểm', 'chấm bài', 'chấm lâu', 'chưa có điểm'] },
  { id: 'tieu_chi_cham', factor: 'PS1', label: 'Tiêu chí chấm chưa rõ', keywords: ['tiêu chí', 'rubric', 'barem', 'thang điểm'] },
  { id: 'nhan_xet', factor: 'PS1', label: 'Nhận xét bài làm chi tiết', keywords: ['nhận xét', 'góp ý bài', 'sửa bài'] },
  { id: 'it_tuong_tac', factor: 'PS2', label: 'Ít tương tác khi học trực tuyến', keywords: ['tương tác', 'một chiều', 'chỉ nghe', 'đọc slide'] },
  { id: 'lam_viec_nhom', factor: 'PS2', label: 'Làm việc nhóm', keywords: ['làm nhóm', 'việc nhóm', 'bài nhóm'] },
  { id: 'thao_luan', factor: 'PS2', label: 'Thảo luận sôi nổi, cởi mở', keywords: ['thảo luận', 'sôi nổi', 'cởi mở'] },
  { id: 'ket_qua', factor: 'PT1', label: 'Tiến bộ, kết quả học tập', keywords: ['tiến bộ', 'tự tin', 'kết quả học'] },
  { id: 'khac', factor: 'khac', label: 'Khác', keywords: [] },
];

export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map((t) => [t.id, t]));

export const SENTIMENTS = {
  tich_cuc: { code: 'tich_cuc', label: 'Tích cực', icon: '＋' },
  tieu_cuc: { code: 'tieu_cuc', label: 'Tiêu cực', icon: '－' },
  trung_tinh: { code: 'trung_tinh', label: 'Trung tính', icon: '○' },
};

export const NEGATIVE_MARKERS = [
  'khó', 'chậm', 'chưa', 'không', 'ít ', 'thay đổi', 'chập chờn', 'lâu', 'lúng túng', 'mất ', 'quá nhanh',
  'nhanh quá', 'thiếu', 'lỗi', 'mong', 'nên ', 'đề nghị', 'rối', 'một chiều', 'nặng', 'mệt', 'nhàm',
  'mấy ngày', 'mới được', 'quên', 'lung tung', 'lẫn lộn', 'bị văng', 'lỡ',
];
export const POSITIVE_MARKERS = [
  'dễ hiểu', 'nhiệt tình', 'đầy đủ', 'rõ ràng', 'nhanh chóng', 'sôi nổi', 'chi tiết', 'tiến bộ', 'hay',
  'thích', 'tốt', 'hữu ích', 'cảm ơn', 'tận tâm', 'cởi mở', 'truyền cảm hứng', 'sát với', 'thuận tiện',
];
