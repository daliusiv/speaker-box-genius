/**
 * A plain x–y chart for guide figures whose horizontal axis isn't frequency (watts against load
 * impedance, box size against Qts, an error against a taper). Drawn as SVG at build, in the
 * app's chart card and with its grid and tick styles, at the same phone and desktop widths as the
 * app's charts (site/guideCharts.ts). No interaction: a figure, not a tool.
 */

export interface XYSeries {
  label: string;
  color: string;
  points: [number, number][];
  dash?: string;
}
export interface XYPlot {
  title: string;
  /** Axis names, with units: "load impedance, Ω". */
  xLabel: string;
  yLabel: string;
  x: { min: number; max: number; log?: boolean; ticks: number[] };
  y: { min: number; max: number; ticks: number[] };
  series: XYSeries[];
  /** Marked points (datasheet ratings, a driver's own value), labelled beside the dot. */
  dots?: { x: number; y: number; label: string }[];
  /** Spans along the x axis under the plot (an impedance range), one row each. */
  ranges?: { label: string; color: string; from: number; to: number }[];
}

const WIDTHS = { narrow: 360, wide: 700 } as const;
let next = 0;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString("en-GB") : String(Math.round(v * 100) / 100)).replace(/^-/, "−");

function draw(p: XYPlot, width: number): string {
  const fs = 12;
  const left = 44, right = 12, top = 22;
  const rangeRow = 28;
  const plotH = Math.round(width * 0.5);
  const bottom = 38 + (p.ranges?.length ?? 0) * rangeRow + (p.ranges?.length ? 6 : 0);
  const H = top + plotH + bottom;
  const iw = width - left - right;
  const sx = (x: number) =>
    left + (p.x.log ? Math.log(x / p.x.min) / Math.log(p.x.max / p.x.min) : (x - p.x.min) / (p.x.max - p.x.min)) * iw;
  const sy = (y: number) => top + (1 - (y - p.y.min) / (p.y.max - p.y.min)) * plotH;
  const out: string[] = [];
  out.push(`<svg viewBox="0 0 ${width} ${H}" role="img" aria-label="${esc(p.title)}">`);
  for (const t of p.x.ticks) out.push(`<line class="grid" x1="${sx(t)}" x2="${sx(t)}" y1="${top}" y2="${top + plotH}"/><text class="tick" x="${sx(t)}" y="${top + plotH + 16}" text-anchor="middle" style="font-size:${fs}px">${num(t)}</text>`);
  for (const t of p.y.ticks) out.push(`<line class="grid" x1="${left}" x2="${width - right}" y1="${sy(t)}" y2="${sy(t)}"/><text class="tick" x="${left - 6}" y="${sy(t) + 4}" text-anchor="end" style="font-size:${fs}px">${num(t)}</text>`);
  out.push(`<text class="tick unit-label" x="${left - 6}" y="${top - 8}" text-anchor="end" style="font-size:${fs}px">${esc(p.yLabel)}</text>`);
  out.push(`<text class="tick unit-label" x="${width - right}" y="${top + plotH + 28}" text-anchor="end" style="font-size:${fs}px">${esc(p.xLabel)}</text>`);
  // Deterministic ids (a page's HTML must be the same every build, for the sitemap's dates).
  const clip = `xy${next++}`;
  out.push(`<defs><clipPath id="${clip}"><rect x="${left}" y="${top}" width="${iw}" height="${plotH}"/></clipPath></defs><g clip-path="url(#${clip})">`);
  for (const s of p.series) {
    const d = s.points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("");
    out.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/>`);
  }
  out.push(`</g>`);
  for (const d of p.dots ?? []) {
    const x = sx(d.x), y = sy(d.y);
    const anchor = x > left + iw * 0.7 ? "end" : "start";
    out.push(`<circle cx="${x}" cy="${y}" r="4" fill="var(--fg, #e6e9ef)"/><text x="${anchor === "end" ? x - 7 : x + 7}" y="${y - 7}" text-anchor="${anchor}" style="font-size:${fs}px;fill:var(--fg, #e6e9ef)">${esc(d.label)}</text>`);
  }
  (p.ranges ?? []).forEach((r, i) => {
    // A bar along the axis, its label just above it in the bar's colour, kept inside the chart.
    const y = top + plotH + 52 + i * rangeRow;
    const a = sx(Math.max(r.from, p.x.min)), b = sx(Math.min(r.to, p.x.max));
    const textW = r.label.length * fs * 0.55;
    const tx = Math.max(4, Math.min(a, width - right - textW));
    out.push(`<line x1="${a}" x2="${b}" y1="${y}" y2="${y}" stroke="${r.color}" stroke-width="5" stroke-linecap="round"/>`);
    out.push(`<text x="${tx}" y="${y - 7}" style="font-size:${fs}px;fill:${r.color}">${esc(r.label)}</text>`);
  });
  out.push(`</svg>`);
  const legend = p.series.map((s) => `<li><i style="border-top:2.5px ${s.dash ? "dashed" : "solid"} ${s.color}"></i>${esc(s.label)}</li>`).join("");
  return `<figure class="chart xy"><figcaption><span class="chart-head"><span class="chart-title">${esc(p.title)}</span></span></figcaption><div class="chart-body">${out.join("")}</div><ul class="xy-legend">${legend}</ul></figure>`;
}

/** Both layouts (the page shows one by width), or the phone one for a panel beside another. */
export function renderXY(p: XYPlot, layout: "both" | "narrow" = "both"): string {
  if (layout === "narrow") return draw(p, WIDTHS.narrow);
  return `<div class="gc-wide">${draw(p, WIDTHS.wide)}</div><div class="gc-narrow">${draw(p, WIDTHS.narrow)}</div>`;
}

export const XY_STYLE = `
.xy-legend{list-style:none;margin:.4rem 0 0;padding:0;display:flex;flex-wrap:wrap;gap:.25rem 1rem;font-size:.82rem;color:var(--fg)}
.xy-legend i{display:inline-block;width:1.4rem;margin-right:.4rem;vertical-align:middle}
.gc-panels.gc-4{grid-template-columns:repeat(2,minmax(0,1fr))}
@media (max-width:560px){.gc-panels.gc-4{grid-template-columns:1fr}}
`;
