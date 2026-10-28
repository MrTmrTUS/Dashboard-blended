// Biểu đồ Apache ECharts (đóng gói kèm ứng dụng, không tải từ mạng).
// Quy ước (mục 9): luôn ghi n; có đường mục tiêu/ngưỡng và trung bình Trường; chú giải số khi rê chuột;
// không biểu đồ tròn, không 3D; cùng phương diện cùng màu nhóm; nét mảnh, lưới mờ.
import { FACTOR_BY_CODE, STATUS } from '../core/constants.js';
import { fmtNum, fmtPct, fmtScore, fmtSigned } from '../core/format.js';
import { esc } from './dom.js';

let T = null;
export function theme() {
  if (T) return T;
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  T = {
    navy: v('--navy'), blue: v('--blue'), blueDark: v('--blue-dark'), gold: v('--gold'), grey: v('--grey'),
    ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'), line: v('--line'), grid: v('--grid'), axis: v('--axis'),
    surface: v('--surface'), ok: v('--ok'), warn: v('--warn'), alert: v('--alert'), na: v('--na'),
    okTint: v('--ok-tint'), warnTint: v('--warn-tint'), alertTint: v('--alert-tint'), naTint: v('--na-tint'),
    ped: v('--ped'), org: v('--org'), font: v('--font'),
  };
  return T;
}

export const groupColor = (group) => {
  const t = theme();
  return group === 'PED' ? t.ped : group === 'ORG' ? t.org : t.grey;
};
export const statusColor = (s) => {
  const t = theme();
  return { ok: t.ok, warn: t.warn, alert: t.alert, na: t.na }[s] || t.na;
};
// Hình dạng điểm theo trạng thái: màu không bao giờ là kênh duy nhất (nguyên tắc 3).
export const STATUS_SYMBOL = { ok: 'circle', warn: 'triangle', alert: 'diamond', na: 'rect' };

// Khoảng trục "đẹp": bước 1 – 2 – 5 × 10ᵏ, nhãn không chồng nhau ở hai đầu.
export function niceRange(lo, hi, { min: floorAt = -Infinity, max: ceilAt = Infinity, target = 6 } = {}) {
  const span = Math.max(hi - lo, 1e-6);
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((c) => c * mag).reduce((best, c) => (Math.abs(Math.log(c / raw)) < Math.abs(Math.log(best / raw)) ? c : best));
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const fix = (v) => +v.toFixed(decimals + 1);
  return {
    min: Math.max(floorAt, fix(Math.floor(lo / step + 1e-9) * step)),
    max: Math.min(ceilAt, fix(Math.ceil(hi / step - 1e-9) * step)),
    interval: step,
    decimals,
  };
}

// ---- Gắn và dọn biểu đồ ---------------------------------------------------------------
const registry = new Set();

export function mountChart(el, option, { onClick, ariaLabel } = {}) {
  if (!el || !window.echarts) return null;
  const chart = window.echarts.init(el, null, { renderer: 'svg', locale: 'VI' });
  chart.setOption({ aria: { enabled: true, label: { enabled: true, description: ariaLabel || '' } }, ...option });
  if (ariaLabel) {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', ariaLabel);
  }
  if (onClick) chart.on('click', onClick);
  const ro = new ResizeObserver(() => chart.resize());
  ro.observe(el);
  const entry = { chart, ro, el };
  registry.add(entry);
  return chart;
}

export function disposeCharts(root = document) {
  for (const entry of [...registry]) {
    if (!root || root.contains(entry.el) || !document.body.contains(entry.el)) {
      entry.ro.disconnect();
      entry.chart.dispose();
      registry.delete(entry);
    }
  }
}

// ---- Phần chung ----------------------------------------------------------------------
function base() {
  const t = theme();
  return {
    animationDuration: 300,
    textStyle: { fontFamily: t.font, color: t.ink2, fontSize: 12 },
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      confine: true,
      backgroundColor: '#fff',
      borderColor: t.line,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: t.ink, fontSize: 12, fontFamily: t.font },
      extraCssText: 'box-shadow:0 6px 20px rgba(31,36,55,.14);border-radius:8px;max-width:320px;white-space:normal;',
    },
  };
}

