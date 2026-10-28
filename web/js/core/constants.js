// Cấu trúc đo của bộ tiêu chí (mục 4.1) và các hằng số dùng chung.
// Mã chỉ báo giữ dạng Q_<tiền tố>_<số thứ tự> như Phụ lục A (Q_C1_1 … Q_Pt2_5).
// LƯU Ý: lời dẫn chỉ báo dưới đây là bản minh họa cho MVP,
// cần thay bằng lời dẫn chính thức của bộ tiêu chí trước khi dùng thật.

export const GROUPS = {
  PED: { code: 'PED', name: 'Lõi sư phạm cấp học phần', short: 'Lõi sư phạm' },
  ORG: { code: 'ORG', name: 'Điều kiện tổ chức triển khai', short: 'Điều kiện tổ chức' },
  KQ: { code: 'KQ', name: 'Kết quả học tập cảm nhận', short: 'Kết quả cảm nhận' },
  ENG: { code: 'ENG', name: 'Gắn kết học tập', short: 'Gắn kết' },
};

export const FACTORS = [
  {
    code: 'CT1', group: 'PED', prefix: 'C1', dimension: true,
    name: 'Thiết kế học phần phù hợp chuẩn chương trình và nhu cầu thực tiễn',
    short: 'Thiết kế học phần',
    items: [
      'Mục tiêu và chuẩn đầu ra của học phần được công bố rõ ràng ngay từ đầu',
      'Nội dung học phần phù hợp với chuẩn đầu ra của chương trình đào tạo',
      'Nội dung học phần cập nhật, gắn với yêu cầu thực tiễn nghề nghiệp',
      'Tỷ lệ học trực tiếp – trực tuyến hợp lý với nội dung học phần',
    ],
  },
  {
    code: 'IN2', group: 'PED', prefix: 'I2', dimension: true,
    name: 'Năng lực giảng dạy của giảng viên',
    short: 'Năng lực giảng dạy',
    items: [
      'Giảng viên có kiến thức chuyên môn vững vàng',
      'Giảng viên trình bày rõ ràng, dễ hiểu',
      'Giảng viên sử dụng thành thạo công nghệ trong giảng dạy',
      'Giảng viên liên hệ nội dung bài học với thực tiễn',
      'Giảng viên nhiệt tình, tạo động lực học tập',
    ],
  },
  {
    code: 'PS1', group: 'PED', prefix: 'P1', dimension: true,
    name: 'Đánh giá, phản hồi và quản lý lớp học',
    short: 'Đánh giá, phản hồi',
    items: [
      'Tiêu chí đánh giá được công bố rõ ràng từ đầu học phần',
      'Hình thức đánh giá phù hợp với chuẩn đầu ra',
      'Bài tập trực tuyến được chấm và trả kết quả đúng hạn',
      'Phản hồi của giảng viên về bài làm giúp tôi tiến bộ',
      'Việc đánh giá công bằng, khách quan',
      'Giảng viên theo dõi tiến độ học trực tuyến của sinh viên',
      'Giảng viên quản lý tốt lớp học trực tuyến và trực tiếp',
      'Giảng viên nhắc nhở kịp thời khi tôi chậm tiến độ',
    ],
  },
  {
    code: 'PS2', group: 'PED', prefix: 'P2', dimension: true,
    name: 'Thực hành giảng dạy, tương tác và hợp tác',
    short: 'Tương tác, hợp tác',
    items: [
      'Giảng viên sử dụng đa dạng phương pháp dạy học tích cực',
      'Hoạt động trực tuyến và trực tiếp bổ trợ cho nhau',
      'Tôi có nhiều cơ hội trao đổi với giảng viên',
      'Tôi có nhiều cơ hội làm việc nhóm với các bạn',
      'Giảng viên khuyến khích sinh viên đặt câu hỏi, thảo luận',
      'Hoạt động thảo luận trực tuyến được tổ chức hiệu quả',
      'Bài tập, dự án gắn với tình huống thực tế',
      'Giảng viên tạo không khí lớp học cởi mở, tôn trọng',
    ],
  },
  {
    code: 'CT2', group: 'ORG', prefix: 'C2', dimension: true,
    name: 'Bảo đảm điều kiện tiếp cận và triển khai BL',
    short: 'Điều kiện triển khai BL',
    items: [
      'Kế hoạch học trực tiếp và trực tuyến được thông báo đầy đủ, đúng hạn',
      'Tôi được hướng dẫn sử dụng hệ thống quản lý học tập (LMS) trước khi học',
      'Lịch học trực tuyến ổn định, ít thay đổi đột xuất',
      'Tôi dễ dàng truy cập lớp học trực tuyến từ thiết bị cá nhân',
      'Quy định về học tập và đánh giá trong môi trường kết hợp rõ ràng',
      'Các buổi học trực tuyến và trực tiếp được kết nối liền mạch',
      'Thời lượng học trực tuyến phù hợp với khối lượng học tập',
      'Thông tin học phần được cập nhật kịp thời trên LMS',
      'Tôi được hỗ trợ khi gặp sự cố trong quá trình học trực tuyến',
      'Phòng học trực tiếp đáp ứng yêu cầu hoạt động kết hợp',
    ],
  },
  {
    code: 'IN1', group: 'ORG', prefix: 'I1', dimension: true,
    name: 'Học liệu số và hạ tầng công nghệ',
    short: 'Học liệu số, hạ tầng',
    items: [
      'Học liệu số của học phần đầy đủ, đáp ứng yêu cầu học tập',
      'Học liệu số được sắp xếp khoa học, dễ tìm',
      'Học liệu số được cập nhật thường xuyên',
      'Video bài giảng có chất lượng hình ảnh, âm thanh tốt',
      'Đường truyền mạng của Trường ổn định khi học trực tuyến',
      'LMS hoạt động ổn định, ít lỗi',
      'Giao diện LMS thân thiện, dễ sử dụng',
      'Thư viện số đáp ứng nhu cầu tra cứu tài liệu',
      'Công cụ tương tác trực tuyến (diễn đàn, khảo sát nhanh, phòng nhóm) dễ dùng',
      'Học liệu số truy cập tốt trên điện thoại',
    ],
  },
  {
    code: 'IN3', group: 'ORG', prefix: 'I3', dimension: true,
    name: 'Hỗ trợ người học',
    short: 'Hỗ trợ người học',
    items: [
      'Tôi nhận được hỗ trợ kịp thời từ bộ phận hỗ trợ kỹ thuật',
      'Tôi được tư vấn phương pháp học tập trong môi trường kết hợp',
      'Giảng viên, cố vấn sẵn sàng giải đáp thắc mắc ngoài giờ học',
      'Các kênh hỗ trợ người học được thông báo rõ ràng',
    ],
  },
  {
    code: 'PT1', group: 'KQ', prefix: 'Pt1', dimension: false,
    name: 'Hiệu quả học tập và duy trì học tập',
    short: 'Hiệu quả, duy trì học tập',
    items: [
      'Tôi đạt được chuẩn đầu ra của học phần',
      'Tôi hiểu sâu hơn kiến thức nhờ học kết hợp',
      'Tôi chủ động sắp xếp thời gian học tập',
      'Tôi duy trì việc học đều đặn suốt học phần',
      'Tôi hài lòng với kết quả học tập của mình',
      'Học kết hợp giúp tôi tiết kiệm thời gian, công sức',
      'Tôi muốn tiếp tục học các học phần theo hình thức kết hợp',
      'Tôi tự tin vận dụng kiến thức của học phần',
    ],
  },
  {
    code: 'PT2', group: 'KQ', prefix: 'Pt2', dimension: false,
    name: 'Phát triển năng lực và lan tỏa giá trị',
    short: 'Phát triển năng lực',
    items: [
      'Kỹ năng tự học của tôi được cải thiện',
      'Kỹ năng số của tôi được nâng cao',
      'Kỹ năng hợp tác, giao tiếp của tôi được nâng cao',
      'Tôi sẽ giới thiệu hình thức học kết hợp cho người khác',
      'Học phần giúp tôi hình thành thái độ học tập suốt đời',
    ],
  },
];

