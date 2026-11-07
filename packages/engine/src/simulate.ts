import { abs, add, arg, cx, div, inv, mul, parallel, scale, sub, type Complex } from "./complex.ts";
import { passiveActive, passiveBankGain, passiveInputImpedance, passiveThevenin, type PassiveNetwork } from "./passive.ts";
import { STANDARD_AIR, type Air } from "./constants.ts";
import { baffledPistonImpedance, lineNetwork, pistonPowerFactor, type LineInput } from "./line.ts";
import { eqResponse, highPassResponse, type EqStage, type HighPass } from "./filters.ts";
import {
  boxCompliance,
  DEFAULT_END_CORRECTION,
  DEFAULT_LOSSES,
  driverModel,
  passiveRadiatorModel,
  portAcousticMass,
  portArea,
  portEffectiveLength,
  portFlare,
  portLossCoefficient,
  portPipe,
  coilHeatFactor,
  suspensionImpedance,
  portMouthArea,
  prFb,
  prGroupsFb,
  ventedFb,
  voiceCoilImpedance,
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

/**
 * Tuning of a line from its impedance: the minimum between the first two peaks (like a
 * vented box's Fb), or the shoulder below the first peak when stuffing has damped the
 * lower peak away. Null if the curve shows neither in range.
 */
function lineTuning(freq: Float64Array, z: Float64Array): number | null {
  let i = 1;
  while (i < z.length - 1 && !(z[i]! >= z[i - 1]! && z[i]! > z[i + 1]!)) i++;
  if (i >= z.length - 1) return null;
  // Stuffing can damp the lower peak into a shoulder on the rising flank of the upper one:
  // then the tuning is the shoulder, where the impedance rises least steeply (log–log).
  const slope = (k: number) => Math.log(z[k + 1]! / z[k - 1]!) / Math.log(freq[k + 1]! / freq[k - 1]!);
  let before = -Infinity;
  for (let k = 1; k < i - 1; k++) {
    const sk = slope(k);
    if (k > 1 && before > 0.3 && sk < slope(k - 1) && sk <= slope(k + 1) && sk < 0.75 * before) {
      let after = -Infinity;
      for (let m = k + 1; m < i; m++) after = Math.max(after, slope(m));
      if (sk < 0.75 * after) return freq[k]!;
    }
    before = Math.max(before, sk);
  }
  let j = i + 1;
  while (j < z.length - 1 && !(z[j]! <= z[j - 1]! && z[j]! < z[j + 1]!)) j++;
  return j < z.length - 1 ? freq[j]! : null;
}

/** Dynamic viscosity of air at about 20 °C (Pa·s). */
const AIR_VISCOSITY = 1.81e-5;

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
  /** Exact frequencies (Hz, ascending, above 0) in place of the log sweep (fMin, fMax, points). */
  frequencies?: ArrayLike<number>;
  distance_m?: number;
  /** "half" = 2π (infinite baffle / on the floor), "full" = 4π. Default half, like WinISD. */
  space?: "half" | "full";
  /**
   * What the driver's power rating (Pe) is held against for the max-SPL curve: "nominal"
   * (default, like WinISD) V²/Re; "real" the real power the driver takes, V·I·cos φ (like
   * Hornresp), which is less than V²/Re wherever the impedance rises above Re.
   */
  thermalLimit?: "nominal" | "real";
  /** Amplifier limits for the max-SPL curve: RMS volts and amps at its output. */
  amp?: { volts?: number; amps?: number } | null;
  /** Port air velocity limit (m/s, peak) used for the max-SPL curve. Default 17. */
  portVelocityLimit?: number;
  /** Electrical high-pass filter ahead of the amplifier (e.g. a subsonic filter). */
  highPass?: HighPass | null;
  /** EQ stages (Linkwitz Transform, peaking, shelving) ahead of the amplifier. */
  eq?: EqStage[];
  /**
   * Lines and horns: "on-axis" (default) treats the cone and the mouth as point sources;
   * "power" scales each by the share of power a baffled piston of its size really radiates,
   * as Hornresp does. They differ once the mouth is large next to the wavelength.
   */
  splFrom?: "on-axis" | "power";
  /**
   * Vented and bandpass boxes: "lumped" (default, like WinISD) treats each port as a mass of air; "pipe"
   * treats it as a short pipe with its own resonances (the first near c / 2L), which show as
   * peaks in the response higher up.
   */
  portModel?: "lumped" | "pipe";
  /**
   * Box leakage (Ql): the air that leaks out "radiates" as sound (default: a real gap does, and
   * WinISD counts it), or is "absorbed", a pure loss, as Hornresp has it. Changes the output
   * only, mostly where the box's own output is low (a bandpass box away from its passband).
   */
  leakage?: "radiates" | "absorbed";
  /**
   * Sealed, ported and PR boxes: the air the cone's front moves. "mass" (default, like WinISD)
   * keeps it in Mms, a fixed mass. "piston" (like Hornresp) takes the front's share out of Mms
   * and loads the cone with a baffled piston's full radiation impedance instead: the same at low
   * frequencies, less mass and more resistance higher up. Several drivers then push one piston of
   * n·Sd together (side by side), so each sees n × its impedance, as do identical boxes side by side.
   */
  coneLoad?: "mass" | "piston";
  /**
   * Voice-coil temperature (°C). Above 20 °C the coil's resistance rises (copper, about
   * 0.39 %/°C) while Bl stays: less output for the same voltage and a higher Qes, i.e. the
   * driver's power compression. Default 20 (the datasheet's cold values, like WinISD).
   */
  coilTemp_C?: number;
  /** Air properties. Default: 20 °C. Use WINISD_AIR to match WinISD exactly. */
  air?: Air;
  /** Amplifier output + cable resistance (Ω), shared by the whole driver bank. Default 0. */
  rg?: number;
  /**
   * Passive parts between the amplifier (after rg) and the driver bank: up to four branches,
   * in line and across, as in Hornresp's passive Filter Wizard. The impedance chart then shows
   * what the amplifier sees.
   */
  passive?: PassiveNetwork | null;
  /**
   * Isobaric (compound) loading: each "driver" is a pair of identical drivers
   * working as one (twice the moving mass, half the compliance, same Sd), with the
   * two voice coils in series or in parallel. `drivers` then counts pairs.
   */
  isobaric?: { coils: "series" | "parallel" } | null;
  /**
   * Port compression (vented boxes): the port's turbulent loss grows with air speed
   * (ΔP = ½ρK·v², as an equivalent resistance for a sine), solved at this drive level.
   * Approximate; off by default so results stay comparable with WinISD.
   */
  portCompression?: boolean;
}

