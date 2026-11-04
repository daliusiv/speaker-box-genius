import type { LineInput } from "./line.ts";
import { add, cx, div, mul, scale, type Complex } from "./complex.ts";
import { STANDARD_AIR, type Air } from "./constants.ts";
import { blFromQes, cmsFromVas, mmsFromFsCms } from "./ts.ts";

/**
 * Inputs use datasheet units (field names carry the unit).
 * Models (`*Model`) are in SI units and are what the solver uses.
 */

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export interface DriverInput {
  fs: number; // Hz
  qms: number;
  qes: number;
  vas_l: number;
  re: number; // Ω
  sd_cm2: number;
  le_mh?: number;
  /**
   * Optional L2R2 voice-coil model: a second inductance L2 in parallel with a
   * resistance R2, in series with Le. It stands in for eddy-current losses in the
   * pole piece, which make a real coil's impedance rise more slowly than a pure
   * inductor's. Leave both out for the plain-Le model (what WinISD uses).
   */
  l2_mh?: number;
  r2_ohm?: number;
  xmax_mm?: number; // one-way, peak
  pe_w?: number; // thermal limit, per driver
}

export interface DriverModel {
  re: number; // Ω
  le: number; // H
  /** L2R2 branch (H and Ω); l2 = 0 means none. */
  l2: number;
  r2: number;
  bl: number; // T·m
  mms: number; // kg
  cms: number; // m/N
  rms: number; // N·s/m
  sd: number; // m²
  xmax: number | null; // m
  pe: number | null; // W
}

/**
 * Derive mechanical parameters from the small-signal set, the way WinISD does:
 * Cms from Vas and Sd, Mms from fs and Cms, Bl from Qes, Rms from Qms.
 */
export function driverModel(d: DriverInput, air: Air = STANDARD_AIR): DriverModel {
  const cms = cmsFromVas(d.vas_l, d.sd_cm2, air);
  const mms = mmsFromFsCms(d.fs, cms);
  return {
    re: d.re,
    le: (d.le_mh ?? 0) / 1000,
    l2: d.l2_mh !== undefined && d.r2_ohm !== undefined && d.l2_mh > 0 && d.r2_ohm > 0 ? d.l2_mh / 1000 : 0,
    r2: d.l2_mh !== undefined && d.r2_ohm !== undefined && d.l2_mh > 0 && d.r2_ohm > 0 ? d.r2_ohm : 0,
    bl: blFromQes(d.fs, mms, d.re, d.qes),
    mms,
    cms,
    rms: (2 * Math.PI * d.fs * mms) / d.qms,
    sd: d.sd_cm2 / 1e4,
    xmax: d.xmax_mm !== undefined ? d.xmax_mm / 1000 : null,
    pe: d.pe_w ?? null,
  };
}

/**
 * Blocked voice-coil impedance: Re + jωLe, plus (jωL2 ∥ R2) when the L2R2 model is
 * used. This is everything electrical in front of the motor.
 */
export function voiceCoilImpedance(m: Pick<DriverModel, "re" | "le" | "l2" | "r2">, w: number): Complex {
  const z = cx(m.re, w * m.le);
  if (!(m.l2 > 0 && m.r2 > 0)) return z;
  const zl2 = cx(0, w * m.l2);
  return add(z, div(mul(zl2, cx(m.r2)), add(zl2, cx(m.r2))));
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export type PortInput =
  | {
      shape: "round";
      diameter_cm: number;
      length_cm: number;
      /** Round-over (flare) radius at the ends (cm); 0 or missing = a straight tube. */
      flare_cm?: number;
      /** How many ends are flared (default 2 when flare_cm > 0). */
      flareEnds?: 1 | 2;
    }
  | { shape: "slot"; width_cm: number; height_cm: number; length_cm: number };

/** WinISD-style end correction: effective length = length + k × (equivalent) diameter. */
export const DEFAULT_END_CORRECTION = 0.732;

/** Cross-section at the narrowest point (the throat for a flared port). */
export function portArea(p: PortInput): number {
  return p.shape === "round" ? Math.PI * (p.diameter_cm / 200) ** 2 : (p.width_cm * p.height_cm) / 1e4;
}

/** Diameter of a circle with the same area (m). */
export function portEquivalentDiameter(p: PortInput): number {
  return 2 * Math.sqrt(portArea(p) / Math.PI);
}

/** Flare radius (m) and number of flared ends; zero for slots and straight tubes. */
export function portFlare(p: PortInput): { r: number; ends: 0 | 1 | 2 } {
  if (p.shape !== "round" || !(p.flare_cm! > 0)) return { r: 0, ends: 0 };
  return { r: p.flare_cm! / 100, ends: p.flareEnds ?? 2 };
}

/** Area of a flared end's mouth (m²). Equals the throat area for straight ports. */
export function portMouthArea(p: PortInput): number {
  const { r, ends } = portFlare(p);
  if (ends === 0) return portArea(p);
  return Math.PI * (p.shape === "round" ? p.diameter_cm / 200 + r : 0) ** 2;
}

/**
 * ∫ S0/S(x) dx over one flared end (m): the "throat-equivalent" length of a round-over
 * of radius r on a tube of radius a. Along the flare the radius grows from a to a + r
 * as a quarter circle.
 */
function flareEquivalentLength(a: number, r: number): number {
  const n = 64;
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const x = ((k + 0.5) / n) * r; // distance from where the flare starts
    const radius = a + r - Math.sqrt(Math.max(0, r * r - x * x));
    sum += (a / radius) ** 2;
  }
  return (sum / n) * r;
}

