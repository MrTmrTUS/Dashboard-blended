// Bộ quy tắc đánh giá theo CLO của học phần Nguyên lý kế toán (ACP0371) – lấy từ
// "Đề cương chi tiết học phần Nguyên lý kế toán" (Khoa Kinh tế – QTKD, ban hành 2025):
// Bảng 2 (CLO, PLO/PI, mức năng lực, trọng số), Bảng 4 – 5 (bài đánh giá, phân bổ CLO),
// mục 9 (rubric 1 – 4) và mục 10 (cấu trúc đề thi kết thúc học phần).
// Phần chỉ có trong MVP (đề cương không ghi): điểm tối đa của từng tiêu chí rubric 1 – 3,
// danh mục dạng lỗi, ngày đánh giá, và bản nháp 2026 (minh họa quy trình phê duyệt).
// ĐIỂM SỐ của sinh viên đều là MÔ PHỎNG (data/clo-synthetic.js).
import { CLO_RULE_DEFAULTS } from '../core/clo.js';

// Mức năng lực cần đạt: thang 6 bậc cho kiến thức (Bloom), 5 bậc cho kỹ năng và năng lực tự chủ – trách nhiệm.
export const LEVEL_SCALES = {
  kien_thuc: { label: 'Kiến thức', scale: 6, names: ['Nhớ', 'Hiểu', 'Vận dụng', 'Phân tích', 'Đánh giá', 'Sáng tạo'] },
  ky_nang: { label: 'Kỹ năng', scale: 5, names: ['Bắt chước', 'Thao tác', 'Chuẩn xác', 'Phối hợp', 'Thành thạo'] },
  tu_chu: { label: 'Tự chủ và trách nhiệm', scale: 5, names: ['Tiếp nhận', 'Phản hồi', 'Đánh giá giá trị', 'Tổ chức', 'Đặc trưng hóa'] },
};

export const DOMAIN_BY_LEVEL_TEXT = { 6: 'kien_thuc', 5: 'ky_nang' };

// Mức điểm của các rubric trong đề cương (thang 10).
export const RUBRIC_BANDS = [
  { code: 'A', min: 8.5, label: 'A (8,5 – 10)' },
  { code: 'B', min: 7.0, label: 'B (7,0 – 8,4)' },
  { code: 'C', min: 5.5, label: 'C (5,5 – 6,9)' },
  { code: 'D', min: 4.0, label: 'D (4,0 – 5,4)' },
  { code: 'F', min: 0, label: 'F (0 – 3,9)' },
];

export const MODES = {
  truc_tiep: { label: 'Trực tiếp', short: 'Trực tiếp' },
  truc_tuyen: { label: 'Trực tuyến (LMS)', short: 'LMS' },
  ket_hop: { label: 'Kết hợp (lớp + LMS)', short: 'Kết hợp' },
};

// Chuẩn đầu ra CTĐT ngành Kế toán phân nhiệm cho học phần (Bảng 2).
export const PROGRAMS = [
  {
    id: '7340301',
    name: 'Kế toán',
    plos: [
      {
        code: 'PLO4', ref: '1.2.2', group: 'Kiến thức nghề nghiệp',
        pis: [
          { code: 'PI4.1', level: '4/6', text: 'Phân tích và vận dụng được nguyên lý và quy trình kế toán để ghi nhận, tổng hợp và lập báo cáo theo chuẩn mực/chế độ.' },
          { code: 'PI4.2', level: '4/6', text: 'Phân tích được vai trò của HTTT kế toán và kế toán số; lựa chọn/vận dụng công cụ số phù hợp cho xử lý nghiệp vụ.' },
        ],
      },
      {
        code: 'PLO8', ref: '2.2.1', group: 'Kỹ năng nghề nghiệp',
        pis: [{ code: 'PI8.1', level: '4/5', text: 'Thực hiện thành thạo ghi nhận, phân loại, tổng hợp nghiệp vụ và lập sổ sách/báo cáo cho các phần hành kế toán chủ yếu.' }],
      },
      {
        code: 'PLO12', ref: '3.1.1', group: 'Năng lực tự chủ và trách nhiệm',
        pis: [{ code: 'PI12.1', level: '4/5', text: 'Thể hiện đạo đức nghề nghiệp, kỷ luật, sức khỏe và thái độ làm việc chuyên nghiệp; chịu trách nhiệm với nhiệm vụ được giao.' }],
      },
    ],
  },
];

