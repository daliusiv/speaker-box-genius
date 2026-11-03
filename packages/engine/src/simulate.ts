import { abs, add, arg, cx, div, inv, mul, parallel, scale, sub, type Complex } from "./complex.ts";
import { STANDARD_AIR, type Air } from "./constants.ts";
import { eqResponse, highPassResponse, type EqStage, type HighPass } from "./filters.ts";
import {
  boxCompliance,
  DEFAULT_END_CORRECTION,
  DEFAULT_LOSSES,
  driverModel,
  passiveRadiatorModel,
  portAcousticMass,
  portArea,
  prFb,
  prGroupsFb,
  ventedFb,
  type BandpassChamber,
  type PassiveRadiatorModel,
  type PrGroup,
  type BandpassInput,
  type DriverInput,
  type EnclosureInput,
  type PortInput,
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
  /** Electrical high-pass filter ahead of the amplifier (e.g. a subsonic filter). */
  highPass?: HighPass | null;
  /** EQ stages (Linkwitz Transform, peaking, shelving) ahead of the amplifier. */
  eq?: EqStage[];
  /** Air properties. Default: 20 °C. Use WINISD_AIR to match WinISD exactly. */
  air?: Air;
  /** Amplifier output + cable resistance (Ω), shared by the whole driver bank. Default 0. */
  rg?: number;
  /**
   * Isobaric (compound) loading: each "driver" is a pair of identical drivers
   * working as one (twice the moving mass, half the compliance, same Sd), with the
   * two voice coils in series or in parallel. `drivers` then counts pairs.
   */
  isobaric?: { coils: "series" | "parallel" } | null;
}

/** The single equivalent driver of an isobaric pair. */
export function isobaricPair(d: ReturnType<typeof driverModel>, coils: "series" | "parallel"): ReturnType<typeof driverModel> {
  const k = coils === "series" ? 2 : 0.5;
  return {
    ...d,
    re: d.re * k,
    le: d.le * k,
    bl: coils === "series" ? d.bl * 2 : d.bl,
    mms: d.mms * 2,
    cms: d.cms / 2,
    rms: d.rms * 2,
    pe: d.pe === null ? null : d.pe * 2,
  };
}

export interface SimulationResult {
  freq: Float64Array;
  /** Sound pressure level (dB SPL) at the given input power and distance. */
  spl: Float64Array;
  phaseDeg: Float64Array;
  groupDelayMs: Float64Array;
  /** Peak one-way cone excursion per driver (mm). */
  excursionMm: Float64Array;
  /** Peak one-way excursion per passive radiator (mm), PR designs only. With mixed PRs: the first group. */
  prExcursionMm: Float64Array | null;
  /** PR designs: excursion of each group of identical PRs, with its Xmax (mm). Group 0 = prExcursionMm. */
  prGroups: { excursionMm: Float64Array; xmax_mm: number | null; chamber?: "front" | "rear" }[] | null;
  /** Peak air velocity per port (m/s), vented designs only. For bandpass: the front chamber's port (null if it has PRs). */
  portVelocity: Float64Array | null;
  /** Bandpass only: peak air velocity in the rear chamber's port (to the outside, or into the front chamber). */
  rearPortVelocity: Float64Array | null;
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
    /** Bandpass: upper −3 dB point. */
    f3High?: number | null;
    fb?: number;
    /** Bandpass: tuning of the rear chamber's port (6th order). */
    fbRear?: number;
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
  const air = opts.air ?? STANDARD_AIR;
  const base = driverModel(driverIn, air);
  const d = opts.isobaric ? isobaricPair(base, opts.isobaric.coils) : base;
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
  // A source resistance shared by N parallel drivers looks like N·Rg to each one (Rg/N in series).
  const rgTotal = opts.rg ?? 0;
  const rgDriver = wiring === "parallel" ? rgTotal * n : rgTotal / n;

  // Box elements
  const summary: SimulationResult["summary"] = { volts, referenceSpl: 0, f3: null, f6: null };
  const bp = box.kind === "bandpass" ? bandpassNetwork(box, d, n, air, summary) : null;
  const single = box.kind === "bandpass" ? null : box;
  const cab = single ? boxCompliance(single.vb_l, air) : 0;
  const ql = finiteOr(single?.ql, DEFAULT_LOSSES.ql);
  const qa = finiteOr(single?.qa, DEFAULT_LOSSES.qa);

  // Reference frequency for the loss Qs, and branch impedance builders.
  let fRef = 1;
  let ventZ: ((w: number) => Complex) | null = null; // total of all ports / PRs in parallel
  let ventCount = 1;
  let ventArea = 0;
  let prXmax: number | null = null;
  let prModels: { m: PassiveRadiatorModel; count: number; z: (w: number) => Complex }[] | null = null;

