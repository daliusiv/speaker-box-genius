import { findPassiveRadiators, type PrCandidate } from "@sbg/engine";
import { sizeAllForDriver, ventedAlignmentFor } from "./presets.ts";
import { alignmentDriver, checkFromHz, driverInputOf, simOptionsOf, solveDriver } from "./sim.ts";
import type { AppState, DesignState, PrParams } from "./state.ts";

/** A passive radiator from the database, as the PR finder loads them. */
export type QuickPr = PrCandidate & { params: PrParams; displacement_l?: number; cutout_mm?: number };

/**
 * A new driver picked straight from the Design assistant's "I have a speaker driver": every box
 * sized for it, as "Size all boxes" does (ported boxes get the port that suits them,
 * bestVentedPort), after giving each PR box the best passive radiator in the database for it
 * (the PR finder's top pick). Nothing else is changed. `prs` empty or null: PR boxes keep theirs.
 */
export function sizeForNewDriver(s: AppState, prs: QuickPr[] | null): { state: AppState; changed: string[]; skipped: string[] } {
  const solved = solveDriver(s);
  const align = alignmentDriver(solved, s);
  const qb3 = align && ventedAlignmentFor(align, s.drivers);
  const extra: string[] = [];
  let volume = s.volume;
  let designs: DesignState[] = s.designs;
  if (qb3) {
    let best: ReturnType<typeof findPassiveRadiators>[number] | undefined;
    if (prs && prs.length > 0 && designs.some((d) => d.kind === "pr")) {
      best = findPassiveRadiators(driverInputOf(s, solved), prs, {
        vb_l: qb3.vb_l,
        targetFb: qb3.fb,
        losses: { ql: s.settings.losses.ql, qa: s.settings.losses.qa },
        sim: simOptionsOf(s, true),
        fMin: checkFromHz(s.highPass.on),
      }).find((r) => r.ok);
    }
    const pr = best && prs!.find((c) => c.id === best.id);
    designs = designs.map((d): DesignState => {
      if (s.volume.link === d.id) return d;
      if (d.kind === "pr" && pr && best) {
        extra.push(`${d.name}: ${best.count} × ${pr.name} (the best match in the database)`);
        return { ...d, prName: pr.name, params: pr.params, count: best.count, addedMass_g: Math.round(best.addedMass_g), extra: [] };
      }
      return d;
    });
    if (pr) volume = { ...volume, ...(pr.displacement_l !== undefined ? { prDisp_l: pr.displacement_l } : {}), prCutout_mm: pr.cutout_mm ?? 0 };
  }
  const r = sizeAllForDriver({ ...s, designs, volume });
  return { state: r.state, changed: [...r.changed, ...extra], skipped: r.skipped };
}
