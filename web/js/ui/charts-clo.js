// Biểu đồ của M6 – Kết quả học tập theo CLO (Apache ECharts, cùng quy ước với ui/charts.js):
// luôn ghi n; ngưỡng/mục tiêu là đường đứt có nhãn; một trục giá trị (không biểu đồ hai trục);
// màu trạng thái chỉ dùng cho trạng thái và luôn kèm hình dạng, chữ; mọi biểu đồ có "Xem dạng bảng".
import { fmtNum, fmtPct, fmtScore } from '../core/format.js';
import { base, categoryAxis, statusColor, theme, valueAxis } from './charts.js';
import { esc } from './dom.js';

const line = (color, dashed = false) => `<span style="display:inline-block;width:14px;height:0;border-top:2px ${dashed ? 'dashed' : 'solid'} ${color};vertical-align:middle;margin-right:6px"></span>`;

// Histogram điểm (thang 10, bước 0,5) – cột tô theo trạng thái so với ngưỡng, đường ngưỡng đạt.
export function cloHistogramOption({ bins, label, pass, near }) {
  const t = theme();
  const ymax = Math.max(4, ...bins.map((b) => b.count));
  const tint = { alert: t.alert, warn: t.warn, ok: t.ok };
  return {
    ...base(),
    grid: { left: 8, right: 16, top: 30, bottom: 30, containLabel: true },
    xAxis: valueAxis({ min: 0, max: 10, interval: 1, name: label, nameLocation: 'middle', nameGap: 26, splitLine: { show: false }, axisLine: { show: true, lineStyle: { color: t.axis } }, axisTick: { show: true, lineStyle: { color: t.axis } }, axisLabel: { formatter: (v) => fmtNum(v, 0), color: t.muted } }),
    yAxis: valueAxis({ name: 'Số sinh viên', minInterval: 1, max: Math.ceil(ymax * 1.15) }),
    tooltip: {
      ...base().tooltip,
      trigger: 'item',
      formatter: (prm) => {
        const b = bins[prm.dataIndex];
        if (!b) return '';
        const st = b.status === 'alert' ? '✖ Dưới ngưỡng' : b.status === 'warn' ? '⚠ Sát ngưỡng' : '✔ Đạt ngưỡng';
        return `<b style="font-size:14px">${fmtNum(b.count)}</b> sinh viên<div style="color:${t.ink2}">${fmtScore(b.x0, 1)} – ${b.x1 >= 10 ? '10' : `< ${fmtScore(b.x1, 1)}`} · ${st}</div>`;
      },
    },
    series: [
      {
        type: 'custom',
        data: bins.map((b, i) => [b.x0, b.x1, b.count, i]),
        encode: { x: [0, 1], y: 2 },
        renderItem: (params, api) => {
          const b = bins[params.dataIndex];
          if (!b.count) return null;
          const [x0, y0] = api.coord([b.x0, b.count]);
          const [x1, y1] = api.coord([b.x1, 0]);
          return { type: 'rect', shape: { x: x0 + 1, y: y0, width: Math.max(1, x1 - x0 - 2), height: y1 - y0, r: [3, 3, 0, 0] }, style: { fill: tint[b.status] } };
        },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{ xAxis: pass, label: { formatter: `ngưỡng ${fmtScore(pass, 1)}` } }],
          lineStyle: { color: t.ink2, type: [4, 4], width: 1.5 },
          label: { color: t.ink2, fontSize: 11, position: 'insideEndTop' },
        },
        markArea: near
          ? { silent: true, data: [[{ xAxis: Math.max(0, pass - near), itemStyle: { color: 'rgba(224,161,0,0.07)' } }, { xAxis: Math.min(10, pass + near) }]] }
          : undefined,
      },
    ],
  };
}

