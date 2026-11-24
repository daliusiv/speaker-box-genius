/**
 * "Find similar drivers" in the app's driver picker: the database drivers whose published T/S
 * parameters are closest to the main driver as it is now (edited values included), ranked by the
 * engine's `rankSimilar` (stage 1, live on the index), then each simulated in one of your own
 * boxes against the main driver (stage 2, `simDelta`, as a search job in the worker). A much
 * higher F3 or much less max SPL there moves a substitute down a tier (`demoteTier`). Unlike the
 * driver pages, risky ones are shown (with their own chip).
 */
import { demoteTier, rankSimilar, simDelta, STANDARD_SIZES, type DriverInput, type EnclosureInput, type SimDelta, type SimilarInput, type SimilarResult, type SimilarTier, type SimulationOptions } from "@sbg/engine";
import { withDriver } from "./assistant.ts";
import { doubtsXmax, type DbIndex, type LoadedDriver } from "./library.ts";
import { actingFactor, builtVbOf, driverInputOf, enclosureOf, enclosureOptsOf, lossesFor, simOptionsOf, solveDriver } from "./sim.ts";
import type { AppState, DesignState } from "./state.ts";

type Row = DbIndex["drivers"][number];

/** Substitutes the picker lists (decision 6: k = 10, at most 3 from the driver's own brand). */
export const APP_SUBSTITUTES = 10;

/** A database row as the scoring sees it, or null when it lacks Fs, Qts, Vas or Sd. */
export function rowInput(r: Row): SimilarInput | null {
  if (!(r.fs! > 0 && r.qts! > 0 && r.vas_l! > 0 && r.sd_cm2! > 0)) return null;
  return {
    id: r.id,
    brand: r.brand,
    type: r.type,
    ...(r.size_in !== undefined ? { size_in: r.size_in } : {}),
    sd_cm2: r.sd_cm2!,
    fs: r.fs!,
    qts: r.qts!,
    vas_l: r.vas_l!,
    ...(r.qes !== undefined ? { qes: r.qes } : {}),
    ...(r.xmax_mm !== undefined ? { xmax_mm: r.xmax_mm } : {}),
    ...(r.xmax_doubtful || doubtsXmax(r) ? { xmax_doubtful: true } : {}),
    ...(r.pe_w !== undefined ? { pe_w: r.pe_w } : {}),
    ...(r.cutout_mm !== undefined ? { cutout_mm: r.cutout_mm } : {}),
    ...(r.depth_mm !== undefined ? { depth_mm: r.depth_mm } : {}),
    ohms: r.ohms,
    ...(r.coil_ohms ? { voice_coils: 2, coil_ohms: r.coil_ohms } : {}),
    ...(r.family ? { family: r.family } : {}),
  };
}

/**
 * The main driver as it is now: its solved T/S (edits included), Xmax and Pe as set; type, size,
 * brand, fit and family from its database row when it came from the database (an edited or typed
 * driver counts as a bass driver of the size its Sd suggests). Null until the T/S solve.
 */
export function targetInput(s: AppState, row?: Row): SimilarInput | null {
  const solved = solveDriver(s);
  if (solved.missing.length > 0) return null;
  const v = solved.values;
  if (!(v.fs! > 0 && v.qts! > 0 && v.vas_l! > 0 && v.sd_cm2! > 0)) return null;
  const sizeFromSd = () => {
    // Effective cone diameter ≈ 0.8 × nominal size, to the nearest standard size.
    const d_in = (2 * Math.sqrt(v.sd_cm2! / Math.PI)) / 2.54 / 0.8;
    return STANDARD_SIZES.reduce((a, b) => (Math.abs(Math.log(b / d_in)) < Math.abs(Math.log(a / d_in)) ? b : a));
  };
  return {
    id: row?.id ?? "current",
    brand: row?.brand ?? s.driverBrand ?? "",
    type: row?.type ?? "woofer",
    size_in: row?.size_in ?? sizeFromSd(),
    sd_cm2: v.sd_cm2!,
    fs: v.fs!,
    qts: v.qts!,
    vas_l: v.vas_l!,
    ...(v.qes !== undefined ? { qes: v.qes } : {}),
    ...(s.xmax_mm > 0 && !(row && (row.xmax_doubtful || doubtsXmax(row)) && row.xmax_mm === s.xmax_mm) ? { xmax_mm: s.xmax_mm } : {}),
    ...(s.pe_w > 0 ? { pe_w: s.pe_w } : {}),
    ...(s.volume.driverCutout_mm > 0 ? { cutout_mm: s.volume.driverCutout_mm } : {}),
    ...(s.volume.driverDepth_mm > 0 ? { depth_mm: s.volume.driverDepth_mm } : {}),
    ohms: s.nominal_ohms,
    ...(row?.coil_ohms ? { voice_coils: 2, coil_ohms: row.coil_ohms } : {}),
    ...(row?.family ? { family: row.family } : {}),
  };
}

