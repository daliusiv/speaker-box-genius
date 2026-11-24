/**
 * What the response, excursion and Max SPL charts draw, worked out from the state and the
 * simulated designs: the same for the app and for the guide pages, which draw these charts at
 * site build (src/ssr/guideCharts.tsx). The app adds its controls (actions, handles, editor).
 */
import type { LogChartProps, Series } from "./LogChart.tsx";
import { baffleDbFor, checkFromHz, coilLabel, DEEP_ALLOW, DEEP_FLOOR_HZ, deepSplitOf, driveLabel, lowEdge, minus3Points, portLimitOf, prAreas, prGroupLabels, prLimits, type Design } from "./sim.ts";
import type { AppState } from "./state.ts";
import type { SimulationResult } from "@sbg/engine";
import { unitOf, type UnitSystem } from "./units.ts";
import { GUIDE, LIMIT } from "./palette.ts";
import { crestOf, fmtCrest, fmtHeadroom, headroomTone, programOf, type DesignProgram, type SideHeadroom } from "./programSignal.ts";
import type { SummaryCell } from "./LogChart.tsx";

/** What sets the maximum SPL at each frequency, as shown in the strip under the Max SPL chart. */
export const LIMIT_KINDS: Record<string, { label: string; short: string; color: string }> = {
  xmax: { label: "Cone Xmax", short: "cone Xmax", color: LIMIT.xmax },
  "pr-xmax": { label: "PR Xmax", short: "PR Xmax", color: LIMIT.prXmax },
  port: { label: "Port speed", short: "port speed", color: LIMIT.port },
  thermal: { label: "Driver power (Pe)", short: "driver power rating", color: LIMIT.thermal },
  amp: { label: "Amplifier", short: "amplifier limit", color: LIMIT.amp },
  air: { label: "Air distortion", short: "air distortion", color: LIMIT.air },
};

/** The props a chart builder fills in; the rest (controls, handles) are the app's. */
export type ChartDraw = Pick<
  LogChartProps,
  "chartId" | "title" | "shortTitle" | "detail" | "unit" | "freq" | "series" | "limits" | "limitStyle" | "yStep" | "yMin" | "yMax" | "points" | "zones" | "bands" | "markers" | "ribbons" | "ribbonKinds" | "best" | "noteLabel" | "digits" | "sig" | "summary" | "worst"
>;

/**
 * What the excursion charts show: excursion (in the Settings units), as % of Xmax, as the air it
 * moves (Sd × excursion), or the velocity, acceleration or force that goes with it.
 */
export type XView = "x" | "pct" | "vol" | "v" | "a" | "f";
export const XVIEW_ORDER: readonly XView[] = ["x", "pct", "vol", "v", "a", "f"];
export const XVIEWS: Record<XView, { name: string; hint: string }> = {
  x: { name: "Excursion", hint: "Excursion" },
  pct: { name: "% of Xmax", hint: "Excursion as a share of Xmax" },
  vol: { name: "Air moved", hint: "Air moved: Sd × excursion" },
  v: { name: "Velocity", hint: "Velocity (peak, m/s)" },
  a: { name: "Acceleration", hint: "Acceleration (g = 9.81 m/s²)" },
  f: { name: "Force", hint: "Force: moving mass × acceleration (N)" },
};
const G0 = 9.80665;

/** How excursion is shown (Settings → Port speed & excursion): one way peak, peak-to-peak or RMS. */
export const excursionFactor = (e: AppState["settings"]["excursion"]) => (e === "pp" ? 2 : e === "rms" ? Math.SQRT1_2 : 1);
const kindText = (e: AppState["settings"]["excursion"], oneWay = false) => (e === "pp" ? "peak-to-peak" : e === "rms" ? "RMS" : oneWay ? "peak, one way" : "peak");
const kindTag = (e: AppState["settings"]["excursion"]) => (e === "pp" ? " p-p" : e === "rms" ? " RMS" : "");

/** The unit a view shows in, in the Settings units. */
export function xviewUnit(view: XView, units: UnitSystem): string {
  return view === "x" ? unitOf(units, "mm").unit : view === "pct" ? "%" : view === "vol" ? unitOf(units, "disp").unit : view === "v" ? "m/s" : view === "a" ? "g" : "N";
}

/** One way peak excursion (mm) as shown, in the Settings units and peak / p-p / RMS. */
export function excursionText(x_mm: number | null | undefined, state: AppState): string {
  if (x_mm === null || x_mm === undefined || !Number.isFinite(x_mm)) return "–";
  const u = unitOf(state.settings.units, "mm");
  const v = x_mm * excursionFactor(state.settings.excursion) * u.k;
  const digits = u.unit === "mm" ? (v < 10 ? 1 : 0) : 3;
  return `${v.toFixed(digits)} ${u.unit}${kindTag(state.settings.excursion)}`;
}

interface Radiator {
  /** Moving mass (kg), for the force view. */
  mass: number | null;
  /** Radiating area (cm²), for the air-moved view. */
  sd_cm2: number | null;
}

