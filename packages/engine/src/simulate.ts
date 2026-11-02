import { abs, add, arg, cx, div, mul, parallel, scale, type Complex } from "./complex.ts";
import { RHO } from "./constants.ts";
import {
  boxCompliance,
  DEFAULT_END_CORRECTION,
  DEFAULT_LOSSES,
  driverModel,
  passiveRadiatorModel,
  portAcousticMass,
  portArea,
  prFb,
  ventedFb,
  type DriverInput,
  type EnclosureInput,
} from "./model.ts";

/**
 * Lumped-element simulation of a driver (or N identical drivers) in a box.
 *
 * Everything is referred to the acoustic side (impedance analogy):
 *
 *   Pg ──[ Z_AE + Z_AS ]──┬─────────────┬──────────────┬───────────────┐
 *                         │             │              │               │
 *                     R_AB + C_AB      R_AL     ports or PRs      (other drivers)
 *                     (box air)      (leakage)   (parallel)
 *
 *   Pg   = V·Bl / (Ze·Sd)            source pressure
 *   Z_AE = Bl² / (Sd²·Ze)            electrical damping
 *   Z_AS = (Rms + jωMms + 1/jωCms)/Sd²
 *
 * Radiated volume velocity is the air that leaves the box system, which equals
 * minus the flow into the box air spring: U0 = −P_box / Z_box-air.
 */

export type PowerConvention = "re" | "nominal" | "volts";

export interface SimulationOptions {
  /** Input power in watts (or volts if convention is "volts"). Default 1. */
  power?: number;
  /** How power is turned into voltage. "re": V = √(P·Re) like WinISD (default). */
  convention?: PowerConvention;
  /** Nominal impedance used by the "nominal" convention (Ω). */
  nominalOhms?: number;
  /** Number of identical drivers sharing the box. Default 1. */
  drivers?: number;
  wiring?: "parallel" | "series";
  fMin?: number;
  fMax?: number;
  points?: number;
  distance_m?: number;
  /** "half" = 2π (infinite baffle / on the floor), "full" = 4π. Default half, like WinISD. */
  space?: "half" | "full";
  /** Port air velocity limit (m/s, peak) used for the max-SPL curve. Default 17. */
  portVelocityLimit?: number;
}

export interface SimulationResult {
  freq: Float64Array;
  /** Sound pressure level (dB SPL) at the given input power and distance. */
  spl: Float64Array;
  phaseDeg: Float64Array;
  groupDelayMs: Float64Array;
  /** Peak one-way cone excursion per driver (mm). */
  excursionMm: Float64Array;
  /** Peak one-way excursion per passive radiator (mm), PR designs only. */
  prExcursionMm: Float64Array | null;
  /** Peak air velocity per port (m/s), vented designs only. */
  portVelocity: Float64Array | null;
  impedanceOhm: Float64Array;
  impedancePhaseDeg: Float64Array;
  /** Highest input power (W) before any limit is reached, per frequency. */
  maxPowerW: Float64Array;
  /** SPL at maxPowerW. */
  maxSpl: Float64Array;
  /** Which limit sets maxPower at each frequency. */
  limitedBy: ("thermal" | "xmax" | "pr-xmax" | "port" | "none")[];
  summary: {
    volts: number;
    /** Passband SPL of the mass-controlled region (ignores Le). */
    referenceSpl: number;
    f3: number | null;
    f6: number | null;
    fb?: number;
    fc?: number;
    qtc?: number;
  };
}

export function logFrequencies(fMin: number, fMax: number, points: number): Float64Array {
  const f = new Float64Array(points);
  if (points === 1) {
    f[0] = fMin;
    return f;
  }
  const r = Math.log(fMax / fMin);
  for (let i = 0; i < points; i++) f[i] = fMin * Math.exp((r * i) / (points - 1));
  return f;
}

const finiteOr = (v: number | undefined, d: number) => (v === undefined ? d : v);

