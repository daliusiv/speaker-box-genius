/**
 * The Hornresp comparison cases: each folder under test/fixtures/hornresp holds one design
 * (input.json, our LineInput; driver.json when it isn't the DSA215 below) and Hornresp's own
 * results for it at 2.83 V in half space: hornresp.txt, the table File > Export saves from a
 * chart window (SPL, electrical impedance and its phase, cone excursion, the line's acoustic
 * impedance, group delay…). The records Hornresp was run on are in
 * docs/hornresp-validation/records. Hornresp's air: c = 344 m/s, ρ = 1.205 kg/m³. Hornresp
 * works SPL out from radiated power, so the comparison uses splFrom: "power".
 *
 * The engine tests (test/hornresp.test.ts) and the validation report both use this module.
 * To add a case: run the record in Hornresp, export its table into a new fixtures folder, add
 * a title below, then run `pnpm validation:report`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { simulate, type SimulationOptions, type SimulationResult } from "../src/simulate.ts";
import { transientResponse, type TransientOptions, type TransientResult } from "../src/transient.ts";
import { eqResponse } from "../src/filters.ts";
import { driverModel, type DriverInput, type EnclosureInput, type SemiInductance } from "../src/model.ts";
import { pistonPowerFactor } from "../src/line.ts";
import type { LineInput } from "../src/line.ts";

export const HORNRESP_DIR = join(import.meta.dirname, "..", "test", "fixtures", "hornresp");
export const HORNRESP_VERSION = "Hornresp 60.70";
/** Box cases set up in Hornresp's wizards (Filter, EQ, Loudspeaker Wizard), which a record can't carry: made and re-run on 60.60, not yet on 60.70. */
export const HORNRESP_WIZARD_VERSION = "Hornresp 60.60";
export const isHornrespWizardCase = (id: string) => /^(b4|b5|b6|b12|b14|b15|s\d+)-/.test(id);
export const HORNRESP_AIR = { rho: 1.205, c: 344 };
/** Dayton Audio DSA215-8, the driver in every record without a driver.json. */
export const HORNRESP_DRIVER = { fs: 35, qms: 1.87, qes: 0.4, vas_l: 37.4, re: 5.9, sd_cm2: 211.2, le_mh: 1, xmax_mm: 5.5, pe_w: 80 };
/** Compared from 10 Hz up to this frequency. */
export const HORNRESP_F_MAX = 1000;

export const HORNRESP_TOL = {
  /** SPL: mean and 95th percentile of |difference| (dB). */
  splMean: 0.15,
  splP95: 0.4,
  /** Electrical impedance: mean and worst |relative difference| (%), and mean phase difference (°). */
  zeMean: 0.5,
  zeWorst: 3,
  zePhaseMean: 0.3,
  /** Cone excursion: mean and 95th percentile |relative difference| (%), where it's over 2 % of its largest value. */
  xdMean: 0.6,
  xdP95: 1,
  /** Group delay: 95th percentile |difference| (ms), away from deep nulls. */
  gdP95: 0.5,
  /** SPL phase: median |difference| (°). */
  phaseMedian: 0.5,
  /** Real input power and efficiency: mean |relative difference| (%) (current is held to zeMean). */
  pinMean: 1,
  effMean: 3,
  /** Acoustic impedance: mean |difference| (dB), away from sharp peaks and nulls (0.3 < |Za| < 5). */
  zaMean: 0.1,
};

export const HORNRESP_TITLES: Record<string, { title: string; text: string }> = {
  "01-straight-tl": { title: "Straight transmission line", text: "150 cm × 200 cm², driver at the closed end" },
  "02-tapered-tl": { title: "Tapered transmission line", text: "180 cm, 300 → 120 cm² (Hornresp Par), wide closed end" },
  "03-offset-tl": { title: "Offset-driver transmission line", text: "210 cm × 200 cm², driver at a third of the length" },
  "04-tqwt": { title: "TQWT", text: "170 cm conical, 40 → 400 cm², driver 57 cm from the closed end" },
  "05-mltl": { title: "Mass-loaded line", text: "110 cm × 220 cm², driver 27.5 cm down, 6 × 12 cm port at the mouth" },
  "06-tapped-horn": { title: "Tapped horn", text: "220 cm, 200 → 850 cm², driver taps at 20 and 120 cm" },
  "07-front-horn": { title: "Front-loaded horn", text: "230 cm exponential, 110 → 4000 cm², 20 L rear chamber, 1 L throat chamber" },
  "10-sub-straight-tl": { title: "Subwoofer in a straight line", text: "12″ subwoofer (Le 2.4 mH), 260 cm × 500 cm², driver at the closed end" },
  "11-sub-mltl": { title: "Subwoofer in a mass-loaded line", text: "12″ subwoofer, 160 cm × 500 cm², driver 40 cm down, 10 × 15 cm port" },
  "12-sub-tapped-horn": { title: "Subwoofer in a tapped horn", text: "12″ subwoofer, 300 cm, 450 → 1800 cm², taps at 25 and 160 cm" },
  "13-fr-tqwt": { title: "Full-range TQWT", text: "4″ full-range, 130 cm conical, 15 → 90 cm², driver 42 cm from the closed end" },
  "14-fr-tapered-tl": { title: "Full-range tapered line", text: "4″ full-range, 150 cm, 80 → 40 cm², driver at the closed end" },
  "17-front-horn-small-chambers": { title: "Front horn, small chambers", text: "Case 07 with an 8 L rear chamber and a 3 L throat chamber" },
  "18-front-horn-no-throat": { title: "Front horn, no throat chamber", text: "Case 07 with the cone straight into the 110 cm² throat, 20 L rear chamber" },
  "19-sub-front-horn": { title: "Subwoofer front horn, two segments", text: "12″ subwoofer, Con 300 → 900 cm² 60 cm + Exp → 6000 cm² 200 cm, 40 L rear, 2 L throat chamber" },
  "20-exp-tl": { title: "Exponential transmission line", text: "200 cm, expanding 100 → 600 cm² (Exp), driver at the closed end" },
  "21-multi-seg-tl": { title: "Three-segment line", text: "Con 150 → 250 cm² 60 cm, Par → 120 cm² 80 cm, Exp → 400 cm² 60 cm" },
  "22-offset-l5": { title: "Offset line, driver at a fifth", text: "240 cm × 250 cm², driver 48 cm from the closed end" },
  "23-offset-tapered": { title: "Offset tapered line", text: "200 cm conical, 320 → 100 cm², driver 60 cm from the closed end" },
  "24-sub-mltl-tapered": { title: "Subwoofer in a tapered mass-loaded line", text: "12″ subwoofer, 180 cm conical 700 → 350 cm², driver 45 cm down, 10 × 20 cm port" },
  "25-mltl-big-port": { title: "Mass-loaded line, wide short port", text: "Case 05's line with a 10 cm port 5 cm long" },
  "26-tapped-con": { title: "Conical tapped horn", text: "200 cm, 150 → 900 cm² (Con), taps at 15 and 110 cm" },
  "27-sub-tapped-2seg": { title: "Subwoofer tapped horn, two segments", text: "12″ subwoofer, Par 400 → 900 cm² 150 cm + Exp → 2500 cm² 150 cm, taps at 30 and 170 cm" },
  "28-fr-front-horn": { title: "Full-range front horn", text: "4″ full-range, conical 30 → 600 cm² 90 cm, 2 L rear, 0.1 L throat chamber" },
  "29-sub-front-par": { title: "Subwoofer front horn, Par + Exp", text: "12″ subwoofer, Par 350 → 1200 cm² 100 cm + Exp → 5000 cm² 150 cm, 60 L rear, 0.5 L throat chamber" },
  "30-tl-2p": { title: "Straight line, two drivers", text: "160 cm × 400 cm², two drivers in parallel at the closed end (Hornresp \"OD = 2P\")" },
  "32-sub-tqwt": { title: "Subwoofer TQWT", text: "12″ subwoofer, 240 cm conical 80 → 900 cm², driver 80 cm from the closed end" },
  "33-sub-tapped-early-tap": { title: "Tapped horn, four segments", text: "Case 27 written as Par 30 / 90 / 30 cm + Exp 150 cm (an old export of a tap at 120 cm): Hornresp takes the front tap where the last segment starts, 150 cm" },
  "34-tl-path-50": { title: "Straight line, mouth 50 cm away", text: "Case 01 with Acoustic Path Length 50 cm: cone and mouth as two sources 50 cm apart, their powers summed" },
  "35-tl-path-100": { title: "Straight line, mouth 100 cm away", text: "Case 01 with Acoustic Path Length 100 cm" },
  "36-mltl-path-50": { title: "Mass-loaded line, port 50 cm away", text: "Case 05 with Acoustic Path Length 50 cm" },
  "16-mltl-hot-coil": { title: "Mass-loaded line, voice coil at 120 °C", text: "Case 05 with Hornresp's Power Compression at 120 °C" },
  "15-mltl-2-drivers": { title: "Mass-loaded line, two drivers", text: "Case 05 with two drivers in parallel (Hornresp \"OD = 2P\")" },
};