/**
 * An excursion chart (one way peak, mm) in another view. Every curve becomes x × a factor of its
 * own (a units/peak factor, 100 / its Xmax, its Sd, or ω, ω² or its mass × ω²), still judged on its
 * excursion so the glow marks the same frequencies; its limits, deep-bass zone and caution bands get
 * the same factor (horizontal lines stay lines; ones that change with frequency become curves).
 */
function asView(draw: ChartDraw, view: XView, rads: (Radiator | null)[], state: AppState, what: "Cone" | "Passive radiator"): ChartDraw {
  const ex = state.settings.excursion;
  const units = state.settings.units;
  const k = view === "pct" ? 1 : excursionFactor(ex);
  if (view === "x" && k === 1 && units === "metric") return draw;
  const { freq } = draw;
  const ku = unitOf(units, "mm").k;
  const kd = unitOf(units, "disp").k;
  const w = (i: number) => 2 * Math.PI * freq[i]!;
  // The factor for series n at point i (null: can't be shown in this view), and a key to tell factors apart.
  const factorOf = (n: number): { key: string; flat: number | null; at: (i: number) => number } | null => {
    const s = draw.series[n]!;
    const r = rads[n];
    switch (view) {
      case "x":
        return { key: "x", flat: k * ku, at: () => k * ku };
      case "pct":
        return s.over ? { key: `p${s.over}`, flat: 100 / s.over, at: () => 100 / s.over! } : null;
      case "vol":
        return r?.sd_cm2 ? { key: `s${r.sd_cm2}`, flat: (r.sd_cm2 / 10) * k * kd, at: () => (r.sd_cm2! / 10) * k * kd } : null;
      case "v":
        return { key: "v", flat: null, at: (i) => (w(i) / 1000) * k };
      case "a":
        return { key: "a", flat: null, at: (i) => (w(i) ** 2 / 1000 / G0) * k };
      case "f":
        return r?.mass ? { key: `m${r.mass}`, flat: null, at: (i) => ((r.mass! * w(i) ** 2) / 1000) * k } : null;
    }
  };
  const factors = draw.series.map((_, n) => factorOf(n));
  const xmaxNote = (x: number, xmax: number | undefined) => `${excursionText(x, state)}${xmax ? ` · ${Math.round((100 * x) / xmax)} % Xmax` : ""}`;
  const series = draw.series.map((s, n) => {
    const f = factors[n];
    if (!s.y || !f) return { ...s, y: null };
    return {
      ...s,
      y: Float64Array.from(s.y, (x, i) => x * f.at(i)),
      judge: s.y,
      ...(view === "x" ? {} : { notes: Array.from(s.y, (x) => (view === "pct" ? excursionText(x, state) : xmaxNote(x, s.over))) }),
    };
  });
  // The factors of the curves a limit (mm) belongs to: one line or curve each.
  const factorsFor = (mm: number, pick: (s: Series) => number | undefined) => {
    const out = new Map<string, { f: NonNullable<(typeof factors)[number]>; label: string }>();
    draw.series.forEach((s, n) => {
      const f = factors[n];
      if (f && s.y && pick(s) === mm && !out.has(f.key)) out.set(f.key, { f, label: s.label });
    });
    if (out.size === 0) {
      const n = factors.findIndex((f, i) => f && draw.series[i]!.y);
      if (n >= 0) out.set(factors[n]!.key, { f: factors[n]!, label: draw.series[n]!.label });
    }
    return [...out.values()];
  };
  const scaled = (mm: number, f: NonNullable<(typeof factors)[number]>) =>
    f.flat !== null ? { value: mm * f.flat } : { value: 0, curve: Float64Array.from(freq, (_, i) => mm * f.at(i)) };
  const u = xviewUnit(view, units);
  // In the excursion view a limit's own number is converted too ("Xmax 12 mm" → "Xmax 24 mm p-p").
  const relabel = (label: string) =>
    view === "x" ? label.replace(/(\d+(?:\.\d+)?) mm/g, (_, n: string) => excursionText(Number(n), state)) : label;
  const lower = XVIEWS[view].name.toLowerCase();
  const title =
    view === "x"
      ? `${what} excursion (${kindText(ex, true)})`
      : view === "pct"
        ? `${what} excursion (% of Xmax, peak)`
        : view === "vol"
          ? `Air moved by the ${what === "Cone" ? "cone" : "passive radiator"} (Sd × excursion, ${kindText(ex)})`
          : `${what} ${lower} (${kindText(ex)})${view === "f" ? ": moving mass × acceleration" : ""}`;
  const short = what === "Cone" ? "Cone" : "PR";
  return {
    ...draw,
    title,
    shortTitle: view === "x" ? draw.shortTitle : view === "pct" ? `${short} % Xmax` : view === "vol" ? `${short} air moved` : `${short} ${lower}`,
    // The view leads (the desktop title keeps the chart's own name): "velocity · peak · 1 W".
    detail: `${view === "x" ? "" : `${XVIEWS[view].name.toLowerCase()} · `}${view === "pct" ? "peak" : view === "vol" ? `Sd × excursion, ${kindText(ex)}` : view === "x" ? kindText(ex, true) : kindText(ex)} · ${driveLabel(state)}`,
    unit: u,
    ...(view === "pct" ? { digits: 0, sig: undefined } : view === "x" && units === "metric" ? {} : { digits: 1, sig: 3 }),
    ...(view === "x" ? {} : { noteLabel: "Excursion" }),
    series,
    limits: (draw.limits ?? []).flatMap((l) => {
      const fs = factorsFor(l.value, (s) => s.over);
      // A caution band under this limit says so in the limit's label when it's drawn as a curve (its own label would sit on the curves).
      const band = (draw.bands ?? []).find((b) => b.to === l.value && b.label);
      const curved = fs.some((x) => x.f.flat === null);
      const tail = band && curved ? ` · caution from ${Math.round((100 * band.from) / band.to)} %` : "";
      return fs.map(({ f, label }) => ({ ...l, ...scaled(l.value, f), label: l.label ? `${relabel(l.label)}${fs.length > 1 ? ` · ${label}` : ""}${tail}` : l.label }));
    }),
    zones: (draw.zones ?? []).map((z) => {
      const f = factorsFor(z.value, (s) => s.deepOver)[0]?.f;
      return f ? { ...z, ...scaled(z.value, f) } : z;
    }),
    bands: (draw.bands ?? []).flatMap((b) =>
      factorsFor(b.to, (s) => s.over).map(({ f }) => {
        const lo = scaled(b.from, f);
        const hi = scaled(b.to, f);
        return f.flat !== null
          ? { ...b, from: lo.value, to: hi.value }
          : { ...b, label: "", fromCurve: (lo as { curve: Float64Array }).curve, toCurve: (hi as { curve: Float64Array }).curve };
      }),
    ),
    yMin: 0,
  };
}

