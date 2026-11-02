import { useId, useState, type PointerEvent } from "react";

export interface Series {
  label: string;
  color: string;
  y: Float64Array | null;
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
}

const W = 640;
const H = 260;
const PAD = { l: 48, r: 12, t: 22, b: 28 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;
const X_TICKS = [10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000];

function niceStep(range: number): number {
  const raw = range / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}

/** Line chart with a logarithmic frequency axis, horizontal limit lines and a hover readout. */
export function LogChart({ title, unit, freq, series, limits = [], yMin, yMax, digits = 1 }: Props) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

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
    if (px < PAD.l || px > W - PAD.r) return setHover(null);
    const f = fMin * Math.exp(((px - PAD.l) / PW) * lx);
    let i = 0;
    for (let k = 1; k < freq.length; k++) if (Math.abs(freq[k]! - f) < Math.abs(freq[i]! - f)) i = k;
    setHover(i);
  };

  const visible = series.filter((s) => s.y);

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        <span className="chart-readout">
          {hover !== null ? (
            <>
              <b>{freq[hover]!.toFixed(1)} Hz</b>
              {visible.map((s) => (
                <span key={s.label} style={{ color: s.color }}>
                  {" "}
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
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
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
            <text className="tick" x={xOf(f)} y={H - 8} textAnchor="middle">
              {f >= 1000 ? `${f / 1000}k` : f}
            </text>
          </g>
        ))}
        {yTicks.map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)} />
            <text className="tick" x={PAD.l - 6} y={yOf(v) + 4} textAnchor="end">
              {Number(v.toFixed(6))}
            </text>
          </g>
        ))}
        <text className="tick unit-label" x={PAD.l} y={12} textAnchor="start">
          {unit}
        </text>

        <g clipPath={`url(#${clipId})`}>
          {limits.map((l) => (
            <g key={l.label}>
              <line className="limit" x1={PAD.l} x2={W - PAD.r} y1={yOf(l.value)} y2={yOf(l.value)} stroke={l.color} />
              <text className="limit-label" x={W - PAD.r - 4} y={yOf(l.value) - 4} textAnchor="end" fill={l.color}>
                {l.label}
              </text>
            </g>
          ))}
          {visible.map((s) => (
            <path key={s.label} d={pathOf(s.y!)} fill="none" stroke={s.color} strokeWidth={2} />
          ))}
          {hover !== null && (
            <line className="cursor" x1={xOf(freq[hover]!)} x2={xOf(freq[hover]!)} y1={PAD.t} y2={PAD.t + PH} />
          )}
        </g>
      </svg>
    </figure>
  );
}
