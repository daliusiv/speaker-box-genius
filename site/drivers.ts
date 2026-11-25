/**
 * Driver pages: one page per driver in the database (/drivers/<brand>/<model>/) with suggested
 * sealed, ported and passive radiator boxes worked out from its T/S parameters, their charts,
 * and a link that opens them in the app. Plus /drivers/ and one index per brand.
 *
 * The designs use the app's own one-click presets (sizeAllForDriver: Qtc 0.707, and QB3 as
 * WinISD's wizard sizes it), so a page shows what the app would give. When QB3's box is over twice
 * Vas, the ported and PR curves use a Compact box (twice Vas, flattest tuning) and QB3 becomes a
 * "Deep ported" table row. Car-audio and mid-bass drivers also get an infinite baffle (free air).
 * On top of that, each page picks a port that fits the box and the best passive radiator from the
 * database (the PR finder), sized to the driver.
 */
import { RHO, C, TS_PARAMS, estimateDriverDisplacement, evaluatePrCandidates, rankPrResults, type PrCandidate, type TsParam, type TsValues } from "../packages/engine/src/index.ts";
import { loadDatabase, type Entry } from "../packages/db-tools/src/load.ts";
import { doubtsXmax, type Flag } from "../packages/db-tools/src/plausibility.ts";
import { prTravel, type Driver, type PassiveRadiator } from "../packages/schema/src/index.ts";
import { DEFAULT_STATE, encodeStateShort, newDesign, type AppState, type DesignState } from "../packages/web/src/state.ts";
import { bestVentedPort, flatTuning, SEALED_MAX_VAS, sealedQtc, sizeAllForDriver, withPreset } from "../packages/web/src/presets.ts";
import { stuffFactor } from "../packages/web/src/stuffing.ts";
import { driverLevelDb, OB_PASSIVE_HZ, suitsOpenBaffle, suitsOpenBaffleDsp } from "../packages/web/src/boxType.ts";
import { alignmentDriver, driverInputOf, runDesigns, simOptionsOf, solveDriver, type Design } from "../packages/web/src/sim.ts";
import type { Substitute } from "./similar.ts";

type Vented = Extract<DesignState, { kind: "vented" }>;
type Pr = Extract<DesignState, { kind: "pr" }>;

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Database records, as loaded by db-tools (the same loader CI validates with). */
export function loadDb() {
  const db = loadDatabase();
  if (db.errors.length) throw new Error(`Driver database has errors:\n${db.errors.join("\n")}`);
  return db;
}

/**
 * The app's state for a database driver, as picking it in the app sets it (App.tsx, onPick),
 * driven at its power rating (the app's 1 W when it has none): the page's links open where the
 * limits mean something, and Size all boxes judges ports there too.
 */
export function driverState(rec: Driver, base: AppState = DEFAULT_STATE): AppState {
  const ts: TsValues = {};
  for (const k of Object.keys(TS_PARAMS) as TsParam[]) {
    const v = (rec.ts as unknown as Record<string, number | undefined>)[k];
    if (typeof v === "number") ts[k] = v;
  }
  const p = rec.physical;
  const disp = p?.displacement_l ?? (p?.cutout_mm !== undefined && p.depth_mm !== undefined ? Math.round(estimateDriverDisplacement(p.cutout_mm, p.depth_mm) * 100) / 100 : undefined);
  const dvc = rec.voice_coils === 2 ? (rec.ts_wiring ?? "parallel") : undefined;
  return {
    ...base,
    driverName: `${rec.brand} ${rec.model}`,
    driverBrand: rec.brand,
    nominal_ohms: rec.nominal_ohms ?? base.nominal_ohms,
    ts,
    le_mh: rec.ts.le_mh ?? 0,
    l2_mh: rec.ts.l2_mh ?? 0,
    r2_ohm: rec.ts.r2_ohm ?? 0,
    xmax_mm: rec.ts.xmax_mm ?? base.xmax_mm,
    pe_w: rec.ts.pe_w ?? base.pe_w,
    ...(rec.ts.pe_w !== undefined && rec.ts.pe_w > 0 ? { drive: "watts" as const, power: Math.min(10000, Math.round(rec.ts.pe_w)) } : {}),
    volume: { ...base.volume, ...(disp !== undefined ? { driverDisp_l: disp } : {}), driverCutout_mm: p?.cutout_mm ?? 0 },
    dvc: dvc ? { on: true, entered: dvc, wired: dvc } : { ...base.dvc, on: false },
  };
}

/** A database PR as the PR finder takes it (see loadPassiveRadiator in packages/web/src/library.ts). */
export function prCandidate(e: Entry<PassiveRadiator>): PrCandidate & { params: Pr["params"] } {
  const p = e.data.params;
  let vas = p.vas_l;
  if (vas === undefined) {
    const sd = p.sd_cm2 / 1e4;
    const cms = p.cms_mm_per_n !== undefined ? p.cms_mm_per_n / 1000 : 1 / ((2 * Math.PI * p.fs!) ** 2 * (p.mms_g / 1000));
    vas = cms * RHO * C * C * sd * sd * 1000;
  }
  const travel = prTravel(p);
  const params = { mms_g: p.mms_g, sd_cm2: p.sd_cm2, xmax_mm: travel.mm, ...(travel.mechanical ? { xmech: true } : {}), qms: p.qms ?? 10, vas_l: Math.round(vas * 10) / 10 };
  const cut = e.data.physical?.cutout_mm;
  return { id: e.id, name: `${e.data.brand} ${e.data.model}`, pr: params, params, od_cm: cut !== undefined ? cut / 10 + 2.5 : undefined };
}

export { choosePort } from "../packages/web/src/assistant.ts";

/** A passive radiator in place of the page's chosen one, in the same box. */
export type PrPatch = Pick<Pr, "prName" | "params" | "count" | "addedMass_g">;

/** How many other PRs a page lists under its PR box. */
export const PR_OTHERS = 3;

export interface DriverPage {
  id: string;
  brand: string;
  brandSlug: string;
  model: string;
  rec: Driver;
  state: AppState;
  designs: Design[];
  /** Why a box type was left out. */
  notes: string[];
  /** The PR chosen, if any. */
  pr?: { name: string; count: number; addedMass_g: number };
  /** The next passive radiators that also work in the PR box (best first, one row per PR), as patches of its design. */
  prOthers?: PrPatch[];
  /** The QB3 box when the ported curve is the smaller Compact one and QB3 goes meaningfully deeper. */
  deep?: { state: AppState; vb_l: number; fb: number; f3: number };
  /** Values that look implausible (packages/db-tools/src/plausibility.ts). */
  flags: Flag[];
}

/** Largest box a driver page suggests (L). */
export const PAGE_MAX_L = 300;

/** Preset name of the smaller ported box a page shows when QB3 is over twice Vas. */
export const COMPACT = "Compact";
/** The Deep row is shown when QB3's F3 is at least this much lower than the Compact box's (Hz). */
export const DEEP_MIN_GAIN_HZ = 3;
/** The Compact box isn't tuned below this fraction of Fs (lower, the "flat" tunings are a long sag). */
const COMPACT_MIN_FB = 0.5;
/** Driver types that also get an infinite baffle (door, free air). */
const IB_TYPES = new Set(["car-audio", "midbass"]);
/** Largest PR offered, by cone area per driver cone area: a bigger one isn't a realistic pairing. */
export const PR_MAX_SD = 2.5;

