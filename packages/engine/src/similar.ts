/**
 * Similar drivers: substitutes for a driver, ranked by how close their published T/S parameters
 * are (a weighted log-ratio distance, adapted from Boxdex, MIT), with fit labels (cutout, depth,
 * load). Pure: the callers pass the database rows. The same-box simulation check is `simDelta`
 * (stage 2), which can move a substitute down a tier (`demoteTier`).
 */
import { C } from "./constants.ts";
import type { DriverInput, EnclosureInput } from "./model.ts";
import { simulate, type LimitKind, type SimulationOptions } from "./simulate.ts";

/** One driver as the scoring sees it. Optional values that aren't published are left out, never guessed. */
export interface SimilarInput {
  id: string;
  brand: string;
  /** Database type: woofer, subwoofer, midbass, car-audio, midrange, full-range or other. */
  type: string;
  size_in?: number;
  sd_cm2: number;
  fs: number;
  qts: number;
  vas_l: number;
  qes?: number;
  xmax_mm?: number;
  /** The database flags this Xmax as doubtful (it then counts as missing). */
  xmax_doubtful?: boolean;
  pe_w?: number;
  cutout_mm?: number;
  depth_mm?: number;
  /** Nominal impedance as published (Ω). */
  ohms: number;
  voice_coils?: number;
  /** One coil's nominal impedance (Ω), for dual-coil drivers. */
  coil_ohms?: number;
  /** Impedance / coil variant family: drivers of one family are versions of one part, never each other's substitutes. */
  family?: string;
}

export type SimilarPool = "bass" | "mid";
export type SimilarTier = "close" | "usable" | "risky";
export type SimilarParam = "qts" | "fs" | "vas" | "xmax" | "sensitivity" | "pe";

export interface FitCheck {
  /** drop-in: within 3 mm; enlarge: the hole must be cut bigger; ring: the new driver needs an adapter ring. */
  cutout: "drop-in" | "enlarge" | "ring" | "unknown";
  /** ok: no more than 5 mm deeper. */
  depth: "ok" | "deeper" | "unknown";
  /** same: same nominal impedance; dvc: reaches it by wiring its two coils in series or parallel. */
  load: "same" | "dvc" | "differs";
}

export interface SimilarResult {
  id: string;
  /** Weighted mean |log2(candidate / target)| over the parameters both publish (0 = identical). */
  distance: number;
  tier: SimilarTier;
  /** Parameters left out of the score because one of the two doesn't publish them (or the Xmax is doubtful). */
  missing: SimilarParam[];
  /** Found only after widening the size rule (fewer than 5 of the same size). */
  differentSize: boolean;
  fit: FitCheck;
}

/** Weights of each parameter's |log2 ratio| in the distance. */
export const SIMILAR_WEIGHTS: Record<SimilarParam, number> = { qts: 3, fs: 2.5, vas: 2, xmax: 1.5, sensitivity: 1, pe: 1 };
/** A candidate better than the target here (more Xmax, sensitivity or power handling) counts this fraction of the difference. */
export const BETTER_FACTOR = 0.25;
/** Tier limits on the distance. */
export const TIER_CLOSE = 0.15;
export const TIER_USABLE = 0.4;
/** Fewer candidates than this of the exact size widen the size rule by one standard size step. */
export const MIN_SAME_SIZE = 5;
/** Standard cone sizes (inches), for the widened size rule. */
export const STANDARD_SIZES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.25, 6, 6.5, 7, 8, 10, 12, 15, 18, 21, 24] as const;

/** Which types can stand in for each other (database type labels differ between brands for the same kind of part). */
export function poolOf(type: string): SimilarPool | null {
  if (type === "woofer" || type === "subwoofer" || type === "midbass" || type === "car-audio") return "bass";
  if (type === "midrange" || type === "full-range") return "mid";
  return null;
}

/** Reference efficiency η0 = 4π²·fs³·Vas / (c³·Qes), Vas in m³. */
export function efficiency0(fs: number, vas_l: number, qes: number): number {
  return (4 * Math.PI ** 2 * fs ** 3 * (vas_l / 1000)) / (C ** 3 * qes);
}

/** Sensitivity at 1 W / 1 m (half space) from T/S: 112.1 + 10·log10 η0 dB. Null without Qes. */
export function sensitivity1W(d: Pick<SimilarInput, "fs" | "vas_l" | "qes">): number | null {
  if (!(d.qes && d.qes > 0 && d.fs > 0 && d.vas_l > 0)) return null;
  return 112.1 + 10 * Math.log10(efficiency0(d.fs, d.vas_l, d.qes));
}