export interface ChartInput {
  state: AppState;
  designs: Design[];
  /** A line's cone and mouth curves, when switched on. */
  showParts?: boolean;
  /** The main driver's cone area, for the baffle step (cm²). */
  sd_cm2?: number;
  /** Measured curves to draw with the response (relative or not); the app's Measured.tsx. */
  measured?: (relative: boolean) => Series[];
}

/**
 * The level a design's relative response is drawn against: the level F3 is measured from
 * (a plain cone's level, a bandpass box's band peak, or with Settings → F3 from "peak" a box's
 * bass peak), so the −3 dB guide, the F3 dots and the summary agree.
 */
export function relRefOf(r: SimulationResult): number {
  return r.summary.f3RefSpl;
}

/** Value of a curve at frequency f (log-frequency interpolation). */
export function valueAt(freq: Float64Array, ys: ArrayLike<number>, f: number): number {
  let i = 1;
  while (i < freq.length - 1 && freq[i]! < f) i++;
  const t = Math.log(f / freq[i - 1]!) / Math.log(freq[i]! / freq[i - 1]!);
  return ys[i - 1]! + t * (ys[i]! - ys[i - 1]!);
}

const freqOf = (designs: Design[]) => designs[0]?.result.freq ?? new Float64Array();

/** A line's cone and mouth curves, when switched on. */
export function partsOf(d: Design, map: (y: Float64Array) => Float64Array, showParts = false): Series[] {
  return showParts && d.result.parts && !d.compare
    ? [
        { label: `${d.label} · cone`, color: d.color, y: map(d.result.parts.cone), dash: "6 4", thin: true },
        { label: `${d.label} · mouth`, color: d.color, y: map(d.result.parts.mouth), dash: "1.5 3", thin: true },
      ]
    : [];
}

/** A box with its port or PRs some way off: faint dashed, the same box with them side by side. */
export function sideBySideOf(d: Design, map: (y: Float64Array) => Float64Array): Series[] {
  // Only when the user placed the port or PRs (not the Settings-wide "Port sound" delay).
  const at = "ventAt" in d.design ? d.design.ventAt : undefined;
  const placed = at === "back" || at === "custom";
  return placed && d.result.splSideBySide && !d.compare ? [{ label: `${d.label} · side by side`, color: d.color, y: map(d.result.splSideBySide), dash: "2 4", thin: true }] : [];
}

/**
 * Where the response is drawn, with no room or baffle step: a box in a wall (half space), but an
 * open baffle always stands free with its own board (full space), so say so when one is on.
 */
export function spaceOf(designs: Pick<Design, "design">[], long: boolean): string {
  const ob = designs.filter((d) => d.design.kind === "ob").length;
  if (ob === 0) return "half space";
  if (ob === designs.length) return long ? "free-standing (open baffle)" : "free-standing";
  return long ? "half space (open baffles free-standing)" : "half space, open baffles free-standing";
}

