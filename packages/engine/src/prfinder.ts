import { prAddedMassForFb, prFb, type DriverInput, type Losses, type PassiveRadiatorInput } from "./model.ts";
import { simulate, type SimulationOptions } from "./simulate.ts";

/**
 * Passive radiator finder: for a driver in a box of a given size and tuning, try each
 * candidate PR in groups of 1, 2 or 4, set the tuning with added mass, simulate, and
 * judge whether the PRs keep up with the driver.
 *
 * "Keep up" means: at the drive level where the driver first reaches its Xmax (above
 * `fMin`), the PRs are still within their own Xmax. A PR that runs out of travel first
 * becomes the limit of the whole system, which is the usual way PR boxes fail. Excursion
 * of the driver and of the PRs both scale with the drive voltage, so one simulation
 * answers it for any power.
 */

export interface PrCandidate {
  id: string;
  name: string;
  pr: PassiveRadiatorInput;
  /** Outside diameter of the frame (cm), if known; otherwise estimated from Sd. */
  od_cm?: number;
}

/** Frame diameter of a PR: the known one, or about 1.3 × the effective cone diameter. */
export const prOutsideDiameter = (c: PrCandidate) => c.od_cm ?? 1.3 * 2 * Math.sqrt(c.pr.sd_cm2 / Math.PI);

/**
 * Largest PR frame that fits on a box of this net volume: a box of golden-ratio
 * proportions has its narrowest big face about ∛V across inside; allow for the walls.
 */
export const largestPrFor = (vb_l: number) => Math.cbrt(vb_l * 1000) + 2;

export interface PrFinderOptions {
  vb_l: number;
  /** Box tuning to reach with added mass (Hz). */
  targetFb: number;
  /** Group sizes to try. Default 1, 2 and 4. */
  counts?: number[];
  losses?: Losses;
  /** How the box is driven (power, drivers, filters, air…), as for `simulate`. */
  sim?: SimulationOptions;
  /** Excursion peaks are taken above this frequency (below it a subsonic filter is assumed). Default 15 Hz. */
  fMin?: number;
  /** Added mass above this many times the PR's own moving mass is rejected. Default 3. */
  maxMassRatio?: number;
}

export interface PrFinderResult {
  id: string;
  name: string;
  count: number;
  /** Added mass per PR (g). */
  addedMass_g: number;
  /** Added mass as a multiple of the PR's own moving mass. */
  massRatio: number;
  fb: number;
  f3: number | null;
  /**
   * Share of the PRs' Xmax used when the driver reaches its own Xmax (1 = both run out
   * together; above 1 the PRs run out first).
   */
  prUse: number;
  /** Passes every check. */
  ok: boolean;
  /** Why it doesn't, in plain words. */
  reason?: string;
  /** Frame diameter used for the fit check (cm). */
  od_cm: number;
  /** Lower is better (only meaningful among results that pass). */
  score: number;
}

export function findPassiveRadiators(driver: DriverInput, candidates: PrCandidate[], o: PrFinderOptions): PrFinderResult[] {
  const counts = o.counts ?? [1, 2, 4];
  const fMin = o.fMin ?? 15;
  const maxRatio = o.maxMassRatio ?? 3;
  const air = o.sim?.air;
  const out: PrFinderResult[] = [];
  if (driver.xmax_mm === undefined) throw new Error("The driver's Xmax is needed to judge passive radiators");

  for (const c of candidates) {
    // Without a published Xmax there is nothing to judge the PR's travel against.
    if (c.pr.xmax_mm === undefined) continue;
    const od_cm = prOutsideDiameter(c);
    const fits = od_cm <= largestPrFor(o.vb_l);
    for (const count of counts) {
      const base = { id: c.id, name: c.name, count, od_cm };
      const mass = prAddedMassForFb(o.vb_l, c.pr, o.targetFb, count, air);
      if (!(mass >= -1e-9)) {
        const bare = prFb(o.vb_l, c.pr, count, 0, air);
        out.push({
          ...base,
          addedMass_g: 0,
          massRatio: 0,
          fb: bare,
          f3: null,
          prUse: NaN,
          ok: false,
          reason: `already tunes to ${bare.toFixed(1)} Hz with no added mass, below the ${o.targetFb} Hz target`,
          score: Infinity,
        });
        continue;
      }
      const addedMass_g = Math.max(0, mass);
      const massRatio = addedMass_g / c.pr.mms_g;
      const r = simulate(
        driver,
        { kind: "passive-radiator", vb_l: o.vb_l, pr: c.pr, prCount: count, addedMass_g, ...o.losses },
        { ...o.sim },
      );
      // Drive scale at which the driver reaches Xmax; PR travel used at that drive.
      let driverScale = Infinity;
      let prPeak = 0;
      for (let i = 0; i < r.freq.length; i++) {
        if (r.freq[i]! < fMin) continue;
        const xd = r.excursionMm[i]!;
        if (xd > 0) driverScale = Math.min(driverScale, driver.xmax_mm / xd);
        prPeak = Math.max(prPeak, r.prExcursionMm?.[i] ?? 0);
      }
      const prUse = Number.isFinite(driverScale) ? (prPeak * driverScale) / c.pr.xmax_mm! : NaN;
      const problems: string[] = [];
      if (!fits) problems.push(`about ${Math.round(od_cm)} cm across: too big for a face of a ${Math.round(o.vb_l)} L box`);
      if (!(prUse <= 1)) {
        problems.push(`runs out of travel first: reaches its Xmax when the driver is at ${Math.round(100 / prUse)} % of its own`);
      }
      if (massRatio > maxRatio) {
        problems.push(`needs ${Math.round(addedMass_g)} g added per PR, ${massRatio.toFixed(1)}× its own moving mass`);
      }
      const reason = problems.length > 0 ? problems.join("; and ") : undefined;
      out.push({
        ...base,
        addedMass_g,
        massRatio,
        fb: r.summary.fb ?? o.targetFb,
        f3: r.summary.f3,
        prUse,
        ok: reason === undefined,
        reason,
        score: 0, // set below, once the best F3 is known
      });
    }
  }
  // Ranking among those that pass: closest to the best bass extension on offer (a PR that
  // is stiff for the box spoils the response), then fewer PRs, then not grossly oversized
  // (using under ~35 % of its travel: bigger and dearer than needed), then less added mass
  // (heavy mass makes PRs sag and rock).
  const f3s = out.filter((r) => r.ok && r.f3 !== null).map((r) => r.f3!);
  const f3Best = f3s.length > 0 ? Math.min(...f3s) : NaN;
  for (const r of out) {
    if (!r.ok) {
      r.score = Infinity;
      continue;
    }
    const f3Penalty = r.f3 !== null && Number.isFinite(f3Best) ? r.f3 / f3Best - 1 : 0;
    r.score = 3 * f3Penalty + 0.6 * (r.count - 1) + 2 * Math.max(0, 0.35 - r.prUse) + 0.3 * Math.max(0, r.massRatio - 1);
  }
  return out.sort((a, b) => Number(b.ok) - Number(a.ok) || a.score - b.score || (a.prUse || 0) - (b.prUse || 0));
}