function valueAxis(extra = {}) {
  const t = theme();
  return {
    type: 'value',
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: t.grid, width: 1 } },
    axisLabel: { color: t.muted, fontSize: 11 },
    nameTextStyle: { color: t.ink2, fontSize: 11, align: 'left' },
    ...extra,
  };
}

function categoryAxis(data, extra = {}) {
  const t = theme();
  return {
    type: 'category',
    data,
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.ink2, fontSize: 11 },
    ...extra,
  };
}

const line = (color) => `<span style="display:inline-block;width:14px;height:0;border-top:2px solid ${color};vertical-align:middle;margin-right:6px"></span>`;
const statusLabel = (s) => `${STATUS[s]?.icon ?? ''} ${STATUS[s]?.label ?? ''}`;

// ---- Biểu đồ phễu (mục 4.3) ----------------------------------------------------------
export function funnelOption({ points, mu, sigma, metricName, nMin, zYellow, zRed, yellowLine }) {
  const t = theme();
  const nMax = Math.max(nMin + 10, ...points.map((p) => p.n)) + 4;
  const ns = [];
  for (let n = Math.max(2, nMin - 3); n <= nMax + 6; n += 0.5) ns.push(n);
  const lim = (z) => ns.map((n) => [n, mu + (z * sigma) / Math.sqrt(n)]);
  const lowAtMin = mu - (zRed * sigma) / Math.sqrt(nMin);
  const highAtMin = mu + (zRed * sigma) / Math.sqrt(nMin);
  const ys = points.map((p) => p.mean);
  const yr = niceRange(Math.min(lowAtMin, ...ys) - 0.05, Math.max(highAtMin, ...ys) + 0.05, { min: 1, max: 5 });
  const xr = niceRange(Math.max(0, nMin - 5), nMax, { min: 0, target: 8 });
  const limitLine = (data, name, dashed, width = 1) => ({
    type: 'line', name, data, showSymbol: false, silent: true, smooth: true,
    lineStyle: { color: t.grey, width, type: dashed ? 'dashed' : 'solid', opacity: 0.85 },
    endLabel: { show: true, formatter: name, color: t.muted, fontSize: 10 },
    z: 1,
  });
  const byStatus = (s) => points.filter((p) => p.status === s).map((p) => ({ value: [p.n, p.mean], p }));
  const scatter = (s) => ({
    type: 'scatter', name: STATUS[s].label, data: byStatus(s), symbol: STATUS_SYMBOL[s], symbolSize: s === 'ok' ? 10 : 13,
    itemStyle: { color: statusColor(s), borderColor: '#fff', borderWidth: 2 }, z: 3, silent: true,
  });
  return {
    ...base(),
    grid: { left: 8, right: 48, top: 30, bottom: 34, containLabel: true },
    xAxis: valueAxis({ name: 'Số phiếu hợp lệ (n)', nameLocation: 'middle', nameGap: 28, min: xr.min, max: xr.max, interval: xr.interval, splitLine: { show: false }, axisLine: { show: true, lineStyle: { color: t.axis } }, axisTick: { show: true, lineStyle: { color: t.axis } } }),
    yAxis: valueAxis({ name: `${metricName} (trục thu hẹp)`, min: yr.min, max: yr.max, interval: yr.interval, axisLabel: { formatter: (v) => fmtScore(v, Math.max(1, yr.decimals)), color: t.muted } }),
    tooltip: {
      ...base().tooltip,
      trigger: 'item',
      formatter: (prm) => {
        const p = prm.data?.p;
        if (!p) return '';
        const reason = p.reasons?.length ? `<div style="margin-top:4px;color:${t.ink2}">${esc(p.reasons.slice(0, 2).map((r) => r.text).join('; '))}</div>` : '';
        return `<div style="font-weight:700">${esc(p.name)}</div><div style="color:${t.ink2}">${esc(p.faculty)} · n = ${fmtNum(p.n)}</div>
          <div style="margin-top:4px"><b style="font-size:14px">${fmtScore(p.mean)}</b> ${esc(metricName)} · z = ${fmtSigned(p.z)}</div>
          <div style="margin-top:2px">${statusLabel(p.status)}</div>${reason}${p.canOpen ? `<div style="margin-top:4px;color:${t.blueDark}">Bấm để mở trang lớp →</div>` : ''}`;
      },
    },
    series: [
      limitLine(lim(zRed), `+${zRed}σ`, false),
      limitLine(lim(zYellow), `+${zYellow}σ`, true),
      limitLine(lim(-zYellow), `−${zYellow}σ`, true),
      limitLine(lim(-zRed), `−${zRed}σ`, false),
      { ...limitLine(ns.map((n) => [n, mu]), '', false), lineStyle: { color: t.navy, width: 1.5 }, endLabel: { show: true, formatter: `μ ${fmtScore(mu)}`, color: t.navy, fontSize: 10, fontWeight: 600 } },
      ...(yellowLine ? [{ type: 'line', data: [], markLine: { silent: true, symbol: 'none', data: [{ yAxis: yellowLine }], lineStyle: { color: t.warn, type: [4, 4], width: 1 }, label: { formatter: `ngưỡng ${fmtScore(yellowLine, 1)}`, color: t.muted, fontSize: 10, position: 'insideStartTop' } } }] : []),
      scatter('ok'),
      scatter('warn'),
      scatter('alert'),
      // lớp bắt sự kiện rê chuột/bấm rộng 26 px quanh mỗi điểm
      {
        type: 'scatter', name: 'hit', data: points.map((p) => ({ value: [p.n, p.mean], p })), symbolSize: 26,
        itemStyle: { color: t.navy, opacity: 0 }, emphasis: { itemStyle: { opacity: 0.12 } }, z: 4, cursor: 'pointer',
      },
    ],
  };
}

