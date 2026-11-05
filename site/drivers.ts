/**
 * Driver pages: one page per driver in the database (/drivers/<brand>/<model>/) with suggested
 * sealed, ported and passive radiator boxes worked out from its T/S parameters, their charts,
 * and a link that opens them in the app. Plus /drivers/ and one index per brand.
 *
 * The designs use the app's own one-click presets (sizeAllForDriver: Qtc 0.707, QB3/B4 or
 * Keele), so a page shows what the app would give. On top of that, each page picks a port
 * that fits the box and the best passive radiator from the database (the PR finder).
 */
import { RHO, C, TS_PARAMS, estimateDriverDisplacement, evaluatePrCandidates, rankPrResults, type PrCandidate, type TsParam, type TsValues } from "../packages/engine/src/index.ts";
import { loadDatabase, type Entry } from "../packages/db-tools/src/load.ts";
import type { Driver, PassiveRadiator } from "../packages/schema/src/index.ts";
import { DEFAULT_STATE, encodeStateShort, type AppState, type DesignState } from "../packages/web/src/state.ts";
import { sizeAllForDriver } from "../packages/web/src/presets.ts";
import { airOf, driverInputOf, runDesigns, simOptionsOf, solveDriver, type Design } from "../packages/web/src/sim.ts";

type Vented = Extract<DesignState, { kind: "vented" }>;
type Pr = Extract<DesignState, { kind: "pr" }>;

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Database records, as loaded by db-tools (the same loader CI validates with). */
export function loadDb() {
  const db = loadDatabase();
  if (db.errors.length) throw new Error(`Driver database has errors:\n${db.errors.join("\n")}`);
  return db;
}

/** The app's state for a database driver, as picking it in the app sets it (App.tsx, onPick). */
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
  const params = { mms_g: p.mms_g, sd_cm2: p.sd_cm2, xmax_mm: p.xmax_mm, qms: p.qms ?? 10, vas_l: Math.round(vas * 10) / 10 };
  const cut = e.data.physical?.cutout_mm;
  return { id: e.id, name: `${e.data.brand} ${e.data.model}`, pr: params, params, od_cm: cut !== undefined ? cut / 10 + 2.5 : undefined };
}

export { choosePort } from "../packages/web/src/assistant.ts";
import { choosePort } from "../packages/web/src/assistant.ts";

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
  const notes = skipped.map((x) => x.replace(/^[^:]+: /, ""));
  const air = airOf(sized);
  const keep: DesignState[] = [];
  let pr: DriverPage["pr"];
  for (const d of sized.designs) {
    if (!d.preset) continue; // not sized for this driver: left out
    if (d.kind === "sealed") keep.push(d);
    if (d.kind === "vented") {
      const port = choosePort(d.vb_l, d.targetFb, air);
      if (!port) {
        notes.push(`no round port fits ${r1(d.vb_l)} L tuned to ${r1(d.targetFb)} Hz`);
        continue;
      }
      keep.push({ ...(d as Vented), shape: "round", ...port });
    }
    if (d.kind === "pr") {
      const best = rankPrResults(
        [...evaluatePrCandidates(driverInputOf(sized, solved), prs, { vb_l: d.vb_l, targetFb: d.targetFb, sim: simOptionsOf(sized), losses: sized.settings.losses, counts: [1, 2, 4] })].flat(),
      ).find((x) => x.ok);
      if (!best) {
        notes.push(`no passive radiator in the database keeps up with it in ${r1(d.vb_l)} L at ${r1(d.targetFb)} Hz`);
        continue;
      }
      const c = prs.find((x) => x.id === best.id)!;
      pr = { name: best.name, count: best.count, addedMass_g: Math.round(best.addedMass_g) };
      keep.push({ ...(d as Pr), prName: best.name, params: c.params, count: best.count, addedMass_g: Math.round(best.addedMass_g), extra: [] });
    }
  }
  if (keep.length === 0) return null;
  const state: AppState = { ...sized, designs: keep };
  const designs = runDesigns(state, solveDriver(state));
  if (designs.length === 0) return null;
  const [brandSlug] = e.id.split("/") as [string];
  return { id: e.id, brand: rec.brand, brandSlug, model: rec.model, rec, state, designs, notes, pr };
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