const pos = (x: number | undefined): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;
const xmaxOf = (d: SimilarInput) => (d.xmax_doubtful ? undefined : d.xmax_mm);

/** The score: weighted mean of each shared parameter's |log2 ratio| (sensitivity: |ΔdB| / 6), with the parameters left out. */
export function paramDistance(t: SimilarInput, c: SimilarInput): { distance: number; missing: SimilarParam[] } {
  let sum = 0;
  let weights = 0;
  const missing: SimilarParam[] = [];
  const term = (p: SimilarParam, tv: number | null | undefined, cv: number | null | undefined, higherBetter: boolean, diff: (t: number, c: number) => number) => {
    if (tv === null || tv === undefined || cv === null || cv === undefined || !Number.isFinite(tv) || !Number.isFinite(cv)) {
      missing.push(p);
      return;
    }
    let d = Math.abs(diff(tv, cv));
    if (higherBetter && cv > tv) d *= BETTER_FACTOR;
    sum += SIMILAR_WEIGHTS[p] * d;
    weights += SIMILAR_WEIGHTS[p];
  };
  const log = (t: number, c: number) => Math.log2(c / t);
  const opt = (x: number | undefined) => (pos(x) ? x : null);
  term("qts", opt(t.qts), opt(c.qts), false, log);
  term("fs", opt(t.fs), opt(c.fs), false, log);
  term("vas", opt(t.vas_l), opt(c.vas_l), false, log);
  term("xmax", opt(xmaxOf(t)), opt(xmaxOf(c)), true, log);
  term("sensitivity", sensitivity1W(t), sensitivity1W(c), true, (t, c) => (c - t) / 6);
  term("pe", opt(t.pe_w), opt(c.pe_w), true, log);
  return { distance: weights ? sum / weights : Infinity, missing };
}

/** close ≤ 0.15 < usable ≤ 0.4 < risky; without a (trusted) Xmax on both, at best usable. */
export function tierOf(distance: number, missing: readonly SimilarParam[] = []): SimilarTier {
  const tier: SimilarTier = distance <= TIER_CLOSE ? "close" : distance <= TIER_USABLE ? "usable" : "risky";
  return tier === "close" && missing.includes("xmax") ? "usable" : tier;
}

/** The nominal loads a driver can present: its own, or for two coils both wirings. */
function loadsOf(d: SimilarInput): number[] {
  if ((d.voice_coils ?? 1) === 2 && pos(d.coil_ohms)) return [d.coil_ohms * 2, d.coil_ohms / 2];
  return [d.ohms];
}

/** Will the candidate fit where the target was: cutout, depth and amplifier load. Unknowns are labelled, not penalised. */
export function fitCheck(t: SimilarInput, c: SimilarInput): FitCheck {
  const cutout: FitCheck["cutout"] =
    pos(t.cutout_mm) && pos(c.cutout_mm) ? (Math.abs(c.cutout_mm - t.cutout_mm) <= 3 ? "drop-in" : c.cutout_mm > t.cutout_mm ? "enlarge" : "ring") : "unknown";
  const depth: FitCheck["depth"] = pos(t.depth_mm) && pos(c.depth_mm) ? (c.depth_mm <= t.depth_mm + 5 ? "ok" : "deeper") : "unknown";
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  const load: FitCheck["load"] = same(c.ohms, t.ohms) ? "same" : loadsOf(c).some((o) => same(o, t.ohms)) ? "dvc" : "differs";
  return { cutout, depth, load };
}

/** Cone diameter from Sd (cm). */
const sdDiameter = (sd_cm2: number) => Math.sqrt((4 * sd_cm2) / Math.PI);

/** The standard sizes either side of `size` (itself excluded): the widened size range [below, above]. */
export function sizeStep(size: number): [number, number] {
  const below = [...STANDARD_SIZES].reverse().find((s) => s < size - 1e-9) ?? size;
  const above = STANDARD_SIZES.find((s) => s > size + 1e-9) ?? size;
  return [below, above];
}

/**
 * Stage 1: every candidate in the target's pool and size (widened by one standard step when fewer
 * than 5 are left), scored and sorted, at most `maxSameBrand` from the target's brand, the best `k`.
 */
