import { createContext, useContext, useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";

/**
 * Shared crosshair: hovering any chart shows the cursor and the values at that
 * frequency on every chart. Only the charts re-render as it moves.
 */
/**
 * Curves to play down: a design's label (and its parts, "Name · cone", "Name: …") listed here is
 * drawn faint, the rest bold. Used for the comparison driver's curves, behind the main driver's.
 */
export const ChartEmphasis = createContext<readonly string[]>([]);
const fadedBy = (faded: readonly string[], label: string) =>
  faded.some((f) => label === f || label.startsWith(`${f} `) || label.startsWith(`${f}:`));

const Crosshair = createContext<{ f: number | null; set: (f: number | null) => void } | null>(null);

export function CrosshairProvider({ children }: { children: ReactNode }) {
  const [f, set] = useState<number | null>(null);
  // On touch screens the values stay after a tap; tapping anywhere outside a chart clears them.
  useEffect(() => {
    if (f === null) return;
    const clear = (e: globalThis.PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("figure.chart svg")) set(null);
    };
    addEventListener("pointerdown", clear);
    return () => removeEventListener("pointerdown", clear);
  }, [f]);
  return <Crosshair.Provider value={{ f, set }}>{children}</Crosshair.Provider>;
}

export interface Series {
  label: string;
  color: string;
  y: Float64Array | null;
  /** SVG dash pattern, e.g. "6 4", for measured or reference curves. */
  dash?: string;
  /** Short tag shown in the colour dot (a driver's letter), for the phone readout. */
  tag?: string;
  /** A secondary curve (e.g. one part of a design's output): drawn thinner and fainter. */
  thin?: boolean;
  /** This curve's own limit: where it runs above it, a red glow is drawn behind it. */
  over?: number;
  /** Below this frequency the limit is `deepOver` instead (a tuned box's deep bass, graded). */
  deepBelow?: number;
  deepOver?: number;
  /** Below this frequency nothing is checked (no glow). */
  deepFloor?: number;
  /** A short note per point, shown in the hover readout (e.g. what limits the design there). */
  notes?: readonly string[];
  /** Left out when marking the leader (e.g. a measurement, which isn't a box to choose). */
  noRank?: boolean;
}

/**
 * A strip under the plot, one row per design: which of several kinds applies at
 * each frequency (e.g. what limits the maximum SPL), coloured by kind.
 */
export interface Ribbon {
  label: string;
  color: string;
  /** One kind per frequency point; kinds missing from `ribbonKinds` are left blank. */
  kinds: readonly string[];
}

export const OVER_RED = "#dc2626";

/** A labelled dot on the plot (e.g. each design's F3). */
export interface Point {
  f: number;
  y: number;
  color: string;
  label: string;
  /** The curve it belongs to, so it fades with it (see ChartEmphasis). */
  of?: string;
}

/** A labelled vertical line at one frequency (e.g. a passive radiator's notch). */
export interface Marker {
  f: number;
  label: string;
  color: string;
}

export interface Limit {
  value: number;
  label: string;
  color: string;
}

/** A shaded band from the left edge up to `below` Hz, with its own limit drawn across it only. */
export interface Zone {
  below: number;
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
  zones?: Zone[];
  markers?: Marker[];
  points?: Point[];
  ribbons?: Ribbon[];
  ribbonKinds?: Record<string, { label: string; color: string }>;
  yMin?: number;
  yMax?: number;
  /** Fixed spacing of the y grid (e.g. 6 dB); otherwise a round step is chosen. */
  yStep?: number;
  /** Lines the limits draw (default red, dashed); "guide" draws them faint, for reference levels. */
  limitStyle?: "limit" | "guide";
  /** Controls shown in the caption beside the title (e.g. a view switch). */
  actions?: ReactNode;
  digits?: number;
  /**
   * Which value leads at the tapped frequency, marked in the readout: "high" (SPL), "low"
   * (excursion, port speed) or "zero" (closest to zero: group delay). None: no marker.
   */
  best?: "high" | "low" | "zero";
  /** A shorter title for phones (the full one shows on a tap). */
  shortTitle?: string;
  /** Hidden charts stay rendered (the forum image can still use them). */
  hidden?: boolean;
  /** Names the chart for jumping to it (figure[data-chart]). */
  chartId?: string;
  /** Include this chart in the forum image. */
  forum?: boolean;
  /** Edit mode: these handles can be dragged, and the hover readout pauses. */
  handles?: ChartHandle[];
  /** A line under the caption (edit mode's hint and buttons). */
  below?: ReactNode;
  /** The handle picked (tapped, clicked or focused), or null when the plot itself is tapped. */
  onSelect?: (id: string | null) => void;
  /** The picked handle, drawn ringed. */
  selected?: string | null;
}