/** "12-inch subwoofer, 2 × 2 Ω dual voice coil" */
export function describe(rec: Driver): string {
  const size = rec.size_in ? `${Number.isInteger(rec.size_in) ? rec.size_in : f1(rec.size_in)}-inch ` : "";
  // DVC: per-coil impedance, as in the app's driver list ("dual 2 Ω voice coils").
  const coil = rec.voice_coils === 2 ? (rec.ts_wiring === "series" ? rec.nominal_ohms / 2 : rec.nominal_ohms * 2) : 0;
  const ohms = coil ? `dual ${f1(coil)} Ω voice coils` : `${f1(rec.nominal_ohms)} Ω`;
  return `${size}${TYPE_LABEL[rec.type] ?? "driver"}, ${ohms}`;
}

const KIND_NAME = { sealed: "Sealed", vented: "Ported", pr: "Passive radiator" } as const;
type BoxKind = keyof typeof KIND_NAME;

/** One line on how the box is made. */
function boxText(d: Design): string {
  const x = d.design;
  if (x.kind === "sealed") return `Closed box, ${esc(x.preset ?? "")}`;
  if (x.kind === "vented") {
    const v = x as Vented;
    return `${count(v.count)[0]!.toUpperCase()}${count(v.count).slice(1)} ${cmIn(v.diameter_cm)} round port${v.count > 1 ? "s" : ""}, ${cmIn(v.length_cm)} long (${esc(x.preset ?? "")})`;
  }
  if (x.kind === "pr") {
    const p = x as Pr;
    return `${p.count} × ${esc(p.prName)}${p.addedMass_g > 0 ? ` with ${p.addedMass_g} g added${p.count > 1 ? " to each" : ""}` : ""} (${esc(x.preset ?? "")})`;
  }
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

/** Points of a curve for a chart, thinned to about 150. */
function pts(freq: Float64Array, y: ArrayLike<number>): [number, number][] {
  const step = Math.max(1, Math.floor(freq.length / 150));
  const out: [number, number][] = [];
  for (let i = 0; i < freq.length; i += step) out.push([freq[i]!, y[i]!]);
  return out;
}

export interface PageLinks {
  /** Share link opening every design. */
  all: string;
  related: { id: string; label: string }[];
}

export function driverContent(p: DriverPage, links: PageLinks, chart: typeof import("./chart.ts").chart): { title: string; description: string; content: string } {
  const name = `${p.brand} ${p.model}`;
  const solved = solveDriver(p.state).values;
  const kinds = p.designs.map((d) => d.design.kind as BoxKind);
  const kindList = kinds.map((k) => KIND_NAME[k].toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1");
  const title = `${name} box design: ${kindList}`;

  // Max SPL compared at one frequency for every box: the middle F3, rounded.
  const f3s = p.designs.map((d) => d.result.summary.f3).filter((x): x is number => x !== null).sort((a, b) => a - b);
  const fRef = Math.max(20, Math.round((f3s[Math.floor(f3s.length / 2)] ?? 40) / 5) * 5);
  const hasMax = p.designs.some((d) => Number.isFinite(at(d.result.freq, d.result.maxSpl, fRef)));

  const rows = p.designs
    .map((d) => {
      const s = d.result.summary;
      const tuning = d.design.kind === "sealed" ? `${f1(s.fc ?? NaN)} Hz<br><small>Fc</small>` : `${f1(s.fb ?? NaN)} Hz<br><small>Fb</small>`;
      const m = at(d.result.freq, d.result.maxSpl, fRef);
      const lim = LIMIT_TEXT[limitAt(d, fRef)];
      const cols = hasMax ? 5 : 4;
      return `<tr class="main"><td><span class="sw" style="background:${d.color}"></span>${KIND_NAME[d.design.kind as BoxKind]}</td><td class="n">${litres(d.vb_l)}</td><td class="n">${tuning}</td><td class="n">${s.f3 === null ? "–" : `${f1(s.f3)} Hz`}</td>${hasMax ? `<td class="n">${Number.isFinite(m) ? `${Math.round(m)} dB` : "–"}${lim ? `<br><small>${lim}</small>` : ""}</td>` : ""}</tr><tr class="how"><td colspan="${cols}">${boxText(d)}</td></tr>`;
    })
    .join("");

  const series = (y: (d: Design) => ArrayLike<number>) => p.designs.map((d) => ({ points: pts(d.result.freq, y(d)), style: "line" as const, color: d.color }));
  const response = chart({ label: "Response", unit: "dB", aria: `Response of each box for the ${name}`, yMin: -30, yMax: 6, series: series((d) => Array.from(d.result.spl, (v) => v - d.result.summary.referenceSpl)) });
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
  const report = `${REPO}/issues/new?template=data-correction.yml&title=${encodeURIComponent(`Correction: ${name}`)}`;

  const notes = p.notes.length ? `<p class="muted">Not shown: ${p.notes.map(esc).join("; ")}.</p>` : "";
  const related = links.related.length
    ? `<h2 id="similar">Similar drivers</h2><ul class="related">${links.related.map((r) => `<li><a href="${driverPath(r.id)}">${esc(r.label)}</a></li>`).join("")}</ul>`
    : "";

  const content = `<nav class="crumbs"><a href="/drivers/">Drivers</a> › <a href="${brandPath(p.brandSlug)}">${esc(p.brand)}</a></nav>
<h1>${esc(name)}: box design</h1>
<p class="lede">${esc(describe(p.rec))}. Suggested ${kindList} boxes worked out from its Thiele/Small parameters, ready to open and change in Speaker Box Genius.</p>
<p class="cta"><a class="button" href="${esc(links.all)}">Open these designs in the app →</a></p>

<h2 id="boxes">Suggested boxes</h2>
<p>${suitability(solved.fs!, solved.qes!, solved.qts!)} The boxes use the flattest standard alignments; a smaller box trades some bass extension for size, which you can try in the app. Volumes are net: add the space taken by the driver, port${p.pr ? ", passive radiators" : ""} and bracing (the app's volume calculator does this).</p>
<div class="table"><table class="cmp"><thead><tr><th>Box</th><th>Volume</th><th>Tuning</th><th>F3</th>${hasMax ? `<th>Max SPL at ${fRef} Hz</th>` : ""}</tr></thead><tbody>${rows}</tbody></table></div>
${notes}
${key}
<div class="charts"><figure>${response}<figcaption>Response (relative)</figcaption></figure>${maxSpl ? `<figure>${maxSpl}<figcaption>Maximum SPL at 1 m, half space, no high-pass filter</figcaption></figure>` : ""}</div>
<p class="muted">Maximum SPL is the loudest each box can play before the cone reaches Xmax${p.pr ? ", the passive radiators reach theirs" : ""}, the port gets noisy (17 m/s) or the driver's rated power is reached. Below the tuning a ported or passive radiator box needs a <a href="/guides/subsonic-filter/">subsonic filter</a>. These are starting points from small-signal simulation: check the box in the app, with your amplifier, filter and room, before you build.</p>

<h2 id="parameters">Parameters</h2>
<div class="table"><table class="cmp ts"><tbody>${tsRows}</tbody></table></div>
<p class="muted">${credit} <a href="${esc(report)}" rel="nofollow">Report a mistake</a>.</p>
${related}`;

  const desc = p.designs
    .map((d) => {
      const s = d.result.summary;
      return `${KIND_NAME[d.design.kind as BoxKind].toLowerCase()} ${f1(d.vb_l)} L${d.design.kind === "sealed" ? "" : ` at ${f1(s.fb ?? NaN)} Hz`}${s.f3 !== null ? ` (F3 ${Math.round(s.f3)} Hz)` : ""}`;
    })
    .join(", ");
  return { title, description: `Box designs for the ${name}: ${desc}. Charts, parameters and live designs to open and change.`, content };
}

/** What a driver's share card shows (site/og.ts draws it). */
export function cardData(p: DriverPage) {
  return {
    title: `${p.brand} ${p.model}`,
    subtitle: describe(p.rec),
    rows: p.designs.map((d) => {
      const s = d.result.summary;
      const box = d.design.kind === "pr" ? `${(d.design as Pr).count > 1 ? `${(d.design as Pr).count} PRs` : "PR"}` : KIND_NAME[d.design.kind as BoxKind];
      return { color: d.color, text: `${box} · ${f1(d.vb_l)} L${s.f3 !== null ? ` · F3 ${Math.round(s.f3)} Hz` : ""}` };
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
.ts{width:auto;min-width:16rem}
.tag{padding:0 .3rem;border:1px solid var(--border);border-radius:.3rem;color:var(--muted);font-size:.75rem}
.sw{display:inline-block;width:.7rem;height:.7rem;margin-right:.45rem;border-radius:.2rem;vertical-align:baseline}
.key span::before{border-top-color:var(--c)}
.related{columns:2 14rem;padding-left:1.1rem}
.brands{display:grid;gap:.6rem;grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr));padding:0;list-style:none}
.brands li{padding:.7rem .9rem;border:1px solid var(--border);border-radius:.7rem;background:var(--card)}
.brands a{font-weight:650;text-decoration:none}
.brands small{display:block;color:var(--muted)}
@media (max-width:600px){.cmp{font-size:.84rem}.cmp th,.cmp td{padding:.4rem .3rem}.cmp td.n .alt{display:block;font-size:.85em}.hide-s{display:none}}
`;

/** Up to 8 other drivers of the same brand and nearest size, then the same size from other brands. */
export function relatedDrivers(p: DriverPage, all: DriverPage[]): PageLinks["related"] {
  const size = p.rec.size_in ?? 0;
  const near = (x: DriverPage) => Math.abs((x.rec.size_in ?? 0) - size);
  const same = all.filter((x) => x.brandSlug === p.brandSlug && x.id !== p.id).sort((a, b) => near(a) - near(b) || a.model.localeCompare(b.model)).slice(0, 6);
  const other = all.filter((x) => x.brandSlug !== p.brandSlug && x.rec.size_in === p.rec.size_in && x.rec.type === p.rec.type).slice(0, 4);
  return [...same, ...other].map((x) => ({ id: x.id, label: `${x.brand} ${x.model}` }));
}

/** /drivers/<brand>/: a table of the brand's drivers that have pages. */
export function brandContent(brand: string, pages: DriverPage[]): string {
  const rows = [...pages]
    .sort((a, b) => (a.rec.size_in ?? 0) - (b.rec.size_in ?? 0) || a.model.localeCompare(b.model, "en", { numeric: true }))
    .map((p) => {
      const t = p.rec.ts;
      return `<tr><td><a href="${driverPath(p.id)}">${esc(p.model)}</a></td><td>${p.rec.size_in ? `${f1(p.rec.size_in)}″` : "–"}</td><td class="hide-s">${esc(TYPE_LABEL[p.rec.type] ?? "")}</td><td class="n">${f1(t.fs)} Hz</td><td class="n">${(t.qts ?? solveDriver(p.state).values.qts!).toFixed(2)}</td><td class="n">${f1(t.vas_l)} L</td><td class="n hide-s">${t.xmax_mm !== undefined ? `${f1(t.xmax_mm)} mm` : "–"}</td></tr>`;
    })
    .join("");
  return `<nav class="crumbs"><a href="/drivers/">Drivers</a></nav>
<h1>${esc(brand)} drivers: box designs</h1>
<p class="lede">Suggested sealed, ported and passive radiator boxes for ${pages.length} ${esc(brand)} drivers, worked out from their Thiele/Small parameters.</p>
<div class="table"><table class="cmp"><thead><tr><th>Model</th><th>Size</th><th class="hide-s">Type</th><th>Fs</th><th>Qts</th><th>Vas</th><th class="hide-s">Xmax</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** /drivers/: every brand. */
export function driversIndexContent(byBrand: { slug: string; name: string; pages: DriverPage[] }[]): string {
  const total = byBrand.reduce((n, b) => n + b.pages.length, 0);
  return `<h1>Box designs for ${total.toLocaleString("en-GB")} drivers</h1>
<p class="lede">Pick a driver to see the sealed, ported and passive radiator boxes that suit it, with their response and maximum output, and open any of them in Speaker Box Genius to change it.</p>
<ul class="brands">${byBrand.map((b) => `<li><a href="${brandPath(b.slug)}">${esc(b.name)}</a><small>${b.pages.length} drivers</small></li>`).join("")}</ul>
<p class="muted">The parameters come from the <a href="${REPO}/tree/main/drivers">open driver database</a> in the project's repository. Missing a driver? <a href="${REPO}/issues/new?template=new-driver.yml">Add it</a>, or enter its parameters in the app.</p>`;
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
