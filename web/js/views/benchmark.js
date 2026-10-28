// M4 – Đối sánh liên trường: forest plot chênh lệch trung bình tiềm ẩn TDU – trường đối sánh,
// chỉ trên nhân tố đạt bất biến đo lường (Nội dung 1); nhân tố không đạt tô xám kèm lý do.
import { benchmark } from '../api.js';
import { fmtSigned } from '../core/format.js';
import { banner, chartCard, codeTag, dataTable, legend, pageHead, plainCard, statusChip } from '../ui/components.js';
import { forestOption, groupColor, mountChart, theme } from '../ui/charts.js';
import { html } from '../ui/dom.js';

export const BenchmarkView = {
  screen: 'M4',
  layout: 'wide',
  title: () => 'Đối sánh liên trường',
  prepare(ctx) {
    ctx.data = benchmark(ctx.user);
  },
  render(ctx) {
    const d = ctx.data;
    const t = theme();
    const comparable = d.rows.filter((r) => r.comparable);
    return html`${pageHead({
      crumbs: [{ label: 'Trường' }, { label: 'Đối sánh liên trường' }],
      title: 'So với trường đối sánh ra sao?',
      question: `TDU – ${d.name} · ${comparable.length}/${d.rows.length} nhân tố đủ điều kiện so sánh`,
    })}
      ${banner({
        kind: 'info',
        title: 'Chỉ so sánh khi hợp lệ (nguyên tắc 5)',
        body: html`Chênh lệch chỉ có ý nghĩa khi nhân tố đạt <b>bất biến đo lường</b> giữa hai trường. Số liệu lấy từ kết quả Nội dung 1 (tính bằng R), nhập vào dưới dạng bảng tham số ở M0 › Nhập dữ liệu. Nguồn hiện tại: <b>${d.source || 'chưa rõ'}</b>.`,
      })}
      ${chartCard({
        id: 'card-forest',
        title: 'Chênh lệch trung bình tiềm ẩn theo nhân tố',
        sub: 'Biểu đồ khoảng (forest plot) · ước lượng và khoảng tin cậy 95% · bên phải số 0: TDU cao hơn',
        legend: legend([{ kind: 'sq', color: groupColor('PED'), label: 'Lõi sư phạm' }, { kind: 'sq', color: groupColor('ORG'), label: 'Điều kiện tổ chức' }, { kind: 'sq', color: groupColor('KQ'), label: 'Kết quả cảm nhận' }, { kind: 'line', color: t.ink2, label: 'Không chênh lệch (0)' }]),
        chart: html`<div class="chart chart--lg" id="chart-forest"></div>`,
        table: dataTable({
          compact: true,
          columns: [
            { label: 'Nhân tố', render: (r) => html`${codeTag(r.code)} ${r.name}` },
            { label: 'Bất biến', render: (r) => (r.invariant === true ? statusChip('ok', { label: 'Đạt' }) : r.invariant === false ? statusChip('na', { label: 'Không đạt' }) : statusChip('na', { label: 'Chưa có' })) },
            { label: 'Chênh lệch', num: true, render: (r) => (r.comparable ? fmtSigned(r.est) : '–') },
            { label: 'KTC 95%', num: true, render: (r) => (r.comparable ? `[${fmtSigned(r.lo)}; ${fmtSigned(r.hi)}]` : '–') },
            { label: 'Diễn giải', render: (r) => r.reading },
          ],
          rows: d.rows,
        }),
        howto: html`<ul><li>Mỗi dòng là một nhân tố; ô vuông là ước lượng chênh lệch trung bình tiềm ẩn (TDU − trường đối sánh), vạch ngang là khoảng tin cậy 95%.</li>
          <li>Khoảng tin cậy cắt số 0: khác biệt không có ý nghĩa thống kê. Nằm hẳn bên phải: TDU cao hơn; hẳn bên trái: TDU thấp hơn.</li>
          <li>Dòng xám “Không đủ điều kiện so sánh”: nhân tố chưa đạt bất biến vô hướng nên không so sánh trung bình được.</li></ul>`,
      })}
      <div class="mt-16">${plainCard({
        title: 'Kết quả kiểm định bất biến (Nội dung 1)',
        sub: 'Nhân tố đạt bất biến được coi là phổ quát ◆; không đạt là phụ thuộc bối cảnh ○ (dùng trong ma trận ưu tiên ở M1)',
        body: dataTable({
          columns: [
            { label: 'Nhân tố', render: (r) => html`${codeTag(r.code)} ${r.fullName}` },
            { label: 'Mức bất biến', render: (r) => html`${r.invariant ? '◆ ' : r.invariant === false ? '○ ' : ''}${r.level}` },
            { label: 'Ghi chú / lý do', render: (r) => html`<span class="small">${r.comparable ? r.note : r.reason}</span>` },
          ],
          rows: d.rows,
          rowClass: (r) => (r.comparable ? '' : 'row-muted'),
        }),
      })}</div>`;
  },
  mount(root, ctx) {
    const el = root.querySelector('#chart-forest');
    if (el) {
      const rows = ctx.data.rows;
      mountChart(el, forestOption({ rows }), {
        ariaLabel: `Forest plot ${rows.filter((r) => r.comparable).length} nhân tố đủ điều kiện so sánh; ${rows.filter((r) => !r.comparable).length} nhân tố không đủ điều kiện.`,
      });
    }
  },
};