/** The PRs a page considers for a driver: up to PR_MAX_SD times its cone area (all when Sd is unknown). */
export function prsFor<T extends { pr: { sd_cm2: number } }>(prs: T[], sd_cm2: number | undefined): T[] {
  return sd_cm2 ? prs.filter((x) => x.pr.sd_cm2 <= PR_MAX_SD * sd_cm2) : prs;
}

/**
 * When the driver's QB3 box is over twice Vas: a box of twice Vas tuned for the flattest response
 * (no peak over 0.5 dB, lowest F3; flatTuning), with the port Size all boxes would pick, and the
 * QB3 box as the Deep row when it reaches DEEP_MIN_GAIN_HZ lower. Null when QB3 fits in twice Vas,
 * or no tuning of that box stays flat (the page then shows QB3).
 */
function compactVented(s: AppState, solved: ReturnType<typeof solveDriver>, align: NonNullable<ReturnType<typeof alignmentDriver>>) {
  const qb3 = s.designs.find((x): x is Vented => x.kind === "vented" && !!x.preset);
  if (!qb3 || qb3.vb_l * stuffFactor(qb3) <= SEALED_MAX_VAS * align.vas_l * s.drivers) return null;
  const vb_l = r1((SEALED_MAX_VAS * align.vas_l * s.drivers) / stuffFactor(qb3));
  // A smaller box than QB3 stays flat only tuned lower, so the search starts just above QB3's tuning.
  const fb = flatTuning(s, vb_l, qb3.targetFb * 1.05, COMPACT_MIN_FB * align.fs);
  if (fb === null) return null;
  const port = bestVentedPort(s, qb3, vb_l, fb);
  if (!port) return null;
  const c = { ...qb3, ...port.fields, vb_l, targetFb: fb, preset: COMPACT } as Vented;
  const [q, cr] = runDesigns({ ...s, designs: [qb3, c] }, solved);
  const qf3 = q?.result.summary.f3;
  const cf3 = cr?.result.summary.f3;
  const deep = qb3.vb_l <= PAGE_MAX_L && qf3 != null && cf3 != null && qf3 <= cf3 - DEEP_MIN_GAIN_HZ ? { state: { ...s, designs: [qb3] }, vb_l: qb3.vb_l, fb: qb3.targetFb, f3: qf3 } : undefined;
  return { vb_l, fb, port: port.fields, deep };
}

/** "a ported box (X)" and "a passive radiator box (X)" as one "a ported or passive radiator box (X)"; duplicates once. */
export function mergeNotes(notes: string[]): string[] {
  const out = [...new Set(notes)];
  for (let i = 0; i < out.length; i++) {
    const m = /^a ported box (.*)$/.exec(out[i]!);
    const j = m ? out.indexOf(`a passive radiator box ${m[1]}`) : -1;
    if (m && j >= 0) {
      out[i] = `a ported or passive radiator box ${m[1]}`;
      out.splice(j, 1);
    }
  }
  return out;
}

/**
 * Suggested designs for one driver, or null if it gets no page (incomplete parameters, a
 * tweeter-like Fs, or no box type that suits it).
 */
export function designDriver(e: Entry<Driver>, prs: ReturnType<typeof prCandidate>[]): DriverPage | null {
  const rec = e.data;
  if (!(rec.ts.fs > 0 && rec.ts.fs <= 200)) return null;
  const s0 = driverState(rec);
  const solved = solveDriver(s0);
  if (solved.missing.length > 0) return null;

  const { state: sized, skipped } = sizeAllForDriver(s0);
  const align = alignmentDriver(solved, s0);
  const notes = skipped.map((x) => x.replace(/^[^:]+: /, ""));
  const keep: DesignState[] = [];
  let pr: DriverPage["pr"];
  let prOthers: PrPatch[] | undefined;
  let deep: DriverPage["deep"];
  const compact = align ? compactVented(sized, solved, align) : null;
  if (compact?.deep) deep = compact.deep;
  for (let d of sized.designs) {
    if (!d.preset) continue; // not sized for this driver: left out
    // QB3 over twice Vas: the curve is the Compact box (twice Vas, flattest tuning), PR in the same box.
    if (compact && d.kind === "vented") d = { ...(d as Vented), ...compact.port, vb_l: compact.vb_l, targetFb: compact.fb, preset: COMPACT } as Vented;
    if (compact && d.kind === "pr") d = { ...d, vb_l: compact.vb_l, targetFb: compact.fb, preset: COMPACT } as Pr;
    // Pages suggest boxes people build at home; past this the alignment's box isn't a suggestion.
    // A sealed box just gets the largest size and the Qtc that gives; ported and PR boxes
    // would need another alignment, so they're left off.
    if (d.vb_l > PAGE_MAX_L && d.kind === "sealed" && align) {
      keep.push({ ...d, vb_l: PAGE_MAX_L, ...withPreset(d.name, `Qtc ${sealedQtc(align, PAGE_MAX_L * stuffFactor(d), sized.drivers).toFixed(2)}`) });
      continue;
    }
    if (d.vb_l > PAGE_MAX_L) {
      notes.push(`a ${d.kind === "sealed" ? "sealed" : d.kind === "pr" ? "passive radiator" : "ported"} box (its ${d.preset} box is ${Math.round(d.vb_l)} L, over ${PAGE_MAX_L} L)`);
      continue;
    }
    if (d.kind === "sealed") keep.push(d);
    // Ported: the port Size all boxes chose (the simplest that fits and keeps quiet at this power).
    if (d.kind === "vented") keep.push(d);
    if (d.kind === "pr") {
      const ranked = rankPrResults(
        [...evaluatePrCandidates(driverInputOf(sized, solved), prsFor(prs, rec.ts.sd_cm2), { vb_l: d.vb_l, targetFb: d.targetFb, sim: simOptionsOf(sized), losses: sized.settings.losses, counts: [1, 2, 4] })].flat(),
      ).filter((x) => x.ok);
      const best = ranked[0];
      if (!best) {
        notes.push(`no passive radiator in the database keeps up with it in ${r1(d.vb_l)} L at ${r1(d.targetFb)} Hz`);
        continue;
      }
      const c = prs.find((x) => x.id === best.id)!;
      pr = { name: best.name, count: best.count, addedMass_g: Math.round(best.addedMass_g) };
      // The next PRs that work here, each at its best count (one row per PR).
      const seen = new Set([best.id]);
      prOthers = [];
      for (const r of ranked) {
        if (prOthers.length >= PR_OTHERS) break;
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        prOthers.push({ prName: r.name, params: prs.find((x) => x.id === r.id)!.params, count: r.count, addedMass_g: Math.round(r.addedMass_g) });
      }
      keep.push({ ...(d as Pr), prName: best.name, params: c.params, count: best.count, addedMass_g: Math.round(best.addedMass_g), extra: [] });
    }
  }
  // Car-audio and mid-bass drivers mostly go in a door or a baffle: infinite baffle, free air.
  if (IB_TYPES.has(rec.type)) keep.push({ ...newDesign("ib", keep), rear: "open" } as DesignState);
  if (keep.length === 0) return null;
  notes.splice(0, notes.length, ...mergeNotes(notes));
  const state: AppState = { ...sized, designs: keep };
  const designs = runDesigns(state, solveDriver(state));
  if (designs.length === 0) return null;
  const [brandSlug] = e.id.split("/") as [string];
  return { id: e.id, brand: rec.brand, brandSlug, model: rec.model, rec, state, designs, notes, pr, ...(deep ? { deep } : {}), ...(prOthers?.length ? { prOthers } : {}), flags: e.flags };
}