export const HORNRESP_NOTES = `The line's resonances fall on the same frequencies as Hornresp's. The only large SPL differences are at the bottom of deep nulls: the same frequency, a different depth (a few hundredths of a hertz move the bottom of a 40 dB null by many dB), which is why SPL is held to its mean and 95th percentile rather than its worst point.

What the comparison found and fixed:

- **The cone's mass in lines and horns.** The air on both sides of the cone is modelled explicitly, so the cone carries its bare mass (Mms less the air load), as Hornresp does. Using Mms had counted the rear air mass twice and made impedance peaks up to 10 % low.
- **SPL from radiated power.** Hornresp works SPL out from the power each opening radiates, not from on-axis pressure. The two agree at low frequency and part once the mouth is large next to the wavelength (about 1.7 dB at 500 Hz for an 850 cm² mouth). The app shows on-axis SPL by default; Settings → Line/horn SPL → “From radiated power (like Hornresp)” gives Hornresp's.

- **What Za means with an offset driver or a tapped horn.** Hornresp charts the line ahead of an offset driver only ("Offset Throat S2"), not the closed part behind it in parallel; for a tapped horn, the rear tap's pressure over the air going on into the horn ("Tapped Throat S2"). The app's Za chart now does the same.

- **Za normalised at the exact area.** Za is divided by ρc over the area where it's taken; the app had used the first slice's average area, a few per cent wider than an expanding horn's throat (3 % for case 07).

Cone excursion and group delay are compared too: excursion within about 0.3 % on average. Group delay swings by tens of milliseconds through a deep null, so it's compared away from them (where the response is within 10 dB of its highest point within a third of an octave).

The amplifier's side matches as closely: current, real input power and efficiency, and the SPL's phase (a median of 0.1° or less). Hornresp's efficiency adds the power the cone and the mouth each radiate on their own, while its SPL combines them as waves (they cancel below the tuning), so the efficiency is compared on that footing.

The mouth's output on its own (Hornresp's "Horn" output) is compared where it was exported, for the two mass-loaded lines' ports: within 0.05 dB on average. It's the air leaving through the port, so the port's air speed follows from it: Hornresp's Particle Velocity chart and the app's both peak at 5.0 m/s at 40 Hz in case 05 (1.8 m/s at 10 Hz) and 4.5 m/s at 32 Hz in case 11 (1.4 m/s at 10 Hz).

**Maximum SPL** (Hornresp's Tools > Maximum SPL, 80 W and 5.5 mm) is compared for the mass-loaded line (05) and the tapped horn (06), and for the sealed and ported boxes: within 0.03 dB on average, and the voltage it takes within 0.2 %. Hornresp holds the driver's power rating against the real power it takes (V·I·cos φ), not V²/Re as WinISD does; that allows several dB more where the impedance is well above Re (around resonance and higher up). Settings → "Power rating vs" → "Real power (like Hornresp)" gives Hornresp's; the default stays WinISD's. The app's own port-speed limit is left out, as Hornresp has none. With the amplifier limited to 25 V (Settings → Amp max volts) the ported box's maximum matches too, including the 51 frequencies where the amplifier sets it.

**Impulse and step response.** Hornresp exports its impulse response (the chart window's Impulse Response) as a WAV: 48 kHz, t = 0 in the middle, scaled to a peak of ±1, the response cut off above 20 kHz. The app's (the chart "Impulse / step") is worked out the same way and matches for the mass-loaded line (05) and the sealed and ported boxes: within 0.02 of the peak RMS over −5 to 200 ms, and the step response (the running sum) within 0.02. Hornresp has no step response; it is taken from each impulse alike. Two things had to agree first. **Polarity:** the app now gives a positive pressure for a positive voltage with the cone facing the room (it had a box's output turned round, which the frequency charts don't show). Hornresp's boxes agree; its offset-driver lines put the line on the cone's front, so the room hears the cone's rear and its output is inverted against the app's: those are compared turned round (phase + 180°, impulse × −1). **High frequencies:** Hornresp's box SPL comes from radiated power (the cone as a piston, like the lines' "From radiated power" setting), which falls up top where a point source doesn't; the engine now does that for boxes too when asked, and the impulse always uses it.

The first seven cases were checked against Hornresp 55.30 first, then against 60.60 with the same results; the five with other drivers (a 12″ subwoofer, a 4″ full-range) came with 60.60. **Re-run on Hornresp 60.70 (10 Nov 2026):** every earlier export came out identical to the last digit, and twelve more lines and horns were added (cases 20–32): an exponential and a three-segment (Con + Par + Exp) line, an offset driver at a fifth and in a tapered line, a tapered mass-loaded line and one with a wide short port, a conical and a two-segment tapped horn (and the same horn as four segments, 33, which settles where Hornresp takes the front tap: where the last segment starts), a full-range and a two-segment subwoofer front horn, two drivers in a line, and a subwoofer TQWT. All match as closely as the first cases (SPL within 0.05 dB on average). The subwoofer TQWT (32) has a looser group-delay limit: through its dense comb of resonances above 400 Hz the group delay swings by a millisecond between neighbouring points, while SPL there agrees within 0.07 dB.

**Acoustic Path Length (34–36).** Hornresp's Path puts the mouth that far from the cone and treats the two as point sources, adding their powers over all directions: |M|² + |C|² + 2·Re(M·C*)·sin(kd)/(kd). Only the level changes; the phase and group delay it exports are those of the two side by side. With SPL from radiated power the app's mouth distance does the same (in front of the box it delays the mouth's sound instead, which is 4–5 dB from Hornresp's on average). Cases 01 and 05 with a 50 and a 100 cm Path match within 0.03 dB on average.

**Air speed.** Hornresp's Particle Velocity chart can't be exported, but its cursor reads the value at each frequency. Read at five or six frequencies for three mass-loaded lines' mouths (05, 11, 25) and two ported boxes' ports (B2, N9), it agrees with the app's port air speed within 1 % everywhere and 0.3 % on average.

Stuffed lines are compared with Hornresp's Loudspeaker Wizard (the only place it models segment filling) in the box cases below (S1–S5).`;

/** Hornresp's exported table: one row per frequency, columns by their header. */
export function readTable(file: string): Record<string, number>[] {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const cols = lines[0]!.split("\t").map((c) => c.trim().replace(/\s*\(.*$/, ""));
  return lines
    .slice(1)
    .map((l) => l.trim().split(/\s+/).map(Number))
    .filter((r) => r.length === cols.length && r[0]! > 0 && r.every(Number.isFinite))
    .map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]!])));
}

/** Our curve at f, interpolated on a log-frequency axis. */
export function interp(freq: Float64Array, y: Float64Array, f: number): number {
  let i = 0;
  while (i < freq.length - 2 && freq[i + 1]! < f) i++;
  const t = Math.log(f / freq[i]!) / Math.log(freq[i + 1]! / freq[i]!);
  return y[i]! + (y[i + 1]! - y[i]!) * t;
}

