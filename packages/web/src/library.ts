import { C, RHO, estimateDriverDisplacement, TS_PARAMS, type TsParam, type TsValues } from "@sbg/engine";
import type { PrParams } from "./state.ts";

/** Shape of db/index.json produced by packages/db-tools/src/bundle.ts */
export interface DbIndex {
  /** Build timestamp; used to make sure brand files match this index. */
  generated?: string;
  drivers: ({
    id: string;
    brand: string;
    model: string;
    type: string;
    ohms: number;
    /** DVC drivers: impedance of one coil. */
    coil_ohms?: number;
    size_in?: number;
    fs?: number;
    qts?: number;
    vas_l?: number;
    xmax_mm?: number;
    pe_w?: number;
    sd_cm2?: number;
  } & DataQuality)[];
  passiveRadiators: ({ id: string; brand: string; model: string; size_in?: number; sd_cm2?: number; xmax_mm?: number } & DataQuality)[];
}

/** Where an entry's values came from, and anything that needs checking (packages/db-tools/src/plausibility.ts). */
export interface DataQuality {
  status?: "community" | "verified";
  source?: "datasheet" | "measured" | "community";
  /** "xmax-high" | "xmax-low" | "size-sd"; absent when nothing looks wrong. */
  flags?: string[];
}

/** True when an entry's Xmax looks wrong for its cone (likely peak-to-peak, or a typo). */
export const doubtsXmax = (r: DataQuality | undefined) => !!r?.flags?.some((f) => f === "xmax-high" || f === "xmax-low");

/** One line on what looks wrong, for tooltips and warnings. */
export function flagText(r: DataQuality | undefined): string | undefined {
  const f = r?.flags;
  if (!f?.length) return undefined;
  if (f.includes("xmax-high")) return "Xmax looks too large for this cone (perhaps quoted peak-to-peak). Check the datasheet before relying on excursion and maximum SPL.";
  if (f.includes("xmax-low")) return "Xmax looks too small for this driver (perhaps a typo or inches). Check the datasheet before relying on excursion and maximum SPL.";
  return "The size doesn't match the cone area (Sd). Check the datasheet.";
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
  voice_coils?: number;
  ts_wiring?: "series" | "parallel";
  ts: Record<string, number | undefined>;
  physical?: Physical;
  sources?: { url?: string; note?: string }[];
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
    max_added_mass_g?: number;
  };
}

interface Shard {
  drivers: Record<string, DriverRecord>;
  passiveRadiators: Record<string, PrRecord>;
}

const base = () => `${import.meta.env.BASE_URL}db/`;
const shardCache = new Map<string, Promise<Shard>>();

/** Version tag of the loaded index, appended to brand files so a new deploy never mixes with cached ones. */
let version = "";

export async function loadIndex(): Promise<DbIndex> {
  // GitHub Pages lets browsers cache files for 10 minutes; "no-cache" makes the
  // browser check for a newer index on every visit (cheap: 304 if unchanged).
  const r = await fetch(base() + "index.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(`index.json: ${r.status}`);
  const index = (await r.json()) as DbIndex;
  version = index.generated ? `?v=${encodeURIComponent(index.generated)}` : "";
  return index;
}

function loadShard(brandSlug: string): Promise<Shard> {
  let p = shardCache.get(brandSlug);
  if (!p) {
    p = fetch(`${base()}${brandSlug}.json${version}`).then((r) => {
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
  l2_mh?: number;
  r2_ohm?: number;
  xmax_mm?: number;
  pe_w?: number;
  displacement_l?: number;
  /** DVC drivers: the wiring the published T/S values were measured with. */
  dvcWiring?: "series" | "parallel";
  /** Baffle cutout (mm), if the database has it. */
  cutout_mm?: number;
  /** Mounting depth (mm), if the database has it. */
  depth_mm?: number;
  /** Where the values came from, for the credit line under the driver name. */
  source?: { url?: string; via?: "driver-base" };
}

/** The first source with a link, and whether it came through driver-base (CC BY 4.0, credit required). */
export function sourceOf(sources: { url?: string; note?: string }[] | undefined): LoadedDriver["source"] {
  const s = sources?.find((x) => x.url) ?? sources?.[0];
  if (!s) return undefined;
  return { url: s.url, ...(/driver-base/.test(s.note ?? "") ? { via: "driver-base" as const } : {}) };
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
    l2_mh: rec.ts.l2_mh,
    r2_ohm: rec.ts.r2_ohm,
    xmax_mm: rec.ts.xmax_mm,
    pe_w: rec.ts.pe_w,
    displacement_l: displacementOf(rec.physical),
    dvcWiring: rec.voice_coils === 2 ? (rec.ts_wiring ?? "parallel") : undefined,
    cutout_mm: rec.physical?.cutout_mm,
    depth_mm: rec.physical?.depth_mm,
    source: sourceOf(rec.sources),
  };
}

export async function loadPassiveRadiator(
  id: string,
): Promise<{ name: string; params: PrParams; displacement_l?: number; cutout_mm?: number; maxAdded_g?: number }> {
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
    cutout_mm: rec.physical?.cutout_mm,
    ...(p.max_added_mass_g !== undefined ? { maxAdded_g: p.max_added_mass_g } : {}),
  };
}

/** Ids of drivers offered as passive radiators carry this prefix (PR and driver ids can coincide). */
export const DRIVER_AS_PR = "driver:";

/**
 * A driver used as a passive radiator: an unpowered woofer works like a PR (its coil left
 * unconnected, so only its mechanical losses damp it: Q = Qms). Mms comes from the
 * datasheet or, if missing, from Fs, Vas and Sd. Its displacement (magnet and all) counts.
 */
export async function loadDriverAsPassiveRadiator(
  id: string,
): Promise<{ name: string; params: PrParams; displacement_l?: number; cutout_mm?: number }> {
  const rec = (await loadShard(brandOf(id))).drivers[id];
  if (!rec) throw new Error(`Driver ${id} not found`);
  const t = rec.ts;
  const sd = t.sd_cm2!;
  const vas = t.vas_l!;
  const xmax = t.xmax_mm;
  if (!(sd > 0) || !(vas > 0) || !(xmax !== undefined && xmax > 0)) throw new Error("This driver lacks Sd, Vas or Xmax");
  let mms = t.mms_g;
  if (!(mms !== undefined && mms > 0)) {
    const cms = vas / 1000 / (RHO * C * C * (sd / 1e4) ** 2);
    mms = (1 / ((2 * Math.PI * t.fs!) ** 2 * cms)) * 1000;
  }
  return {
    name: `${rec.brand} ${rec.model} (as PR)`,
    params: { mms_g: Math.round(mms * 10) / 10, sd_cm2: sd, xmax_mm: xmax, qms: t.qms ?? 5, vas_l: vas },
    displacement_l: displacementOf(rec.physical),
    cutout_mm: rec.physical?.cutout_mm,
  };
}

/** A PR from the PR browser: a real passive radiator, or a driver used as one. */
export function loadPrChoice(id: string) {
  return id.startsWith(DRIVER_AS_PR) ? loadDriverAsPassiveRadiator(id.slice(DRIVER_AS_PR.length)) : loadPassiveRadiator(id);
}