export function responseChart(c: ChartInput, mode: "relative" | "absolute"): ChartDraw {
  const { state, designs } = c;
  const hp = state.highPass;
  const mainDesigns = designs.filter((d) => !d.compare);
  const where = state.roomGain.mode === "car" ? "in the car" : "in the room";
  const base: ChartDraw = {
    chartId: "response",
    best: "high",
    noteLabel: mode === "absolute" ? "Note" : "vs loudest",
    shortTitle: mode === "relative" ? "Response" : "SPL",
    detail: `${mode === "relative" ? "Relative" : "dB SPL"} · ${driveLabel(state)}${coilLabel(state)}, 1 m, ${
      state.roomGain.mode === "car"
        ? "in the car"
        : state.roomGain.mode === "room"
          ? "in the room"
          : state.roomGain.mode === "curve"
            ? "your room curve"
            : state.baffle.on
              ? "free-standing"
              : spaceOf(mainDesigns, false)
    }${hp.on ? ` · ${hp.order * 6} dB/oct high-pass at ${hp.freq} Hz` : ""}`,
    title: `${mode === "relative" ? "Relative response" : "SPL"} at ${driveLabel(state)}${coilLabel(state)}, 1 m, ${
      state.roomGain.mode === "car"
        ? "in the car (cabin gain added)"
        : state.roomGain.mode === "room"
          ? "in the room (room gain added)"
          : state.roomGain.mode === "curve"
            ? "with your room curve added"
            : state.baffle.on
              ? "free-standing (baffle step)"
              : spaceOf(mainDesigns, true)
    }${hp.on ? `, with ${hp.order * 6} dB/oct high-pass at ${hp.freq} Hz` : ""}`,
    unit: "dB",
    freq: freqOf(designs),
    series: [],
  };
  if (mode === "absolute") {
    return {
      ...base,
      series: designs
        .flatMap((d) => [{ label: d.label, color: d.color, dash: d.dash, y: d.result.spl }, ...partsOf(d, (y) => y, c.showParts), ...sideBySideOf(d, (y) => y)])
        .concat(c.measured?.(false) ?? []),
    };
  }
  // Relative curves hide which box is louder: the hover box gives each box's level against the
  // loudest at that frequency (dB SPL view has the levels themselves).
  const loudest = Array.from(freqOf(designs), (_, i) => Math.max(...designs.map((d) => d.result.spl[i] ?? -Infinity)));
  const vsLoudest = (spl: Float64Array) =>
    Array.from(spl, (v, i) => {
      const dv = v - loudest[i]!;
      return Number.isFinite(dv) ? (dv > -0.05 ? "0.0 dB" : `${dv.toFixed(1).replace("-", "−")} dB`) : "–";
    });
  return {
    ...base,
    series: designs
      .flatMap((d) => {
        const ref = relRefOf(d.result);
        return [
          {
            label: d.label,
            color: d.color,
            dash: d.dash,
            y: d.result.spl.map((v) => v - ref),
            notes: vsLoudest(d.result.spl),
          },
          ...partsOf(d, (y) => y.map((v) => v - ref), c.showParts),
          ...sideBySideOf(d, (y) => y.map((v) => v - ref)),
        ];
      })
      .concat(c.measured?.(true) ?? []),
    limits: [
      { value: -3, label: "−3 dB", color: "var(--muted)" },
      { value: -6, label: "−6 dB", color: "var(--muted)" },
    ],
    limitStyle: "guide",
    yStep: 6,
    yMin: -30,
    // Headroom: the 0 dB line sits below the top (+6 dB) unless the data go higher.
    yMax: Math.max(6, Math.ceil(Math.max(...designs.flatMap((d) => Array.from(d.result.spl, (v) => v - relRefOf(d.result)).filter(Number.isFinite))) / 6) * 6),
    // F3 dots for the main driver only; the comparison's F3 is in the summary.
    points: mainDesigns.flatMap((d) => {
      const ref = relRefOf(d.result);
      const rel = d.result.spl.map((v) => v - ref);
      // With room or cabin gain, the dot is the F3 in that space (the summary's second
      // F3), where the curve as drawn crosses −3 dB. Otherwise it's the box's own F3, as
      // in the summary: without the baffle step (not a box property), drawn on the curve.
      const step = d.design.kind === "ob" ? null : baffleDbFor(state, d.result.freq, c.sd_cm2);
      if (d.f3Room !== undefined) {
        return (d.f3Room === null ? [] : [d.f3Room]).map((f) => ({
          f,
          y: valueAt(d.result.freq, rel, f),
          color: d.color,
          label: `F3 ${where} ${f < 100 ? f.toFixed(1) : f.toFixed(0)}`,
          of: d.label,
        }));
      }
      const own = step ? rel.map((v, i) => v - step[i]!) : rel;
      const pts = d.design.kind === "line" ? lowEdge(d.result.freq, own) : minus3Points(d.result.freq, own, d.design.kind === "bandpass");
      return pts.map((f) => ({
        f,
        y: step ? valueAt(d.result.freq, rel, f) : -3,
        color: d.color,
        // With the baffle step the dot sits on the curve away from −3 dB: say whose F3 it is.
        label: `${step ? "Box F3" : "F3"} ${f < 100 ? f.toFixed(1) : f.toFixed(0)}`,
        of: d.label,
      }));
    }),
  };
}

