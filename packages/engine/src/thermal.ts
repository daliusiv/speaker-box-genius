import { COIL_ALPHA } from "./model.ts";

/**
 * Voice-coil heating: one thermal node, steady state. The coil settles where the heat it takes,
 * P_coil = I²·Re(T), leaves through its thermal resistance: T = T_amb + R_th·P_coil, with
 * Re(T) = Re₂₀·(1 + α·(T − 20)). Only the coil's resistance changes with temperature, so one
 * simulation (CoilParts) gives the coil current at any temperature and drive, and every acoustic
 * and mechanical output scales with that current.
 */

/** Default highest coil temperature (°C) the driver's power rating (Pe) is taken to hold. */
export const DEFAULT_TMAX_C = 200;
/** Where a coil that can't settle is capped (°C): the "runaway" case. */
export const COIL_TEMP_CAP_C = 400;

/**
 * Per driver, per frequency, from one simulation: the coil current at the simulated drive (A RMS,
 * complex) and everything else in the coil's loop besides its resistance (the source's impedance,
 * the coil's inductance and losses, the motional impedance). At temperature T and drive scale s
 * (amplifier volts ÷ the simulated drive's), the current is s · I · (z + Re_sim) / (z + Re(T)).
 */
export interface CoilParts {
  /** The coil's resistance at 20 °C (Ω, per driver; an isobaric pair counts as one). */
  re20: number;
  /** The coil temperature the simulation ran with (°C) and its resistance there (Ω). */
  simTemp_C: number;
  reSim: number;
  /** Coil current per driver at the simulated drive (A RMS): real and imaginary parts. */
  iRe: Float64Array;
  iIm: Float64Array;
  /** The rest of the coil's loop per driver (Ω): real and imaginary parts. */
  zRe: Float64Array;
  zIm: Float64Array;
  /** Drivers in the bank: each heats on its own (same current, same temperature). */
  drivers: number;
  /** The coil's thermal model as simulate() took it (options.thermal and Pe), or null without Pe or R_th. */
  thermal: ThermalModel | null;
}

export interface ThermalModel {
  /** Thermal resistance of the coil to the air around the driver (K/W). */
  rth: number;
  /** Highest coil temperature (°C), for the coil limit. */
  tmax_C: number;
  /** Air around the driver (°C). Default 20. */
  ambient_C: number;
}

/** Coil resistance at T (°C), copper. */
export const reAt = (re20: number, tempC: number) => re20 * (1 + COIL_ALPHA * (tempC - 20));

/**
 * The coil's thermal resistance (K/W): the one typed in, else from the power rating, taken as the
 * power that holds the coil at T_max with the air at 20 °C: R_th = (T_max − 20) / Pe. Null when
 * neither is known (no guess from the driver's size).
 */
export function rthOf(pe: number | null | undefined, tmax_C = DEFAULT_TMAX_C, rth?: number | null): number | null {
  if (rth !== undefined && rth !== null && Number.isFinite(rth) && rth > 0) return rth;
  if (pe === null || pe === undefined || !(pe > 0) || !(tmax_C > 20)) return null;
  return (tmax_C - 20) / pe;
}

/**
 * Where a coil carrying a set RMS current settles: closed form of T = T_amb + R_th·I²·Re(T).
 * Runaway (the coil's heat grows faster than it can lose it) is capped at COIL_TEMP_CAP_C.
 */
export function coilTempForCurrent(iRms: number, re20: number, rth: number, ambient_C = 20): { tempC: number; runaway: boolean } {
  const k = rth * iRms * iRms * re20;
  const den = 1 - k * COIL_ALPHA;
  if (den <= 0) return { tempC: COIL_TEMP_CAP_C, runaway: true };
  const t = (ambient_C + k * (1 - 20 * COIL_ALPHA)) / den;
  return t > COIL_TEMP_CAP_C ? { tempC: COIL_TEMP_CAP_C, runaway: true } : { tempC: t, runaway: false };
}

/** |I(T)|² at drive scale s (A², per driver) for frequency index i. */
function current2(p: CoilParts, i: number, tempC: number, s: number): number {
  const zr = p.zRe[i]!, zi = p.zIm[i]!;
  const sr = zr + p.reSim, tr = zr + reAt(p.re20, tempC);
  const i2 = p.iRe[i]! * p.iRe[i]! + p.iIm[i]! * p.iIm[i]!;
  return (s * s * i2 * (sr * sr + zi * zi)) / (tr * tr + zi * zi);
}

