/**
 * Guide figures that aren't one of the app's charts but are worked out from the same engine:
 * a difference of two curves, the cabin gain model alone, the baffle step alone, watts at a set
 * voltage. Each is drawn at build by the app's LogChart, like the charts (site/guideCharts.ts):
 *
 *   ![caption](figure:subs-difference)
 *   {{fig:subs-difference/crossSealed}}   one of the figure's values, for its caption and text
 *
 * A figure is one chart or several side by side (each labelled); a panel can also be an app chart
 * (`chart:` form, see guideCharts.ts). Colours come from the app's palette (palette.ts).
 */
import { EXAMPLES } from "./examples.ts";
import { runDesigns, solveDriver, roomGainOf, type Design } from "../packages/web/src/sim.ts";
import { GUIDE, KIND_COLORS, KIND_COLOR_NAMES, LIMIT } from "../packages/web/src/palette.ts";
import { ampLimitsFromRatings, ampPowerInto } from "../packages/web/src/ampRating.ts";
import { baffleStepDb, roomGainDb, type Baffle } from "../packages/engine/src/index.ts";
import { frustumInside } from "../packages/engine/src/volume.ts";
import type { DesignKind } from "../packages/web/src/state.ts";
import type { XYPlot } from "./xyPlot.ts";

export interface FigureCurve {
  label: string;
  color: string;
  y: number[];
  dash?: string;
}
/** One chart's data, as LogChart draws it (log frequency axis). */
export interface FigurePlot {
  title: string;
  unit: string;
  freq: number[];
  series: FigureCurve[];
  /** Dashed reference lines (a 0 dB line). */
  guides?: { value: number; label: string }[];
  yMin?: number;
  yMax?: number;
  digits?: number;
  /** No Peak column (a difference or a gain, where the peak isn't the point). */
  noPeak?: boolean;
}
export type FigurePanel = { label?: string } & ({ plot: FigurePlot } | { chart: string } | { xy: XYPlot });
export interface Figure {
  panels: FigurePanel[];
  /** Numbers and colour words for the caption and the text ({{fig:name/key}}). */
  values: Record<string, number | string>;
}

const runs = new Map<string, Design[]>();
function run(name: string): Design[] {
  let r = runs.get(name);
  if (!r) {
    const s = EXAMPLES[name]!();
    r = runDesigns(s, solveDriver(s));
    runs.set(name, r);
  }
  return r;
}

/** Colour n (from 0) of a kind's shades, with its name for captions. */
const shade = (kind: DesignKind, n = 0) => ({ color: KIND_COLORS[kind][n]!, name: KIND_COLOR_NAMES[kind][n]! });
/** A log-spaced grid, `perOctave` points an octave. */
function grid(lo: number, hi: number, perOctave = 24): number[] {
  const n = Math.round(Math.log2(hi / lo) * perOctave);
  return Array.from({ length: n + 1 }, (_, i) => lo * 2 ** (i / perOctave));
}
/** Points of a design's frequency grid between lo and hi. */
function range(freq: Float64Array, lo: number, hi: number): number[] {
  const out: number[] = [];
  freq.forEach((f, i) => f >= lo - 1e-9 && f <= hi + 1e-9 && out.push(i));
  return out;
}
/** First frequency above `from` where a curve crosses from above zero to below, interpolated. */
function downCross(freq: number[], y: number[], from: number): number {
  for (let i = 1; i < y.length; i++) {
    if (freq[i]! <= from) continue;
    if (y[i - 1]! > 0 && y[i]! <= 0) return freq[i - 1]! + ((freq[i]! - freq[i - 1]!) * y[i - 1]!) / (y[i - 1]! - y[i]!);
  }
  return NaN;
}
const at = (freq: number[], y: number[], f: number) => {
  const i = freq.findIndex((x) => x >= f);
  if (i < 0) return NaN;
  if (i === 0) return y[0]!;
  const t = (Math.log(f) - Math.log(freq[i - 1]!)) / (Math.log(freq[i]!) - Math.log(freq[i - 1]!));
  return y[i - 1]! + t * (y[i]! - y[i - 1]!);
};
const ZERO = [{ value: 0, label: "0 dB" }];
/** The baffle-step guide's bookshelf driver's cone area, which averages the step over the cone as the app does. */
function bookshelfSd(): number {
  const s = EXAMPLES["baffle-free"]!();
  return solveDriver(s).values.sd_cm2!;
}