/** Cone excursion (or, by `view`, the cone's velocity, acceleration or force). */
export function excursionChart(c: ChartInput, view: XView = "x"): ChartDraw {
  const { state, designs } = c;
  const fadedLabels = designs.filter((d) => d.compare).map((d) => d.label);
  const twoXmax = state.compare && fadedLabels.length > 0 && state.compare.xmax_mm !== state.xmax_mm;
  // Deep bass of the tuned boxes (no high-pass filter): graded up to 2 × Xmax, not failed.
  const splits = designs
    .filter((d) => !d.compare)
    .map((d) => deepSplitOf(d.result, state.highPass.on))
    .filter((v): v is number => v !== null);
  const draw: ChartDraw = {
    chartId: "excursion",
    best: "low",
    shortTitle: "Cone excursion",
    title: "Cone excursion (peak, one way)",
    detail: `peak, one way · ${driveLabel(state)}`,
    unit: "mm",
    freq: freqOf(designs),
    series: designs.map((d) => {
      const xmax = d.compare && state.compare ? state.compare.xmax_mm : state.xmax_mm;
      const split = deepSplitOf(d.result, state.highPass.on);
      return {
        label: d.label,
        color: d.color,
        dash: d.dash,
        y: d.result.excursionMm,
        // Xmax 0 = not known: no redline or glow.
        ...(xmax > 0 ? { over: xmax } : {}),
        // No glow below where the limits are checked (the same floor for every box).
        ...(split && xmax > 0 ? { deepBelow: split, deepOver: DEEP_ALLOW * xmax, deepFloor: DEEP_FLOOR_HZ } : { deepFloor: checkFromHz(state.highPass.on, d.result.summary.f3) }),
      };
    }),
    zones: splits.length && state.xmax_mm > 0 ? [{ below: Math.max(...splits), value: DEEP_ALLOW * state.xmax_mm, label: `Deep bass: ${DEEP_ALLOW} × Xmax`, color: LIMIT.deepBass }] : [],
    limits: [
      ...(state.xmax_mm > 0 ? [{ value: state.xmax_mm, label: twoXmax ? `Xmax ${state.xmax_mm} · vs ${state.compare!.xmax_mm} mm` : `Xmax ${state.xmax_mm} mm`, color: LIMIT.xmax }] : []),
      ...(twoXmax && state.compare!.xmax_mm > 0 ? [{ value: state.compare!.xmax_mm, label: state.xmax_mm > 0 ? "" : `vs Xmax ${state.compare!.xmax_mm} mm`, color: LIMIT.xmax }] : []),
    ],
    yMin: 0,
  };
  return asView(
    draw,
    view,
    designs.map((d) => ({ mass: d.result.coneMotion.mass_kg, sd_cm2: (d.compare && state.compare ? state.compare.ts.sd_cm2 : state.ts.sd_cm2) ?? null })),
    state,
    "Cone",
  );
}

/** What the Max SPL chart shows: the SPL itself, or the amplifier volts, current or power it takes to get there. */
export type MaxMode = "spl" | "volts" | "amps" | "watts";
export const MAX_MODES: readonly MaxMode[] = ["spl", "volts", "amps", "watts"];
export const MAX_MODE_INFO: Record<MaxMode, { label: string; unit: string; name: string; hint: string }> = {
  spl: { label: "SPL", unit: "dB", name: "Max SPL", hint: "The loudest each design can play, and what limits it" },
  volts: { label: "Volts", unit: "V", name: "Amp volts", hint: "The amplifier's output voltage (RMS) needed to reach that maximum SPL, after the high-pass filter and EQ" },
  amps: { label: "Amps", unit: "A", name: "Amp current", hint: "The current (RMS) the amplifier must deliver into the speaker's impedance to reach that maximum SPL" },
  watts: { label: "Watts", unit: "W", name: "Amp power", hint: "The power (RMS) the amplifier must deliver into the speaker's impedance to reach that maximum SPL" },
};
/** Which of the amplifier's limits, as the tooltip names it. */
const AMP_LIMIT_SHORT = { volts: "amp volts", amps: "amp current", watts: "amp power" } as const;

/** A design's program envelope and headroom with the Max SPL chart's signal (F3 in the room when room gain is on). */
export function designProgram(d: Design, signal: AppState["settings"]["signal"]): DesignProgram {
  return programOf(d.result, d.f3Room !== undefined ? d.f3Room : d.result.summary.f3, crestOf(signal), signal.target_dB);
}

/** A limit's short name with the side it holds ("port speed on peaks"); "Pe" where space is tight. */
export function sideLimitText(kind: string, side: "avg" | "peak" | null, tight = false): string {
  const name = kind === "amp" ? (side === "avg" ? "amp power" : "amp volts / current") : kind === "thermal" && tight ? "Pe" : (LIMIT_KINDS[kind]?.short ?? "");
  return tight || !side ? name : `${name} ${side === "peak" ? "on peaks" : "on average"}`;
}

/** A side's headroom as a legend / hover cell. */
export function headroomCell(h: SideHeadroom): SummaryCell | undefined {
  if (!h) return undefined;
  const hz = `@ ${h.f.toFixed(h.f < 10 ? 1 : 0)} Hz`;
  return { main: fmtHeadroom(h.db), at: hz, why: sideLimitText(h.kind, null, true), tone: headroomTone(h.db) };
}