/** Output at temperature T against the cold (20 °C) coil at the same amplifier voltage (dB, ≤ 0 above 20 °C). */
export function compressionAt(p: CoilParts, i: number, tempC: number): number {
  const zr = p.zRe[i]!, zi = p.zIm[i]!;
  const c = zr + p.re20, t = zr + reAt(p.re20, tempC);
  return 10 * Math.log10((c * c + zi * zi) / (t * t + zi * zi));
}

/**
 * Solve T = T_amb + R_th·P(T) for the lowest temperature where the heat balances (the one a coil
 * reaches warming up from cold): scan up in 10 °C steps to the first crossing, then close in on
 * it (Illinois) to 1e-6 °C or 1e-9 K of imbalance. Runaway when the heat still outruns the loss at COIL_TEMP_CAP_C.
 */
function settle(power: (tempC: number) => number, th: ThermalModel): { tempC: number; runaway: boolean } {
  const g = (t: number) => th.ambient_C + th.rth * power(t) - t;
  let a = th.ambient_C;
  if (!(g(a) > 0)) return { tempC: a, runaway: false };
  let b = a;
  for (;;) {
    b = Math.min(COIL_TEMP_CAP_C, a + 10);
    if (g(b) <= 0) break;
    if (b >= COIL_TEMP_CAP_C) return { tempC: COIL_TEMP_CAP_C, runaway: true };
    a = b;
  }
  // Illinois (regula falsi that halves the stuck end's value): a handful of steps on a smooth g.
  let ga = g(a), gb = g(b), side = 0;
  for (let k = 0; k < 100 && b - a > 1e-6; k++) {
    const m = gb === ga ? 0.5 * (a + b) : b - (gb * (b - a)) / (gb - ga);
    const gm = g(m);
    if (gm === 0) return { tempC: m, runaway: false };
    if (gm > 0) {
      a = m;
      ga = gm;
      if (side === -1) gb /= 2;
      side = -1;
    } else {
      b = m;
      gb = gm;
      if (side === 1) ga /= 2;
      side = 1;
    }
    if (Math.abs(gm) < 1e-9) return { tempC: m, runaway: false };
  }
  return { tempC: 0.5 * (a + b), runaway: false };
}

/**
 * A steady sine at each frequency on its own (Max SPL's signal): where the coil settles, its heat
 * per driver (W) and the output it loses against a cold coil (dB). `scale` = amplifier volts ÷ the
 * simulated drive's.
 */
export function sineEquilibrium(p: CoilParts, th: ThermalModel, scale = 1): { tempC: Float64Array; coilW: Float64Array; compressionDb: Float64Array; runaway: boolean[] } {
  const n = p.iRe.length;
  const tempC = new Float64Array(n), coilW = new Float64Array(n), compressionDb = new Float64Array(n);
  const runaway: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const r = settle((t) => current2(p, i, t, scale) * reAt(p.re20, t), th);
    tempC[i] = r.tempC;
    coilW[i] = current2(p, i, r.tempC, scale) * reAt(p.re20, r.tempC);
    compressionDb[i] = compressionAt(p, i, r.tempC);
    runaway.push(r.runaway);
  }
  return { tempC, coilW, compressionDb, runaway };
}

/**
 * Weights of pink noise over `band` (Hz) on the frequency grid: equal energy per octave, i.e. each
 * point's share of ln f (trapezoids), summing to 1. Null when the band holds no point.
 */
export function pinkWeights(freq: ArrayLike<number>, band: readonly [number, number]): Float64Array | null {
  const n = freq.length;
  const w = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const f = freq[i]!;
    if (f < band[0] || f > band[1]) continue;
    const lo = i > 0 && freq[i - 1]! >= band[0] ? Math.log(freq[i - 1]!) : Math.log(f);
    const hi = i < n - 1 && freq[i + 1]! <= band[1] ? Math.log(freq[i + 1]!) : Math.log(f);
    w[i] = (hi - lo) / 2;
    sum += w[i]!;
  }
  if (sum > 0) {
    for (let i = 0; i < n; i++) w[i] = w[i]! / sum;
    return w;
  }
  // A band too narrow for the grid's spacing: the nearest single point.
  let k = -1;
  for (let i = 0; i < n; i++) if (freq[i]! >= band[0] && freq[i]! <= band[1]) k = i;
  if (k < 0) return null;
  w[k] = 1;
  return w;
}