export const percentile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))]!;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export const hornrespIds = () => (existsSync(HORNRESP_DIR) ? readdirSync(HORNRESP_DIR).sort() : []);

type Pair = { f: number; ref: number; ours: number };

export interface HornrespRun {
  id: string;
  input: LineInput;
  driver: DriverInput;
  result: SimulationResult;
  /** Hornresp's points up to HORNRESP_F_MAX, with ours at the same frequencies. */
  spl: Pair[];
  ze: Pair[];
  xd: Pair[];
  gd: Pair[];
  za?: Pair[];
  /** The mouth's (port's) output alone, when Hornresp's was exported. */
  mouth?: Pair[];
  /** Hornresp's Maximum SPL, where it was exported. */
  maxSpl: MaxSplRun[];
  /** Hornresp's impulse response, where it was exported. */
  impulse?: ImpulseRun;
  /** Hornresp's port or mouth air speed, where it was read. */
  velocity?: VelocityRun;
  stats: {
    splMean: number;
    splP95: number;
    splWorst: number;
    zeMean: number;
    zeWorst: number;
    zePhaseMean: number;
    xdMean: number;
    xdP95: number;
    gdP95: number;
    /** SPL phase: median |difference| (°). */
    phaseMedian: number;
    /** Amplifier current, real input power and efficiency: mean |relative difference| (%). */
    iinMean: number;
    pinMean: number;
    effMean: number;
    effP95: number;
    zaMean?: number;
    mouthMean?: number;
    mouthP95?: number;
  };
  pass: { spl: boolean; ze: boolean; xd: boolean; gd: boolean; amp: boolean; za?: boolean; mouth?: boolean };
  /** The limits this case is held to: HORNRESP_TOL, or looser where its tol.json says. */
  tol: typeof HORNRESP_TOL;
}

/**
 * Hornresp's Maximum SPL (Tools > Maximum SPL, exported as hornresp-maxspl.txt): the drive
 * raised at each frequency until the driver takes its rated power (80 W of real power, V·I·cos φ)
 * or the cone reaches Xmax, and, in hornresp-maxspl-25v.txt, the amplifier its 25 V. Compared
 * with the app's Max SPL with Settings → "Power rating vs" set to real power and no port limit
 * (Hornresp has none): the SPL, and the voltage and real power it takes.
 */
export interface MaxSplRun {
  file: string;
  ampVolts?: number;
  /** The amplifier's current limit (A), where hornresp-maxspl-NNa.txt was exported with it. */
  ampAmps?: number;
  spl: Pair[];
  stats: { splMean: number; splP95: number; einMean: number; pinMean: number };
  pass: boolean;
}

/**
 * Hornresp's impulse response (the chart window's Impulse Response, exported as a WAV:
 * 16-bit, 48 kHz, 20001 samples, t = 0 at sample 10000, scaled to a peak of ±1, the response
 * cut off above 20 kHz). Compared from −5 to 200 ms with the app's (SPL from radiated power, as
 * Hornresp works it out), and the step response as the running sum of each.
 */
export interface ImpulseRun {
  /** [ms, Hornresp, ours], thinned for the report. */
  impulse: [number, number, number][];
  step: [number, number, number][];
  stats: { impulseRms: number; impulseMax: number; stepRms: number };
  pass: boolean;
}

/** Peak air speed at the port or mouth (Hornresp's Particle Velocity chart, read with its cursor): each point's |relative difference| (%). */
export const VELOCITY_TOL = { worst: 1.5 };

export interface VelocityRun {
  points: Pair[];
  stats: { mean: number; worst: number };
  pass: boolean;
}

/** velocity.json: Hornresp's peak particle velocity at a few frequencies, against the app's port (or mouth) air speed. */
function velocityRun(dir: string, freq: Float64Array, ours: Float64Array | null): VelocityRun | undefined {
  const file = join(dir, "velocity.json");
  if (!existsSync(file) || !ours) return undefined;
  const pts = (JSON.parse(readFileSync(file, "utf8")) as { points: [number, number][] }).points;
  const points = pts.map(([f, v]) => ({ f, ref: v, ours: interp(freq, ours, f) }));
  const e = points.map((p) => Math.abs(p.ours / p.ref - 1) * 100);
  const stats = { mean: mean(e), worst: Math.max(...e) };
  return { points, stats, pass: stats.worst < VELOCITY_TOL.worst };
}

export const IMPULSE_TOL = { impulseRms: 0.025, impulseMax: 0.1, stepRms: 0.025 };

/** Samples of a 16-bit mono WAV, as −1…1. */
export function readWav16(file: string): { rate: number; x: Float64Array } {
  const b = readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error(`${file}: not a WAV`);
  let rate = 0;
  for (let at = 12; at + 8 <= b.length; ) {
    const id = b.toString("ascii", at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === "fmt ") {
      if (b.readUInt16LE(at + 8) !== 1 || b.readUInt16LE(at + 10) !== 1 || b.readUInt16LE(at + 22) !== 16) throw new Error(`${file}: expected 16-bit mono PCM`);
      rate = b.readUInt32LE(at + 12);
    }
    if (id === "data") {
      const n = Math.floor(size / 2);
      return { rate, x: Float64Array.from({ length: n }, (_, i) => b.readInt16LE(at + 8 + 2 * i) / 32768) };
    }
    at += 8 + size + (size & 1);
  }
  throw new Error(`${file}: no data`);
}

function impulseRun(dir: string, flip: boolean, ours: (t: TransientOptions) => TransientResult): ImpulseRun | undefined {
  const file = join(dir, "hornresp-impulse.wav");
  if (!existsSync(file)) return undefined;
  const { rate, x } = readWav16(file);
  const zero = (x.length - 1) / 2; // Hornresp centres t = 0
  const h = flip ? x.map((v) => -v) : x;
  // Hornresp's step: the running sum, scaled to a peak of ±1.
  const hs = new Float64Array(h.length);
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < h.length; i++) peak = Math.max(peak, Math.abs((hs[i] = sum += h[i]!)));
  for (let i = 0; i < hs.length; i++) hs[i]! /= peak;
  const r = ours({ sampleRate: rate, length: 32768, pre_ms: (zero / rate) * 1000 });
  const from = zero - Math.round(0.005 * rate);
  const to = Math.min(h.length, zero + Math.round(0.2 * rate));
  let e = 0, es = 0, mx = 0;
  const impulse: ImpulseRun["impulse"] = [];
  const step: ImpulseRun["step"] = [];
  for (let i = from; i < to; i++) {
    const d = r.impulse[i]! - h[i]!;
    e += d * d;
    es += (r.step[i]! - hs[i]!) ** 2;
    mx = Math.max(mx, Math.abs(d));
    // Every sample for the first 5 ms, then thinner.
    const t = ((i - zero) / rate) * 1000;
    if (t < 5 || (i - zero) % 24 === 0) {
      impulse.push([Number(t.toFixed(3)), Number(h[i]!.toFixed(4)), Number(r.impulse[i]!.toFixed(4))]);
      step.push([Number(t.toFixed(3)), Number(hs[i]!.toFixed(4)), Number(r.step[i]!.toFixed(4))]);
    }
  }
  const n = to - from;
  const stats = { impulseRms: Math.sqrt(e / n), impulseMax: mx, stepRms: Math.sqrt(es / n) };
  const T = IMPULSE_TOL;
  return { impulse, step, stats, pass: stats.impulseRms < T.impulseRms && stats.impulseMax < T.impulseMax && stats.stepRms < T.stepRms };
}

export const MAXSPL_TOL = { splMean: 0.15, splP95: 0.4, einMean: 0.5, pinMean: 1 };