export function maxSplChart(c: ChartInput, mode: MaxMode): ChartDraw {
  const { state, designs } = c;
  const n1 = (v: number) => (Number.isFinite(v) ? (v < 10 ? v.toFixed(1) : v.toFixed(0)) : "–");
  const ampMax = (v: number, unit: string) => [{ value: v, label: `Amp max ${v} ${unit}`, color: LIMIT_KINDS.amp!.color }];
  const s = state.settings;
  const sig = s.signal;
  const on = sig.program;
  const crest = crestOf(sig);
  const progs = on ? designs.map((d) => designProgram(d, sig)) : [];
  // The least headroom of all the boxes: ringed on the plot.
  const worst = on && mode === "spl"
    ? progs.reduce<DesignProgram["overall"]>((w, p) => (p.overall && (!w || p.overall.db < w.db) ? p.overall : w), null)
    : null;
  const target = sig.target_dB;
  // Settings → Power rating vs → Coil temperature: the thermal limit is the coil's temperature, not Pe.
  const coilMode = s.thermalLimit === "coil";
  const kinds = coilMode ? { ...LIMIT_KINDS, thermal: { label: "Coil temperature", short: `coil at ${state.tmax_C} °C`, color: LIMIT_KINDS.thermal!.color } } : LIMIT_KINDS;
  return {
    chartId: "maxspl",
    noteLabel: "Limited by",
    best: mode === "spl" ? "high" : "low",
    shortTitle: mode === "spl" ? "Max SPL" : `${MAX_MODE_INFO[mode].name} for max SPL`,
    detail: `${mode === "spl" ? "" : `${MAX_MODE_INFO[mode].name.toLowerCase()} · `}${on ? "on program · " : ""}${mode === "spl" ? "first limit reached" : mode === "volts" ? "RMS, at the amplifier's terminals" : mode === "amps" ? "RMS" : "RMS, into the speaker's impedance"}`,
    title:
      mode === "spl"
        ? on
          ? "Maximum SPL on program (first limit reached)"
          : "Maximum SPL (first limit reached)"
        : mode === "volts"
          ? `Amplifier voltage needed for maximum SPL${on ? " on program" : ""} (RMS, at the amplifier's terminals)`
          : mode === "amps"
            ? `Amplifier current needed for maximum SPL${on ? " on program" : ""} (RMS)`
            : `Amplifier power needed for maximum SPL${on ? " on program" : ""} (RMS, into the speaker's impedance)`,
    unit: mode === "spl" ? "dB" : mode === "volts" ? "V" : mode === "amps" ? "A" : "W",
    freq: freqOf(designs),
    yMin: mode === "spl" ? undefined : 0,
    series: designs.map((d, di) => {
      const a = d.result.ampAtMax;
      const p = on ? progs[di]! : null;
      // On a program the amp runs this much below its sine maximum (volts and amps scale with it, watts with its square).
      const g = (i: number) => (p ? 10 ** ((p.spl[i]! - d.result.maxSpl[i]!) / 20) : 1);
      const volts = (i: number) => a.volts[i]! * g(i);
      const amps = (i: number) => a.amps[i]! * g(i);
      const watts = (i: number) => a.watts[i]! * g(i) ** 2;
      const pk = (i: number) => (p ? `, ${n1(volts(i) * 10 ** (crest / 20))} V pk` : "");
      const limit = (i: number) => {
        if (p) return coilMode && p.kind[i] === "thermal" ? `${kinds.thermal!.short} on average` : sideLimitText(p.kind[i]!, p.side[i]!);
        const by = d.result.ampLimitBy[i];
        return by ? AMP_LIMIT_SHORT[by] : (kinds[d.result.limitedBy[i]!]?.short ?? "");
      };
      // Coil limit: how hot the coil runs at this maximum and what it costs against a cold coil.
      const coilAt = (i: number) => {
        const c = d.result.coilAtMax;
        if (!c || !Number.isFinite(c.tempC[i]!)) return "";
        const db = `${c.compressionDb[i]!.toFixed(1).replace("-", "−")} dB`;
        // Held by the coil: the limit already says its temperature.
        return (p ? p.kind[i] : d.result.limitedBy[i]) === "thermal" ? `, ${db}` : ` · coil ${Math.round(c.tempC[i]!)} °C, ${db}`;
      };
      const y = (arr: Float64Array, f: (i: number) => number) => (p ? Float64Array.from(arr, (_, i) => f(i)) : arr);
      return {
        label: d.label,
        color: d.color,
        dash: d.dash,
        y: mode === "spl" ? (p ? p.spl : d.result.maxSpl) : mode === "volts" ? y(a.volts, volts) : mode === "amps" ? y(a.amps, amps) : y(a.watts, watts),
        notes: Array.from(d.result.maxSpl, (_, i) =>
          mode === "spl"
            ? `${limit(i)}${coilAt(i)} · amp ${n1(volts(i))} V${p ? " RMS" : ""}${pk(i)}, ${n1(amps(i))} A${s.ampWatts > 0 ? `, ${n1(watts(i))} W` : ""}`
            : mode === "volts"
              ? `${n1(amps(i))} A, ${n1(watts(i))} W${pk(i)} · ${limit(i)}`
              : mode === "amps"
                ? `${n1(volts(i))} V${pk(i)}, ${n1(watts(i))} W · ${limit(i)}`
                : `${n1(volts(i))} V${pk(i)}, ${n1(amps(i))} A · ${limit(i)}`,
        ),
        ...(p ? { summary: [headroomCell(p.peak), headroomCell(p.avg)].map((x) => x ?? { main: "–" }) } : {}),
      };
    }),
    // Each box's first limit (on the program, when on), then the comparison driver's in the same box (outlined marker).
    ribbons: designs.map((d, di) => ({ label: d.label, color: d.color, kinds: on ? progs[di]!.kind : d.result.limitedBy, ...(d.compare ? { hollow: true } : {}) })),
    ribbonKinds: kinds,
    ...(on
      ? {
          summary: {
            headings: ["On peaks", "On average"],
            tipHeadings: ["Headroom on peaks", "on average"],
            caption: `Headroom vs ${target !== null ? `${fmtCrest(target)} dB` : "drive"}, from each box's F3 up`,
          },
        }
      : {}),
    ...(worst
      ? { worst: { f: worst.f, y: worst.y, label: `${fmtHeadroom(worst.db)} @ ${worst.f.toFixed(0)} Hz`, tone: headroomTone(worst.db) } }
      : {}),
    limits:
      mode === "spl" && on && target !== null
        ? [{ value: target, label: `Target ${fmtCrest(target)} dB avg · ${fmtCrest(target + crest)} peak`, color: LIMIT.target }]
        : mode === "volts" && s.ampVolts > 0
          ? ampMax(s.ampVolts, "V")
          : mode === "amps" && s.ampAmps > 0
            ? ampMax(s.ampAmps, "A")
            : mode === "watts" && s.ampWatts > 0
              ? ampMax(s.ampWatts, "W")
              : undefined,
  };
}