/** A point on the chart that can be dragged (edit mode): a box's tuning, an EQ point. */
export interface ChartHandle {
  id: string;
  f: number;
  y: number;
  color: string;
  shape: "diamond" | "dot";
  /** "x": slides along the frequency axis only; "xy": anywhere. */
  axes: "x" | "xy";
  /** What it is, for screen readers and the bubble ("Ported: tuning"). */
  label: string;
  /** The current value(s), shown in the bubble while dragging and read out by screen readers. */
  text: string;
  /** Called with the frequency and value under the pointer; the first call of a gesture has start set. */
  onDrag: (f: number, y: number, start: boolean) => void;
  /** Mouse wheel over the handle (EQ: Q). */
  onWheel?: (up: boolean) => void;
  /** Delete / Backspace on the focused handle (EQ: remove the point). */
  onRemove?: () => void;
}

const W = 640;
/** Plot height: wide on computers; nearly 4:3 on phones, where the chart is the main thing on screen. */
const heightOf = (tall: boolean) => (tall ? 470 : 260);
/**
 * Margins around the plot, grown with the text scale k on narrow screens. Phones ("tall") get
 * lean ones: the unit moves into the values strip, so there's no label row above the plot.
 */
const padOf = (k: number, tall: boolean) =>
  tall
    ? { l: 34 + 14 * (k - 1), r: 6 + 6 * (k - 1), t: 8 + 6 * (k - 1), b: 20 + 12 * (k - 1) }
    : { l: 48 + 22 * (k - 1), r: 12 + 16 * (k - 1), t: 22 + 12 * (k - 1), b: 28 + 14 * (k - 1) };
const X_TICKS = [10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000];

function niceStep(range: number): number {
  const raw = range / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}

/** Shorter design names where space is tight (the values box, the summary table): "Passive radiators" → "PR", "Transmission line" → "TL". */
export const shortName = (label: string) =>
  label
    .replace(/passive radiators?/gi, "PR")
    .replace(/\bPRs?:/g, "PR:")
    .replace(/transmission line/gi, "TL");

