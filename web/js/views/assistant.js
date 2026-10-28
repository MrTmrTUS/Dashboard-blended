// M5 – Trợ lý AI (khung bên phải M1 – M3).
// Mọi văn bản AI có nhãn "Do AI tạo – đối chiếu số liệu nguồn", mã nguồn [F1]… và nút 👍/👎.
import { isReadOnly } from '../access.js';
import { generate } from '../ai/generator.js';
import { FACTOR_BY_CODE } from '../core/constants.js';
import { fmtScore } from '../core/format.js';
import { aiReview, feedback, state } from '../store.js';
import { codeTag, toast } from '../ui/components.js';
import { esc, html, on, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const cache = new Map();

export function library() {
  return state.library || state.dataset.measures;
}

function withRefs(text, facts) {
  const ids = new Set(facts.map((f) => f.ma));
  return raw(
    esc(text).replace(/\[(F\d+)\]/g, (m, code) =>
      ids.has(code) ? `<button type="button" class="fact-ref" data-fact="${code}" aria-label="Dữ kiện ${code}">${code}</button>` : `<span class="fact-ref" title="Mã không tồn tại">${code}?</span>`,
    ),
  );
}

function feedbackButtons(target, user) {
  if (isReadOnly(user)) return '';
  const cur = feedback.get(target, user.id)?.value;
  return html`<div class="feedback" data-target="${target}">
    <button type="button" class="btn-tool" data-fb="up" aria-pressed="${cur === 'up'}">${icon('up')}Hữu ích</button>
    <button type="button" class="btn-tool is-down" data-fb="down" aria-pressed="${cur === 'down'}">${icon('down')}Chưa đúng</button>
  </div>`;
}

function engineLabel(res, cfg) {
  if (res.engine === 'ollama') return `Ollama · ${cfg.ollamaModel}${res.attempts > 1 ? ` · sinh ${res.attempts} lần` : ''}`;
  return 'Mẫu câu từ dữ kiện (MVP)';
}

function checkLine(res) {
  if (!res.check) return '';
  if (res.check.ok) return html`<div class="check-line check-line--ok">${icon('check', { size: 14 })}<span>Bộ kiểm số: mọi con số và mã nguồn khớp dữ kiện</span></div>`;
  const parts = [];
  if (res.check.unknownNumbers.length) parts.push(`số không có trong dữ kiện: ${res.check.unknownNumbers.join(', ')}`);
  if (res.check.badCodes.length) parts.push(`mã nguồn không tồn tại: ${res.check.badCodes.join(', ')}`);
  if (res.check.uncited.length) parts.push(`${res.check.uncited.length} câu thiếu mã nguồn`);
  return html`<div class="check-line check-line--bad" role="alert"><span aria-hidden="true">⚠</span><span><b>Cần xem lại</b> – ${parts.join('; ')}</span></div>`;
}

export function aiKey(request) {
  return `${request.kind}:${request.key}:${state.version}:${state.cfg.aiEngine}`;
}

export async function renderAssistant(host, request, ctx, { force = false } = {}) {
  const { user } = ctx;
  const cfg = state.cfg;
  const body = host.querySelector('.assistant__body');
  if (!request) {
    body.innerHTML = String(html`<div class="empty"><div class="empty__title">Chọn một nội dung để trợ lý tóm tắt</div></div>`);
    return;
  }
  const key = aiKey(request);
  const reviewKey = `${request.kind}:${request.key}`;
  if (cfg.expertReview && !aiReview.approved()[reviewKey] && !['qlcl', 'admin'].includes(user.role)) {
    body.innerHTML = String(html`<span class="ai-label">${icon('sparkle', { size: 14 })}Do AI tạo – đối chiếu số liệu nguồn</span>
      <div class="empty"><div class="empty__icon" aria-hidden="true">⏳</div><div class="empty__title">Đang chờ chuyên gia duyệt</div>
      <div class="small">Học kỳ thí điểm bật chế độ “chuyên gia duyệt trước khi hiển thị”.</div></div>`);
    return;
  }
  if (!cache.has(key) || force) {
    body.innerHTML = '<div class="ai-skeleton" style="width:60%"></div><div class="ai-skeleton"></div><div class="ai-skeleton"></div><div class="ai-skeleton" style="width:80%"></div>';
    try {
      cache.set(key, await generate(request.kind, request.input, { cfg, library: library() }));
    } catch (e) {
      body.innerHTML = String(html`<div class="banner banner--alert">Không tạo được văn bản: ${e.message}</div>`);
      return;
    }
  }
  const res = cache.get(key);
  if (!host.isConnected) return;
  const canPlan = request.kind === 'class' && request.canPlan;
  const target = `${request.kind}:${request.key}`;
  const needsApproval = cfg.expertReview && !aiReview.approved()[reviewKey];
  body.innerHTML = String(html`
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
      <span class="ai-label">${icon('sparkle', { size: 14 })}Do AI tạo – đối chiếu số liệu nguồn</span>
      <span class="caption">${engineLabel(res, cfg)}</span>
    </div>
    ${res.fallback ? html`<div class="check-line check-line--bad">${res.fallback}</div>` : ''}
    ${needsApproval ? html`<div class="banner banner--warn" style="margin:10px 0 0"><div class="banner__body small">Chế độ chuyên gia duyệt đang bật – người dùng khác chưa thấy bản này.</div><button type="button" class="btn btn--sm" data-approve>Duyệt</button></div>` : ''}
    <section class="ai-section" aria-labelledby="ai-sum">
      <div class="ai-section__title"><span id="ai-sum">Tóm tắt ${request.title ? `– ${request.title}` : ''}</span>
        <button type="button" class="btn-tool" data-regen title="Tạo lại">${icon('refresh')}<span class="sr-only">Tạo lại</span></button></div>
      <div class="ai-text">${withRefs(res.text, res.facts)}</div>
      ${checkLine(res)}
      ${feedbackButtons(`${target}:summary`, user)}
    </section>
    ${res.measures?.length
      ? html`<section class="ai-section" aria-labelledby="ai-sug">
          <div class="ai-section__title"><span id="ai-sug">Gợi ý biện pháp (thư viện đã duyệt)</span></div>
          ${res.measures.map(
            (m) => html`<div class="measure">
              <div class="measure__head">${codeTag(m.dim)}<span>${FACTOR_BY_CODE[m.dim]?.short}</span><span class="measure__code">${m.measure.code}</span></div>
              <div>${m.measure.text}</div>
              ${m.note ? html`<div class="caption" style="margin-top:4px">${m.note}</div>` : ''}
              <div class="caption" style="margin-top:4px">Căn cứ: ${m.dim} ${fmtScore(m.mean)} ${m.ref ? html`<button type="button" class="fact-ref" data-fact="${m.ref}">${m.ref}</button>` : ''} · Đối tượng: ${m.measure.target}</div>
              ${isReadOnly(user)
                ? ''
                : html`<div class="feedback" data-target="${target}:${m.measure.code}">
                    ${canPlan ? html`<button type="button" class="btn btn--sm" data-apply="${m.measure.code}" data-dim="${m.dim}">${icon('plus')}Áp dụng vào kế hoạch</button>` : ''}
                    <button type="button" class="btn-tool" data-fb="up" aria-pressed="${feedback.get(`${target}:${m.measure.code}`, user.id)?.value === 'up'}">${icon('up')}<span class="sr-only">Hữu ích</span></button>
                    <button type="button" class="btn-tool is-down" data-fb="down" aria-pressed="${feedback.get(`${target}:${m.measure.code}`, user.id)?.value === 'down'}">${icon('down')}<span class="sr-only">Chưa đúng</span></button>
                  </div>`}
            </div>`,
          )}
          <p class="caption">Người dùng là người quyết định áp dụng; gợi ý chỉ lấy từ thư viện biện pháp đã được chuyên gia duyệt.</p>
        </section>`
      : ''}
    ${request.extra || ''}
    <details class="ai-section">
      <summary class="ai-section__title" style="cursor:pointer">Dữ kiện nguồn (${res.facts.length})</summary>
      <ul class="facts-list">${res.facts.map((f) => html`<li><b>${f.ma}</b>: ${f.noi_dung}</li>`)}</ul>
    </details>
    <p class="caption">AI chỉ diễn giải số đã tính và luôn hiện số liệu nguồn. Rê chuột hoặc chọn mã [F…] để xem số liệu gốc.</p>`);
  bindFactRefs(body, res.facts);
  body.querySelector('[data-regen]')?.addEventListener('click', () => renderAssistant(host, request, ctx, { force: true }));
  body.querySelector('[data-approve]')?.addEventListener('click', () => {
    aiReview.approve(reviewKey, user);
    toast('Đã duyệt văn bản AI cho nội dung này');
    renderAssistant(host, request, ctx);
  });
  on(body, 'click', '[data-fb]', (e, btn) => {
    const wrap = btn.closest('[data-target]');
    const value = btn.dataset.fb;
    const cur = feedback.get(wrap.dataset.target, user.id)?.value;
    feedback.set({ target: wrap.dataset.target, userId: user.id, role: user.role, value: cur === value ? null : value, engine: res.engine, kind: request.kind });
    wrap.querySelectorAll('[data-fb]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fb === value && cur !== value)));
    if (cur !== value) toast(value === 'up' ? 'Cảm ơn – đã ghi nhận “Hữu ích”' : 'Đã ghi nhận “Chưa đúng” để chuyên gia xem lại (TC4)');
  });
  on(body, 'click', '[data-apply]', (e, btn) => {
    request.onApply?.({ measureCode: btn.dataset.apply, dimension: btn.dataset.dim });
  });
}

// Ô xem số liệu gốc khi rê chuột / chọn mã nguồn.
export function bindFactRefs(root, facts) {
  const map = new Map(facts.map((f) => [f.ma, f]));
  let pop = null;
  const show = (el) => {
    hide();
    const f = map.get(el.dataset.fact);
    if (!f) return;
    pop = document.createElement('div');
    pop.className = 'fact-pop';
    pop.setAttribute('role', 'tooltip');
    pop.innerHTML = `<b>${esc(f.ma)}</b> · ${esc(f.noi_dung)}`;
    document.body.appendChild(pop);
    const r = el.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8))}px`;
    const top = r.top - pop.offsetHeight - 8;
    pop.style.top = `${top < 8 ? r.bottom + 8 : top}px`;
  };
  const hide = () => {
    pop?.remove();
    pop = null;
  };
  root.addEventListener('mouseover', (e) => {
    const el = e.target.closest('.fact-ref[data-fact]');
    if (el) show(el);
  });
  root.addEventListener('mouseout', (e) => {
    if (e.target.closest('.fact-ref')) hide();
  });
  root.addEventListener('focusin', (e) => {
    const el = e.target.closest('.fact-ref[data-fact]');
    if (el) show(el);
  });
  root.addEventListener('focusout', hide);
  root.addEventListener('click', (e) => {
    const el = e.target.closest('.fact-ref[data-fact]');
    if (el) {
      e.preventDefault();
      pop ? hide() : show(el);
    }
  });
}

export function clearAiCache() {
  cache.clear();
}