/** Every design with passive radiators (PR boxes, and bandpass chambers that use them): one curve per PR group. */
export function prChart(c: ChartInput, view: XView = "x"): ChartDraw {
  const { state, designs } = c;
  const prDesigns = designs.filter((d) => d.result.prGroups);
  const seen = new Map<number, boolean>();
  for (const l of prDesigns.flatMap((d) => prLimits(d.design))) seen.set(l.mm, (seen.get(l.mm) ?? true) && l.mech);
  const limits = [...seen].map(([x, mech]) => ({ value: x, label: `PR ${mech ? "Xmech" : "Xmax"} ${x} mm`, color: LIMIT.xmax, mech }));
  // Caution band under each PR Xmax, from the share set in Settings (a rule of thumb: suspensions stiffen there).
  const caution = state.settings.prCaution_pct;
  const draw: ChartDraw = {
    chartId: "pr",
    best: "low",
    shortTitle: "PR excursion",
    title: "Passive radiator excursion (peak, one way)",
    detail: `peak, one way · ${driveLabel(state)}`,
    unit: "mm",
    freq: freqOf(designs),
    // Groups after the first are dashed and named after their PR.
    series: prDesigns.flatMap((d) => {
      const names = prGroupLabels(d.design);
      return (d.result.prGroups ?? []).map((g, k) => ({
        label: d.design.kind === "pr" && k === 0 ? d.label : `${d.label}: ${names[k] ?? `group ${k + 1}`}`,
        color: d.color,
        dash: d.dash ?? (k === 0 ? undefined : k === 1 ? "6 3" : "2 3"),
        y: g.excursionMm,
        over: g.xmax_mm ?? undefined,
        deepFloor: checkFromHz(state.highPass.on, d.result.summary.f3),
      }));
    }),
    limits,
    bands:
      caution > 0 && caution < 100
        ? limits.map((l, i) => ({ from: (l.value * caution) / 100, to: l.value, label: i === 0 ? `Over ${caution} % of PR ${l.mech ? "Xmech" : "Xmax"}: suspension stiffens (rule of thumb)` : "", color: LIMIT.port }))
        : [],
    yMin: 0,
  };
  return asView(
    draw,
    view,
    prDesigns.flatMap((d) => {
      const areas = prAreas(d.design);
      return (d.result.prGroups ?? []).map((g, k) => ({ mass: g.motion.mass_kg, sd_cm2: areas[k] ?? null }));
    }),
    state,
    "Passive radiator",
  );
}

