// M6 – Kết quả học tập theo CLO: bảng định tuyến các mục (#/clo/<mục>?ky=&lop=&clo=&lan=&bai=).
import { AccessDenied } from '../access.js';
import { CloAnalysisView } from './clo-analysis.js';
import { CloClassView } from './clo-class.js';
import { cloHomeTab, cloTabAllowed } from './clo-common.js';
import { CloConfigView } from './clo-config.js';
import { CloHomeView } from './clo-home.js';
import { CloImportView } from './clo-import-view.js';
import { CloImproveView, CloReportView } from './clo-improve.js';
import { CloSupportView } from './clo-support.js';

const RAW = {
  lop: CloHomeView,
  'cau-hinh': CloConfigView,
  nhap: CloImportView,
  'tong-quan': CloClassView,
  'phan-tich': CloAnalysisView,
  'ho-tro': CloSupportView,
  'cai-tien': CloImproveView,
  'bao-cao': CloReportView,
};

// Mỗi mục chỉ mở cho vai trò được phép (báo cáo theo quyền của mục "Cải tiến và báo cáo").
const guarded = Object.fromEntries(
  Object.entries(RAW).map(([tab, view]) => [
    tab,
    {
      ...view,
      prepare(ctx) {
        if (!cloTabAllowed(ctx.user, tab === 'bao-cao' ? 'cai-tien' : tab)) throw new AccessDenied('Vai trò hiện tại không dùng mục này của Kết quả CLO');
        return view.prepare(ctx);
      },
    },
  ]),
);

export function cloView(user, tab) {
  return guarded[tab] || guarded[cloHomeTab(user)];
}