export async function shareLink(site: string, s: AppState) {
  return `${site}/#${await encodeStateShort(s)}`;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const REPO = "https://github.com/daliusiv/speaker-box-genius";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f1 = (v: number) => (Math.round(v * 10) / 10).toString();
const litres = (l: number) => `${f1(l)} L <span class="alt">(${(l / 28.3168).toFixed(2)} ft³)</span>`;
const cmIn = (cm: number) => `${f1(cm)} cm <span class="alt">(${(cm / 2.54).toFixed(1)}″)</span>`;
const count = (n: number) => ["", "one", "two", "three", "four"][n] ?? String(n);

export const driverPath = (id: string) => `/drivers/${id}/`;
export const brandPath = (brandSlug: string) => `/drivers/${brandSlug}/`;

const TYPE_LABEL: Record<string, string> = {
  woofer: "woofer",
  subwoofer: "subwoofer",
  midbass: "midbass",
  midrange: "midrange",
  "full-range": "full-range driver",
  "car-audio": "car audio subwoofer",
  other: "driver",
};

/** Car-audio drivers this size and up are subwoofers; smaller ones are door woofers and mid-bass. */
const CAR_SUB_MIN_IN = 8;

/** What a driver is in words: "subwoofer", "car audio woofer" (a 6.5″ car-audio driver), … */
export function typeLabel(rec: Pick<Driver, "type" | "size_in">): string {
  if (rec.type === "car-audio" && rec.size_in !== undefined && rec.size_in < CAR_SUB_MIN_IN) return "car audio woofer";
  return TYPE_LABEL[rec.type] ?? "driver";
}

/** A size without trailing zeros, up to two decimals: 12, 6.5, 5.25. */
const inchText = (inches: number) => Number(inches.toFixed(2)).toString();
/** "12-inch", "6.5-inch", "5.25-inch": a size in words, and in the address of its page. */
export const sizeSlug = (inches: number) => `${inchText(inches)}-inch`;
/** "12″", "6.5″", "5.25″". */
export const sizeLabel = (inches: number) => `${inchText(inches)}″`;
export const sizePath = (inches: number) => `/drivers/${sizeSlug(inches)}/`;
/** A size gets its own page when at least this many drivers have it. */
export const SIZE_HUB_MIN = 10;

/** The sizes that get a page, smallest first, with how many drivers each has. */
export function hubSizes(pages: DriverPage[]): { inches: number; count: number }[] {
  const n = new Map<number, number>();
  for (const p of pages) if (p.rec.size_in) n.set(p.rec.size_in, (n.get(p.rec.size_in) ?? 0) + 1);
  return [...n].filter(([, count]) => count >= SIZE_HUB_MIN).map(([inches, count]) => ({ inches, count })).sort((a, b) => a.inches - b.inches);
}

/** "12-inch subwoofer": the size and the kind of driver, without the impedance. */
export function describeKind(rec: Driver): string {
  const size = rec.size_in ? `${sizeSlug(rec.size_in)} ` : "";
  return `${size}${typeLabel(rec)}`;
}

/** "12-inch subwoofer, 2 × 2 Ω dual voice coil" */
export function describe(rec: Driver): string {
  // DVC: per-coil impedance, as in the app's driver list ("dual 2 Ω voice coils").
  const coil = rec.voice_coils === 2 ? (rec.ts_wiring === "series" ? rec.nominal_ohms / 2 : rec.nominal_ohms * 2) : 0;
  const ohms = coil ? `dual ${f1(coil)} Ω voice coils` : `${f1(rec.nominal_ohms)} Ω`;
  return `${describeKind(rec)}, ${ohms}`;
}

const KIND_NAME = { sealed: "Sealed", vented: "Ported", pr: "Passive radiator", ib: "Infinite baffle" } as const;
type BoxKind = keyof typeof KIND_NAME;

/** One line on how the box is made. */
function boxText(d: Design): string {
  const x = d.design;
  if (x.kind === "sealed") return `Closed box, ${esc(x.preset ?? "")}`;
  if (x.kind === "vented") {
    const v = x as Vented;
    const n = `${count(v.count)[0]!.toUpperCase()}${count(v.count).slice(1)}`;
    const what =
      v.shape === "slot"
        ? `${cmIn(v.slotWidth_cm)} × ${cmIn(v.slotHeight_cm)} slot port${v.count > 1 ? "s" : ""}`
        : `${cmIn(v.diameter_cm)} ${v.flare_cm > 0 ? `flared (${cmIn(v.flare_cm)} round-overs)` : "round"} port${v.count > 1 ? "s" : ""}`;
    return `${n} ${what}, ${cmIn(v.length_cm)} long (${esc(x.preset ?? "")})`;
  }
  if (x.kind === "pr") {
    const p = x as Pr;
    return `${p.count} × ${esc(p.prName)}${p.addedMass_g > 0 ? ` with ${p.addedMass_g} g added${p.count > 1 ? " to each" : ""}` : ""} (${esc(x.preset ?? "")})`;
  }
  if (x.kind === "ib") return "In a door, wall or baffle, its back to a large sealed-off space (free air)";
  return "";
}

const LIMIT_TEXT: Record<string, string> = { xmax: "Xmax", "pr-xmax": "PR Xmax", port: "port speed", thermal: "power", none: "" };

/** The value at frequency f (log interpolation on the result's grid). */
function at(freq: Float64Array, y: Float64Array | number[], f: number): number {
  let i = 0;
  while (i < freq.length - 2 && freq[i + 1]! < f) i++;
  const t = Math.log(f / freq[i]!) / Math.log(freq[i + 1]! / freq[i]!);
  return y[i]! + (y[i + 1]! - y[i]!) * t;
}
const limitAt = (d: Design, f: number) => d.result.limitedBy[d.result.freq.findIndex((x) => x >= f)] ?? "none";

/** Which kind of box the driver's parameters point to (Small's efficiency-bandwidth product, Fs/Qes). */
function suitability(fs: number, qes: number, qts: number): string {
  const ebp = fs / qes;
  const lean = ebp < 50 ? "a sealed box" : ebp > 90 ? "a ported or passive radiator box" : "either a sealed or a vented box";
  return `With Fs ${f1(fs)} Hz, Qts ${qts.toFixed(2)} and an efficiency-bandwidth product (Fs/Qes) of ${Math.round(ebp)}, it leans towards ${lean}.`;
}

/**
 * The open baffle line under the box lean, by the driver picker's Suits rules (boxType.ts), with a
 * link to the open baffle calculator for this driver; empty when the driver suits neither.
 */
export function openBaffleLine(id: string, fs: number, qts: number, xmax_mm: number | undefined): string {
  const link = `<a href="/calculators/open-baffle/?d=${encodeURIComponent(id)}">Size its baffle →</a>`;
  if (suitsOpenBaffle({ qts, fs })) {
    const own = driverLevelDb(OB_PASSIVE_HZ, fs, qts);
    return `<p><strong>Open baffle:</strong> suits one without EQ (Qts ${qts.toFixed(2)}, Fs ${f1(fs)} Hz: its own level at ${OB_PASSIVE_HZ} Hz is ${own >= 0 ? "+" : "−"}${Math.abs(own).toFixed(1)} dB). ${link}</p>`;
  }
  if (suitsOpenBaffleDsp({ qts, xmax_mm, fs }))
    return `<p><strong>Open baffle:</strong> suits one with DSP EQ (Qts ${qts.toFixed(2)}, Xmax ${xmax_mm} mm, Fs ${f1(fs)} Hz). ${link}</p>`;
  return "";
}

/** Points of a curve for a chart, thinned to about 150. */
function pts(freq: Float64Array, y: ArrayLike<number>): [number, number][] {
  const step = Math.max(1, Math.floor(freq.length / 150));
  const out: [number, number][] = [];
  for (let i = 0; i < freq.length; i += step) out.push([freq[i]!, y[i]!]);
  return out;
}

/** One version of a driver (another impedance or voice coil) for the chips and the opening line. */
export interface VariantLink {
  id: string;
  /** "8 Ω", "DVC 2+2 Ω" */
  label: string;
  /** DC resistance (Ω). */
  re: number;
  /** Sensitivity at 2.83 V (dB), from sens283. */
  sens: number;
  /** Dual voice coils: how they were wired for the published T/S (and Re). */
  wiring?: "series" | "parallel";
  /** The suggested box's net volume (L) per kind. */
  boxes: Partial<Record<"vented" | "sealed" | "pr", number>>;
}

export interface PageLinks {
  /** Share link opening every design. */
  all: string;
  /** The driver's other versions and the page itself, in family order (two or more, or none). */
  variants?: VariantLink[];
  related: { id: string; label: string }[];
  /** Scored substitutes (site/similar.ts): shown rows (close and usable) and how many risky ones were left out. */
  substitutes?: { rows: SubstituteRow[]; hidden: number };
  /** Share links opening the page's designs with each of `DriverPage.prOthers` in the PR box. */
  prOthers?: string[];
  /** Share link opening the Deep ported box (`DriverPage.deep`) on its own. */
  deep?: string;
  /** The driver's size has a page of its own (sizePath), which the opening line and the similar drivers link to. */
  sizeHub?: boolean;
}

/** One row of a driver page's substitutes table. */
export interface SubstituteRow {
  sub: Substitute;
  page: DriverPage;
  /** Share link opening this page's designs with the substitute as the comparison driver. */
  compare: string;
}

/** Structured data for a page (schema.org): what it's about, and where it sits (breadcrumbs). */
/** The wording for each box kind in the opening line. */
const KIND_WORD = { vented: "ported", sealed: "sealed", pr: "passive radiator", ib: "infinite baffle" } as const;

/**
 * Sensitivity at 2.83 V and 1 m in half space (dB), from the T/S parameters: the reference
 * efficiency 4π²·Fs³·Vas/(c³·Qes), then 112.1 dB + 10·log10(η0) for 1 W, and 10·log10(8/Re) for 2.83 V.
 */
export function sens283(rec: Driver): number {
  const t = rec.ts;
  const eta0 = (4 * Math.PI ** 2 * t.fs ** 3 * (t.vas_l / 1000)) / (C ** 3 * t.qes);
  return 112.1 + 10 * Math.log10(eta0) + 10 * Math.log10(8 / t.re);
}

/**
 * A driver page's opening line. With other versions it says what changes between them: Re,
 * sensitivity and, when every version has one, the suggested box of the same kind.
 */
/** A version's Re; a dual-coil driver's as its T/S were measured (coils in series or parallel). */
const reOf = (v: VariantLink) => `${f1(v.re)} Ω${v.wiring ? ` in ${v.wiring}` : ""}`;

export function ledeText(rec: Driver, kindList: string, variants: VariantLink[] | undefined, id: string, hub = false): string {
  // "18-inch subwoofer" links to the page of its size when there is one.
  const what = esc(describeKind(rec));
  const base = `${hub && rec.size_in ? `<a href="${sizePath(rec.size_in)}">${what}</a>` : what}${esc(describe(rec).slice(describeKind(rec).length))}.`;
  const me = variants && variants.length >= 2 ? variants.find((v) => v.id === id) : undefined;
  if (!variants || !me) return `${base} Suggested ${kindList} boxes worked out from its Thiele/Small parameters, ready to open and change in Speaker Box Genius.`;
  const others = variants.filter((v) => v !== me);
  const list = (f: (v: VariantLink) => string) => others.map(f).join(", ");
  const kind = (["vented", "sealed", "pr"] as const).find((k) => me.boxes[k] !== undefined && others.every((o) => o.boxes[k] !== undefined));
  const box = kind ? ` and a ${f1(me.boxes[kind]!)} L ${KIND_WORD[kind]} box (${list((o) => `${f1(o.boxes[kind]!)} L`)})` : "";
  return `${base} ${esc(`The ${me.label} version: Re ${reOf(me)} (${list((o) => `${o.label} version ${reOf(o)}`)}), ≈ ${f1(me.sens)} dB at 2.83 V (${list((o) => `≈ ${f1(o.sens)} dB`)})${box}.`)}`;
}

/** "Also available:" chips linking a driver's other versions; the page's own is marked. */
export function variantChips(variants: VariantLink[] | undefined, id: string): string {
  if (!variants || variants.length < 2) return "";
  const items = variants.map((v) => `<li>${v.id === id ? `<span class="on" aria-current="page">${esc(v.label)}</span>` : `<a href="${driverPath(v.id)}">${esc(v.label)}</a>`}</li>`).join("");
  return `<ul class="chips"><li class="lbl">Also available:</li>${items}</ul>`;
}

export interface PageLd {
  about?: Record<string, unknown>;
  crumbs?: { name: string; path?: string }[];
  /** Makes the page a CollectionPage listing these pages (an ItemList), instead of an Article. */
  list?: { name: string; path: string }[];
}

/**
 * A driver page's title: what people search for a driver's box. "Port tuning" only when a
 * ported box is suggested, "tuning" for a passive radiator box alone.
 */
export function driverTitle(name: string, kinds: string[]): string {
  const tuning = kinds.includes("vented") ? "port tuning" : kinds.includes("pr") ? "tuning" : "";
  return `${name}: box size${tuning ? `, ${tuning}` : ""} and T/S parameters`;
}

/** The one frequency a driver page compares max SPL at: the middle F3 of its boxes, rounded to 5 Hz (≥ 20 Hz). */
export function refFreq(p: DriverPage): number {
  const f3s = p.designs.map((d) => d.result.summary.f3).filter((x): x is number => x !== null).sort((a, b) => a - b);
  return Math.max(20, Math.round((f3s[Math.floor(f3s.length / 2)] ?? 40) / 5) * 5);
}

const TIER_NAME = { close: "Close", usable: "Usable", risky: "Risky" } as const;
const signed = (v: number, digits = 1) => {
  const r = Number(v.toFixed(digits));
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r).toFixed(digits)}`;
};

/** A substitute's fit line: cutout, depth and amplifier load against the page's driver. */
export function fitText(t: Driver, c: Driver, sub: Pick<Substitute, "fit">): string {
  const tc = t.physical?.cutout_mm;
  const cc = c.physical?.cutout_mm;
  const cut =
    sub.fit.cutout === "drop-in" ? "Drop-in" : sub.fit.cutout === "enlarge" ? `Cutout ${Math.round(cc! - tc!)} mm larger` : sub.fit.cutout === "ring" ? `Cutout ${Math.round(tc! - cc!)} mm smaller (adapter ring)` : "Cutout not published";
  const td = t.physical?.depth_mm;
  const cd = c.physical?.depth_mm;
  const dd = td !== undefined && cd !== undefined ? Math.round(cd - td) : null;
  const depth = dd === null ? "depth not published" : dd > 5 ? `${dd} mm deeper` : dd < -5 ? `${-dd} mm shallower` : "same depth";
  const coil = c.voice_coils === 2 ? (c.ts_wiring ?? "parallel") === "parallel" ? c.nominal_ohms * 2 : c.nominal_ohms / 2 : undefined;
  const load =
    sub.fit.load === "same"
      ? `${f1(c.nominal_ohms)} Ω`
      : sub.fit.load === "dvc" && coil !== undefined
        ? `${f1(t.nominal_ohms)} Ω (coils in ${Math.abs(coil * 2 - t.nominal_ohms) < 1e-9 ? "series" : "parallel"})`
        : `${f1(c.nominal_ohms)} Ω, not ${f1(t.nominal_ohms)} Ω`;
  return `${cut} · ${depth} · ${load}`;
}

/** The substitutes section: a sentence, a two-line table (tier, F3 and max SPL in the lead box, fit), and how it's worked out. */
export function substitutesSection(p: DriverPage, s: NonNullable<PageLinks["substitutes"]>, fRef: number): string {
  const lead = p.designs.find((d) => !d.compare);
  if (!s.rows.length || !lead) return "";
  const kind = KIND_WORD[lead.design.kind as BoxKind];
  const delta = (r: SubstituteRow) => r.sub.boxes[0]?.delta;
  const hasMax = s.rows.some((r) => delta(r)?.maxSplAt);
  const cols = hasMax ? 4 : 3;
  const rows = s.rows
    .map((r) => {
      const d = delta(r);
      const f3 = d?.f3Candidate != null ? `${f1(d.f3Candidate)} Hz${d.f3Target != null ? ` <span class="alt">(${signed(d.f3Candidate - d.f3Target)})</span>` : ""}` : "–";
      const m = d?.maxSplAt;
      const max = m ? `${Math.round(m.candidate)} dB <span class="alt">(${signed(m.candidate - m.target)})</span>` : "–";
      const size = r.sub.differentSize ? ` <span class="tag">different size</span>` : "";
      return `<tr class="main"><td><a href="${driverPath(r.page.id)}">${esc(r.sub.label)}</a>${size}</td><td><span class="tag tier-${r.sub.tier}">${TIER_NAME[r.sub.tier]}</span></td><td class="n">${f3}</td>${hasMax ? `<td class="n">${max}</td>` : ""}</tr><tr class="how"><td colspan="${cols}">${fitText(p.rec, r.page.rec, r.sub)} · <a href="${esc(r.compare)}" rel="nofollow">Compare in the app →</a></td></tr>`;
    })
    .join("");
  // One sentence on the closest match, and one on the loudest other when it's louder still.
  const first = s.rows[0]!;
  const fd = delta(first);
  const hz = (v: number) => `${f1(Math.abs(v))} Hz ${v < 0 ? "lower" : "higher"}`;
  const db = (v: number) => (Math.abs(v) < 0.05 ? "plays as loud" : `plays ${f1(Math.abs(v))} dB ${v > 0 ? "louder" : "quieter"}`);
  const parts: string[] = [];
  if (fd?.f3Candidate != null && fd.f3Target != null) {
    const v = fd.f3Candidate - fd.f3Target;
    parts.push(Math.abs(v) < 0.05 ? "reaches as low" : v < 0 ? `reaches ${hz(v)}` : `has an F3 ${hz(v)}`);
  }
  if (fd?.maxSplAt) parts.push(db(fd.maxSplAt.candidate - fd.maxSplAt.target));
  let text = `The closest match is the ${esc(first.sub.label)}${parts.length ? `: in this driver's ${kind} box it ${parts.join(" and ")}` : ""}.`;
  const gain = (r: SubstituteRow) => { const m = delta(r)?.maxSplAt; return m ? m.candidate - m.target : -Infinity; };
  const loud = s.rows.slice(1).reduce<SubstituteRow | null>((b, r) => (gain(r) > (b ? gain(b) : -Infinity) ? r : b), null);
  if (loud && gain(loud) >= 0.5 && gain(loud) > gain(first)) {
    const ld = delta(loud)!;
    const f3 = ld.f3Candidate != null && ld.f3Target != null && Math.abs(ld.f3Candidate - ld.f3Target) >= 0.05 ? `, with an F3 ${hz(ld.f3Candidate - ld.f3Target)}` : "";
    text += ` The ${esc(loud.sub.label)} plays ${f1(gain(loud))} dB louder there${f3}.`;
  }
  const box = lead.design.kind === "sealed" ? `${f1(lead.vb_l)} L` : `${f1(lead.vb_l)} L tuned to ${f1(lead.result.summary.fb ?? NaN)} Hz`;
  const more = s.hidden ? ` ${s.hidden} more ${s.hidden === 1 ? "match that does" : "matches that do"} worse in this box ${s.hidden === 1 ? "is" : "are"} in the app's driver picker.` : "";
  return `<h2 id="substitutes">Substitutes</h2>
<p>${text}</p>
<div class="table"><table class="cmp subs"><thead><tr><th>Driver</th><th>Match</th><th>F3</th>${hasMax ? `<th>Max SPL at ${fRef} Hz</th>` : ""}</tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted">Similar parameters, simulated: each driver is put in the ${kind} box above (${box}) at its own rated power, so the comparison favours this driver. Check the fit and the box in the app before you swap.${more} <a href="/about/#credits">How this is scored</a></p>`;
}

