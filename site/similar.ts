/**
 * Substitutes for a driver page: the drivers whose published T/S parameters are closest
 * (engine `rankSimilar`, adapted from Boxdex), each then simulated in the target's own boxes
 * (engine `simDelta`): ΔF3, Δmax SPL, level at 2.83 V. A much different F3 or much less max SPL
 * in the page's lead box moves a substitute down a tier; static pages leave out "risky" ones.
 */
import { demoteTier, rankSimilar, simDelta, type DriverInput, type SimDelta, type SimilarInput, type SimilarResult, type SimilarTier } from "../packages/engine/src/index.ts";
import { doubtsXmax } from "../packages/db-tools/src/plausibility.ts";
import { variantFamilies } from "../packages/db-tools/src/variants.ts";
import { actingFactor, builtVbOf, driverInputOf, enclosureOf, enclosureOptsOf, lossesFor, simOptionsOf, solveDriver } from "../packages/web/src/sim.ts";
import type { DesignState } from "../packages/web/src/state.ts";
import type { DriverPage } from "./drivers.ts";

export interface Substitute extends SimilarResult {
  label: string;
  /** Tier from the parameters alone, before the same-box check. */
  scoreTier: SimilarTier;
  /** The same-box check in each of the target page's boxes, in page order; the first one sets the tier. */
  boxes: { kind: DesignState["kind"]; delta: SimDelta }[];
}

/** Substitutes per page on driver pages (decision 6). */
export const PAGE_SUBSTITUTES = 10;

/** The scoring's view of a driver page: published values, the doubtful Xmax flagged, its variant family. */
export function similarInput(p: DriverPage, family?: string): SimilarInput {
  const r = p.rec;
  const v = solveDriver(p.state).values;
  const dvc = r.voice_coils === 2;
  // DVC: nominal_ohms is as wired for the T/S (ts_wiring); one coil is twice that in parallel, half in series.
  const coil = dvc ? ((r.ts_wiring ?? "parallel") === "parallel" ? r.nominal_ohms * 2 : r.nominal_ohms / 2) : undefined;
  return {
    id: p.id,
    brand: p.brand,
    type: r.type,
    ...(r.size_in !== undefined ? { size_in: r.size_in } : {}),
    sd_cm2: r.ts.sd_cm2,
    fs: r.ts.fs,
    qts: v.qts ?? r.ts.qts!,
    vas_l: v.vas_l ?? r.ts.vas_l!,
    ...(v.qes !== undefined ? { qes: v.qes } : {}),
    ...(r.ts.xmax_mm !== undefined ? { xmax_mm: r.ts.xmax_mm } : {}),
    ...(doubtsXmax(p.flags.map((f) => f.code)) ? { xmax_doubtful: true } : {}),
    ...(r.ts.pe_w !== undefined ? { pe_w: r.ts.pe_w } : {}),
    ...(r.physical?.cutout_mm !== undefined ? { cutout_mm: r.physical.cutout_mm } : {}),
    ...(r.physical?.depth_mm !== undefined ? { depth_mm: r.physical.depth_mm } : {}),
    ohms: r.nominal_ohms,
    ...(dvc ? { voice_coils: 2, coil_ohms: coil } : {}),
    ...(family ? { family } : {}),
  };
}

/**
 * The page's driver as the engine simulates it, with only published limits: the page state
 * falls back to the app's defaults for a missing Xmax or Pe, and a doubtful Xmax is left out.
 */
export function pageDriver(p: DriverPage): DriverInput {
  const d = driverInputOf(p.state, solveDriver(p.state));
  const xmax = p.rec.ts.xmax_mm !== undefined && !doubtsXmax(p.flags.map((f) => f.code)) ? p.rec.ts.xmax_mm : undefined;
  return { ...d, xmax_mm: xmax, pe_w: p.rec.ts.pe_w };
}

/** Same-box check of `c` in each of `p`'s boxes, in page order; `at` (Hz) also reads both max SPL curves there. */
export function boxDeltas(p: DriverPage, c: DriverPage, drivers: { t?: DriverInput; c?: DriverInput } = {}, at?: number): Substitute["boxes"] {
  const s = p.state;
  const t = drivers.t ?? pageDriver(p);
  const cd = drivers.c ?? pageDriver(c);
  const opts = simOptionsOf(s);
  const out: Substitute["boxes"] = [];
  for (const d of p.designs) {
    if (d.compare) continue;
    const ds = d.design;
    const vb = builtVbOf(s, ds) * actingFactor(s, ds);
    const box = enclosureOf(ds, vb, lossesFor(s, ds), s.volume.wall_mm, s.volume, enclosureOptsOf(s));
    out.push({ kind: ds.kind, delta: simDelta(t, cd, box, opts, at) });
  }
  return out;
}

const cache = new WeakMap<readonly DriverPage[], { inputs: SimilarInput[]; byId: Map<string, DriverPage>; drivers: Map<string, DriverInput> }>();

function indexOf(pages: readonly DriverPage[]) {
  let x = cache.get(pages);
  if (!x) {
    const families = variantFamilies(pages.map((p) => ({ id: p.id, file: "", data: p.rec, flags: p.flags })));
    x = { inputs: pages.map((p) => similarInput(p, families.get(p.id)?.[0])), byId: new Map(pages.map((p) => [p.id, p])), drivers: new Map() };
    cache.set(pages, x);
  }
  return x;
}

/**
 * Scored substitutes for a driver page among `pages`: the best `k` by parameters (at most 3 from
 * its own brand, never its own versions), each simulated in the page's boxes; the lead box's
 * result can move it down a tier. `risky` ones are left out unless asked for (pages hide them).
 */
export function substitutesFor(page: DriverPage, pages: readonly DriverPage[], o: { k?: number; includeRisky?: boolean; at?: number } = {}): Substitute[] {
  const ix = indexOf(pages);
  const target = ix.inputs.find((x) => x.id === page.id) ?? similarInput(page);
  const driverOf = (p: DriverPage) => ix.drivers.get(p.id) ?? ix.drivers.set(p.id, pageDriver(p)).get(p.id)!;
  const out: Substitute[] = [];
  for (const r of rankSimilar(target, ix.inputs, { k: o.k ?? PAGE_SUBSTITUTES })) {
    const c = ix.byId.get(r.id)!;
    const boxes = boxDeltas(page, c, { t: driverOf(page), c: driverOf(c) }, o.at);
    const tier = demoteTier(r.tier, boxes[0]?.delta ?? null);
    if (tier === "risky" && !o.includeRisky) continue;
    out.push({ ...r, label: `${c.brand} ${c.model}`, scoreTier: r.tier, tier, boxes });
  }
  return out;
}
