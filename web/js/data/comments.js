// Mẫu câu ý kiến cho dữ liệu mô phỏng. Mỗi mẫu có nhãn "chuẩn" (nhân tố, sắc thái, chủ đề)
// để thử nghiệm giao diện chấm AI (TC4). Một số mẫu cố ý trộn hai ý để phân loại không dễ.

export const COMMENT_TEMPLATES = [
  // CT1
  { topic: 'muc_tieu', s: 'tieu_cuc', text: 'Mục tiêu của học phần chưa được giải thích rõ ngay từ buổi đầu.' },
  { topic: 'muc_tieu', s: 'tieu_cuc', text: 'Em mong thầy cô nói rõ chuẩn đầu ra từng chương để biết cần đạt gì.' },
  { topic: 'thuc_tien', s: 'tieu_cuc', text: 'Nội dung còn nặng lý thuyết, ít liên hệ thực tế nghề nghiệp.' },
  { topic: 'thuc_tien', s: 'tich_cuc', text: 'Nội dung học phần sát với thực tế nghề, em thấy rất hữu ích.' },
  { topic: 'ty_le_bl', s: 'tieu_cuc', text: 'Học online nhiều quá, nên có thêm buổi trực tiếp để thực hành.' },
  // CT2
  { topic: 'lich_hoc', s: 'tieu_cuc', text: 'Lịch học online hay thay đổi đột xuất, nhiều bạn không kịp sắp xếp.' },
  { topic: 'lich_hoc', s: 'tieu_cuc', text: 'Đổi lịch học trực tuyến sát giờ nên em bị lỡ buổi.' },
  { topic: 'huong_dan_lms', s: 'tieu_cuc', text: 'Em chưa được hướng dẫn dùng LMS nên lúc đầu rất lúng túng.' },
  { topic: 'ke_hoach', s: 'tich_cuc', text: 'Kế hoạch học tập được thông báo rõ ràng ngay từ đầu kỳ.' },
  // IN1
  { topic: 'lms_kho_tim', s: 'tieu_cuc', text: 'Tài liệu trên LMS khó tìm, để lẫn lộn giữa các tuần.' },
  { topic: 'lms_kho_tim', s: 'tieu_cuc', text: 'Bài giảng và bài tập để lung tung, em không biết tìm ở mục nào.' },
  { topic: 'lms_kho_tim', s: 'tieu_cuc', text: 'Mong thầy cô sắp xếp tài liệu theo tuần vì hiện rất khó tìm.' },
  { topic: 'mang', s: 'tieu_cuc', text: 'Mạng ở trường hay chập chờn khi học trực tuyến.' },
  { topic: 'mang', s: 'tieu_cuc', text: 'LMS hay bị lỗi khi nộp bài, nhiều lần bị văng ra.' },
  { topic: 'video', s: 'tieu_cuc', text: 'Video bài giảng nghe không rõ tiếng, nên có phụ đề.' },
  { topic: 'hoc_lieu', s: 'tich_cuc', text: 'Học liệu số đầy đủ, xem lại được trên điện thoại rất tiện.' },
  // IN2
  { topic: 'giang_de_hieu', s: 'tich_cuc', text: 'Thầy giảng dễ hiểu, có nhiều ví dụ minh họa.' },
  { topic: 'giang_de_hieu', s: 'tich_cuc', text: 'Cô rất nhiệt tình và truyền cảm hứng cho cả lớp.' },
  { topic: 'giang_de_hieu', s: 'tich_cuc', text: 'Giảng viên tận tâm, giải đáp thắc mắc rất kỹ.' },
  { topic: 'giang_nhanh', s: 'tieu_cuc', text: 'Giảng viên nói nhanh, phần khó em không theo kịp.' },
  // IN3
  { topic: 'ho_tro_ky_thuat', s: 'tieu_cuc', text: 'Gửi câu hỏi cho bộ phận hỗ trợ kỹ thuật mấy ngày mới được trả lời.' },
  { topic: 'ho_tro_ky_thuat', s: 'tieu_cuc', text: 'Quên mật khẩu LMS mà không ai trả lời để hỗ trợ.' },
  { topic: 'tu_van', s: 'tieu_cuc', text: 'Em mong được tư vấn cách học trực tuyến cho hiệu quả hơn.' },
  // PS1
  { topic: 'phan_hoi_cham', s: 'tieu_cuc', text: 'Bài tập nộp trên LMS rất lâu mới có điểm.' },
  { topic: 'phan_hoi_cham', s: 'tieu_cuc', text: 'Thầy trả bài chậm nên em không biết mình sai ở đâu để sửa.' },
  { topic: 'phan_hoi_cham', s: 'tieu_cuc', text: 'Đã gần cuối kỳ mà các bài trực tuyến vẫn chưa có điểm.' },
  { topic: 'tieu_chi_cham', s: 'tieu_cuc', text: 'Tiêu chí chấm bài tập nhóm chưa rõ ràng.' },
  { topic: 'tieu_chi_cham', s: 'tieu_cuc', text: 'Nên công bố thang điểm trước khi giao bài.' },
  { topic: 'nhan_xet', s: 'tich_cuc', text: 'Thầy nhận xét bài làm chi tiết, giúp em tiến bộ nhiều.' },
  // PS2
  { topic: 'it_tuong_tac', s: 'tieu_cuc', text: 'Buổi học trực tuyến chủ yếu đọc slide, rất ít tương tác.' },
  { topic: 'it_tuong_tac', s: 'tieu_cuc', text: 'Học một chiều, chỉ nghe giảng nên dễ mất tập trung.' },
  { topic: 'lam_viec_nhom', s: 'tieu_cuc', text: 'Làm nhóm trực tuyến khó phối hợp, có bạn không tham gia.' },
  { topic: 'thao_luan', s: 'tich_cuc', text: 'Thảo luận trên lớp sôi nổi, em học được nhiều từ các bạn.' },
  { topic: 'thao_luan', s: 'tich_cuc', text: 'Không khí lớp cởi mở, em mạnh dạn đặt câu hỏi hơn.' },
  // PT1
  { topic: 'ket_qua', s: 'tich_cuc', text: 'Sau học phần em tự tin hơn khi làm bài tập thực hành.' },
  // Câu trộn hai ý (nhãn chuẩn là ý chính – vế sau)
  { topic: 'phan_hoi_cham', s: 'tieu_cuc', text: 'Thầy giảng dễ hiểu nhưng trả bài chậm quá.' },
  { topic: 'lms_kho_tim', s: 'tieu_cuc', text: 'Cô nhiệt tình, chỉ có điều tài liệu trên LMS khó tìm.' },
  { topic: 'it_tuong_tac', s: 'tieu_cuc', text: 'Học liệu đầy đủ nhưng buổi online ít tương tác.' },
  // Khác
  { topic: 'khac', s: 'tieu_cuc', text: 'Mong nhà trường mở rộng chỗ để xe cho sinh viên.' },
  { topic: 'khac', s: 'trung_tinh', text: 'Em không có ý kiến gì thêm.' },
];

// Mẫu thêm thông tin nhận diện để thử bộ xóa thông tin cá nhân.
export const PII_WRAPPERS = [
  (t, name, phone) => `Em là ${name}, SĐT ${phone}. ${t}`,
  (t, name, phone) => `${t} Có gì thầy liên hệ em qua ${phone} nhé.`,
  (t, name) => `${t} Thầy ${name} có thể xem lại giúp em.`,
  (t, name, phone, studentId) => `${t} (MSSV ${studentId})`,
];