/**
 * Effective length (m) as a straight tube of the throat's area: the physical length with
 * flared sections weighted by their larger area, plus the end corrections (k × diameter
 * shared over both ends, taken at each end's own diameter and referred to the throat).
 * For a straight port this is WinISD's length + k × diameter.
 */
export function portEffectiveLength(p: PortInput, endCorrection = DEFAULT_END_CORRECTION): number {
  const d0 = portEquivalentDiameter(p);
  const { r, ends } = portFlare(p);
  if (ends === 0) return p.length_cm / 100 + endCorrection * d0;
  const a = d0 / 2;
  const straight = Math.max(0, p.length_cm / 100 - ends * r);
  const flared = ends * flareEquivalentLength(a, r);
  const dMouth = 2 * (a + r);
  // End correction per end ∝ its diameter, and its mass ∝ 1/area: refer to the throat.
  const ecMouth = (endCorrection / 2) * dMouth * (a / (a + r)) ** 2;
  const ecPlain = (endCorrection / 2) * d0;
  return straight + flared + ends * ecMouth + (2 - ends) * ecPlain;
}

/**
 * One port as a pipe rather than a lumped mass: a uniform tube of the throat's area and the
 * effective length (end corrections included, so it tunes the box exactly as the lumped port
 * does), radiating at its outer end. Unlike the lumped mass it has the pipe's own resonances,
 * the first near c / (2 × effective length), which leak out of the port as peaks.
 * Returns the impedance looking into the port from the box (without the Qp loss) and the
 * flow leaving its outer end per unit flow entering.
 */
export function portPipe(p: PortInput, endCorrection = DEFAULT_END_CORRECTION, air: Air = STANDARD_AIR) {
  const L = portEffectiveLength(p, endCorrection);
  const zc = (air.rho * air.c) / portArea(p);
  return (w: number): { zIn: Complex; outPerIn: Complex } => {
    const kl = (w / air.c) * L;
    const c = Math.cos(kl);
    const s = Math.sin(kl);
    // Radiation resistance at the mouth (small-ka limit, the same for any area): ρω² / 2πc.
    // Its reactance is already in the end correction.
    const zr = cx((air.rho * w * w) / (2 * Math.PI * air.c));
    // [p_in; U_in] = [cos, j·zc·sin; j·sin/zc, cos] · [p_out; U_out], p_out = zr·U_out
    const num = add(scale(zr, c), cx(0, zc * s));
    const den = add(mul(cx(0, s / zc), zr), cx(c));
    return { zIn: div(num, den), outPerIn: div(cx(1), den) };
  };
}

/** First resonance of a port as a pipe open at both ends (Hz): c / (2 × effective length). */
export const portPipeResonance = (p: PortInput, endCorrection = DEFAULT_END_CORRECTION, air: Air = STANDARD_AIR) =>
  air.c / (2 * portEffectiveLength(p, endCorrection));

/** Acoustic mass of one port (kg/m⁴). */
export function portAcousticMass(p: PortInput, endCorrection = DEFAULT_END_CORRECTION, air: Air = STANDARD_AIR): number {
  return (air.rho * portEffectiveLength(p, endCorrection)) / portArea(p);
}

/**
 * Turbulent ("minor") loss coefficient for port compression: about 1.5 for sharp-edged
 * ends (entry ≈ 0.5 + exit jet ≈ 1), falling quickly as the ends are rounded. Approximate:
 * real ports vary with how the flare is shaped, bends and the box around them.
 */
export function portLossCoefficient(p: PortInput): number {
  const { r, ends } = portFlare(p);
  if (ends === 0) return 1.5;
  const ratio = r / portEquivalentDiameter(p);
  const flaredEnd = 0.1 + 0.65 * Math.exp(-6 * ratio); // per end: 0.75 sharp → ~0.15 well rounded
  return ends * flaredEnd + (2 - ends) * 0.75;
}

