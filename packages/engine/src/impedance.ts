import { abs, add, cx, div, type Complex } from "./complex.ts";
import { STANDARD_AIR, type Air } from "./constants.ts";

/**
 * Driver impedance measurements: parsing .zma / DATS / plain text sweeps,
 * fitting Thiele/Small parameters, and Vas from an added-mass sweep.
 */

export interface ImpedanceData {
  freq: number[];
  mag: number[];
  /** Phase in degrees, if the file has it. */
  phase: number[] | null;
}

/**
 * Parse an impedance file. Accepts the common layouts:
 *   "20.0  7.31  -12.5"   (.zma: Hz, ohms, degrees)
 *   "20.0,7.31,-12.5"     (CSV)
 *   "20,0;7,31;-12,5"     (European CSV)
 *   "20.0\t7.31"          (magnitude only)
 * Lines that don't start with a number (headers, "*" comments) are skipped.
 */
export function parseImpedance(text: string): ImpedanceData {
  const rows: [number, number, number | null][] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!/^[-+]?\d/.test(line)) continue;
    let tokens: string[];
    if (/[;\t]/.test(line)) tokens = line.split(/[;\t]+/);
    else if (/\s/.test(line)) tokens = line.split(/\s+/);
    else tokens = line.split(",");
    const nums = tokens.map((t) => Number(t.trim().replace(",", "."))).filter((v) => Number.isFinite(v));
    if (nums.length < 2 || !(nums[0]! > 0) || !(nums[1]! > 0)) continue;
    rows.push([nums[0]!, nums[1]!, nums.length >= 3 ? nums[2]! : null]);
  }
  if (rows.length < 10) throw new Error("Couldn't find an impedance sweep (need at least 10 lines of frequency and impedance)");
  rows.sort((a, b) => a[0] - b[0]);
  const hasPhase = rows.every((r) => r[2] !== null);
  return { freq: rows.map((r) => r[0]), mag: rows.map((r) => r[1]), phase: hasPhase ? rows.map((r) => r[2]!) : null };
}

export interface ImpedanceParams {
  re: number;
  fs: number;
  qms: number;
  qes: number;
  le_mh: number;
  /** L2R2 voice-coil model (see DriverInput); omit for plain Le. */
  l2_mh?: number;
  r2_ohm?: number;
}

/** Free-air impedance of the driver model: voice coil (Re, Le[, L2 ∥ R2]) + motional parallel RLC. */
export function driverImpedance(p: ImpedanceParams, f: number): Complex {
  const w = 2 * Math.PI * f;
  const ws = 2 * Math.PI * p.fs;
  const res = (p.re * p.qms) / p.qes;
  const cmes = p.qes / (ws * p.re);
  const lces = 1 / (ws * ws * cmes);
  // Admittance of the motional branch
  const y = add(cx(1 / res, w * cmes), cx(0, -1 / (w * lces)));
  let zvc = cx(p.re, (w * p.le_mh) / 1000);
  if (p.l2_mh !== undefined && p.r2_ohm !== undefined && p.l2_mh > 0 && p.r2_ohm > 0) {
    const zl2 = cx(0, (w * p.l2_mh) / 1000);
    zvc = add(zvc, div(cx(zl2.re * p.r2_ohm, zl2.im * p.r2_ohm), add(zl2, cx(p.r2_ohm))));
  }
  return add(zvc, div(cx(1), y));
}

export interface FitResult extends ImpedanceParams {
  qts: number;
  /** RMS error of the fit, as a fraction of |Z| (0.02 = 2 %). */
  rmsError: number;
  /** Frequency range used for the fit (Hz). */
  range: [number, number];
  usedPhase: boolean;
}

/** Linear interpolation of y at x on a sorted grid. */
function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]!) return ys[0]!;
  for (let i = 1; i < xs.length; i++) {
    if (xs[i]! >= x) {
      const t = (x - xs[i - 1]!) / (xs[i]! - xs[i - 1]!);
      return ys[i - 1]! + t * (ys[i]! - ys[i - 1]!);
    }
  }
  return ys[ys.length - 1]!;
}

/**
 * Classic estimate (the "−3 dB bandwidth" method used by DATS, WT3 and the
 * like): fs at the impedance peak, Qms and Qes from where |Z| = √(Zmax·Re).
 */