export function simulate(driverIn: DriverInput, box: EnclosureInput, opts: SimulationOptions = {}): SimulationResult {
  const d = driverModel(driverIn);
  const n = opts.drivers ?? 1;
  const wiring = opts.wiring ?? "parallel";
  const power = opts.power ?? 1;
  const r = opts.distance_m ?? 1;
  const space = opts.space === "full" ? 4 : 2;
  const vLimit = opts.portVelocityLimit ?? 17;

  // Voltage at the terminals of the whole driver bank, and per driver.
  const reTotal = wiring === "parallel" ? d.re / n : d.re * n;
  const nominalTotal =
    opts.nominalOhms !== undefined ? (wiring === "parallel" ? opts.nominalOhms / n : opts.nominalOhms * n) : reTotal;
  const volts =
    opts.convention === "volts"
      ? power
      : Math.sqrt(power * (opts.convention === "nominal" ? nominalTotal : reTotal));
  const vDriver = wiring === "parallel" ? volts : volts / n;

  // Box elements
  const cab = boxCompliance(box.vb_l);
  const ql = finiteOr(box.ql, DEFAULT_LOSSES.ql);
  const qa = finiteOr(box.qa, DEFAULT_LOSSES.qa);

  // Reference frequency for the loss Qs, and branch impedance builders.
  let fRef: number;
  let ventZ: ((w: number) => Complex) | null = null; // total of all ports / PRs in parallel
  let ventCount = 1;
  let ventArea = 0;
  let prXmax: number | null = null;
  const summary: SimulationResult["summary"] = { volts, referenceSpl: 0, f3: null, f6: null };

  if (box.kind === "sealed") {
    const alpha = (d.cms * d.sd * d.sd) / cab;
    fRef = (1 / (2 * Math.PI * Math.sqrt(d.mms * d.cms))) * Math.sqrt(1 + n * alpha);
    summary.fc = fRef;
    const qts = (driverIn.qms * driverIn.qes) / (driverIn.qms + driverIn.qes);
    summary.qtc = qts * Math.sqrt(1 + n * alpha);
  } else if (box.kind === "vented") {
    ventCount = box.portCount ?? 1;
    const ec = box.endCorrection ?? DEFAULT_END_CORRECTION;
    fRef = ventedFb(box.vb_l, box.port, ventCount, ec);
    summary.fb = fRef;
    const map = portAcousticMass(box.port, ec);
    const qp = finiteOr(box.qp, DEFAULT_LOSSES.qp);
    const rap = Number.isFinite(qp) ? (2 * Math.PI * fRef * map) / qp : 0;
    ventArea = portArea(box.port);
    ventZ = (w) => scale(cx(rap, w * map), 1 / ventCount);
  } else {
    ventCount = box.prCount ?? 1;
    const pr = passiveRadiatorModel(box.pr, box.addedMass_g ?? 0);
    fRef = prFb(box.vb_l, box.pr, ventCount, box.addedMass_g ?? 0);
    summary.fb = fRef;
    ventArea = pr.sd;
    prXmax = pr.xmax;
    const s2 = pr.sd * pr.sd;
    ventZ = (w) => scale(cx(pr.rmp / s2, (w * pr.mmp - 1 / (w * pr.cmp)) / s2), 1 / ventCount);
  }

  const wRef = 2 * Math.PI * fRef;
  const ral = Number.isFinite(ql) ? ql / (wRef * cab) : Infinity;
  const rab = Number.isFinite(qa) ? 1 / (qa * wRef * cab) : 0;

  const freq = logFrequencies(opts.fMin ?? 10, opts.fMax ?? 500, opts.points ?? 400);
  const N = freq.length;
  const out = {
    spl: new Float64Array(N),
    phase: new Float64Array(N),
    gd: new Float64Array(N),
    x: new Float64Array(N),
    xpr: box.kind === "passive-radiator" ? new Float64Array(N) : null,
    vport: box.kind === "vented" ? new Float64Array(N) : null,
    zmag: new Float64Array(N),
    zph: new Float64Array(N),
    pmax: new Float64Array(N),
    splmax: new Float64Array(N),
  };
  const limitedBy: SimulationResult["limitedBy"] = [];
  const unwrapped = new Float64Array(N);
  const sd2 = d.sd * d.sd;

  for (let i = 0; i < N; i++) {
    const f = freq[i]!;
    const w = 2 * Math.PI * f;

    const ze = cx(d.re, w * d.le);
    const pg = div(cx((vDriver * d.bl) / d.sd), ze);
    const zae = div(cx((d.bl * d.bl) / sd2), ze);
    const zas = cx(d.rms / sd2, (w * d.mms - 1 / (w * d.cms)) / sd2);

    const zAir = cx(rab, -1 / (w * cab));
    const zLeak = Number.isFinite(ral) ? cx(ral) : null;
    const zVent = ventZ ? ventZ(w) : null;
    const zLoad = parallel(zAir, zLeak, zVent)!;

    // N identical drivers into one load: each driver sees N × the load impedance.
    const zMech = add(zas, scale(zLoad, n)); // per driver, acoustic units
    const ui = div(pg, add(zae, zMech));
    const ud = scale(ui, n);
    const pBox = mul(ud, zLoad);

    // Radiated volume velocity = −(flow into the box air spring).
    const u0 = scale(div(pBox, zAir), -1);
    // Far-field pressure (RMS): p = jωρ·U0 / (k·π·r)
    const p = mul(cx(0, (w * RHO) / (space * Math.PI * r)), u0);
    out.spl[i] = 20 * Math.log10(abs(p) / 2e-5);
    unwrapped[i] = arg(p);

    // Excursion (peak, one way) = √2·|U|/(Sd·ω)
    const x = (Math.SQRT2 * abs(ui)) / (d.sd * w);
    out.x[i] = x * 1000;

    let xpr = 0;
    let vport = 0;
    if (zVent) {
      const uVentEach = scale(div(pBox, zVent), 1 / ventCount);
      if (out.xpr) {
        xpr = (Math.SQRT2 * abs(uVentEach)) / (ventArea * w);
        out.xpr[i] = xpr * 1000;
      }
      if (out.vport) {
        vport = (Math.SQRT2 * abs(uVentEach)) / ventArea;
        out.vport[i] = vport;
      }
    }

    // Electrical input impedance of the whole bank
    const zDriver = add(ze, div(cx((d.bl * d.bl) / sd2), zMech));
    const zIn = wiring === "parallel" ? scale(zDriver, 1 / n) : scale(zDriver, n);
    out.zmag[i] = abs(zIn);
    out.zph[i] = (arg(zIn) * 180) / Math.PI;

    // Power limits: SPL ∝ V², excursion and velocity ∝ V.
    const limits: [SimulationResult["limitedBy"][number], number][] = [];
    if (d.pe !== null) limits.push(["thermal", d.pe * n]);
    if (d.xmax !== null) limits.push(["xmax", power * (d.xmax / x) ** 2]);
    if (prXmax !== null && xpr > 0) limits.push(["pr-xmax", power * (prXmax / xpr) ** 2]);
    if (out.vport && vport > 0) limits.push(["port", power * (vLimit / vport) ** 2]);
    let best: [SimulationResult["limitedBy"][number], number] = ["none", Infinity];
    for (const l of limits) if (l[1] < best[1]) best = l;
    limitedBy.push(best[0]);
    out.pmax[i] = best[1];
    out.splmax[i] = Number.isFinite(best[1]) ? out.spl[i]! + 10 * Math.log10(best[1] / power) : NaN;
  }

  // Phase unwrap and group delay
  for (let i = 1; i < N; i++) {
    let dphi = unwrapped[i]! - unwrapped[i - 1]!;
    while (dphi > Math.PI) dphi -= 2 * Math.PI;
    while (dphi < -Math.PI) dphi += 2 * Math.PI;
    unwrapped[i] = unwrapped[i - 1]! + dphi;
  }
  for (let i = 0; i < N; i++) {
    out.phase[i] = (((unwrapped[i]! * 180) / Math.PI + 180) % 360 + 360) % 360 - 180;
    const a = Math.max(0, i - 1);
    const b = Math.min(N - 1, i + 1);
    const dw = 2 * Math.PI * (freq[b]! - freq[a]!);
    out.gd[i] = (-(unwrapped[b]! - unwrapped[a]!) / dw) * 1000;
  }

  // Passband reference: mass-controlled asymptote  p = ρ·N·V·Bl·Sd / (Re·Mms·k·π·r)
  const pRef = (RHO * n * vDriver * d.bl * d.sd) / (d.re * d.mms * space * Math.PI * r);
  summary.referenceSpl = 20 * Math.log10(pRef / 2e-5);
  summary.f3 = crossing(freq, out.spl, summary.referenceSpl - 3);
  summary.f6 = crossing(freq, out.spl, summary.referenceSpl - 6);

  return {
    freq,
    spl: out.spl,
    phaseDeg: out.phase,
    groupDelayMs: out.gd,
    excursionMm: out.x,
    prExcursionMm: out.xpr,
    portVelocity: out.vport,
    impedanceOhm: out.zmag,
    impedancePhaseDeg: out.zph,
    maxPowerW: out.pmax,
    maxSpl: out.splmax,
    limitedBy,
    summary,
  };
}

/**
 * Walking down from the loudest point, the frequency where the response first
 * falls below `level` (log-interpolated). Null if it never reaches `level`.
 * Starting at the peak keeps voice-coil inductance roll-off at the top from
 * hiding the bass corner.
 */
function crossing(freq: Float64Array, spl: Float64Array, level: number): number | null {
  let i = 0;
  for (let k = 1; k < spl.length; k++) if (spl[k]! > spl[i]!) i = k;
  if (spl[i]! < level) return null;
  while (i > 0 && spl[i - 1]! >= level) i--;
  if (i === 0) return freq[0]!;
  const f1 = Math.log(freq[i - 1]!);
  const f2 = Math.log(freq[i]!);
  const t = (level - spl[i - 1]!) / (spl[i]! - spl[i - 1]!);
  return Math.exp(f1 + t * (f2 - f1));
}