function maxSplRuns(dir: string, fMax: number, run: (o: SimulationOptions) => SimulationResult): MaxSplRun[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^hornresp-maxspl(-\d+[va])?\.txt$/.test(f))
    .sort()
    .map((file) => {
      const v = /-(\d+)v\.txt$/.exec(file);
      const a = /-(\d+)a\.txt$/.exec(file);
      const ampVolts = v ? Number(v[1]) : undefined;
      const ampAmps = a ? Number(a[1]) : undefined;
      const r = run({ thermalLimit: "real", portVelocityLimit: Infinity, ...(ampVolts ? { amp: { volts: ampVolts } } : {}), ...(ampAmps ? { amp: { amps: ampAmps } } : {}) });
      const rows = readTable(join(dir, file)).filter((x) => x.Freq! <= fMax);
      const spl = rows.map((x) => ({ f: x.Freq!, ref: x.SPL!, ours: interp(r.freq, r.maxSpl, x.Freq!) }));
      const e = spl.map((p) => Math.abs(p.ours - p.ref));
      const stats = {
        splMean: mean(e),
        splP95: percentile(e, 0.95),
        einMean: mean(rows.map((x) => Math.abs(interp(r.freq, r.ampAtMax.volts, x.Freq!) / x.Ein! - 1) * 100)),
        pinMean: mean(rows.map((x) => Math.abs(interp(r.freq, r.ampAtMax.watts, x.Freq!) / x.Pin! - 1) * 100)),
      };
      const T = MAXSPL_TOL;
      const pass = stats.splMean < T.splMean && stats.splP95 < T.splP95 && stats.einMean < T.einMean && stats.pinMean < T.pinMean;
      return { file, ...(ampVolts ? { ampVolts } : {}), ...(ampAmps ? { ampAmps } : {}), spl, stats, pass };
    });
}

/** Hornresp's polarity is inverted against the app's for lines with the cone facing out (not horns radiating only from the mouth). */
export const isFlipped = (input: LineInput) => input.tap_cm === undefined && !input.frontLoaded;

export function runHornresp(id: string): HornrespRun {
  const dir = join(HORNRESP_DIR, id);
  const input = JSON.parse(readFileSync(join(dir, "input.json"), "utf8")) as LineInput;
  const driver = (existsSync(join(dir, "driver.json")) ? JSON.parse(readFileSync(join(dir, "driver.json"), "utf8")) : HORNRESP_DRIVER) as DriverInput;
  // options.json: more than one driver (Hornresp's "Nd = 2P"), or a hot voice coil.
  const extra = existsSync(join(dir, "options.json")) ? (JSON.parse(readFileSync(join(dir, "options.json"), "utf8")) as Pick<SimulationOptions, "drivers" | "wiring" | "coilTemp_C">) : {};
  const base: SimulationOptions = { power: 2.83, convention: "volts", fMin: 10, fMax: 2000, points: 16000, air: HORNRESP_AIR, splFrom: "power", ...extra };
  const r = simulate(driver, input, base);
  // A fine grid, so a sharp resonance between two of our points isn't flattened by interpolation.
  const rows = readTable(join(dir, "hornresp.txt")).filter((x) => x.Freq! <= HORNRESP_F_MAX);
  const pair = (col: string, ours: Float64Array, keep: (x: Record<string, number>) => boolean = () => true): Pair[] =>
    rows.filter(keep).map((x) => ({ f: x.Freq!, ref: x[col]!, ours: interp(r.freq, ours, x.Freq!) }));

  const spl = pair("SPL", r.spl);
  const ze = pair("Ze", r.impedanceOhm);
  const zePh = pair("ZePhase", r.impedancePhaseDeg);
  const xdMax = Math.max(...rows.map((x) => x.Xd!));
  const xd = pair("Xd", r.excursionMm, (x) => x.Xd! > 0.02 * xdMax);
  // Group delay swings by tens of milliseconds through a deep null, so it's compared where the
  // response is within 10 dB of its highest point in the third of an octave either side.
  const notInNull = (x: Record<string, number>) => x.SPL! > Math.max(...rows.filter((y) => Math.abs(Math.log2(y.Freq! / x.Freq!)) < 1 / 3).map((y) => y.SPL!)) - 10;
  const gd = pair("Delay", r.groupDelayMs, notInNull);
  // The amplifier's side: current, real power in, and efficiency (acoustic power out over
  // power in), from our impedance and SPL as the app works them out; and the SPL's phase.
  const V = 2.83;
  const zeAt = (f: number) => ({ mag: interp(r.freq, r.impedanceOhm, f), ph: (interp(r.freq, r.impedancePhaseDeg, f) * Math.PI) / 180 });
  const pinAt = (f: number) => { const z = zeAt(f); return ((V * V) / z.mag) * Math.cos(z.ph); };
  // Half space at 1 m: P = p² · 2πr² / ρc. Hornresp's efficiency adds the power the cone and
  // the mouth each radiate on their own (its SPL combines them as waves, which can cancel).
  const watts = (db: number) => (10 ** (db / 10) * (2e-5) ** 2 * 2 * Math.PI) / (HORNRESP_AIR.rho * HORNRESP_AIR.c);
  const acousticW = (f: number) => (r.parts ? watts(interp(r.freq, r.parts.cone, f)) + watts(interp(r.freq, r.parts.mouth, f)) : watts(interp(r.freq, r.spl, f)));
  const rel = (ours: number, ref: number) => Math.abs(ours / ref - 1) * 100;
  const iinErr = rows.map((x) => rel(V / zeAt(x.Freq!).mag, x.Iin!));
  const pinErr = rows.map((x) => rel(pinAt(x.Freq!), x.Pin!));
  const effErr = rows.map((x) => rel((100 * acousticW(x.Freq!)) / pinAt(x.Freq!), x.Efficiency!));
  // Hornresp's offset-driver records put the line on the cone's front, so the room hears the
  // cone's rear and its output is inverted against a driver facing out, as the app has it.
  const flip = isFlipped(input) ? 180 : 0;
  const phErr = rows.map((x) => Math.abs(((interp(r.freq, r.phaseDeg, x.Freq!) - x.WPhase! - flip + 540 + 720) % 360) - 180));
  const splErr = spl.map((p) => Math.abs(p.ours - p.ref));
  const zeErr = ze.map((p) => Math.abs(p.ours / p.ref - 1) * 100);
  const xdErr = xd.map((p) => Math.abs(p.ours / p.ref - 1) * 100);
  const stats: HornrespRun["stats"] = {
    splMean: mean(splErr),
    splP95: percentile(splErr, 0.95),
    splWorst: Math.max(...splErr),
    zeMean: mean(zeErr),
    zeWorst: Math.max(...zeErr),
    zePhaseMean: mean(zePh.map((p) => Math.abs(((p.ours - p.ref + 540) % 360) - 180))),
    xdMean: mean(xdErr),
    xdP95: percentile(xdErr, 0.95),
    gdP95: percentile(gd.map((p) => Math.abs(p.ours - p.ref)), 0.95),
    phaseMedian: percentile(phErr, 0.5),
    iinMean: mean(iinErr),
    pinMean: mean(pinErr),
    effMean: mean(effErr),
    effP95: percentile(effErr, 0.95),
  };
  // tol.json: looser limits for one case, with the reason in its "why".
  const T = { ...HORNRESP_TOL, ...(existsSync(join(dir, "tol.json")) ? (JSON.parse(readFileSync(join(dir, "tol.json"), "utf8")) as Partial<typeof HORNRESP_TOL>) : {}) };
  const pass: HornrespRun["pass"] = {
    spl: stats.splMean < T.splMean && stats.splP95 < T.splP95,
    ze: stats.zeMean < T.zeMean && stats.zeWorst < T.zeWorst && stats.zePhaseMean < T.zePhaseMean,
    xd: stats.xdMean < T.xdMean && stats.xdP95 < T.xdP95,
    gd: stats.gdP95 < T.gdP95,
    amp: stats.phaseMedian < T.phaseMedian && stats.iinMean < T.zeMean && stats.pinMean < T.pinMean && stats.effMean < T.effMean,
  };

  // The mouth's (or port's) output alone, where Hornresp's "Horn" output was exported too: the
  // air leaving the line, which sets its air speed.
  let mouth: HornrespRun["mouth"];
  if (existsSync(join(dir, "hornresp-mouth.txt")) && r.parts) {
    const m = readTable(join(dir, "hornresp-mouth.txt")).filter((x) => x.Freq! <= HORNRESP_F_MAX);
    mouth = m.map((x) => ({ f: x.Freq!, ref: x.SPL!, ours: interp(r.freq, r.parts!.mouth, x.Freq!) }));
    const e = mouth.map((p) => Math.abs(p.ours - p.ref));
    stats.mouthMean = mean(e);
    stats.mouthP95 = percentile(e, 0.95);
    pass.mouth = stats.mouthMean < T.splMean && stats.mouthP95 < T.splP95;
  }

  let za: HornrespRun["za"];
  if (r.acousticImpedance) {
    const a = r.acousticImpedance;
    za = pair("Za", Float64Array.from(a.resistance, (re, i) => Math.hypot(re, a.reactance[i]!)));
    // Away from the sharp peaks and nulls, where a hair's shift in frequency moves the value a lot.
    const errs = za.filter((p) => p.ref > 0.3 && p.ref < 5).map((p) => Math.abs(20 * Math.log10(p.ours / p.ref)));
    stats.zaMean = mean(errs);
    pass.za = stats.zaMean < T.zaMean;
  }
  const maxSpl = maxSplRuns(dir, HORNRESP_F_MAX, (o) => simulate(driver, input, { ...base, points: 4000, ...o }));
  const impulse = impulseRun(dir, isFlipped(input), (t) => transientResponse(driver, input, { ...base, points: undefined }, t));
  const velocity = velocityRun(dir, r.freq, r.portVelocity);
  return { id, input, driver, result: r, spl, ze, xd, gd, za, mouth, maxSpl, ...(impulse ? { impulse } : {}), ...(velocity ? { velocity } : {}), stats, pass, tol: T };
}