export function estimateFromPeak(d: ImpedanceData, reDc?: number): ImpedanceParams {
  // Peak between 5 and 500 Hz
  let ipk = -1;
  for (let i = 0; i < d.freq.length; i++) {
    const f = d.freq[i]!;
    if (f < 5 || f > 500) continue;
    if (ipk < 0 || d.mag[i]! > d.mag[ipk]!) ipk = i;
  }
  if (ipk < 0) throw new Error("No impedance peak between 5 and 500 Hz");
  const zmax = d.mag[ipk]!;
  const fpk = d.freq[ipk]!;
  // Re: given, or the minimum above the peak (before inductance takes over), else below it.
  let re = reDc;
  if (re === undefined) {
    let m = Infinity;
    for (let i = ipk; i < d.freq.length && d.freq[i]! < fpk * 8; i++) m = Math.min(m, d.mag[i]!);
    re = m * 0.97; // the minimum sits a little above Re because of Le
  }
  const r0 = zmax / re;
  if (!(r0 > 1.2)) throw new Error("The impedance peak is too small to measure from");
  const z12 = re * Math.sqrt(r0);
  // f1 below the peak, f2 above, where |Z| crosses z12
  let f1 = NaN;
  for (let i = ipk; i > 0; i--) {
    if (d.mag[i - 1]! <= z12) {
      const t = (z12 - d.mag[i - 1]!) / (d.mag[i]! - d.mag[i - 1]!);
      f1 = d.freq[i - 1]! + t * (d.freq[i]! - d.freq[i - 1]!);
      break;
    }
  }
  let f2 = NaN;
  for (let i = ipk; i < d.freq.length - 1; i++) {
    if (d.mag[i + 1]! <= z12) {
      const t = (d.mag[i]! - z12) / (d.mag[i]! - d.mag[i + 1]!);
      f2 = d.freq[i]! + t * (d.freq[i + 1]! - d.freq[i]!);
      break;
    }
  }
  if (!Number.isFinite(f1) || !Number.isFinite(f2)) throw new Error("The sweep doesn't cover both sides of the impedance peak");
  const fs = Math.sqrt(f1 * f2);
  const qms = (fs * Math.sqrt(r0)) / (f2 - f1);
  const qes = qms / (r0 - 1);
  // Le from the top of the sweep, if it rises there: |Z|² ≈ Re² + (ωLe)²
  const fTop = d.freq[d.freq.length - 1]!;
  const zTop = d.mag[d.mag.length - 1]!;
  const le = fTop > fs * 10 && zTop > re ? (Math.sqrt(zTop * zTop - re * re) / (2 * Math.PI * fTop)) * 1000 * 0.5 : 0.5;
  return { re, fs, qms, qes, le_mh: Math.max(0.01, le) };
}

/** Solve a small dense linear system (Gaussian elimination with partial pivoting). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const piv = M[c]![c]!;
    if (Math.abs(piv) < 1e-300) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r]![c]! / piv;
      for (let j = c; j <= n; j++) M[r]![j]! -= k * M[c]![j]!;
    }
  }
  return M.map((row, i) => row[n]! / (row[i]! || 1));
}

/** Levenberg–Marquardt on x (log-parameters here). Returns the best x and its residuals. */
function levenbergMarquardt(x0: number[], residualsOf: (x: number[]) => number[]): { x: number[]; r: number[]; cost: number } {
  const sumsq = (r: number[]) => r.reduce((a, v) => a + v * v, 0);
  let x = [...x0];
  let r = residualsOf(x);
  let cost = sumsq(r);
  let lambda = 1e-3;
  for (let iter = 0; iter < 200; iter++) {
    const J: number[][] = r.map(() => new Array(x.length).fill(0));
    for (let j = 0; j < x.length; j++) {
      const h = 1e-6;
      const xp = [...x];
      xp[j]! += h;
      const rp = residualsOf(xp);
      for (let i = 0; i < r.length; i++) J[i]![j] = (rp[i]! - r[i]!) / h;
    }
    const JtJ = x.map((_, a) => x.map((_, b) => J.reduce((s, row) => s + row[a]! * row[b]!, 0)));
    const Jtr = x.map((_, a) => J.reduce((s, row, i) => s + row[a]! * r[i]!, 0));
    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)));
      const delta = solve(A, Jtr.map((v) => -v));
      const xn = x.map((v, i) => v + delta[i]!);
      const rn = residualsOf(xn);
      const cn = sumsq(rn);
      if (cn < cost) {
        const gain = (cost - cn) / cost;
        x = xn;
        r = rn;
        cost = cn;
        lambda = Math.max(lambda / 3, 1e-9);
        improved = true;
        if (gain < 1e-10) iter = 1e9; // converged
        break;
      }
      lambda *= 4;
    }
    if (!improved) break;
  }
  return { x, r, cost };
}

export interface FitOptions {
  /**
   * Voice-coil model. "le": plain inductor, fitted around the resonance (default,
   * matches WinISD). "lr2": Le + (L2 ∥ R2), fitted over the whole sweep, so the
   * rising impedance above the resonance is captured too.
   */
  inductance?: "le" | "lr2";
  /**
   * With "lr2": keep fs, Qms and Qes from the fit around the resonance and fit only
   * the voice coil (Re, Le, L2, R2) over the whole sweep. The T/S parameters then
   * match the plain fit; only the coil model changes.
   */
  holdTs?: boolean;
}

