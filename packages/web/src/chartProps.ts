/**
 * What the response, excursion and Max SPL charts draw, worked out from the state and the
 * simulated designs: the same for the app and for the guide pages, which draw these charts at
 * site build (src/ssr/guideCharts.tsx). The app adds its controls (actions, handles, editor).
 */
import type { LogChartProps, Series } from "./LogChart.tsx";
import { baffleDbFor, checkFromHz, coilLabel, DEEP_ALLOW, DEEP_FLOOR_HZ, deepSplitOf, driveLabel, lowEdge, minus3Points, portLimitOf, prGroupLabels, prXmaxes, type Design } from "./sim.ts";
import type { AppState } from "./state.ts";
import type { SimulationResult } from "@sbg/engine";
import { GUIDE, LIMIT } from "./palette.ts";

/** What sets the maximum SPL at each frequency, as shown in the strip under the Max SPL chart. */
export const LIMIT_KINDS: Record<string, { label: string; short: string; color: string }> = {
  xmax: { label: "Cone Xmax", short: "cone Xmax", color: LIMIT.xmax },
  "pr-xmax": { label: "PR Xmax", short: "PR Xmax", color: LIMIT.prXmax },
  port: { label: "Port speed", short: "port speed", color: LIMIT.port },
  thermal: { label: "Power (Pe)", short: "power handling", color: LIMIT.thermal },
  amp: { label: "Amplifier", short: "amplifier limit", color: LIMIT.amp },
  air: { label: "Air distortion", short: "air distortion", color: LIMIT.air },
};

/** The props a chart builder fills in; the rest (controls, handles) are the app's. */
export type ChartDraw = Pick<
  LogChartProps,
  "chartId" | "title" | "shortTitle" | "unit" | "freq" | "series" | "limits" | "limitStyle" | "yStep" | "yMin" | "yMax" | "points" | "zones" | "bands" | "markers" | "ribbons" | "ribbonKinds" | "best" | "noteLabel" | "digits"
>;

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