export const FIGURES: Record<string, () => Figure> = {
  /** One 15 or two 10s: the 15's maximum SPL minus the pair's, per box and wiring. */
  "subs-difference": () => {
    const [s15, p15, sPair, pPair] = run("subs-example");
    const [sS15, , sSer] = run("subs-series");
    const idx = range(s15!.result.freq, 18, 120);
    const freq = idx.map((i) => s15!.result.freq[i]!);
    const diff = (a: Design, b: Design) => idx.map((i) => a.result.maxSpl[i]! - b.result.maxSpl[i]!);
    const sealed = diff(s15!, sPair!), ported = diff(p15!, pPair!), series = diff(sS15!, sSer!);
    const b = shade("sealed"), o = shade("vented"), lb = shade("sealed", 1);
    return {
      panels: [{ plot: { title: "Maximum SPL, one 15″ minus two 10″", unit: "dB", freq, noPeak: true, guides: ZERO, series: [
        { label: "100 L sealed, pair in parallel", color: b.color, y: sealed },
        { label: "150 L ported, pair in parallel", color: o.color, y: ported },
        { label: "100 L sealed, pair in series", color: lb.color, y: series, dash: "7 4" },
      ] } }],
      values: {
        crossSealed: downCross(freq, sealed, 30),
        crossPorted: downCross(freq, ported, 30),
        seriesMin: Math.min(...series),
        sealedLead: Math.max(...sealed),
        pairLead: -Math.min(...sealed),
        pairLeadF: freq[sealed.indexOf(Math.min(...sealed))]!,
        sealedColor: b.name,
        portedColor: o.name,
      },
    };
  },

  /** The app's cabin gain for four cabin lengths. */
  "car-cabin-length": () => {
    const base = EXAMPLES["car-example"]!();
    const freq = grid(10, 160);
    const lengths = [180, 250, 350, 450];
    const values: Record<string, number | string> = {};
    const series = lengths.map((cm, i) => {
      const room = roomGainOf({ ...base, roomGain: { ...base.roomGain, mode: "car", length_cm: cm } })!;
      const y = freq.map((f) => roomGainDb(f, room));
      values[`at30_${cm}`] = at(freq, y, 30);
      values[`start_${cm}`] = (room as { f0: number }).f0;
      return { label: `${(cm / 100).toFixed(1)} m${cm === base.roomGain.length_cm ? " (the app's car preset)" : ""}`, color: [shade("sealed"), shade("vented"), shade("pr"), shade("bandpass")][i]!.color, y };
    });
    return { panels: [{ plot: { title: "Cabin gain by cabin length", unit: "dB", freq, noPeak: true, series } }], values };
  },

  /** Box + cabin: each car box on its own, the cabin gain, and what you hear in the car. */
  "car-cabin-sum": () => {
    const inCar = run("car-example"), out = run("car-nocabin");
    const values: Record<string, number | string> = {};
    const panel = (n: number, label: string, key: string): FigurePanel => {
      const a = inCar[n]!.result, b = out[n]!.result;
      const idx = range(a.freq, 15, 200);
      const freq = idx.map((i) => a.freq[i]!);
      const ref = b.summary.referenceSpl;
      const box = idx.map((i) => b.spl[i]! - ref), car = idx.map((i) => a.spl[i]! - ref), gain = idx.map((i) => a.spl[i]! - b.spl[i]!);
      const c = inCar[n]!.color;
      const hump = Math.max(...car);
      values[`${key}Hump`] = hump;
      values[`${key}HumpF`] = freq[car.indexOf(hump)]!;
      values[`${key}BoxAt30`] = -at(freq, box, 30);
      values[`${key}GainAt30`] = at(freq, gain, 30);
      values[`${key}GainStart`] = (roomGainOf(EXAMPLES["car-example"]!())! as { f0: number }).f0;
      values[`${key}Ripple`] = (() => { const band = freq.map((f, i) => (f >= 30 && f <= 80 ? car[i]! : NaN)).filter(Number.isFinite); return Math.max(...band) - Math.min(...band); })();
      return { label, plot: { title: "Relative response", unit: "dB", freq, noPeak: true, guides: ZERO, yMin: -20, series: [
        { label: "The box on its own", color: GUIDE, y: box },
        { label: "Cabin gain", color: shade("bandpass").color, y: gain, dash: "7 4" },
        { label: `${inCar[n]!.design.name} in the car`, color: c, y: car },
      ] } };
    };
    return { panels: [panel(0, `${run("car-example")[0]!.design.name}`, "sealed"), panel(1, `${run("car-example")[1]!.design.name}`, "ported")], values };
  },

  /** Baffle step: the bookshelf four ways, and the step alone for four baffle sizes. */
  "baffle-step": () => {
    const freq = grid(30, 5000, 16);
    const sd_cm2 = bookshelfSd();
    const step = (w: number, h: number, x: number, y: number) => Array.from(baffleStepDb(freq, { width: w / 100, height: h / 100, x: x / 100, y: y / 100, sd_cm2 } satisfies Baffle));
    const sizes: [string, number, number][] = [["15 × 32 cm", 15, 32], ["20 × 32 cm", 20, 32], ["40 × 32 cm", 40, 32], ["20 × 100 cm tower", 20, 100]];
    const colors = [shade("vented"), shade("sealed"), shade("pr"), shade("bandpass")];
    return {
      panels: [
        { label: "On a 20 × 32 cm baffle", chart: "baffle-ib+baffle-free+baffle-eq3+baffle-passive/spl" },
        { label: "The step alone, by baffle size", plot: { title: "Baffle step", unit: "dB", freq, noPeak: true, guides: ZERO, series: sizes.map(([label, w, h], i) => ({ label, color: colors[i]!.color, y: step(w, h, w / 2, 22) })) } },
      ],
      values: {},
    };
  },

  /** Where the driver sits on a 30 × 30 cm baffle, and what the step costs the bookshelf's maximum SPL. */
  "baffle-step-placement": () => {
    const freq = grid(30, 5000, 16);
    const sd_cm2 = bookshelfSd();
    const step = (x: number, y: number) => Array.from(baffleStepDb(freq, { width: 0.3, height: 0.3, x: x / 100, y: y / 100, sd_cm2 }));
    const centred = step(15, 15), off = step(11, 10);
    // The dip after the step's peak (0 when the curve never goes below 0 dB there).
    const min = (y: number[]) => Math.min(0, ...y.slice(y.indexOf(Math.max(...y))));
    const o = shade("vented"), b = shade("sealed");
    const ib = run("baffle-ib")[0]!.result, free = run("baffle-free")[0]!.result;
    return {
      panels: [
        { label: "30 × 30 cm baffle", plot: { title: "Baffle step", unit: "dB", freq, noPeak: true, guides: ZERO, series: [
          { label: "Centred", color: o.color, y: centred },
          { label: "11 cm from the side, 10 cm from the top", color: b.color, y: off },
        ] } },
        { label: "Maximum SPL of the bookshelf", chart: "baffle-ib+baffle-free/maxspl" },
      ],
      values: {
        centredPeak: Math.max(...centred),
        centredDip: min(centred),
        offPeak: Math.max(...off),
        offDip: min(off),
        max50Ib: at(Array.from(ib.freq), Array.from(ib.maxSpl), 50),
        max50Free: at(Array.from(free.freq), Array.from(free.maxSpl), 50),
        maxLoss50: at(Array.from(ib.freq), Array.from(ib.maxSpl), 50) - at(Array.from(free.freq), Array.from(free.maxSpl), 50),
      },
    };
  },

  /** Ports as pipes: the round port and the slot stand-in, each as an air mass and as a pipe; the resonance each adds. */
  "port-shape-pipe": () => {
    const lumped = run("port-shape"), pipes = run("port-shape-pipes");
    const rise = (n: number) => {
      // Where the pipe curve rises furthest above the lumped one (150–500 Hz), on a fine log grid.
      const a = lumped[n]!.result, b = pipes[n]!.result;
      let best = { db: -Infinity, f: 0 };
      for (const f of grid(150, 495, 96)) {
        const d = at(Array.from(b.freq), Array.from(b.spl), f) - at(Array.from(a.freq), Array.from(a.spl), f);
        if (d > best.db) best = { db: d, f };
      }
      return best;
    };
    const r = rise(0), s = rise(2);
    return {
      panels: [
        { label: "Round port", chart: "port-shape:1+port-shape-pipes:1/spl" },
        { label: "Slot stand-in, modelled longer", chart: "port-shape:3+port-shape-pipes:3/spl" },
      ],
      values: { roundF: r.f, roundDb: r.db, slotF: s.f, slotDb: s.db },
    };
  },

  /** One sub at its rated voltage: its impedance, and the watts the amp delivers into it. */
  "amp-matching-watts": () => {
    const [one] = run("amp-one");
    const r = one!.result;
    const idx = range(r.freq, 24, 200);
    const freq = idx.map((i) => r.freq[i]!);
    const watts = idx.map((i) => r.ampAtMax.watts[i]!);
    const splBand = range(r.freq, 30, 200).map((i) => r.spl[i]!);
    return {
      panels: [
        { label: "Impedance", chart: "amp-one/impedance" },
        { label: "Watts the amp delivers (from 24 Hz, above the port's limit)", plot: { title: "Amplifier power", unit: "W", freq, digits: 0, series: [{ label: "One sub at 35.2 V", color: shade("pr").color, y: watts }] } },
      ],
      values: {
        w25: at(freq, watts, 25),
        w40: at(freq, watts, 40),
        w100: at(freq, watts, 100),
        w150: at(freq, watts, 150),
        wMax: Math.max(...watts),
        wMin: Math.min(...watts),
        splSpread: Math.max(...splBand) - Math.min(...splBand),
      },
    };
  },
};

