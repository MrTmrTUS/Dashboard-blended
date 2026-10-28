// Thành phần giao diện dùng chung (mục 9): thẻ KPI, nhãn trạng thái, thẻ biểu đồ có "Xem dạng bảng"
// và "Cách đọc", trạng thái trống, hộp thoại, thông báo nhanh.
import { FACTOR_BY_CODE, STATUS } from '../core/constants.js';
import { fmtSigned } from '../core/format.js';
import { esc, html, raw } from './dom.js';
import { icon } from './icons.js';

export function statusChip(status, { label, large = false, title } = {}) {
  const s = STATUS[status] || STATUS.na;
  return html`<span class="chip chip--${s.code}${large ? ' chip--lg' : ''}"${raw(title ? ` title="${esc(title)}"` : '')}><span class="chip__icon" aria-hidden="true">${s.icon}</span>${label ?? s.label}</span>`;
}

export function codeTag(code) {
  const group = FACTOR_BY_CODE[code]?.group ?? (code === 'IDX' ? 'KQ' : 'ENG');
  return html`<span class="code-tag code-tag--${group}">${code}</span>`;
}

// Mũi tên so với đợt trước; màu theo hướng × việc tăng có tốt hay không.
export function delta(value, { goodWhen = 'up', digits = 2, unit = '', label = '' } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return html`<span class="delta delta--flat">${label ? `${label}: ` : ''}–</span>`;
  }
  const flat = Math.abs(value) < 0.5 * 10 ** -digits;
  const up = value > 0;
  const good = flat ? null : goodWhen === 'up' ? up : !up;
  const cls = flat ? 'flat' : good ? 'good' : 'bad';
  const arrow = flat ? '■' : up ? '▲' : '▼';
  const word = flat ? 'không đổi' : up ? 'tăng' : 'giảm';
  return html`<span class="delta delta--${cls}"><span aria-hidden="true">${arrow}</span><span class="sr-only">${word}</span>${fmtSigned(value, digits).replace(/^[+−]/, '')}${unit}${label ? html`<span class="muted" style="font-weight:500"> ${label}</span>` : ''}</span>`;
}

