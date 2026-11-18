// M6 › Lớp học phần: "Lớp nào chưa đạt CLO, cần hỗ trợ ở đâu?" – điểm vào của mô-đun đánh giá theo CLO.
import { cloHome, semesterLabel } from '../api-clo.js';
import { fmtInt, fmtPct, fmtScore } from '../core/format.js';
import { banner, dataTable, emptyState, kpiTile, pageHead, plainCard, statusChip } from '../ui/components.js';
import { html, isMobile } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { cloFilterDefs, cloHash, cloMeta, cloPrepare, cloTabsNav, rateChip } from './clo-common.js';

const FLOW = [
  { tab: 'cau-hinh', title: 'Cấu hình ma trận', text: 'CLO, PLO/PI, ngưỡng đạt; kiểm tra câu hỏi × CLO trước khi triển khai' },
  { tab: 'nhap', title: 'Nhập và kiểm tra điểm', text: 'Excel/LMS; trùng, thiếu, vượt điểm, sai mã đề, sai lần thi' },
  { tab: 'tong-quan', title: 'Tổng quan lớp', text: 'Lớp đạt đến đâu; phễu minh chứng; phân bố điểm' },
  { tab: 'phan-tich', title: 'Phân tích CLO', text: 'CLO yếu → tiêu chí, chương, dạng lỗi; chất lượng đề và chấm' },
  { tab: 'ho-tro', title: 'Cần hỗ trợ', text: 'Giao nhiệm vụ, ghi hạn; đánh giá lại bằng nhiệm vụ tương đương' },
  { tab: 'cai-tien', title: 'Cải tiến và báo cáo', text: 'Theo dõi biện pháp, so sánh học kỳ, xuất báo cáo học phần' },
];