/** The single equivalent driver of an isobaric pair. */
export function isobaricPair(d: ReturnType<typeof driverModel>, coils: "series" | "parallel"): ReturnType<typeof driverModel> {
  const k = coils === "series" ? 2 : 0.5;
  return {
    ...d,
    re: d.re * k,
    le: d.le * k,
    l2: d.l2 * k,
    r2: d.r2 * k,
    semi: d.semi && { leb: d.semi.leb * k, le: d.semi.le * k, ke: d.semi.ke * k, rss: d.semi.rss * k },
    bl: coils === "series" ? d.bl * 2 : d.bl,
    mms: d.mms * 2,
    cms: d.cms / 2,
    rms: d.rms * 2,
    fdd: d.fdd && { rms: d.fdd.rms * 2, ams: d.fdd.ams / 2 },
    pe: d.pe === null ? null : d.pe * 2,
  };
}

export interface SimulationResult {
  freq: Float64Array;
  /** Sound pressure level (dB SPL) at the given input power and distance. */
  spl: Float64Array;
  phaseDeg: Float64Array;
  groupDelayMs: Float64Array;
  /**
   * Lines and horns: the line's acoustic impedance (Hornresp's Za), resistance and reactance
   * divided by ρc/S at the driver (or the horn's throat). Null for boxes.
   */
  acousticImpedance: { resistance: Float64Array; reactance: Float64Array; area_cm2: number } | null;
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
  /**
   * Peak sound pressure inside the box (Pa): what pushes on the cone's back and the walls
   * (Hornresp's "Rear Chamber Diaphragm Peak Pressure"). Bandpass: the rear chamber. Null for lines.
   */
  boxPressurePa: Float64Array | null;
  /** Bandpass only: peak sound pressure in the front chamber (Pa), on the cone's front. */
  frontChamberPressurePa: Float64Array | null;
  impedanceOhm: Float64Array;
  impedancePhaseDeg: Float64Array;
  /**
   * Open transmission lines: the cone's front and the mouth (or port) on their own (dB SPL);
   * spl is their sum, with the phase between them. Null for other designs and horns (only their mouth radiates).
   */
  parts: { cone: Float64Array; mouth: Float64Array } | null;
  /** Highest input power (W) before any limit is reached, per frequency. */
  maxPowerW: Float64Array;
  /** SPL at maxPowerW. */
  maxSpl: Float64Array;
  /**
   * What the amplifier must deliver at each frequency to reach maxSpl: RMS volts and amps at
   * its output terminals, and the real power it sends into the speaker. Unlike maxPowerW (the
   * drive setting, before filters and EQ), these include the high-pass filter, any EQ boost
   * and the speaker's impedance at that frequency. NaN where no limit applies.
   */
  ampAtMax: { volts: Float64Array; amps: Float64Array; watts: Float64Array };
  /** Which limit sets maxPower at each frequency. */
  limitedBy: ("thermal" | "xmax" | "pr-xmax" | "port" | "amp" | "none")[];
  summary: {
    volts: number;
    /** Passband SPL of the mass-controlled region (ignores Le). */
    referenceSpl: number;
    f3: number | null;
    f6: number | null;
    /** Bandpass: upper −3 dB point. A bandpass box's f3, f6 and f3High are taken from its band's peak (bandPeakSpl), not referenceSpl. */
    f3High?: number | null;
    /** Bandpass: the band's peak SPL (its gain over a plain cone is bandPeakSpl − referenceSpl). */
    bandPeakSpl?: number;
    fb?: number;
    /** Vented (and a bandpass box's front port): where portVelocity is taken: the throat, or the mouths of a port flared at both ends. */
    portVelocityAt?: "throat" | "ends";
    /** Vented with portCompression: largest output loss from port compression (dB) and where (Hz). */
    portCompression?: { db: number; f: number };
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

/**
 * Resistance the amplifier sees across the whole driver bank (cold Re, after isobaric pairing
 * and series/parallel wiring): what simulate() turns watts into volts with, V = √(P · R).
 */
export function bankResistance(driverIn: DriverInput, opts: Pick<SimulationOptions, "isobaric" | "drivers" | "wiring"> = {}): number {
  const base = driverModel(driverIn);
  const re = (opts.isobaric ? isobaricPair(base, opts.isobaric.coils) : base).re;
  const n = opts.drivers ?? 1;
  return (opts.wiring ?? "parallel") === "parallel" ? re / n : re * n;
}

export function simulate(driverIn: DriverInput, box: EnclosureInput, opts: SimulationOptions = {}): SimulationResult {
  const air = opts.air ?? STANDARD_AIR;
  const base = driverModel(driverIn, air);
  const cold = opts.isobaric ? isobaricPair(base, opts.isobaric.coils) : base;
  // A hot voice coil: Re rises, Bl doesn't, so Qes rises and the same voltage drives less current.
  const heat = coilHeatFactor(opts.coilTemp_C);
  const d = heat === 1 ? cold : { ...cold, re: cold.re * heat };
  const n = opts.drivers ?? 1;
  const wiring = opts.wiring ?? "parallel";
  const power = opts.power ?? 1;
  const r = opts.distance_m ?? 1;
  const space = opts.space === "full" ? 4 : 2;
  const vLimit = opts.portVelocityLimit ?? 17;

  // Voltage at the terminals of the whole driver bank, and per driver.
  // Watts are turned into volts with the datasheet (cold) Re, as an amplifier's rating would be.
  const reTotal = wiring === "parallel" ? cold.re / n : cold.re * n;
  const nominalTotal =
    opts.nominalOhms !== undefined ? (wiring === "parallel" ? opts.nominalOhms / n : opts.nominalOhms * n) : reTotal;
  const volts =
    opts.convention === "volts"
      ? power
      : Math.sqrt(power * (opts.convention === "nominal" ? nominalTotal : reTotal));
  const vDriver = wiring === "parallel" ? volts : volts / n;
  // Power the limits are scaled from, in watts as the thermal limit counts them. In "volts"
  // mode the input is a voltage, so take the power it puts into the coils (V²/Re); every limit
  // below is then "how far the drive can rise", and SPL and excursion follow from that.
  // A hot coil takes less power from the same voltage (V²/Re): the thermal limit counts that.
  const pNow = (opts.convention === "volts" ? (volts * volts) / reTotal : power) / heat;
  // A source resistance shared by N parallel drivers looks like N·Rg to each one (Rg/N in series).
  const rgTotal = opts.rg ?? 0;
  const rgDriver = wiring === "parallel" ? rgTotal * n : rgTotal / n;
  const net = passiveActive(opts.passive) ? opts.passive : null;
  // Per driver, a source shared by the bank: N parallel drivers each see N × its impedance.
  const perDriverZ = (z: Complex) => (wiring === "parallel" ? scale(z, n) : scale(z, 1 / n));

  // Box elements
  const summary: SimulationResult["summary"] = { volts, referenceSpl: 0, f3: null, f6: null };
  const bp = box.kind === "bandpass" ? bandpassNetwork(box, d, n, air, summary, opts.portModel === "pipe", opts.leakage === "absorbed") : null;
  const line = box.kind === "line" ? lineNetwork(box, air) : null;
  // A line or horn models the air on the cone's sides explicitly, so the cone carries its bare
  // moving mass Mmd = Mms − 16ρa³/3 (both sides' free-air load, as Hornresp defines it). An open
  // line adds the front's radiation load (a piston in a baffle); the rear's is in the line's load.
  // Cone loaded by a piston's radiation impedance: Mms less one side's air (8ρa³/3), as for lines.
  const pistonLoad = opts.coneLoad === "piston" && !bp && !line;
  const boxMms = pistonLoad ? Math.max(d.mms - (8 * air.rho * Math.pow(d.sd / Math.PI, 1.5)) / 3, d.mms * 0.05) : d.mms;
  const lineMmd = line ? Math.max(d.mms - (16 * air.rho * Math.pow(d.sd / Math.PI, 1.5)) / 3, d.mms * 0.05) : 0;
  // Port compression in a mass-loaded line's port (same model as vented boxes).
  let lineNl = 0;
  let lineReynoldsPerQ = 0;
  if (line && box.kind === "line" && box.port && opts.portCompression) {
    lineNl = ((8 / (3 * Math.PI)) * 0.5 * air.rho * portLossCoefficient(box.port)) / (line.exitThroatArea * line.exitThroatArea);
    lineReynoldsPerQ = (Math.sqrt(line.exitArea / Math.PI) * air.rho) / (AIR_VISCOSITY * line.exitArea);
  }
  const single = box.kind === "bandpass" || box.kind === "line" ? null : box;
  const cab = single ? boxCompliance(single.vb_l, air) : 0;
  const ql = finiteOr(single?.ql, DEFAULT_LOSSES.ql);
  const qa = finiteOr(single?.qa, DEFAULT_LOSSES.qa);

  // Reference frequency for the loss Qs, and branch impedance builders.
  let fRef = 1;
  let ventZ: ((w: number) => Complex) | null = null; // total of all ports / PRs in parallel
  let ventPortZ: ((w: number) => Complex) | null = null; // one port (vented boxes)
  let ventPipe: ReturnType<typeof portPipe> | null = null; // ports as pipes: flow out per flow in
  let velocityScale = 1; // throat → where velocity is judged
  let nlCoef = 0; // port compression: extra resistance per unit peak volume velocity
  let reynoldsPerQ = 0; // Reynolds number at the port's ends per unit peak volume velocity
  let compression = { db: 0, f: 0 };
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
    if (opts.portModel === "pipe") {
      const pipe = portPipe(single.port, ec, air);
      ventPipe = pipe;
      ventZ = (w) => scale(add(cx(rap), pipe(w).zIn), 1 / ventCount);
      ventPortZ = (w) => add(cx(rap), pipe(w).zIn);
    } else {
      ventZ = (w) => scale(cx(rap, w * map), 1 / ventCount);
      ventPortZ = (w) => cx(rap, w * map);
    }
    // Peak velocity is judged where the air leaves: the mouths when both ends are flared.
    if (portFlare(single.port).ends === 2) {
      velocityScale = ventArea / portMouthArea(single.port);
      summary.portVelocityAt = "ends";
    } else summary.portVelocityAt = "throat";
    if (opts.portCompression) {
      // Equivalent resistance of a quadratic loss for a sine of peak volume velocity Q:
      // R = (8 / 3π) · ½ρK · Q / S².
      nlCoef = ((8 / (3 * Math.PI)) * 0.5 * air.rho * portLossCoefficient(single.port)) / (ventArea * ventArea);
      // The loss only builds up once the flow at the ends turns turbulent: from a Reynolds
      // number of about 20 000 to full effect by about 50 000 (Raczynski, after Vanderkooy).
      // Re = r·v·ρ/μ at the mouth; per unit peak volume velocity:
      const mouth = portMouthArea(single.port);
      const ends = portFlare(single.port).ends === 2 ? mouth : ventArea;
      reynoldsPerQ = (Math.sqrt(ends / Math.PI) * air.rho) / (AIR_VISCOSITY * ends);
    }
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

  // Whether the cone's front faces the room (everything but horns that radiate only from the mouth).
  const frontOut = !(line && line.mouthOnly);
  const freq = opts.frequencies ? Float64Array.from(opts.frequencies) : logFrequencies(opts.fMin ?? 10, opts.fMax ?? 500, opts.points ?? 400);
  const N = freq.length;
  const out = {
    spl: new Float64Array(N),
    parts: box.kind === "line" && box.tap_cm === undefined && !box.frontLoaded ? { cone: new Float64Array(N), mouth: new Float64Array(N) } : null,
    phase: new Float64Array(N),
    gd: new Float64Array(N),
    x: new Float64Array(N),
    xpr: box.kind === "passive-radiator" || (bp && bp.frontPrs.length + bp.rearPrs.length > 0) ? new Float64Array(N) : null,
    xprGroups: prModels
      ? prModels.map(() => new Float64Array(N))
      : bp && bp.frontPrs.length + bp.rearPrs.length > 0
        ? [...bp.frontPrs, ...bp.rearPrs].map(() => new Float64Array(N))
        : null,
    vport: box.kind === "vented" || box.kind === "line" || bp?.front ? new Float64Array(N) : null,
    vport2: bp?.rear ? new Float64Array(N) : null,
    pbox: box.kind !== "line" ? new Float64Array(N) : null,
    pfront: bp ? new Float64Array(N) : null,
    zmag: new Float64Array(N),
    zph: new Float64Array(N),
    pmax: new Float64Array(N),
    splmax: new Float64Array(N),
    ampV: new Float64Array(N),
    ampI: new Float64Array(N),
    ampW: new Float64Array(N),
    zaR: line ? new Float64Array(N) : null,
    zaX: line ? new Float64Array(N) : null,
  };
  const limitedBy: SimulationResult["limitedBy"] = [];
  const unwrapped = new Float64Array(N);
  const sd2 = d.sd * d.sd;

  for (let i = 0; i < N; i++) {
    const f = freq[i]!;
    const w = 2 * Math.PI * f;

    const zvc = voiceCoilImpedance(d, w);
    // Through a passive network the bank sees a Thévenin source: a voltage and an impedance per frequency.
    const th = net ? passiveThevenin(net, w, rgTotal) : null;
    const ze = add(zvc, th ? perDriverZ(th.z) : cx(rgDriver));
    let filter = opts.highPass ? highPassResponse(opts.highPass, f) : cx(1);
    if (opts.eq && opts.eq.length > 0) filter = mul(filter, eqResponse(opts.eq, f));
    const filterGain2 = filter.re * filter.re + filter.im * filter.im;
    const pg = div(mul(mul(filter, th ? th.v : cx(1)), cx((vDriver * d.bl) / d.sd)), ze);
    const zae = div(cx((d.bl * d.bl) / sd2), ze);
    const susp = suspensionImpedance(d, w);
    let zas = cx(susp.re / sd2, (w * boxMms + susp.im) / sd2);
    if (pistonLoad) zas = add(zas, scale(baffledPistonImpedance(n * d.sd, w, air), n));

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
      out.pbox![i] = Math.SQRT2 * abs(mul(ud, unit.pR));
      out.pfront![i] = Math.SQRT2 * abs(mul(ud, unit.pF));
      u0 = mul(ud, flows.radiated);
      if (bp.front && out.vport) {
        // A pipe's air moves fastest at whichever end its standing wave puts the motion.
        const vF = Math.max(abs(mul(ud, flows.frontPortEach)), abs(mul(ud, flows.frontPortOutEach))) * Math.SQRT2 / bp.front.area;
        out.vport[i] = vF;
        vport = vF;
      }
      if (bp.rear && out.vport2) {
        const vR = Math.max(abs(mul(ud, flows.rearPortEach)), abs(mul(ud, flows.rearPortOutEach))) * Math.SQRT2 / bp.rear.area;
        out.vport2[i] = vR;
        vport = Math.max(vport, vR);
      }
      if (out.xprGroups) {
        const groups = [...bp.frontPrs, ...bp.rearPrs];
        const each = [...flows.frontPrEach, ...flows.rearPrEach];
        groups.forEach((g, k) => {
          const xk = (Math.SQRT2 * abs(mul(ud, each[k]!))) / (g.m.sd * w);
          out.xprGroups![k]![i] = xk * 1000;
          if (g.m.xmax !== null && xk > 0) prLimitPower = Math.min(prLimitPower, pNow * (g.m.xmax / xk) ** 2);
        });
        out.xpr![i] = out.xprGroups[0]![i]!;
      }
    } else if (line) {
      // Transmission line (or tapped horn): the line loads the cone; the mouth (or port) radiates.
      let zasLine = cx(susp.re / sd2, (w * lineMmd + susp.im) / sd2);
      // Several drivers side by side load each other's fronts: together they push one piston
      // of n·Sd, so each sees n × that piston's impedance (√n × one cone's air mass), as Hornresp has it.
      if (!line.mouthOnly) zasLine = add(zasLine, scale(baffledPistonImpedance(n * d.sd, w, air), n));
      const solveLine = () => {
        const zl = line.zLoad(w);
        const zm = add(zasLine, scale(zl, n));
        const u = div(pg, add(zae, zm));
        return { zl, zm, u, exit: mul(scale(u, n), line.exitPerCone(w)) };
      };
      let sol = solveLine();
      if (lineNl > 0) {
        // Port compression in a mass-loaded line's port, as for vented boxes.
        const linearExit = abs(sol.exit);
        let rNl = 0;
        for (let k = 0; k < 40; k++) {
          const qPeak = Math.SQRT2 * abs(sol.exit);
          const onset = Math.min(1, Math.max(0, (lineReynoldsPerQ * qPeak - 20000) / 30000));
          const target = lineNl * qPeak * onset;
          if (Math.abs(target - rNl) <= 1e-4 * Math.max(1, rNl)) break;
          rNl = 0.5 * (rNl + target);
          line.setExitLoss(rNl);
          sol = solveLine();
        }
        line.setExitLoss(0);
        const loss = 20 * Math.log10(linearExit / Math.max(abs(sol.exit), 1e-30));
        if (loss > compression.db) compression = { db: loss, f };
      }
      zLoad = sol.zl;
      zMech = sol.zm;
      const za = line.za(w);
      out.zaR![i] = za.re / line.zaRef;
      out.zaX![i] = za.im / line.zaRef;
      ui = sol.u;
      const ud = scale(ui, n);
      // The mouth's sound arrives later when it is farther from the listener.
      const dm = line.mouthDistance;
      const exitAtListener = dm > 0 ? scale(mul(sol.exit, cx(Math.cos((w * dm) / air.c), -Math.sin((w * dm) / air.c))), r / (r + dm)) : sol.exit;
      // Open line: the front of the cone radiates −ud as well. Tapped horn: only the mouth.
      const power = opts.splFrom === "power";
      const mouthOut = power ? scale(exitAtListener, pistonPowerFactor(line.exitArea, w, air)) : exitAtListener;
      const coneOut = power ? scale(ud, pistonPowerFactor(n * d.sd, w, air)) : ud;
      u0 = line.mouthOnly ? mouthOut : sub(mouthOut, coneOut);
      if (out.parts) {
        const k = (w * air.rho) / (space * Math.PI * r) / 2e-5;
        // On the same footing as the total (from radiated power when that's asked for).
        out.parts.cone[i] = 20 * Math.log10(Math.max(abs(coneOut) * k, 1e-12));
        out.parts.mouth[i] = 20 * Math.log10(Math.max(abs(mouthOut) * k, 1e-12));
      }
      if (out.vport) {
        vport = (Math.SQRT2 * abs(sol.exit)) / line.exitArea;
        out.vport[i] = vport;
      }
    } else {
      const zAir = cx(rab, -1 / (w * cab));
      const zLeak = Number.isFinite(ral) ? cx(ral) : null;
      let zVent = ventZ ? ventZ(w) : null;
      const solve = () => {
        const zl = parallel(zAir, zLeak, zVent)!;
        // N identical drivers into one load: each driver sees N × the load impedance.
        const zm = add(zas, scale(zl, n)); // per driver, acoustic units
        const u = div(pg, add(zae, zm));
        const pb = mul(scale(u, n), zl);
        return { zl, zm, u, pb };
      };
      let sol = solve();
      if (nlCoef > 0 && ventPortZ && zVent) {
        // Port compression: the loss depends on the flow it limits, so iterate to agreement.
        const linear = abs(scale(div(sol.pb, zAir), -1));
        const zPort = ventPortZ(w);
        let rNl = 0;
        for (let k = 0; k < 40; k++) {
          const qPeak = (Math.SQRT2 * abs(div(sol.pb, zVent))) / ventCount;
          const onset = Math.min(1, Math.max(0, (reynoldsPerQ * qPeak - 20000) / 30000));
          const target = nlCoef * qPeak * onset;
          if (Math.abs(target - rNl) <= 1e-4 * Math.max(1, rNl)) break;
          rNl = 0.5 * (rNl + target);
          zVent = scale(add(zPort, cx(rNl)), 1 / ventCount);
          sol = solve();
        }
        const loss = 20 * Math.log10(linear / abs(scale(div(sol.pb, zAir), -1)));
        if (loss > compression.db) compression = { db: loss, f };
      }
      zLoad = sol.zl;
      zMech = sol.zm;
      ui = sol.u;
      const pBox = sol.pb;
      out.pbox![i] = Math.SQRT2 * abs(pBox);

      // Radiated volume velocity = −(flow into the box air spring).
      u0 = scale(div(pBox, zAir), -1);
      // Leakage as a pure loss (like Hornresp): the air leaving through it isn't heard.
      if (opts.leakage === "absorbed" && Number.isFinite(ral)) u0 = sub(u0, scale(pBox, 1 / ral));
      // A port as a pipe: what leaves its outer end differs from what enters from the box.
      let pipeOutEach: Complex | null = null;
      if (ventPipe && zVent) {
        const uIn = div(pBox, zVent); // all ports
        const ratio = ventPipe(w).outPerIn;
        u0 = add(u0, mul(uIn, sub(ratio, cx(1))));
        pipeOutEach = scale(mul(uIn, ratio), 1 / ventCount);
      }
      // From radiated power (like Hornresp): the cone and the vent each as a baffled piston of
      // its own area, which radiates less than a point source once it's large next to the wavelength.
      if (opts.splFrom === "power") {
        const cone = scale(sol.u, -n);
        const vent = sub(u0, cone);
        const ventTotal = prModels ? prModels.reduce((a, g) => a + g.m.sd * g.count, 0) : ventArea * ventCount;
        u0 = add(scale(cone, pistonPowerFactor(n * d.sd, w, air)), ventTotal > 0 ? scale(vent, pistonPowerFactor(ventTotal, w, air)) : vent);
      }

      if (prModels && out.xprGroups) {
        // Each group sees the box pressure; flow per PR = p / (group impedance × count).
        prModels.forEach((g, k) => {
          const uEach = scale(div(pBox, g.z(w)), 1 / g.count);
          const xk = (Math.SQRT2 * abs(uEach)) / (g.m.sd * w);
          out.xprGroups![k]![i] = xk * 1000;
          if (g.m.xmax !== null && xk > 0) prLimitPower = Math.min(prLimitPower, pNow * (g.m.xmax / xk) ** 2);
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
          // A pipe's air moves fastest at whichever end its standing wave puts the motion.
          const uMax = pipeOutEach ? Math.max(abs(uVentEach), abs(pipeOutEach)) : abs(uVentEach);
          vport = ((Math.SQRT2 * uMax) / ventArea) * velocityScale;
          out.vport[i] = vport;
        }
      }
    }
    // Far-field pressure (RMS): p = jωρ·U0 / (k·π·r)
    const p = mul(cx(0, (w * air.rho) / (space * Math.PI * r)), u0);
    out.spl[i] = 20 * Math.log10(abs(p) / 2e-5);
    // The cone's flow (ud) is counted into the box or line behind it, so a cone that faces the
    // room pushes out −ud: turn the phase round so a positive voltage gives a positive pressure
    // in front (the cone moving out), as a real driver wired + to + does. A front horn's or
    // tapped horn's flow is counted into the horn, which is already the way out.
    unwrapped[i] = arg(p) + (frontOut ? Math.PI : 0);

    // Excursion (peak, one way) = √2·|U|/(Sd·ω)
    const x = (Math.SQRT2 * abs(ui)) / (d.sd * w);
    out.x[i] = x * 1000;

    // Electrical input impedance of the whole bank
    const zDriver = add(zvc, div(cx((d.bl * d.bl) / sd2), zMech));
    const zBank = wiring === "parallel" ? scale(zDriver, 1 / n) : scale(zDriver, n);
    // What the amplifier sees: the bank, through the passive network if there is one.
    const zIn = net ? passiveInputImpedance(net, w, zBank) : zBank;
    out.zmag[i] = abs(zIn);
    out.zph[i] = (arg(zIn) * 180) / Math.PI;

    // Power limits: SPL ∝ V², excursion and velocity ∝ V.
    const limits: [SimulationResult["limitedBy"][number], number][] = [];
    // The amplifier's output now, through the filter and EQ, into the bank plus the source resistance.
    const zAmpNow = add(zIn, cx(rgTotal));
    const vAmpNow = volts * Math.sqrt(filterGain2);
    if (d.pe !== null) {
      if (opts.thermalLimit === "real") {
        // Real power into the bank: |V_bank|² · Re(Z) / |Z|².
        const vBank = net ? vAmpNow * abs(passiveBankGain(net, w, zBank, rgTotal)) : (vAmpNow * abs(zIn)) / abs(zAmpNow);
        const pReal = (vBank * vBank * zBank.re) / (abs(zBank) * abs(zBank));
        limits.push(["thermal", pReal > 0 ? (pNow * d.pe * n) / pReal : Infinity]);
      } else {
        // Thermal: the filter (and any passive parts) reduce the voltage reaching the coil at this frequency.
        const gNet = net ? abs(passiveBankGain(net, w, zBank, 0)) ** 2 : 1;
        limits.push(["thermal", (d.pe * n) / Math.max(filterGain2 * gNet, 1e-12)]);
      }
    }
    if (opts.amp?.volts && vAmpNow > 0) limits.push(["amp", pNow * (opts.amp.volts / vAmpNow) ** 2]);
    if (opts.amp?.amps && vAmpNow > 0) limits.push(["amp", pNow * (opts.amp.amps / (vAmpNow / abs(zAmpNow))) ** 2]);
    if (d.xmax !== null) limits.push(["xmax", pNow * (d.xmax / x) ** 2]);
    if (prModels || out.xprGroups) {
      if (Number.isFinite(prLimitPower)) limits.push(["pr-xmax", prLimitPower]);
    } else if (prXmax !== null && xpr > 0) limits.push(["pr-xmax", pNow * (prXmax / xpr) ** 2]);
    if (out.vport && vport > 0) limits.push(["port", pNow * (vLimit / vport) ** 2]);
    let best: [SimulationResult["limitedBy"][number], number] = ["none", Infinity];
    for (const l of limits) if (l[1] < best[1]) best = l;
    limitedBy.push(best[0]);
    out.pmax[i] = best[1];
    out.splmax[i] = Number.isFinite(best[1]) ? out.spl[i]! + 10 * Math.log10(best[1] / pNow) : NaN;
    // The amplifier at that limit: the drive voltage scaled up to it, through the filter and EQ,
    // into the bank's impedance plus the shared source resistance.
    if (Number.isFinite(best[1])) {
      const vAmp = volts * Math.sqrt(best[1] / pNow) * Math.sqrt(filterGain2);
      const zAmp = add(zIn, cx(rgTotal));
      const iAmp = vAmp / abs(zAmp);
      out.ampV[i] = vAmp;
      out.ampI[i] = iAmp;
      // Real power into the speaker (and Rg): I² × Re(Z).
      out.ampW[i] = iAmp * iAmp * zAmp.re;
    } else {
      out.ampV[i] = NaN;
      out.ampI[i] = NaN;
      out.ampW[i] = NaN;
    }
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
  // Through a passive network: its resistive part (coils as wires, capacitors left out), as a plain resistance would.
  const thRef = net ? passiveThevenin(net, 1, rgTotal, true) : null;
  const vRef = thRef ? vDriver * thRef.v.re : vDriver;
  const rRef = thRef ? perDriverZ(thRef.z).re : rgDriver;
  const pRef = (air.rho * n * vRef * d.bl * d.sd) / ((d.re + rRef) * d.mms * space * Math.PI * r);
  summary.referenceSpl = 20 * Math.log10(pRef / 2e-5);
  summary.f3 = crossing(freq, out.spl, summary.referenceSpl - 3);
  summary.f6 = crossing(freq, out.spl, summary.referenceSpl - 6);
  if (nlCoef > 0 || lineNl > 0) summary.portCompression = compression;
  if (line?.mouthOnly) {
    // Horns: the mouth's gain puts the passband well above a plain cone's, so the reference
    // is the horn's own: the median level over the two octaves above where the response
    // first comes within 6 dB of its peak (a horn without a throat chamber keeps rising, so
    // the very top would overstate it).
    let top = -Infinity;
    for (const v of out.spl) if (Number.isFinite(v)) top = Math.max(top, v);
    let i0 = 0;
    while (i0 < N - 1 && !(out.spl[i0]! >= top - 6)) i0++;
    const band: number[] = [];
    for (let i = i0; i < N && freq[i]! <= 4 * freq[i0]!; i++) if (Number.isFinite(out.spl[i]!)) band.push(out.spl[i]!);
    band.sort((a, b) => a - b);
    if (band.length > 0) summary.referenceSpl = band[Math.floor(band.length / 2)]!;
  }
  if (line) {
    summary.fb = lineTuning(freq, out.zmag) ?? undefined;
    // A line's response ripples above its tuning, so its F3 is the low-frequency edge:
    // where the response first reaches −3 dB coming up from the bottom.
    summary.f3 = crossingUp(freq, out.spl, summary.referenceSpl - 3);
    summary.f6 = crossingUp(freq, out.spl, summary.referenceSpl - 6);
  }
  if (bp) {
    // A bandpass box's band is judged against its own peak, not a plain cone's level: its gain
    // over a cone (bandPeakSpl − referenceSpl) is part of the design, and a band that sits
    // below a cone's level would otherwise get edges that say little about it.
    let peak = -Infinity;
    for (const v of out.spl) if (Number.isFinite(v)) peak = Math.max(peak, v);
    summary.bandPeakSpl = peak;
    summary.f3 = crossingUp(freq, out.spl, peak - 3);
    summary.f6 = crossingUp(freq, out.spl, peak - 6);
    summary.f3High = crossingHigh(freq, out.spl, peak - 3);
  }

  return {
    freq,
    spl: out.spl,
    phaseDeg: out.phase,
    groupDelayMs: out.gd,
    acousticImpedance: line ? { resistance: out.zaR!, reactance: out.zaX!, area_cm2: ((air.rho * air.c) / line.zaRef) * 1e4 } : null,
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
    boxPressurePa: out.pbox,
    frontChamberPressurePa: out.pfront,
    impedanceOhm: out.zmag,
    impedancePhaseDeg: out.zph,
    parts: out.parts,
    maxPowerW: out.pmax,
    maxSpl: out.splmax,
    ampAtMax: { volts: out.ampV, amps: out.ampI, watts: out.ampW },
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


/** Coming up from the lowest frequency, where the response first reaches `level`. */
function crossingUp(freq: Float64Array, spl: Float64Array, level: number): number | null {
  if (spl[0]! >= level) return freq[0]!;
  for (let i = 1; i < spl.length; i++) {
    if (spl[i]! >= level) {
      const t = (level - spl[i - 1]!) / (spl[i]! - spl[i - 1]!);
      return Math.exp(Math.log(freq[i - 1]!) + t * (Math.log(freq[i]!) - Math.log(freq[i - 1]!)));
    }
  }
  return null;
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
  area: number; // m², one port, where its air speed is judged (the mouths when flared at both ends)
  /** The port as a short pipe (portModel "pipe"), for ports that open to the outside. */
  pipe?: ReturnType<typeof portPipe>;
  /** A pipe between the two chambers (a series box's rear port): its admittances, one port. */
  between?: (w: number) => { y11: Complex; y12: Complex; y22: Complex };
}

/**
 * A port as a pipe between two chambers, with its loss resistance at the near end: the
 * admittances relating the flows into each end to the two pressures (y12 couples them).
 */
function pipeBetween(p: PortInput, ec: number, rap: number, air: Air) {
  const L = portEffectiveLength(p, ec);
  const zc = (air.rho * air.c) / portArea(p);
  return (w: number) => {
    const kl = (w / air.c) * L;
    const c = Math.cos(kl);
    const sn = Math.sin(kl);
    // ABCD = [1 rap; 0 1] · [c, j·zc·s; j·s/zc, c]
    const A = cx(c, (rap * sn) / zc);
    const B = cx(rap * c, zc * sn);
    return { y11: div(cx(c), B), y12: scale(inv(B), -1), y22: div(A, B) };
  };
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
  pipes = false,
  leaksAbsorbed = false,
) {
  const ec = box.endCorrection ?? DEFAULT_END_CORRECTION;
  const series = box.rearPortTo === "front";
  // As pipes (like a vented box's with portModel "pipe"), when asked: ports that open to the
  // outside end in their radiation load; a series box's rear port joins the two chambers.
  const portOf = (p: PortInput, count: number, fRef: number, qp: number, outside: boolean): PortElements => {
    const map = portAcousticMass(p, ec, air);
    // Air speed is judged where it leaves: the mouths of a port flared at both ends (as for a vented box).
    const area = portFlare(p).ends === 2 ? portMouthArea(p) : portArea(p);
    const rap = Number.isFinite(qp) ? (2 * Math.PI * fRef * map) / qp : 0;
    const pipe = pipes && outside ? portPipe(p, ec, air) : undefined;
    const between = pipes && !outside ? pipeBetween(p, ec, rap, air) : undefined;
    return { map, rap, count, area, pipe, between };
  };
  const hasPrs = (c: BandpassChamber) => (c.prs?.length ?? 0) > 0;
  /** Tuning of a chamber's opening: Helmholtz for a port, PR mass against the air spring for PRs. */
  const tuningOf = (c: BandpassChamber) =>
    hasPrs(c)
      ? c.prs!.length === 1
        ? prFb(c.vb_l, c.prs![0]!.pr, c.prs![0]!.count, c.prs![0]!.addedMass_g ?? 0, air)
        : prGroupsFb(c.vb_l, c.prs!, air)
      : ventedFb(c.vb_l, c.port!, c.portCount ?? 1, ec, air);
  const ventOf = (c: BandpassChamber, fRef: number, outside = true): Vent =>
    hasPrs(c)
      ? { kind: "pr", groups: c.prs!.map((g) => ({ m: passiveRadiatorModel(g.pr, g.addedMass_g ?? 0, air), count: g.count })) }
      : { kind: "port", port: portOf(c.port!, c.portCount ?? 1, fRef, finiteOr(c.qp, DEFAULT_LOSSES.qp), outside) };
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
  if (box.front.port) summary.portVelocityAt = portFlare(box.front.port).ends === 2 ? "ends" : "throat";
  const rearVent = rearOpen ? ventOf(box.rear, fRear, !series) : null;

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
      ? scale(v.port.pipe ? add(cx(v.port.rap), v.port.pipe(w).zIn) : cx(v.port.rap, w * v.port.map), 1 / v.port.count)
      : parallel(...v.groups.map((g) => scale(zPrEach(g.m, w), 1 / g.count)))!;
  const zAirOf = (c: ChamberElements, w: number) => cx(c.rab, -1 / (w * c.cab));
  const yChamber = (c: ChamberElements, w: number) => {
    let y = inv(zAirOf(c, w));
    if (Number.isFinite(c.ral)) y = add(y, cx(1 / c.ral));
    return y;
  };

  /**
   * Per-element flows through a vent for a pressure difference dp: per port (in from the
   * chamber, and out of its far end, which differ for a pipe), or per PR of each group.
   */
  const ventFlows = (v: Vent, dp: Complex, w: number) => {
    if (v.kind === "pr") return { port: cx(0), portOut: cx(0), prs: v.groups.map((g) => div(dp, zPrEach(g.m, w))) };
    const port = scale(div(dp, zVentTotal(v, w)), 1 / v.port.count);
    return { port, portOut: v.port.pipe ? mul(port, v.port.pipe(w).outPerIn) : port, prs: [] as Complex[] };
  };

  return {
    /** The port of each chamber (null when that chamber has PRs or is closed). */
    front: frontVent.kind === "port" ? frontVent.port : null,
    rear: rearVent?.kind === "port" ? rearVent.port : null,
    /** PR groups of each chamber (empty when it has a port or is closed). */
    frontPrs: frontVent.kind === "pr" ? frontVent.groups : [],
    rearPrs: rearVent?.kind === "pr" ? rearVent.groups : [],
    /** Chamber pressures for a unit total cone volume velocity (rear → front). */
    solve(w: number) {
      // Nodal equations, a symmetric 2 × 2: [aF m; m aR] [pF; pR] = [1; −1].
      let aF = add(add(yChamber(F, w), inv(zVentTotal(frontVent, w))), yIcl);
      let aR = add(yChamber(R, w), yIcl);
      let m = scale(yIcl, -1);
      if (rearVent) {
        const between = rearVent.kind === "port" ? rearVent.port.between : undefined;
        if (series && between) {
          const y = between(w);
          const k = rearVent.kind === "port" ? rearVent.port.count : 1;
          aR = add(aR, scale(y.y11, k));
          aF = add(aF, scale(y.y22, k));
          m = add(m, scale(y.y12, k));
        } else if (series) {
          const yI = inv(zVentTotal(rearVent, w));
          aR = add(aR, yI);
          aF = add(aF, yI);
          m = sub(m, yI);
        } else aR = add(aR, inv(zVentTotal(rearVent, w)));
      }
      const det = sub(mul(aF, aR), mul(m, m));
      const pF = div(add(aR, m), det);
      const pR = div(scale(add(aF, m), -1), det);
      return { pF, pR };
    },
    /** Flows (per unit cone volume velocity) given the unit chamber pressures. */
    flows(w: number, pF: Complex, pR: Complex) {
      // Air leaving the system = −(rate of compression of both air springs), plus, for ports
      // as pipes, what the air in the pipe itself takes up or gives back.
      let radiated = scale(add(div(pF, zAirOf(F, w)), div(pR, zAirOf(R, w))), -1);
      const f = ventFlows(frontVent, pF, w);
      const between = rearVent?.kind === "port" ? rearVent.port.between : undefined;
      let r = rearVent ? ventFlows(rearVent, series ? sub(pR, pF) : pR, w) : { port: cx(0), portOut: cx(0), prs: [] as Complex[] };
      if (between) {
        // In from the rear chamber, and out into the front one.
        const y = between(w);
        r = { port: add(mul(y.y11, pR), mul(y.y12, pF)), portOut: scale(add(mul(y.y12, pR), mul(y.y22, pF)), -1), prs: [] };
      }
      // A pipe holds air of its own, so what leaves it differs from what enters (also between chambers).
      if (frontVent.kind === "port") radiated = add(radiated, scale(sub(f.portOut, f.port), frontVent.port.count));
      if (rearVent?.kind === "port") radiated = add(radiated, scale(sub(r.portOut, r.port), rearVent.port.count));
      // Leaks as a pure loss (like Hornresp): what escapes through them isn't heard.
      if (leaksAbsorbed) radiated = sub(sub(radiated, scale(pF, 1 / F.ral)), scale(pR, 1 / R.ral));
      return {
        radiated,
        frontPortEach: f.port,
        rearPortEach: r.port,
        frontPortOutEach: f.portOut,
        rearPortOutEach: r.portOut,
        frontPrEach: f.prs,
        rearPrEach: r.prs,
      };
    },
  };
}

export interface LineProfile {
  f: number;
  /** Points from the closed end (or a horn's throat) to the mouth, then through a port. */
  points: {
    x_cm: number;
    area_cm2: number;
    /** Sound pressure level inside the line (dB re 20 µPa, RMS). */
    spl_db: number;
    /** Peak air speed (m/s): volume velocity over the area. */
    velocity_ms: number;
    port: boolean;
  }[];
  /** Line length (cm), without a port. */
  length_cm: number;
  /** Peak one-way cone excursion at this frequency (mm), as on the excursion chart. */
  excursion_mm: number;
}

/**
 * Pressure and air speed along a transmission line or horn at one frequency, at the drive in
 * `opts` (filters and EQ included): the standing waves inside, where stuffing works hardest
 * (high air speed) and where the pressure peaks.
 */
export function lineProfile(driverIn: DriverInput, line: LineInput, f: number, opts: SimulationOptions = {}): LineProfile {
  const air = opts.air ?? STANDARD_AIR;
  const r = simulate(driverIn, line, { ...opts, fMin: f, fMax: f * 1.0001, points: 2 });
  const base = driverModel(driverIn, air);
  const d = opts.isobaric ? isobaricPair(base, opts.isobaric.coils) : base;
  const n = opts.drivers ?? 1;
  const w = 2 * Math.PI * f;
  const x = r.excursionMm[0]! / 1000; // peak, per driver
  const uPeak = n * d.sd * w * x; // all the cones together
  const net = lineNetwork(line, air);
  const pts = net.profile(w).map((pt) => {
    const pPeak = Math.hypot(pt.p.re, pt.p.im) * uPeak;
    return {
      x_cm: pt.x * 100,
      area_cm2: pt.area * 1e4,
      spl_db: 20 * Math.log10(Math.max(pPeak / Math.SQRT2, 1e-9) / 2e-5),
      velocity_ms: pt.area > 0 ? (Math.hypot(pt.u.re, pt.u.im) * uPeak) / pt.area : 0,
      port: pt.port,
    };
  });
  return { f, points: pts, length_cm: net.length_m * 100, excursion_mm: x * 1000 };
}
