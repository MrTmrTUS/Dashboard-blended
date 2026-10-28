// Tham số từ nghiên cứu (mục 4.6) – giá trị MINH HỌA cho MVP, thay bằng kết quả phân tích R
// qua M0 › Nhập dữ liệu (tham_so_nghien_cuu.csv).
//   trong_so: trọng số tương đối wₖ (Nội dung 2)
//   bat_bien: cờ bất biến đo lường (Nội dung 1); nhân tố đạt bất biến được coi là "phổ quát" ◆
//   chenh_lech_tiem_an: chênh lệch trung bình tiềm ẩn TDU – trường đối sánh, kèm KTC 95% (Nội dung 1)

export const RESEARCH_PARAMS = {
  benchmarkName: 'Trường đối sánh (ẩn danh)',
  source: 'Minh họa – chờ kết quả Nội dung 1, 2',
  weights: { CT1: 0.12, IN2: 0.17, PS1: 0.19, PS2: 0.15, CT2: 0.11, IN1: 0.16, IN3: 0.1 },
  invariance: {
    CT1: { invariant: true, level: 'Bất biến vô hướng', note: 'ΔCFI = 0,004' },
    IN2: { invariant: true, level: 'Bất biến vô hướng', note: 'ΔCFI = 0,006' },
    PS1: { invariant: true, level: 'Bất biến vô hướng', note: 'ΔCFI = 0,007' },
    PS2: { invariant: true, level: 'Bất biến vô hướng từng phần', note: 'Giải phóng hệ số chặn Q_P2_4' },
    CT2: { invariant: false, level: 'Chỉ đạt bất biến hệ số tải', note: 'ΔCFI vô hướng = 0,016 > 0,010: hai trường hiểu thang đo điều kiện triển khai khác nhau' },
    IN1: { invariant: true, level: 'Bất biến vô hướng', note: 'ΔCFI = 0,008' },
    IN3: { invariant: false, level: 'Chỉ đạt bất biến cấu hình', note: 'Cấu trúc hỗ trợ người học khác nhau giữa hai trường (ΔCFI hệ số tải = 0,021)' },
    PT1: { invariant: true, level: 'Bất biến vô hướng', note: 'ΔCFI = 0,005' },
    PT2: { invariant: false, level: 'Chỉ đạt bất biến hệ số tải', note: 'ΔCFI vô hướng = 0,013 > 0,010' },
  },
  latent: {
    CT1: { est: 0.12, lo: -0.02, hi: 0.26 },
    IN2: { est: 0.18, lo: 0.04, hi: 0.32 },
    PS1: { est: -0.05, lo: -0.19, hi: 0.09 },
    PS2: { est: 0.08, lo: -0.07, hi: 0.23 },
    IN1: { est: -0.21, lo: -0.36, hi: -0.06 },
    PT1: { est: 0.1, lo: -0.04, hi: 0.24 },
  },
};