export function sparkline(values, { width = 104, height = 36, label = '' } = {}) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => typeof v === 'number' && Number.isFinite(v));
  if (pts.length < 2) return '';
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = maxY - minY || 1;
  const pad = 4;
  const sx = (x) => pad + ((x - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (width - 2 * pad);
  const sy = (y) => height - pad - ((y - minY) / span) * (height - 2 * pad);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return raw(
    `<svg class="kpi__spark" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}"><path d="${d}" fill="none" stroke="#9aa3b5" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${sx(lx).toFixed(1)}" cy="${sy(ly).toFixed(1)}" r="4" fill="#518ecf" stroke="#fff" stroke-width="2"/></svg>`,
  );
}

export function kpiTile({ label, value, unit = '', deltaHtml = '', caption = '', spark = '', extra = '', info = '' }) {
  return html`<section class="card kpi" aria-label="${label}">
    <div class="kpi__label"><span>${label}</span>${info ? html`<span class="muted" title="${info}">${icon('info', { size: 15 })}</span>` : ''}</div>
    <div class="kpi__row">
      <div class="kpi__main"><div class="kpi__value">${value}${unit ? html`<small> ${unit}</small>` : ''}</div></div>
      ${spark}
    </div>
    ${deltaHtml ? html`<div class="kpi__delta">${deltaHtml}</div>` : ''}
    ${extra}
    <div class="kpi__caption">${caption}</div>
  </section>`;
}

export function howTo(content) {
  return html`<details class="howto"><summary>Cách đọc</summary><div class="howto__body">${content}</div></details>`;
}

// Thẻ biểu đồ: có nút "Xem dạng bảng" (bảng là phương án thay thế đạt chuẩn tiếp cận).
export function chartCard({ id, title, sub = '', chart, table = null, howto = null, foot = null, actions = '', legend = '' }) {
  return html`<section class="card" id="${id}" aria-labelledby="${id}-title">
    <div class="card__head">
      <div class="card__titles">
        <h2 class="card__title" id="${id}-title">${title}</h2>
        ${sub ? html`<p class="card__sub">${sub}</p>` : ''}
      </div>
      <div class="card__actions">
        ${actions}
        ${table ? html`<button type="button" class="btn-tool" data-toggle-table="${id}" aria-pressed="false" aria-controls="${id}-table">${icon('table')}<span>Xem dạng bảng</span></button>` : ''}
      </div>
    </div>
    <div class="card__body">
      ${legend}
      <div data-view="chart">${chart}</div>
      ${table ? html`<div data-view="table" id="${id}-table" hidden>${table}</div>` : ''}
    </div>
    ${howto ? howTo(howto) : ''}
    ${foot ? html`<div class="card__foot">${foot}</div>` : ''}
  </section>`;
}

export function plainCard({ id = '', title, sub = '', body, actions = '', foot = null, flush = false }) {
  return html`<section class="card"${raw(id ? ` id="${esc(id)}"` : '')}>
    ${title
      ? html`<div class="card__head"><div class="card__titles"><h2 class="card__title">${title}</h2>${sub ? html`<p class="card__sub">${sub}</p>` : ''}</div><div class="card__actions">${actions}</div></div>`
      : ''}
    <div class="${flush ? 'card__body card__body--flush' : 'card__body'}">${body}</div>
    ${foot ? html`<div class="card__foot">${foot}</div>` : ''}
  </section>`;
}

// Bảng dữ liệu đơn giản. columns: [{ key, label, num, render(row) }]
export function dataTable({ caption = '', columns, rows, compact = false, emptyText = 'Không có dữ liệu', rowClass }) {
  if (!rows.length) return emptyState({ title: emptyText });
  return html`<div class="table-wrap"><table class="table${compact ? ' table--compact' : ''}">
    ${caption ? html`<caption>${caption}</caption>` : ''}
    <thead><tr>${columns.map((c) => html`<th scope="col"${raw(c.num ? ' class="n"' : '')}>${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map(
      (r) => html`<tr${raw(rowClass ? ` class="${esc(rowClass(r) || '')}"` : '')}>${columns.map(
        (c) => html`<td${raw(c.num ? ' class="n"' : '')}>${c.render ? c.render(r) : r[c.key]}</td>`,
      )}</tr>`,
    )}</tbody>
  </table></div>`;
}

export function emptyState({ title = 'Chưa đủ dữ liệu', text = '', iconText = '–' } = {}) {
  return html`<div class="empty" role="status"><div class="empty__icon" aria-hidden="true">${iconText}</div><div class="empty__title">${title}</div>${text ? html`<div class="small">${text}</div>` : ''}</div>`;
}

export function banner({ kind = 'info', title, body = '', iconText = 'ℹ', actions = '' }) {
  return html`<div class="banner banner--${kind}" role="${kind === 'alert' ? 'alert' : 'note'}">
    <div class="banner__icon" aria-hidden="true">${iconText}</div>
    <div class="banner__body"><div class="banner__title">${title}</div>${body ? html`<div class="small">${body}</div>` : ''}</div>
    ${actions}
  </div>`;
}

export function breadcrumb(items) {
  return html`<nav aria-label="Đường dẫn phân cấp"><ol class="breadcrumb">${items.map((it, i) =>
    i === items.length - 1
      ? html`<li><span aria-current="page">${it.label}</span></li>`
      : html`<li>${it.href ? html`<a href="${it.href}">${it.label}</a>` : it.label}</li>`,
  )}</ol></nav>`;
}

export function pageHead({ crumbs = null, title, question = '', actions = '' }) {
  return html`<div class="page-head">
    <div>${crumbs ? breadcrumb(crumbs) : ''}<h1 class="page-title">${title}</h1>${question ? html`<p class="page-question">${question}</p>` : ''}</div>
    ${actions ? html`<div class="page-actions">${actions}</div>` : ''}
  </div>`;
}

// ---- Hộp thoại, thông báo nhanh, chờ tính -------------------------------------------

export function openDialog({ title, body, foot = '', wide = false, onMount }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  if (wide) dlg.style.width = 'min(860px, calc(100vw - 32px))';
  dlg.setAttribute('aria-labelledby', 'dlg-title');
  dlg.innerHTML = String(html`<div class="dialog__head"><h2 class="dialog__title" id="dlg-title">${title}</h2>
    <button type="button" class="icon-btn" data-close aria-label="Đóng">${icon('close')}</button></div>
    <div class="dialog__body">${body}</div>${foot ? html`<div class="dialog__foot">${foot}</div>` : ''}`);
  document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target === dlg) dlg.close();
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  onMount?.(dlg);
  return dlg;
}

export function toast(message, ms = 3200) {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  host.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function busy(on, text = 'Đang tính lại…') {
  let el = document.querySelector('.busy');
  if (!on) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.className = 'busy';
    el.innerHTML = `<div class="busy__box" role="status"><span class="spinner" aria-hidden="true"></span><span></span></div>`;
    document.body.appendChild(el);
  }
  el.querySelector('span:last-child').textContent = text;
}

// Chú giải dạng HTML cho biểu đồ (luôn có khi từ 2 chuỗi dữ liệu).
export function legend(items) {
  return html`<ul class="legend" aria-label="Chú giải">${items.map(
    (it) => html`<li><span class="key key--${it.kind || 'dot'}" style="${raw(it.kind === 'line' || it.kind === 'dash' ? `color:${it.color}` : `background:${it.color}`)}" aria-hidden="true"></span>${it.label}</li>`,
  )}</ul>`;
}