export function rankSimilar(target: SimilarInput, all: readonly SimilarInput[], o: { k?: number; maxSameBrand?: number } = {}): SimilarResult[] {
  const k = o.k ?? 10;
  const maxSameBrand = o.maxSameBrand ?? 3;
  const pool = poolOf(target.type);
  if (!pool) return [];
  const pooled = all.filter((c) => c.id !== target.id && poolOf(c.type) === pool && !(target.family && c.family === target.family));
  const td = sdDiameter(target.sd_cm2);
  const nearSd = (c: SimilarInput) => Math.abs(sdDiameter(c.sd_cm2) / td - 1) <= 0.15;
  let picked: { c: SimilarInput; differentSize: boolean }[];
  if (target.size_in === undefined) {
    // No published size: by cone area alone (±15 % in diameter).
    picked = pooled.filter(nearSd).map((c) => ({ c, differentSize: c.size_in !== undefined }));
  } else {
    const size = target.size_in;
    picked = pooled.filter((c) => c.size_in === size).map((c) => ({ c, differentSize: false }));
    if (picked.length < MIN_SAME_SIZE) {
      const [lo, hi] = sizeStep(size);
      picked = pooled
        .filter((c) => (c.size_in === undefined ? nearSd(c) : c.size_in >= lo && c.size_in <= hi))
        .map((c) => ({ c, differentSize: c.size_in !== size }));
    }
  }
  const scored = picked
    .map(({ c, differentSize }) => {
      const { distance, missing } = paramDistance(target, c);
      return { c, differentSize, distance, missing };
    })
    .filter((x) => Number.isFinite(x.distance))
    .sort((a, b) => a.distance - b.distance || (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0));
  const out: SimilarResult[] = [];
  let sameBrand = 0;
  for (const x of scored) {
    if (out.length >= k) break;
    if (x.c.brand === target.brand) {
      if (sameBrand >= maxSameBrand) continue;
      sameBrand++;
    }
    out.push({ id: x.c.id, distance: x.distance, tier: tierOf(x.distance, x.missing), missing: x.missing, differentSize: x.differentSize, fit: fitCheck(target, x.c) });
  }
  return out;
}

/** Stage 2: how the candidate does in the target's own box (see `simDelta`). */
export interface SimDelta {
  /** F3 of each (Hz). Null where the response doesn't fall 3 dB in range. */
  f3Target: number | null;
  f3Candidate: number | null;
  /** (F3 candidate − F3 target) / F3 target; null without both. */
  dF3: number | null;
  /** Mean max SPL over the octave above the target's F3, candidate − target (dB). Null without both Xmax or an F3. */
  dMaxSpl: number | null;
  /** Passband level at 2.83 V, candidate − target (dB). */
  dLevel283: number;
  /** Port or PR limits that cap the candidate's max SPL in that octave but not the target's. */
  worseLimits: ("port" | "pr-xmax")[];
  /** The candidate has no power rating: it was given the target's. */
  peFromTarget: boolean;
  /** Max SPL of each at the frequency asked for (`at`), log-interpolated; null when not asked or without both Xmax. */
  maxSplAt: { freq: number; target: number; candidate: number } | null;
}

/** F3 this fraction higher (less bass), or max SPL this many dB lower, moves a substitute down one tier. */
export const DEMOTE_F3 = 0.15;
export const DEMOTE_MAX_SPL_DB = -3;
/** Points per simulation in the same-box check. */
export const SIM_DELTA_POINTS = 120;

const octaveMean = (freq: ArrayLike<number>, y: ArrayLike<number>, lo: number) => {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < freq.length; i++) {
    const f = freq[i]!;
    if (f >= lo && f <= 2 * lo && Number.isFinite(y[i]!)) {
      sum += y[i]!;
      n++;
    }
  }
  return n ? sum / n : null;
};

/** The value at frequency f, log-interpolated on the sweep's grid (clamped to its ends). */
const valueAt = (freq: ArrayLike<number>, y: ArrayLike<number>, f: number) => {
  let i = 0;
  while (i < freq.length - 2 && freq[i + 1]! < f) i++;
  const t = Math.min(1, Math.max(0, Math.log(f / freq[i]!) / Math.log(freq[i + 1]! / freq[i]!)));
  return y[i]! + (y[i + 1]! - y[i]!) * t;
};

const octaveKinds = (freq: ArrayLike<number>, kinds: readonly LimitKind[], lo: number) => {
  const out = new Set<LimitKind>();
  for (let i = 0; i < freq.length; i++) if (freq[i]! >= lo && freq[i]! <= 2 * lo) out.add(kinds[i]!);
  return out;
};

/**
 * Both drivers in the target's box (same volume, port or PRs and their mass), each at its own
 * power rating (the target's when the candidate has none, flagged): ΔF3, Δmax SPL over the octave
 * above the target's F3, the level difference at 2.83 V and port / PR limits the candidate meets
 * there that the target doesn't. `opts` are the target design's simulation options; the drive is
 * set to 2.83 V and the sweep to SIM_DELTA_POINTS points. A missing Xmax leaves Δmax SPL out (an
 * unlimited cone would look better than it is). `at` (Hz) also reads both max SPL curves there,
 * for a table that quotes them at one frequency.
 */
