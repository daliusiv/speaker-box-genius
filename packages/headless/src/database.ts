/**
 * Where driver and passive radiator data comes from. The app loads db/index.json and one
 * db/<brand>.json per brand (packages/db-tools/src/bundle.ts); a Database hands out the same
 * two shapes, whether they come from the live site, a cache, or a repo checkout.
 */
import {
  driverAsPassiveRadiatorFromRecord,
  driverFromRecord,
  passiveRadiatorFromRecord,
  DRIVER_AS_PR,
  type DbIndex,
  type DriverRecord,
  type LoadedDriver,
  type LoadedPr,
  type PrRecord,
  type Shard,
} from "../../web/src/library.ts";

export type { DbIndex, DriverRecord, LoadedDriver, LoadedPr, PrRecord, Shard };
export { DRIVER_AS_PR };

export interface Database {
  /** Where the data comes from, for messages ("speakerboxgenius.com", "cache", a path). */
  readonly label: string;
  index(): Promise<DbIndex>;
  /** One brand file; rejects when the brand doesn't exist. */
  shard(brandSlug: string): Promise<Shard>;
}

export const brandOf = (id: string) => id.split("/")[0]!;

export async function driverRecord(db: Database, id: string): Promise<DriverRecord | null> {
  const rec = (await db.shard(brandOf(id)).catch(() => null))?.drivers[id];
  return rec ?? null;
}

export async function prRecord(db: Database, id: string): Promise<PrRecord | null> {
  const rec = (await db.shard(brandOf(id)).catch(() => null))?.passiveRadiators[id];
  return rec ?? null;
}

/** A database driver as the app loads it; null when the id isn't in the database. */
export async function loadDriverFrom(db: Database, id: string): Promise<LoadedDriver | null> {
  const rec = await driverRecord(db, id);
  return rec ? driverFromRecord(id, rec) : null;
}

/** A database PR (or "driver:<id>", a driver used as one) as the app loads it; null when not found. */
export async function loadPrFrom(db: Database, id: string): Promise<LoadedPr | null> {
  if (id.startsWith(DRIVER_AS_PR)) {
    const rec = await driverRecord(db, id.slice(DRIVER_AS_PR.length));
    return rec ? driverAsPassiveRadiatorFromRecord(rec) : null;
  }
  const rec = await prRecord(db, id);
  return rec ? passiveRadiatorFromRecord(rec) : null;
}

/** A Database held in memory (tests, and sources that have everything already). */
export function memoryDatabase(index: DbIndex, shards: Readonly<Record<string, Shard>>, label = "memory"): Database {
  return {
    label,
    index: async () => index,
    shard: async (brand) => {
      const s = shards[brand];
      if (!s) throw new Error(`No brand "${brand}" in the database`);
      return s;
    },
  };
}
