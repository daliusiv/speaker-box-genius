/**
 * The passive radiator calculator's sums (the page at /calculators/passive-radiator/), with the
 * engine's own PR model, so its added masses are the app's to the gram: the same suspension,
 * box spring and air as a PR design in the app.
 */
import { passiveRadiatorModel, prAddedMassForFb, prFb, type Air } from "@sbg/engine";
import { newDesign, type AppState, type PrDesign, type PrParams } from "../state.ts";
import { limitsOf, PORT_LIMIT, runDesigns, solveDriver } from "../sim.ts";

/** Added mass above this many times the PR's own moving mass is flagged, as the PR finder does. */
export const MAX_MASS_RATIO = 3;
/** Past this many times its own moving mass a PR may start to sag and rock (the finder notes it). */
export const HEAVY_MASS_RATIO = 1.5;
/** Rule of thumb: the PRs together should displace about twice the driver(s). */
export const VD_RULE = 2;

export interface PrCalcInput {
  /** Net volume (L): after driver, bracing and the PRs themselves. */
  vb_l: number;
  fb: number;
  count: number;
  pr: PrParams;
  /** The PR's published maximum added mass (g), if any. */
  maxAdded_g?: number;
}

export interface PrCalcResult {
  /** Added mass per PR (g); 0 when the bare PRs already tune at or below the target. */
  addedMass_g: number;
  /** The bare PRs tune below the target: no added mass can raise the tuning. */
  tooLow: boolean;
  /** Tuning with no added mass (Hz): the highest these PRs can reach in this box. */
  bareFb: number;
  /** Tuning the PRs reach with the added mass (Hz). */
  fb: number;
  /** Added mass as a multiple of the PR's own moving mass. */
  massRatio: number;
  /** Moving mass of each PR with the added mass (g). */
  totalMass_g: number;
  /** The PR's own resonance, free air (Hz), bare and with the added mass. */
  fs: number;
  fsLoaded: number;
  /** Volume displacement of all the PRs at Xmax (cm³). */
  vd_cm3: number;
  /** Over the published maximum added mass. */
  overMax: boolean;
  /** Lowest tuning the published maximum added mass reaches here (Hz). */
  lowestFb?: number;
}

/** Null when the inputs can't make a PR box (no volume, no tuning, no PR). */
export function prCalc(i: PrCalcInput, air: Air): PrCalcResult | null {
  const p = i.pr;
  if (!(i.vb_l > 0) || !(i.fb > 0) || !(i.count >= 1) || !(p.mms_g > 0) || !(p.sd_cm2 > 0) || !(p.vas_l > 0)) return null;
  const bareFb = prFb(i.vb_l, p, i.count, 0, air);
  const need = prAddedMassForFb(i.vb_l, p, i.fb, i.count, air);
  const tooLow = need < -1e-9;
  const addedMass_g = Math.max(0, need);
  const m0 = passiveRadiatorModel(p, 0, air);
  const fsOf = (mass_kg: number) => 1 / (2 * Math.PI * Math.sqrt(mass_kg * m0.cmp));
  const max = i.maxAdded_g !== undefined && i.maxAdded_g > 0 ? i.maxAdded_g : undefined;
  return {
    addedMass_g,
    tooLow,
    bareFb,
    fb: tooLow ? bareFb : prFb(i.vb_l, p, i.count, addedMass_g, air),
    massRatio: addedMass_g / p.mms_g,
    totalMass_g: p.mms_g + addedMass_g,
    fs: fsOf(m0.mmp),
    fsLoaded: fsOf(m0.mmp + addedMass_g / 1000),
    vd_cm3: p.sd_cm2 * (p.xmax_mm / 10) * i.count,
    overMax: max !== undefined && addedMass_g > max,
    ...(max !== undefined ? { lowestFb: prFb(i.vb_l, p, i.count, max, air) } : {}),
  };
}

// ---- With a driver: will the PRs keep up? ----

/** The app's PR design for this box. */
export function prDesignOf(i: PrCalcInput, r: PrCalcResult, prName: string): PrDesign {
  const d = newDesign("pr", []) as PrDesign;
  return {
    ...d,
    name: "Passive radiators",
    vb_l: Math.round(i.vb_l * 100) / 100,
    prName,
    count: i.count,
    addedMass_g: Math.round(r.addedMass_g * 10) / 10,
    targetFb: i.fb,
    params: { ...i.pr },
    extra: [],
  };
}

export interface PrCheck {
  /** Peak cone and PR excursion (mm) at the drive simulated, from the app's check floor up. */
  x: number;
  xmax: number;
  pr: number;
  prXmax: number;
  /** Share of the PRs' Xmax used when the driver reaches its own (above 1: the PRs run out first). */
  prUse: number;
  /** PR displacement over driver displacement, both at Xmax. */
  vdRatio: number;
  f3: number | null;
}

/** Simulates the box with the state's driver and drive (the app's own code) and compares cone and PR travel. */
export function prCheck(s: AppState, i: PrCalcInput, r: PrCalcResult): PrCheck | null {
  const st: AppState = { ...s, designs: [prDesignOf(i, r, "PR")] };
  const [d] = runDesigns(st, solveDriver(st));
  if (!d) return null;
  const lim = limitsOf(d.result, st.xmax_mm, false, PORT_LIMIT);
  if (lim.x === null || !lim.xpr || !(st.xmax_mm > 0)) return null;
  const sd = st.ts.sd_cm2 ?? 0;
  const drivers = Math.max(1, st.drivers ?? 1);
  return {
    x: lim.x,
    xmax: st.xmax_mm,
    pr: lim.xpr.mm,
    prXmax: i.pr.xmax_mm,
    prUse: lim.x > 0 ? lim.xpr.mm / i.pr.xmax_mm / (lim.x / st.xmax_mm) : NaN,
    vdRatio: sd > 0 ? r.vd_cm3 / (sd * (st.xmax_mm / 10) * drivers) : NaN,
    f3: d.result.summary.f3,
  };
}

/** A PR set is usable: it reaches the tuning, without a heap of added mass, and keeps up with the driver. */
export const keepsUp = (r: PrCalcResult, c: PrCheck | null) => !r.tooLow && !r.overMax && r.massRatio <= MAX_MASS_RATIO && !!c && c.prUse <= 1;

/** The fewest of this PR (up to `maxCount`) that keeps up with the driver at this tuning, or null. */
export function fewestThatKeepUp(s: AppState, i: PrCalcInput, air: Air, maxCount = 6): { count: number; r: PrCalcResult; c: PrCheck } | null {
  for (let count = 1; count <= maxCount; count++) {
    const j = { ...i, count };
    const r = prCalc(j, air);
    if (!r) return null;
    const c = prCheck(s, j, r);
    if (c && keepsUp(r, c)) return { count, r, c };
  }
  return null;
}