export const ENGAGEMENT = [
  {
    code: 'EB', name: 'Gắn kết hành vi',
    items: [
      'Tôi tham gia đầy đủ các buổi học trực tiếp và trực tuyến',
      'Tôi hoàn thành bài tập trực tuyến đúng hạn',
      'Tôi xem hết học liệu trước buổi học',
      'Tôi tích cực tham gia thảo luận trên lớp và trên LMS',
    ],
  },
  {
    code: 'EE', name: 'Gắn kết cảm xúc',
    items: [
      'Tôi thấy hứng thú với học phần',
      'Tôi cảm thấy thoải mái khi học trực tuyến',
      'Tôi cảm thấy gắn bó với lớp học',
      'Tôi thấy việc học có ý nghĩa với bản thân',
    ],
  },
  {
    code: 'EC', name: 'Gắn kết nhận thức',
    items: [
      'Tôi cố gắng hiểu sâu thay vì học thuộc',
      'Tôi liên hệ kiến thức mới với những gì đã biết',
      'Tôi tự đặt mục tiêu và theo dõi tiến độ học tập',
      'Tôi tìm thêm tài liệu ngoài yêu cầu',
    ],
  },
];

// Thứ tự chuẩn của bộ tiêu chí = thứ tự cột trong tệp phiếu (Q_C1_1 … Q_Pt2_5).
export const STANDARD_ORDER = ['CT1', 'CT2', 'IN1', 'IN2', 'IN3', 'PS1', 'PS2', 'PT1', 'PT2'];
const FACTORS_STD = [...FACTORS].sort(
  (a, b) => STANDARD_ORDER.indexOf(a.code) - STANDARD_ORDER.indexOf(b.code),
);

