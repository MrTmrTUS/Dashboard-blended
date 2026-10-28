# Ghi chú thiết kế bản MVP

Tài liệu này đối chiếu bản MVP với *Dashboard chất lượng giảng dạy BL – Ý tưởng và kiến trúc v1.0 (28/10/2026)*, ghi lại các quyết định đã đưa vào mã (để chốt ở công việc 3.1) và lộ trình chuyển sang kiến trúc chính thức.

## 1. Phạm vi

Bản MVP là **nguyên mẫu chạy được, hoàn toàn trên trình duyệt**, để:

- phỏng vấn 6 – 8 người dùng theo từng vai trò bằng màn hình thật thay cho bản phác thảo;
- thử bộ tính toán mục 4 trên dữ liệu đối sánh hoặc dữ liệu thí điểm (nhập CSV theo Phụ lục A);
- tổ chức thử nghiệm khả dụng (phiếu SUS tích hợp, TC3) và thử giao diện chấm AI (TC4);
- làm đặc tả sống cho các sprint 1 – 7 của bản Django.

## 2. Đối chiếu với tài liệu ý tưởng

| Mục | Nội dung | Bản MVP |
|---|---|---|
| 1 | 7 nguyên tắc thiết kế | Đã áp dụng; xem thêm trang *Giới thiệu và hướng dẫn* trong ứng dụng |
| 2 | 6 vai trò, câu hỏi, phạm vi | Tài khoản mô phỏng cho mọi vai trò; lọc phạm vi trong `api.js` |
| 3.1 | M1: KPI, phễu, bản đồ nhiệt, Pareto, ma trận ưu tiên, histogram, xu hướng/kiểm soát, chủ đề ý kiến | Đã có, thêm danh sách “lớp cần chú ý nhất” để dùng bằng bàn phím |
| 3.2 | M2: hồ sơ 7 phương diện (bullet), 5 chỉ báo thấp nhất, so với đợt trước, ý kiến, PDCA | Đã có; lớp đỏ hiện yêu cầu bắt buộc lập kế hoạch; trước – sau tự tính |
| 3.3 | M3: chế độ mô phỏng, phân tán gắn kết × điểm quá trình, danh sách nguy cơ | Đã có; thêm cột “kết quả thực tế (hồi cứu)” cho học kỳ đã có điểm học phần |
| 3.4 | M4: forest plot, chỉ nhân tố đạt bất biến | Đã có, kèm bảng kết quả kiểm định bất biến |
| 3.5 | M5: tóm tắt có mã nguồn, gợi ý từ thư viện, phân loại ý kiến, 👍/👎 | Đã có (mẫu câu hoặc Ollama). Hỏi đáp tự do: để sau đề tài |
| 3.6 | M0: nhập, cấu hình có lịch sử, danh mục, người dùng, nhật ký, thư viện biện pháp, kiểm chứng | Đã có; thêm “xem trước tác động” khi đổi ngưỡng, công bố đợt, xuất minh chứng PDCA |
| 4.1 – 4.6 | Cấu trúc đo, cách tính, phễu, Pareto, ma trận, cảnh báo, ẩn số liệu | `web/js/core/*`, có kiểm thử đáp số tính tay |
| 4.7 | Bộ tính toán theo lô | `computeMart()` trong `engine.js` |
| 5.2 | Bộ kiểm số | `factcheck.js`; thử trực tiếp ở M0 › Mô-đun AI |
| 5.5 | Dữ kiện có mã → mô hình → kiểm số → hiển thị | `ai/facts.js`, `ai/generator.js` (sinh lại tối đa 2 lần) |
| 5.6 | Riêng tư | Mã nghiên cứu, từ chối mã giống mã sinh viên thật, ẩn n < 10, xóa thông tin nhận diện, nhật ký xem dữ liệu sinh viên, thư viện đóng gói kèm, phông hệ thống |
| 5.8 | Đường dẫn chính | `#/tong-quan?ky=&dot=&khoa=`, `#/lop/<id>`, `#/lop/<id>/ke-hoach`, `#/sinh-vien?lop=`, `#/doi-sanh`, `#/quan-tri/<mục>` |
| 6.1 | Luồng dữ liệu mỗi đợt | Nhập → kiểm tra → tính theo lô → cảnh báo → AI → *chờ công bố* → Phòng QLCL công bố → thông báo |
| 8 | TC1 – TC4, kỹ thuật, tiếp cận | Trang kiểm chứng có bảng điểm TC1 – TC4; 30 kiểm thử đơn vị; axe-core không còn vi phạm WCAG 2.1 A/AA |
| 9 | Màu, chữ, số, quy ước biểu đồ, màn hình nhỏ | `assets/css/tokens.css`; số `vi-VN`; dưới 768 px phễu và bản đồ nhiệt thành danh sách |

