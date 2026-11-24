/**
 * The two shapes the web app (and the local MCP server) load, built from a validated database:
 * db/index.json (search index) and one db/<brand-slug>.json per brand. Pure: no file access.
 */
import type { LoadResult } from "./load.ts";
import { prTravel, type Source } from "../../schema/src/index.ts";
import { doubtsXmax } from "./plausibility.ts";
import { variantFamilies } from "./variants.ts";

/** Where the values came from, for the app's badges: measured beats datasheet beats community. */
const sourceKind = (sources: Source[]) =>
  sources.some((s) => s.kind === "measured") ? "measured" : sources.some((s) => s.kind === "datasheet") ? "datasheet" : "community";

export function buildIndex(db: LoadResult, generated: string = new Date().toISOString()) {
  // Versions of one driver (impedance / voice coils) share a family key: the first id in the family.
  const families = variantFamilies(db.drivers);
  return {
    generated,
    brands: Object.fromEntries(db.brands),
    drivers: db.drivers.map(({ id, data: d, flags }) => ({
      id,
      brand: d.brand,
      model: d.model,
      type: d.type,
      ohms: d.nominal_ohms,
      // DVC: per-coil impedance, for labels like "2+2 Ω".
      coil_ohms: d.voice_coils === 2 ? (d.ts_wiring === "series" ? d.nominal_ohms / 2 : d.nominal_ohms * 2) : undefined,
      size_in: d.size_in,
      fs: d.ts.fs,
      qts: d.ts.qts ?? (d.ts.qms * d.ts.qes) / (d.ts.qms + d.ts.qes),
      // For EBP (Fs/Qes) in the picker's "Suits" filter.
      qes: d.ts.qes,
      vas_l: d.ts.vas_l,
      xmax_mm: d.ts.xmax_mm,
      pe_w: d.ts.pe_w,
      // For "use a driver as a passive radiator".
      sd_cm2: d.ts.sd_cm2,
      // For substitute scoring (similar drivers): fit check and own-versions filter.
      cutout_mm: d.physical?.cutout_mm,
      depth_mm: d.physical?.depth_mm,
      family: families.get(id)?.[0],
      // Xmax flagged as implausible (plausibility.ts): scoring treats it as missing.
      xmax_doubtful: doubtsXmax(flags.map((f) => f.code)) || undefined,
      status: d.status,
      source: sourceKind(d.sources),
      // Values to check against the datasheet (plausibility.ts); only when there are any.
      flags: flags.length ? flags.map((f) => f.code) : undefined,
    })),
    passiveRadiators: db.passiveRadiators.map(({ id, data: p, flags }) => ({
      id,
      brand: p.brand,
      model: p.model,
      size_in: p.size_in,
      sd_cm2: p.params.sd_cm2,
      xmax_mm: prTravel(p.params).mm,
      // No linear Xmax published: the figure is the mechanical limit.
      xmech: prTravel(p.params).mechanical || undefined,
      status: p.status,
      source: sourceKind(p.sources),
      flags: flags.length ? flags.map((f) => f.code) : undefined,
    })),
  };
}

export type BrandShard = { drivers: Record<string, unknown>; passiveRadiators: Record<string, unknown> };

/** Full records, grouped by brand slug. */
export function buildShards(db: LoadResult): Map<string, BrandShard> {
  const shards = new Map<string, BrandShard>();
  const shard = (brand: string) => {
    let s = shards.get(brand);
    if (!s) shards.set(brand, (s = { drivers: {}, passiveRadiators: {} }));
    return s;
  };
  for (const e of db.drivers) shard(e.id.split("/")[0]!).drivers[e.id] = e.data;
  for (const e of db.passiveRadiators) shard(e.id.split("/")[0]!).passiveRadiators[e.id] = e.data;
  return shards;
}