export function simDelta(target: DriverInput, candidate: DriverInput, box: EnclosureInput, opts: SimulationOptions = {}, at?: number): SimDelta {
  const peFromTarget = !pos(candidate.pe_w) && pos(target.pe_w);
  const c = peFromTarget ? { ...candidate, pe_w: target.pe_w } : candidate;
  const o: SimulationOptions = { ...opts, power: 2.83, convention: "volts", points: SIM_DELTA_POINTS, frequencies: undefined, eq: [], highPass: null, passive: null };
  const rt = simulate(target, box, o);
  const rc = simulate(c, box, o);
  const f3Target = rt.summary.f3;
  const f3Candidate = rc.summary.f3;
  const dF3 = f3Target && f3Candidate ? (f3Candidate - f3Target) / f3Target : null;
  const hasXmax = pos(target.xmax_mm) && pos(c.xmax_mm);
  let dMaxSpl: number | null = null;
  const worseLimits: SimDelta["worseLimits"] = [];
  if (f3Target) {
    const mt = octaveMean(rt.freq, rt.maxSpl, f3Target);
    const mc = octaveMean(rc.freq, rc.maxSpl, f3Target);
    if (hasXmax && mt !== null && mc !== null) dMaxSpl = mc - mt;
    const kt = octaveKinds(rt.freq, rt.limitedBy, f3Target);
    const kc = octaveKinds(rc.freq, rc.limitedBy, f3Target);
    for (const k of ["port", "pr-xmax"] as const) if (kc.has(k) && !kt.has(k)) worseLimits.push(k);
  }
  let maxSplAt: SimDelta["maxSplAt"] = null;
  if (at !== undefined && hasXmax) {
    const t = valueAt(rt.freq, rt.maxSpl, at);
    const cv = valueAt(rc.freq, rc.maxSpl, at);
    if (Number.isFinite(t) && Number.isFinite(cv)) maxSplAt = { freq: at, target: t, candidate: cv };
  }
  return { f3Target, f3Candidate, dF3, dMaxSpl, dLevel283: rc.summary.referenceSpl - rt.summary.referenceSpl, worseLimits, peFromTarget, maxSplAt };
}

/** One tier down (risky stays risky) when the same-box check shows a much higher F3 or much less max SPL. */
export function demoteTier(tier: SimilarTier, d: Pick<SimDelta, "dF3" | "dMaxSpl"> | null): SimilarTier {
  if (!d) return tier;
  const worse = (d.dF3 !== null && d.dF3 > DEMOTE_F3) || (d.dMaxSpl !== null && d.dMaxSpl < DEMOTE_MAX_SPL_DB);
  if (!worse) return tier;
  return tier === "close" ? "usable" : "risky";
}

/** A passive radiator group as `scorePr` compares it: how many, and one PR's moving parts. */
export interface PrLike {
  count: number;
  sd_cm2: number;
  xmax_mm: number;
  /** One PR's own moving mass (g), before any added mass. */
  mms_g: number;
  vas_l: number;
}

/** Weights in `scorePr`: total cone area, travel (more counts less), own moving mass (lighter counts less), total Vas. */
export const PR_WEIGHTS = { sd: 3, xmax: 2.5, mms: 2, vas: 1 } as const;

/**
 * How alike two PR groups are (0 = the same), for ordering the PR finder by the PR in use: a
 * weighted mean |log2 ratio| of the group's cone area, one PR's travel, the group's own moving
 * mass and its Vas. More travel or a lighter moving mass than the reference counts
 * `BETTER_FACTOR` of the difference. Tiers as for drivers (`tierOf`).
 */
export function scorePr(ref: PrLike, c: PrLike): { distance: number; tier: SimilarTier } {
  let sum = 0;
  let weights = 0;
  const term = (w: number, t: number, v: number, better: "higher" | "lower" | null) => {
    if (!(pos(t) && pos(v))) return;
    let d = Math.abs(Math.log2(v / t));
    if ((better === "higher" && v > t) || (better === "lower" && v < t)) d *= BETTER_FACTOR;
    sum += w * d;
    weights += w;
  };
  term(PR_WEIGHTS.sd, ref.count * ref.sd_cm2, c.count * c.sd_cm2, null);
  term(PR_WEIGHTS.xmax, ref.xmax_mm, c.xmax_mm, "higher");
  term(PR_WEIGHTS.mms, ref.count * ref.mms_g, c.count * c.mms_g, "lower");
  term(PR_WEIGHTS.vas, ref.count * ref.vas_l, c.count * c.vas_l, null);
  const distance = weights ? sum / weights : Infinity;
  return { distance, tier: tierOf(distance) };
}
