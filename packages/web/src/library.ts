import { C, RHO } from "@sbg/engine";
import type { AppState } from "./state.ts";

/** Shape of db/index.json produced by packages/db-tools/src/bundle.ts */
export interface DbIndex {
  drivers: { id: string; brand: string; model: string; type: string; ohms: number; size_in?: number }[];
  passiveRadiators: { id: string; brand: string; model: string; size_in?: number }[];
}

interface DriverRecord {
  brand: string;
  model: string;
  ts: {
    fs: number;
    qms: number;
    qes: number;
    vas_l: number;
    re: number;
    sd_cm2: number;
    le_mh?: number;
    xmax_mm?: number;
    pe_w?: number;
  };
}

interface PrRecord {
  brand: string;
  model: string;
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

/** Fetch a driver and convert it to the app's driver state, keeping current values for anything unpublished. */
export async function loadDriver(id: string, current: AppState["driver"]): Promise<{ name: string; driver: AppState["driver"] }> {
  const rec = (await loadShard(brandOf(id))).drivers[id];
  if (!rec) throw new Error(`Driver ${id} not found`);
  const t = rec.ts;
  return {
    name: `${rec.brand} ${rec.model}`,
    driver: {
      fs: t.fs,
      qms: t.qms,
      qes: t.qes,
      vas_l: t.vas_l,
      re: t.re,
      sd_cm2: t.sd_cm2,
      le_mh: t.le_mh ?? 0,
      xmax_mm: t.xmax_mm ?? current.xmax_mm,
      pe_w: t.pe_w ?? current.pe_w,
    },
  };
}

export async function loadPassiveRadiator(id: string): Promise<{ name: string; params: AppState["pr"]["params"] }> {
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
  };
}
