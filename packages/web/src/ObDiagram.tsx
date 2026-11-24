import { useId, type FocusEvent } from "react";
import type { ObDesign } from "./state.ts";

/** Which size a focused field changes, to light it up on the drawing. */
export type ObDim = "Width" | "Height" | "From left" | "From bottom" | "Thickness" | "Depth";

const DIMS: readonly ObDim[] = ["Width", "Height", "From left", "From bottom", "Thickness", "Depth"];

/** The size a focus event's field stands for (by its label), or null. */
export function obDimOf(e: FocusEvent<HTMLElement>): ObDim | null {
  const row = (e.target as HTMLElement).closest(".ui-field");
  const label = row?.querySelector(".ui-field-label")?.textContent?.trim() ?? "";
  return (DIMS as readonly string[]).includes(label) ? (label as ObDim) : null;
}

/**
 * The open baffle to scale, with where each size is measured: the front view (board, the
 * driver's cone from Sd, Width, Height, From left, From bottom) and, for an H- or U-frame, a side
 * view (walls and board hatched, Depth, Thickness). Labels are the fields' names; the focused
 * field's dimension is lit.
 */
export function ObDiagram(props: { d: ObDesign; sd_cm2?: number | null; focus: ObDim | null }) {
  const { d, focus } = props;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const w = d.w_cm;
  const h = d.h_cm;
  const t = d.t_cm;
  if (!(w > 0 && h > 0)) return null;
  const framed = d.frame !== "flat";
  const depth = framed ? Math.max(d.depth_cm, t) : 0;
  const big0 = Math.max(w, h);
  const gap = framed ? big0 * 0.29 : 0;
  const totalW = w + gap + depth;
  const big = Math.max(h, totalW);
  const fs = big * 0.052;
  const m = big * 0.13;
  const sw = fs * 0.07;
  const rCone = props.sd_cm2 && props.sd_cm2 > 0 ? Math.sqrt(props.sd_cm2 / Math.PI) : Math.min(w, h) * 0.2;
  const cx = Math.min(Math.max(d.x_cm, 0), w);
  const cy = h - Math.min(Math.max(d.y_cm, 0), h);
  const on = (k: ObDim) => (focus === k ? " on" : "");
  const tick = fs * 0.35;
  const dash = `${fs * 0.3} ${fs * 0.2}`;

  const dimH = (x1: number, x2: number, y: number, label: ObDim, below: boolean) => (
    <g className={`wedge-dim${on(label)}`} fontSize={fs}>
      <line x1={x1} y1={y} x2={x2} y2={y} strokeWidth={sw} />
      <line x1={x1} y1={y - tick} x2={x1} y2={y + tick} strokeWidth={sw} />
      <line x1={x2} y1={y - tick} x2={x2} y2={y + tick} strokeWidth={sw} />
      <text x={(x1 + x2) / 2} y={below ? y + fs * 1.15 : y - fs * 0.45} textAnchor="middle">
        {label}
      </text>
    </g>
  );
  const dimV = (x: number, y1: number, y2: number, label: ObDim, left: boolean) => {
    const tx = left ? x - fs * 0.5 : x + fs * 0.5;
    const ty = (y1 + y2) / 2;
    return (
      <g className={`wedge-dim${on(label)}`} fontSize={fs}>
        <line x1={x} y1={y1} x2={x} y2={y2} strokeWidth={sw} />
        <line x1={x - tick} y1={y1} x2={x + tick} y2={y1} strokeWidth={sw} />
        <line x1={x - tick} y1={y2} x2={x + tick} y2={y2} strokeWidth={sw} />
        <text x={tx} y={ty} textAnchor="middle" transform={`rotate(-90 ${tx} ${ty})`}>
          {label}
        </text>
      </g>
    );
  };

  // Side view: the front on the left; the board at the front (U) or mid-way (H).
  const x0 = w + gap;
  const bx = d.frame === "u" ? x0 : x0 + (depth - t) / 2;
  const hatch = `ob-hatch-${uid}`;
  return (
    <svg
      className="ob-drawing"
      viewBox={`${-m * 1.25} ${-m} ${totalW + m * 2.6} ${h + m * 2.6}`}
      role="img"
      aria-label={`Front view of the board${framed ? ` and side view of the ${d.frame === "h" ? "H" : "U"}-frame` : ""}, showing where each size is measured`}
    >
      <defs>
        <pattern id={hatch} width={fs * 0.5} height={fs * 0.5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={fs * 0.5} className="wedge-hatch-line" strokeWidth={fs * 0.08} />
        </pattern>
      </defs>

      {/* Front view */}
      <rect x={0} y={0} width={w} height={h} className="wedge-outline" strokeWidth={fs * 0.1} />
      <g className="ob-cone">
        <circle cx={cx} cy={cy} r={rCone} strokeWidth={fs * 0.08} />
        <line x1={cx - rCone * 0.3} y1={cy} x2={cx + rCone * 0.3} y2={cy} strokeWidth={sw} />
        <line x1={cx} y1={cy - rCone * 0.3} x2={cx} y2={cy + rCone * 0.3} strokeWidth={sw} />
      </g>
      <g className="wedge-dim ob-ext">
        <line x1={cx} y1={cy} x2={cx} y2={-m * 0.35} strokeWidth={sw} strokeDasharray={dash} />
        <line x1={cx} y1={cy} x2={w + m * 0.35} y2={cy} strokeWidth={sw} strokeDasharray={dash} />
      </g>
      {dimH(0, w, h + m * 0.35, "Width", true)}
      {dimV(-m * 0.75, 0, h, "Height", true)}
      {dimH(0, cx, -m * 0.35, "From left", false)}
      {dimV(w + m * 0.35, cy, h, "From bottom", false)}
      <text className="wedge-label" fontSize={fs * 0.8} x={w / 2} y={h + m * 1.35} textAnchor="middle">
        FRONT
      </text>

      {framed && (
        <>
          <rect x={x0} y={0} width={depth} height={t} className="wedge-wall" fill={`url(#${hatch})`} />
          <rect x={x0} y={h - t} width={depth} height={t} className="wedge-wall" fill={`url(#${hatch})`} />
          <rect x={bx} y={0} width={t} height={h} className={`wedge-wall${on("Thickness")}`} fill={`url(#${hatch})`} />
          <rect x={x0} y={0} width={depth} height={h} className="wedge-outline" strokeWidth={fs * 0.1} />
          <polygon
            className="ob-cone"
            points={`${bx},${cy - rCone} ${bx + rCone * 0.55},${cy - rCone * 0.35} ${bx + rCone * 0.55},${cy + rCone * 0.35} ${bx},${cy + rCone}`}
            strokeWidth={fs * 0.08}
          />
          {dimH(x0, x0 + depth, h + m * 0.35, "Depth", true)}
          <g className={`wedge-dim${on("Thickness")}`} fontSize={fs}>
            <line x1={bx + t / 2} y1={h * 0.2} x2={bx + t / 2 + depth * 0.35} y2={h * 0.12} strokeWidth={sw} />
            <text x={bx + t / 2 + depth * 0.37} y={h * 0.12 - fs * 0.3} textAnchor="start">
              Thickness
            </text>
          </g>
          <text className="wedge-label" fontSize={fs * 0.8} x={x0 - fs * 0.4} y={h / 2} textAnchor="middle" transform={`rotate(-90 ${x0 - fs * 0.4} ${h / 2})`}>
            FRONT →
          </text>
          <text className="wedge-label" fontSize={fs * 0.8} x={x0 + depth / 2} y={h + m * 1.35} textAnchor="middle">
            SIDE
          </text>
        </>
      )}
    </svg>
  );
}