// ---------------------------------------------------------------------------
// Ordinary boxes: sealed, ported, passive radiator, bandpass, and two drivers
// ---------------------------------------------------------------------------

/**
 * Each folder under test/fixtures/hornresp-boxes holds case.json (the box, as our
 * EnclosureInput, with null for "no loss") and Hornresp's results for the DSA215 at 2.83 V:
 * hornresp.txt (File > Export from the chart window), or, for bandpass boxes, which Hornresp
 * simulates in its Loudspeaker Wizard, hornresp-power.txt / -ze.txt / -xd.txt (the Wizard's
 * three exports); and, where Hornresp's outputs were exported one by one (Tools > Output),
 * hornresp-cone.txt for the cone's front ("Horn": Hornresp models it as a very short horn)
 * and hornresp-vent.txt for the port or passive radiator. The records are in docs/hornresp-validation/records.
 */
export const HORNRESP_BOX_DIR = join(import.meta.dirname, "..", "test", "fixtures", "hornresp-boxes");
/** In number order (B2 before B10). */
export const hornrespBoxIds = () => (existsSync(HORNRESP_BOX_DIR) ? readdirSync(HORNRESP_BOX_DIR).sort((a, b) => a.localeCompare(b, "en", { numeric: true })) : []);
/** Boxes are lumped models (no standing waves inside), so they're compared up to here. */
export const HORNRESP_BOX_F_MAX = 300;

export const HORNRESP_BOX_TOL = {
  /** SPL (dB), and the port's or PR's output alone: mean and 95th percentile |difference|. */
  splMean: 0.15,
  splP95: 0.4,
  /** Electrical impedance: mean and 95th percentile |relative difference| (%), mean phase difference (°). */
  zeMean: 0.75,
  zeP95: 2,
  zePhaseMean: 0.5,
  /** Cone excursion: mean and 95th percentile |relative difference| (%), where it's over 2 % of its largest value. */
  xdMean: 1,
  xdP95: 4,
  /** Group delay, 95th percentile |difference| (ms), away from nulls. */
  gdP95: 0.5,
};
type BoxTol = typeof HORNRESP_BOX_TOL;