/** Extremes of a curve between two frequencies. */
function spanOf(r: Design["result"], y: Float64Array, lo: number, hi: number): [number, number] {
  const v = range(r.freq, lo, hi).map((i) => y[i]!);
  return [Math.min(...v), Math.max(...v)];
}
const logTicks = (lo: number, hi: number) => [1, 2, 3, 4, 6, 8, 10, 20, 30, 40, 60, 80, 100].filter((t) => t >= lo && t <= hi);

/**
 * The amp-matching guide's numbers about its four wirings: where the parallel pair meets the
 * amp's current limit, what it would like, what that costs, and each wiring's peak current. All
 * read at the stated frequency (interpolated on a log axis), as {{num:…}} values are.
 */
function ampWiringValues(): Record<string, number> {
  const r = (k: string) => run(k)[0]!.result;
  const one = r("amp-one"), par = r("amp-parallel"), free = r("amp-parallel-free"), ser = r("amp-series"), bri = r("amp-bridged");
  const v = (x: Design["result"], y: Float64Array, f: number) => at(Array.from(x.freq), Array.from(y), f);
  const ampBand = par.freq.filter((_, i) => par.limitedBy[i] === "amp");
  const low = ampBand.filter((f) => f < 40), high = ampBand.filter((f) => f > 40);
  const peakAmps = (x: Design["result"]) => spanOf(x, x.ampAtMax.amps, 15, 200)[1];
  const fb = 23.8;
  const short = (f: number) => v(free, free.maxSpl, f) - v(par, par.maxSpl, f);
  const shortNearTuning = Math.max(...range(par.freq, 20, 30).map((i) => free.maxSpl[i]! - par.maxSpl[i]!));
  const [zMin] = spanOf(one, one.impedanceOhm, 15, 200);
  const zMinF = one.freq[range(one.freq, 15, 200).find((i) => one.impedanceOhm[i] === zMin)!]!;
  return {
    oneMinF: zMinF,
    oneMinPct: (zMin / 4) * 100,
    oneZTune: v(one, one.impedanceOhm, fb),
    parZTune: v(par, par.impedanceOhm, fb),
    parZ100: v(par, par.impedanceOhm, 100),
    parMinF: par.freq[range(par.freq, 15, 200).reduce((a, i) => (par.impedanceOhm[i]! < par.impedanceOhm[a]! ? i : a))]!,
    wantTune: v(free, free.ampAtMax.amps, fb),
    wantPeak: peakAmps(free),
    ampFrom: low[0]!,
    ampTo: low[low.length - 1]!,
    ampAgain: high[0]!,
    maxTune: v(par, par.maxSpl, fb),
    maxTuneFree: v(free, free.maxSpl, fb),
    shortTune: short(fb),
    shortNearTuning,
    short100: short(100),
    short150: short(150),
    peakOne: peakAmps(one),
    peakPar: peakAmps(par),
    peakSer: peakAmps(ser),
    peakBri: peakAmps(bri),
  };
}

