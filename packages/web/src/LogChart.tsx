import { createContext, useContext, useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";

/**
 * Shared crosshair: hovering any chart shows the cursor and the values at that
 * frequency on every chart. Only the charts re-render as it moves.
 */
const Crosshair = createContext<{ f: number | null; set: (f: number | null) => void } | null>(null);

export function CrosshairProvider({ children }: { children: ReactNode }) {
  const [f, set] = useState<number | null>(null);
  return <Crosshair.Provider value={{ f, set }}>{children}</Crosshair.Provider>;
}

export interface Series {
  label: string;
  color: string;
  y: Float64Array | null;
  /** SVG dash pattern, e.g. "6 4", for measured or reference curves. */
  dash?: string;
}

export interface Limit {
  value: number;
  label: string;
  color: string;
}

interface Props {
  title: string;
  unit: string;
  freq: Float64Array;
  series: Series[];
  limits?: Limit[];
  yMin?: number;
  yMax?: number;
  digits?: number;
  /** Hidden charts stay rendered (the forum image can still use them). */
  hidden?: boolean;
  /** Include this chart in the forum image. */
  forum?: boolean;
}

const W = 640;
const H = 260;
/** Margins around the plot, grown with the text scale k on narrow screens. */
const padOf = (k: number) => ({ l: 48 + 22 * (k - 1), r: 12 + 16 * (k - 1), t: 22 + 12 * (k - 1), b: 28 + 14 * (k - 1) });
const X_TICKS = [10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000];

function niceStep(range: number): number {
  const raw = range / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}

/** Line chart with a logarithmic frequency axis, horizontal limit lines and a hover readout. */
export function LogChart({ title, unit, freq, series, limits = [], yMin, yMax, digits = 1, hidden, forum }: Props) {
  const clipId = useId();
  const shared = useContext(Crosshair);
  const [ownF, setOwnF] = useState<number | null>(null);
  const hoverF = shared ? shared.f : ownF;
  const setHoverF = shared ? shared.set : setOwnF;
  // Text and lines are sized for a 640-unit-wide chart. On a narrow screen the chart is
  // shrunk to fit, so scale them up by k to keep them readable (about 11 px on screen).
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
  // data-base-* keep the desktop sizes for the forum image export.
  const fs = (px: number) => ({ style: { fontSize: `${px * k}px` }, "data-base-fs": `${px}px` });
  const sw = (w: number) => ({ strokeWidth: w * k, "data-base-sw": w });
  const PAD = padOf(k);
  const PW = W - PAD.l - PAD.r;
  const PH = H - PAD.t - PAD.b;

  const fMin = freq[0] ?? 10;
  const fMax = freq[freq.length - 1] ?? 500;
  const lx = Math.log(fMax / fMin);
  const xOf = (f: number) => PAD.l + (Math.log(f / fMin) / lx) * PW;

  // Y range from the data and the limit lines
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    if (!s.y) continue;
    for (const v of s.y) {
      if (Number.isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
  }
  for (const l of limits) {
    lo = Math.min(lo, l.value);
    hi = Math.max(hi, l.value * 1.1);
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  if (yMin !== undefined) lo = yMin;
  if (yMax !== undefined) hi = yMax;
  if (hi - lo < 1e-9) hi = lo + 1;
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const yOf = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * PH;

  // Index of the sweep point nearest the crosshair frequency (in log terms).
  let hover: number | null = null;
  if (hoverF !== null && freq.length > 0 && hoverF >= fMin * 0.999 && hoverF <= fMax * 1.001) {
    hover = 0;
    for (let i = 1; i < freq.length; i++) if (Math.abs(Math.log(freq[i]! / hoverF)) < Math.abs(Math.log(freq[hover]! / hoverF))) hover = i;
  }

  const yTicks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) yTicks.push(v);

  const pathOf = (y: Float64Array) => {
    let d = "";
    let pen = false;
    for (let i = 0; i < y.length; i++) {
      const v = y[i]!;
      if (!Number.isFinite(v)) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${xOf(freq[i]!).toFixed(1)},${yOf(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (px < PAD.l || px > W - PAD.r) return setHoverF(null);
    setHoverF(fMin * Math.exp(((px - PAD.l) / PW) * lx));
  };

  const visible = series.filter((s) => s.y);

  return (
    <figure className="chart" hidden={hidden} data-forum={forum ? "" : undefined}>
      <figcaption>
        <span className="chart-title">{title}</span>
        <span className="chart-readout">
          {hover !== null ? (
            <>
              <b>{freq[hover]!.toFixed(1)} Hz</b>
              {visible.map((s) => (
                <span key={s.label} className="readout-item">
                  {" "}
                  <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
                  {s.label}: {Number.isFinite(s.y![hover]!) ? s.y![hover]!.toFixed(digits) : "–"} {unit}
                </span>
              ))}
            </>
          ) : (
            <span className="muted">Hover or tap the chart for values</span>
          )}
        </span>
      </figcaption>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHoverF(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.l} y={PAD.t} width={PW} height={PH} />
          </clipPath>
        </defs>

        {/* grid */}
        {X_TICKS.filter((f) => f >= fMin && f <= fMax).map((f) => (
          <g key={f}>
            <line className="grid" x1={xOf(f)} x2={xOf(f)} y1={PAD.t} y2={PAD.t + PH} />
            <text className="tick" x={xOf(f)} y={H - 8} textAnchor="middle" {...fs(11)}>
              {f >= 1000 ? `${f / 1000}k` : f}
            </text>
          </g>
        ))}
        {yTicks.map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)} />
            <text className="tick" x={PAD.l - 6} y={yOf(v) + 4 * k} textAnchor="end" {...fs(11)}>
              {Number(v.toFixed(6))}
            </text>
          </g>
        ))}
        <text className="tick unit-label" x={PAD.l} y={4 + 8 * k} textAnchor="start" {...fs(11)}>
          {unit}
        </text>

        <g clipPath={`url(#${clipId})`}>
          {limits.map((l) => (
            <g key={l.label}>
              <line className="limit" x1={PAD.l} x2={W - PAD.r} y1={yOf(l.value)} y2={yOf(l.value)} stroke={l.color} {...sw(1.5)} />
              <text className="limit-label" x={W - PAD.r - 4} y={yOf(l.value) - 4} textAnchor="end" fill={l.color} {...fs(11)}>
                {l.label}
              </text>
            </g>
          ))}
          {visible.map((s) => (
            <path key={s.label} d={pathOf(s.y!)} fill="none" stroke={s.color} strokeDasharray={s.dash} {...sw(2)} />
          ))}
          {hover !== null && (
            <g className="cursor">
              <line className="cursor" x1={xOf(freq[hover]!)} x2={xOf(freq[hover]!)} y1={PAD.t} y2={PAD.t + PH} />
              {visible.map((s) =>
                Number.isFinite(s.y![hover!]!) ? (
                  <circle
                    key={s.label}
                    className="cursor-dot"
                    cx={xOf(freq[hover!]!)}
                    cy={yOf(s.y![hover!]!)}
                    r={3.5 * k}
                    fill={s.color}
                    {...sw(1.5)}
                  />
                ) : null,
              )}
            </g>
          )}
        </g>
      </svg>
    </figure>
  );
}