export function portChart(c: ChartInput): ChartDraw {
  const { state, designs } = c;
  const limit = portLimitOf(state);
  const floor = (d: Design) => checkFromHz(state.highPass.on, d.result.summary.f3);
  return {
    chartId: "port",
    best: "low",
    shortTitle: "Port speed",
    title: `Port air velocity (${state.settings.velocity === "rms" ? "RMS" : "peak"})`,
    detail: `${state.settings.velocity === "rms" ? "RMS" : "peak"} · ${driveLabel(state)}`,
    unit: "m/s",
    freq: freqOf(designs),
    series: [
      ...designs.map((d) => ({ label: d.design.kind === "bandpass" ? `${d.label} (front port)` : d.label, color: d.color, dash: d.dash, y: d.result.portVelocity, over: limit, deepFloor: floor(d) })),
      ...designs.map((d) => ({ label: `${d.label} (rear port)`, color: d.color, dash: "5 3", y: d.result.rearPortVelocity, over: limit, deepFloor: floor(d) })),
    ].filter((s) => s.y),
    limits: [{ value: limit, label: `Chuffing risk ${limit} m/s`, color: LIMIT.xmax }],
    yMin: 0,
  };
}

export function pressureChart(c: ChartInput): ChartDraw {
  const { state, designs } = c;
  return {
    chartId: "pressure",
    best: "low",
    shortTitle: "Box pressure",
    title: "Sound pressure inside the box (peak): the load on the cone and the walls",
    detail: `peak · ${driveLabel(state)}`,
    unit: "Pa",
    freq: freqOf(designs),
    series: [
      // An infinite baffle with an open rear has no air behind the cone: nothing to draw.
      ...designs.map((d) => ({ label: d.design.kind === "bandpass" ? `${d.label} (rear chamber)` : d.label, color: d.color, dash: d.dash, y: openRear(d) ? null : d.result.boxPressurePa })),
      ...designs.map((d) => ({ label: `${d.label} (front chamber)`, color: d.color, dash: "5 3", y: d.result.frontChamberPressurePa })),
    ].filter((s) => s.y),
    yMin: 0,
  };
}

const openRear = (d: Design) => (d.design.kind === "ib" && d.design.rear === "open") || d.design.kind === "ob";

const each = (designs: Design[], pick: (r: SimulationResult) => Float64Array | null): Series[] =>
  designs.map((d) => ({ label: d.label, color: d.color, dash: d.dash, y: pick(d.result) }));

/** Impedance (Ω) or its phase; `extra` adds the app's measured and fitted curves to the Ω view. */
export function impedanceChart(c: ChartInput, mode: "ohms" | "phase", extra: Series[] = []): ChartDraw {
  const { designs } = c;
  const base = { chartId: "impedance", title: mode === "phase" ? "Impedance phase" : "Impedance", unit: mode === "phase" ? "°" : "Ω", freq: freqOf(designs) };
  return mode === "phase"
    ? { ...base, series: each(designs, (r) => r.impedancePhaseDeg), yMin: -90, yMax: 90, yStep: 45, limits: [{ value: 0, label: "0° (resistive)", color: GUIDE }], limitStyle: "guide" }
    : { ...base, series: [...each(designs, (r) => r.impedanceOhm), ...extra], yMin: 0 };
}

/** Lines and horns: the line's acoustic impedance (Hornresp's Za), resistance solid, reactance dashed. */
export function zaChart(c: ChartInput): ChartDraw {
  const za = c.designs.filter((d) => !d.compare && d.result.acousticImpedance);
  const series: Series[] = za.flatMap((d) => {
    const z = d.result.acousticImpedance!;
    return [
      { label: `${d.label}: resistance`, color: d.color, y: z.resistance },
      { label: `${d.label}: reactance`, color: d.color, dash: "5 3", y: z.reactance },
    ];
  });
  // Empty lines resonate sharply (Za runs into the hundreds): keep the scale on the useful part.
  let lo = 0;
  let hi = 1;
  for (const s of series) for (const v of s.y!) if (Number.isFinite(v)) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
  return {
    chartId: "za",
    title: "Line load Za",
    unit: "× ρc/S",
    freq: freqOf(c.designs),
    series,
    limits: [{ value: 1, label: "1 = the duct's own impedance", color: GUIDE }],
    limitStyle: "guide",
    digits: 2,
    yMin: Math.max(-4, Math.floor(lo)),
    yMax: Math.min(6, Math.ceil(hi)),
  };
}

export function delayChart(c: ChartInput): ChartDraw {
  const { designs } = c;
  // Passive radiators put a deep notch in the response at their own resonance, where the
  // group delay swings far negative; mark it instead of drawing a cliff off the chart.
  const markers = designs
    .filter((d) => !d.compare)
    .flatMap((d) => {
      const gd = d.result.groupDelayMs;
      let i0 = -1;
      for (let i = 0; i < gd.length; i++) if (gd[i]! < -20 && (i0 < 0 || gd[i]! < gd[i0]!)) i0 = i;
      if (i0 < 0) return [];
      const f = d.result.freq[i0]!;
      return [{ f, label: `${d.label}: notch ${f < 100 ? f.toFixed(1) : f.toFixed(0)} Hz`, color: d.color }];
    });
  return { chartId: "delay", best: "zero", title: "Group delay", unit: "ms", freq: freqOf(designs), series: each(designs, (r) => r.groupDelayMs), markers, yMin: -20, yMax: 100 };
}