Object.assign(FIGURES, {
  /** The amp as a voltage and a current limit against load impedance, and how far the subs' loads swing. */
  "amp-matching": (): Figure => {
    const ch = ampLimitsFromRatings([{ watts: 350, ohms: 4 }, { watts: 550, ohms: 2 }])!;
    const br = ampLimitsFromRatings([{ watts: 700, ohms: 8 }, { watts: 1100, ohms: 4 }])!;
    const ohms = Array.from({ length: 241 }, (_, i) => 10 ** (i / 150));
    const swing = (k: string) => spanOf(run(k)[0]!.result, run(k)[0]!.result.impedanceOhm, 15, 200);
    const [one, par, ser] = [swing("amp-one"), swing("amp-parallel"), swing("amp-series")];
    const teal = LIMIT.amp;
    const fmt = (r: [number, number]) => `${r[0] < 2 ? r[0].toFixed(2) : r[0] < 10 ? r[0].toFixed(2) : r[0].toFixed(1)}–${r[1].toFixed(1)} Ω`;
    return {
      panels: [{ xy: {
        title: "What the amp can deliver into each load",
        xLabel: "load impedance, Ω",
        yLabel: "W",
        x: { min: 1, max: 40, log: true, ticks: logTicks(1, 40) },
        y: { min: 0, max: 1300, ticks: [0, 200, 400, 600, 800, 1000, 1200] },
        series: [
          { label: `One channel: ${ch.volts} V, ${ch.amps} A`, color: teal, points: ohms.map((z) => [z, ampPowerInto(ch, z)]) },
          { label: `Bridged: ${br.volts} V, ${br.amps} A`, color: teal, dash: "7 4", points: ohms.map((z) => [z, ampPowerInto(br, z)]) },
        ],
        dots: [
          { x: 8, y: 215, label: "215 W @ 8 Ω" },
          { x: 4, y: 350, label: "350 W @ 4 Ω" },
          { x: 2, y: 550, label: "550 W @ 2 Ω" },
          { x: 8, y: 700, label: "700 W bridged @ 8 Ω" },
          { x: 4, y: 1100, label: "1100 W bridged @ 4 Ω" },
        ],
        ranges: [
          { label: `One sub ${fmt(one)}`, color: shade("vented").color, from: one[0], to: one[1] },
          { label: `Two in parallel ${fmt(par)}`, color: shade("sealed").color, from: par[0], to: par[1] },
          { label: `Two in series ${fmt(ser)}`, color: shade("bandpass").color, from: ser[0], to: ser[1] },
        ],
      } }],
      values: {
        ...ampWiringValues(),
        volts: ch.volts, amps: ch.amps, bridgedVolts: br.volts, knee: ch.volts / ch.amps,
        oneMin: one[0], oneMax: one[1], parMin: par[0], parMax: par[1], serMin: ser[0], serMax: ser[1],
      },
    };
  },

  /** Sealed box size for Qtc 0.707 against Qts, for the T/S guide's two drivers' Vas. */
  "ts-box-size": (): Figure => {
    const s = EXAMPLES["ts-example"]!();
    // Qts from Qes and Qms (the datasheets' Qts is rounded to two places).
    const qtsOf = (v: { qes?: number; qms?: number }) => (v.qes! * v.qms!) / (v.qes! + v.qms!);
    const a = { ...solveDriver(s).values }, b = { ...solveDriver({ ...s, ts: s.compare!.ts }).values };
    a.qts = qtsOf(a);
    b.qts = qtsOf(b);
    const vb = (vas: number, qts: number) => vas / ((0.707 / qts) ** 2 - 1);
    const qs = Array.from({ length: 70 }, (_, i) => 0.25 + i * 0.005);
    const line = (vas: number) => qs.map((q) => [q * 100, vb(vas, q)] as [number, number]).filter(([, v]) => v <= 60);
    const va = vb(a.vas_l!, a.qts!), vbb = vb(b.vas_l!, b.qts!);
    return {
      panels: [{ xy: {
        title: "Sealed box for Qtc 0.707: Vb = Vas / ((0.707 / Qts)² − 1)",
        xLabel: "Qts × 100",
        yLabel: "L",
        x: { min: 25, max: 60, ticks: [25, 30, 35, 40, 45, 50, 55, 60] },
        y: { min: 0, max: 60, ticks: [0, 20, 40, 60] },
        series: [
          { label: `Vas ${a.vas_l} L (DSA215-8)`, color: shade("sealed").color, points: line(a.vas_l!) },
          { label: `Vas ${b.vas_l} L (RSS210HF-4)`, color: shade("vented").color, points: line(b.vas_l!) },
        ],
        dots: [
          { x: a.qts! * 100, y: va, label: `DSA215-8: ${va.toFixed(1)} L` },
          { x: b.qts! * 100, y: vbb, label: `RSS210HF-4: ${vbb.toFixed(1)} L` },
        ],
      } }],
      values: { vasA: a.vas_l!, qtsA: a.qts!, vbA: va, vasB: b.vas_l!, qtsB: b.qts!, vbB: vbb },
    };
  },

  /** Two volume shortcuts against the exact inside, by how big a tapered box's top is. */
  "shaped-cabinets-shortcuts": (): Figure => {
    const t = 1.8;
    const pct = Array.from({ length: 101 }, (_, i) => i);
    // Upright-wall shortcut on a square frustum 50 × 50 cm, 40 cm tall: outer sizes less 2t, as if the walls were upright.
    const upright = pct.map((p) => {
      const top = 50 * (p / 100);
      const ins = frustumInside({ kind: "frustum", bottomWidth_cm: 50, bottomDepth_cm: 50, topWidth_cm: top, topDepth_cm: top, height_cm: 40 }, t);
      const exact = (ins.h / 3) * (ins.w1 * ins.d1 + ins.w2 * ins.d2 + Math.sqrt(ins.w1 * ins.d1 * ins.w2 * ins.d2));
      const a1 = (50 - 2 * t) ** 2, a2 = Math.max(0, top - 2 * t) ** 2;
      const short = ((40 - 2 * t) / 3) * (a1 + a2 + Math.sqrt(a1 * a2));
      return [p, (short / exact - 1) * 100] as [number, number];
    });
    // The similar-bases frustum formula on a wedge: 60 × 60 cm base, one side tapering to p % of 60, 50 cm tall.
    const wedge = pct.map((p) => {
      const a1 = 3600, a2 = 3600 * (p / 100);
      const exact = 50 * 60 * ((60 + 60 * (p / 100)) / 2);
      const formula = (50 / 3) * (a1 + a2 + Math.sqrt(a1 * a2));
      return [p, (formula / exact - 1) * 100] as [number, number];
    });
    return {
      panels: [{ xy: {
        title: "Two shortcuts that get tapered boxes wrong",
        xLabel: "top as % of the bottom",
        yLabel: "%",
        x: { min: 0, max: 100, ticks: [0, 20, 40, 60, 80, 100] },
        y: { min: -35, max: 25, ticks: [-30, -20, -10, 0, 10, 20] },
        series: [
          { label: "Walls taken off as if upright (50 × 50 cm base, 40 cm tall, 18 mm MDF)", color: shade("vented").color, points: upright },
          { label: "h/3 (A₁ + A₂ + √A₁A₂) on a wedge (60 × 60 cm base, one side tapering, 50 cm tall)", color: shade("sealed").color, points: wedge },
        ],
      } }],
      values: { uprightMax: Math.max(...upright.map(([, e]) => e)), wedgeMin: -Math.min(...wedge.map(([, e]) => e)) },
    };
  },

  /** DVC wiring at the same power: SPL, the load, and what 0.15 Ω of amp and cable costs each wiring. */
  "dvc-wiring": (): Figure => {
    const rg = run("dvc-watts"), zero = run("dvc-watts-norg");
    const values: Record<string, number | string> = {};
    const cost = (n: number, label: string, key: string): FigurePanel => {
      const a = rg[n]!.result, b = rg[n + 2]!.result, z = zero[n]!.result;
      const idx = range(a.freq, 15, 200);
      const freq = idx.map((i) => a.freq[i]!);
      const series = idx.map((i) => a.spl[i]! - z.spl[i]!), parallel = idx.map((i) => b.spl[i]! - z.spl[i]!);
      values[`${key}SeriesMax`] = -Math.min(...series);
      values[`${key}ParallelMax`] = -Math.min(...parallel);
      values[`${key}ParallelMin`] = -Math.max(...parallel);
      return { label, plot: { title: "Change from no resistance", unit: "dB", freq, noPeak: true, guides: ZERO, yMin: -1.5, yMax: 0.25, series: [
        { label: "Series, 4 Ω (+0.15 Ω)", color: rg[n]!.color, y: series },
        { label: "Parallel, 1 Ω (+0.15 Ω)", color: rg[n]!.color, y: parallel, dash: "7 4" },
      ] } };
    };
    const zs = spanOf(rg[0]!.result, rg[0]!.result.impedanceOhm, 15, 200), zp = spanOf(rg[2]!.result, rg[2]!.result.impedanceOhm, 15, 200);
    Object.assign(values, { zSeriesMin: zs[0], zSeriesMax: zs[1], zParallelMin: zp[0], zParallelMax: zp[1] });
    return {
      panels: [
        { label: "SPL at 300 W, sealed 28.3 L", chart: "dvc-watts-norg:1+dvc-watts:1,3/spl" },
        { label: "Impedance the amplifier sees", chart: "dvc-watts:1,3/impedance" },
        cost(0, "What the 0.15 Ω costs, sealed", "sealed"),
        cost(1, "The same in the 70.8 L ported box", "ported"),
      ],
      values,
    };
  },
});

const cache = new Map<string, Figure>();
/** A figure's data (worked out once per build). Throws on an unknown name. */
export function figure(name: string): Figure {
  let f = cache.get(name);
  if (!f) {
    const make = FIGURES[name];
    if (!make) throw new Error(`no figure called "${name}" (figures: ${Object.keys(FIGURES).join(", ")})`);
    f = make();
    cache.set(name, f);
  }
  return f;
}