// ---- Pareto có trọng số (mục 4.4) – một trục 0–100% --------------------------------------
export function paretoOption({ rows, target }) {
  const t = theme();
  const cats = rows.map((r) => r.code);
  return {
    ...base(),
    grid: { left: 8, right: 34, top: 30, bottom: 8, containLabel: true },
    xAxis: categoryAxis(cats, { axisLabel: { color: t.ink, fontWeight: 600, fontSize: 11 } }),
    yAxis: valueAxis({ name: 'Tỷ trọng khoảng cách (%)', min: 0, max: 100, interval: 20, axisLabel: { formatter: '{value}%', color: t.muted } }),
    tooltip: {
      ...base().tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(39,44,99,0.05)' } },
      formatter: (items) => {
        const r = rows[items[0].dataIndex];
        return `<div style="font-weight:700">${esc(r.code)} · ${esc(FACTOR_BY_CODE[r.code].short)}</div>
          <div><b>${fmtPct(r.share, 1)}</b> tổng khoảng cách · cộng dồn <b>${fmtPct(r.cumShare, 0)}</b></div>
          <div style="color:${t.ink2}">x̄ = ${fmtScore(r.mean)} · T = ${fmtScore(target, 1)} · w = ${fmtNum(r.w, 3)}</div>
          <div style="color:${t.ink2}">g = max(0; T − x̄) × w = ${fmtNum(r.gap, 3)}</div>`;
      },
    },
    series: [
      {
        type: 'bar', name: 'Tỷ trọng', barMaxWidth: 24, barCategoryGap: '40%',
        data: rows.map((r) => ({ value: +(r.share * 100).toFixed(1), itemStyle: { color: groupColor(FACTOR_BY_CODE[r.code].group), borderRadius: [4, 4, 0, 0] } })),
        label: { show: true, position: 'top', formatter: (p) => (p.value > 0 ? `${fmtNum(p.value, 0)}%` : ''), color: t.ink2, fontSize: 10 },
      },
      {
        type: 'line', name: 'Cộng dồn', data: rows.map((r, i) => ({ value: +(r.cumShare * 100).toFixed(1), symbol: i === 0 ? 'none' : 'circle' })), symbol: 'circle', symbolSize: 8,
        lineStyle: { color: t.navy, width: 2 }, itemStyle: { color: t.navy, borderColor: '#fff', borderWidth: 2 },
        markLine: { silent: true, symbol: 'none', data: [{ yAxis: 80 }], lineStyle: { color: t.grey, type: 'dashed', width: 1 }, label: { formatter: '80%', color: t.muted, fontSize: 10 } },
      },
    ],
  };
}

