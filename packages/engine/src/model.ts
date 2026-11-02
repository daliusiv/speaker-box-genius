import { C, RHO } from "./constants.ts";
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
  xmax_mm?: number; // one-way, peak
  pe_w?: number; // thermal limit, per driver
}

export interface DriverModel {
  re: number; // Ω
  le: number; // H
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
export function driverModel(d: DriverInput): DriverModel {
  const cms = cmsFromVas(d.vas_l, d.sd_cm2);
  const mms = mmsFromFsCms(d.fs, cms);
  return {
    re: d.re,
    le: (d.le_mh ?? 0) / 1000,
    bl: blFromQes(d.fs, mms, d.re, d.qes),
    mms,
    cms,
    rms: (2 * Math.PI * d.fs * mms) / d.qms,
    sd: d.sd_cm2 / 1e4,
    xmax: d.xmax_mm !== undefined ? d.xmax_mm / 1000 : null,
    pe: d.pe_w ?? null,
  };
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export type PortInput =
  | { shape: "round"; diameter_cm: number; length_cm: number }
  | { shape: "slot"; width_cm: number; height_cm: number; length_cm: number };

/** WinISD-style end correction: effective length = length + k × (equivalent) diameter. */
export const DEFAULT_END_CORRECTION = 0.732;

export function portArea(p: PortInput): number {
  return p.shape === "round" ? Math.PI * (p.diameter_cm / 200) ** 2 : (p.width_cm * p.height_cm) / 1e4;
}

/** Diameter of a circle with the same area (m). */
export function portEquivalentDiameter(p: PortInput): number {
  return 2 * Math.sqrt(portArea(p) / Math.PI);
}

export function portEffectiveLength(p: PortInput, endCorrection = DEFAULT_END_CORRECTION): number {
  return p.length_cm / 100 + endCorrection * portEquivalentDiameter(p);
}

/** Acoustic mass of one port (kg/m⁴). */
export function portAcousticMass(p: PortInput, endCorrection = DEFAULT_END_CORRECTION): number {
  return (RHO * portEffectiveLength(p, endCorrection)) / portArea(p);
}

/** Acoustic compliance of a box (m⁵/N). */
export const boxCompliance = (vb_l: number) => vb_l / 1000 / (RHO * C * C);

/** Tuning frequency of a vented box with `count` identical ports. */
export function ventedFb(vb_l: number, port: PortInput, count = 1, endCorrection = DEFAULT_END_CORRECTION): number {
  const map = portAcousticMass(port, endCorrection) / count;
  return 1 / (2 * Math.PI * Math.sqrt(map * boxCompliance(vb_l)));
}

/** Physical port length (cm) needed to tune to `fb`. Can be negative if the port is too small. */
export function portLengthForFb(
  vb_l: number,
  port: PortInput,
  fb: number,
  count = 1,
  endCorrection = DEFAULT_END_CORRECTION,
): number {
  const w = 2 * Math.PI * fb;
  const mapTotal = 1 / (w * w * boxCompliance(vb_l));
  const leff = (mapTotal * count * portArea(port)) / RHO;
  return (leff - endCorrection * portEquivalentDiameter(port)) * 100;
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

export function passiveRadiatorModel(p: PassiveRadiatorInput, addedMass_g = 0): PassiveRadiatorModel {
  const sd = p.sd_cm2 / 1e4;
  const m0 = p.mms_g / 1000;
  let cmp: number;
  if (p.cms_mm_per_n !== undefined) cmp = p.cms_mm_per_n / 1000;
  else if (p.vas_l !== undefined) cmp = cmsFromVas(p.vas_l, p.sd_cm2);
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
export function prFb(vb_l: number, pr: PassiveRadiatorInput, count = 1, addedMass_g = 0): number {
  const m = passiveRadiatorModel(pr, addedMass_g);
  const k = 1 / m.cmp + (count * m.sd * m.sd) / boxCompliance(vb_l);
  return Math.sqrt(k / m.mmp) / (2 * Math.PI);
}

/** Added mass (g) per PR needed to reach `fb`. Negative means the PR is already too heavy. */
export function prAddedMassForFb(vb_l: number, pr: PassiveRadiatorInput, fb: number, count = 1): number {
  const m = passiveRadiatorModel(pr, 0);
  const k = 1 / m.cmp + (count * m.sd * m.sd) / boxCompliance(vb_l);
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

export type EnclosureInput =
  | ({ kind: "sealed"; vb_l: number } & Losses)
  | ({ kind: "vented"; vb_l: number; port: PortInput; portCount?: number; endCorrection?: number } & Losses)
  | ({
      kind: "passive-radiator";
      vb_l: number;
      pr: PassiveRadiatorInput;
      prCount?: number;
      addedMass_g?: number;
    } & Losses);