/** The band's points and pink weights, with each point's |I_sim|²·|z + Re_sim|² and its loop impedance, for fast re-solving. */
function bandOf(p: CoilParts, freq: ArrayLike<number>, band: readonly [number, number]) {
  const w = pinkWeights(freq, band);
  if (!w) return null;
  const idx: number[] = [];
  for (let i = 0; i < w.length; i++) if (w[i]! > 0) idx.push(i);
  const k = idx.length;
  const wt = new Float64Array(k), a = new Float64Array(k), zr = new Float64Array(k), zi2 = new Float64Array(k);
  idx.forEach((i, j) => {
    const sr = p.zRe[i]! + p.reSim, zi = p.zIm[i]!;
    wt[j] = w[i]!;
    a[j] = (p.iRe[i]! * p.iRe[i]! + p.iIm[i]! * p.iIm[i]!) * (sr * sr + zi * zi);
    zr[j] = p.zRe[i]!;
    zi2[j] = zi * zi;
  });
  return { w, wt, a, zr, zi2 };
}

/** Coil power (W per driver) on pink noise at drive scale s, coil at T. */
function bandPower(b: NonNullable<ReturnType<typeof bandOf>>, re20: number, s: number, t: number): number {
  const re = reAt(re20, t);
  let sum = 0;
  for (let j = 0; j < b.wt.length; j++) {
    const tr = b.zr[j]! + re;
    sum += (b.wt[j]! * b.a[j]!) / (tr * tr + b.zi2[j]!);
  }
  return s * s * sum * re;
}

/**
 * Pink noise at the drive's average (RMS) amplifier voltage, band-limited to `band` (default
 * 20–200 Hz) before the filters and EQ (which are in the parts' currents): one coil temperature for
 * the whole signal, its heat per driver (W) and the output lost at each frequency against a cold
 * coil (dB). Null when the band holds no point of the grid.
 */
export function programEquilibrium(
  p: CoilParts,
  freq: ArrayLike<number>,
  th: ThermalModel,
  band: readonly [number, number] = [20, 200],
  scale = 1,
): { tempC: number; coilW: number; runaway: boolean; compressionDb: Float64Array } | null {
  const b = bandOf(p, freq, band);
  if (!b) return null;
  const r = settle((t) => bandPower(b, p.re20, scale, t), th);
  const compressionDb = new Float64Array(freq.length);
  for (let i = 0; i < freq.length; i++) compressionDb[i] = compressionAt(p, i, r.tempC);
  return { tempC: r.tempC, coilW: bandPower(b, p.re20, scale, r.tempC), runaway: r.runaway, compressionDb };
}

/**
 * Power compression against drive level: program equilibrium at each drive scale (amplifier volts
 * ÷ the simulated drive's; watts W stand for √(W / W_sim)) and the compression averaged over the
 * band with the pink weights (dB).
 */
export function compressionSweep(
  p: CoilParts,
  freq: ArrayLike<number>,
  th: ThermalModel,
  scales: readonly number[],
  band: readonly [number, number] = [20, 200],
): { scale: number; tempC: number; coilW: number; runaway: boolean; compressionDb: number }[] {
  const b = bandOf(p, freq, band);
  if (!b) return [];
  return scales.map((s) => {
    const r = settle((t) => bandPower(b, p.re20, s, t), th);
    const re = reAt(p.re20, r.tempC);
    let db = 0;
    for (let j = 0; j < b.wt.length; j++) {
      const c = b.zr[j]! + p.re20, t = b.zr[j]! + re;
      db += b.wt[j]! * 10 * Math.log10((c * c + b.zi2[j]!) / (t * t + b.zi2[j]!));
    }
    return { scale: s, tempC: r.tempC, coilW: bandPower(b, p.re20, s, r.tempC), runaway: r.runaway, compressionDb: db };
  });
}
