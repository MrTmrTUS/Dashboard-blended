// TC3 – Phiếu SUS tích hợp trong ứng dụng (10 câu, thang 5 mức).
import { fmtNum } from '../core/format.js';
import { state, sus } from '../store.js';
import { banner, pageHead, plainCard, toast } from '../ui/components.js';
import { html, on } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { susScore } from './admin-verify.js';

export const SUS_ITEMS = [
  'Tôi nghĩ rằng tôi muốn sử dụng hệ thống này thường xuyên.',
  'Tôi thấy hệ thống phức tạp một cách không cần thiết.',
  'Tôi thấy hệ thống dễ sử dụng.',
  'Tôi nghĩ rằng tôi cần sự hỗ trợ của người kỹ thuật để có thể sử dụng hệ thống này.',
  'Tôi thấy các chức năng của hệ thống được tích hợp tốt.',
  'Tôi thấy hệ thống có quá nhiều điểm không nhất quán.',
  'Tôi nghĩ rằng hầu hết mọi người sẽ học cách sử dụng hệ thống này rất nhanh.',
  'Tôi thấy hệ thống rất rườm rà, khó dùng.',
  'Tôi cảm thấy rất tự tin khi sử dụng hệ thống.',
  'Tôi cần học nhiều thứ trước khi có thể sử dụng hệ thống này.',
];

const SCALE = ['Hoàn toàn không đồng ý', 'Không đồng ý', 'Phân vân', 'Đồng ý', 'Hoàn toàn đồng ý'];

const TASKS = [
  'Tìm một lớp đang ở mức 🔴 Can thiệp trong đợt mới nhất',
  'Đọc và giải thích lý do cảnh báo của lớp đó',
  'Lập một kế hoạch cải tiến cho lớp đó (từ gợi ý của trợ lý AI hoặc tự soạn)',
];

function grade(score) {
  if (score >= 85) return 'Rất tốt';
  if (score >= 70) return 'Tốt – đạt TC3';
  if (score >= 50) return 'Chấp nhận được, cần cải thiện';
  return 'Chưa chấp nhận được';
}

export const SusView = {
  screen: null,
  layout: 'wide',
  title: () => 'Phiếu khảo sát khả dụng (SUS)',
  render(ctx) {
    return html`${pageHead({ title: 'Phiếu khảo sát khả dụng (SUS)', question: 'Đánh giá sau khi thực hiện các tác vụ mẫu – phục vụ tiêu chí TC3 (SUS ≥ 70)' })}
      ${banner({ kind: 'info', title: 'Kịch bản thử nghiệm', body: html`Trước khi trả lời, hãy thực hiện 3 tác vụ: ${TASKS.map((t, i) => html`<br>${i + 1}. ${t}`)}` })}
      <form id="sus-form" novalidate>
        ${plainCard({
          title: `Người trả lời: ${ctx.user.name} (${ctx.user.roleLabel})`,
          sub: 'Chọn một mức cho mỗi câu. Không có câu trả lời đúng hay sai.',
          body: html`${SUS_ITEMS.map(
            (q, i) => html`<fieldset class="sus-item" style="border:0;margin:0;padding:12px 0">
              <legend style="font-weight:600;padding:0">${i + 1}. ${q}</legend>
              <div class="sus-scale">${SCALE.map((s, k) => html`<label><input type="radio" name="q${i}" value="${k + 1}" required> ${k + 1} · ${s}</label>`)}</div>
            </fieldset>`,
          )}
          <fieldset class="sus-item" style="border:0;margin:0;padding:12px 0"><legend style="font-weight:600;padding:0">Tác vụ đã hoàn thành</legend>
            ${TASKS.map((t, i) => html`<label class="check" style="display:flex;margin-top:6px"><input type="checkbox" name="task${i}"> ${t}</label>`)}
          </fieldset>
          <div class="form-field" style="margin-top:12px"><label for="sus-comment">Góp ý thêm (không bắt buộc)</label><textarea class="textarea" id="sus-comment" name="comment"></textarea></div>
          <p id="sus-error" role="alert" class="small" style="color:var(--alert-ink)"></p>
          <div id="sus-result" aria-live="polite"></div>`,
          foot: html`<button type="submit" class="btn btn--primary">${icon('check')}Gửi phiếu</button><span>Phiếu được lưu trong trình duyệt này; nhóm nghiên cứu xem tổng hợp ở M0 › Kiểm chứng › TC3.</span>`,
        })}
      </form>`;
  },
  mount(root, ctx) {
    const form = root.querySelector('#sus-form');
    on(root, 'submit', '#sus-form', (e) => {
      e.preventDefault();
      const answers = SUS_ITEMS.map((_, i) => Number(form.elements[`q${i}`].value));
      const missing = answers.map((a, i) => (a ? null : i + 1)).filter(Boolean);
      if (missing.length) {
        root.querySelector('#sus-error').textContent = `Còn thiếu câu: ${missing.join(', ')}`;
        form.querySelector(`[name="q${missing[0] - 1}"]`)?.focus();
        return;
      }
      root.querySelector('#sus-error').textContent = '';
      const score = susScore(answers);
      sus.add({ userId: ctx.user.id, role: ctx.user.role, roleLabel: ctx.user.roleLabel, answers, score, tasks: [0, 1, 2].map((i) => form.elements[`task${i}`].checked), comment: form.elements.comment.value.trim(), dataset: state.datasetKey });
      root.querySelector('#sus-result').innerHTML = String(
        banner({ kind: score >= 70 ? 'info' : 'warn', iconText: score >= 70 ? '✔' : '⚠', title: `Điểm SUS của bạn: ${fmtNum(score, 1)} – ${grade(score)}`, body: 'Cảm ơn bạn đã tham gia thử nghiệm.' }),
      );
      form.querySelector('button[type="submit"]').disabled = true;
      toast('Đã ghi nhận phiếu SUS');
    });
  },
};