export const HORNRESP_BOX_NOTES = `Hornresp models an ordinary box as a very short horn on the cone's front (its "Horn" output) with the box behind, so these records are its "Nd" records with a 0.01 cm horn; bandpass boxes run in its Loudspeaker Wizard, which exports SPL, impedance and excursion but not group delay or port air speed. The cases set up in its wizards (bandpass B4–B6 and B14, high-pass B12, EQ B15, stuffed lines S1–S5) can't be carried in a record, so they are checked on Hornresp 60.60 (re-run 12 Nov 2026, identical exports), not yet on 60.70.

What the comparison settles, and the conventions it has to bridge:

- **The cone's mass.** The app's T/S parameters carry Mms (with the air on both sides of the cone), as datasheets and WinISD do. Hornresp's records carry the bare Mmd, and it adds the front air back in a sealed, ported or PR box but none in a bandpass box, where the chambers' air carries it. Each case gives the cone what Hornresp gives it, from the same Mms.
- **Ports are pipes.** Hornresp treats a port as a short pipe, not just a mass of air. With Settings → Ports → "Pipe, like Hornresp" the app does the same, and the ported box then matches within 0.3 % in impedance and 0.02 dB in the port's own output, with the standard end correction (0.732 × diameter). As an air mass (the default, like WinISD) the port's own output parts from Hornresp's by up to 1.3 dB at 260 Hz and the impedance by about 1 %. Bandpass ports can now be pipes too, including a series box's rear port between the two chambers.
- **Leakage (QL) in bandpass boxes.** Hornresp's QL behaves as if referred to the box's lowest tuning (that's what fits all three records); the app, like WinISD, refers it to each chamber's own tuning. So Hornresp's QL 7 is entered as the same leak at the chamber's own tuning (10.4 and 13.7 in the front chambers of the 6th-order boxes). A series box's rear chamber, which opens only into the front one, has no leak in Hornresp.
- **Passive radiators.** Hornresp adds the front air to the radiator's moving mass as well (3.83 g for the DSA270-PR); with that, its output alone is within 0.01 dB.
- **Two drivers side by side** (Hornresp's "Nd = 2P") load each other's fronts: Hornresp treats them as one piston of twice the area, which gives each √2 × one cone's front air. In lines and horns the app does the same (case 15: the mass-loaded line with two drivers is within 0.03 dB and 0.2 %). In boxes it does with Settings → Box losses → Cone air load → "Piston, like Hornresp", which loads each cone with n × the radiation impedance of a piston of n·Sd in place of a fixed front-air mass; the default keeps each driver's datasheet Mms, as WinISD does. The two-driver cases (B7, B11) and the two-box cases (B17) use it, with SPL from radiated power.

**Port and PR position (B2 and B3 with an Acoustic Path Length).** Hornresp's Path puts the port or passive radiator that far from the cone and sums the two sources' powers, |a|² + |b|² + 2·Re(a·b*)·sin(kd)/(kd); only the level changes. The app's port position does the same with SPL from radiated power: the ported box with the port 25, 50 and 100 cm away and the PR box with the PR 50 cm away match within 0.015 dB on average, as closely as the same boxes with the port beside the cone.

**Amplifier resistance and wiring.** Hornresp's Rg (0.5 Ω, B10) matches the app's Settings → Amp + cable as closely as B1 without it. Two drivers in one sealed box (B11), in parallel and in series, match within 0.04 dB (95th percentile) and 0.25 % in impedance (95th percentile 1.0 %; with a fixed front-air mass of √2 × one cone's it was 2.1 %); series is exactly 6.02 dB below parallel in both. Records must say "2P" or "2S" as imported (the app's Hornresp export writes them so): the same counts typed into Hornresp's editor gave one cone's output with two drivers' impedance.

**Several identical boxes (B17).** Hornresp's Tools → Multiple Speakers wires copies of the whole speaker in series and parallel (the amplifier load is the impedance × series ÷ parallel) and puts them side by side: two sealed boxes give +6 dB in the deep bass falling to +3 dB up high, as one bigger source. In the app that is one box of twice the volume with twice the drivers, wired the same, with the piston cone load: within 0.03 dB, 0.22 % in impedance and 0.21 % in excursion, in parallel and in series.

**Full space (Ang = 4 × Pi).** Hornresp's full space is more than the same box radiating into twice the space: it also lightens the air load on the cone's front and on the port's outer end, as for a source no longer in a baffle. Fitted against a sealed (N1) and a ported box (N2): the cone carries about 0.63 of its half-space front air, and the port's end correction drops from 0.732 to 0.52 × its diameter (the outer end's flanged 0.85·a halved). With those two, both match within 0.02 dB and 0.3 %, and the port's own output within 0.02 dB. The app's full space keeps the half-space loads, which puts the ported box's tuning a few per cent low (up to 1.2 dB in SPL near the tuning); the earlier "0.45 dB / 5–7 %" gap for the sealed box isn't there in the 60.70 re-run with the right front air (0.02 dB, 0.13 %). The cases carry the fitted values so they pin down Hornresp's behaviour; the app's own full space doesn't change yet.

**Lossy Le is not modelled.** Hornresp's Lossy Le (double-click the Le label) first asks whether the driver has high Le and Xmax. Answered No, the results are identical to plain Le for this driver. Answered Yes, the impedance is unchanged but the response and excursion are those of the same driver with Bl about 14 % lower (10.65 → about 9.2 T·m: within 0.02 dB and 0.1 % that way): an empirical correction for long-throw, high-inductance drivers, not a coil model. The app's L2R2 and semi-inductance models change the coil's impedance and the response together, so it has no equivalent; a driver measured with its real Bl needs none.

**High-pass filter (B12).** Hornresp's Active Filter Wizard and the app's Settings → High-pass filter are the same filters: with a 25 Hz high-pass on the ported box (2nd- and 3rd-order Butterworth, 4th-order Linkwitz-Riley), the voltage reaching the speaker agrees within 0.0005 %, and SPL, excursion, impedance and group delay as closely as without the filter (0.03 dB, 0.15 %, 0.3 %, 0.08 ms). The boxes exported as a full table are also held to their group delay now.

**EQ (B15).** Hornresp's Equaliser Filter Wizard offers Peak EQ, Low Shelf, High Shelf, Low Pass and High Pass bands. Its Peak EQ and shelves are the standard analog (RBJ) shapes, the same as the app's Peaking, Low shelf and High shelf (the high shelf was added to the app to match): on the ported box with a 40 Hz Q 2 −6 dB peak, a 30 Hz Q 0.71 +6 dB low shelf and a 150 Hz Q 0.71 −6 dB high shelf, the voltage reaching the speaker agrees within 0.00005 % from 10 Hz to 20 kHz, and SPL, excursion, impedance and group delay as closely as without EQ.

**Stuffed lines (S1–S5).** Hornresp models fill with D. K. Wilson's relaxation model (1997), set by the flow resistivity alone (Fr, mks rayls/m). The app used Delany–Bazley's empirical fit, which was 0.2–1.2 dB and 1–1.5 % out at Fr 150–2000. It now uses Wilson's model too, with porosity and tortuosity 1 (fibre) and the thermal relaxation time 1.75 × the viscous one (the one value fitted, against all three densities): within 0.07 dB and 0.3 % at every density, as close as the unstuffed line run the same way (S1), and an offset line stuffed only behind the driver (S5) within 0.05 dB and 0.3 % (the old model: 0.29 dB, 0.7 %). The app's fill is set in kg/m³ of polyester and turned into flow resistivity with Garai & Pompoli's measurements (481.65 rayls/m = 8.0 kg/m³); Hornresp's "Total Polyfill" readout uses its own empirical figure for one product (481.65 rayls/m = 9.9 kg/m³), so densities from the two programs aren't interchangeable, flow resistivities are.

**Frequency-dependent damping (B13).** Hornresp's FDD model (double-click the Cms label) takes two values, Rms (N·s/m) and Ams (m/N). Two exports of the sealed box (Rms 2 / Ams 3.0E-04 and Rms 8 / Ams 1.0E-03) pin it down exactly: the suspension becomes Rms + 1/(jω(Cms − j·Ams)), a complex compliance (a loss that's the same fraction Ams/Cms of the stiffness at every frequency, as rubber and foam behave) with its own Rms in place of the one from Qms. That fits Hornresp's motional impedance to 0.0003 % on average. The app has the same model (Driver → Suspension losses → Frequency-dependent): within 0.46 % in impedance and 0.04 dB, as close as the box without it.

**Semi-inductance.** Hornresp's semi-inductance model (Thorborg and Futtrup) is the coil impedance Re' + jωLeb + (jωLe ∥ Rss ∥ Ke·√(jω)); two sets on the sealed box (B8a: Leb 0.3 mH, Le 1 mH, Ke 0.05 sH, Rss 30 Ω; B8b: Leb 1.36 mH, Le 3.16 mH, Ke 0.21 sH, Rss 30.6 Ω) pin that down exactly. The app has the same model (Driver → Coil model → Semi-inductance): impedance within 0.3 % on average up to 20 kHz, and the SPL the coil takes away up there (compared as the change from the plain B1 box, so the box's own radiation doesn't enter) within 0.03 dB. A third record (B8c) sets Re' to 6.5 Ω against Re 5.9 Ω: Hornresp takes Re' as the coil's resistance everywhere in the circuit and keeps Bl as the T/S give it (from Re), and the app does the same (Re′ in the model's fields); within 0.22 % in impedance.

**Records with their models switched on.** A record imported with "Semi-Inductance Model Flag = 1" or "Damping Model Flag = 1" (and Rg set) comes in with the model on (Le or Cms shown green), and gives exactly what turning it on by hand gave (B8a/B8c, B13a/B13b, B10 re-made that way match the earlier exports to the last digit). The filter and EQ fields in a record are not applied on import: those still need the Filter Wizard.

**More boxes (N1–N15, Hornresp 60.70).** Two passive radiators (as one radiator of twice the area, mass and damping and half the compliance, with the front air of that larger piston, 5.41 g per PR), a PR with 30 g added, a PR with five times the damping, a PR in 20 L, the 12″ subwoofer sealed and ported, the 4″ full-range sealed and ported, the B2 box with Rg, semi-inductance and FDD all at once, a PR box with semi-inductance, two drivers in parallel with Rg, and two drivers in series in the ported box: all within the box limits, most within 0.05 dB and 0.4 %. Maximum SPL with the amplifier's current limited (2 A, on the FDD box) matches as the voltage limit does.

**Power compression.** Hornresp's Tools → Power Compression sets the voice coil's temperature; at 120 °C its Re rises by 39.3 %, copper's 0.393 %/°C, as the app's Settings → Voice coil °C does. The sealed box (B9) and the mass-loaded line (case 16) at 120 °C match as closely as at 20 °C: 0.05 dB and 0.5 % in impedance for the box, 0.02 dB and 0.3 % for the line.

**Leaks don't radiate in Hornresp.** Hornresp's QL takes energy out of a chamber, but the air that escapes through the leak isn't heard: its output is the vents' alone. The app, like WinISD, counts that air as sound, as through a real gap. It matters in bandpass boxes, where the leak's share grows away from the passband (above it the vent's output falls at 12 dB/octave, the leak's at 6), up to 1 dB above Hornresp's at 260 Hz with a port (B4) and 1.8 dB with a passive radiator (B14), and in the parallel sixth-order box (B5) 1.3 dB below it under 15 Hz. Hornresp has QL only in bandpass boxes; its ordinary boxes have no leak. Settings → Box losses → Leaked air → "Lost (like Hornresp)" leaves it out, and the bandpass cases use it: the fourth-order boxes within 0.03 dB (port) and 0.09 dB (DSA270-PR, with the same 3.83 g of front air as B3) in total SPL, and their vents' own outputs as closely, the parallel sixth-order box within 0.03 dB at the 95th percentile (it was held to 1.1 dB) and the series one within 0.05 dB (from 0.29), and impedance and excursion within 0.8 %. The radiator's excursion peaks at 0.98 mm at 48 Hz in both. The front port's air speed in the fourth-order box peaks at 3.39 m/s at 51 Hz in the app and about 3.38 m/s on Hornresp's chart.`;