/** The state with the PR box's PR swapped for another (the page's other designs unchanged). */
export function withPr(s: AppState, patch: PrPatch): AppState {
  return { ...s, designs: s.designs.map((d) => (d.kind === "pr" ? { ...d, ...patch, extra: [] } : d)) };
}

/** The PR row's extra line: the next PRs that work in the same box, each opening the app with it in place. */
function otherPrs(p: DriverPage, links: PageLinks): string {
  if (!p.prOthers?.length || links.prOthers?.length !== p.prOthers.length) return "";
  const items = p.prOthers.map((o, i) => `<a href="${esc(links.prOthers![i]!)}" rel="nofollow">${o.count} × ${esc(o.prName)}</a> (${o.addedMass_g > 0 ? `${o.addedMass_g} g${o.count > 1 ? " each" : ""}` : "no added mass"})`);
  return `<br><span class="pr-alt">Other PRs that work here: ${items.join(", ")}</span>`;
}

export function driverContent(p: DriverPage, links: PageLinks, chart: typeof import("./chart.ts").chart): { title: string; description: string; content: string; ld: PageLd } {
  const name = `${p.brand} ${p.model}`;
  const solved = solveDriver(p.state).values;
  const kinds = p.designs.map((d) => d.design.kind as BoxKind);
  const kindList = kinds.map((k) => KIND_NAME[k].toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1");
  const title = driverTitle(name, kinds);

  const fRef = refFreq(p);
  const hasMax = p.designs.some((d) => Number.isFinite(at(d.result.freq, d.result.maxSpl, fRef)));

  const rows = p.designs
    .map((d) => {
      const s = d.result.summary;
      const ib = d.design.kind === "ib";
      const tuning = ib ? "–" : d.design.kind === "sealed" ? `${f1(s.fc ?? NaN)} Hz<br><small>Fc</small>` : `${f1(s.fb ?? NaN)} Hz<br><small>Fb</small>`;
      const m = at(d.result.freq, d.result.maxSpl, fRef);
      const lim = LIMIT_TEXT[limitAt(d, fRef)];
      const cols = hasMax ? 5 : 4;
      return `<tr class="main"><td><span class="sw" style="background:${d.color}"></span>${KIND_NAME[d.design.kind as BoxKind]}</td><td class="n">${ib ? "Free air" : litres(d.vb_l)}</td><td class="n">${tuning}</td><td class="n">${s.f3 === null ? "–" : `${f1(s.f3)} Hz`}</td>${hasMax ? `<td class="n">${Number.isFinite(m) ? `${Math.round(m)} dB` : "–"}${lim ? `<br><small>${lim}</small>` : ""}</td>` : ""}</tr><tr class="how"><td colspan="${cols}">${boxText(d)}${d.design.kind === "pr" ? otherPrs(p, links) : ""}</td></tr>`;
    })
    .join("") + (p.deep ? `<tr class="main deep"><td>Deep ported</td><td class="n">${litres(p.deep.vb_l)}</td><td class="n">${f1(p.deep.fb)} Hz<br><small>Fb</small></td><td class="n">${f1(p.deep.f3)} Hz</td>${hasMax ? `<td class="n">${links.deep ? `<a href="${esc(links.deep)}">Open →</a>` : ""}</td>` : ""}</tr><tr class="how deep"><td colspan="${hasMax ? 5 : 4}">QB3: lower bass in a bigger box${!hasMax && links.deep ? ` (<a href="${esc(links.deep)}">open it</a>)` : ""}. Not in the charts.</td></tr>` : "");

  const series = (y: (d: Design) => ArrayLike<number>) => p.designs.map((d) => ({ points: pts(d.result.freq, y(d)), style: "line" as const, color: d.color }));
  const response = chart({ label: "Response", unit: "dB", aria: `Response of each box for the ${name}`, yMin: -30, yMax: 6, markers: [{ x: solved.fs!, label: `Fs ${f1(solved.fs!)} Hz` }], series: series((d) => Array.from(d.result.spl, (v) => v - d.result.summary.referenceSpl)) });
  const maxSpl = hasMax ? chart({ label: "Maximum SPL", unit: "dB", aria: `Maximum SPL of each box for the ${name}`, series: series((d) => d.result.maxSpl) }) : "";
  const key = `<p class="key">${p.designs.map((d) => `<span style="--c:${d.color}">${KIND_NAME[d.design.kind as BoxKind]}</span>`).join("")}</p>`;

  // T/S table: the published values, and the derived ones the app works out.
  const t = p.rec.ts as unknown as Record<string, number | undefined>;
  const ts: [string, string, number | undefined, boolean][] = [
    ["Fs", "Hz", t.fs, true],
    ["Qts", "", t.qts ?? solved.qts, t.qts !== undefined],
    ["Qes", "", t.qes, true],
    ["Qms", "", t.qms, true],
    ["Vas", "L", t.vas_l, true],
    ["Re", "Ω", t.re, true],
    ["Le", "mH", t.le_mh, true],
    ["Sd", "cm²", t.sd_cm2, true],
    ["Bl", "T·m", t.bl ?? solved.bl, t.bl !== undefined],
    ["Mms", "g", t.mms_g ?? solved.mms_g, t.mms_g !== undefined],
    ["Xmax", "mm", t.xmax_mm, true],
    ["Pe", "W", t.pe_w, true],
  ];
  const fmt = (v: number) => (v >= 100 ? Math.round(v).toString() : v >= 10 ? f1(v) : Number(v.toPrecision(3)).toString());
  const tsRows = ts
    .filter((r) => r[2] !== undefined && Number.isFinite(r[2]))
    .map(([k, u, v, published]) => `<tr><td>${k}</td><td class="n">${fmt(v!)}${u ? ` ${u}` : ""}${published ? "" : ' <span class="tag">derived</span>'}</td></tr>`)
    .join("");

  const src = p.rec.sources.find((x) => x.url) ?? p.rec.sources[0];
  const viaDb = /driver-base/.test(src?.note ?? "");
  const credit = src?.url
    ? `Parameters from the <a href="${esc(src.url)}" rel="noopener nofollow">${viaDb ? "manufacturer's published specifications" : `${esc(p.brand)} datasheet`}</a>${viaDb ? `, via <a href="https://github.com/JonathanDCohen/driver-base" rel="noopener">driver-base</a> (<a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY 4.0</a>)` : ""}.`
    : "Parameters as published by the manufacturer.";
  // Brands that allowed use here but not under Creative Commons (LICENSE-DATA, "Exceptions").
  const ownTerms = /not covered by CC BY-NC-SA/i.test(src?.note ?? "")
    ? ` Used with ${esc(p.brand)}'s permission; not covered by the database's CC BY-NC-SA licence, so ask ${esc(p.brand)} before reusing them.`
    : "";
  const report = `${REPO}/issues/new?template=data-correction.yml&title=${encodeURIComponent(`Correction: ${name}`)}`;
  const checked = p.rec.status === "verified" ? " Checked against the datasheet by a reviewer." : "";
  // Values that look wrong for this driver: say so where the numbers depend on them.
  const doubt = doubtsXmax(p.flags.map((f) => f.code));
  const flagNote = p.flags.length
    ? `<p class="note flag">⚠ ${p.flags.map((f) => esc(f.message)).join(" ")} ${doubt ? "The cone excursion and maximum SPL below depend on it." : ""} <a href="${esc(report)}" rel="nofollow">Report the right value</a>.</p>`
    : "";

  const notes = p.notes.length ? `<p class="muted">Not shown: ${p.notes.map(esc).join("; ")}.</p>` : "";
  const subs = links.substitutes ? substitutesSection(p, links.substitutes, fRef) : "";
  // With a substitutes table, the old list keeps only the brand's own drivers, unless that leaves
  // fewer than RELATED_MIN links in the two together: then the old list stays, less the substitutes.
  const subIds = new Set(links.substitutes?.rows.map((r) => r.page.id));
  const own = links.related.filter((r) => r.id.startsWith(`${p.brandSlug}/`) && !subIds.has(r.id));
  const brandOnly = subs !== "" && own.length + subIds.size >= RELATED_MIN;
  const relatedList = brandOnly ? own : links.related.filter((r) => !subIds.has(r.id));
  const more = links.sizeHub && p.rec.size_in ? `<p class="more"><a href="${sizePath(p.rec.size_in)}">All ${sizeSlug(p.rec.size_in)} drivers →</a></p>` : "";
  const related = relatedList.length
    ? `<h2 id="similar">${brandOnly ? `More from ${esc(p.brand)}` : subs ? "More drivers" : "Similar drivers"}</h2><ul class="related">${relatedList.map((r) => `<li><a href="${driverPath(r.id)}">${esc(r.label)}</a></li>`).join("")}</ul>${more}`
    : subs ? more : "";

  const content = `<nav class="crumbs"><a href="/drivers/">Drivers</a> › <a href="${brandPath(p.brandSlug)}">${esc(p.brand)}</a></nav>
<h1>${esc(name)}: box design</h1>
<p class="lede">${ledeText(p.rec, kindList, links.variants, p.id, links.sizeHub)}</p>
${variantChips(links.variants, p.id)}
<p class="cta"><a class="button" href="${esc(links.all)}">Open these designs in the app →</a></p>
${p.rec.ts.pe_w ? `<p class="muted">They open at its ${Math.round(p.rec.ts.pe_w)} W power rating; the app's 1 W button (as WinISD and Hornresp start) is next to it.</p>` : ""}
${flagNote}
<h2 id="boxes">Suggested boxes</h2>
<p>${suitability(solved.fs!, solved.qes!, solved.qts!)} The boxes use the flattest standard alignments (the ported ones as WinISD sizes them)${kinds.includes("vented") && p.designs.some((d) => d.design.preset === COMPACT) ? `; its flat ported box would be over twice Vas, so the ported${p.pr ? " and passive radiator boxes use" : " box uses"} twice Vas, tuned for the flattest response${p.deep ? ", and the bigger one is listed as Deep ported" : ""}` : ""}; a smaller box trades some bass extension for size, which you can try in the app. Volumes are net: add the space taken by the driver, port${p.pr ? ", passive radiators" : ""} and bracing (the app's volume calculator does this).</p>
${openBaffleLine(p.id, solved.fs!, solved.qts!, t.xmax_mm)}
<div class="table"><table class="cmp"><thead><tr><th>Box</th><th>Volume</th><th>Tuning</th><th>F3</th>${hasMax ? `<th>Max SPL at ${fRef} Hz</th>` : ""}</tr></thead><tbody>${rows}</tbody></table></div>
${kinds.includes("sealed") && kinds.some((k) => k === "vented" || k === "pr") ? `<p class="muted">A sealed box can't go below the driver's Fs (${f1(solved.fs!)} Hz); ported and passive radiator boxes can.</p>` : ""}
${notes}
${key}
<div class="charts"><figure>${response}<figcaption>Response (relative)</figcaption></figure>${maxSpl ? `<figure>${maxSpl}<figcaption>Maximum SPL at 1 m, half space, no high-pass filter</figcaption></figure>` : ""}</div>
<p class="muted">Maximum SPL is the loudest each box can play before the cone reaches Xmax${p.pr ? ", the passive radiators reach theirs" : ""}, the port gets noisy (17 m/s) or the driver's rated power is reached. Below the tuning a ported or passive radiator box needs a <a href="/guides/subsonic-filter/">subsonic filter</a>. These are starting points from small-signal simulation: check the box in the app, with your amplifier, filter and room, before you build.</p>

<h2 id="parameters">Parameters</h2>
<div class="table"><table class="cmp ts"><tbody>${tsRows}</tbody></table></div>
<p class="muted">${credit}${ownTerms}${checked} <a href="${esc(report)}" rel="nofollow">Report a mistake</a>.</p>
${subs}
${related}`;

  const desc = p.designs
    .map((d) => {
      const s = d.result.summary;
      if (d.design.kind === "ib") return `infinite baffle${s.f3 !== null ? ` (F3 ${Math.round(s.f3)} Hz)` : ""}`;
      return `${KIND_NAME[d.design.kind as BoxKind].toLowerCase()} ${f1(d.vb_l)} L${d.design.kind === "sealed" ? "" : ` at ${f1(s.fb ?? NaN)} Hz`}${s.f3 !== null ? ` (F3 ${Math.round(s.f3)} Hz)` : ""}`;
    })
    .join(", ");
  const ld: PageLd = {
    about: { "@type": "Thing", name, description: `${describe(p.rec)} by ${p.brand}` },
    crumbs: [{ name: "Drivers", path: "/drivers/" }, { name: p.brand, path: brandPath(p.brandSlug) }, { name: p.model }],
  };
  return { title, description: `Box designs for the ${name}: ${desc}. Charts, parameters and live designs to open and change.`, content, ld };
}

/** What a driver's share card shows (site/og.ts draws it). */
export function cardData(p: DriverPage) {
  return {
    title: `${p.brand} ${p.model}`,
    subtitle: describe(p.rec),
    rows: p.designs.map((d) => {
      const s = d.result.summary;
      const box = d.design.kind === "pr" ? `${(d.design as Pr).count > 1 ? `${(d.design as Pr).count} PRs` : "PR"}` : KIND_NAME[d.design.kind as BoxKind];
      return { color: d.color, text: `${box} · ${d.design.kind === "ib" ? "free air" : `${f1(d.vb_l)} L`}${s.f3 !== null ? ` · F3 ${Math.round(s.f3)} Hz` : ""}` };
    }),
    curves: p.designs.map((d) => ({ color: d.color, label: d.label, points: pts(d.result.freq, Array.from(d.result.spl, (v) => v - d.result.summary.referenceSpl)) })),
  };
}

export const DRIVERS_STYLE = `
.crumbs{margin:.5rem 0 -.4rem;color:var(--muted);font-size:.92rem}
.crumbs a{color:var(--muted)}
.alt,.muted{color:var(--muted)}
.muted{font-size:.92rem}
.n{white-space:nowrap}
td small{color:var(--muted)}
.cmp{font-size:.95rem}
.cmp tr.main td{border-bottom:0;padding-bottom:.1rem}
.cmp tr.how td{padding-top:0;color:var(--muted);font-size:.88em}
.cmp tr.deep td{color:var(--muted)}
.cmp tr.main.deep td:first-child{padding-left:1.35rem}
.pr-alt{display:inline-block;margin-top:.2rem}
.ts{width:auto;min-width:16rem}
.note.flag{border-left-color:#fbbf24}
.tag{padding:0 .3rem;border:1px solid var(--border);border-radius:.3rem;color:var(--muted);font-size:.75rem}
.tag.tier-close{border-color:var(--accent);color:var(--accent)}
.subs td:nth-child(2){white-space:nowrap}
.sw{display:inline-block;width:.7rem;height:.7rem;margin-right:.45rem;border-radius:.2rem;vertical-align:baseline}
.key span::before{border-top-color:var(--c)}
.related{columns:2 14rem;padding-left:1.1rem}
.chips{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center;margin:.2rem 0 1rem;padding:0;list-style:none}
.chips .lbl{color:var(--muted);font-size:.92rem;margin-right:.15rem}
.chips a,.chips span.on{display:inline-flex;align-items:center;min-height:2.1rem;padding:0 .8rem;border:1px solid var(--border);border-radius:999px;background:var(--card);color:var(--fg);text-decoration:none;font-weight:600;font-size:.92rem}
.chips span.on{border-color:var(--accent);color:var(--accent)}
.chips a:hover{border-color:var(--accent)}
@media (max-width:767px){.chips a,.chips span.on{min-height:44px;padding:0 1rem}}
.chips small{color:var(--muted);font-weight:500;margin-left:.35rem}
.sizes{margin:.4rem 0 1.4rem}
.more{margin-top:.6rem}
.brands{display:grid;gap:.6rem;grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr));padding:0;list-style:none}
.brands li{padding:.7rem .9rem;border:1px solid var(--border);border-radius:.7rem;background:var(--card)}
.brands a{font-weight:650;text-decoration:none}
.brands small{display:block;color:var(--muted)}
@media (max-width:600px){.cmp{font-size:.84rem}.cmp th,.cmp td{padding:.4rem .3rem}.cmp td.n .alt{display:block;font-size:.85em}.hide-s{display:none}}
`;

/** Fewest similar drivers a page lists, when there are enough. */
const RELATED_MIN = 4;

/**
 * Up to 6 other drivers of the same brand and nearest size, then the same size and type from other
 * brands. Short of 4, the same size of any type from other brands fills up (by name).
 * `exclude` (the driver's other versions, which have their own chips) are left out.
 */
export function relatedDrivers(p: DriverPage, all: DriverPage[], exclude?: Set<string>): PageLinks["related"] {
  all = exclude ? all.filter((x) => !exclude.has(x.id)) : all;
  const size = p.rec.size_in ?? 0;
  const near = (x: DriverPage) => Math.abs((x.rec.size_in ?? 0) - size);
  const same = all.filter((x) => x.brandSlug === p.brandSlug && x.id !== p.id).sort((a, b) => near(a) - near(b) || a.model.localeCompare(b.model)).slice(0, 6);
  // Other brands: the same size and type, closest Fs first (database order said nothing).
  const other = all
    .filter((x) => x.brandSlug !== p.brandSlug && x.rec.size_in === p.rec.size_in && x.rec.type === p.rec.type)
    .sort((a, b) => Math.abs(a.rec.ts.fs - p.rec.ts.fs) - Math.abs(b.rec.ts.fs - p.rec.ts.fs) || `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, "en", { numeric: true }))
    .slice(0, 4);
  const picked = [...same, ...other];
  if (picked.length < RELATED_MIN && p.rec.size_in) {
    const listed = new Set(picked);
    const rest = all
      .filter((x) => x.brandSlug !== p.brandSlug && x.rec.size_in === p.rec.size_in && !listed.has(x))
      .sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, "en", { numeric: true }));
    picked.push(...rest.slice(0, RELATED_MIN - picked.length));
  }
  return picked.map((x) => ({ id: x.id, label: `${x.brand} ${x.model}` }));
}