// Box plot so sánh lớp/học kỳ (cùng chỉ số, cùng thang). Lớp đang xem màu nhấn; tạm tính, không tương đương làm mờ.
export function cloBoxOption({ boxes, label, pass }) {
  const t = theme();
  const cats = boxes.map((b) => `${b.label.replace(' · ', '\n')}${b.inProgress ? ' *' : ''}`);
  const data = boxes.map((b) => (b.stats ? [b.stats.whiskerLo, b.stats.q1, b.stats.median, b.stats.q3, b.stats.whiskerHi] : [null, null, null, null, null]));
  return {
    ...base(),
    grid: { left: 8, right: 16, top: 30, bottom: 30, containLabel: true },
    xAxis: categoryAxis(cats, { axisLabel: { color: t.ink2, fontSize: 10, interval: 0, lineHeight: 13 } }),
    yAxis: valueAxis({ name: label, min: 0, max: 10, interval: 2 }),
    tooltip: {
      ...base().tooltip,
      trigger: 'item',
      formatter: (prm) => {
        const b = boxes[prm.dataIndex];
        if (!b) return '';
        if (prm.seriesType === 'scatter') return `Giá trị ngoại lai <b>${fmtScore(prm.value[1], 2)}</b> · ${esc(b.label)}`;
        if (!b.stats) return `${esc(b.label)}: chưa có dữ liệu`;
        const s = b.stats;
        return `<div style="font-weight:700">${esc(b.cls?.name ?? b.label)}</div><div style="color:${t.ink2}">n = ${fmtNum(b.n)}${b.version ? ` · bộ quy tắc ${esc(b.version)}` : ''}${b.inProgress ? ' · tạm tính' : ''}</div>
          <div>Trung vị <b>${fmtScore(s.median)}</b> · tứ phân vị ${fmtScore(s.q1)} – ${fmtScore(s.q3)}</div><div style="color:${t.ink2}">TB ${fmtScore(s.mean)} · thấp nhất ${fmtScore(s.min)} · cao nhất ${fmtScore(s.max)}</div>${b.comparable === false ? '<div style="color:#9a2f28">Khác bộ quy tắc – không so sánh trực tiếp</div>' : ''}`;
      },
    },
    series: [
      {
        type: 'boxplot',
        data: data.map((d, i) => ({
          value: d,
          itemStyle: {
            color: boxes[i].current ? 'rgba(47,107,179,0.18)' : 'rgba(91,100,120,0.10)',
            borderColor: boxes[i].current ? t.navy : boxes[i].inProgress || boxes[i].comparable === false ? t.na : t.grey,
            borderWidth: boxes[i].current ? 2 : 1.4,
          },
        })),
        boxWidth: [12, 34],
        markLine: pass !== undefined ? { silent: true, symbol: 'none', data: [{ yAxis: pass }], lineStyle: { color: t.ink2, type: [4, 4], width: 1 }, label: { formatter: `ngưỡng ${fmtScore(pass, 1)}`, color: t.muted, fontSize: 10, position: 'insideEndTop' } } : undefined,
      },
      {
        type: 'scatter',
        data: boxes.flatMap((b, i) => (b.stats?.outliers || []).map((v) => [i, v])),
        symbolSize: 7,
        itemStyle: { color: '#fff', borderColor: t.grey, borderWidth: 1.5 },
      },
    ],
  };
}