export interface HornrespBoxCase {
  title: string;
  text: string;
  input: EnclosureInput;
  /**
   * The air Hornresp loads the cone's front with, in units of one cone's front air mass
   * (8ρa³/3): 1 for sealed, ported and PR boxes, 0 for bandpass (Hornresp's chambers carry
   * it), √2 for two drivers side by side (one piston of 2·Sd). See hornrespDriver.
   */
  frontAir: number;
  /** Compare the impedance up to here (Hz) rather than HORNRESP_BOX_F_MAX: for coil models. */
  zeFMax?: number;
  /**
   * For a coil-model case: the case it differs from only in the coil. The SPL each shows up to
   * zeFMax is compared as a difference from that case's, which isolates the coil's effect from
   * how the box radiates up there.
   */
  splDeltaFrom?: string;
  /** Hornresp's frequency-dependent damping (FDD) model. */
  fdd?: DriverInput["fdd"];
  /** Hornresp's semi-inductance model (its Re' is the driver's Re), in place of Le. */
  semi?: SemiInductance;
  /** A high-pass filter before the amplifier (Hornresp's Active Filter Wizard). */
  highPass?: SimulationOptions["highPass"];
  /** EQ before the amplifier (Hornresp's Equaliser Filter Wizard). */
  eq?: SimulationOptions["eq"];
  /** SPL from radiated power (lines, as Hornresp works them out). */
  splFrom?: "power";
  /** Compare up to here (Hz) instead of HORNRESP_BOX_F_MAX (stuffed lines run to 1 kHz). */
  fMax?: number;
  /** Amplifier and cable resistance (Ω): Hornresp's Rg. */
  rg?: number;
  /** Voice-coil temperature (°C): Hornresp's Power Compression. */
  coilTemp_C?: number;
  /** "pipe": the port as a short pipe, as Hornresp has it (its output rises towards the pipe's resonance). */
  portModel?: "lumped" | "pipe";
  /** Leakage as Hornresp has it ("absorbed"): bandpass boxes, whose QL matters. */
  leakage?: "radiates" | "absorbed";
  /** The cone's air load as Hornresp has it ("piston"): sealed, ported and PR boxes. */
  coneLoad?: "mass" | "piston";
  drivers?: number;
  wiring?: "parallel" | "series";
  /** Looser limits where Hornresp's loss model parts from ours (see the notes). */
  tol?: Partial<BoxTol>;
  /** Another driver than the DSA215 (the same T/S as the line cases' driver.json). */
  driver?: DriverInput;
  /** Radiation space: Hornresp's Ang = 4 x Pi is "full". */
  space?: "half" | "full";
}

/**
 * The DSA215 as Hornresp has it in a box. Our T/S (like WinISD's) carry Mms, which includes
 * the air on both sides of the cone; Hornresp's records carry the bare Mmd, and it adds back
 * only the air it models: the front's in a sealed, ported or PR box (the box's air isn't a
 * mass), none in a bandpass box. So the comparison takes Mms less what Hornresp leaves out.
 */
export function hornrespDriver(d: DriverInput, frontAir: number): DriverInput {
  const m = driverModel(d, HORNRESP_AIR);
  const oneSide = (8 * HORNRESP_AIR.rho * Math.pow(m.sd / Math.PI, 1.5)) / 3;
  const mms = m.mms - 2 * oneSide + frontAir * oneSide;
  const fs = 1 / (2 * Math.PI * Math.sqrt(mms * m.cms));
  return { ...d, fs, qms: (2 * Math.PI * fs * mms) / m.rms, qes: (2 * Math.PI * fs * mms * m.re) / (m.bl * m.bl) };
}

/** JSON has no Infinity: a null loss means none. */
const lossless = (o: unknown): unknown =>
  Array.isArray(o) ? o.map(lossless) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null ? Infinity : lossless(v)])) : o;

export function readBoxCase(id: string): HornrespBoxCase {
  return lossless(JSON.parse(readFileSync(join(HORNRESP_BOX_DIR, id, "case.json"), "utf8"))) as HornrespBoxCase;
}

export interface HornrespBoxRun {
  id: string;
  c: HornrespBoxCase;
  result: SimulationResult;
  tol: BoxTol;
  spl: Pair[];
  ze: Pair[];
  xd: Pair[];
  /** The cone's front, and the port's (or PR's) output, each alone. */
  cone?: Pair[];
  vent?: Pair[];
  /** Hornresp's Maximum SPL, where it was exported. */
  maxSpl: MaxSplRun[];
  /** Hornresp's impulse response, where it was exported. */
  impulse?: ImpulseRun;
  /** Hornresp's port air speed, where it was read. */
  velocity?: VelocityRun;
  stats: {
    splMean?: number; splP95?: number; zeMean: number; zeP95: number; zeWorst: number; zePhaseMean: number; xdMean: number; xdP95: number;
    coneMean?: number; coneP95?: number; ventMean?: number; ventP95?: number;
    /** The coil's effect on SPL (difference from splDeltaFrom's), up to zeFMax. */
    coilMean?: number; coilP95?: number;
    /** Group delay (ms), where the full table was exported: 95th percentile |difference|. */
    gdP95?: number;
    /** EQ cases: the voltage reaching the speaker against Hornresp's Ein, worst |difference| (%), 10 Hz–20 kHz. */
    einMax?: number;
  };
  pass: { spl?: boolean; ze: boolean; xd: boolean; cone?: boolean; vent?: boolean; coil?: boolean; gd?: boolean; ein?: boolean };
}

