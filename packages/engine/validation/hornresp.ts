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
import { driverModel, type DriverInput, type EnclosureInput } from "../src/model.ts";
import { pistonPowerFactor } from "../src/line.ts";
import type { LineInput } from "../src/line.ts";

export const HORNRESP_DIR = join(import.meta.dirname, "..", "test", "fixtures", "hornresp");
export const HORNRESP_VERSION = "Hornresp 60.60";
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

The first seven cases were checked against Hornresp 55.30 first, then against 60.60 with the same results; the five with other drivers (a 12″ subwoofer, a 4″ full-range) came with 60.60.

Stuffed lines (08 and 09 in the records) aren't automated: Hornresp uses segment filling only in its Loudspeaker Wizard, so they were read off its charts. Acoustic power agreed within about 1 dB from 20 Hz to 1 kHz, and every impedance peak fell at the same frequency (straight TL: 63 Hz / 13.8 Ω against ~63 Hz / ~14.0 Ω). The two fibre models differ, so stuffed lines are judged on the trend.`;

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
  spl: Pair[];
  stats: { splMean: number; splP95: number; einMean: number; pinMean: number };
  pass: boolean;
}

export const MAXSPL_TOL = { splMean: 0.15, splP95: 0.4, einMean: 0.5, pinMean: 1 };

function maxSplRuns(dir: string, fMax: number, run: (o: SimulationOptions) => SimulationResult): MaxSplRun[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^hornresp-maxspl(-\d+v)?\.txt$/.test(f))
    .sort()
    .map((file) => {
      const v = /-(\d+)v\.txt$/.exec(file);
      const ampVolts = v ? Number(v[1]) : undefined;
      const r = run({ thermalLimit: "real", portVelocityLimit: Infinity, ...(ampVolts ? { amp: { volts: ampVolts } } : {}) });
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
      return { file, ...(ampVolts ? { ampVolts } : {}), spl, stats, pass };
    });
}

export function runHornresp(id: string): HornrespRun {
  const dir = join(HORNRESP_DIR, id);
  const input = JSON.parse(readFileSync(join(dir, "input.json"), "utf8")) as LineInput;
  const driver = (existsSync(join(dir, "driver.json")) ? JSON.parse(readFileSync(join(dir, "driver.json"), "utf8")) : HORNRESP_DRIVER) as DriverInput;
  // options.json: more than one driver (Hornresp's "Nd = 2P").
  const extra = existsSync(join(dir, "options.json")) ? (JSON.parse(readFileSync(join(dir, "options.json"), "utf8")) as Pick<SimulationOptions, "drivers" | "wiring">) : {};
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
  const phErr = rows.map((x) => Math.abs(((interp(r.freq, r.phaseDeg, x.Freq!) - x.WPhase! + 540) % 360) - 180));
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
  const T = HORNRESP_TOL;
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
  return { id, input, driver, result: r, spl, ze, xd, gd, za, mouth, maxSpl, stats, pass };
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
export const hornrespBoxIds = () => (existsSync(HORNRESP_BOX_DIR) ? readdirSync(HORNRESP_BOX_DIR).sort() : []);
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
};
type BoxTol = typeof HORNRESP_BOX_TOL;

export const HORNRESP_BOX_NOTES = `Hornresp models an ordinary box as a very short horn on the cone's front (its "Horn" output) with the box behind, so these records are its "Nd" records with a 0.01 cm horn; bandpass boxes run in its Loudspeaker Wizard, which exports SPL, impedance and excursion but not group delay or port air speed.

What the comparison settles, and the conventions it has to bridge:

- **The cone's mass.** The app's T/S parameters carry Mms (with the air on both sides of the cone), as datasheets and WinISD do. Hornresp's records carry the bare Mmd, and it adds the front air back in a sealed, ported or PR box but none in a bandpass box, where the chambers' air carries it. Each case gives the cone what Hornresp gives it, from the same Mms.
- **Ports are pipes.** Hornresp treats a port as a short pipe, not just a mass of air. With Settings → Ports → "Pipe, like Hornresp" the app does the same, and the ported box then matches within 0.3 % in impedance and 0.02 dB in the port's own output, with the standard end correction (0.732 × diameter). As an air mass (the default, like WinISD) the port's own output parts from Hornresp's by up to 1.3 dB at 260 Hz and the impedance by about 1 %. Bandpass ports can now be pipes too, including a series box's rear port between the two chambers.
- **Leakage (QL) in bandpass boxes.** Hornresp's QL behaves as if referred to the box's lowest tuning (that's what fits all three records); the app, like WinISD, refers it to each chamber's own tuning. So Hornresp's QL 7 is entered as the same leak at the chamber's own tuning (10.4 and 13.7 in the front chambers of the 6th-order boxes). A series box's rear chamber, which opens only into the front one, has no leak in Hornresp.
- **Passive radiators.** Hornresp adds the front air to the radiator's moving mass as well (3.83 g for the DSA270-PR); with that, its output alone is within 0.01 dB.
- **Two drivers side by side** (Hornresp's "Nd = 2P") load each other's fronts: Hornresp treats them as one piston of twice the area, which gives each √2 × one cone's front air. In lines and horns the app now does the same (case 15: the mass-loaded line with two drivers is within 0.03 dB and 0.2 %); in boxes the app keeps each driver's datasheet Mms, as WinISD does, and the case gives the cones Hornresp's air.

The fourth-order and parallel sixth-order bandpass boxes are held to looser SPL limits: above about 150 Hz, more than 12 dB below the passband, the app's output rises up to 1 dB above Hornresp's (the impedance and excursion still match within 0.4 %), and the parallel box's slope below 15 Hz, 50 dB down, sits up to 1.3 dB lower. The front port's air speed in the fourth-order box peaks at 3.39 m/s at 51 Hz in the app and about 3.38 m/s on Hornresp's chart.`;

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
  /** "pipe": the port as a short pipe, as Hornresp has it (its output rises towards the pipe's resonance). */
  portModel?: "lumped" | "pipe";
  drivers?: number;
  wiring?: "parallel" | "series";
  /** Looser limits where Hornresp's loss model parts from ours (see the notes). */
  tol?: Partial<BoxTol>;
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
  stats: {
    splMean?: number; splP95?: number; zeMean: number; zeP95: number; zePhaseMean: number; xdMean: number; xdP95: number;
    coneMean?: number; coneP95?: number; ventMean?: number; ventP95?: number;
  };
  pass: { spl?: boolean; ze: boolean; xd: boolean; cone?: boolean; vent?: boolean };
}