// Tỷ lệ đạt theo CLO – thanh ngang, đường mục tiêu; màu theo trạng thái so với mục tiêu.
export function cloBarOption({ bars, target }) {
  const t = theme();
  const cats = bars.map((b) => (b.notAssessed ? `${b.code}\n(chưa ĐG)` : b.code));
  return {
    ...base(),
    grid: { left: 8, right: 70, top: 24, bottom: 26, containLabel: true },
    yAxis: categoryAxis(cats, { inverse: true, axisLabel: { color: t.ink, fontWeight: 600, fontSize: 12 } }),
    xAxis: valueAxis({ min: 0, max: 100, interval: 20, name: 'Tỷ lệ sinh viên đạt (%)', nameLocation: 'middle', nameGap: 24, axisLabel: { formatter: '{value}%', color: t.muted } }),
    tooltip: {
      ...base().tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(39,44,99,0.05)' } },
      formatter: (items) => {
        const b = bars[items[0].dataIndex];
        if (b.notAssessed) return `<b>${esc(b.code)}</b> · chưa có bài đánh giá trong học kỳ`;
        return `<div style="font-weight:700">${esc(b.code)} · ${esc(b.short)}</div><div><b style="font-size:14px">${fmtPct(b.rate)}</b> đạt (${fmtNum(b.nAchieved)}/${fmtNum(b.n)} đủ minh chứng)</div>
          <div style="color:${t.ink2}">Điểm CLO TB ${fmtScore(b.mean)} · ${fmtNum(b.nInsufficient)} chưa đủ minh chứng</div>${b.course !== null && b.course !== undefined ? `<div style="color:${t.ink2}">Cả học phần cùng học kỳ: ${fmtPct(b.course)} (n = ${fmtNum(b.courseN)})</div>` : ''}`;
      },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 22,
        data: bars.map((b) => ({ value: b.notAssessed || b.rate === null ? null : +(b.rate * 100).toFixed(1), itemStyle: { color: statusColor(b.status === 'none' ? 'na' : b.status), borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', color: t.ink2, fontSize: 11, formatter: (p) => { const b = bars[p.dataIndex]; return b.notAssessed ? 'chưa đánh giá' : `${fmtPct(b.rate)} · n ${b.n}`; } },
        markLine: { silent: true, symbol: 'none', data: [{ xAxis: target * 100 }], lineStyle: { color: t.ink2, type: [4, 4], width: 1.5 }, label: { formatter: `mục tiêu ${fmtPct(target)}`, color: t.ink2, fontSize: 10, position: 'start', distance: 4 } },
      },
    ],
  };
}

// Radar hồ sơ CLO: cùng chỉ số (tỷ lệ đạt %) trên mọi trục; lớp so với cả học phần cùng học kỳ và mục tiêu.
export function cloRadarOption({ bars, target, showCourse = true }) {
  const t = theme();
  const used = bars.filter((b) => !b.notAssessed && b.rate !== null);
  const series = [
    { value: used.map(() => target * 100), name: `Mục tiêu ${fmtPct(target)}`, lineStyle: { color: t.ink2, type: [4, 4], width: 1.2 }, itemStyle: { color: t.ink2 }, symbol: 'none', areaStyle: { opacity: 0 } },
  ];
  if (showCourse) series.push({ value: used.map((b) => (b.course === null ? 0 : +(b.course * 100).toFixed(1))), name: 'Cả học phần (cùng học kỳ)', lineStyle: { color: t.grey, width: 1.5 }, itemStyle: { color: t.grey }, symbol: 'circle', symbolSize: 6, areaStyle: { opacity: 0 } });
  series.push({ value: used.map((b) => +(b.rate * 100).toFixed(1)), name: 'Lớp', lineStyle: { color: t.navy, width: 2.2 }, itemStyle: { color: t.navy, borderColor: '#fff', borderWidth: 1.5 }, symbol: 'circle', symbolSize: 8, areaStyle: { color: 'rgba(39,44,99,0.10)' } });
  return {
    ...base(),
    tooltip: {
      ...base().tooltip,
      trigger: 'item',
      formatter: (p) => `<div style="font-weight:700">${esc(p.name)}</div>${used.map((b, i) => `<div>${esc(b.code)}: <b>${fmtNum(p.value[i], 0)}%</b></div>`).join('')}`,
    },
    radar: {
      radius: '66%',
      center: ['50%', '54%'],
      indicator: used.map((b) => ({ name: b.code, max: 100, min: 0 })),
      splitNumber: 5,
      axisName: { color: t.ink, fontWeight: 600, fontSize: 12 },
      splitLine: { lineStyle: { color: t.grid } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: t.grid } },
    },
    series: [{ type: 'radar', data: series }],
  };
}

// Pareto dạng lỗi – một trục 0–100%: cột là tỷ trọng lượt lỗi, đường là cộng dồn. Không vẽ sẵn mốc 80%.
export function errorParetoOption({ rows }) {
  const t = theme();
  return {
    ...base(),
    grid: { left: 8, right: 24, top: 30, bottom: 8, containLabel: true },
    xAxis: categoryAxis(rows.map((r) => r.code), { axisLabel: { color: t.ink, fontWeight: 600, fontSize: 11, interval: 0 } }),
    yAxis: valueAxis({ name: 'Tỷ trọng lượt lỗi (%)', min: 0, max: 100, interval: 20, axisLabel: { formatter: '{value}%', color: t.muted } }),
    tooltip: {
      ...base().tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(39,44,99,0.05)' } },
      formatter: (items) => {
        const r = rows[items[0].dataIndex];
        return `<div style="font-weight:700">${esc(r.code)} · ${esc(r.label)}</div><div><b>${fmtNum(r.count)}</b> lượt lỗi (${fmtPct(r.share, 1)}) · cộng dồn <b>${fmtPct(r.cumShare, 0)}</b></div><div style="color:${t.ink2}">${fmtNum(r.students)} sinh viên mắc · nhóm ${esc(r.group)}</div>`;
      },
    },
    series: [
      {
        type: 'bar', name: 'Tỷ trọng', barMaxWidth: 26,
        data: rows.map((r) => ({ value: +(r.share * 100).toFixed(1), itemStyle: { color: t.navy, borderRadius: [4, 4, 0, 0] } })),
        label: { show: true, position: 'top', formatter: (p) => fmtNum(rows[p.dataIndex].count), color: t.ink2, fontSize: 10 },
      },
      {
        type: 'line', name: 'Cộng dồn', data: rows.map((r) => +(r.cumShare * 100).toFixed(1)), symbol: 'circle', symbolSize: 8,
        lineStyle: { color: t.gold, width: 2 }, itemStyle: { color: t.gold, borderColor: '#fff', borderWidth: 2 },
      },
    ],
  };
}

// Điểm quá trình × điểm thi: mỗi điểm một sinh viên; đường chéo y = x và dải ± ngưỡng chênh lệch cần xem lại.
export function gapScatterOption({ points, gap }) {
  const t = theme();
  const normal = points.filter((p) => !p.flagged);
  const flagged = points.filter((p) => p.flagged);
  return {
    ...base(),
    grid: { left: 8, right: 24, top: 30, bottom: 30, containLabel: true },
    xAxis: valueAxis({ name: 'Điểm quá trình (A1)', nameLocation: 'middle', nameGap: 26, min: 0, max: 10, interval: 2, splitLine: { show: false }, axisLine: { show: true, lineStyle: { color: t.axis } } }),
    yAxis: valueAxis({ name: 'Điểm thi cuối kỳ (A2)', min: 0, max: 10, interval: 2 }),
    tooltip: {
      ...base().tooltip,
      trigger: 'item',
      formatter: (prm) => {
        const p = prm.data?.p;
        if (!p) return '';
        return `<div style="font-weight:700">${esc(p.code)}</div><div>Quá trình <b>${fmtScore(p.x, 1)}</b> · thi <b>${fmtScore(p.y, 1)}</b></div>${p.flagged ? `<div style="color:#6b4d00">⚠ Chênh lệch ≥ ${fmtScore(gap, 1)} điểm – cần xem lại</div>` : ''}`;
      },
    },
    series: [
      { type: 'line', data: [[0, 0], [10, 10]], showSymbol: false, silent: true, lineStyle: { color: t.axis, width: 1 }, z: 1 },
      { type: 'line', data: [[gap, 0], [10, 10 - gap]], showSymbol: false, silent: true, lineStyle: { color: t.warn, type: [4, 4], width: 1 }, z: 1 },
      { type: 'line', data: [[0, gap], [10 - gap, 10]], showSymbol: false, silent: true, lineStyle: { color: t.warn, type: [4, 4], width: 1 }, z: 1 },
      { type: 'scatter', name: 'Sinh viên', data: normal.map((p) => ({ value: [p.x, p.y], p })), symbolSize: 9, itemStyle: { color: t.navy, opacity: 0.7, borderColor: '#fff', borderWidth: 1.5 }, z: 3 },
      { type: 'scatter', name: 'Cần xem lại', data: flagged.map((p) => ({ value: [p.x, p.y], p })), symbol: 'triangle', symbolSize: 13, itemStyle: { color: t.warn, borderColor: '#fff', borderWidth: 1.5 }, z: 4 },
      { type: 'scatter', name: 'hit', data: points.map((p) => ({ value: [p.x, p.y], p })), symbolSize: 24, itemStyle: { color: t.navy, opacity: 0 }, emphasis: { itemStyle: { opacity: 0.12 } }, z: 5 },
    ],
  };
}

// Biểu đồ diễn biến (run chart): tỷ lệ đạt qua học kỳ, đường trung vị, đường mục tiêu, mốc thực hiện cải tiến.
export function cloRunOption({ points, median, target, markers = [] }) {
  const t = theme();
  const cats = points.map((p) => p.label);
  return {
    ...base(),
    grid: { left: 8, right: 30, top: 34, bottom: 8, containLabel: true },
    xAxis: categoryAxis(cats, { boundaryGap: true, axisLabel: { color: t.ink2, fontSize: 11 } }),
    yAxis: valueAxis({ name: 'Tỷ lệ sinh viên đạt (%)', min: 0, max: 100, interval: 20, axisLabel: { formatter: '{value}%', color: t.muted } }),
    tooltip: {
      ...base().tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: t.axis } },
      formatter: (items) => {
        const p = points[items[0].dataIndex];
        return `<div style="font-weight:700">${esc(p.label)}</div><div><b style="font-size:14px">${fmtPct(p.value)}</b> đạt · ${fmtNum(p.k)}/${fmtNum(p.n)} sinh viên</div><div style="color:${t.ink2}">${fmtNum(p.classes)} lớp · bộ quy tắc ${esc(p.version)}${p.inProgress ? ' · tạm tính (học kỳ đang diễn ra)' : ''}</div>`;
      },
    },
    series: [
      {
        type: 'line', name: 'Tỷ lệ đạt',
        data: points.map((p) => ({ value: p.value === null ? null : +(p.value * 100).toFixed(1), symbol: p.inProgress ? 'emptyCircle' : 'circle', symbolSize: p.inProgress ? 10 : 9, itemStyle: { color: t.blue, borderColor: p.inProgress ? t.blue : '#fff', borderWidth: 2 } })),
        lineStyle: { color: t.blue, width: 2 },
        markLine: {
          silent: true, symbol: 'none',
          data: [
            ...(median !== null && median !== undefined ? [{ yAxis: median * 100, lineStyle: { color: t.grey, type: 'solid', width: 1 }, label: { formatter: `trung vị ${fmtPct(median)}`, position: 'insideStartTop', color: t.muted, fontSize: 10 } }] : []),
            { yAxis: target * 100, lineStyle: { color: t.ink2, type: [4, 4], width: 1.2 }, label: { formatter: `mục tiêu ${fmtPct(target)} (không phải giới hạn kiểm soát)`, position: 'insideEndTop', color: t.ink2, fontSize: 10 } },
            ...markers.map((m) => ({ xAxis: m.at, lineStyle: { color: t.gold, type: 'solid', width: 1.5 }, label: { formatter: m.label, position: 'end', color: '#8a5f0e', fontSize: 10 } })),
          ],
        },
      },
    ],
  };
}