const CHAPTERS = [
  { code: 'C1', name: 'Chương 1. Tổng quan về kế toán' },
  { code: 'C2', name: 'Chương 2. Phân tích nghiệp vụ kinh tế và ghi nhận trong hệ thống kế toán' },
  { code: 'C3', name: 'Chương 3. Các phương pháp kế toán' },
  { code: 'C4', name: 'Chương 4. Kế toán các quá trình kinh doanh chủ yếu' },
  { code: 'C5', name: 'Chương 5. Sổ kế toán và các hình thức sổ kế toán' },
];

// Dạng lỗi khi chấm bài tự luận, bài thực hành (MVP đề xuất; đơn vị đếm là "lượt lỗi").
export const ERROR_TYPES = [
  { code: 'DK1', group: 'Định khoản', label: 'Định khoản sai tài khoản đối ứng', chapter: 'C2' },
  { code: 'DK2', group: 'Định khoản', label: 'Ghi đảo bên Nợ – bên Có', chapter: 'C2' },
  { code: 'DK3', group: 'Định khoản', label: 'Bỏ sót bút toán (kể cả bút toán điều chỉnh cuối kỳ)', chapter: 'C2' },
  { code: 'TG1', group: 'Tính giá', label: 'Tính giá nhập – xuất kho sai phương pháp', chapter: 'C3' },
  { code: 'CT1', group: 'Chứng từ', label: 'Chứng từ thiếu yếu tố bắt buộc hoặc sai mẫu', chapter: 'C3' },
  { code: 'KQ1', group: 'Kết quả kinh doanh', label: 'Kết chuyển doanh thu – chi phí, xác định kết quả sai', chapter: 'C4' },
  { code: 'SS1', group: 'Sổ kế toán', label: 'Sổ chi tiết và sổ cái không khớp', chapter: 'C5' },
  { code: 'HT1', group: 'Sổ kế toán', label: 'Nhầm trình tự ghi sổ, hình thức kế toán', chapter: 'C5' },
  { code: 'BC1', group: 'Báo cáo', label: 'Bảng cân đối/báo cáo không cân, sai chỉ tiêu', chapter: 'C3' },
  { code: 'TT1', group: 'Trình bày', label: 'Sai số học, trình bày sai mẫu biểu', chapter: 'C3' },
];

// Bộ quy tắc mặc định (đề xuất MVP, chỉnh ở M6 › Cấu hình ma trận trước khi phê duyệt);
// đề cương yêu cầu thời gian có mặt tối thiểu 70% (điều kiện dự thi).
export const DEFAULT_RULES = { ...CLO_RULE_DEFAULTS };

const CLOS_2025 = [
  {
    code: 'CLO1', domain: 'kien_thuc', level: 3, plo: 'PLO4', pi: 'PI4.1', weight: 0.2, chapters: ['C1', 'C2', 'C3', 'C4', 'C5'],
    text: 'Phân tích và giải thích được vai trò của kế toán, các khái niệm – nguyên tắc kế toán cơ bản và các yếu tố của báo cáo tài chính; vận dụng phương trình kế toán để nhận diện và phân loại đối tượng kế toán trong các tình huống đơn giản.',
    short: 'Khái niệm, nguyên tắc, phương trình kế toán',
  },
  {
    code: 'CLO2', domain: 'kien_thuc', level: 4, plo: 'PLO4', pi: 'PI4.2', weight: 0.15, chapters: ['C2', 'C3', 'C4'],
    text: 'Phân tích được quy trình kế toán, vai trò của sổ kế toán và các hình thức kế toán; lựa chọn và vận dụng được công cụ số/bảng tính đơn giản để hỗ trợ ghi sổ và tổng hợp thông tin kế toán cơ bản.',
    short: 'Quy trình, sổ và hình thức kế toán; công cụ số',
  },
  {
    code: 'CLO3', domain: 'ky_nang', level: 4, plo: 'PLO8', pi: 'PI8.1', weight: 0.45, chapters: ['C2', 'C3', 'C4'],
    text: 'Thực hiện thành thạo lập chứng từ, định khoản, ghi sổ và tổng hợp số liệu để lập sổ sách/báo cáo kế toán và báo cáo tài chính cơ bản theo chế độ hiện hành đối với các nghiệp vụ kinh tế phát sinh thường gặp.',
    short: 'Lập chứng từ, định khoản, ghi sổ, lập báo cáo',
  },
  {
    code: 'CLO4', domain: 'tu_chu', level: 4, plo: 'PLO12', pi: 'PI12.1', weight: 0.2, chapters: ['C1', 'C2', 'C3', 'C4', 'C5'],
    text: 'Thể hiện đạo đức nghề nghiệp, kỷ luật học tập và tác phong làm việc chuyên nghiệp trong học tập và thực hành kế toán; tuân thủ quy định và bảo mật thông tin; chịu trách nhiệm về kết quả nhiệm vụ được giao.',
    short: 'Đạo đức nghề nghiệp, kỷ luật, tác phong',
  },
];