**Chưa có trong MVP (thuộc bản chính thức):** đăng nhập LDAP/OIDC, cơ sở dữ liệu dùng chung, tính theo lô trên máy chủ, sao lưu, nhập LMS, email, ứng dụng di động riêng.

## 3. Quyết định thiết kế cần chốt ở công việc 3.1

Các mục dưới đây là giá trị hoặc cách hiểu MVP đã chọn khi tài liệu chưa nói rõ; tất cả đều đổi được trong mã hoặc ở M0 › Cấu hình.

### Tính toán

1. **Chỉ số chất lượng của một phiếu** chỉ tính khi đủ cả 7 phương diện (để giữ “trọng số như nhau”); điểm nhóm lõi sư phạm / điều kiện tổ chức cũng cần đủ phương diện của nhóm. Điểm gắn kết cần từ 2/3 số chỉ báo (8/12).
2. **Cảnh báo cấp lớp tính trên 7 phương diện:** 🟡 nếu có phương diện dưới 3,5 *hoặc* dưới giới hạn 2σ của phễu (μ, σ tính riêng cho phương diện đó); 🔴 nếu dưới 2,5, dưới 3σ, hoặc giảm liên tiếp.
3. **“Giảm liên tiếp qua 3 đợt”** được hiểu là chỉ số chất lượng của cùng *dòng lớp* (cùng học phần, nhóm lớp, giảng viên) giảm ngặt qua 3 đợt liên tiếp **và tổng mức giảm ≥ 0,3 điểm** (tham số đề xuất `declineMin`). Lý do: ba đợt độc lập giảm ngặt có xác suất 1/6, nên không có ngưỡng thì Monte Carlo cho tỷ lệ báo động giả đỏ khoảng 16 – 18%, vượt TC2. Với 0,3, tỷ lệ khoảng 4% trên dữ liệu mô phỏng. Bảng so sánh các mức có sẵn ở M0 › Kiểm chứng › TC2.
4. **Tỷ lệ phản hồi** = số phiếu hợp lệ / tổng sĩ số các lớp trong phạm vi. **Phiếu mức thấp** = tỷ lệ phiếu hợp lệ có chỉ số chất lượng < 2,5.
5. **Biểu đồ kiểm soát** dùng dạng XmR trên trung bình các đợt: CL = trung bình, UCL/LCL = CL ± 2,66 × biên độ dịch chuyển trung bình; bật khi có từ 6 đợt đủ dữ liệu.
6. **Mô hình nguy cơ:** học kỳ đã có điểm học phần dùng mô hình huấn luyện trên các học kỳ khác (tránh rò rỉ); học kỳ hiện tại dùng mô hình huấn luyện trên toàn bộ dữ liệu đã có kết quả. TC1 tính AUC bằng kiểm định chéo 10 lần phân tầng.
7. **◆ phổ quát / ○ phụ thuộc bối cảnh** trong ma trận ưu tiên được lấy từ cờ bất biến của Nội dung 1 (đạt bất biến → phổ quát).

### Dữ liệu

8. **Mã chỉ báo:** CT1→`Q_C1_*`, CT2→`Q_C2_*`, IN1→`Q_I1_*`, IN2→`Q_I2_*`, IN3→`Q_I3_*`, PS1→`Q_P1_*`, PS2→`Q_P2_*`, PT1→`Q_Pt1_*`, PT2→`Q_Pt2_*` (suy từ “Q_C1_1 … Q_Pt2_5”; cần đối chiếu mã gốc). Lời dẫn chỉ báo trong `web/js/core/constants.js` là minh họa.
9. **`ma_lop_hp` duy nhất qua các học kỳ** (ví dụ `HK1-2627-MKT101-N03`), vì `phieu_khao_sat.csv` không có cột học kỳ. Học kỳ nhận dạng `HK1-2627` hoặc `HK1 2026-2027`.
10. **Dòng lớp** (để so sánh qua đợt) = `ma_hoc_phan` + `nhom` nếu có trong danh mục, nếu không thì học phần + giảng viên.
11. **Thêm tệp `sinh_vien.csv`** (mã nghiên cứu, lớp sinh hoạt, mã cố vấn) để phân quyền cố vấn học tập ở M3 – Phụ lục A chưa có tệp này.
12. **Câu kiểm tra chú ý:** câu 1 phải chọn mức 4, câu 2 phải chọn mức 2 (cấu hình trong `DEFAULT_CONFIG.attentionChecks`).