/** /drivers/<brand>/: a table of the brand's drivers that have pages. */
export function brandContent(brand: string, pages: DriverPage[], hubs: ReadonlySet<number> = new Set()): string {
  const rows = [...pages]
    .sort((a, b) => (a.rec.size_in ?? 0) - (b.rec.size_in ?? 0) || a.model.localeCompare(b.model, "en", { numeric: true }))
    .map((p) => {
      const t = p.rec.ts;
      return `<tr><td><a href="${driverPath(p.id)}">${esc(p.model)}</a></td><td>${p.rec.size_in ? (hubs.has(p.rec.size_in) ? `<a href="${sizePath(p.rec.size_in)}">${sizeLabel(p.rec.size_in)}</a>` : sizeLabel(p.rec.size_in)) : "–"}</td><td class="hide-s">${esc(typeLabel(p.rec))}</td><td class="n">${f1(t.fs)} Hz</td><td class="n">${(t.qts ?? solveDriver(p.state).values.qts!).toFixed(2)}</td><td class="n">${f1(t.vas_l)} L</td><td class="n hide-s">${t.xmax_mm !== undefined ? `${f1(t.xmax_mm)} mm` : "–"}</td></tr>`;
    })
    .join("");
  return `<nav class="crumbs"><a href="/drivers/">Drivers</a></nav>
<h1>${esc(brand)} drivers: box designs</h1>
<p class="lede">Suggested sealed, ported and passive radiator boxes for ${pages.length} ${esc(brand)} drivers, worked out from their Thiele/Small parameters.</p>
<div class="table"><table class="cmp"><thead><tr><th>Model</th><th>Size</th><th class="hide-s">Type</th><th>Fs</th><th>Qts</th><th>Vas</th><th class="hide-s">Xmax</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** How the size pages group drivers, biggest group first: the four common kinds, then the rest. */
const SIZE_GROUPS: Record<string, string> = { woofer: "Woofers", subwoofer: "Subwoofers", "full-range": "Full-range", midbass: "Midbass", other: "Other" };
const groupOf = (type: string) => (type in SIZE_GROUPS ? type : "other");

/** /drivers/<size>-inch/: every driver of one size by kind, sorted by Fs, with its suggested ported box. */
export function sizeContent(inches: number, pages: DriverPage[], allSizes: { inches: number; count: number }[]): string {
  const words = sizeSlug(inches);
  const groups = new Map<string, DriverPage[]>();
  for (const p of pages) groups.set(groupOf(p.rec.type), [...(groups.get(groupOf(p.rec.type)) ?? []), p]);
  const ordered = [...groups].sort((a, b) => b[1].length - a[1].length || SIZE_GROUPS[a[0]]!.localeCompare(SIZE_GROUPS[b[0]]!));
  const chips = ordered.map(([id, g]) => `<li><a href="#${id}">${SIZE_GROUPS[id]} <small>${g.length}</small></a></li>`).join("");
  const sections = ordered
    .map(([id, g]) => {
      const rows = [...g]
        .sort((a, b) => a.rec.ts.fs - b.rec.ts.fs || `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, "en", { numeric: true }))
        .map((p) => {
          const t = p.rec.ts;
          const ported = p.designs.find((d) => d.design.kind === "vented");
          return `<tr><td><a href="${driverPath(p.id)}">${esc(`${p.brand} ${p.model}`)}</a></td><td class="n">${f1(t.fs)} Hz</td><td class="n">${(t.qts ?? solveDriver(p.state).values.qts!).toFixed(2)}</td><td class="n">${f1(t.vas_l)} L</td><td class="n hide-s">${t.xmax_mm !== undefined ? `${f1(t.xmax_mm)} mm` : "–"}</td><td class="n">${ported ? `${f1(ported.vb_l)} L` : "–"}</td></tr>`;
        })
        .join("");
      return `<h2 id="${id}">${SIZE_GROUPS[id]}</h2><div class="table"><table class="cmp"><thead><tr><th>Model</th><th>Fs</th><th>Qts</th><th>Vas</th><th class="hide-s">Xmax</th><th>Ported box</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    })
    .join("");
  const others = allSizes.filter((s) => s.inches !== inches).map((s) => `<a href="${sizePath(s.inches)}">${sizeLabel(s.inches)}</a>`).join(" · ");
  const brands = new Set(pages.map((p) => p.brandSlug)).size;
  return `<nav class="crumbs"><a href="/drivers/">Drivers</a></nav>