// ---- Ma trận tầm quan trọng – mức đạt (IPA) -------------------------------------------------
export function ipaOption({ points, xCut, yCut }) {
  const t = theme();
  const pts = points.filter((p) => p.mean !== null && p.mean !== undefined);
  const xs = pts.map((p) => p.w);
  const ys = pts.map((p) => p.mean);
  const xr = niceRange(Math.min(xCut, ...xs) - 0.02, Math.max(xCut, ...xs) + 0.02, { min: 0, max: 1, target: 5 });
  const yr = niceRange(Math.min(yCut, ...ys) - 0.15, Math.max(yCut, ...ys) + 0.12, { min: 1, max: 5 });
  const [xMin, xMax, yMin, yMax] = [xr.min, xr.max, yr.min, yr.max];
  const area = (x0, x1, y0, y1, label, color) => [
    { xAxis: x0, yAxis: y0, itemStyle: { color }, label: { show: true, formatter: label, position: 'insideTopLeft', color: t.ink2, fontSize: 11, fontWeight: 600 } },
    { xAxis: x1, yAxis: y1 },
  ];
  return {
    ...base(),
    grid: { left: 8, right: 28, top: 24, bottom: 34, containLabel: true },
    xAxis: valueAxis({ name: 'Tầm quan trọng wₖ', nameLocation: 'middle', nameGap: 26, min: xMin, max: xMax, interval: xr.interval, axisLabel: { formatter: (v) => fmtNum(v, 2), color: t.muted }, splitLine: { show: false }, axisLine: { show: true, lineStyle: { color: t.axis } } }),
    yAxis: valueAxis({ name: 'Mức đạt x̄ₖ (trục thu hẹp)', min: yMin, max: yMax, interval: yr.interval, axisLabel: { formatter: (v) => fmtScore(v, Math.max(1, yr.decimals)), color: t.muted } }),
    tooltip: {
      ...base().tooltip,
      trigger: 'item',
      formatter: (prm) => {
        const p = prm.data?.p;
        if (!p) return '';
        const q = { improve: 'Ưu tiên cải tiến', maintain: 'Duy trì', monitor: 'Theo dõi', enough: 'Không cần đầu tư thêm' }[p.quadrant];
        const uni = p.universal === true ? '◆ Phổ quát (đạt bất biến)' : p.universal === false ? '○ Phụ thuộc bối cảnh' : 'Chưa có kết quả bất biến';
        return `<div style="font-weight:700">${esc(p.code)} · ${esc(p.name)}</div><div><b>${fmtScore(p.mean)}</b> mức đạt · w = ${fmtNum(p.w, 3)}</div><div style="color:${t.ink2}">${q} · ${uni}</div>`;
      },
    },
    series: [
      {
        type: 'scatter',
        data: pts.map((p) => ({
          value: [p.w, p.mean],
          p,
          symbol: p.universal === false ? 'emptyCircle' : 'diamond',
          itemStyle: { color: groupColor(p.group), borderColor: p.universal === false ? groupColor(p.group) : '#fff', borderWidth: 2 },
        })),
        symbolSize: 16,
        label: { show: true, formatter: (prm) => prm.data.p.code, position: 'right', color: t.ink, fontSize: 11, fontWeight: 600 },
        labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
        markLine: {
          silent: true, symbol: 'none', lineStyle: { color: t.grey, type: 'dashed', width: 1 },
          data: [{ xAxis: xCut, label: { formatter: '1/7', color: t.muted, fontSize: 10 } }, { yAxis: yCut, label: { formatter: fmtScore(yCut, 1), color: t.muted, fontSize: 10 } }],
        },
        markArea: {
          silent: true,
          data: [
            area(xCut, xMax, yMin, yCut, 'Ưu tiên cải tiến', 'rgba(194,69,61,0.06)'),
            area(xCut, xMax, yCut, yMax, 'Duy trì', 'rgba(46,125,79,0.05)'),
            area(xMin, xCut, yMin, yCut, 'Theo dõi', 'rgba(224,161,0,0.06)'),
            area(xMin, xCut, yCut, yMax, 'Không cần đầu tư thêm', 'rgba(91,100,120,0.04)'),
          ],
        },
      },
    ],
  };
}