export const CloHomeView = {
  screen: 'M6',
  layout: 'wide',
  title: () => 'Kết quả học tập theo CLO',
  filters: (ctx) => cloFilterDefs(ctx, 'lop', ['ky']),
  meta: (ctx) => cloMeta(ctx.f2?.rv),
  prepare(ctx) {
    cloPrepare(ctx);
    ctx.data = cloHome(ctx.user, ctx.f2);
  },
  render(ctx) {
    const d = ctx.data;
    const f = ctx.f2;
    const rows = d.rows;
    const inProg = rows.some((r) => r.res?.inProgress);
    const q = (r, tab) => cloHash(tab, { ky: f.semesterId, lop: r.cls.id });
    const worst = rows.flatMap((r) => (r.res ? r.rv.cloCodes.map((c) => ({ r, c, x: r.res.clo[c] })) : [])).filter((x) => !x.x.notAssessed && x.x.rate !== null).sort((a, b) => a.x.rate - b.x.rate)[0];
    const isWide = ['qlcl', 'admin', 'khoa', 'bgh', 'viewer'].includes(ctx.user.role);
    return html`${pageHead({
      crumbs: [{ label: 'Trường' }, { label: 'Kết quả CLO' }],
      title: 'Kết quả học tập theo CLO',
      question: `Lớp nào chưa đạt CLO, cần hỗ trợ ở đâu? · ${semesterLabel(f.semesterId)}`,
    })}
      ${cloTabsNav(ctx, 'lop')}
      ${banner({
        kind: 'sim',
        iconText: 'ℹ',
        title: 'CLO, ma trận đánh giá theo đề cương chi tiết; điểm số là mô phỏng',
        body: html`Học phần thí điểm <b>Nguyên lý kế toán</b>: 4 CLO (trọng số 20 – 15 – 45 – 20%), bài đánh giá A1.1, A1.2 (bài kiểm tra, bài thực hành), A2 và cấu trúc đề thi lấy từ đề cương. Sinh viên, lớp, giảng viên dùng chung với dashboard BL nên kết quả CLO đối chiếu được với khảo sát của cùng lớp. Nhập dữ liệu thật ở mục <a href="${cloHash('nhap')}">Nhập và kiểm tra điểm</a>.`,
      })}
      ${isWide
        ? html`<div class="grid grid--kpi">
            ${kpiTile({ label: 'Học phần đã có bộ quy tắc CLO', value: `${fmtInt(d.configured.length)}/${fmtInt(d.courses.length)}`, caption: 'đã phê duyệt, áp dụng cho lớp – mở rộng dần từ học phần thí điểm' })}
            ${kpiTile({ label: 'Lớp có dữ liệu CLO', value: fmtInt(rows.length), caption: `${semesterLabel(f.semesterId)}${inProg ? ' · đang diễn ra (tạm tính)' : ''}` })}
            ${kpiTile({ label: 'CLO thấp nhất', value: worst ? fmtPct(worst.x.rate) : '–', caption: worst ? `${worst.c} · ${worst.r.cls.name} (mục tiêu ${fmtPct(worst.r.rv.rules.target)})` : 'chưa có CLO được đánh giá' })}
            ${kpiTile({ label: 'Bộ quy tắc chờ phê duyệt', value: fmtInt(d.pending.length), caption: d.pending.length ? d.pending.map((v) => `${v.courseName} ${v.version}`).join(', ') : 'không có' })}
          </div>`
        : ''}
      <div class="mt-16">${plainCard({
        title: `Lớp có dữ liệu đánh giá theo CLO – ${semesterLabel(f.semesterId)}`,
        sub: inProg ? 'Học kỳ đang diễn ra: tỷ lệ tạm tính trên các bài đã tổ chức; CLO chưa có bài đánh giá hiện "chưa đánh giá"' : 'Tỷ lệ sinh viên đạt từng CLO (trên số sinh viên đủ minh chứng) so với mục tiêu của bộ quy tắc',
        flush: true,
        body: rows.length
          ? isMobile()
            ? html`<ul class="list">${rows.map(
                (r) => html`<li><a class="list-row" href="${q(r, 'tong-quan')}"><span class="list-row__main"><span class="list-row__title">${r.cls.name}</span><br>
                  <span class="list-row__meta">${r.lecturer?.name ?? ''} · ${fmtInt(r.res?.nActive ?? 0)} sinh viên${r.res?.inProgress ? ' · tạm tính' : ''}</span><br>
                  <span class="clo-chips">${r.rv ? r.rv.cloCodes.map((c) => rateChip(r.res.clo[c], c)) : 'Chưa có bộ quy tắc'}</span></span></a></li>`,
              )}</ul>`
            : html`<div style="padding:0 0 4px">${dataTable({
                columns: [
                  { label: 'Lớp học phần', render: (r) => html`<a href="${q(r, 'tong-quan')}"><b>${r.cls.name}</b></a><br><span class="caption">${r.cls.id}</span>` },
                  { label: 'Giảng viên', render: (r) => r.lecturer?.name ?? r.cls.lecturerId },
                  { label: 'Bộ quy tắc', render: (r) => (r.rv ? html`${r.rv.version}<br><span class="caption">${r.res.held.length}/${r.rv.assessments.length} bài đã tổ chức</span>` : html`<span class="chip chip--warn">Chưa phê duyệt</span>`) },
                  { label: 'Sinh viên', num: true, render: (r) => fmtInt(r.res?.nActive ?? 0) },
                  { label: 'Tỷ lệ đạt từng CLO', render: (r) => (r.rv ? html`<span class="clo-chips">${r.rv.cloCodes.map((c) => rateChip(r.res.clo[c], c))}</span>` : '–') },
                  { label: 'Đạt mọi CLO đã đánh giá', num: true, render: (r) => (r.res ? html`${fmtPct(r.res.all.rate)}<br><span class="caption">n ${fmtInt(r.res.all.n)}</span>` : '–') },
                  { label: 'Cần hỗ trợ', num: true, render: (r) => (r.res ? html`<a href="${q(r, 'ho-tro')}">${fmtInt(r.need)}</a>` : '–') },
                  { label: 'Điểm HP TB', num: true, render: (r) => (r.res?.complete ? fmtScore(r.res.course.mean) : html`<span class="caption">chưa có</span>`) },
                  { label: '', render: (r) => html`<a class="btn btn--sm" href="${q(r, 'phan-tich')}">${icon('target')}Phân tích</a>` },
                ],
                rows,
              })}</div>`
          : emptyState({ title: 'Chưa có lớp có dữ liệu CLO trong phạm vi', text: 'Chọn học kỳ khác, hoặc nhập ma trận đánh giá và điểm chi tiết ở mục Nhập và kiểm tra điểm.' }),
        foot: html`<span>${statusChip('ok', { label: 'Đạt mục tiêu' })} ${statusChip('warn', { label: 'Dưới mục tiêu ≤ 10 điểm %' })} ${statusChip('alert', { label: 'Dưới mục tiêu > 10 điểm %' })} ${statusChip('na', { label: 'Dưới 5 sinh viên đủ minh chứng' })}</span>`,
      })}</div>
      <div class="mt-16">${plainCard({
        title: 'Luồng sử dụng',
        sub: 'Ví dụ: phát hiện CLO3 thấp → mở tiêu chí thấy yếu ở định khoản → chọn nhóm sinh viên cần hỗ trợ → giao bài luyện tập, ghi nhận hỗ trợ → đánh giá lại bằng nhiệm vụ tương đương → lưu kết quả cải tiến',
        body: html`<ol class="clo-flow">${FLOW.map((s, i) => html`<li><a href="${cloHash(s.tab, s.tab === 'cau-hinh' || s.tab === 'cai-tien' ? {} : { ky: f.semesterId })}"><span class="clo-flow__n" aria-hidden="true">${i + 1}</span><span><b>${s.title}</b><br><span class="caption">${s.text}</span></span></a></li>`)}</ol>
          <p class="caption" style="margin-top:10px">Thử kịch bản: chọn <b>HK1 2025–2026</b> › lớp <b>N02</b> › Phân tích CLO (CLO3 thấp, nhóm lỗi định khoản) · <b>HK1 2026–2027</b> › N02 › Cần hỗ trợ (nhóm phụ đạo, kiểm tra lại ngày 13/11) · Cải tiến và báo cáo (CLO3 trước – sau cải tiến).</p>`,
      })}</div>`;
  },
};