export function responseChart(c: ChartInput, mode: "relative" | "absolute"): ChartDraw {
  const { state, designs } = c;
  const hp = state.highPass;
  const mainDesigns = designs.filter((d) => !d.compare);
  const where = state.roomGain.mode === "car" ? "in the car" : "in the room";
  const base: ChartDraw = {
    chartId: "response",
    best: "high",
    noteLabel: mode === "absolute" ? "Note" : "vs loudest",
    shortTitle: `${mode === "relative" ? "Response" : "SPL"} · ${driveLabel(state)}${hp.on ? " · high-pass" : ""}`,
    title: `${mode === "relative" ? "Relative response" : "SPL"} at ${driveLabel(state)}${coilLabel(state)}, 1 m, ${
      state.roomGain.mode === "car"
        ? "in the car (cabin gain added)"
        : state.roomGain.mode === "room"
          ? "in the room (room gain added)"
          : state.roomGain.mode === "curve"
            ? "with your room curve added"
            : state.baffle.on
              ? "free-standing (baffle step)"
              : "half space"
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
      const step = baffleDbFor(state, d.result.freq, c.sd_cm2);
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

export function excursionChart(c: ChartInput): ChartDraw {
  const { state, designs } = c;
  const fadedLabels = designs.filter((d) => d.compare).map((d) => d.label);
  const twoXmax = state.compare && fadedLabels.length > 0 && state.compare.xmax_mm !== state.xmax_mm;
  // Deep bass of the tuned boxes (no high-pass filter): graded up to 2 × Xmax, not failed.
  const splits = designs
    .filter((d) => !d.compare)
    .map((d) => deepSplitOf(d.result, state.highPass.on))
    .filter((v): v is number => v !== null);
  return {
    chartId: "excursion",
    best: "low",
    shortTitle: "Cone excursion",
    title: "Cone excursion (peak, one way)",
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
        over: xmax,
        // No glow below where the limits are checked (the same floor for every box).
        ...(split ? { deepBelow: split, deepOver: DEEP_ALLOW * xmax, deepFloor: DEEP_FLOOR_HZ } : { deepFloor: checkFromHz(state.highPass.on, d.result.summary.f3) }),
      };
    }),
    zones: splits.length ? [{ below: Math.max(...splits), value: DEEP_ALLOW * state.xmax_mm, label: `Deep bass: ${DEEP_ALLOW} × Xmax`, color: LIMIT.deepBass }] : [],
    limits: [
      { value: state.xmax_mm, label: twoXmax ? `Xmax ${state.xmax_mm} · vs ${state.compare!.xmax_mm} mm` : `Xmax ${state.xmax_mm} mm`, color: LIMIT.xmax },
      ...(twoXmax ? [{ value: state.compare!.xmax_mm, label: "", color: LIMIT.xmax }] : []),
    ],
    yMin: 0,
  };
}

export function maxSplChart(c: ChartInput, mode: "spl" | "volts" | "amps"): ChartDraw {
  const { state, designs } = c;
  const n1 = (v: number) => (Number.isFinite(v) ? (v < 10 ? v.toFixed(1) : v.toFixed(0)) : "–");
  return {
    chartId: "maxspl",
    noteLabel: "Limited by",
    best: mode === "spl" ? "high" : "low",
    shortTitle: mode === "spl" ? "Max SPL" : mode === "volts" ? "Amp volts for max SPL" : "Amp current for max SPL",
    title:
      mode === "spl"
        ? "Maximum SPL (first limit reached)"
        : mode === "volts"
          ? "Amplifier voltage needed for maximum SPL (RMS, at the amplifier's terminals)"
          : "Amplifier current needed for maximum SPL (RMS)",
    unit: mode === "spl" ? "dB" : mode === "volts" ? "V" : "A",
    freq: freqOf(designs),
    yMin: mode === "spl" ? undefined : 0,
    series: designs.map((d) => {
      const a = d.result.ampAtMax;
      const limit = (i: number) => LIMIT_KINDS[d.result.limitedBy[i]!]?.short ?? "";
      return {
        label: d.label,
        color: d.color,
        dash: d.dash,
        y: mode === "spl" ? d.result.maxSpl : mode === "volts" ? a.volts : a.amps,
        notes: Array.from(d.result.maxSpl, (_, i) =>
          mode === "spl"
            ? `${limit(i)} · amp ${n1(a.volts[i]!)} V, ${n1(a.amps[i]!)} A`
            : mode === "volts"
              ? `${n1(a.amps[i]!)} A, ${n1(a.watts[i]!)} W · ${limit(i)}`
              : `${n1(a.volts[i]!)} V, ${n1(a.watts[i]!)} W · ${limit(i)}`,
        ),
      };
    }),
    // Each box's first limit, then the comparison driver's in the same box (outlined marker).
    ribbons: designs.map((d) => ({ label: d.label, color: d.color, kinds: d.result.limitedBy, ...(d.compare ? { hollow: true } : {}) })),
    ribbonKinds: LIMIT_KINDS,
    limits:
      mode === "volts" && state.settings.ampVolts > 0
        ? [{ value: state.settings.ampVolts, label: `Amp max ${state.settings.ampVolts} V`, color: LIMIT_KINDS.amp!.color }]
        : mode === "amps" && state.settings.ampAmps > 0
          ? [{ value: state.settings.ampAmps, label: `Amp max ${state.settings.ampAmps} A`, color: LIMIT_KINDS.amp!.color }]
          : undefined,
  };
}

/** Every design with passive radiators (PR boxes, and bandpass chambers that use them): one curve per PR group. */
export function prChart(c: ChartInput): ChartDraw {
  const { state, designs } = c;
  const prDesigns = designs.filter((d) => d.result.prGroups);
  const limits = [...new Set(prDesigns.flatMap((d) => prXmaxes(d.design)))].map((x) => ({ value: x, label: `PR Xmax ${x} mm`, color: LIMIT.xmax }));
  // Caution band under each PR Xmax, from the share set in Settings (a rule of thumb: suspensions stiffen there).
  const caution = state.settings.prCaution_pct;
  return {
    chartId: "pr",
    best: "low",
    shortTitle: "PR excursion",
    title: "Passive radiator excursion (peak, one way)",
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
        ? limits.map((l, i) => ({ from: (l.value * caution) / 100, to: l.value, label: i === 0 ? `Over ${caution} % of PR Xmax: suspension stiffens (rule of thumb)` : "", color: LIMIT.port }))
        : [],
    yMin: 0,
  };
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
  const { designs } = c;
  return {
    chartId: "pressure",
    best: "low",
    shortTitle: "Box pressure",
    title: "Sound pressure inside the box (peak): the load on the cone and the walls",
    unit: "Pa",
    freq: freqOf(designs),
    series: [
      ...designs.map((d) => ({ label: d.design.kind === "bandpass" ? `${d.label} (rear chamber)` : d.label, color: d.color, dash: d.dash, y: d.result.boxPressurePa })),
      ...designs.map((d) => ({ label: `${d.label} (front chamber)`, color: d.color, dash: "5 3", y: d.result.frontChamberPressurePa })),
    ].filter((s) => s.y),
    yMin: 0,
  };
}

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