// 7 phương diện (CT, IN, PS) theo thứ tự hiển thị: lõi sư phạm trước, điều kiện tổ chức sau.
export const DIMENSIONS = FACTORS.filter((f) => f.dimension).map((f) => f.code);
export const OUTCOMES = ['PT1', 'PT2'];
export const FACTOR_CODES = FACTORS.map((f) => f.code);
export const FACTOR_BY_CODE = Object.fromEntries(FACTORS.map((f) => [f.code, f]));
export const PED_DIMS = FACTORS.filter((f) => f.group === 'PED').map((f) => f.code);
export const ORG_DIMS = FACTORS.filter((f) => f.group === 'ORG').map((f) => f.code);

// Danh sách 62 chỉ báo và 12 chỉ báo gắn kết, theo đúng thứ tự cột của tệp phiếu.
export const INDICATORS = FACTORS_STD.flatMap((f) =>
  f.items.map((text, i) => ({ code: `Q_${f.prefix}_${i + 1}`, factor: f.code, text })),
);
export const ENGAGEMENT_ITEMS = ENGAGEMENT.flatMap((g) =>
  g.items.map((text, i) => ({ code: `${g.code}${i + 1}`, factor: g.code, text })),
);
export const ITEM_CODES = INDICATORS.map((d) => d.code);
export const ENG_CODES = ENGAGEMENT_ITEMS.map((d) => d.code);
export const ALL_ITEM_CODES = [...ITEM_CODES, ...ENG_CODES];
export const INDICATOR_BY_CODE = Object.fromEntries(
  [...INDICATORS, ...ENGAGEMENT_ITEMS].map((d) => [d.code, d]),
);

// Chỉ mục của từng nhân tố trong mảng câu trả lời (74 phần tử: 62 chỉ báo + 12 gắn kết).
export const FACTOR_ITEM_INDEX = Object.fromEntries(
  FACTORS.map((f) => [
    f.code,
    INDICATORS.map((d, i) => (d.factor === f.code ? i : -1)).filter((i) => i >= 0),
  ]),
);
export const ENG_ITEM_INDEX = ENG_CODES.map((_, i) => ITEM_CODES.length + i);

// Các chỉ số được tổng hợp cho lớp, khoa, Trường.
export const METRICS = {
  IDX: { code: 'IDX', name: 'Chỉ số chất lượng giảng dạy', short: 'Chỉ số chất lượng' },
  PED: { code: 'PED', name: GROUPS.PED.name, short: GROUPS.PED.short },
  ORG: { code: 'ORG', name: GROUPS.ORG.name, short: GROUPS.ORG.short },
  ENG: { code: 'ENG', name: 'Điểm gắn kết học tập', short: 'Gắn kết' },
  ...Object.fromEntries(FACTORS.map((f) => [f.code, { code: f.code, name: f.name, short: f.short }])),
};
export const METRIC_CODES = ['IDX', ...DIMENSIONS, 'PED', 'ORG', ...OUTCOMES, 'ENG'];

// Phân loại 3 mức (mục 4.2).
export const LEVELS = {
  low: { code: 'low', name: 'Thấp', range: '< 2,5' },
  mid: { code: 'mid', name: 'Trung bình', range: '2,5 – < 3,5' },
  high: { code: 'high', name: 'Cao', range: '≥ 3,5' },
};

// Trạng thái cảnh báo: màu luôn đi kèm biểu tượng và chữ (nguyên tắc 3).
export const STATUS = {
  ok: { code: 'ok', label: 'Đạt', icon: '✔', rank: 1 },
  warn: { code: 'warn', label: 'Theo dõi', icon: '⚠', rank: 2 },
  alert: { code: 'alert', label: 'Can thiệp', icon: '✖', rank: 3 },
  na: { code: 'na', label: 'Chưa đủ dữ liệu', icon: '–', rank: 0 },
};

export const DOT_LABELS = { GK: 'Giữa kỳ', CK: 'Cuối kỳ' };

export function factorOfItem(code) {
  return INDICATOR_BY_CODE[code]?.factor ?? null;
}

export function metricLabel(code, { withCode = true } = {}) {
  const m = METRICS[code];
  if (!m) return code;
  if (code === 'IDX' || code === 'PED' || code === 'ORG' || code === 'ENG') return m.short;
  return withCode ? `${code} ${m.short}` : m.short;
}