// Điểm tối đa của từng tiêu chí rubric 1 – 3: đề cương không ghi, MVP chia theo Bảng 4
// (chuyên cần 10% + thái độ 10%; bài kiểm tra CLO1 10% – CLO2 5%; bài thực hành 4 tiêu chí ngang nhau).
const ASSESSMENTS_2025 = [
  {
    code: 'CC', ref: 'A1.1', group: 'A1', name: 'Chuyên cần, thái độ học tập', weight: 0.2, mode: 'ket_hop', rubric: 'Rubric 1',
    when: 'Hàng tuần (chốt cuối kỳ)', forms: ['CC'], retakeForms: [], maxAttempts: 1, itemAnalysis: false,
    declared: { CLO4: 0.2 },
    desc: 'Sinh viên tham gia đầy đủ các buổi học, ghi chép bài, chuẩn bị bài trước khi đến lớp; thảo luận, phản biện tình huống kế toán thực tế; tích cực trong làm việc nhóm.',
    items: [
      { code: 'TC1', label: 'Tham gia học tập', max: 3, clos: { CLO4: 1 }, chapter: null },
      { code: 'TC2', label: 'Chuẩn bị bài học (hoạt động LMS trước buổi học)', max: 2, clos: { CLO4: 1 }, chapter: null },
      { code: 'TC3', label: 'Thái độ học tập', max: 5, clos: { CLO4: 1 }, chapter: null },
    ],
  },
  {
    code: 'KT', ref: 'A1.2', group: 'A1', name: 'Bài kiểm tra', weight: 0.15, mode: 'truc_tuyen', rubric: 'Rubric 2',
    when: 'Kết thúc Chương 3', forms: ['KT1'], retakeForms: ['KT2'], maxAttempts: 2,
    declared: { CLO1: 0.1, CLO2: 0.05 },
    desc: 'Kiểm tra kiến thức và khả năng vận dụng các phương pháp kế toán: chứng từ, tính giá, đối ứng tài khoản (phân tích nghiệp vụ, định khoản) và tổng hợp – cân đối kế toán.',
    items: [
      { code: 'TC1', label: 'Kiến thức về nguyên tắc kế toán', max: 6, clos: { CLO1: 1 }, chapter: 'C1' },
      { code: 'TC2', label: 'Hạch toán nghiệp vụ', max: 4, clos: { CLO2: 1 }, chapter: 'C2', errors: ['DK1', 'DK2', 'DK3', 'TG1'] },
    ],
  },
  {
    code: 'TH', ref: 'A1.2', group: 'A1', name: 'Bài tập thực hành', weight: 0.15, mode: 'truc_tuyen', rubric: 'Rubric 3',
    when: 'Kết thúc Chương 5', forms: ['TH'], retakeForms: [], maxAttempts: 1,
    declared: { CLO3: 0.1, CLO4: 0.05 },
    desc: 'Thực hành một số phần hành kế toán: định khoản, lập chứng từ, ghi sổ kế toán và lập một số báo cáo kế toán, nhận diện sai sót và đề xuất giải pháp (nộp trên LMS).',
    items: [
      { code: 'TC1', label: 'Lập chứng từ kế toán', max: 2.5, clos: { CLO3: 1 }, chapter: 'C3', errors: ['CT1', 'TT1'] },
      { code: 'TC2', label: 'Ghi sổ kế toán (định khoản)', max: 2.5, clos: { CLO3: 1 }, chapter: 'C2', errors: ['DK1', 'DK2', 'DK3', 'SS1'] },
      { code: 'TC3', label: 'Lập bảng tổng hợp/báo cáo kế toán', max: 2.5, clos: { CLO3: 1 }, chapter: 'C3', errors: ['BC1', 'KQ1', 'TT1'] },
      { code: 'TC4', label: 'Giải thích – phân tích ngắn tình huống kế toán', max: 2.5, clos: { CLO4: 1 }, chapter: 'C4' },
    ],
  },
  {
    code: 'CK', ref: 'A2', group: 'A2', name: 'Bài thi cuối kỳ', weight: 0.5, mode: 'truc_tiep', rubric: 'Rubric 4 · mục 10',
    when: 'Theo lịch của Phòng Đào tạo', forms: ['D1', 'D2'], retakeForms: ['D3', 'D4'], maxAttempts: 2, doubleMarked: true,
    declared: { CLO1: 0.1, CLO2: 0.2, CLO3: 0.2 },
    desc: 'Kết hợp tự luận và trắc nghiệm, 90 phút, không dùng tài liệu (trừ bảng hệ thống tài khoản); 2 đề/lần thi.',
    items: [
      { code: 'TN', label: 'Phần trắc nghiệm – 12 câu × 0,25 điểm (ngân hàng 200 câu)', max: 3, clos: { CLO1: 1 }, chapter: null, mcq: { count: 12, each: 0.25 } },
      { code: 'TL1', label: 'Tự luận câu 1 – quy trình kế toán, sổ và hình thức kế toán', max: 3, clos: { CLO2: 1 }, chapter: 'C5', errors: ['HT1', 'SS1'], marked2: true },
      { code: 'TL2a', label: 'Tự luận câu 2a – hạch toán (định khoản) các nghiệp vụ phát sinh', max: 2.5, clos: { CLO3: 1 }, chapter: 'C4', errors: ['DK1', 'DK2', 'DK3', 'TG1', 'KQ1'], marked2: true },
      { code: 'TL2b', label: 'Tự luận câu 2b – lập bảng tổng hợp/báo cáo kế toán', max: 1.5, clos: { CLO3: 1 }, chapter: 'C3', errors: ['BC1', 'KQ1', 'TT1'], marked2: true },
    ],
  },
];

