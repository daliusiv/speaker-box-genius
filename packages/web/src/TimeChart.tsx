import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Transient } from "./sim.ts";
import { CursorBadge, shortName } from "./LogChart.tsx";
import { ChartLegend, type LegendRow } from "./ChartLegend.tsx";

const W = 640;

/**
 * Impulse or step response of each design against time (ms), scaled to a peak of ±1. A plain
 * linear chart: the frequency charts' crosshair and readouts don't apply to a time axis.
 */
export function TimeChart(props: { title: string; curves: Transient[]; view: "impulse" | "step"; from_ms: number; to_ms: number; hidden?: boolean; actions?: ReactNode }) {
  const [hoverT, setHoverT] = useState<number | null>(null);
  // Like the frequency charts: on a phone the 640-unit chart shrinks, so text and lines grow by
  // k to stay readable, and the chart gets taller.
  const svgRef = useRef<SVGSVGElement>(null);
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = e?.contentRect.width ?? W;
      setK(w > 0 ? Math.min(2, Math.max(1, W / w)) : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tall = k > 1.3;
  const H = tall ? 470 : 260;
  const PAD = tall ? { l: 30 + 14 * (k - 1), r: 8 + 6 * (k - 1), t: 26 * k, b: 22 + 14 * (k - 1) } : { l: 44, r: 12, t: 30, b: 28 };
  const fs = { style: { fontSize: `${11 * k}px` } };
  const fsOf = (px: number) => ({ style: { fontSize: `${px * k}px` } });
  const PW = W - PAD.l - PAD.r;
  const PH = H - PAD.t - PAD.b;
  const xOf = (t: number) => PAD.l + ((t - props.from_ms) / (props.to_ms - props.from_ms)) * PW;
  const yOf = (v: number) => PAD.t + (1 - (v + 1) / 2) * PH;
  const xTicks: number[] = [];
  const span = props.to_ms - props.from_ms;
  const step = span > 120 ? 20 : span > 60 ? 10 : 5;
  for (let t = Math.ceil(props.from_ms / step) * step; t <= props.to_ms; t += step) xTicks.push(t);
  const path = (c: Transient) => {
    const y = props.view === "impulse" ? c.impulse : c.step;
    let d = "";
    // One point per pixel column is plenty: keep the sample with the largest swing in each.
    let col = -1;
    let best = 0;
    let bestI = -1;
    const flush = () => {
      if (bestI >= 0) d += `${d ? "L" : "M"}${xOf(c.t_ms[bestI]!).toFixed(1)} ${yOf(y[bestI]!).toFixed(1)}`;
    };
    for (let i = 0; i < y.length; i++) {
      const t = c.t_ms[i]!;
      if (t < props.from_ms || t > props.to_ms) continue;
      const cx = Math.floor(xOf(t) * 2);
      if (cx !== col) {
        flush();
        col = cx;
        best = -1;
        bestI = -1;
      }
      if (Math.abs(y[i]!) > best) {
        best = Math.abs(y[i]!);
        bestI = i;
      }
    }
    flush();
    return d;
  };
  const readAt = (e: { clientX: number; currentTarget: SVGSVGElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const t = props.from_ms + ((px - PAD.l) / PW) * (props.to_ms - props.from_ms);
    setHoverT(t >= props.from_ms && t <= props.to_ms ? t : null);
  };
  const valueAt = (c: Transient, t: number) => {
    const y = props.view === "impulse" ? c.impulse : c.step;
    let i = 0;
    while (i < c.t_ms.length - 1 && c.t_ms[i]! < t) i++;
    return y[i]!;
  };
  // Legend rows: the value at the cursor (peak = 1).
  const rows: LegendRow[] = props.curves.map((c) => ({
    key: c.label,
    label: shortName(c.label),
    color: c.color,
    dash: c.dash,
    at: hoverT === null ? "–" : valueAt(c, hoverT).toFixed(2),
    cols: [],
  }));
  return (
    <figure className="chart" hidden={props.hidden} data-chart="transient">
      <figcaption>
        <span className="chart-title">{props.title}</span>
        {props.actions && <span className="chart-actions">{props.actions}</span>}
        <span className="chart-hint muted">Peak scaled to 1</span>
      </figcaption>
      <div className="chart-body">
        {hoverT !== null && (
          <div className="chart-tip" role="status" style={{ right: `${((PAD.r + 6) / W) * 100}%`, top: `${((PAD.t + 4) / H) * 100}%` }}>
            <table className="tip-table">
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col" className="legend-at on">
                    {hoverT.toFixed(1)} ms
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">
                      <span className="legend-swatch" style={{ background: r.color }} aria-hidden="true" />
                      {r.label}
                    </th>
                    <td className="legend-val">{r.at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${props.title} against time, ${props.from_ms} to ${props.to_ms} ms`}
          // As on the frequency charts: a tap or a sideways drag shows the values, and they stay up
          // after the finger lifts (a finger lifting also "leaves"); a mouse leaving clears them.
          onPointerMove={(e) => readAt(e)}
          onPointerDown={(e) => readAt(e)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setHoverT(null)}
        >
          <g className="grid">
            {xTicks.map((t) => (
              <line key={`x${t}`} x1={xOf(t)} x2={xOf(t)} y1={PAD.t} y2={PAD.t + PH} />
            ))}
            {[-1, -0.5, 0, 0.5, 1].map((v) => (
              <line key={`y${v}`} x1={PAD.l} x2={PAD.l + PW} y1={yOf(v)} y2={yOf(v)} />
            ))}
          </g>
          <g className="ticks">
            {xTicks.map((t) => (
              <text key={`tx${t}`} className="tick" x={xOf(t)} y={H - 9 * k} textAnchor="middle" {...fs}>
                {t < 0 ? `−${-t}` : t}
              </text>
            ))}
            {[-1, -0.5, 0, 0.5, 1].map((v) => (
              <text key={`ty${v}`} className="tick" x={PAD.l - 6} y={yOf(v) + 4 * k} textAnchor="end" {...fs}>
                {v < 0 ? `−${-v}` : v}
              </text>
            ))}
            <text className="tick unit-label" x={PAD.l - 6} y={H - 9 * k} textAnchor="end" {...fs}>
              ms
            </text>
          </g>
          {props.curves.map((c) => (
            <path key={c.label} d={path(c)} fill="none" stroke={c.color} strokeWidth={1.8 * k} strokeDasharray={c.dash} strokeLinejoin="round" />
          ))}
          {hoverT !== null && (
            <>
              <line className="cursor" x1={xOf(hoverT)} x2={xOf(hoverT)} y1={PAD.t} y2={PAD.t + PH} strokeWidth={k} strokeDasharray={`${4 * k} ${4 * k}`} />
              {props.curves.map((c) => (
                <circle key={c.label} className="cursor-dot" cx={xOf(hoverT)} cy={yOf(valueAt(c, hoverT))} r={4 * k} fill={c.color} strokeWidth={1.5 * k} />
              ))}
              <CursorBadge x={xOf(hoverT)} top={PAD.t} left={PAD.l} right={PAD.l + PW} k={k} label={`${hoverT.toFixed(1)} ms`} fs={fsOf} />
            </>
          )}
        </svg>
      </div>
      <div role="status" aria-live="off">
        <ChartLegend atHeading={hoverT === null ? null : `@ ${hoverT.toFixed(1)} ms`} columns={[]} rows={rows} />
      </div>
    </figure>
  );
}