export function runHornrespBox(id: string): HornrespBoxRun {
  const dir = join(HORNRESP_BOX_DIR, id);
  const c = readBoxCase(id);
  const tol = { ...HORNRESP_BOX_TOL, ...c.tol };
  const driver = hornrespDriver(HORNRESP_DRIVER, c.frontAir);
  const base: SimulationOptions = {
    power: 2.83, convention: "volts", fMin: 10, fMax: 1000, points: 8000, air: HORNRESP_AIR, drivers: c.drivers, wiring: c.wiring, portModel: c.portModel,
  };
  const r = simulate(driver, c.input, base);
  const table = (name: string) => (existsSync(join(dir, name)) ? readTable(join(dir, name)).filter((x) => x.Freq! <= HORNRESP_BOX_F_MAX) : null);
  const full = table("hornresp.txt");
  const wizard = (k: string) => full ?? table(`hornresp-${k}.txt`);
  const coneRows = table("hornresp-cone.txt");
  const ventRows = table("hornresp-vent.txt");
  // Excursion and impedance are the same in every output's export.
  const zeRows = wizard("ze") ?? coneRows ?? ventRows!;
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
    zePhaseMean: mean(zePh.map((p) => Math.abs(((p.ours - p.ref + 540) % 360) - 180))),
    xdMean: mean(relErr(xd)),
    xdP95: percentile(relErr(xd), 0.95),
  };
  const pass: HornrespBoxRun["pass"] = {
    ze: stats.zeMean < tol.zeMean && stats.zeP95 < tol.zeP95 && stats.zePhaseMean < tol.zePhaseMean,
    xd: stats.xdMean < tol.xdMean && stats.xdP95 < tol.xdP95,
  };
  let spl: Pair[] = [];
  if (splRows) {
    spl = pair(splRows, "SPL", r.spl);
    stats.splMean = mean(dbErr(spl));
    stats.splP95 = percentile(dbErr(spl), 0.95);
    pass.spl = stats.splMean < tol.splMean && stats.splP95 < tol.splP95;
  }
  // Each output alone, from its volume velocity, as power from a baffled piston of its area at
  // 1 m in half space (how Hornresp works it out).
  const db = (w: number, u: number, area: number) => 20 * Math.log10((HORNRESP_AIR.rho * w * u * pistonPowerFactor(area, w, HORNRESP_AIR)) / (2 * Math.PI) / 2e-5);
  let cone: Pair[] | undefined;
  if (coneRows) {
    const sd = driverModel(HORNRESP_DRIVER, HORNRESP_AIR).sd * (c.drivers ?? 1);
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
      } else throw new Error(`${id}: the vent's output is compared for ported and PR boxes only`);
      return db(w, u, area);
    });
    vent = pair(ventRows, "SPL", ventDb);
    stats.ventMean = mean(dbErr(vent));
    stats.ventP95 = percentile(dbErr(vent), 0.95);
    pass.vent = stats.ventMean < tol.splMean && stats.ventP95 < tol.splP95;
  }
  const maxSpl = maxSplRuns(dir, HORNRESP_BOX_F_MAX, (o) => simulate(driver, c.input, { ...base, ...o }));
  return { id, c, result: r, tol, spl, ze, xd, cone, vent, maxSpl, stats, pass };
}