<h1>${words} drivers: box designs</h1>
<p class="lede">Suggested sealed, ported and passive radiator boxes for ${pages.length} ${words} drivers from ${brands} brands, worked out from their Thiele/Small parameters. Sorted by Fs.</p>
<ul class="chips">${chips}</ul>${sections}
<p class="muted">Other sizes: ${others}. Or browse <a href="/drivers/">by brand</a>.</p>`;
}

/** /drivers/: every size with a page, and every brand. */
export function driversIndexContent(byBrand: { slug: string; name: string; pages: DriverPage[] }[], sizes: { inches: number; count: number }[] = []): string {
  const total = byBrand.reduce((n, b) => n + b.pages.length, 0);
  return `<h1>Box designs for ${total.toLocaleString("en-GB")} drivers</h1>
<p class="lede">Pick a driver to see the sealed, ported and passive radiator boxes that suit it, with their response and maximum output, and open any of them in Speaker Box Genius to change it.</p>
${sizes.length ? `<h2 id="sizes">By size</h2><ul class="chips sizes">${sizes.map((z) => `<li><a href="${sizePath(z.inches)}">${sizeLabel(z.inches)} <small>${z.count}</small></a></li>`).join("")}</ul>\n` : ""}<h2 id="brands">By brand</h2><ul class="brands">${byBrand.map((b) => `<li><a href="${brandPath(b.slug)}">${esc(b.name)}</a><small>${b.pages.length} drivers</small></li>`).join("")}</ul>
<p class="muted">The parameters come from the <a href="${REPO}/tree/main/drivers">open driver database</a> in the project's repository. Missing a driver? Enter its parameters in the <a href="/">app</a> and choose <b>Edit T/S → ⋯ → Submit to database…</b>: no GitHub account needed. (Or use the <a href="${REPO}/issues/new?template=new-driver.yml" rel="nofollow">GitHub form</a>.)</p>`;
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const db = loadDb();
  const prs = db.passiveRadiators.map(prCandidate);
  const t0 = performance.now();
  let pages = 0;
  const kinds: Record<string, number> = {};
  for (const e of db.drivers) {
    const p = designDriver(e, prs);
    if (!p) continue;
    pages++;
    for (const d of p.designs) kinds[d.design.kind] = (kinds[d.design.kind] ?? 0) + 1;
  }
  console.log(`${pages} of ${db.drivers.length} drivers get a page in ${((performance.now() - t0) / 1000).toFixed(1)} s`, kinds);
}