// ---- Histogram tô 3 mức ----------------------------------------------------------------
export function histogramOption({ bins, metricName }) {
  const t = theme();
  const tint = { alert: t.alert, warn: t.warn, ok: t.ok };
  return {
    ...base(),
    grid: { left: 8, right: 12, top: 24, bottom: 30, containLabel: true },
    xAxis: categoryAxis(bins.map((b) => fmtScore(b.x0)), {
      name: metricName, nameLocation: 'middle', nameGap: 26,
      axisLabel: { color: t.muted, fontSize: 10, interval: (i) => i % 4 === 0 },
    }),
    yAxis: valueAxis({ name: 'Số phiếu', minInterval: 1 }),
    tooltip: {
      ...base().tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(39,44,99,0.05)' } },
      formatter: (items) => {
        const b = bins[items[0].dataIndex];
        return `<b style="font-size:14px">${fmtNum(b.count)}</b> phiếu<div style="color:${t.ink2}">${fmtScore(b.x0)} – ${b.x1 >= 5 ? '5,00' : `< ${fmtScore(b.x1)}`} · ${statusLabel(b.status)}</div>`;
      },
    },
    series: [
      {
        type: 'bar', barCategoryGap: 2, barMaxWidth: 24,
        data: bins.map((b) => ({ value: b.count, itemStyle: { color: tint[b.status], borderRadius: [3, 3, 0, 0] } })),
      },
    ],
  };
}

// ---- Xu hướng theo đợt + biểu đồ kiểm soát XmR -----------------------------------------------
export function trendOption({ school, scope, control, scopeName, metricName, yellowLine }) {
  const t = theme();
  const labels = school.map((p) => p.label);
  const all = [...school, ...(scope || [])].map((p) => p.mean).filter((v) => typeof v === 'number');
  if (control.enabled) all.push(control.ucl, control.lcl);
  const yr = niceRange(Math.min(...all) - 0.05, Math.max(...all) + 0.05, { min: 1, max: 5, target: 5 });
  const target = scope || school;
  const series = [
    {
      type: 'line', name: 'Toàn Trường', data: school.map((p) => p.mean), symbol: 'circle', symbolSize: 8,
      lineStyle: { color: scope ? t.na : t.blue, width: 2 }, itemStyle: { color: scope ? t.na : t.blue, borderColor: '#fff', borderWidth: 2 },
      endLabel: { show: true, formatter: (p) => `Trường ${fmtScore(p.value)}`, color: t.ink2, fontSize: 11 },
    },
  ];
  if (scope) {
    series.push({
      type: 'line', name: scopeName, data: scope.map((p) => p.mean), symbol: 'circle', symbolSize: 8,
      lineStyle: { color: t.blue, width: 2 }, itemStyle: { color: t.blue, borderColor: '#fff', borderWidth: 2 },
      endLabel: { show: true, formatter: (p) => `${fmtScore(p.value)}`, color: t.ink, fontSize: 11, fontWeight: 600 },
    });
  }
  if (control.enabled) {
    const idx = series.length - 1;
    series[idx].markLine = {
      silent: true, symbol: 'none',
      data: [
        { yAxis: control.ucl, label: { formatter: `UCL ${fmtScore(control.ucl)}` }, lineStyle: { type: 'dashed' } },
        { yAxis: control.cl, label: { formatter: `CL ${fmtScore(control.cl)}` }, lineStyle: { type: 'solid' } },
        { yAxis: control.lcl, label: { formatter: `LCL ${fmtScore(control.lcl)}` }, lineStyle: { type: 'dashed' } },
      ],
      lineStyle: { color: t.grey, width: 1 }, label: { color: t.muted, fontSize: 10, position: 'insideStartTop' },
    };
    series[idx].data = target.map((p) => ({
      value: p.mean,
      itemStyle: p.mean > control.ucl || p.mean < control.lcl ? { color: t.alert, borderColor: '#fff', borderWidth: 2 } : undefined,
      symbolSize: p.mean > control.ucl || p.mean < control.lcl ? 12 : 8,
    }));
  }
  return {
    ...base(),
    grid: { left: 8, right: 70, top: 30, bottom: 8, containLabel: true },
    xAxis: categoryAxis(labels, { boundaryGap: true, axisLabel: { color: t.muted, fontSize: 10, hideOverlap: true } }),
    yAxis: valueAxis({ name: `${metricName} (trục thu hẹp)`, min: yr.min, max: yr.max, interval: yr.interval, axisLabel: { formatter: (v) => fmtScore(v, Math.max(1, yr.decimals)), color: t.muted } }),
    tooltip: {
      ...base().tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: t.axis } },
      formatter: (items) => {
        const i = items[0].dataIndex;
        const rowsHtml = items
          .map((it) => {
            const src = it.seriesName === 'Toàn Trường' ? school[i] : scope?.[i];
            const color = it.seriesName === 'Toàn Trường' && scope ? t.na : t.blue;
            return `<div>${line(color)}<b>${fmtScore(src?.mean)}</b> <span style="color:${t.ink2}">${esc(it.seriesName)} · n = ${fmtNum(src?.n)}</span></div>`;
          })
          .join('');
        return `<div style="font-weight:700;margin-bottom:2px">${esc(labels[i])}</div>${rowsHtml}`;
      },
    },
    series: yellowLine ? [...series, { type: 'line', data: [], markLine: { silent: true, symbol: 'none', data: [{ yAxis: yellowLine }], lineStyle: { color: t.warn, type: [4, 4] }, label: { formatter: `ngưỡng ${fmtScore(yellowLine, 1)}`, color: t.muted, fontSize: 10, position: 'insideStartTop' } } }] : series,
  };
}