/** Acoustic compliance of a box (m⁵/N). */
export const boxCompliance = (vb_l: number, air: Air = STANDARD_AIR) => vb_l / 1000 / (air.rho * air.c * air.c);

/** Tuning frequency of a vented box with `count` identical ports. */
export function ventedFb(
  vb_l: number,
  port: PortInput,
  count = 1,
  endCorrection = DEFAULT_END_CORRECTION,
  air: Air = STANDARD_AIR,
): number {
  const map = portAcousticMass(port, endCorrection, air) / count;
  return 1 / (2 * Math.PI * Math.sqrt(map * boxCompliance(vb_l, air)));
}

/** Physical port length (cm) needed to tune to `fb`. Can be negative if the port is too small. */
export function portLengthForFb(
  vb_l: number,
  port: PortInput,
  fb: number,
  count = 1,
  endCorrection = DEFAULT_END_CORRECTION,
  air: Air = STANDARD_AIR,
): number {
  const w = 2 * Math.PI * fb;
  const mapTotal = 1 / (w * w * boxCompliance(vb_l, air));
  const leff = (mapTotal * count * portArea(port)) / air.rho;
  // Effective length grows one-for-one with physical length once the flares fit, so
  // solve from the effective length of a port of the flares' length.
  const { r, ends } = portFlare(port);
  const base = { ...port, length_cm: ends * r * 100 } as PortInput;
  return (leff - portEffectiveLength(base, endCorrection)) * 100 + base.length_cm;
}

// ---------------------------------------------------------------------------
// Passive radiators
// ---------------------------------------------------------------------------

export interface PassiveRadiatorInput {
  mms_g: number; // moving mass with no added mass
  sd_cm2: number;
  xmax_mm?: number;
  qms?: number; // default 10
  /** Give one of these for the suspension compliance: */
  cms_mm_per_n?: number;
  vas_l?: number;
  fs?: number;
}

export interface PassiveRadiatorModel {
  mmp: number; // kg, including added mass
  cmp: number; // m/N
  rmp: number; // N·s/m
  sd: number; // m²
  xmax: number | null; // m
}

export const DEFAULT_PR_QMS = 10;

export function passiveRadiatorModel(p: PassiveRadiatorInput, addedMass_g = 0, air: Air = STANDARD_AIR): PassiveRadiatorModel {
  const sd = p.sd_cm2 / 1e4;
  const m0 = p.mms_g / 1000;
  let cmp: number;
  if (p.cms_mm_per_n !== undefined) cmp = p.cms_mm_per_n / 1000;
  else if (p.vas_l !== undefined) cmp = cmsFromVas(p.vas_l, p.sd_cm2, air);
  else if (p.fs !== undefined) cmp = 1 / ((2 * Math.PI * p.fs) ** 2 * m0);
  else throw new Error("Passive radiator needs cms_mm_per_n, vas_l or fs");
  // Mechanical damping is a property of the suspension, so derive it from the bare PR.
  const fs0 = 1 / (2 * Math.PI * Math.sqrt(m0 * cmp));
  const rmp = (2 * Math.PI * fs0 * m0) / (p.qms ?? DEFAULT_PR_QMS);
  return { mmp: m0 + addedMass_g / 1000, cmp, rmp, sd, xmax: p.xmax_mm !== undefined ? p.xmax_mm / 1000 : null };
}

/**
 * Box tuning frequency with `count` identical PRs: the frequency at which the
 * PR mass resonates against its own suspension plus the box air spring.
 */
export function prFb(vb_l: number, pr: PassiveRadiatorInput, count = 1, addedMass_g = 0, air: Air = STANDARD_AIR): number {
  const m = passiveRadiatorModel(pr, addedMass_g, air);
  const k = 1 / m.cmp + (count * m.sd * m.sd) / boxCompliance(vb_l, air);
  return Math.sqrt(k / m.mmp) / (2 * Math.PI);
}

/** One group of identical passive radiators in a box that may hold several kinds. */
export interface PrGroup {
  pr: PassiveRadiatorInput;
  count: number;
  addedMass_g?: number;
}

/**
 * Approximate tuning of a box with several kinds of passive radiator: all the PRs
 * lumped into one equivalent (masses in parallel, suspensions in parallel) resonating
 * with the box air spring. Exact when every group is identical; with different
 * groups the real response has more than one resonance, and this sits between them.
 */
