/** Searching the database index: pure functions over a DbIndex (no I/O). */
import type { DbIndex } from "./database.ts";

export type IndexDriver = DbIndex["drivers"][number];
export type IndexPr = DbIndex["passiveRadiators"][number];

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 25;
/** Sizes are nominal ("6.5 in"); a driver counts as that size within this many inches. */
export const SIZE_TOLERANCE_IN = 0.3;

export interface SearchResult<T> {
  /** Everything that matched, before the limit. */
  total: number;
  results: T[];
}

const spaced = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const clampLimit = (n: number | undefined) => Math.max(1, Math.min(MAX_LIMIT, Math.floor(n ?? DEFAULT_LIMIT) || DEFAULT_LIMIT));
const nearSize = (have: number | undefined, want: number) => have !== undefined && Math.abs(have - want) <= SIZE_TOLERANCE_IN;

/** Lower is better; undefined when the entry doesn't match the query. */
function rank(e: { id: string; brand: string; model: string }, query: string): number | undefined {
  const tokens = spaced(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return 3;
  const q = compact(query);
  const model = compact(e.model);
  if (q === compact(e.id) || q === model || q === compact(e.brand + e.model)) return 0;
  const inModel = (t: string) => spaced(e.model).includes(t) || model.includes(t);
  if (tokens.every(inModel)) return 1;
  const whole = spaced(`${e.brand} ${e.model} ${e.id}`);
  const wholeCompact = compact(`${e.brand}${e.model}${e.id}`);
  const inAny = (t: string) => whole.includes(t) || wholeCompact.includes(t);
  if (tokens.every(inAny)) return compact(e.brand + e.model).includes(q) ? 2 : 3;
  return undefined;
}

function pick<T extends { id: string; brand: string; model: string }>(
  entries: T[],
  query: string | undefined,
  keep: (e: T) => boolean,
  limit: number | undefined,
): SearchResult<T> {
  const ranked: { e: T; r: number }[] = [];
  for (const e of entries) {
    if (!keep(e)) continue;
    const r = rank(e, query ?? "");
    if (r !== undefined) ranked.push({ e, r });
  }
  ranked.sort((a, b) => a.r - b.r || a.e.brand.localeCompare(b.e.brand) || a.e.model.localeCompare(b.e.model, undefined, { numeric: true }) || a.e.id.localeCompare(b.e.id));
  return { total: ranked.length, results: ranked.slice(0, clampLimit(limit)).map((x) => x.e) };
}

export interface DriverQuery {
  query?: string;
  type?: string;
  size_in?: number;
  fs_max?: number;
  qts_max?: number;
  xmax_min?: number;
  limit?: number;
}

/** Drivers matching a free-text query (brand, model, id) and optional filters; best matches first. */
export function searchDrivers(index: DbIndex, q: DriverQuery = {}): SearchResult<IndexDriver> {
  const type = q.type?.trim().toLowerCase();
  return pick(
    index.drivers,
    q.query,
    (d) =>
      (type === undefined || d.type.toLowerCase() === type) &&
      (q.size_in === undefined || nearSize(d.size_in, q.size_in)) &&
      (q.fs_max === undefined || (d.fs !== undefined && d.fs <= q.fs_max)) &&
      (q.qts_max === undefined || (d.qts !== undefined && d.qts <= q.qts_max)) &&
      (q.xmax_min === undefined || (d.xmax_mm !== undefined && d.xmax_mm >= q.xmax_min)),
    q.limit,
  );
}

export interface PassiveRadiatorQuery {
  query?: string;
  size_in?: number;
  sd_min?: number;
  limit?: number;
}

export function searchPassiveRadiators(index: DbIndex, q: PassiveRadiatorQuery = {}): SearchResult<IndexPr> {
  return pick(
    index.passiveRadiators,
    q.query,
    (p) => (q.size_in === undefined || nearSize(p.size_in, q.size_in)) && (q.sd_min === undefined || (p.sd_cm2 !== undefined && p.sd_cm2 >= q.sd_min)),
    q.limit,
  );
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** Ids most like a mistyped one, for "did you mean". Ids in the same brand come first on a tie of distance. */
export function closestIds(index: DbIndex, id: string, n = 5, kind: "driver" | "pr" = "driver"): string[] {
  const want = id.trim().toLowerCase();
  const [wantBrand, ...rest] = want.split("/");
  const wantModel = rest.length ? rest.join("/") : want;
  const entries = kind === "driver" ? index.drivers : index.passiveRadiators;
  const scored = entries
    .filter((e) => e.id.toLowerCase() !== want)
    .map((e) => {
      const [brand, ...m] = e.id.toLowerCase().split("/");
      const sameBrand = rest.length > 0 && brand === wantBrand;
      const modelDist = editDistance(wantModel, m.join("/"));
      // Same brand: only the model part counts. Otherwise the whole id, or a model typed without its brand (penalised).
      const score = sameBrand ? modelDist : Math.min(editDistance(want, e.id.toLowerCase()), modelDist + 2);
      return { id: e.id, score };
    });
  scored.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return scored.slice(0, Math.max(0, n)).map((s) => s.id);
}