  if (!single) {
    // bandpass: handled by `bp`
  } else if (single.kind === "sealed") {
    const alpha = (d.cms * d.sd * d.sd) / cab;
    fRef = (1 / (2 * Math.PI * Math.sqrt(d.mms * d.cms))) * Math.sqrt(1 + n * alpha);
    summary.fc = fRef;
    const qts = (driverIn.qms * driverIn.qes) / (driverIn.qms + driverIn.qes);
    summary.qtc = qts * Math.sqrt(1 + n * alpha);
  } else if (single.kind === "vented") {
    ventCount = single.portCount ?? 1;
    const ec = single.endCorrection ?? DEFAULT_END_CORRECTION;
    fRef = ventedFb(single.vb_l, single.port, ventCount, ec, air);
    summary.fb = fRef;
    const map = portAcousticMass(single.port, ec, air);
    const qp = finiteOr(single.qp, DEFAULT_LOSSES.qp);
    const rap = Number.isFinite(qp) ? (2 * Math.PI * fRef * map) / qp : 0;
    ventArea = portArea(single.port);
    ventZ = (w) => scale(cx(rap, w * map), 1 / ventCount);
  } else {
    const groups: PrGroup[] = [
      { pr: single.pr, count: single.prCount ?? 1, addedMass_g: single.addedMass_g ?? 0 },
      ...(single.extraPrs ?? []),
    ];
    fRef = groups.length === 1 ? prFb(single.vb_l, single.pr, groups[0]!.count, groups[0]!.addedMass_g, air) : prGroupsFb(single.vb_l, groups, air);
    summary.fb = fRef;
    prModels = groups.map((g) => {
      const m = passiveRadiatorModel(g.pr, g.addedMass_g ?? 0, air);
      const s2 = m.sd * m.sd;
      // Branch impedance of the whole group (count identical PRs in parallel).
      return { m, count: g.count, z: (w: number) => scale(cx(m.rmp / s2, (w * m.mmp - 1 / (w * m.cmp)) / s2), 1 / g.count) };
    });
    ventCount = groups[0]!.count;
    ventArea = prModels[0]!.m.sd;
    prXmax = prModels[0]!.m.xmax;
    ventZ = (w) => parallel(...prModels!.map((g) => g.z(w)))!;
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
    xpr: box.kind === "passive-radiator" || (bp && bp.frontPrs.length + bp.rearPrs.length > 0) ? new Float64Array(N) : null,
    xprGroups: prModels
      ? prModels.map(() => new Float64Array(N))
      : bp && bp.frontPrs.length + bp.rearPrs.length > 0
        ? [...bp.frontPrs, ...bp.rearPrs].map(() => new Float64Array(N))
        : null,
    vport: box.kind === "vented" || bp?.front ? new Float64Array(N) : null,
    vport2: bp?.rear ? new Float64Array(N) : null,
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

    const ze = cx(d.re + rgDriver, w * d.le);
    let filter = opts.highPass ? highPassResponse(opts.highPass, f) : cx(1);
    if (opts.eq && opts.eq.length > 0) filter = mul(filter, eqResponse(opts.eq, f));
    const filterGain2 = filter.re * filter.re + filter.im * filter.im;
    const pg = div(mul(filter, cx((vDriver * d.bl) / d.sd)), ze);
    const zae = div(cx((d.bl * d.bl) / sd2), ze);
    const zas = cx(d.rms / sd2, (w * d.mms - 1 / (w * d.cms)) / sd2);

    let zLoad: Complex;
    let ui: Complex;
    let u0: Complex;
    let zMech: Complex;
    let xpr = 0;
    let vport = 0;
    let prLimitPower = Infinity;
    if (bp) {
      const unit = bp.solve(w); // chamber pressures for unit total cone volume velocity
      zLoad = sub(unit.pF, unit.pR);
      zMech = add(zas, scale(zLoad, n));
      ui = div(pg, add(zae, zMech));
      const ud = scale(ui, n);
      const flows = bp.flows(w, scale(unit.pF, 1), scale(unit.pR, 1));
      u0 = mul(ud, flows.radiated);
      if (bp.front && out.vport) {
        const vF = abs(mul(ud, flows.frontPortEach)) * Math.SQRT2 / bp.front.area;
        out.vport[i] = vF;
        vport = vF;
      }
      if (bp.rear && out.vport2) {
        const vR = abs(mul(ud, flows.rearPortEach)) * Math.SQRT2 / bp.rear.area;
        out.vport2[i] = vR;
        vport = Math.max(vport, vR);
      }
      if (out.xprGroups) {
        const groups = [...bp.frontPrs, ...bp.rearPrs];
        const each = [...flows.frontPrEach, ...flows.rearPrEach];
        groups.forEach((g, k) => {
          const xk = (Math.SQRT2 * abs(mul(ud, each[k]!))) / (g.m.sd * w);
          out.xprGroups![k]![i] = xk * 1000;
          if (g.m.xmax !== null && xk > 0) prLimitPower = Math.min(prLimitPower, power * (g.m.xmax / xk) ** 2);
        });
        out.xpr![i] = out.xprGroups[0]![i]!;
      }
    } else {
      const zAir = cx(rab, -1 / (w * cab));
      const zLeak = Number.isFinite(ral) ? cx(ral) : null;
      const zVent = ventZ ? ventZ(w) : null;
      zLoad = parallel(zAir, zLeak, zVent)!;

      // N identical drivers into one load: each driver sees N × the load impedance.
      zMech = add(zas, scale(zLoad, n)); // per driver, acoustic units
      ui = div(pg, add(zae, zMech));
      const ud = scale(ui, n);
      const pBox = mul(ud, zLoad);

      // Radiated volume velocity = −(flow into the box air spring).
      u0 = scale(div(pBox, zAir), -1);

      if (prModels && out.xprGroups) {
        // Each group sees the box pressure; flow per PR = p / (group impedance × count).
        prModels.forEach((g, k) => {
          const uEach = scale(div(pBox, g.z(w)), 1 / g.count);
          const xk = (Math.SQRT2 * abs(uEach)) / (g.m.sd * w);
          out.xprGroups![k]![i] = xk * 1000;
          if (g.m.xmax !== null && xk > 0) prLimitPower = Math.min(prLimitPower, power * (g.m.xmax / xk) ** 2);
        });
        xpr = out.xprGroups[0]![i]! / 1000;
        out.xpr![i] = out.xprGroups[0]![i]!;
      } else if (zVent) {
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
    }
    // Far-field pressure (RMS): p = jωρ·U0 / (k·π·r)
    const p = mul(cx(0, (w * air.rho) / (space * Math.PI * r)), u0);
    out.spl[i] = 20 * Math.log10(abs(p) / 2e-5);
    unwrapped[i] = arg(p);

    // Excursion (peak, one way) = √2·|U|/(Sd·ω)
    const x = (Math.SQRT2 * abs(ui)) / (d.sd * w);
    out.x[i] = x * 1000;

    // Electrical input impedance of the whole bank
    const zDriver = add(cx(d.re, w * d.le), div(cx((d.bl * d.bl) / sd2), zMech));
    const zIn = wiring === "parallel" ? scale(zDriver, 1 / n) : scale(zDriver, n);
    out.zmag[i] = abs(zIn);
    out.zph[i] = (arg(zIn) * 180) / Math.PI;

    // Power limits: SPL ∝ V², excursion and velocity ∝ V.
    const limits: [SimulationResult["limitedBy"][number], number][] = [];
    // Thermal: the filter reduces the voltage reaching the coil at this frequency.
    if (d.pe !== null) limits.push(["thermal", (d.pe * n) / Math.max(filterGain2, 1e-12)]);
    if (d.xmax !== null) limits.push(["xmax", power * (d.xmax / x) ** 2]);
    if (prModels || out.xprGroups) {
      if (Number.isFinite(prLimitPower)) limits.push(["pr-xmax", prLimitPower]);
    } else if (prXmax !== null && xpr > 0) limits.push(["pr-xmax", power * (prXmax / xpr) ** 2]);
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
  const pRef = (air.rho * n * vDriver * d.bl * d.sd) / ((d.re + rgDriver) * d.mms * space * Math.PI * r);
  summary.referenceSpl = 20 * Math.log10(pRef / 2e-5);
  summary.f3 = crossing(freq, out.spl, summary.referenceSpl - 3);
  summary.f6 = crossing(freq, out.spl, summary.referenceSpl - 6);
  if (bp) summary.f3High = crossingHigh(freq, out.spl, summary.referenceSpl - 3);

  return {
    freq,
    spl: out.spl,
    phaseDeg: out.phase,
    groupDelayMs: out.gd,
    excursionMm: out.x,
    prExcursionMm: out.xpr,
    prGroups: prModels
      ? prModels.map((g, k) => ({ excursionMm: out.xprGroups![k]!, xmax_mm: g.m.xmax === null ? null : g.m.xmax * 1000 }))
      : bp && out.xprGroups
        ? [
            ...bp.frontPrs.map((g) => ({ chamber: "front" as const, g })),
            ...bp.rearPrs.map((g) => ({ chamber: "rear" as const, g })),
          ].map(({ chamber, g }, k) => ({ chamber, excursionMm: out.xprGroups![k]!, xmax_mm: g.m.xmax === null ? null : g.m.xmax * 1000 }))
        : null,
    portVelocity: out.vport,
    rearPortVelocity: out.vport2,
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


/** Walking up from the loudest point, where the response first falls below `level`. */
function crossingHigh(freq: Float64Array, spl: Float64Array, level: number): number | null {
  let i = 0;
  for (let k = 1; k < spl.length; k++) if (spl[k]! > spl[i]!) i = k;
  if (spl[i]! < level) return null;
  while (i < spl.length - 1 && spl[i + 1]! >= level) i++;
  if (i === spl.length - 1) return null;
  const f1 = Math.log(freq[i]!);
  const f2 = Math.log(freq[i + 1]!);
  const t = (level - spl[i]!) / (spl[i + 1]! - spl[i]!);
  return Math.exp(f1 + t * (f2 - f1));
}

interface ChamberElements {
  cab: number;
  /** Absorption resistance in series with the air spring. */
  rab: number;
  /** Leakage resistance to the outside (Infinity = none). */
  ral: number;
}

interface PortElements {
  map: number; // acoustic mass of one port
  rap: number; // loss resistance of one port
  count: number;
  area: number; // m², one port
}

/**
 * Two-chamber network for bandpass boxes, solved by nodal analysis with the
 * outside air as reference. The driver bank pushes volume velocity U from the
 * rear chamber into the front one; each chamber has an air spring (with
 * absorption), leakage to the outside and optional ports.
 */
/** A bandpass chamber's opening: a port, or groups of passive radiators. */
type Vent =
  | { kind: "port"; port: PortElements }
  | { kind: "pr"; groups: { m: PassiveRadiatorModel; count: number }[] };

function bandpassNetwork(
  box: BandpassInput,
  d: ReturnType<typeof driverModel>,
  n: number,
  air: Air,
  summary: SimulationResult["summary"],
) {
  const ec = box.endCorrection ?? DEFAULT_END_CORRECTION;
  const series = box.rearPortTo === "front";
  const portOf = (p: PortInput, count: number, fRef: number, qp: number): PortElements => {
    const map = portAcousticMass(p, ec, air);
    return { map, rap: Number.isFinite(qp) ? (2 * Math.PI * fRef * map) / qp : 0, count, area: portArea(p) };
  };
  const hasPrs = (c: BandpassChamber) => (c.prs?.length ?? 0) > 0;
  /** Tuning of a chamber's opening: Helmholtz for a port, PR mass against the air spring for PRs. */
  const tuningOf = (c: BandpassChamber) =>
    hasPrs(c)
      ? c.prs!.length === 1
        ? prFb(c.vb_l, c.prs![0]!.pr, c.prs![0]!.count, c.prs![0]!.addedMass_g ?? 0, air)
        : prGroupsFb(c.vb_l, c.prs!, air)
      : ventedFb(c.vb_l, c.port!, c.portCount ?? 1, ec, air);
  const ventOf = (c: BandpassChamber, fRef: number): Vent =>
    hasPrs(c)
      ? { kind: "pr", groups: c.prs!.map((g) => ({ m: passiveRadiatorModel(g.pr, g.addedMass_g ?? 0, air), count: g.count })) }
      : { kind: "port", port: portOf(c.port!, c.portCount ?? 1, fRef, finiteOr(c.qp, DEFAULT_LOSSES.qp)) };
  const chamberOf = (c: BandpassChamber, fRef: number): ChamberElements => {
    const cab = boxCompliance(c.vb_l, air);
    const w = 2 * Math.PI * fRef;
    const ql = finiteOr(c.ql, DEFAULT_LOSSES.ql);
    const qa = finiteOr(c.qa, DEFAULT_LOSSES.qa);
    return {
      cab,
      rab: Number.isFinite(qa) ? 1 / (qa * w * cab) : 0,
      ral: Number.isFinite(ql) ? ql / (w * cab) : Infinity,
    };
  };

  if (!box.front.port && !hasPrs(box.front)) throw new Error("A bandpass front chamber needs a port or passive radiators");

  // Tunings: each chamber with its own opening. A closed rear chamber is referred to
  // the driver's resonance in that volume (like a sealed box's fc).
  const fFront = tuningOf(box.front);
  summary.fb = fFront;
  const rearOpen = !!box.rear.port || hasPrs(box.rear);
  let fRear: number;
  if (rearOpen) {
    fRear = tuningOf(box.rear);
    summary.fbRear = fRear;
  } else {
    const alpha = (d.cms * d.sd * d.sd) / boxCompliance(box.rear.vb_l, air);
    fRear = (1 / (2 * Math.PI * Math.sqrt(d.mms * d.cms))) * Math.sqrt(1 + n * alpha);
    summary.fc = fRear;
  }

  const F = chamberOf(box.front, fFront);
  const R = chamberOf(box.rear, fRear);
  const frontVent = ventOf(box.front, fFront);
  const rearVent = rearOpen ? ventOf(box.rear, fRear) : null;

  // Leakage between the chambers, referred to the driver like WinISD's Qiclfr:
  // R = Q / (ωs·Cas), with ωs the free-air resonance and Cas = Cms·Sd².
  const qicl = finiteOr(box.qicl, 100);
  const ricl = Number.isFinite(qicl) ? (qicl * Math.sqrt(d.mms * d.cms)) / (d.cms * d.sd * d.sd) : Infinity;
  const yIcl = Number.isFinite(ricl) ? cx(1 / ricl) : cx(0);

  /** Acoustic impedance of one PR (mass, suspension and damping referred to its Sd). */
  const zPrEach = (m: PassiveRadiatorModel, w: number) => {
    const s2 = m.sd * m.sd;
    return cx(m.rmp / s2, (w * m.mmp - 1 / (w * m.cmp)) / s2);
  };
  const zVentTotal = (v: Vent, w: number): Complex =>
    v.kind === "port"
      ? scale(cx(v.port.rap, w * v.port.map), 1 / v.port.count)
      : parallel(...v.groups.map((g) => scale(zPrEach(g.m, w), 1 / g.count)))!;
  const zAirOf = (c: ChamberElements, w: number) => cx(c.rab, -1 / (w * c.cab));
  const yChamber = (c: ChamberElements, w: number) => {
    let y = inv(zAirOf(c, w));
    if (Number.isFinite(c.ral)) y = add(y, cx(1 / c.ral));
    return y;
  };

  /** Per-element flows through a vent for a pressure difference dp: per port, or per PR of each group. */
  const ventFlows = (v: Vent, dp: Complex, w: number) =>
    v.kind === "port"
      ? { port: scale(div(dp, zVentTotal(v, w)), 1 / v.port.count), prs: [] as Complex[] }
      : { port: cx(0), prs: v.groups.map((g) => div(dp, zPrEach(g.m, w))) };

  return {
    /** The port of each chamber (null when that chamber has PRs or is closed). */
    front: frontVent.kind === "port" ? frontVent.port : null,
    rear: rearVent?.kind === "port" ? rearVent.port : null,
    /** PR groups of each chamber (empty when it has a port or is closed). */
    frontPrs: frontVent.kind === "pr" ? frontVent.groups : [],
    rearPrs: rearVent?.kind === "pr" ? rearVent.groups : [],
    /** Chamber pressures for a unit total cone volume velocity (rear → front). */
    solve(w: number) {
      let yF = add(yChamber(F, w), inv(zVentTotal(frontVent, w)));
      let yR = yChamber(R, w);
      let yI = yIcl;
      if (rearVent) {
        if (series) yI = add(yI, inv(zVentTotal(rearVent, w)));
        else yR = add(yR, inv(zVentTotal(rearVent, w)));
      }
      yF = add(yF, yI);
      yR = add(yR, yI);
      // [yF  −yI] [pF]   [ 1]
      // [−yI  yR] [pR] = [−1]
      const det = sub(mul(yF, yR), mul(yI, yI));
      const pF = div(sub(yR, yI), det);
      const pR = div(sub(yI, yF), det);
      return { pF, pR };
    },
    /** Flows (per unit cone volume velocity) given the unit chamber pressures. */
    flows(w: number, pF: Complex, pR: Complex) {
      // Air leaving the system = −(rate of compression of both air springs).
      const radiated = scale(add(div(pF, zAirOf(F, w)), div(pR, zAirOf(R, w))), -1);
      const f = ventFlows(frontVent, pF, w);
      const r = rearVent ? ventFlows(rearVent, series ? sub(pR, pF) : pR, w) : { port: cx(0), prs: [] as Complex[] };
      return { radiated, frontPortEach: f.port, rearPortEach: r.port, frontPrEach: f.prs, rearPrEach: r.prs };
    },
  };
}
