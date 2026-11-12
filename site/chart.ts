/**
 * Small static SVG charts for the content pages (validation, driver pages): log frequency
 * axis, nice value ticks, lines, a reference band and dots. No script, so they work anywhere.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const minus = (s: string) => s.replace(/^-/, "−");

const W = 640;
const H = 230;
const PAD = { l: 46, r: 18, t: 12, b: 28 };

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

export interface Series {
  points: [number, number][];
  /** "line" for our curve, "ref" for the reference curve, "dots" for read-outs. */
  style: "line" | "ref" | "dots";
  /** Line colour (default: the accent). */
  color?: string;
  /** Dash pattern, e.g. "6 4". */
  dash?: string;
}

export function chart(o: {
  label: string;
  unit: string;
  series: Series[];
  aria: string;
  yMin?: number;
  yMax?: number;
  /** "linear" for a time axis (ms); default log frequency. */
  xScale?: "log" | "linear";
}): string {
  const lin = o.xScale === "linear";
  const all = o.series.flatMap((s) => s.points).filter((p) => Number.isFinite(p[1]) && (o.yMin === undefined || p[1] >= o.yMin) && (o.yMax === undefined || p[1] <= o.yMax));
  // The frequency span covers every point; the value span only those within yMin–yMax.
  const fs = o.series.flatMap((s) => s.points.map((p) => p[0]));
  const fMin = Math.min(...fs);
  const fMax = Math.max(...fs);
  let yMin = Math.min(...all.map((p) => p[1]));
  let yMax = Math.max(...all.map((p) => p[1]));
  const padY = (yMax - yMin || Math.abs(yMax) || 1) * 0.06;
  yMin = o.yMin ?? yMin - padY;
  yMax = o.yMax ?? yMax + padY;
  const yt = niceTicks(yMin, yMax);
  yMin = Math.min(yMin, yt[0]!);
  yMax = Math.max(yMax, yt[yt.length - 1]!);
  const x = (f: number) =>
    PAD.l +
    (lin ? (f - fMin) / (fMax - fMin) : (Math.log10(f) - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin))) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const xt = lin ? niceTicks(fMin, fMax, 7) : [10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000].filter((f) => f >= fMin * 0.999 && f <= fMax * 1.001);
  const r1 = (v: number) => v.toFixed(1);

  const grid = [
    ...xt.map((f) => `<line x1="${r1(x(f))}" x2="${r1(x(f))}" y1="${PAD.t}" y2="${H - PAD.b}"/>`),
    ...yt.map((v) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${r1(y(v))}" y2="${r1(y(v))}"/>`),
  ].join("");
  const labels = [
    ...xt.map((f) => `<text x="${r1(x(f))}" y="${H - 9}" text-anchor="middle">${lin ? minus(String(f)) : f >= 1000 ? `${f / 1000}k` : f}</text>`),
    ...yt.map((v) => `<text x="${PAD.l - 6}" y="${r1(y(v) + 4)}" text-anchor="end">${minus(String(v))}</text>`),
  ].join("");

  const body = o.series
    .map((s) => {
      if (s.style === "dots") return s.points.map(([f, v]) => `<circle class="pt" cx="${r1(x(f))}" cy="${r1(y(v))}" r="4.5"/>`).join("");
      // Break the path where a value is missing.
      let d = "";
      let pen = false;
      for (const [f, v] of s.points) {
        if (!Number.isFinite(v) || v < yMin || v > yMax) {
          pen = false;
          continue;
        }
        d += `${pen ? "L" : "M"}${r1(x(f))} ${r1(y(v))}`;
        pen = true;
      }
      const style = [s.color ? `stroke:${s.color}` : "", s.dash ? `stroke-dasharray:${s.dash}` : ""].filter(Boolean).join(";");
      return `<path class="${s.style}"${style ? ` style="${style}"` : ""} d="${d}"/>`;
    })
    .join("");

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}"><g class="grid">${grid}</g><g class="ax">${labels}<text x="${PAD.l}" y="${PAD.t - 2}" class="unit">${esc(o.unit)}</text></g>${body}</svg>`;
}


export const CHART_STYLE = `
.chart{display:block;width:100%;height:auto}
.chart .grid line{stroke:#282d37;stroke-width:1}
.chart .ax text{fill:#8e96aa;font:13px system-ui,sans-serif}
.chart .line{fill:none;stroke:var(--draw);stroke-width:1.8;stroke-linejoin:round}
.chart .ref{fill:none;stroke:#d3d8e2;stroke-opacity:.5;stroke-width:6;stroke-linejoin:round;stroke-linecap:round}
.chart .pt{fill:#e6e9ef;stroke:#11141a;stroke-width:1.5}
.charts{display:grid;gap:.8rem;grid-template-columns:repeat(auto-fit,minmax(17rem,1fr))}
.charts figure{margin:0;padding:.5rem .5rem .3rem;border:1px solid var(--border);border-radius:.7rem;background:var(--card)}
.charts figcaption{margin:0 0 0 .3rem}
.key{display:flex;flex-wrap:wrap;gap:1rem;color:var(--muted);font-size:.9rem}
.key span::before{content:"";display:inline-block;width:1.4rem;height:0;margin:0 .4rem .25rem 0;vertical-align:middle;border-top:2.5px solid var(--draw)}
.key .k-ref::before{border-top:6px solid rgba(211,216,226,.5)}
.key .k-pt::before{width:.6rem;height:.6rem;border:0;border-radius:50%;background:#e8ebf2}
`;