### Giao diện và trực quan hóa

13. **Pareto dùng một trục 0 – 100%:** cột là tỷ trọng của từng phương diện trong tổng khoảng cách có trọng số, đường là tỷ trọng cộng dồn, mốc 80%. Cùng thông tin với “bar + line trục phụ” nhưng tránh biểu đồ hai trục (dễ tạo tương quan giả); giá trị gₖ vẫn có trong chú giải và bảng.
14. **Trục điểm thu hẹp** (có ghi chú “trục thu hẹp”) dùng cho phễu như tài liệu, và **thêm cho xu hướng/biểu đồ kiểm soát và ma trận ưu tiên**, vì trên thang 1 – 5 các giới hạn kiểm soát gần như trùng nhau. Bullet chart, histogram, phân tán sinh viên giữ thang đầy đủ.
15. **Bản đồ nhiệt, hồ sơ 7 phương diện, chủ đề ý kiến dựng bằng HTML** (thay vì `heatmap`/`bar` của ECharts): đọc được bằng trình đọc màn hình, dùng được bằng bàn phím, tự xuống dòng trên điện thoại. Các biểu đồ còn lại dùng ECharts (SVG).
16. **Trạng thái trên biểu đồ phân tán có thêm hình dạng** (● đạt, ▲ theo dõi, ◆ can thiệp) và lớp bắt sự kiện 26 px quanh mỗi điểm.
17. **Màu chữ liên kết dùng `--blue-dark` (#2F6BB3, 5,4:1)** thay vì `--blue` (#518ECF, 3,4:1 – không đạt 4,5:1 cho chữ nhỏ); `--blue` giữ cho đường xu hướng. Màu vàng `--warn` (#E0A100) dưới 3:1 trên nền trắng nên luôn đi kèm biểu tượng, chữ và bảng.
18. **Nhóm nghiên cứu, quản trị** xem thêm M1, M2, M4 (ngoài M0) để kiểm tra dữ liệu; không xem M3.

## 4. Dữ liệu mô phỏng

`web/js/data/synthetic.js` sinh 4 học kỳ (HK2 2024–2025 → HK1 2026–2027, 7 đợt), 6 khoa thuộc 4 khối ngành, 18 học phần, 33 lớp mỗi học kỳ, 900 sinh viên (mã nghiên cứu), khoảng 5.800 phiếu (≈ 7% không hợp lệ đủ 3 kiểu), ý kiến tự do (≈ 4% chứa thông tin nhận diện để thử bộ xóa), điểm quá trình và điểm học phần (học kỳ hiện tại chưa có điểm học phần).

Kịch bản ở đợt mới nhất (Giữa kỳ HK1 2026–2027), được giữ ổn định bằng kiểm thử `tests/synthetic.test.mjs`:

| Lớp | Tình huống |
|---|---|
| Marketing căn bản – N03 | 🟡 THEO DÕI (IN1 < 3,5, dưới 2σ), PS1 giảm so với đợt trước, ý kiến “tài liệu trên LMS khó tìm” – đúng ví dụ ở mục 3.2 |
| Cơ sở dữ liệu – N02 | 🔴 CAN THIỆP (PS1 < 2,5), chưa có kế hoạch cải tiến |
| Luật Dân sự 1 – N01 | 🔴 CAN THIỆP do chỉ số giảm liên tiếp qua 3 đợt |
| Khoa Kỹ thuật – Công nghệ | IN1 yếu chung cả khoa (một hàng vàng trên bản đồ nhiệt), có kế hoạch cấp khoa đang thực hiện |
| Mạng máy tính – N01, Biên dịch 1 – N01 | Dưới 10 phiếu hợp lệ – “Chưa đủ dữ liệu” |
| Nguyên lý kế toán – N01 | Kế hoạch PDCA đã hoàn thành ở HK2 2025–2026, PS2 cải thiện ở đợt sau |

Kết quả hiệu chỉnh: AUC kiểm định chéo ≈ 0,82 (TC1 đạt); báo động giả đỏ ≈ 4% với `declineMin = 0,3` (TC2 đạt); chỉ số toàn Trường tăng dần 3,72 → 3,84 và điểm cuối vượt UCL trên biểu đồ kiểm soát.

## 5. Từ MVP lên bản chính thức (mục 5.7)

| MVP | Bản Django |
|---|---|
| `web/js/core/scoring.js`, `engine.js`, `funnel.js`, `priority.js`, `alerts.js` | `app/tinh_toan/` (pandas, numpy) – chuyển nguyên công thức; dùng lại bộ kiểm thử trong `tests/` làm đáp số |
| `web/js/core/logistic.js`, `montecarlo.js` | `app/tinh_toan/` (scikit-learn), `app/kiem_chung/` |
| `web/js/core/importer.js`, `data/dataset-io.js` | `app/du_lieu/` – cùng thông báo lỗi theo dòng |
| `web/js/api.js` + `access.js` | View Django + truy vấn ORM lọc theo vai trò và phạm vi ở máy chủ; ghi `NHAT_KY` trong cơ sở dữ liệu |
| `web/js/store.js` (localStorage/IndexedDB) | Bảng PostgreSQL: `KE_HOACH_CAI_TIEN`, `THAM_SO` (có lịch sử), `AI_KET_QUA`, `SUS_PHIEU`, nhật ký |
| `web/js/ai/*` | `app/tro_ly_ai/` – sinh sẵn trong nền sau mỗi lần tính, lưu kết quả và cờ kiểm số |
| `web/js/ui/charts.js` | Dùng lại gần như nguyên các hàm tạo cấu hình ECharts; dữ liệu lấy từ `/api/bieu-do/<loai>/` |
| `web/js/views/*` | Template Django + HTMX theo cùng bố cục, màu, thành phần |

## 6. Kiểm thử đã chạy

- `npm test`: 30 kiểm thử (điểm phiếu và 3 điều kiện hợp lệ, ngưỡng 2/3, chỉ số và nhóm, μ/σ/z có đáp số tính tay, giới hạn phễu, Pareto, 4 vùng ma trận, quy tắc cảnh báo lớp và sinh viên, giảm liên tiếp, logistic và kiểm định chéo, Monte Carlo, CSV, kiểm tra tệp nhập, bộ kiểm số, xóa thông tin nhận diện, phân loại ý kiến, tái lập dữ liệu mô phỏng).
- Kịch bản trình duyệt (Playwright): đổi vai trò, chặn truy cập ngoài phạm vi, lập kế hoạch từ gợi ý AI, phản hồi 👍, nhật ký khi xem M3, nhập tệp lỗi mẫu, nhập bộ dữ liệu mới → công bố đợt, khôi phục dữ liệu mô phỏng, đổi cấu hình có lịch sử, thư viện biện pháp (thêm → duyệt), chấm TC4, Monte Carlo, phiếu SUS, “Xem dạng bảng”.
- axe-core (WCAG 2.1 A/AA) trên 13 màn hình ở cả 1440 px và 390 px: không còn vi phạm.
- Thời gian đến khi biểu đồ M1 hiển thị: khoảng 0,9 giây trên máy tính thông thường (đã gồm sinh dữ liệu mô phỏng và tính toàn bộ chỉ số trên trình duyệt).

## 7. Gợi ý dùng MVP trong buổi phỏng vấn người dùng (3.1)

1. Cho người dùng chọn đúng vai trò của mình, đọc câu hỏi chính của màn hình, hỏi: “Trong 3 giây, anh/chị thấy có vấn đề không? Ở đâu?”
2. Giao 3 tác vụ của TC3 (tìm lớp đỏ, đọc lý do, lập kế hoạch) và ghi lại chỗ người dùng lúng túng.
3. Hỏi về các mục ở phần 3 (ngưỡng, cách hiểu “giảm liên tiếp”, trục thu hẹp, nội dung thông báo), rồi cập nhật tài liệu lên v2.
4. Kết thúc bằng phiếu SUS trong ứng dụng.