const VERSION_2025 = {
  id: 'ACP0371@2025',
  courseId: 'ACP0371',
  courseName: 'Nguyên lý kế toán',
  courseNameEn: 'Principles of Accounting',
  programId: '7340301',
  credits: 3,
  hours: '40 tiết lý thuyết · 10 tiết thực hành/thảo luận · 90 tiết tự học',
  version: '2025',
  status: 'approved',
  approvedAt: '2025-01-06T08:00:00.000Z',
  approvedBy: 'Khoa Kinh tế – QTKD',
  effectiveFrom: 'HK2-2425',
  source: 'Đề cương chi tiết học phần Nguyên lý kế toán (ACP0371), Khoa Kinh tế – QTKD, ban hành 2025',
  requirements: ['Thời gian có mặt trên lớp tối thiểu 70%', 'Làm đầy đủ 02 bài kiểm tra của học phần', 'Bắt buộc làm bài thi kết thúc học phần'],
  examBank: { mcq: 200, essay: 30, note: 'Ngân hàng 200 câu trắc nghiệm (CLO1) và 30 câu tự luận (15 câu CLO2, 15 câu CLO3); 2 đề/lần thi' },
  rules: { ...DEFAULT_RULES },
  chapters: CHAPTERS,
  clos: CLOS_2025,
  assessments: ASSESSMENTS_2025,
};

// Bản nháp MINH HỌA quy trình rà soát – phê duyệt (không phải quyết định của Khoa):
// giữ nguyên trọng số CLO ở Bảng 2, chỉ chỉnh ma trận gán tiêu chí để phân bổ điểm khớp trọng số.
const clone = (x) => JSON.parse(JSON.stringify(x));
const ASSESSMENTS_2026 = clone(ASSESSMENTS_2025).map((a) => {
  if (a.code === 'KT') {
    a.declared = { CLO1: 0.09, CLO3: 0.06 };
    a.items.find((i) => i.code === 'TC2').clos = { CLO3: 1 };
  }
  if (a.code === 'TH') {
    a.declared = { CLO3: 0.15 };
    a.items.find((i) => i.code === 'TC4').clos = { CLO3: 1 };
  }
  if (a.code === 'CK') a.declared = { CLO1: 0.15, CLO2: 0.15, CLO3: 0.2 };
  return a;
});

