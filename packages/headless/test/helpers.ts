// Test database: the repo's drivers/ and passive-radiators/ as the brand files the app loads.
import { loadDatabase } from "../../db-tools/src/load.ts";
import { memoryDatabase, type Database, type DbIndex, type Shard } from "../src/database.ts";

let cached: Database | null = null;

export function repoDatabase(): Database {
  if (cached) return cached;
  const db = loadDatabase();
  const shards: Record<string, Shard> = {};
  const shard = (id: string) => (shards[id.split("/")[0]!] ??= { drivers: {}, passiveRadiators: {} });
  for (const e of db.drivers) shard(e.id).drivers[e.id] = e.data as never;
  for (const e of db.passiveRadiators) shard(e.id).passiveRadiators[e.id] = e.data as never;
  const index: DbIndex = {
    drivers: db.drivers.map((e) => ({ id: e.id, brand: e.data.brand, model: e.data.model, type: e.data.type, ohms: e.data.nominal_ohms })),
    passiveRadiators: db.passiveRadiators.map((e) => ({ id: e.id, brand: e.data.brand, model: e.data.model })),
  };
  return (cached = memoryDatabase(index, shards, "repo"));
}