// Bản đồ chất lượng câu hỏi: độ khó p (trục ngang) × độ phân biệt D (trục dọc), vùng cần xem lại tô nhạt.
export function itemMapOption({ rows, th }) {
  const t = theme();
  const flaggedRow = (r) => r.flags.some((f) => f.level !== 'info');
  const ok = rows.filter((r) => !flaggedRow(r));
  const bad = rows.filter(flaggedRow);
  const ys = rows.map((r) => r.D).filter((v) => v !== null && v !== undefined);
  const yMin = Math.min(-0.2, Math.floor(Math.min(0, ...ys) * 10) / 10);
  return {
    ...base(),
    grid: { left: 8, right: 24, top: 30, bottom: 30, containLabel: true },
    xAxis: valueAxis({ name: 'Độ khó p (tỷ lệ điểm đạt được)', nameLocation: 'middle', nameGap: 26, min: 0, max: 1, interval: 0.2, axisLabel: { formatter: (v) => fmtNum(v, 1), color: t.muted }, splitLine: { show: false }, axisLine: { show: true, lineStyle: { color: t.axis } } }),
    yAxis: valueAxis({ name: 'Độ phân biệt D', min: yMin, max: 1, interval: 0.2, axisLabel: { formatter: (v) => fmtNum(v, 1), color: t.muted } }),
    tooltip: {
      ...base().tooltip,
      trigger: 'item',
      formatter: (prm) => {
        const r = prm.data?.r;
        if (!r) return '';
        return `<div style="font-weight:700">${esc(r.title)}</div><div>p = <b>${fmtNum(r.p, 2)}</b> · D = <b>${fmtNum(r.D, 2)}</b> · n = ${fmtNum(r.n)}</div>${r.flags.length ? `<div style="color:#6b4d00">${esc(r.flags.map((f) => f.label).join(' · '))}</div>` : ''}`;
      },
    },
    series: [
      {
        type: 'scatter', data: [], silent: true,
        markArea: {
          silent: true,
          data: [
            [{ xAxis: 0, yAxis: yMin, itemStyle: { color: 'rgba(224,161,0,0.07)' }, label: { show: true, formatter: 'Phân biệt kém', position: 'insideBottomLeft', color: t.ink2, fontSize: 10 } }, { xAxis: 1, yAxis: th.disc }],
            [{ xAxis: th.easy, yAxis: th.disc, itemStyle: { color: 'rgba(91,100,120,0.06)' }, label: { show: true, formatter: 'Quá dễ', position: 'insideTopRight', color: t.ink2, fontSize: 10 } }, { xAxis: 1, yAxis: 1 }],
            [{ xAxis: 0, yAxis: th.disc, itemStyle: { color: 'rgba(91,100,120,0.06)' }, label: { show: true, formatter: 'Quá khó', position: 'insideTopLeft', color: t.ink2, fontSize: 10 } }, { xAxis: th.hard, yAxis: 1 }],
          ],
        },
        markLine: { silent: true, symbol: 'none', data: [{ yAxis: 0 }], lineStyle: { color: t.axis, width: 1 }, label: { show: false } },
      },
      { type: 'scatter', name: 'Đạt yêu cầu', data: ok.map((r) => ({ value: [r.p, r.D], r })), symbol: 'circle', symbolSize: 9, itemStyle: { color: t.navy, opacity: 0.75, borderColor: '#fff', borderWidth: 1.5 }, z: 3 },
      { type: 'scatter', name: 'Cần xem lại', data: bad.map((r) => ({ value: [r.p, r.D], r })), symbol: 'triangle', symbolSize: 13, itemStyle: { color: t.warn, borderColor: '#fff', borderWidth: 1.5 }, label: { show: true, formatter: (p) => p.data.r.short, position: 'right', color: t.ink, fontSize: 10 }, labelLayout: { hideOverlap: true }, z: 4 },
      { type: 'scatter', name: 'hit', data: rows.map((r) => ({ value: [r.p, r.D], r })), symbolSize: 24, itemStyle: { color: t.navy, opacity: 0 }, emphasis: { itemStyle: { opacity: 0.12 } }, z: 5 },
    ],
  };
}