/**
 * Fit Re, fs, Qms, Qes and Le to a free-air impedance sweep: start from the
 * bandwidth estimate, then refine with Levenberg–Marquardt on log-parameters
 * (keeps them positive). Uses phase when the file has it.
 *
 * @param reDc measured DC resistance; if given, Re is held fixed at this value.
 */
export function fitImpedance(d: ImpedanceData, reDc?: number, opts: FitOptions = {}): FitResult {
  if (opts.inductance === "lr2") return fitLr2(d, reDc, opts.holdTs ?? false);
  const start = estimateFromPeak(d, reDc);
  // Fit range: around the resonance, where the lumped model is good.
  const lo = Math.max(d.freq[0]!, start.fs / 4);
  const hi = Math.min(d.freq[d.freq.length - 1]!, Math.max(start.fs * 8, 200));
  const idx: number[] = [];
  for (let i = 0; i < d.freq.length; i++) if (d.freq[i]! >= lo && d.freq[i]! <= hi) idx.push(i);
  // Thin very dense sweeps for speed
  const step = Math.max(1, Math.floor(idx.length / 400));
  const pts = idx.filter((_, k) => k % step === 0);
  const usedPhase = d.phase !== null;
  const meas = pts.map((i) => {
    const m = d.mag[i]!;
    const ph = usedPhase ? (d.phase![i]! * Math.PI) / 180 : 0;
    return { f: d.freq[i]!, z: cx(m * Math.cos(ph), m * Math.sin(ph)), m };
  });

  const names = ["re", "fs", "qms", "qes", "le_mh"] as const;
  const fixed = reDc !== undefined ? new Set(["re"]) : new Set<string>();
  const free = names.filter((n) => !fixed.has(n));
  const toParams = (x: number[]): ImpedanceParams => {
    const p = { ...start };
    free.forEach((n, i) => (p[n] = Math.exp(x[i]!)));
    return p;
  };
  const residuals = (p: ImpedanceParams): number[] => {
    const r: number[] = [];
    for (const { f, z, m } of meas) {
      const zm = driverImpedance(p, f);
      if (usedPhase) {
        r.push((zm.re - z.re) / m, (zm.im - z.im) / m);
      } else {
        r.push(Math.log(abs(zm) / m));
      }
    }
    return r;
  };
  const sumsq = (r: number[]) => r.reduce((a, v) => a + v * v, 0);

  let x = free.map((n) => Math.log(start[n]));
  let r = residuals(toParams(x));
  let cost = sumsq(r);
  let lambda = 1e-3;
  for (let iter = 0; iter < 100; iter++) {
    // Numerical Jacobian
    const J: number[][] = r.map(() => new Array(x.length).fill(0));
    for (let j = 0; j < x.length; j++) {
      const h = 1e-6;
      const xp = [...x];
      xp[j]! += h;
      const rp = residuals(toParams(xp));
      for (let i = 0; i < r.length; i++) J[i]![j] = (rp[i]! - r[i]!) / h;
    }
    const JtJ = x.map((_, a) => x.map((_, b) => J.reduce((s, row) => s + row[a]! * row[b]!, 0)));
    const Jtr = x.map((_, a) => J.reduce((s, row, i) => s + row[a]! * r[i]!, 0));
    let improved = false;
    for (let tries = 0; tries < 10; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)));
      const delta = solve(A, Jtr.map((v) => -v));
      const xn = x.map((v, i) => v + delta[i]!);
      const rn = residuals(toParams(xn));
      const cn = sumsq(rn);
      if (cn < cost) {
        const gain = (cost - cn) / cost;
        x = xn;
        r = rn;
        cost = cn;
        lambda = Math.max(lambda / 3, 1e-9);
        improved = true;
        if (gain < 1e-10) iter = 1e9; // converged
        break;
      }
      lambda *= 4;
    }
    if (!improved) break;
  }

  const p = toParams(x);
  const rms = Math.sqrt(cost / r.length);
  return { ...p, qts: (p.qms * p.qes) / (p.qms + p.qes), rmsError: rms, range: [lo, hi], usedPhase };
}

/**
 * Added-mass method: fs drops from fs to fsMass when mass_g is stuck to the cone.
 * Returns Mms (g), Cms (mm/N) and, if Sd is known, Vas (L).
 */
export function addedMassResult(fs: number, fsMass: number, mass_g: number, sd_cm2?: number, air: Air = STANDARD_AIR) {
  const ratio = (fs / fsMass) ** 2;
  if (!(ratio > 1.02)) throw new Error("The added mass barely moved fs; use more mass (aim for a 20–30 % drop)");
  const mms = mass_g / 1000 / (ratio - 1); // kg
  const cms = 1 / ((2 * Math.PI * fs) ** 2 * mms); // m/N
  const sd = sd_cm2 !== undefined ? sd_cm2 / 1e4 : undefined;
  return {
    mms_g: mms * 1000,
    cms_mm_per_n: cms * 1000,
    vas_l: sd !== undefined ? cms * air.rho * air.c * air.c * sd * sd * 1000 : undefined,
  };
}