const VERSION_2026_DRAFT = {
  ...clone(VERSION_2025),
  id: 'ACP0371@2026',
  version: '2026 (nháp)',
  status: 'pending',
  approvedAt: null,
  approvedBy: null,
  effectiveFrom: 'HK2-2627',
  createdAt: '2026-11-10T03:00:00.000Z',
  createdBy: 'Giảng viên phụ trách học phần',
  basedOn: 'ACP0371@2025',
  note:
    'Bản nháp minh họa sau khi kiểm tra ma trận: (1) tiêu chí "Hạch toán nghiệp vụ" của bài kiểm tra gán CLO3 (đúng nội dung định khoản); ' +
    '(2) tiêu chí 4 của bài thực hành gán CLO3; (3) phân bổ CLO của bài thi cuối kỳ khớp cấu trúc đề ở mục 10. Trọng số CLO giữ nguyên.',
  source: 'Bản nháp chỉnh ma trận đánh giá (minh họa, chờ Khoa phê duyệt)',
  assessments: ASSESSMENTS_2026,
};

export const CLO_VERSIONS = [VERSION_2025, VERSION_2026_DRAFT];

// Ngày tổ chức đánh giá theo học kỳ (MVP mô phỏng; học kỳ hiện tại mới có bài kiểm tra).
export const ASSESSMENT_CALENDAR = {
  'HK2-2425': { KT: ['2025-03-07', '2025-03-21'], TH: ['2025-04-18'], CC: ['2025-05-16'], CK: ['2025-05-26', '2025-06-23'] },
  'HK1-2526': { KT: ['2025-10-24', '2025-11-07'], TH: ['2025-12-05'], CC: ['2025-12-26'], CK: ['2026-01-08', '2026-02-05'] },
  'HK2-2526': { KT: ['2026-03-27', '2026-04-10'], TH: ['2026-05-08'], CC: ['2026-05-29'], CK: ['2026-06-04', '2026-07-02'] },
  'HK1-2627': { KT: ['2026-10-30', '2026-11-13'], TH: ['2026-12-11'], CC: ['2026-12-31'], CK: ['2027-01-07', '2027-02-04'] },
};

// Loại nhiệm vụ hỗ trợ sinh viên (M6 › Cần hỗ trợ).
export const SUPPORT_TYPES = {
  luyen_tap: 'Giao bài luyện tập',
  phu_dao: 'Phụ đạo, dạy lại nội dung',
  gap_rieng: 'Trao đổi riêng, hướng dẫn cá nhân',
  lam_bu: 'Bố trí làm bài bù',
  nhac_nho: 'Nhắc nhở chuyên cần, tiến độ',
};

export const SUPPORT_STATUS = {
  chua_bat_dau: { label: 'Chưa bắt đầu', chip: 'na' },
  dang_thuc_hien: { label: 'Đang hỗ trợ', chip: 'warn' },
  hoan_thanh: { label: 'Đã hỗ trợ', chip: 'ok' },
};

// Gợi ý hỗ trợ theo dạng lỗi chiếm ưu thế (MVP; bổ sung vào thư viện biện pháp khi duyệt).
export const SUPPORT_HINTS = {
  'Định khoản': 'Luyện bộ nghiệp vụ định khoản tự chấm trên LMS (làm nhiều lần) và xem video giải mẫu; nộp lại 10 nghiệp vụ có sai sót',
  'Tính giá': 'Ôn phương pháp tính giá nhập – xuất kho (FIFO, bình quân) bằng bảng tính mẫu; làm 5 bài tập tính giá',
  'Chứng từ': 'Thực hành lập, kiểm tra chứng từ mẫu (phiếu thu, phiếu chi, phiếu nhập – xuất kho) theo danh mục yếu tố bắt buộc',
  'Kết quả kinh doanh': 'Luyện bút toán kết chuyển doanh thu – chi phí, lập bảng xác định kết quả kinh doanh đơn giản',
  'Sổ kế toán': 'Ôn trình tự ghi sổ theo hình thức Nhật ký chung; đối chiếu sổ chi tiết – sổ cái trên bảng tính',
  'Báo cáo': 'Luyện lập bảng cân đối thử, bảng cân đối kế toán từ số dư tài khoản; tự kiểm tra tính cân đối',
  'Trình bày': 'Rà soát mẫu biểu, kiểm tra số học trước khi nộp; dùng bảng tính tự kiểm tra',
};