export function prGroupsFb(vb_l: number, groups: PrGroup[], air: Air = STANDARD_AIR): number {
  let invMass = 0; // Σ count / Map  (acoustic masses in parallel)
  let cas = 0; // Σ count × Cap  (acoustic compliances in parallel)
  for (const g of groups) {
    const m = passiveRadiatorModel(g.pr, g.addedMass_g ?? 0, air);
    const s2 = m.sd * m.sd;
    invMass += g.count / (m.mmp / s2);
    cas += g.count * m.cmp * s2;
  }
  const map = 1 / invMass;
  const k = 1 / cas + 1 / boxCompliance(vb_l, air);
  return Math.sqrt(k / map) / (2 * Math.PI);
}

/**
 * Added mass (g) per PR in group `index` that brings the combined tuning to `fb`,
 * keeping the other groups as they are. Negative when even no added mass tunes too low.
 * Infinity when the target can't be reached this way: a very heavy group just stops
 * moving, so the other groups set a floor that added mass on this group can't go below.
 */
export function prGroupsAddedMassForFb(
  vb_l: number,
  groups: PrGroup[],
  fb: number,
  index = 0,
  air: Air = STANDARD_AIR,
): number {
  const fbWith = (add: number) => prGroupsFb(vb_l, groups.map((g, i) => (i === index ? { ...g, addedMass_g: add } : g)), air);
  if (fbWith(0) < fb) {
    // Already too low: report how far, as a negative mass, like prAddedMassForFb.
    let lo = -groups[index]!.pr.mms_g * 0.999, hi = 0;
    if (fbWith(lo) < fb) return lo;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (fbWith(mid) > fb) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  if (groups.length > 1 && fbWith(1e9) > fb) return Infinity;
  let lo = 0, hi = 1;
  while (fbWith(hi) > fb && hi < 1e9) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (fbWith(mid) > fb) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Added mass (g) per PR needed to reach `fb`. Negative means the PR is already too heavy. */
export function prAddedMassForFb(
  vb_l: number,
  pr: PassiveRadiatorInput,
  fb: number,
  count = 1,
  air: Air = STANDARD_AIR,
): number {
  const m = passiveRadiatorModel(pr, 0, air);
  const k = 1 / m.cmp + (count * m.sd * m.sd) / boxCompliance(vb_l, air);
  const mTotal = k / (2 * Math.PI * fb) ** 2;
  return (mTotal - m.mmp) * 1000;
}

// ---------------------------------------------------------------------------
// Enclosures
// ---------------------------------------------------------------------------

/**
 * Box losses, as Q values at the box's reference frequency (fb, or fc for sealed).
 * Use Infinity for a lossless model. Defaults match WinISD: Ql 10, Qa 100, Qp 100.
 */
export interface Losses {
  ql?: number; // leakage
  qa?: number; // absorption
  qp?: number; // port friction (vented only)
}

export const DEFAULT_LOSSES = { ql: 10, qa: 100, qp: 100 } as const;

/** One chamber of a bandpass box. */
export interface BandpassChamber extends Losses {
  vb_l: number;
  /** The chamber's opening: a port, or passive radiators (`prs`). Omit both for a closed chamber. */
  port?: PortInput;
  portCount?: number;
  /** Passive radiators instead of a port: one or more groups of identical PRs. */
  prs?: PrGroup[];
}

/**
 * Bandpass box: the driver sits between a rear and a front chamber.
 * - 4th order: closed rear chamber, ported front chamber.
 * - 6th order (parallel): both chambers ported to the outside.
 * - 6th order (series-tuned): the rear chamber's port opens into the front chamber
 *   (`rearPortTo: "front"`) and only the front chamber is ported to the outside.
 */
export interface BandpassInput {
  kind: "bandpass";
  rear: BandpassChamber;
  /** Must have a port or passive radiators: all the sound comes out of the front chamber. */
  front: BandpassChamber;
  rearPortTo?: "outside" | "front";
  endCorrection?: number;
  /**
   * Leakage between the chambers (around the driver and through the baffle), as a Q
   * referred to the driver: R = Q / (2π·Fs·Cas). WinISD's default is 100 (Qiclfr).
   * Infinity = no inter-chamber leak.
   */
  qicl?: number;
}

export type EnclosureInput =
  | BandpassInput
  | LineInput
  | ({ kind: "sealed"; vb_l: number } & Losses)
  | ({ kind: "vented"; vb_l: number; port: PortInput; portCount?: number; endCorrection?: number } & Losses)
  | ({
      kind: "passive-radiator";
      vb_l: number;
      pr: PassiveRadiatorInput;
      prCount?: number;
      addedMass_g?: number;
      /** Further groups of a different PR (or the same PR with a different added mass). */
      extraPrs?: PrGroup[];
    } & Losses);
