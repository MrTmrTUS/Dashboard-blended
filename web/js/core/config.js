// Tham số cấu hình mặc định – giá trị khởi đầu theo mục 4 và mục 10 (đề xuất, chốt ở công việc 3.1).
export const DEFAULT_CONFIG = Object.freeze({
  // Phiếu hợp lệ (mục 4.2)
  attentionChecks: [
    { col: 'kiem_tra_chu_y_1', expect: 4, text: 'Để kiểm tra sự chú ý, hãy chọn mức 4 (Đồng ý) cho câu này' },
    { col: 'kiem_tra_chu_y_2', expect: 2, text: 'Để kiểm tra sự chú ý, hãy chọn mức 2 (Không đồng ý) cho câu này' },
  ],
  minAnsweredShare: 0.8,
  minFactorShare: 2 / 3,
  // Phân loại 3 mức
  levelLow: 2.5,
  levelHigh: 3.5,
  // Mục tiêu cải tiến T và ngưỡng cảnh báo cấp lớp (mục 4.4, 4.5)
  target: 4.0,
  yellowDim: 3.5,
  redDim: 2.5,
  zYellow: 2,
  zRed: 3,
  declineEnabled: true,
  declineWaves: 3,
  declineMin: 0.3,
  declineMetric: 'IDX',
  ptAlerts: false,
  // Ngưỡng ẩn số liệu (mục 4.6)
  nMin: 10,
  // Trọng số phương diện: 'nd2' = lấy từ Nội dung 2; 'equal' = wₖ = 1/7
  weightsSource: 'nd2',
  // Cảnh báo cấp sinh viên (mục 4.5)
  stuEngYellow: 3.0,
  stuEngRed: 2.5,
  stuProcYellow: 5.5,
  stuProcRed: 4.0,
  lowOutcome: 5.5,
  // Biểu đồ kiểm soát khi có từ 6 đợt
  controlChartMinWaves: 6,
  // Mô-đun AI (mục 5.5)
  aiEngine: 'template',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5:7b-instruct',
  aiMaxRetries: 2,
  expertReview: false,
});

// Mô tả các tham số để dựng màn hình Cấu hình (M0) và ghi lịch sử thay đổi.
export const CONFIG_FIELDS = [
  { key: 'target', group: 'Mục tiêu và ngưỡng cấp lớp', label: 'Mục tiêu cải tiến T', type: 'number', step: 0.1, min: 1, max: 5, ref: '4.4', note: 'Dùng cho Pareto có trọng số; khác ngưỡng cảnh báo 3,5' },
  { key: 'yellowDim', group: 'Mục tiêu và ngưỡng cấp lớp', label: 'Ngưỡng 🟡 Theo dõi (phương diện dưới)', type: 'number', step: 0.1, min: 1, max: 5, ref: '4.5' },
  { key: 'redDim', group: 'Mục tiêu và ngưỡng cấp lớp', label: 'Ngưỡng 🔴 Can thiệp (phương diện dưới)', type: 'number', step: 0.1, min: 1, max: 5, ref: '4.5' },
  { key: 'zYellow', group: 'Mục tiêu và ngưỡng cấp lớp', label: 'Giới hạn phễu cho 🟡 (z)', type: 'number', step: 0.5, min: 1, max: 4, ref: '4.3' },
  { key: 'zRed', group: 'Mục tiêu và ngưỡng cấp lớp', label: 'Giới hạn phễu cho 🔴 (z)', type: 'number', step: 0.5, min: 1, max: 5, ref: '4.3' },
  { key: 'declineEnabled', group: 'Mục tiêu và ngưỡng cấp lớp', label: 'Bật quy tắc "giảm liên tiếp"', type: 'boolean', ref: '4.5' },
  { key: 'declineWaves', group: 'Mục tiêu và ngưỡng cấp lớp', label: 'Số đợt giảm liên tiếp', type: 'number', step: 1, min: 2, max: 6, ref: '4.5' },
  { key: 'declineMin', group: 'Mục tiêu và ngưỡng cấp lớp', label: 'Tổng mức giảm tối thiểu (đề xuất MVP)', type: 'number', step: 0.05, min: 0, max: 2, ref: '4.5', note: 'Chặn báo động giả do dao động ngẫu nhiên; hiệu chỉnh bằng Monte Carlo (TC2)' },
  { key: 'ptAlerts', group: 'Mục tiêu và ngưỡng cấp lớp', label: 'Tính cảnh báo cho PT1, PT2', type: 'boolean', ref: '4.5', note: 'Đề xuất: không, chỉ hiển thị như kết quả' },
  { key: 'nMin', group: 'Ẩn số liệu và trọng số', label: 'Ngưỡng ẩn: số phiếu hợp lệ tối thiểu', type: 'number', step: 1, min: 3, max: 50, ref: '4.6' },
  { key: 'weightsSource', group: 'Ẩn số liệu và trọng số', label: 'Trọng số phương diện wₖ', type: 'select', options: [['nd2', 'Theo Nội dung 2 (tham số nghiên cứu)'], ['equal', 'Như nhau (1/7)']], ref: '4.4' },
  { key: 'minAnsweredShare', group: 'Phiếu hợp lệ', label: 'Tỷ lệ chỉ báo tối thiểu phải trả lời', type: 'number', step: 0.05, min: 0.5, max: 1, ref: '4.2' },
  { key: 'stuEngYellow', group: 'Ngưỡng cấp sinh viên', label: 'Gắn kết dưới (🟡)', type: 'number', step: 0.1, min: 1, max: 5, ref: '4.5' },
  { key: 'stuEngRed', group: 'Ngưỡng cấp sinh viên', label: 'Gắn kết dưới (🔴)', type: 'number', step: 0.1, min: 1, max: 5, ref: '4.5' },
  { key: 'stuProcYellow', group: 'Ngưỡng cấp sinh viên', label: 'Điểm quá trình dưới (🟡)', type: 'number', step: 0.5, min: 0, max: 10, ref: '4.5' },
  { key: 'stuProcRed', group: 'Ngưỡng cấp sinh viên', label: 'Điểm quá trình dưới (🔴)', type: 'number', step: 0.5, min: 0, max: 10, ref: '4.5' },
  { key: 'lowOutcome', group: 'Ngưỡng cấp sinh viên', label: 'Kết quả thấp: điểm học phần dưới', type: 'number', step: 0.5, min: 0, max: 10, ref: '4.5' },
];

export function mergeConfig(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (k in DEFAULT_CONFIG) out[k] = v;
  }
  return out;
}