// ---- Biểu đồ khoảng (forest plot) – M4 ------------------------------------------------------
export function forestOption({ rows }) {
  const t = theme();
  const cats = rows.map((r) => `${r.code} ${r.name}`);
  const vals = rows.filter((r) => r.comparable).flatMap((r) => [r.lo, r.hi]);
  const xr = niceRange(-(Math.max(0.3, ...vals.map((v) => Math.abs(v))) + 0.04), Math.max(0.3, ...vals.map((v) => Math.abs(v))) + 0.04, { target: 6 });
  const ext = Math.max(Math.abs(xr.min), Math.abs(xr.max));
  return {
    ...base(),
    grid: { left: 8, right: 24, top: 30, bottom: 30, containLabel: true },
    xAxis: valueAxis({ name: 'Chênh lệch trung bình tiềm ẩn (TDU − đối sánh)', nameLocation: 'middle', nameGap: 26, min: -ext, max: ext, interval: xr.interval, axisLabel: { formatter: (v) => fmtSigned(v, 1), color: t.muted } }),
    yAxis: categoryAxis(cats, { inverse: true, axisLabel: { color: t.ink, fontSize: 11 } }),
    tooltip: {
      ...base().tooltip,
      trigger: 'item',
      formatter: (prm) => {
        const r = rows[prm.dataIndex];
        if (!r.comparable) return `<div style="font-weight:700">${esc(r.code)} · ${esc(r.name)}</div><div>Không đủ điều kiện so sánh</div><div style="color:${t.ink2}">${esc(r.reason)}</div>`;
        return `<div style="font-weight:700">${esc(r.code)} · ${esc(r.name)}</div><div><b style="font-size:14px">${fmtSigned(r.est)}</b> · KTC 95% [${fmtSigned(r.lo)}; ${fmtSigned(r.hi)}]</div><div style="color:${t.ink2}">${esc(r.reading)}</div>`;
      },
    },
    series: [
      {
        type: 'custom',
        renderItem: (params, api) => {
          const r = rows[params.dataIndex];
          const y = api.coord([0, params.dataIndex])[1];
          if (!r.comparable) {
            const [x0] = api.coord([-ext + 0.05, params.dataIndex]);
            return { type: 'text', style: { x: x0, y, text: 'Không đủ điều kiện so sánh', fill: t.muted, fontSize: 11, verticalAlign: 'middle' } };
          }
          const [xl] = api.coord([r.lo, params.dataIndex]);
          const [xh] = api.coord([r.hi, params.dataIndex]);
          const [xe] = api.coord([r.est, params.dataIndex]);
          const color = groupColor(r.group);
          return {
            type: 'group',
            children: [
              { type: 'line', shape: { x1: xl, y1: y, x2: xh, y2: y }, style: { stroke: color, lineWidth: 2 } },
              { type: 'line', shape: { x1: xl, y1: y - 6, x2: xl, y2: y + 6 }, style: { stroke: color, lineWidth: 2 } },
              { type: 'line', shape: { x1: xh, y1: y - 6, x2: xh, y2: y + 6 }, style: { stroke: color, lineWidth: 2 } },
              { type: 'rect', shape: { x: xe - 6, y: y - 6, width: 12, height: 12 }, style: { fill: color, stroke: '#fff', lineWidth: 2 } },
            ],
          };
        },
        data: rows.map((r, i) => [r.est ?? 0, i]),
        encode: { x: 0, y: 1 },
        markLine: { silent: true, symbol: 'none', data: [{ xAxis: 0 }], lineStyle: { color: t.ink2, width: 1 }, label: { show: false } },
      },
    ],
  };
}

