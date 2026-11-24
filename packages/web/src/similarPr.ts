/**
 * PR finder in "closest" order (Similar drivers step 6): which PR the design uses, and the
 * finder's list ordered by how alike each PR group is to it (engine scorePr).
 */
import { scorePr, type PrFinderResult, type SimilarTier } from "@sbg/engine";
import type { DbIndex } from "./library.ts";
import type { PrDesign, PrParams } from "./state.ts";

/** The PR the design uses, when it came from the finder's list (database PR or driver as PR) and still has that name. */
export function prInUse(design: PrDesign, db: DbIndex | null): { id: string; count: number; label: string } | null {
  if (!design.prId) return null;
  const row = db?.passiveRadiators.find((r) => r.id === design.prId);
  if (row && `${row.brand} ${row.model}` !== design.prName) return null;
  return { id: design.prId, count: design.count, label: row?.model ?? design.prName };
}

export type ScoredPr = PrFinderResult & { tier?: SimilarTier; distance?: number };

/**
 * The finder's list in "closest" order: the PR in use first, then by how alike each PR group is
 * to it (scorePr); in "best" order as ranked (best match first). Each gets its likeness tier.
 */
export function orderFinderResults(
  ok: readonly PrFinderResult[],
  ref: (PrParams & { count: number }) | null,
  inUse: { id: string; count: number } | null,
  paramsOf: (id: string) => PrParams | undefined,
  order: "closest" | "best",
): ScoredPr[] {
  const scored: ScoredPr[] = ok.map((r) => {
    const p = paramsOf(r.id);
    if (!ref || !p) return r;
    const s = scorePr(ref, { count: r.count, ...p });
    return { ...r, tier: s.tier, distance: s.distance };
  });
  if (order === "best" || !ref) return scored;
  const used = (r: ScoredPr) => inUse !== null && r.id === inUse.id && r.count === inUse.count;
  return scored
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(used(b.r)) - Number(used(a.r)) || (a.r.distance ?? Infinity) - (b.r.distance ?? Infinity) || a.i - b.i)
    .map((x) => x.r);
}
