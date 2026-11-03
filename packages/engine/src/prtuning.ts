import { prAddedMassForFb, prFb, type DriverInput, type Losses, type PassiveRadiatorInput } from "./model.ts";
import { simulate, type SimulationOptions } from "./simulate.ts";

/**
 * Best tuning for a chosen passive radiator.
 *
 * The PR and how many of them are fixed; what can change is the added mass (that is,
 * the tuning) and, for "smallest", the box. Every candidate is simulated and judged on:
 *
 * - F3 (lower is better),
 * - the bump: how far the response rises above its passband level (the same 0 dB the
 *   relative SPL chart uses) up to twice the tuning frequency, where the tuning shapes it
 *   (higher up, a small box's own mid-bass rise doesn't depend on the tuning),
 * - PR travel: at the drive where the driver first reaches its Xmax, the PRs must still
 *   be within theirs (otherwise they become the limit),
 * - added mass: at most `maxMassRatio` × the PR's own moving mass.
 *
 * Goals:
 * - "flat":     lowest F3 with no bump (≤ 0.25 dB): a maximally flat alignment.
 * - "deep":     lowest F3 with a bump of at most 1 dB.
 * - "smallest": smallest box that still reaches `targetF3` with a bump of at most 1 dB.
 */

export type TuningGoal = "flat" | "deep" | "smallest";

export const BUMP_LIMIT: Record<TuningGoal, number> = { flat: 0.25, deep: 1, smallest: 1 };

export interface PrTuningOptions {
  goal: TuningGoal;
  vb_l: number;
  pr: PassiveRadiatorInput;
  count: number;
  losses?: Losses;
  sim?: SimulationOptions;
  /** Excursion peaks are judged above this frequency. Default 15 Hz. */
  fMin?: number;
  /** Added mass limit, as a multiple of the PR's own moving mass. Default 3. */
  maxMassRatio?: number;
  /** "smallest" only: the F3 to reach (Hz). */
  targetF3?: number;
}

export interface TuningPoint {
  vb_l: number;
  addedMass_g: number;
  massRatio: number;
  fb: number;
  f3: number | null;
  /** Rise of the response above its passband level up to 2 × Fb (dB, ≥ 0). */
  bump_db: number;
  /** PR travel used when the driver reaches its Xmax (NaN if the driver's Xmax is unknown). */
  prUse: number;
  /** Within PR travel and the added-mass limit. */
  feasible: boolean;
}

export interface Fix {
  text: string;
  /** What to change to apply it. */
  patch: { count?: number; vb_l?: number };
}

export interface PrTuningResult {
  goal: TuningGoal;
  best: TuningPoint | null;
  /** Why there is no answer, in plain words. */
  reason?: string;
  /** Suggestions when there is no answer (or a better one nearby). */
  fixes: Fix[];
  /** Notes about the answer (heavy mass, unknown Xmax…). */
  notes: string[];
}

const FAST_POINTS = 160;

/** Simulate one tuning and measure it. */
export function evaluateTuning(
  driver: DriverInput,
  o: Pick<PrTuningOptions, "pr" | "count" | "losses" | "sim" | "fMin" | "maxMassRatio">,
  vb_l: number,
  addedMass_g: number,
): TuningPoint {
  const fMin = o.fMin ?? 15;
  const maxRatio = o.maxMassRatio ?? 3;
  const r = simulate(
    driver,
    { kind: "passive-radiator", vb_l, pr: o.pr, prCount: o.count, addedMass_g, ...o.losses },
    { ...o.sim, points: Math.min(o.sim?.points ?? FAST_POINTS, FAST_POINTS) },
  );
  const ref = r.summary.referenceSpl;
  const fbNow = r.summary.fb ?? prFb(vb_l, o.pr, o.count, addedMass_g, o.sim?.air);
  let bump = 0;
  let driverScale = Infinity;
  let prPeak = 0;
  for (let i = 0; i < r.freq.length; i++) {
    if (r.freq[i]! <= 2 * fbNow) bump = Math.max(bump, r.spl[i]! - ref);
    if (r.freq[i]! < fMin) continue;
    const xd = r.excursionMm[i]!;
    if (xd > 0 && driver.xmax_mm !== undefined) driverScale = Math.min(driverScale, driver.xmax_mm / xd);
    prPeak = Math.max(prPeak, r.prExcursionMm?.[i] ?? 0);
  }
  const prX = o.pr.xmax_mm;
  const prUse = Number.isFinite(driverScale) && prX !== undefined && prX > 0 ? (prPeak * driverScale) / prX : NaN;
  const massRatio = addedMass_g / o.pr.mms_g;
  return {
    vb_l,
    addedMass_g,
    massRatio,
    fb: fbNow,
    f3: r.summary.f3,
    bump_db: bump,
    prUse,
    feasible: !(prUse > 1) && massRatio <= maxRatio + 1e-9,
  };
}

