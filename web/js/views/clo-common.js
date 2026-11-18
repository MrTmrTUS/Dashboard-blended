// Thành phần dùng chung của M6 – Kết quả học tập theo CLO: mục con, bộ lọc dùng chung cho mọi biểu đồ,
// dòng "điều kiện lọc – số sinh viên được phân tích", nhãn trạng thái CLO.
import { classShort, CLO_STATUS, modeLabel, resolveCloFilters, scopeText, semesterLabel } from '../api-clo.js';
import { fmtDate, fmtInt, fmtPct, fmtScore } from '../core/format.js';
import { state } from '../store.js';
import { banner, statusChip } from '../ui/components.js';
import { esc, html, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const ALL = ['bgh', 'qlcl', 'khoa', 'gv', 'admin', 'viewer'];
export const CLO_TABS = [
  { id: 'lop', label: 'Tổng hợp lớp', icon: 'class', roles: ALL },
  { id: 'cau-hinh', label: 'Cấu hình ma trận', icon: 'grid', roles: ['qlcl', 'khoa', 'gv', 'admin', 'viewer'] },
  { id: 'nhap', label: 'Nhập và kiểm tra điểm', icon: 'upload', roles: ['qlcl', 'khoa', 'gv', 'admin'] },
  { id: 'tong-quan', label: 'Tổng quan lớp', icon: 'overview', roles: ALL },
  { id: 'phan-tich', label: 'Phân tích CLO', icon: 'target', roles: ['qlcl', 'khoa', 'gv', 'admin', 'viewer'] },
  { id: 'ho-tro', label: 'Cần hỗ trợ', icon: 'support', roles: ['qlcl', 'khoa', 'gv', 'cvht', 'admin'] },
  { id: 'cai-tien', label: 'Cải tiến và báo cáo', icon: 'flag', roles: ['bgh', 'qlcl', 'khoa', 'gv', 'admin', 'viewer'] },
];

export const cloTabAllowed = (user, tab) => CLO_TABS.find((t) => t.id === tab)?.roles.includes(user.role) ?? false;
export const cloHomeTab = (user) => (user.role === 'cvht' ? 'ho-tro' : 'lop');

export function cloHash(tab, q = {}) {
  const s = Object.entries(q)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `#/clo/${tab}${s ? `?${s}` : ''}`;
}

// Truy vấn hiện tại (giữ học kỳ, lớp, CLO… khi chuyển mục).
export function keepQuery(ctx, patch = {}) {
  const f = ctx.f2;
  const q = { ky: f?.semesterId, lop: f?.classId, clo: f?.clo, lan: f?.mode === 'initial' ? 'dau' : '', bai: f?.assessment, ...patch };
  return q;
}

export function cloTabsNav(ctx, current) {
  const tabs = CLO_TABS.filter((t) => t.roles.includes(ctx.user.role));
  const q = keepQuery(ctx);
  return html`<nav class="tabs clo-tabs" aria-label="Mục của Kết quả CLO">${tabs.map(
    (t) => html`<a href="${cloHash(t.id, t.id === 'cau-hinh' || t.id === 'cai-tien' ? { hp: ctx.f2?.course?.id } : t.id === 'lop' ? { ky: q.ky } : q)}"${raw(t.id === current ? ' aria-current="page"' : '')}>${icon(t.icon)}${t.label}</a>`,
  )}</nav>`;
}

// Chuẩn hóa bộ lọc của M6 cho ctx (gọi trong prepare của từng mục).
export function cloPrepare(ctx) {
  ctx.f2 = resolveCloFilters(ctx.user, ctx.query);
  return ctx.f2;
}

// Bộ lọc dùng chung cho mọi biểu đồ của trang (một hàng trên cùng). keys: ky, lop, clo, lan, bai.
export function cloFilterDefs(ctx, tab, keys) {
  const f = ctx.f2;
  if (!f) return [];
  const defs = [];
  const go = (patch) => cloHash(tab, { ...keepQuery(ctx), ...patch });
  if (keys.includes('ky')) {
    defs.push({
      key: 'ky',
      label: 'Học kỳ',
      value: f.semesterId,
      options: [...f.sems].reverse().map((s) => ({ value: s.id, label: s.label })),
      toHash: (v) => {
        const lineage = f.entry?.cls.lineage;
        const same = state.dataset.classes.find((c) => c.semesterId === v && c.lineage === lineage);
        return go({ ky: v, lop: same?.id ?? '', clo: f.clo });
      },
    });
  }
  if (keys.includes('lop') && f.classes.length) {
    defs.push({ key: 'lop', label: 'Lớp', wide: true, value: f.classId, options: f.classes.map((e) => ({ value: e.cls.id, label: e.cls.name })), toHash: (v) => go({ lop: v }) });
  }
  if (keys.includes('clo') && f.rv) {
    defs.push({ key: 'clo', label: 'CLO', value: f.clo, options: [{ value: '', label: 'Tất cả CLO' }, ...f.rv.clos.map((c) => ({ value: c.code, label: `${c.code} · ${c.short ?? ''}` }))], toHash: (v) => go({ clo: v }) });
  }
  if (keys.includes('lan')) {
    defs.push({ key: 'lan', label: 'Lần đánh giá', value: f.mode === 'initial' ? 'dau' : '', options: [{ value: '', label: 'Sau đánh giá lại' }, { value: 'dau', label: 'Lần đầu' }], toHash: (v) => go({ lan: v }) });
  }
  if (keys.includes('bai') && f.rv) {
    defs.push({ key: 'bai', label: 'Bài đánh giá', value: f.assessment, options: [{ value: '', label: 'Tất cả bài' }, ...f.rv.assessments.map((a) => ({ value: a.code, label: `${a.ref} · ${a.name}` }))], toHash: (v) => go({ bai: v }) });
  }
  return defs;
}

export function cloMeta(rv) {
  const sim = state.dataset.outcomes?.meta?.source === 'synthetic' && state.datasetKey === 'synthetic';
  return html`${rv ? html`<span>Bộ quy tắc: <b>${rv.version}</b>${rv.approvedAt ? ` · duyệt ${fmtDate(rv.approvedAt)}` : ''}</span>` : ''}
    <span class="data-badge ${sim ? 'data-badge--sim' : 'data-badge--import'}" title="${sim ? 'CLO và cấu trúc đánh giá theo đề cương chi tiết; điểm của sinh viên là mô phỏng' : 'Dữ liệu nhập từ tệp'}">${sim ? 'Điểm mô phỏng' : 'Dữ liệu nhập'}</span>`;
}

// Dòng điều kiện lọc và số người được phân tích (luôn hiển thị phía trên biểu đồ).
export function scopeLine(f, { n = null, extra = '' } = {}) {
  return html`<p class="scope-line" role="status"><span class="scope-line__label">${icon('filter', { size: 15 })}Đang phân tích:</span> <span>${scopeText(f)}</span>${n !== null ? html` · <b>n = ${fmtInt(n)}</b> sinh viên` : ''}${extra ? html` · ${extra}` : ''}</p>`;
}

export function cloStatusChip(code, { score = null, label = null } = {}) {
  const s = CLO_STATUS[code] || CLO_STATUS.not_assessed;
  return html`<span class="chip chip--${s.chip}"><span class="chip__icon" aria-hidden="true">${s.icon}</span>${label ?? s.label}${score !== null && score !== undefined ? html` ${fmtScore(score)}` : ''}</span>`;
}

// Nhãn tỷ lệ đạt CLO của lớp (so với mục tiêu).
export function rateChip(x, code = '') {
  if (!x || x.notAssessed) return html`<span class="chip chip--neutral"><span class="chip__icon" aria-hidden="true">○</span>${code ? `${code} ` : ''}chưa đánh giá</span>`;
  if (x.status === 'na') return statusChip('na', { label: `${code ? `${code} ` : ''}${x.n ? fmtPct(x.rate) : '–'} (n ${x.n})` });
  return statusChip(x.status, { label: `${code ? `${code} ` : ''}${fmtPct(x.rate)}`, title: `${x.nAchieved}/${x.n} sinh viên đủ minh chứng đạt; ${x.nInsufficient} chưa đủ minh chứng` });
}

export function inProgressBanner(res, rv, cls) {
  if (!res?.inProgress) return '';
  const held = rv.assessments.filter((a) => res.held.includes(a.code));
  const notYet = rv.assessments.filter((a) => !res.held.includes(a.code));
  const none = rv.cloCodes.filter((c) => res.clo[c].notAssessed);
  return banner({
    kind: 'info',
    iconText: '⏳',
    title: `Học kỳ đang diễn ra – kết quả tạm tính trên ${held.length}/${rv.assessments.length} bài đánh giá đã tổ chức`,
    body: html`Đã có: ${held.map((a) => a.name).join(', ') || 'chưa có bài nào'}. Chưa tổ chức: ${notYet.map((a) => a.name).join(', ')}.${none.length ? html` <b>${none.join(', ')}</b> chưa có minh chứng – hiển thị “chưa đánh giá”.` : ''} Dùng kết quả để phát hiện sớm và hỗ trợ, không dùng để kết luận đạt chuẩn đầu ra của ${esc(cls?.name ?? 'lớp')}.`,
  });
}

export function noRulesCard(cls) {
  return html`<div class="card"><div class="card__body">${banner({ kind: 'warn', iconText: '⚠', title: `${cls.name} chưa có bộ quy tắc CLO đã phê duyệt cho ${semesterLabel(cls.semesterId)}`, body: 'Kết quả CLO chỉ được tính theo bộ quy tắc đã phê duyệt (M6 › Cấu hình ma trận).' })}</div></div>`;
}

export const modeText = modeLabel;
export const clsShort = classShort;

export function pctOrDash(v) {
  return v === null || v === undefined ? '–' : fmtPct(v);
}