// Đối chiếu hai cán bộ chấm: điểm vòng 1 × vòng 2 (gộp các cặp trùng thành bong bóng), đường chéo và dải ± dung sai.
export function raterScatterOption({ points, max, tol }) {
  const t = theme();
  const agg = new Map();
  for (const p of points) {
    const k = `${p.a}|${p.b}`;
    agg.set(k, { a: p.a, b: p.b, n: (agg.get(k)?.n || 0) + 1 });
  }
  const data = [...agg.values()];
  const inBand = data.filter((d) => Math.abs(d.b - d.a) <= tol + 1e-9);
  const out = data.filter((d) => Math.abs(d.b - d.a) > tol + 1e-9);
  const size = (n) => 8 + 4 * Math.sqrt(n);
  return {
    ...base(),
    grid: { left: 8, right: 24, top: 30, bottom: 30, containLabel: true },
    xAxis: valueAxis({ name: 'Cán bộ chấm 1', nameLocation: 'middle', nameGap: 26, min: 0, max, interval: max <= 3 ? 0.5 : 1, axisLabel: { formatter: (v) => fmtNum(v, 1), color: t.muted }, splitLine: { show: false }, axisLine: { show: true, lineStyle: { color: t.axis } } }),
    yAxis: valueAxis({ name: 'Cán bộ chấm 2', min: 0, max, interval: max <= 3 ? 0.5 : 1, axisLabel: { formatter: (v) => fmtNum(v, 1), color: t.muted } }),
    tooltip: {
      ...base().tooltip,
      trigger: 'item',
      formatter: (prm) => {
        const d = prm.data?.d;
        if (!d) return '';
        return `Vòng 1 <b>${fmtNum(d.a, 2)}</b> · vòng 2 <b>${fmtNum(d.b, 2)}</b><div style="color:${t.ink2}">${fmtNum(d.n)} bài · lệch ${fmtNum(d.b - d.a, 2)}</div>`;
      },
    },
    series: [
      { type: 'line', data: [[0, 0], [max, max]], showSymbol: false, silent: true, lineStyle: { color: t.axis, width: 1 } },
      { type: 'line', data: [[tol, 0], [max, max - tol]], showSymbol: false, silent: true, lineStyle: { color: t.warn, type: [4, 4], width: 1 } },
      { type: 'line', data: [[0, tol], [max - tol, max]], showSymbol: false, silent: true, lineStyle: { color: t.warn, type: [4, 4], width: 1 } },
      { type: 'scatter', name: 'Trong dung sai', data: inBand.map((d) => ({ value: [d.a, d.b], d, symbolSize: size(d.n) })), itemStyle: { color: t.navy, opacity: 0.6, borderColor: '#fff', borderWidth: 1 } },
      { type: 'scatter', name: 'Lệch quá dung sai', data: out.map((d) => ({ value: [d.a, d.b], d, symbolSize: size(d.n) })), symbol: 'triangle', itemStyle: { color: t.warn, borderColor: '#fff', borderWidth: 1 } },
    ],
  };
}

export const legendLine = line;
