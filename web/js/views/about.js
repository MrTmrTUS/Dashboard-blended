// Giới thiệu và hướng dẫn nhanh cho người phỏng vấn, người dùng thử (công việc 3.1, 3.4).
import { ROLES, SCREENS } from '../access.js';
import { state } from '../store.js';
import { pageHead, plainCard } from '../ui/components.js';
import { html } from '../ui/dom.js';

const PRINCIPLES = [
  ['Một màn hình – một câu hỏi – một nhóm người dùng', 'Không dồn mọi biểu đồ vào một trang; mỗi màn hình mở đầu bằng câu hỏi nó trả lời.'],
  ['3 giây – 30 giây – 3 phút', 'Thẻ trạng thái cho biết có vấn đề không; biểu đồ cho biết vấn đề ở đâu; trang chi tiết cho biết làm gì.'],
  ['Màu chỉ dành cho trạng thái', 'Xanh = đạt, vàng = theo dõi, đỏ = can thiệp, xám = chưa đủ dữ liệu; luôn kèm biểu tượng ✔ ⚠ ✖ và chữ.'],
  ['Con số nào cũng có ngữ cảnh', 'Luôn ghi số phiếu n, mục tiêu, trung bình Trường, so với đợt trước.'],
  ['Chỉ so sánh khi hợp lệ', 'So lớp bằng biểu đồ phễu; đối sánh liên trường chỉ trên nhân tố đạt bất biến; ẩn lớp dưới 10 phiếu.'],
  ['AI chỉ diễn giải số đã tính', 'Mọi văn bản AI có mã nguồn [F…], qua bộ kiểm số; người dùng là người quyết định.'],
  ['Riêng tư theo mặc định', 'Dữ liệu không ra khỏi Trường; dùng mã nghiên cứu; ai cần mới được thấy; mọi lượt xem dữ liệu sinh viên được ghi.'],
];

const TOUR = [
  { role: 'qlcl', text: 'Phòng QLCL: M1 → bấm lớp đỏ “Cơ sở dữ liệu – N02” → xem lý do → M0 › Kiểm chứng.', href: '#/tong-quan' },
  { role: 'khoa:KTCN', text: 'Lãnh đạo Khoa Kỹ thuật – CN: bản đồ nhiệt cho thấy IN1 (học liệu số, hạ tầng) yếu chung cả khoa.', href: '#/tong-quan' },
  { role: 'gv:GV01', text: 'Giảng viên lớp “Marketing căn bản – N03”: xem hồ sơ 7 phương diện, áp dụng gợi ý của trợ lý AI vào kế hoạch cải tiến.', href: '#/lop/HK1-2627-MKT101-N03' },
  { role: 'cvht:CV01', text: 'Cố vấn học tập: danh sách sinh viên cần hỗ trợ (chế độ mô phỏng), đánh dấu “đã liên hệ”.', href: '#/sinh-vien' },
  { role: 'admin', text: 'Nhóm nghiên cứu: nhập tệp CSV mẫu có lỗi để thấy báo lỗi theo dòng; chạy Monte Carlo (TC2).', href: '#/quan-tri/nhap' },
];

export const AboutView = {
  screen: null,
  layout: 'wide',
  title: () => 'Giới thiệu và hướng dẫn',
  render() {
    const users = new Map(state.users.map((u) => [u.id, u]));
    return html`${pageHead({ title: 'Giới thiệu và hướng dẫn', question: 'MVP dashboard chất lượng giảng dạy Blended Learning – Nội dung 3 của đề tài' })}
      <div class="grid grid--2 grid--start">
        ${plainCard({
          title: 'Bản MVP này là gì?',
          body: html`<p>Bản thiết kế chạy được của dashboard theo tài liệu <i>Ý tưởng và kiến trúc v1.0</i>, dùng cho công việc 3.1 (phỏng vấn 6 – 8 người dùng, chốt yêu cầu) và thử nghiệm khả dụng (TC3).</p>
            <ul class="small" style="padding-left:18px">
              <li>Chạy hoàn toàn trên trình duyệt (GitHub Pages hoặc máy chủ tĩnh của Trường), không gửi dữ liệu ra ngoài.</li>
              <li>Bộ tính toán theo mục 4 (điểm phiếu, phễu, Pareto có trọng số, cảnh báo, logistic) có kiểm thử đơn vị với đáp số tính tay.</li>
              <li>Dữ liệu <b>mô phỏng</b> có kịch bản; nhập dữ liệu thật qua M0 › Nhập dữ liệu theo mẫu Phụ lục A.</li>
              <li>Trợ lý AI mặc định sinh văn bản bằng mẫu câu từ dữ kiện; có thể nối Ollama nội bộ ở M0 › Mô-đun AI.</li>
              <li>Bản chính thức theo kiến trúc mục 5: Django + PostgreSQL + HTMX + ECharts + Ollama, đóng gói Docker Compose.</li>
            </ul>`,
        })}
        ${plainCard({
          title: 'Thử nhanh theo vai trò',
          sub: 'Đổi vai trò ở góc phải trên cùng, rồi mở đường dẫn',
          body: html`<ol class="small" style="padding-left:18px;margin:0">${TOUR.map((t) => html`<li style="margin-bottom:8px"><b>${users.get(t.role)?.name ?? t.role}</b> – ${t.text} <a href="${t.href}">Mở</a></li>`)}</ol>`,
        })}
      </div>
      <div class="mt-16">${plainCard({
        title: 'Người dùng và màn hình',
        body: html`<div class="table-wrap"><table class="table"><thead><tr><th>Vai trò</th><th>Câu hỏi chính</th><th>Màn hình</th><th>Phạm vi dữ liệu</th></tr></thead>
          <tbody>${Object.values(ROLES).map((r) => html`<tr><td><b>${r.label}</b></td><td>${r.question}</td><td>${r.screens.map((s) => `${s} ${SCREENS[s].label}`).join(', ')}</td><td>${r.scope}</td></tr>`)}</tbody></table></div>`,
      })}</div>
      <div class="mt-16">${plainCard({
        title: 'Bảy nguyên tắc thiết kế',
        body: html`<ol class="small" style="padding-left:18px;margin:0">${PRINCIPLES.map(([t, d]) => html`<li style="margin-bottom:6px"><b>${t}.</b> ${d}</li>`)}</ol>`,
      })}</div>
      <div class="mt-16">${plainCard({
        title: 'Tiếp cận và thao tác',
        body: html`<ul class="small" style="padding-left:18px;margin:0">
          <li>Mọi biểu đồ có nút <b>Xem dạng bảng</b> và khung <b>Cách đọc</b>; trạng thái luôn có biểu tượng và chữ.</li>
          <li>Dùng được bằng bàn phím: <kbd>Tab</kbd> để di chuyển, <kbd>Enter</kbd> để mở; liên kết “Bỏ qua đến nội dung chính” ở đầu trang.</li>
          <li>Trên điện thoại (dưới 768 px): thẻ xếp một cột, biểu đồ phễu và bản đồ nhiệt chuyển thành danh sách, điều hướng ở cạnh dưới.</li>
          <li>Số theo kiểu Việt Nam (3,72 · 1.234), ngày dd/mm/yyyy.</li>
        </ul>`,
      })}</div>`;
  },
};