/** Best tuning in one box: lowest F3 among feasible points with the bump within the limit. */
function bestInBox(driver: DriverInput, o: PrTuningOptions, vb_l: number, bumpLimit: number) {
  const maxMass = (o.maxMassRatio ?? 3) * o.pr.mms_g;
  const air = o.sim?.air;
  const fHigh = prFb(vb_l, o.pr, o.count, 0, air);
  const fLow = prFb(vb_l, o.pr, o.count, maxMass, air);
  // Even steps in log(Fb) between the bare PR and the heaviest allowed mass.
  const massAt = (fb: number) => Math.max(0, Math.min(maxMass, prAddedMassForFb(vb_l, o.pr, fb, o.count, air)));
  const grid: TuningPoint[] = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const fb = fHigh * (fLow / fHigh) ** (i / steps);
    grid.push(evaluateTuning(driver, o, vb_l, massAt(fb)));
  }
  const good = (p: TuningPoint) => p.feasible && p.f3 !== null && p.bump_db <= bumpLimit;
  const pick = (ps: TuningPoint[]) =>
    ps.filter(good).reduce<TuningPoint | null>((b, p) => (b === null || p.f3! < b.f3! - 1e-9 ? p : b), null);
  let best = pick(grid);
  if (best) {
    // Refine between the neighbours of the best grid point.
    const i = grid.indexOf(best);
    const a = grid[Math.max(0, i - 1)]!.fb;
    const b = grid[Math.min(steps, i + 1)]!.fb;
    const fine: TuningPoint[] = [];
    for (let k = 1; k < 10; k++) fine.push(evaluateTuning(driver, o, vb_l, massAt(a * (b / a) ** (k / 10))));
    best = pick([best, ...fine]) ?? best;
  }
  return { best, grid };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Why nothing in the grid passes, from the points that came closest. */
function explain(grid: TuningPoint[], bumpLimit: number, count: number): { reason: string; travel: boolean } {
  const withinBump = grid.filter((p) => p.f3 !== null && p.bump_db <= bumpLimit);
  if (withinBump.length === 0) {
    const least = Math.min(...grid.map((p) => p.bump_db));
    return {
      reason: `every tuning this PR can reach peaks at least ${least.toFixed(1)} dB above the passband (limit ${bumpLimit} dB): the PR${count > 1 ? "s are" : " is"} too stiff or too light for this box even with the most added mass`,
      travel: false,
    };
  }
  const travel = withinBump.every((p) => p.prUse > 1);
  if (travel) {
    const least = Math.min(...withinBump.map((p) => p.prUse));
    return {
      reason: `the PR${count > 1 ? "s run" : " runs"} out of travel before the driver at every usable tuning (at best ${Math.round(least * 100)} % of ${count > 1 ? "their" : "its"} Xmax when the driver is at its own)`,
      travel: true,
    };
  }
  return { reason: "no tuning passes every check", travel: false };
}

