import type { PrCandidate } from "@sbg/engine";
import { passiveRadiatorFromRecord, type PrRecord } from "../../web/src/library.ts";
import type { Database } from "./database.ts";

/** A database PR as the PR finder takes it (the same mapping as site/drivers.ts `prCandidate`). */
export function prCandidateFromRecord(id: string, rec: PrRecord): PrCandidate {
  const pr = passiveRadiatorFromRecord(rec);
  const cut = rec.physical?.cutout_mm;
  return { id, name: pr.name, pr: pr.params, od_cm: cut !== undefined ? cut / 10 + 2.5 : undefined };
}

/** Every passive radiator in the database, as PR finder candidates (reads each brand file that has any). */
export async function prCandidates(db: Database): Promise<PrCandidate[]> {
  const index = await db.index();
  const brands = [...new Set(index.passiveRadiators.map((p) => p.id.split("/")[0]!))].sort();
  const shards = await Promise.all(brands.map((b) => db.shard(b)));
  const out: PrCandidate[] = [];
  for (const shard of shards) {
    for (const [id, rec] of Object.entries(shard.passiveRadiators)) out.push(prCandidateFromRecord(id, rec));
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