export function runHornrespBox(id: string): HornrespBoxRun {
  const dir = join(HORNRESP_BOX_DIR, id);
  const c = readBoxCase(id);
  const tol = { ...HORNRESP_BOX_TOL, ...c.tol };
  const driver = { ...hornrespDriver(c.driver ?? HORNRESP_DRIVER, c.frontAir), ...(c.semi ? { semi: c.semi } : {}), ...(c.fdd ? { fdd: c.fdd } : {}) };
  const base: SimulationOptions = {
    power: 2.83, convention: "volts", fMin: 10, fMax: Math.max(1000, c.zeFMax ?? 0), points: 8000, air: HORNRESP_AIR, drivers: c.drivers, wiring: c.wiring, portModel: c.portModel, leakage: c.leakage, coneLoad: c.coneLoad, coilTemp_C: c.coilTemp_C, rg: c.rg, splFrom: c.splFrom, highPass: c.highPass, eq: c.eq, space: c.space,
  };
  const r = simulate(driver, c.input, base);
  const fTop = c.fMax ?? HORNRESP_BOX_F_MAX;
  const table = (name: string) => (existsSync(join(dir, name)) ? readTable(join(dir, name)).filter((x) => x.Freq! <= fTop) : null);
  const full = table("hornresp.txt");
  const wizard = (k: string) => full ?? table(`hornresp-${k}.txt`);
  const coneRows = table("hornresp-cone.txt");
  const ventRows = table("hornresp-vent.txt");
  // Excursion and impedance are the same in every output's export.
  const zeRows = c.zeFMax
    ? readTable(join(dir, "hornresp.txt")).filter((x) => x.Freq! <= c.zeFMax!)
    : (wizard("ze") ?? coneRows ?? ventRows!);
  const xdRows = wizard("xd") ?? coneRows ?? ventRows!;
  const splRows = wizard("power");
  const pair = (rows: Record<string, number>[], col: string, ours: Float64Array): Pair[] => rows.map((x) => ({ f: x.Freq!, ref: x[col]!, ours: interp(r.freq, ours, x.Freq!) }));
  const xdMax = Math.max(...xdRows.map((x) => x.Xd!));
  const ze = pair(zeRows, "Ze", r.impedanceOhm);
  const zePh = pair(zeRows, "ZePhase", r.impedancePhaseDeg);
  const xd = pair(xdRows.filter((x) => x.Xd! > 0.02 * xdMax), "Xd", r.excursionMm);
  const relErr = (ps: Pair[]) => ps.map((p) => Math.abs(p.ours / p.ref - 1) * 100);
  const dbErr = (ps: Pair[]) => ps.map((p) => Math.abs(p.ours - p.ref));
  const stats: HornrespBoxRun["stats"] = {
    zeMean: mean(relErr(ze)),
    zeP95: percentile(relErr(ze), 0.95),
    zeWorst: Math.max(...relErr(ze)),
    zePhaseMean: mean(zePh.map((p) => Math.abs(((p.ours - p.ref + 540) % 360) - 180))),
    xdMean: mean(relErr(xd)),
    xdP95: percentile(relErr(xd), 0.95),
  };
  const pass: HornrespBoxRun["pass"] = {
    ze: stats.zeMean < tol.zeMean && stats.zeP95 < tol.zeP95 && stats.zePhaseMean < tol.zePhaseMean,
    xd: stats.xdMean < tol.xdMean && stats.xdP95 < tol.xdP95,
  };
  // Group delay, from the full table (it carries Delay), away from nulls as for the lines.
  if (full && full[0]?.Delay !== undefined) {
    const gdr = readTable(join(dir, "hornresp.txt")).filter((x) => x.Freq! <= fTop);
    const notInNull = (x: Record<string, number>) => x.SPL! > Math.max(...gdr.filter((y) => Math.abs(Math.log2(y.Freq! / x.Freq!)) < 1 / 3).map((y) => y.SPL!)) - 10;
    const gd = gdr.filter(notInNull).map((x) => Math.abs(interp(r.freq, r.groupDelayMs, x.Freq!) - x.Delay!));
    stats.gdP95 = percentile(gd, 0.95);
    pass.gd = stats.gdP95 < tol.gdP95;
  }
  // EQ: the voltage it passes to the speaker, against Hornresp's Ein over its whole range.
  if (c.eq && full && full[0]?.Ein !== undefined) {
    const all = readTable(join(dir, "hornresp.txt"));
    stats.einMax = Math.max(...all.map((x) => { const h = eqResponse(c.eq!, x.Freq!); return Math.abs((2.83 * Math.hypot(h.re, h.im)) / x.Ein! - 1) * 100; }));
    pass.ein = stats.einMax < 0.01;
  }
  let spl: Pair[] = [];
  if (splRows) {
    spl = pair(splRows, "SPL", r.spl);
    stats.splMean = mean(dbErr(spl));
    stats.splP95 = percentile(dbErr(spl), 0.95);
    pass.spl = stats.splMean < tol.splMean && stats.splP95 < tol.splP95;
  }
  // Each output alone, from its volume velocity, as power from a baffled piston of its area at
  // 1 m in half space (how Hornresp works it out), or full space (6 dB less).
  const spaceK = c.space === "full" ? 4 * Math.PI : 2 * Math.PI;
  const db = (w: number, u: number, area: number) => 20 * Math.log10((HORNRESP_AIR.rho * w * u * pistonPowerFactor(area, w, HORNRESP_AIR)) / spaceK / 2e-5);
  let cone: Pair[] | undefined;
  if (coneRows) {
    const sd = driverModel(c.driver ?? HORNRESP_DRIVER, HORNRESP_AIR).sd * (c.drivers ?? 1);
    cone = pair(coneRows, "SPL", Float64Array.from(r.freq, (f, i) => db(2 * Math.PI * f, (2 * Math.PI * f * (r.excursionMm[i]! / 1000) * sd) / Math.SQRT2, sd)));
    stats.coneMean = mean(dbErr(cone));
    stats.coneP95 = percentile(dbErr(cone), 0.95);
    pass.cone = stats.coneMean < tol.splMean && stats.coneP95 < tol.splP95;
  }
  let vent: Pair[] | undefined;
  if (ventRows) {
    const ventDb = Float64Array.from(r.freq, (f, i) => {
      const w = 2 * Math.PI * f;
      let u: number, area: number;
      if (c.input.kind === "passive-radiator") {
        area = c.input.pr.sd_cm2 / 1e4;
        u = (w * (r.prExcursionMm![i]! / 1000) * area * (c.input.prCount ?? 1)) / Math.SQRT2;
      } else if (c.input.kind === "vented") {
        area = (Math.PI * (c.input.port as { diameter_cm: number }).diameter_cm ** 2) / 4 / 1e4;
        u = (r.portVelocity![i]! * area * (c.input.portCount ?? 1)) / Math.SQRT2;
      } else if (c.input.kind === "bandpass" && c.input.front.prs?.length === 1) {
        // A 4th-order bandpass box's front passive radiators or port: Hornresp's Wizard output is theirs alone.
        const g = c.input.front.prs[0]!;
        area = g.pr.sd_cm2 / 1e4;
        u = (w * (r.prExcursionMm![i]! / 1000) * area * g.count) / Math.SQRT2;
      } else if (c.input.kind === "bandpass" && c.input.front.port && !c.input.rear.port && !c.input.rear.prs) {
        area = (Math.PI * (c.input.front.port as { diameter_cm: number }).diameter_cm ** 2) / 4 / 1e4;
        u = (r.portVelocity![i]! * area * (c.input.front.portCount ?? 1)) / Math.SQRT2;
      } else throw new Error(`${id}: the vent's output is compared for ported, PR and PR-bandpass boxes only`);
      return db(w, u, area);
    });
    vent = pair(ventRows, "SPL", ventDb);
    stats.ventMean = mean(dbErr(vent));
    stats.ventP95 = percentile(dbErr(vent), 0.95);
    pass.vent = stats.ventMean < tol.splMean && stats.ventP95 < tol.splP95;
  }
  // The coil's effect on SPL, up high: this case's SPL less the plain case's, in both.
  if (c.splDeltaFrom) {
    const fTop = c.zeFMax ?? HORNRESP_BOX_F_MAX;
    const refCase = readBoxCase(c.splDeltaFrom);
    const wide = { ...base, fMax: fTop, points: 4000 };
    const ours = simulate(driver, c.input, wide);
    const plain = simulate(hornrespDriver(HORNRESP_DRIVER, refCase.frontAir), refCase.input, wide);
    const mine = readTable(join(dir, "hornresp.txt")).filter((x) => x.Freq! <= fTop);
    const theirs = readTable(join(HORNRESP_BOX_DIR, c.splDeltaFrom, "hornresp.txt"));
    const e = mine.map((x) => {
      const t = theirs.find((y) => Math.abs(y.Freq! / x.Freq! - 1) < 1e-6)!;
      return Math.abs(x.SPL! - t.SPL! - (interp(ours.freq, ours.spl, x.Freq!) - interp(plain.freq, plain.spl, x.Freq!)));
    });
    stats.coilMean = mean(e);
    stats.coilP95 = percentile(e, 0.95);
    pass.coil = stats.coilMean < tol.splMean && stats.coilP95 < tol.splP95;
  }
  const maxSpl = maxSplRuns(dir, HORNRESP_BOX_F_MAX, (o) => simulate(driver, c.input, { ...base, ...o }));
  const impulse = impulseRun(dir, false, (t) => transientResponse(driver, c.input, { ...base, splFrom: "power" }, t));
  const velocity = velocityRun(dir, r.freq, r.portVelocity);
  return { id, c, result: r, tol, spl, ze, xd, cone, vent, maxSpl, ...(impulse ? { impulse } : {}), ...(velocity ? { velocity } : {}), stats, pass };
}
