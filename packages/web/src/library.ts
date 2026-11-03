import { C, RHO, estimateDriverDisplacement, TS_PARAMS, type TsParam, type TsValues } from "@sbg/engine";
import type { PrParams } from "./state.ts";

/** Shape of db/index.json produced by packages/db-tools/src/bundle.ts */
export interface DbIndex {
  drivers: { id: string; brand: string; model: string; type: string; ohms: number; size_in?: number }[];
  passiveRadiators: { id: string; brand: string; model: string; size_in?: number }[];
}

interface Physical {
  displacement_l?: number;
  cutout_mm?: number;
  depth_mm?: number;
}

interface DriverRecord {
  brand: string;
  model: string;
  nominal_ohms?: number;
  ts: Record<string, number | undefined>;
  physical?: Physical;
}

interface PrRecord {
  brand: string;
  model: string;
  physical?: Physical;
  params: {
    mms_g: number;
    sd_cm2: number;
    xmax_mm: number;
    qms?: number;
    vas_l?: number;
    cms_mm_per_n?: number;
    fs?: number;
  };
}

interface Shard {
  drivers: Record<string, DriverRecord>;
  passiveRadiators: Record<string, PrRecord>;
}

const base = () => `${import.meta.env.BASE_URL}db/`;
const shardCache = new Map<string, Promise<Shard>>();

export async function loadIndex(): Promise<DbIndex> {
  const r = await fetch(base() + "index.json");
  if (!r.ok) throw new Error(`index.json: ${r.status}`);
  return r.json();
}

function loadShard(brandSlug: string): Promise<Shard> {
  let p = shardCache.get(brandSlug);
  if (!p) {
    p = fetch(`${base()}${brandSlug}.json`).then((r) => {
      if (!r.ok) throw new Error(`${brandSlug}.json: ${r.status}`);
      return r.json() as Promise<Shard>;
    });
    shardCache.set(brandSlug, p);
  }
  return p;
}

const brandOf = (id: string) => id.split("/")[0]!;

/** Published displacement, or a rough estimate from cutout and depth. */
function displacementOf(p: Physical | undefined): number | undefined {
  if (!p) return undefined;
  if (p.displacement_l !== undefined) return p.displacement_l;
  if (p.cutout_mm !== undefined && p.depth_mm !== undefined) {
    return Math.round(estimateDriverDisplacement(p.cutout_mm, p.depth_mm) * 100) / 100;
  }
  return undefined;
}

export interface LoadedDriver {
  name: string;
  brand: string;
  nominal_ohms?: number;
  /** Every published T/S value, as "entered" values for the solver. */
  ts: TsValues;
  le_mh?: number;
  xmax_mm?: number;
  pe_w?: number;
  displacement_l?: number;
}

export async function loadDriver(id: string): Promise<LoadedDriver> {
  const rec = (await loadShard(brandOf(id))).drivers[id];
  if (!rec) throw new Error(`Driver ${id} not found`);
  const ts: TsValues = {};
  for (const k of Object.keys(TS_PARAMS) as TsParam[]) {
    const v = rec.ts[k];
    if (typeof v === "number") ts[k] = v;
  }
  return {
    name: `${rec.brand} ${rec.model}`,
    brand: rec.brand,
    nominal_ohms: rec.nominal_ohms,
    ts,
    le_mh: rec.ts.le_mh,
    xmax_mm: rec.ts.xmax_mm,
    pe_w: rec.ts.pe_w,
    displacement_l: displacementOf(rec.physical),
  };
}

export async function loadPassiveRadiator(
  id: string,
): Promise<{ name: string; params: PrParams; displacement_l?: number }> {
  const rec = (await loadShard(brandOf(id))).passiveRadiators[id];
  if (!rec) throw new Error(`Passive radiator ${id} not found`);
  const p = rec.params;
  const sd = p.sd_cm2 / 1e4;
  let vas = p.vas_l;
  if (vas === undefined) {
    // Convert compliance to an equivalent volume so the app only has to deal with one form.
    const cms = p.cms_mm_per_n !== undefined ? p.cms_mm_per_n / 1000 : 1 / ((2 * Math.PI * p.fs!) ** 2 * (p.mms_g / 1000));
    vas = cms * RHO * C * C * sd * sd * 1000;
  }
  return {
    name: `${rec.brand} ${rec.model}`,
    params: { mms_g: p.mms_g, sd_cm2: p.sd_cm2, xmax_mm: p.xmax_mm, qms: p.qms ?? 10, vas_l: Math.round(vas * 10) / 10 },
    displacement_l: displacementOf(rec.physical),
  };
}