// ---- M3: gắn kết × điểm quá trình -------------------------------------------------------------
export function studentScatterOption({ points, cfg }) {
  const t = theme();
  const byStatus = (s) => points.filter((p) => p.status === s).map((p) => ({ value: [p.eng, p.process], p }));
  const sc = (s) => ({
    type: 'scatter', name: STATUS[s].label, data: byStatus(s), symbol: STATUS_SYMBOL[s], symbolSize: s === 'ok' ? 9 : 12,
    itemStyle: { color: statusColor(s), borderColor: '#fff', borderWidth: 2, opacity: s === 'ok' ? 0.75 : 1 }, z: 3, silent: true,
  });
  const vline = (x, color, label) => ({ xAxis: x, lineStyle: { color, type: [4, 4], width: 1 }, label: { formatter: label, color: t.muted, fontSize: 10, position: 'end' } });
  const hline = (y, color, label) => ({ yAxis: y, lineStyle: { color, type: [4, 4], width: 1 }, label: { formatter: label, color: t.muted, fontSize: 10, position: 'insideEndTop' } });
  return {
    ...base(),
    grid: { left: 8, right: 24, top: 30, bottom: 30, containLabel: true },
    xAxis: valueAxis({ name: 'Điểm gắn kết (1 – 5)', nameLocation: 'middle', nameGap: 26, min: 1, max: 5, interval: 0.5, axisLabel: { formatter: (v) => fmtScore(v, 1), color: t.muted } }),
    yAxis: valueAxis({ name: 'Điểm quá trình (0 – 10)', min: 0, max: 10, interval: 2 }),
    tooltip: {
      ...base().tooltip,
      trigger: 'item',
      formatter: (prm) => {
        const p = prm.data?.p;
        if (!p) return '';
        return `<div style="font-weight:700">${esc(p.researchCode)}</div><div style="color:${t.ink2}">${esc(p.cls?.name ?? '')}</div>
          <div>Gắn kết <b>${fmtScore(p.eng)}</b> · Điểm quá trình <b>${fmtScore(p.process, 1)}</b></div>
          <div>${statusLabel(p.status)}${p.prob !== null ? ` · nguy cơ ${fmtPct(p.prob)}` : ''}</div>`;
      },
    },
    series: [
      {
        type: 'scatter', data: [], silent: true,
        markLine: { silent: true, symbol: 'none', data: [vline(cfg.stuEngYellow, t.warn, `gắn kết ${fmtScore(cfg.stuEngYellow, 1)}`), vline(cfg.stuEngRed, t.alert, fmtScore(cfg.stuEngRed, 1)), hline(cfg.stuProcYellow, t.warn, `QT ${fmtScore(cfg.stuProcYellow, 1)}`), hline(cfg.stuProcRed, t.alert, `QT ${fmtScore(cfg.stuProcRed, 1)}`)] },
        markArea: {
          silent: true,
          data: [
            [{ xAxis: 1, yAxis: 0, itemStyle: { color: 'rgba(194,69,61,0.05)' }, label: { show: true, formatter: 'Gắn kết thấp · điểm thấp', position: 'insideBottomLeft', color: t.ink2, fontSize: 10 } }, { xAxis: cfg.stuEngYellow, yAxis: cfg.stuProcYellow }],
            [{ xAxis: cfg.stuEngYellow, yAxis: cfg.stuProcYellow, itemStyle: { color: 'rgba(46,125,79,0.04)' }, label: { show: true, formatter: 'Ổn định', position: 'insideTopRight', color: t.ink2, fontSize: 10 } }, { xAxis: 5, yAxis: 10 }],
          ],
        },
      },
      sc('ok'),
      sc('warn'),
      sc('alert'),
      { type: 'scatter', name: 'hit', data: points.map((p) => ({ value: [p.eng, p.process], p })), symbolSize: 24, itemStyle: { color: t.navy, opacity: 0 }, emphasis: { itemStyle: { opacity: 0.12 } }, z: 4 },
    ],
  };
}

