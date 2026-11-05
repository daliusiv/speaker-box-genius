/**
 * The Hornresp comparison cases: each folder under test/fixtures/hornresp holds one design
 * (input.json, our LineInput) and Hornresp's own exports for it at 2.83 V in half space:
 * spl.frd (SPL at 1 m), ze.zma (electrical impedance) and optionally za.txt (the line's
 * acoustic impedance at the driver). The records Hornresp was run on are in
 * docs/hornresp-validation/records. Hornresp's air: c = 344 m/s, ρ = 1.205 kg/m³. Hornresp
 * works SPL out from radiated power, so the comparison uses splFrom: "power".
 *
 * The engine tests (test/hornresp.test.ts) and the validation report both use this module.
 * To add a case: run the record in Hornresp, put its exports in a new fixtures folder, add a
 * title below, then run `pnpm validation:report`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { simulate, type SimulationResult } from "../src/simulate.ts";
import type { LineInput } from "../src/line.ts";

export const HORNRESP_DIR = join(import.meta.dirname, "..", "test", "fixtures", "hornresp");
export const HORNRESP_VERSION = "Hornresp 55.30";
export const HORNRESP_AIR = { rho: 1.205, c: 344 };
/** Dayton Audio DSA215-8, as written into every validation record. */
export const HORNRESP_DRIVER = { fs: 35, qms: 1.87, qes: 0.4, vas_l: 37.4, re: 5.9, sd_cm2: 211.2, le_mh: 1, xmax_mm: 5.5, pe_w: 80 };
/** Compared from 10 Hz up to this frequency. */
export const HORNRESP_F_MAX = 1000;

export const HORNRESP_TOL = {
  /** SPL: mean and 95th percentile of |difference| (dB). */
  splMean: 0.15,
  splP95: 0.4,
  /** Electrical impedance: mean and worst |relative difference| (%). */
  zeMean: 0.5,
  zeWorst: 3,
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
};

export const HORNRESP_NOTES = `The line's resonances fall on the same frequencies as Hornresp's. The only large SPL differences are at the bottom of deep nulls: the same frequency, a different depth (a few hundredths of a hertz move the bottom of a 40 dB null by many dB), which is why SPL is held to its mean and 95th percentile rather than its worst point.

What the comparison found and fixed:

- **The cone's mass in lines and horns.** The air on both sides of the cone is modelled explicitly, so the cone carries its bare mass (Mms less the air load), as Hornresp does. Using Mms had counted the rear air mass twice and made impedance peaks up to 10 % low.
- **SPL from radiated power.** Hornresp works SPL out from the power each opening radiates, not from on-axis pressure. The two agree at low frequency and part once the mouth is large next to the wavelength (about 1.7 dB at 500 Hz for an 850 cm² mouth). The app shows on-axis SPL by default; Settings → Line/horn SPL → “From radiated power (like Hornresp)” gives Hornresp's.

Stuffed lines (08 and 09 in the records) aren't automated: Hornresp uses segment filling only in its Loudspeaker Wizard, so they were read off its charts. Acoustic power agreed within about 1 dB from 20 Hz to 1 kHz, and every impedance peak fell at the same frequency (straight TL: 63 Hz / 13.8 Ω against ~63 Hz / ~14.0 Ω). The two fibre models differ, so stuffed lines are judged on the trend.`;

export const readCurve = (file: string) =>
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim().split(/\s+/).map(Number))
    .filter((r) => r.length >= 2 && r[0]! > 0 && Number.isFinite(r[1]));

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

export interface HornrespRun {
  id: string;
  input: LineInput;
  result: SimulationResult;
  /** Hornresp's points up to HORNRESP_F_MAX, with ours at the same frequencies. */
  spl: { f: number; ref: number; ours: number }[];
  ze: { f: number; ref: number; ours: number }[];
  za?: { f: number; ref: number; ours: number }[];
  stats: {
    splMean: number;
    splP95: number;
    splWorst: number;
    zeMean: number;
    zeWorst: number;
    zaMean?: number;
  };
  pass: { spl: boolean; ze: boolean; za?: boolean };
}

export function runHornresp(id: string): HornrespRun {
  const dir = join(HORNRESP_DIR, id);
  const input = JSON.parse(readFileSync(join(dir, "input.json"), "utf8")) as LineInput;
  const r = simulate(HORNRESP_DRIVER, input, { power: 2.83, convention: "volts", fMin: 10, fMax: 2000, points: 2000, air: HORNRESP_AIR, splFrom: "power" });
  const pair = (file: string, ours: Float64Array) =>
    readCurve(join(dir, file))
      .filter((p) => p[0]! <= HORNRESP_F_MAX)
      .map(([f, ref]) => ({ f: f!, ref: ref!, ours: interp(r.freq, ours, f!) }));

  const spl = pair("spl.frd", r.spl);
  const ze = pair("ze.zma", r.impedanceOhm);
  const splErr = spl.map((p) => Math.abs(p.ours - p.ref));
  const zeErr = ze.map((p) => Math.abs(p.ours / p.ref - 1) * 100);
  const stats: HornrespRun["stats"] = {
    splMean: mean(splErr),
    splP95: percentile(splErr, 0.95),
    splWorst: Math.max(...splErr),
    zeMean: mean(zeErr),
    zeWorst: Math.max(...zeErr),
  };
  const T = HORNRESP_TOL;
  const pass: HornrespRun["pass"] = { spl: stats.splMean < T.splMean && stats.splP95 < T.splP95, ze: stats.zeMean < T.zeMean && stats.zeWorst < T.zeWorst };

  let za: HornrespRun["za"];
  if (existsSync(join(dir, "za.txt")) && r.acousticImpedance) {
    const a = r.acousticImpedance;
    za = pair("za.txt", Float64Array.from(a.resistance, (re, i) => Math.hypot(re, a.reactance[i]!)));
    // Away from the sharp peaks and nulls, where a hair's shift in frequency moves the value a lot.
    const errs = za.filter((p) => p.ref > 0.3 && p.ref < 5).map((p) => Math.abs(20 * Math.log10(p.ours / p.ref)));
    stats.zaMean = mean(errs);
    pass.za = stats.zaMean < T.zaMean;
  }
  return { id, input, result: r, spl, ze, za, stats, pass };
}