export function bestPrTuning(driver: DriverInput, o: PrTuningOptions): PrTuningResult {
  const bumpLimit = BUMP_LIMIT[o.goal];
  const notes: string[] = [];
  const fixes: Fix[] = [];
  if (driver.xmax_mm === undefined || !(o.pr.xmax_mm! > 0)) {
    notes.push(
      driver.xmax_mm === undefined
        ? "The driver's Xmax is unknown, so PR travel isn't checked."
        : "The PR's Xmax is unknown, so its travel isn't checked.",
    );
  }

  if (o.goal !== "smallest") {
    const { best, grid } = bestInBox(driver, o, o.vb_l, bumpLimit);
    if (!best) {
      const why = explain(grid, bumpLimit, o.count);
      // Fixes: more PRs share the travel; a bigger box lowers the tuning without mass.
      for (const count of [o.count * 2, o.count + 1].filter((c, i, a) => c <= 8 && a.indexOf(c) === i)) {
        const alt = bestInBox(driver, { ...o, count }, o.vb_l, bumpLimit).best;
        if (alt) {
          fixes.push({ text: `Use ${count} PRs: F3 ${r1(alt.f3!)} Hz with ${Math.round(alt.addedMass_g)} g added each`, patch: { count } });
          break;
        }
      }
      for (const k of [1.5, 2]) {
        const vb = r1(o.vb_l * k);
        const alt = bestInBox(driver, o, vb, bumpLimit).best;
        if (alt) {
          fixes.push({ text: `Make the box ${vb} L: F3 ${r1(alt.f3!)} Hz with ${Math.round(alt.addedMass_g)} g added`, patch: { vb_l: vb } });
          break;
        }
      }
      if (o.goal === "flat") {
        const deep = bestInBox(driver, o, o.vb_l, BUMP_LIMIT.deep).best;
        if (deep) fixes.push({ text: `Allow a 1 dB bump ("Deepest"): F3 ${r1(deep.f3!)} Hz`, patch: {} });
      }
      return { goal: o.goal, best: null, reason: why.reason, fixes, notes };
    }
    if (best.massRatio > 1.5) notes.push(`That's ${best.massRatio.toFixed(1)}× the PR's own moving mass: heavy added mass can make a PR sag or rock.`);
    if (o.goal === "deep" && best.bump_db <= BUMP_LIMIT.flat) {
      notes.push("Same as the flattest tuning: allowing a bump doesn't go any deeper with this PR in this box.");
    } else if (best.addedMass_g < 0.5 && best.bump_db < bumpLimit - 0.05 && o.goal === "deep") {
      notes.push("The PR needs no added mass here; a softer or heavier PR, or a bigger box, would go deeper.");
    }
    return { goal: o.goal, best, fixes, notes };
  }

  // Smallest box that reaches the target F3.
  const target = o.targetF3;
  if (!(target! > 0)) return { goal: o.goal, best: null, reason: "Enter the F3 to reach", fixes, notes };
  const found = smallestBox(driver, o, target!, bumpLimit);
  if (!found.hit) {
    const d = found.deepest;
    if (o.count * 2 <= 8) {
      const more = smallestBox(driver, { ...o, count: o.count * 2 }, target!, bumpLimit).hit;
      if (more) fixes.push({ text: `Use ${o.count * 2} PRs: ${roundUp(more.vb_l)} L reaches F3 ${r1(more.f3!)} Hz`, patch: { count: o.count * 2, vb_l: roundUp(more.vb_l) } });
    }
    return {
      goal: o.goal,
      best: null,
      reason: d
        ? `the deepest this driver gets with ${o.count} of this PR is F3 ${r1(d.f3!)} Hz, in a ${r1(d.vb_l)} L box`
        : `this PR can't reach ${target} Hz in any reasonable box`,
      fixes,
      notes,
    };
  }
  const hit = found.hit;
  if (hit.massRatio > 1.5) notes.push(`That's ${hit.massRatio.toFixed(1)}× the PR's own moving mass: heavy added mass can make a PR sag or rock.`);
  return { goal: o.goal, best: { ...hit, vb_l: roundUp(hit.vb_l) }, fixes, notes };
}

const roundUp = (v: number) => Math.ceil(v * 10) / 10;

/**
 * Smallest box whose best tuning reaches `target`: walk up from small boxes in steps of
 * ×1.4, then bisect. Bigger isn't always deeper (a low-Qts driver droops in a big box), so
 * the deepest result seen is kept for when the target is out of reach.
 */
function smallestBox(driver: DriverInput, o: PrTuningOptions, target: number, bumpLimit: number) {
  let deepest: TuningPoint | null = null;
  const reaches = (vb: number) => {
    const b = bestInBox(driver, o, vb, bumpLimit).best;
    if (b && (deepest === null || b.f3! < deepest.f3!)) deepest = b;
    return b !== null && b.f3! <= target ? b : null;
  };
  let lo = Math.max(0.5, o.vb_l / 16);
  let hi = lo;
  let hit: TuningPoint | null = null;
  for (let i = 0; i < 16 && !hit; i++) {
    hit = reaches(hi);
    if (!hit) {
      lo = hi;
      hi *= 1.4;
    }
  }
  if (hit && hi > lo) {
    for (let i = 0; i < 7; i++) {
      const mid = Math.sqrt(lo * hi);
      const m = reaches(mid);
      if (m) {
        hi = mid;
        hit = m;
      } else lo = mid;
    }
  }
  return { hit, deepest: deepest as TuningPoint | null };
}