/** Line chart with a logarithmic frequency axis, horizontal limit lines and a hover readout. */
export function LogChart({
  title,
  unit,
  freq,
  series,
  limits = [],
  zones = [],
  markers = [],
  points = [],
  ribbons = [],
  ribbonKinds = {},
  yMin,
  yMax,
  yStep,
  limitStyle = "limit",
  actions,
  digits = 1,
  best,
  shortTitle,
  hidden,
  chartId,
  forum,
  handles = [],
  below,
  onSelect,
  selected,
}: Props) {
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
  // Phone-sized (shrunk well below its 640 units): taller, with lean margins.
  const tall = k > 1.3;
  const H = heightOf(tall);
  const PAD = padOf(k, tall);
  const [fullTitle, setFullTitle] = useState(false);
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
  for (const z of zones) hi = Math.max(hi, z.value * 1.1);
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  if (yMin !== undefined) lo = yMin;
  if (yMax !== undefined) hi = yMax;
  if (hi - lo < 1e-9) hi = lo + 1;
  const step = yStep ?? niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const yOf = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * PH;
  const editing = handles.length > 0;
  // The handle being dragged (or focused from the keyboard): its bubble shows.
  const [active, setActive] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const movedRef = useRef(false);
  // The wheel over a handle (EQ: its Q) mustn't scroll the page too, which needs a
  // non-passive listener; React's onWheel can't prevent the scroll.
  const handlesRef = useRef(handles);
  handlesRef.current = handles;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const id = (e.target as Element | null)?.closest?.("[data-handle]")?.getAttribute("data-handle");
      const h = id ? handlesRef.current.find((x) => x.id === id) : undefined;
      if (!h?.onWheel) return;
      e.preventDefault();
      h.onWheel(e.deltaY < 0);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  /** Pointer position → chart coordinates (frequency, value), kept inside the plot. */
  const toData = (e: { clientX: number; clientY: number }, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const px = Math.min(W - PAD.r, Math.max(PAD.l, ((e.clientX - rect.left) / rect.width) * W));
    const py = Math.min(PAD.t + PH, Math.max(PAD.t, ((e.clientY - rect.top) / rect.height) * (H + (ribbonsHeight ?? 0))));
    return { f: fMin * Math.exp(((px - PAD.l) / PW) * lx), y: lo + (1 - (py - PAD.t) / PH) * (hi - lo) };
  };
  let ribbonsHeight: number | undefined;

  // Index of the sweep point nearest the crosshair frequency (in log terms).
  let hover: number | null = null;
  if (hoverF !== null && freq.length > 0 && hoverF >= fMin * 0.999 && hoverF <= fMax * 1.001) {
    hover = 0;
    for (let i = 1; i < freq.length; i++) if (Math.abs(Math.log(freq[i]! / hoverF)) < Math.abs(Math.log(freq[hover]! / hoverF))) hover = i;
  }

  const yTicks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) yTicks.push(v);

  /** The parts of a curve above `limit`, as a path (for the over-limit glow). */
  const overPathOf = (y: Float64Array, over: number, deepBelow?: number, deepOver?: number, deepFloor?: number) => {
    const limit = (i: number) =>
      deepFloor !== undefined && freq[i]! < deepFloor ? Infinity : deepBelow !== undefined && deepOver !== undefined && freq[i]! < deepBelow ? deepOver : over;
    let d = "";
    let pen = false;
    for (let i = 0; i < y.length; i++) {
      const v = y[i]!;
      const prev = i > 0 ? y[i - 1]! : NaN;
      const next = i + 1 < y.length ? y[i + 1]! : NaN;
      // Include the neighbours of over-limit points so the glow reaches the crossing.
      const on = Number.isFinite(v) && (v > limit(i) || prev > limit(i - 1) || next > limit(i + 1));
      if (!on) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${xOf(freq[i]!).toFixed(1)},${yOf(Math.min(v, hi + (hi - lo))).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  const pathOf = (y: Float64Array) => {
    let d = "";
    let pen = false;
    // Far outside the axis range (a notch's group delay, say) the curve is left out rather
    // than drawn as a cliff to the edge of the chart and back.
    const far = hi - lo;
    for (let i = 0; i < y.length; i++) {
      const v = y[i]!;
      if (!Number.isFinite(v) || v < lo - far || v > hi + far) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${xOf(freq[i]!).toFixed(1)},${yOf(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (editing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (px < PAD.l || px > W - PAD.r) return setHoverF(null);
    setHoverF(fMin * Math.exp(((px - PAD.l) / PW) * lx));
  };

  const visible = series.filter((s) => s.y);
  // The leader at the tapped frequency (ties at the shown precision all lead); only with two or more to rank.
  const leaders = (() => {
    const out = new Set<string>();
    if (!best || hover === null) return out;
    const ranked = visible.filter((s) => !s.thin && !s.noRank && Number.isFinite(s.y![hover]!));
    if (ranked.length < 2) return out;
    const score = (s: Series) => {
      const v = Number(s.y![hover]!.toFixed(digits));
      return best === "high" ? v : best === "low" ? -v : -Math.abs(v);
    };
    const top = Math.max(...ranked.map(score));
    for (const s of ranked) if (score(s) === top) out.add(s.label);
    return out;
  })();
  const mark = best === "high" ? "▲" : best === "low" ? "▼" : "◆";
  const markTitle = best === "high" ? "Highest here" : best === "low" ? "Lowest here" : "Closest to zero here";
  const leaderMark = (s: Series) => (
    <span className="leader" title={leaders.has(s.label) ? markTitle : undefined}>
      {leaders.has(s.label) ? mark : ""}
      {leaders.has(s.label) && <span className="sr-only">{markTitle}: </span>}
    </span>
  );
  const faded = useContext(ChartEmphasis);

  // Limit strip under the plot: one row per design, then a legend of the kinds shown.
  const ROW = 11 * k;
  const usedKinds = Object.keys(ribbonKinds).filter((kind) => ribbons.some((r) => r.kinds.includes(kind)));
  const ribbonH = ribbons.length > 0 ? 8 * k + ribbons.length * ROW + 20 * k : 0;
  ribbonsHeight = ribbonH;
  const edge = (i: number) =>
    i <= 0 ? PAD.l : i >= freq.length ? W - PAD.r : (xOf(freq[i - 1]!) + xOf(freq[i]!)) / 2;
  const runsOf = (kinds: readonly string[]) => {
    const out: { kind: string; from: number; to: number }[] = [];
    for (let i = 0; i < kinds.length; ) {
      let j = i;
      while (j + 1 < kinds.length && kinds[j + 1] === kinds[i]) j++;
      if (ribbonKinds[kinds[i]!]) out.push({ kind: kinds[i]!, from: edge(i), to: edge(j + 1) });
      i = j + 1;
    }
    return out;
  };
  let legendX = PAD.l;

  return (
    <figure className={`chart${editing ? " editing" : ""}`} hidden={hidden} data-chart={chartId} data-forum={forum ? "" : undefined}>
      <figcaption>
        {tall && shortTitle && shortTitle !== title ? (
          <button type="button" className="chart-title as-text" onClick={() => setFullTitle((v) => !v)} title={title} aria-expanded={fullTitle}>
            {fullTitle ? title : shortTitle}
            <span className="muted" aria-hidden="true">
              {fullTitle ? " ▴" : " ▾"}
            </span>
          </button>
        ) : (
          <span className="chart-title">{title}</span>
        )}
        {actions}
        <span className="chart-hint muted">{editing ? "Drag the handles" : "Hover or tap for values"}</span>
      </figcaption>
      {below}
      {editing && (
        // What the handle being dragged is set to, on its own line above the plot: over the
        // plot it covered the very curve (and handle) being dragged.
        <div className="handle-readout" role="status">
          {handles
            .filter((h) => h.id === (dragging ?? active))
            .map((h) => (
              <span key={h.id}>
                <b>{h.label}</b> {h.text}
              </span>
            ))}
        </div>
      )}
      {/* The values float over the plot, on the side away from the cursor, so nothing
          around the chart moves while you hover or drag (the caption never changes size). */}
      <div className="chart-body">
      {hover !== null && (
        <div
          className="chart-tip"
          role="status"
          style={
            xOf(freq[hover]!) > W / 2
              ? { left: `${((PAD.l + 6) / W) * 100}%`, top: `${((PAD.t + 4) / (H + ribbonH)) * 100}%` }
              : { right: `${((PAD.r + 6) / W) * 100}%`, top: `${((PAD.t + 4) / (H + ribbonH)) * 100}%` }
          }
        >
          <b>{freq[hover]!.toFixed(1)} Hz</b>
          {visible.map((s) => (
            <span key={s.label} className={`readout-item${faded.length > 0 && fadedBy(faded, s.label) ? " faint" : ""}`}>
              <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
              <span className="tip-label">{shortName(s.label)}</span>
              {leaderMark(s)}
              <span className="tip-value">
                {Number.isFinite(s.y![hover!]!) ? s.y![hover!]!.toFixed(digits) : "–"} {unit}
                {s.notes?.[hover!] ? ` · ${s.notes[hover!]}` : ""}
              </span>
            </span>
          ))}
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H + ribbonH}`}
        role="img"
        aria-label={title}
        onPointerMove={(e) => {
          if (!editing) return onMove(e);
          const h = handles.find((x) => x.id === dragging);
          if (!h) return;
          const p = toData(e, e.currentTarget);
          h.onDrag(p.f, h.axes === "xy" ? p.y : h.y, !movedRef.current);
          movedRef.current = true;
        }}
        onPointerDown={(e) => {
          if (!editing) return onMove(e);
          // The handle nearest the pointer, within a finger's reach (so overlapping handles
          // are still easy to pick apart).
          const rect = e.currentTarget.getBoundingClientRect();
          const scale = rect.width / W;
          let best: ChartHandle | null = null;
          let bestD = 26;
          for (const h of handles) {
            if (h.f < fMin || h.f > fMax) continue;
            const hx = rect.left + xOf(h.f) * scale;
            const hy = rect.top + yOf(Math.min(hi, Math.max(lo, h.y))) * scale;
            const d = Math.hypot(e.clientX - hx, e.clientY - hy);
            if (d < bestD) {
              bestD = d;
              best = h;
            }
          }
          if (!best) {
            onSelect?.(null);
            return;
          }
          onSelect?.(best.id);
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          movedRef.current = false;
          setDragging(best.id);
          setActive(best.id);
        }}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
        // A finger lifting also "leaves"; keep the values up after a tap (a tap elsewhere clears them).
        onPointerLeave={(e) => e.pointerType === "mouse" && setHoverF(null)}
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
            <text
              className="tick"
              x={xOf(f)}
              y={H - 8}
              // At the plot's edges, keep the label inside the chart.
              textAnchor={tall && xOf(f) > W - PAD.r - 12 * k ? "end" : tall && xOf(f) < PAD.l + 12 * k ? "start" : "middle"}
              {...fs(11)}
            >
              {f >= 1000 ? `${f / 1000}k` : f}
            </text>
          </g>
        ))}
        {/* On phones the lowest y label would sit on the first frequency label: leave it out. */}
        {yTicks.filter((v) => !(tall && v === yTicks[0])).map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)} />
            <text className="tick" x={PAD.l - 6} y={yOf(v) + 4 * k} textAnchor="end" {...fs(11)}>
              {Number(v.toFixed(6))}
            </text>
          </g>
        ))}
        {!tall && (
          <text className="tick unit-label" x={PAD.l} y={4 + 8 * k} textAnchor="start" {...fs(11)}>
            {unit}
          </text>
        )}

        <g clipPath={`url(#${clipId})`}>
          {zones.map((z, zi) => {
            const x2 = Math.min(W - PAD.r, Math.max(PAD.l, xOf(z.below)));
            if (x2 <= PAD.l) return null;
            return (
              <g key={`zone-${zi}`}>
                <rect x={PAD.l} y={PAD.t} width={x2 - PAD.l} height={PH} fill={z.color} opacity={0.08} />
                <line className="limit" x1={PAD.l} x2={x2} y1={yOf(z.value)} y2={yOf(z.value)} stroke={z.color} {...sw(1.5)} />
                <text className="limit-label" x={PAD.l + 4} y={yOf(z.value) - 4} textAnchor="start" fill={z.color} {...fs(11)}>
                  {z.label}
                </text>
              </g>
            );
          })}
          {limits.map((l, li) => (
            <g key={`${l.label}-${l.value}-${li}`}>
              <line
                className={limitStyle === "guide" ? "guide" : "limit"}
                x1={PAD.l}
                x2={W - PAD.r}
                y1={yOf(l.value)}
                y2={yOf(l.value)}
                stroke={l.color}
                {...sw(limitStyle === "guide" ? 1 : 1.5)}
              />
              <text
                className={limitStyle === "guide" ? "limit-label guide-label" : "limit-label"}
                // Guides alternate ends so labels of nearby levels (−3 / −6 dB) don't overlap.
                x={limitStyle === "guide" && li % 2 === 0 ? PAD.l + 4 : W - PAD.r - 4}
                y={yOf(l.value) - 4}
                textAnchor={limitStyle === "guide" && li % 2 === 0 ? "start" : "end"}
                fill={l.color}
                {...fs(11)}
              >
                {l.label}
              </text>
            </g>
          ))}
          {markers
            .filter((m) => m.f >= fMin && m.f <= fMax)
            .map((m, i) => (
              <g key={m.label}>
                <line className="marker" x1={xOf(m.f)} x2={xOf(m.f)} y1={PAD.t} y2={PAD.t + PH} stroke={m.color} {...sw(1)} />
                <text className="marker-label" x={xOf(m.f) + 4 * k} y={PAD.t + 14 * k + i * 14 * k} fill={m.color} {...fs(11)}>
                  {m.label}
                </text>
              </g>
            ))}
          {visible.map((s) =>
            s.over !== undefined ? (
              <path
                key={`over-${s.label}`}
                className="over-glow"
                d={overPathOf(s.y!, s.over, s.deepBelow, s.deepOver, s.deepFloor)}
                fill="none"
                stroke={OVER_RED}
                strokeLinecap="round"
                strokeLinejoin="round"
                {...sw(7)}
              />
            ) : null,
          )}
          {visible.map((s) => {
            const faint = faded.length > 0 && fadedBy(faded, s.label);
            const bold = faded.length > 0 && !faint;
            return (
              <path
                key={s.label}
                d={pathOf(s.y!)}
                fill="none"
                stroke={s.color}
                strokeDasharray={s.dash}
                opacity={faint ? 0.28 : s.thin ? 0.75 : undefined}
                {...sw(s.thin ? 1.3 : bold ? 2.8 : 2)}
              />
            );
          })}
          {points
            .filter((pt) => pt.f >= fMin && pt.f <= fMax && Number.isFinite(pt.y))
            .map((pt, i) => (
              <g key={`${pt.label}-${i}`} className="chart-point" opacity={pt.of && faded.length > 0 && fadedBy(faded, pt.of) ? 0.3 : undefined}>
                <circle cx={xOf(pt.f)} cy={yOf(pt.y)} r={4 * k} fill={pt.color} stroke="var(--card)" {...sw(1.5)} />
                <text
                  className="point-label"
                  x={xOf(pt.f) + 6 * k}
                  y={yOf(pt.y) + 14 * k + i * 13 * k}
                  fill={pt.color}
                  {...fs(11)}
                >
                  {pt.label}
                </text>
              </g>
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

        {handles
          .filter((h) => h.f >= fMin && h.f <= fMax)
          .map((h) => {
            const x = xOf(h.f);
            const y = yOf(Math.min(hi, Math.max(lo, h.y)));
            const r = (dragging === h.id ? 9 : 7) * k;
            const nudge = (df: number, dy: number) => {
              h.onDrag(Math.min(fMax, Math.max(fMin, h.f * df)), h.axes === "xy" ? h.y + dy : h.y, false);
            };
            return (
              <g
                key={h.id}
                className={`handle${dragging === h.id ? " dragging" : ""}${selected === h.id ? " selected" : ""}`}
                tabIndex={0}
                role="slider"
                aria-label={h.label}
                aria-valuetext={h.text}
                onFocus={() => {
                  setActive(h.id);
                  onSelect?.(h.id);
                }}
                onBlur={() => setActive((a) => (a === h.id ? null : a))}
                onKeyDown={(e) => {
                  if ((e.key === "Delete" || e.key === "Backspace") && h.onRemove) {
                    e.preventDefault();
                    h.onRemove();
                    return;
                  }
                  const big = e.shiftKey;
                  const f = big ? 1.1 : 1.01;
                  const d = big ? 2 : 0.5;
                  const keys: Record<string, [number, number]> = { ArrowLeft: [1 / f, 0], ArrowRight: [f, 0], ArrowUp: [1, d], ArrowDown: [1, -d] };
                  const step = keys[e.key];
                  if (!step || (h.axes === "x" && step[1] !== 0)) return;
                  e.preventDefault();
                  nudge(step[0], step[1]);
                }}
                data-handle={h.id}
              >
                {/* A finger-sized target around a small mark. */}
                <circle className="handle-hit" cx={x} cy={y} r={22 * k} />
                {h.axes === "xy" && <line className="handle-stem" x1={x} x2={x} y1={yOf(Math.min(hi, Math.max(lo, 0)))} y2={y} stroke={h.color} {...sw(1.5)} />}
                {h.shape === "diamond" ? (
                  <path className="handle-mark" d={`M${x} ${y - r * 1.3}L${x + r * 1.3} ${y}L${x} ${y + r * 1.3}L${x - r * 1.3} ${y}Z`} fill={h.color} {...sw(2)} />
                ) : (
                  <circle className="handle-mark" cx={x} cy={y} r={r} fill={h.color} {...sw(2)} />
                )}
              </g>
            );
          })}

        {ribbons.length > 0 && (
          <g className="ribbons">
            {ribbons.map((r, row) => {
              const y = H + 6 * k + row * ROW;
              return (
                <g key={r.label}>
                  <title>{r.label}</title>
                  <rect x={PAD.l - 12 * k} y={y} width={7 * k} height={7 * k} rx={1.5 * k} fill={r.color} />
                  {runsOf(r.kinds).map((run) => (
                    <rect
                      key={run.from}
                      x={run.from}
                      y={y}
                      width={Math.max(0.5, run.to - run.from)}
                      height={7 * k}
                      fill={ribbonKinds[run.kind]!.color}
                    />
                  ))}
                </g>
              );
            })}
            {usedKinds.map((kind) => {
              const x = legendX;
              const { label, color } = ribbonKinds[kind]!;
              legendX += 16 * k + label.length * 6.2 * k + 14 * k;
              const y = H + 6 * k + ribbons.length * ROW + 10 * k;
              return (
                <g key={kind}>
                  <rect x={x} y={y - 7 * k} width={9 * k} height={9 * k} rx={1.5 * k} fill={color} />
                  <text className="tick" x={x + 14 * k} y={y + 1 * k} {...fs(11)}>
                    {label}
                  </text>
                </g>
              );
            })}
          </g>
        )}
      </svg>
      </div>
      {/* Phones: a legend under the plot, one curve per line, with its value at the tapped frequency.
          Every curve always has its line, so the chart's height doesn't jump on a tap. */}
      <div className="chart-strip" role="status">
        <div className="strip-head">
          {hover === null ? (
            <span className="muted">
              Tap the chart for values{unit ? ` (${unit})` : ""}
            </span>
          ) : (
            <b>
              {freq[hover]!.toFixed(freq[hover]! < 100 ? 1 : 0)} Hz{unit ? ` · ${unit}` : ""}
            </b>
          )}
        </div>
        {/* Every curve, parts too (a line's cone and mouth): those sit indented under their design. */}
        {visible.map((s) => (
            <div
              key={s.label}
              className={`strip-item${s.thin ? " part" : ""}${faded.length > 0 && fadedBy(faded, s.label) ? " faint" : ""}`}
            >
              <svg className="strip-line" viewBox="0 0 22 8" aria-hidden="true">
                <line x1="1" y1="4" x2="21" y2="4" stroke={s.color} strokeWidth="3" strokeDasharray={s.dash} strokeLinecap="round" />
              </svg>
              <span className="strip-name" title={s.label}>
                {/* Under its design, a part needs only its own name ("cone", "mouth"). */}
                {s.thin && s.label.includes(" · ") ? s.label.slice(s.label.lastIndexOf(" · ") + 3) : shortName(s.label)}
              </span>
              {leaderMark(s)}
              <span className="strip-value">
                {hover === null ? "" : Number.isFinite(s.y![hover]!) ? s.y![hover]!.toFixed(digits) : "–"}
              </span>
            </div>
          ))}
      </div>
    </figure>
  );
}