// ---- TC1: đường ROC --------------------------------------------------------------------------
export function rocOption({ points, youden }) {
  const t = theme();
  return {
    ...base(),
    grid: { left: 8, right: 16, top: 24, bottom: 30, containLabel: true },
    xAxis: valueAxis({ name: '1 − Độ đặc hiệu (FPR)', nameLocation: 'middle', nameGap: 26, min: 0, max: 1, interval: 0.2, axisLabel: { formatter: (v) => fmtNum(v, 1), color: t.muted } }),
    yAxis: valueAxis({ name: 'Độ nhạy (TPR)', min: 0, max: 1, interval: 0.2, axisLabel: { formatter: (v) => fmtNum(v, 1), color: t.muted } }),
    tooltip: {
      ...base().tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: t.axis } },
      formatter: (items) => {
        const it = items.find((x) => x.seriesName === 'ROC');
        if (!it) return '';
        const [fpr, tpr] = it.value;
        return `Độ nhạy <b>${fmtNum(tpr, 2)}</b> · FPR <b>${fmtNum(fpr, 2)}</b>`;
      },
    },
    series: [
      { type: 'line', name: 'Ngẫu nhiên', data: [[0, 0], [1, 1]], showSymbol: false, silent: true, lineStyle: { color: t.axis, type: 'dashed', width: 1 } },
      {
        type: 'line', name: 'ROC', data: points.map((p) => [p.fpr, p.tpr]), showSymbol: false, step: false,
        lineStyle: { color: t.navy, width: 2 }, areaStyle: { color: 'rgba(39,44,99,0.06)' },
        markPoint: youden
          ? { symbol: 'circle', symbolSize: 12, itemStyle: { color: t.blue, borderColor: '#fff', borderWidth: 2 }, data: [{ coord: [youden.fpr, youden.tpr], value: 'Youden' }], label: { show: true, formatter: 'Youden', position: 'right', color: t.ink, fontSize: 11 } }
          : undefined,
      },
    ],
  };
}

// ---- TC2: tỷ lệ báo động giả theo sĩ số -------------------------------------------------------------
export function falseAlarmOption({ buckets, limit = 0.05 }) {
  const t = theme();
  return {
    ...base(),
    grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
    xAxis: categoryAxis(buckets.map((b) => `n ${b.label}`)),
    yAxis: valueAxis({ name: 'Tỷ lệ cảnh báo đỏ', min: 0, max: (v) => Math.max(0.1, Math.ceil(v.max * 20) / 20), axisLabel: { formatter: (v) => fmtPct(v), color: t.muted } }),
    tooltip: {
      ...base().tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(39,44,99,0.05)' } },
      formatter: (items) => {
        const b = buckets[items[0].dataIndex];
        return `<b style="font-size:14px">${fmtPct(b.runs ? b.alert / b.runs : 0, 1)}</b> báo động giả<div style="color:${t.ink2}">${fmtNum(b.alert)}/${fmtNum(b.runs)} lớp mô phỏng · n ${esc(b.label)}</div>`;
      },
    },
    series: [
      {
        type: 'bar', barMaxWidth: 24,
        data: buckets.map((b) => ({ value: b.runs ? b.alert / b.runs : 0, itemStyle: { color: t.navy, borderRadius: [4, 4, 0, 0] } })),
        label: { show: true, position: 'top', formatter: (p) => fmtPct(p.value, 1), color: t.ink2, fontSize: 10 },
        markLine: { silent: true, symbol: 'none', data: [{ yAxis: limit }], lineStyle: { color: t.alert, type: 'dashed', width: 1 }, label: { formatter: `ngưỡng TC2 ${fmtPct(limit)}`, color: t.muted, fontSize: 10, position: 'insideEndTop' } },
      },
    ],
  };
}