/** Phase-aware complex value of a measured point (for plotting fitted vs measured). */
export function impedanceMagnitude(p: ImpedanceParams, f: number): number {
  return abs(driverImpedance(p, f));
}

/** Measured magnitude at arbitrary frequencies (linear interpolation in log-f), NaN outside the sweep. */
export function resampleMagnitude(d: ImpedanceData, freqs: ArrayLike<number>): Float64Array {
  const out = new Float64Array(freqs.length);
  const lf = d.freq.map(Math.log);
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i]!;
    out[i] = f < d.freq[0]! || f > d.freq[d.freq.length - 1]! ? NaN : interp(lf, d.mag, Math.log(f));
  }
  return out;
}

/** Measured points in [lo, hi], thinned to at most ~maxPts, as complex values when phase is known. */
function pointsIn(d: ImpedanceData, lo: number, hi: number, maxPts = 400) {
  const idx: number[] = [];
  for (let i = 0; i < d.freq.length; i++) if (d.freq[i]! >= lo && d.freq[i]! <= hi) idx.push(i);
  const step = Math.max(1, Math.floor(idx.length / maxPts));
  return idx
    .filter((_, k) => k % step === 0)
    .map((i) => {
      const m = d.mag[i]!;
      const ph = d.phase ? (d.phase[i]! * Math.PI) / 180 : 0;
      return { f: d.freq[i]!, z: cx(m * Math.cos(ph), m * Math.sin(ph)), m };
    });
}

/**
 * L2R2 fit over the whole sweep (from fs/4 up to 20 kHz or the end of the data).
 * Starts from the plain-Le fit around the resonance, then frees L2 and R2.
 */
function fitLr2(d: ImpedanceData, reDc: number | undefined, holdTs: boolean): FitResult {
  const base = fitImpedance(d, reDc);
  const lo = Math.max(d.freq[0]!, base.fs / 4);
  const hi = Math.min(d.freq[d.freq.length - 1]!, 20000);
  const meas = pointsIn(d, lo, hi);
  const usedPhase = d.phase !== null;
  const names = ["re", "fs", "qms", "qes", "le_mh", "l2_mh", "r2_ohm"] as const;
  const held = new Set<string>(holdTs ? ["fs", "qms", "qes"] : []);
  if (reDc !== undefined) held.add("re");
  const free = names.filter((n) => !held.has(n));
  const start: Required<ImpedanceParams> = { ...base, le_mh: base.le_mh * 0.5, l2_mh: base.le_mh, r2_ohm: 3 * base.re };
  const toParams = (x: number[]): Required<ImpedanceParams> => {
    const p = { ...start };
    free.forEach((n, i) => (p[n] = Math.exp(x[i]!)));
    return p;
  };
  const residualsOf = (x: number[]) => {
    const p = toParams(x);
    const r: number[] = [];
    for (const { f, z, m } of meas) {
      const zm = driverImpedance(p, f);
      if (usedPhase) r.push((zm.re - z.re) / m, (zm.im - z.im) / m);
      else r.push(Math.log(abs(zm) / m));
    }
    return r;
  };
  // Try a few starting points for L2/R2: the fit has local minima.
  let best: { x: number[]; r: number[]; cost: number } | null = null;
  for (const [leK, l2K, r2K] of [
    [0.5, 1, 3],
    [0.8, 2, 1],
    [0.3, 3, 8],
  ] as const) {
    const s0 = { ...start, le_mh: base.le_mh * leK, l2_mh: base.le_mh * l2K, r2_ohm: base.re * r2K };
    const x0 = free.map((n) => Math.log(s0[n]));
    const res = levenbergMarquardt(x0, residualsOf);
    if (!best || res.cost < best.cost) best = res;
  }
  const p = toParams(best!.x);
  const rms = Math.sqrt(best!.cost / best!.r.length);
  return { ...p, qts: (p.qms * p.qes) / (p.qms + p.qes), rmsError: rms, range: [lo, hi], usedPhase };
}

/** RMS relative error of a parameter set against a sweep over [lo, hi] (for comparing models). */
export function impedanceFitError(d: ImpedanceData, p: ImpedanceParams, lo: number, hi: number): number {
  const meas = pointsIn(d, lo, hi);
  let s = 0;
  for (const { f, m } of meas) s += Math.log(abs(driverImpedance(p, f)) / m) ** 2;
  return Math.sqrt(s / meas.length);
}