/** Stage 1: the closest drivers in the index (any brand, at most 3 from the target's own). */
export function rankForApp(target: SimilarInput, rows: readonly Row[], k = APP_SUBSTITUTES): SimilarResult[] {
  const inputs: SimilarInput[] = [];
  for (const r of rows) {
    const x = rowInput(r);
    if (x) inputs.push(x);
  }
  return rankSimilar(target, inputs, { k, maxSameBrand: 3 });
}

/** One of your boxes as stage 2 sees it: the shown designs, by name. */
export interface SimilarBox {
  id: string;
  name: string;
  kind: DesignState["kind"];
  box: EnclosureInput;
}

/** The boxes switched on (open baffles included), as the charts simulate them. */
export function similarBoxes(s: AppState): SimilarBox[] {
  const out: SimilarBox[] = [];
  for (const d of s.designs) {
    if (!d.on) continue;
    const vb = builtVbOf(s, d) * actingFactor(s, d);
    if (!(vb > 0) && d.kind !== "ob") continue;
    try {
      out.push({ id: d.id, name: d.name, kind: d.kind, box: enclosureOf(d, vb, lossesFor(s, d), s.volume.wall_mm, s.volume, enclosureOptsOf(s)) });
    } catch {
      // A box the engine can't take (incomplete) is left out, as the charts leave it out.
    }
  }
  return out;
}

/** The main driver as the engine simulates it (Xmax / Pe as set; 0 = not published). */
export const mainDriverInput = (s: AppState): DriverInput => driverInputOf(s, solveDriver(s));

/**
 * A database driver as stage 2 simulates it: loaded into the current project the way picking it
 * would (its own Xmax and Pe; none when unpublished, and a doubtful Xmax left out).
 */
export function candidateInput(s: AppState, d: LoadedDriver, row?: Row): DriverInput {
  const own = withDriver(s, d);
  const x = driverInputOf(own, solveDriver(own));
  return { ...x, xmax_mm: d.xmax_mm !== undefined && !(row && (row.xmax_doubtful || doubtsXmax(row))) ? d.xmax_mm : undefined, pe_w: d.pe_w };
}

/** The search job's data: the main driver, each candidate and the box (search.ts). */
export interface SimilarJob {
  target: DriverInput;
  candidates: { id: string; driver: DriverInput }[];
  box: EnclosureInput;
  sim: SimulationOptions;
}

export function similarJob(s: AppState, box: EnclosureInput, candidates: SimilarJob["candidates"]): SimilarJob {
  return { target: mainDriverInput(s), candidates, box, sim: simOptionsOf(s) };
}

/** Stage 2 for one candidate (null when it won't simulate). */
export function similarDelta(job: Pick<SimilarJob, "target" | "box" | "sim">, driver: DriverInput): SimDelta | null {
  try {
    return simDelta(job.target, driver, job.box, job.sim);
  } catch {
    return null;
  }
}

/** A row of the picker in Similar mode: the stage 1 result and, once simulated, its stage 2 delta. */
export interface SimilarRow extends SimilarResult {
  /** Tier from the parameters alone. */
  scoreTier: SimilarTier;
  /** undefined: still simulating; null: couldn't simulate. */
  delta?: SimDelta | null;
}

/** Stage 1 results with whatever stage 2 deltas have come in; the delta can move a tier down. */
export function similarRows(ranked: readonly SimilarResult[], deltas: ReadonlyMap<string, SimDelta | null>): SimilarRow[] {
  return ranked.map((r) => {
    if (!deltas.has(r.id)) return { ...r, scoreTier: r.tier };
    const delta = deltas.get(r.id)!;
    return { ...r, scoreTier: r.tier, tier: demoteTier(r.tier, delta), delta };
  });
}

/** F3 change in Hz (candidate − main driver), or null. */
export const dF3Hz = (d: SimDelta | null | undefined) => (d && d.f3Target !== null && d.f3Candidate !== null ? d.f3Candidate - d.f3Target : null);

export const TIER_TEXT: Record<SimilarTier, string> = { close: "Close", usable: "Usable", risky: "Risky" };
export const TIER_ORDER: Record<SimilarTier, number> = { close: 0, usable: 1, risky: 2 };
