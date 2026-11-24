/**
 * The calculator pages (/calculators/…): plain HTML Google can read, with the calculator's
 * form, made live by a script the app's Vite build bundles (packages/web/src/calculators/).
 * The site build finds that script through Vite's manifest; without it (tests, a site-only
 * build) the page is written without the script, and its text and worked example still stand.
 *
 * The worked example's numbers ({{calc:…}} in site/calculators/*.md) are worked out here, with
 * the same code the calculator runs, so the page can't drift from the calculator.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { portCalc, type PortCalcInput } from "../packages/web/src/calculators/portMath.ts";
import { fewestThatKeepUp, keepsUp, prCalc, prCheck, type PrCalcInput } from "../packages/web/src/calculators/prMath.ts";
import { readSealed } from "../packages/web/src/calculators/sealedMath.ts";
import { qtsOf } from "../packages/web/src/calculators/obCalcMath.ts";
import { EXAMPLES, OB_CALC, obCalcRun, SEALED_CALC, SHAPED, SHAPED_START } from "./examples.ts";
import { DEFAULT_STATE, newDesign, type VentedDesign } from "../packages/web/src/state.ts";
import { airOf, limitsOf, PORT_LIMIT, runDesigns, solveDriver } from "../packages/web/src/sim.ts";
import { PICK_KEYS, SIZES, subwooferPicks, type BoxKind } from "../packages/web/src/calculators/subwooferMath.ts";
import { driverState, loadDb } from "./drivers.ts";
import { PORTED_EX, portedBoxExample } from "./examples.ts";
import { alignmentChips, portedBox, portWords } from "../packages/web/src/calculators/portedMath.ts";
import { prTravel } from "../packages/schema/src/index.ts";
import { ICON_PATHS } from "../packages/web/src/iconPaths.ts";
import { BOX_DEFAULTS, boxVolume, formFromState, SHAPE_IDS, sizeFor, sizingOptions, type BoxForm } from "../packages/web/src/calculators/boxVolumeMath.ts";
import { MM_KEYS, OUTLINES, outlineCaption, SHAPE_FIELDS, SHAPE_NAMES, SIZE_KEYS } from "../packages/web/src/calculators/boxShapes.ts";
import { estimateDriverDisplacement } from "../packages/engine/src/index.ts";
import { appChartCss } from "./appCss.ts";

const AIR = airOf(DEFAULT_STATE);

/** The bundled script for a Vite input (vite.config.ts), as a site path, or null when the app wasn't built. */
export function viteScript(outDir: string, entry: string): string | null {
  const file = join(outDir, ".vite", "manifest.json");
  if (!existsSync(file)) return null;
  const manifest = JSON.parse(readFileSync(file, "utf8")) as Record<string, { file: string }>;
  const hit = manifest[entry];
  return hit ? `/${hit.file}` : null;
}

// ---- Port length ----

export const PORT_EXAMPLE = { driverId: "dayton-audio/rss315hf-4", power_w: 250, vb_l: 75, fb: 25 };

const exampleBase: PortCalcInput = {
  vb_l: PORT_EXAMPLE.vb_l,
  fb: PORT_EXAMPLE.fb,
  shape: "round",
  diameter_cm: 10,
  width_cm: 30,
  height_cm: 5,
  count: 1,
  flare_cm: 0,
  ends: "flanged",
  subtractPort: false,
  wall_mm: 3,
};

/** The worked example: each port's length (cm) and peak air speed (m/s) with the example driver, and the cone's peak (mm). */
export function portExample() {
  const db = loadDb();
  const rec = db.drivers.find((d) => d.id === PORT_EXAMPLE.driverId);
  if (!rec) throw new Error(`calculators: ${PORT_EXAMPLE.driverId} isn't in the database`);
  const s0 = { ...driverState(rec.data), drive: "watts" as const, power: PORT_EXAMPLE.power_w };
  const run = (i: PortCalcInput) => {
    const r = portCalc(i, AIR);
    if (!r) throw new Error("calculators: the example port doesn't work out");
    const d = newDesign("vented", []) as VentedDesign;
    const design: VentedDesign = {
      ...d,
      vb_l: r.tunedVb_l,
      shape: i.shape,
      diameter_cm: i.shape === "round" ? i.diameter_cm : d.diameter_cm,
      slotWidth_cm: i.shape === "slot" ? i.width_cm : d.slotWidth_cm,
      slotHeight_cm: i.shape === "slot" ? i.height_cm : d.slotHeight_cm,
      flare_cm: 0,
      length_cm: r.length_cm,
      count: i.count,
      targetFb: i.fb,
    };
    const s = { ...s0, designs: [design], settings: { ...s0.settings, endCorrection: r.k } };
    const [res] = runDesigns(s, solveDriver(s));
    const lim = limitsOf(res!.result, s.xmax_mm, false, PORT_LIMIT);
    return { r, vp: lim.vp ?? NaN, x: lim.x ?? NaN };
  };
  return {
    r75: run({ ...exampleBase, diameter_cm: 7.5 }),
    r100: run(exampleBase),
    r150: run({ ...exampleBase, diameter_cm: 15 }),
    r2x100: run({ ...exampleBase, count: 2 }),
    slot: run({ ...exampleBase, shape: "slot", ends: "wall" }),
  };
}

const cmIn = (cm: number) => `${cm.toFixed(1)} cm (${(cm / 2.54).toFixed(1)}″)`;
const ms = (v: number) => `${v.toFixed(1)} m/s`;

/** The {{calc:…}} values of port-length.md. */
export function portExampleValues(): Record<string, string> {
  const e = portExample();
  return {
    vb: String(PORT_EXAMPLE.vb_l),
    fb: String(PORT_EXAMPLE.fb),
    x: e.r100.x.toFixed(1),
    r75: cmIn(e.r75.r.length_cm),
    r100: cmIn(e.r100.r.length_cm),
    r150: cmIn(e.r150.r.length_cm),
    r2x100: `${cmIn(e.r2x100.r.length_cm)} each`,
    slot: cmIn(e.slot.r.length_cm),
    v75: ms(e.r75.vp),
    v100: ms(e.r100.vp),
    v150: ms(e.r150.vp),
    v2x100: ms(e.r2x100.vp),
    vslot: ms(e.slot.vp),
    "wall-low": e.slot.r.wallRange!.low.toFixed(1),
    "wall-high": e.slot.r.wallRange!.high.toFixed(1),
  };
}

export function fillCalc(md: string, values: Record<string, string>): string {
  return md.replace(/\{\{calc:([\w-]+)\}\}/g, (_, k: string) => {
    const v = values[k];
    if (v === undefined) throw new Error(`calculators: no value for {{calc:${k}}}`);
    return v;
  });
}

/** The calculator itself: a form the script makes live (hidden until it starts). */
export function portForm(): string {
  const num = (id: string, label: string, value: string, unit: string, extra = "") =>
    `<label class="calc-field"><span>${label}</span><span class="calc-in"><input id="${id}" type="number" inputmode="decimal" min="0" step="any" value="${value}"${extra}><em data-unit="${unit}">${unit === "vol" ? "L" : unit === "thin" ? "mm" : "cm"}</em></span></label>`;
  return `<div class="calc">
<p class="calc-nojs">The calculator needs JavaScript. The worked example below shows what it gives.</p>
<form id="pc-form" class="calc-form" hidden onsubmit="return false">
<fieldset class="calc-units"><legend>Units</legend><label><input type="radio" name="pc-units" id="pc-metric" checked> cm, litres</label><label><input type="radio" name="pc-units" id="pc-imperial"> inches, ft³</label></fieldset>
<div class="calc-grid">
${num("pc-vb", "Net box volume", String(PORT_EXAMPLE.vb_l), "vol")}
<label class="calc-field"><span>Tuning frequency</span><span class="calc-in"><input id="pc-fb" type="number" inputmode="decimal" min="0" step="any" value="${PORT_EXAMPLE.fb}"><em>Hz</em></span></label>
<label class="calc-field"><span>Port type</span><select id="pc-shape"><option value="round">Round tube</option><option value="slot">Slot</option></select></label>
<label class="calc-field"><span>Number of ports</span><input id="pc-n" type="number" inputmode="numeric" min="1" step="1" value="1"></label>
<div data-shape="round">${num("pc-d", "Inside diameter", "10", "len")}</div>
<div data-shape="round">${num("pc-flare", "Flare radius (0 = none)", "0", "len")}</div>
<div data-shape="slot" hidden>${num("pc-w", "Slot width", "30", "len")}</div>
<div data-shape="slot" hidden>${num("pc-h", "Slot height", "5", "len")}</div>
<label class="calc-field"><span>Port ends</span><select id="pc-ends"><option value="flanged">One end flanged (WinISD default)</option><option value="both">Both ends flanged</option><option value="free">Both ends free</option><option value="wall" data-shape="slot" hidden>Slot along a wall</option></select></label>
${num("pc-wall", "Port wall thickness", "3", "thin")}
${num("pc-inside", "Longest inside dimension (optional)", "", "len", ' placeholder="a cube if empty"')}
</div>
<label class="calc-check"><input id="pc-sub" type="checkbox"> Take the port's own volume off the net volume</label>
<div id="pc-out" class="calc-result" aria-live="polite"></div>
<h2 id="air-speed">Will it chuff?</h2>
<p>Pick your driver to see the port's peak air speed at its rated power (or any power you set), worked out by the full simulator.</p>
<div class="calc-grid">
<label class="calc-field calc-wide"><span>Driver (from the database)</span><input id="pc-driver" list="pc-drivers" placeholder="Start typing a brand or model" autocomplete="off"><datalist id="pc-drivers"></datalist><small id="pc-driver-status" class="calc-status"></small></label>
<label class="calc-field"><span>Amplifier power</span><span class="calc-in"><input id="pc-power" type="number" inputmode="decimal" min="0" step="any" value=""><em>W</em></span></label>
</div>
<div id="pc-speed" aria-live="polite"></div>
${calcActions("pc")}
</form>
</div>`;
}

// ---- Passive radiator ----

export const PR_EXAMPLE = { driverId: "dayton-audio/rss315hf-4", power_w: 200, vb_l: 75, fb: 25, prId: "dayton-audio/rss315-pr" };

/** The worked example's rows: PR id and count. */
export const PR_ROWS = [
  { key: "rss1", prId: "dayton-audio/rss315-pr", count: 1 },
  { key: "rss2", prId: "dayton-audio/rss315-pr", count: 2 },
  { key: "ds1", prId: "dayton-audio/ds315-pr", count: 1 },
  { key: "ds2", prId: "dayton-audio/ds315-pr", count: 2 },
  { key: "ds4", prId: "dayton-audio/ds315-pr", count: 4 },
  { key: "sb1", prId: "sb-acoustics/sb34nrx-00", count: 1 },
] as const;

function prParamsOf(id: string): PrCalcInput["pr"] & { name: string; mech: boolean; maxAdded_g?: number } {
  const rec = loadDb().passiveRadiators.find((p) => p.id === id);
  if (!rec) throw new Error(`calculators: ${id} isn't in the database`);
  const p = rec.data.params;
  if (p.vas_l === undefined) throw new Error(`calculators: ${id} has no Vas`);
  const travel = prTravel(p);
  return { name: `${rec.data.brand} ${rec.data.model}`, mms_g: p.mms_g, sd_cm2: p.sd_cm2, xmax_mm: travel.mm, mech: travel.mechanical, qms: p.qms ?? 10, vas_l: p.vas_l, ...(p.max_added_mass_g ? { maxAdded_g: p.max_added_mass_g } : {}) };
}

function prExampleState() {
  const rec = loadDb().drivers.find((d) => d.id === PR_EXAMPLE.driverId);
  if (!rec) throw new Error(`calculators: ${PR_EXAMPLE.driverId} isn't in the database`);
  return { ...driverState(rec.data), drive: "watts" as const, power: PR_EXAMPLE.power_w };
}

/** The worked example, row by row: the calculator's result and the check with the example driver. */
export function prExample() {
  const s = prExampleState();
  const rows = PR_ROWS.map((row) => {
    const { name, maxAdded_g, ...pr } = prParamsOf(row.prId);
    const i: PrCalcInput = { vb_l: PR_EXAMPLE.vb_l, fb: PR_EXAMPLE.fb, count: row.count, pr, ...(maxAdded_g ? { maxAdded_g } : {}) };
    const r = prCalc(i, AIR);
    if (!r) throw new Error(`calculators: ${row.key} doesn't work out`);
    const c = prCheck(s, i, r);
    if (!c) throw new Error(`calculators: ${row.key} couldn't be simulated`);
    return { ...row, name, i, r, c, ok: keepsUp(r, c) };
  });
  const ds = rows.find((r) => r.key === "ds1")!;
  return { s, rows, fewestDs: fewestThatKeepUp(s, ds.i, AIR) };
}

/** The {{calc:…}} values of passive-radiator.md. */
export function prExampleValues(): Record<string, string> {
  const e = prExample();
  const v: Record<string, string> = {
    vb: String(PR_EXAMPLE.vb_l),
    fb: String(PR_EXAMPLE.fb),
    w: String(PR_EXAMPLE.power_w),
    xmax: String(e.s.xmax_mm),
  };
  for (const row of e.rows) {
    const k = row.key;
    v[`${k}-mass`] = row.r.tooLow ? "none" : `${row.r.addedMass_g.toFixed(0)} g`;
    v[`${k}-ratio`] = row.r.tooLow ? "–" : `${row.r.massRatio.toFixed(1)} ×`;
    v[`${k}-bare`] = `${row.r.bareFb.toFixed(1)} Hz`;
    v[`${k}-vd`] = `${row.c.vdRatio.toFixed(1)} ×`;
    v[`${k}-use`] = row.r.tooLow ? "–" : `${Math.round(row.c.prUse * 100)} %`;
    v[`${k}-f3`] = row.c.f3 ? `${row.c.f3.toFixed(1)} Hz` : "–";
    v[`${k}-x`] = row.c.x.toFixed(1);
  }
  const rss1 = e.rows.find((r) => r.key === "rss1")!;
  v["rss1-pr"] = rss1.c.pr.toFixed(1);
  v["ds-fewest"] = e.fewestDs ? String(e.fewestDs.count) : "none";
  return v;
}

/** The calculator itself: a form the script makes live (hidden until it starts). */
export function prForm(): string {
  const p = prParamsOf(PR_EXAMPLE.prId);
  const num = (id: string, label: string, value: string, unit: string, extra = "") =>
    `<label class="calc-field"><span>${label}</span><span class="calc-in"><input id="${id}" type="number" inputmode="decimal" min="0" step="any" value="${value}"${extra}><em${id === "prc-vb" ? ' data-unit="vol"' : ""}>${unit}</em></span></label>`;
  return `<div class="calc">
<p class="calc-nojs">The calculator needs JavaScript. The worked example below shows what it gives.</p>
<form id="prc-form" class="calc-form" hidden onsubmit="return false" data-pr-name="${p.name}" data-pr-id="${PR_EXAMPLE.prId}"${p.mech ? ' data-pr-mech="1"' : ""}>
<fieldset class="calc-units"><legend>Units</legend><label><input type="radio" name="prc-units" id="prc-metric" checked> litres, grams</label><label><input type="radio" name="prc-units" id="prc-imperial"> ft³, ounces</label></fieldset>
<div class="calc-grid">
${num("prc-vb", "Net box volume", String(PR_EXAMPLE.vb_l), "L")}
${num("prc-fb", "Tuning frequency", String(PR_EXAMPLE.fb), "Hz")}
<label class="calc-field"><span>Number of PRs</span><input id="prc-n" type="number" inputmode="numeric" min="1" step="1" value="1"></label>
<label class="calc-field calc-wide"><span>Passive radiator (from the database, or type its values below)</span><input id="prc-pr" list="prc-prs" value="${p.name}" placeholder="Start typing a brand or model" autocomplete="off"><datalist id="prc-prs"></datalist><small id="prc-pr-status" class="calc-status"></small></label>
${num("prc-mms", "Moving mass, Mms", String(p.mms_g), "g")}
${num("prc-sd", "Cone area, Sd", String(p.sd_cm2), "cm²")}
${num("prc-vas", "Compliance volume, Vas", String(p.vas_l), "L", ' title="Vas stays in litres in both unit systems, as on most datasheets"')}
${num("prc-xmax", `<span id="prc-xmax-name">${p.mech ? "Xmech (one way, maker's limit)" : "Xmax (one way)"}</span>`, String(p.xmax_mm), "mm")}
${num("prc-qms", "Qms (10 if unknown)", String(p.qms), "")}
${num("prc-max", "Maximum added mass (optional)", p.maxAdded_g ? String(p.maxAdded_g) : "", "g", ' placeholder="from the datasheet"')}
</div>
<div id="prc-out" class="calc-result" aria-live="polite"></div>
<h2 id="keep-up">Will the PRs keep up?</h2>
<p>Pick your driver to see how much of the PRs' travel is used when the cone reaches its Xmax, worked out by the full simulator.</p>
<div class="calc-grid">
<label class="calc-field calc-wide"><span>Driver (from the database)</span><input id="prc-driver" list="prc-drivers" placeholder="Start typing a brand or model" autocomplete="off"><datalist id="prc-drivers"></datalist><small id="prc-driver-status" class="calc-status"></small></label>
<label class="calc-field"><span>Amplifier power</span><span class="calc-in"><input id="prc-power" type="number" inputmode="decimal" min="0" step="any" value=""><em>W</em></span></label>
</div>
<div id="prc-keep" aria-live="polite"></div>
${calcActions("prc")}
</form>
</div>`;
}

// ---- Sealed box ----

/** The worked example: the calculator's figures for each Qtc target, from the same designs as the chart. */
export function sealedExample() {
  const s = EXAMPLES["sealed-calc"]!();
  return SEALED_CALC.qtcs.map((qtc, i) => {
    const r = readSealed({ ...s, designs: [s.designs[i]!] });
    if (!r) throw new Error(`calculators: the sealed example for Qtc ${qtc} doesn't simulate`);
    return { qtc, r, xmax: s.xmax_mm };
  });
}

/** The {{calc:…}} values of sealed-box.md: a row of the table per target (a, b, c). */
export function sealedExampleValues(): Record<string, string> {
  const rows = sealedExample();
  const v: Record<string, string> = { w: String(SEALED_CALC.power_w), xmax: String(rows[0]!.xmax) };
  v["spl-gain"] = (rows[0]!.r.spl30! - rows[2]!.r.spl30!).toFixed(1);
  rows.forEach(({ r }, i) => {
    const k = "abc"[i]!;
    v[`${k}-vb`] = r.vb_l.toFixed(1);
    v[`${k}-ft3`] = (r.vb_l / 28.3168).toFixed(2);
    v[`${k}-qtc`] = r.qtc!.toFixed(3);
    v[`${k}-fc`] = r.fc!.toFixed(1);
    v[`${k}-f3`] = r.f3!.toFixed(1);
    v[`${k}-f10`] = r.f10!.toFixed(1);
    v[`${k}-x`] = r.x_mm!.toFixed(1);
    v[`${k}-spl`] = r.spl30!.toFixed(1);
  });
  return v;
}

// ---- Ported box ----

/** The worked example's boxes, one per alignment: the calculator's own numbers, and the port speed and cone peak at the example power. */
export function portedExample() {
  const s = portedBoxExample();
  const rows = alignmentChips(s).map((c) => {
    const r = portedBox(s, c.vb_l, c.fb, c.label);
    if (!r) throw new Error(`calculators: no port for ${c.label}`);
    return { key: c.value, chip: c, r };
  });
  return { s, rows };
}

const cm1 = (v: number) => String(Math.round(v * 10) / 10);

/** The {{calc:…}} values of ported-box.md. */
export function portedExampleValues(): Record<string, string> {
  const e = portedExample();
  const v: Record<string, string> = { w: String(PORTED_EX.power_w), xmax: String(e.s.xmax_mm), limit: String(PORT_LIMIT) };
  for (const { key, chip, r } of e.rows) {
    const d = r.design;
    v[`${key}-vb`] = `${chip.vb_l} L`;
    v[`${key}-fb`] = `${chip.fb} Hz`;
    v[`${key}-f3`] = r.f3 ? `${r.f3.toFixed(1)} Hz` : "–";
    v[`${key}-port`] = `${d.count > 1 ? `${d.count} × ` : ""}${cm1(d.diameter_cm)} cm${d.flare_cm > 0 ? " flared" : ""}, ${cm1(d.length_cm)} cm long`;
    v[`${key}-v`] = r.vp === null ? "–" : `${r.vp.toFixed(1)} m/s`;
    v[`${key}-x`] = r.x === null ? "–" : `${r.x.toFixed(1)} mm`;
    v[`${key}-db`] = chip.db.toFixed(1);
  }
  v["qb3-vp"] = e.rows[0]!.r.vp!.toFixed(0);
  return v;
}

// ---- Subwoofer box ----

export const SUB_EXAMPLE = { driverId: "dayton-audio/rss315hf-4", power_w: 250 };

/** The worked example's state: the example driver at its power, the box type's three picks as its designs. */
export function subwooferExampleState(kind: BoxKind) {
  const rec = loadDb().drivers.find((d) => d.id === SUB_EXAMPLE.driverId);
  if (!rec) throw new Error(`calculators: ${SUB_EXAMPLE.driverId} isn't in the database`);
  const s = { ...driverState(rec.data), drive: "watts" as const, power: SUB_EXAMPLE.power_w };
  return { s, ...subwooferPicks(s, kind) };
}

/** The worked example: the three picks, ported and sealed, by key. */
export function subwooferExample() {
  const ported = subwooferExampleState("ported");
  const sealed = subwooferExampleState("sealed");
  const by = (picks: ReturnType<typeof subwooferPicks>["picks"]) => Object.fromEntries(picks.map((p) => [p.key, p])) as Record<(typeof PICK_KEYS)[number], (typeof picks)[number]>;
  return { s: ported.s, ported: by(ported.picks), sealed: by(sealed.picks), portedState: ported.state };
}

/** The {{calc:…}} values of subwoofer-box.md. */
export function subwooferExampleValues(): Record<string, string> {
  const e = subwooferExample();
  const v: Record<string, string> = { w: String(SUB_EXAMPLE.power_w), xmax: String(e.s.xmax_mm) };
  for (const [kind, picks] of [["p", e.ported], ["s", e.sealed]] as const) {
    for (const k of PICK_KEYS) {
      const p = picks[k];
      if (!p.design) throw new Error(`calculators: the subwoofer example has no ${kind} ${k}: ${p.why}`);
      v[`${kind}-${k}-vb`] = p.vb_l!.toFixed(1);
      v[`${kind}-${k}-ft`] = (p.vb_l! / 28.3168).toFixed(2);
      v[`${kind}-${k}-f3`] = p.f3!.toFixed(1);
      v[`${kind}-${k}-spl`] = p.spl30!.toFixed(1);
      v[`${kind}-${k}-x`] = p.x!.toFixed(1);
      if (kind === "p") {
        v[`${kind}-${k}-fb`] = p.fb!.toFixed(1);
        v[`${kind}-${k}-air`] = p.air!.toFixed(1);
      } else v[`${kind}-${k}-qtc`] = p.tuning!.replace(/^Qtc /, "");
    }
  }
  // The text's comparisons, worked out from the same picks.
  const f = (x: number, dp = 1) => x.toFixed(dp);
  v["gap-compact"] = f(e.ported.compact.f3! - e.ported.balanced.f3!);
  v["gain-compact"] = f(e.ported.balanced.spl30! - e.ported.compact.spl30!);
  v["gain-deep"] = f(e.ported.balanced.spl30! - e.ported.deep.spl30!);
  v["gap-sealed"] = f(e.sealed.balanced.f3! - e.ported.balanced.f3!, 0);
  v["gain-sealed"] = f(e.sealed.deep.spl30! - e.sealed.balanced.spl30!);
  return v;
}

/** The calculator itself: a form the script makes live (hidden until it starts). */
export function sealedForm(): string {
  const drivers = `<label class="calc-field"><span>Number of drivers</span><input id="sc-n" type="number" inputmode="numeric" min="1" step="1" value="1"></label>\n`;
  return `<div class="calc">
<p class="calc-nojs">The calculator needs JavaScript. The worked example below shows what it gives.</p>
<form id="sc-form" class="calc-form" hidden onsubmit="return false" data-driver-id="${EXAMPLE_DRIVER}">
<fieldset class="calc-units"><legend>Units</legend><label><input type="radio" name="sc-units" id="sc-metric" checked> litres</label><label><input type="radio" name="sc-units" id="sc-imperial"> ft³</label></fieldset>
${driverFields("sc", 1, drivers)}
<fieldset class="calc-units"><legend>Work out</legend><label><input type="radio" name="sc-mode" id="sc-mode-box" checked> Box for a target Qtc</label><label><input type="radio" name="sc-mode" id="sc-mode-qtc"> Qtc for my box</label></fieldset>
<div id="sc-target">
${chips("sc-qtcpick", "Target Qtc", [{ value: "0.577", label: "0.577" }, { value: "0.707", label: "0.707" }, { value: "0.8", label: "0.8" }, { value: "1", label: "1.0" }, { value: "other", label: "Other…" }], "0.707")}
<div id="sc-qtc-field" class="calc-grid" hidden><label class="calc-field"><span>Qtc</span><input id="sc-qtc" type="number" inputmode="decimal" min="0" step="any" value="0.707"></label></div>
</div>
<div id="sc-boxfield" class="calc-grid" hidden><label class="calc-field"><span>Net box volume</span><span class="calc-in"><input id="sc-vb" type="number" inputmode="decimal" min="0" step="any" value="40"><em data-unit="vol">L</em></span></label></div>
<div id="sc-out" class="calc-result" aria-live="polite"></div>
<div id="sc-chart" class="calc-chart" data-calc-chart></div>
${calcActions("sc")}
</form>
</div>`;
}

/** The calculator itself: a form the script makes live (hidden until it starts). */
export function portedForm(): string {
  const count = `<label class="calc-field"><span>Number of drivers</span><input id="vc-n" type="number" inputmode="numeric" min="1" step="1" value="1"></label>\n`;
  const num = (id: string, label: string, value: string, unit: string, extra = "") =>
    `<label class="calc-field"><span>${label}</span><span class="calc-in"><input id="${id}" type="number" inputmode="decimal" min="0" step="any" value="${value}"${extra}><em${id === "vc-vb" ? ' data-unit="vol"' : ""}>${unit}</em></span></label>`;
  return `<div class="calc">
<p class="calc-nojs">The calculator needs JavaScript. The worked example below shows what it gives.</p>
<form id="vc-form" class="calc-form" hidden onsubmit="return false" data-driver-id="${EXAMPLE_DRIVER}">
<fieldset class="calc-units"><legend>Units</legend><label><input type="radio" name="vc-units" id="vc-metric" checked> litres, cm</label><label><input type="radio" name="vc-units" id="vc-imperial"> ft³, inches</label></fieldset>
${driverFields("vc", 1, count)}
<div id="vc-chips"></div>
<input type="hidden" id="vc-align" value="qb3">
<div id="vc-other" class="calc-grid" hidden>
${num("vc-vb", "Net box volume", "75", "L")}
${num("vc-fb", "Tuning frequency", "25", "Hz")}
</div>
<div id="vc-out" class="calc-result" aria-live="polite"></div>
<div id="vc-chart" class="calc-chart" data-calc-chart></div>
${calcActions("vc")}
</form>
</div>`;
}

/** The calculator itself: a form the script makes live (hidden until it starts). */
export function subwooferForm(): string {
  const rec = loadDb().drivers.find((d) => d.id === EXAMPLE_DRIVER);
  if (!rec) throw new Error(`calculators: ${EXAMPLE_DRIVER} isn't in the database`);
  const seg = `<div class="calc-field"><span>Box type</span><span class="calc-seg" role="radiogroup" aria-label="Box type"><label><input type="radio" name="sb-t" value="sealed"> Sealed</label><label><input type="radio" name="sb-t" value="ported" checked> Ported</label></span></div>`;
  const fields = driverFields("sb", rec.data.ts.pe_w ?? 100);
  if (!fields.endsWith("</div>")) throw new Error("calculators: driverFields no longer ends with its grid");
  const sizes = chips("sb-size-chip", "Size", SIZES.map((n) => ({ value: String(n), label: `${n}″` })), String(rec.data.size_in));
  return `<div class="calc">
<p class="calc-nojs">The calculator needs JavaScript. The worked example below shows what it gives.</p>
<form id="sb-form" class="calc-form" hidden onsubmit="return false" data-driver-id="${EXAMPLE_DRIVER}">
<fieldset class="calc-units"><legend>Units</legend><label><input type="radio" name="sb-units" id="sb-metric" checked> cm, litres</label><label><input type="radio" name="sb-units" id="sb-imperial"> inches, ft³</label></fieldset>
<input type="hidden" id="sb-size" value="${rec.data.size_in}">
<input type="hidden" id="sb-type" value="ported">
${sizes}
${fields.slice(0, -"</div>".length)}${seg}</div>
<div id="sb-picks" class="calc-picks" aria-live="polite"></div>
<div id="sb-note" aria-live="polite"></div>
<div id="sb-chart" class="calc-chart" data-calc-chart></div>
${calcActions("sb", "Open Balanced in the simulator")}
</form>
</div>`;
}

// ---- Box volume ----

/** The worked example: the shaped-cabinets guide's 14″ Sonotube and its golden-ratio box, through the calculator's own sums. */
export function boxVolumeExample() {
  // The guide's Sonotube, as the app opens it (sized there to 83.5 L by keeping the diameter).
  const tube = formFromState(EXAMPLES["shape-tube"]!());
  // The same sub as a golden-ratio box, sized here from the guide's starting box.
  const sb = SHAPED_START.box;
  const start: BoxForm = { ...tube, shape: "box", w: sb.width_cm!, h: sb.height_cm!, d: sb.depth_cm!, wall: sb.wall_mm!, br: sb.bracing_pct!, cap: null };
  const sized = sizeFor(start, SHAPED.vb_l, "golden");
  if (!sized?.ok) throw new Error("calculators: the box volume example's golden box doesn't size");
  // The tube sized here too, from 100 cm long, to check it lands where the guide's does.
  const tubeSized = sizeFor({ ...tube, len: 100 }, SHAPED.vb_l, "length");
  if (!tubeSized?.ok) throw new Error("calculators: the box volume example's tube doesn't size");
  // The guide's car wedge: 80 cm wide, 38 cm tall, 40 cm deep at the bottom and 25 cm at the top, 18 mm MDF.
  const wedge: BoxForm = { ...BOX_DEFAULTS, shape: "wedge", w: 80, h: 38, bd: 40, td: 25, lip: 0, wall: 18, sw: null, br: 0 };
  return { tube, t: boxVolume(tube), tubeSized: tubeSized.f, box: sized.f, b: boxVolume(sized.f), wedge, wg: boxVolume(wedge) };
}

/** The {{calc:…}} values of box-volume.md. */
export function boxVolumeExampleValues(): Record<string, string> {
  const e = boxVolumeExample();
  const L = (l: number) => l.toFixed(2);
  const by = (r: ReturnType<typeof boxVolume>, k: string) => r.r.deductions.find((d) => d.label.startsWith(k))?.litres ?? 0;
  return {
    target: String(SHAPED.vb_l),
    dia: String(e.tube.dia),
    len: String(e.tube.len),
    wall: String(e.tube.wall),
    cap: String(e.tube.cap),
    pdia: String(e.tube.pdia),
    pl: String(Math.round(e.tube.pl * 10) / 10),
    pwt: String(e.tube.pwt),
    dd: L(e.tube.dd),
    "t-gross": L(e.t.r.gross_l),
    "t-driver": L(by(e.t, "Drivers")),
    "t-port": L(by(e.t, "Port")),
    "t-net": L(e.t.r.net_l),
    "t-longest": e.t.longest_cm.toFixed(1),
    "t-mode": String(Math.round(e.t.mode_hz)),
    "b-size": `${e.box.w} × ${e.box.h} × ${e.box.d}`,
    "b-gross": L(e.b.r.gross_l),
    "b-driver": L(by(e.b, "Drivers")),
    "b-port": L(by(e.b, "Port")),
    "b-bracing": L(by(e.b, "Bracing")),
    "b-net": L(e.b.r.net_l),
    "w-gross": L(e.wg.r.gross_l),
    "w-slope": e.wg.slope_deg!.toFixed(1),
    "w-shortcut": L(((e.wedge.w - 3.6) * (e.wedge.h - 3.6) * ((e.wedge.td + e.wedge.bd) / 2 - 3.6)) / 1000),
  };
}

/** The calculator itself: a form the script makes live (hidden until it starts). Starts as BOX_DEFAULTS with the example driver. */
export function boxVolumeForm(): string {
  const f = BOX_DEFAULTS;
  const rec = loadDb().drivers.find((d) => d.id === EXAMPLE_DRIVER);
  if (!rec) throw new Error(`calculators: ${EXAMPLE_DRIVER} isn't in the database`);
  const phys = rec.data.physical;
  if (!phys?.cutout_mm || !phys.depth_mm || phys.displacement_l !== undefined) throw new Error("calculators: the box volume page expects the example driver's displacement to be an estimate");
  const est = Math.round(estimateDriverDisplacement(phys.cutout_mm, phys.depth_mm) * 100) / 100;
  if (est !== f.dd) throw new Error(`calculators: BOX_DEFAULTS.dd should be the example driver's ${est} L`);
  const unit = (q: string) => (q === "len" ? "cm" : q === "mm" ? "mm" : q === "vol" ? "L" : q);
  const field = (id: string, label: string, value: string, q: string, o: { extra?: string; attrs?: string } = {}) =>
    `<label class="calc-field"${o.attrs ?? ""}><span>${label}</span><span class="calc-in"><input id="bv-${id}" type="number" inputmode="decimal" min="0" step="any" value="${value}"${["len", "mm", "vol"].includes(q) ? ` data-q="${q}"` : ""}${o.extra ?? ""}>${q ? `<em${["len", "mm", "vol"].includes(q) ? ` data-u="${q}"` : ""}>${unit(q)}</em>` : ""}</span></label>`;
  const count = (id: string, label: string, value: number, min = 0) =>
    `<label class="calc-field"><span>${label}</span><span class="calc-in"><input id="bv-${id}" type="number" inputmode="numeric" min="${min}" step="1" value="${value}"></span></label>`;
  // Every size field, shown or hidden by the script per shape (the box's as served).
  const box = SHAPE_FIELDS.box;
  const sizes = SIZE_KEYS.map((key) => {
    const own = box.find((x) => x.key === key);
    const any = own ?? Object.values(SHAPE_FIELDS).flat().find((x) => x.key === key)!;
    const v = key === "wall" ? f.wall : key === "cap" ? f.cap : key === "sw" ? f.sw : key === "d" ? f.d : (f[key] as number);
    const ph = key === "cap" || key === "sw" ? ' placeholder="same as the walls"' : key === "lip" ? ' placeholder="0 = none"' : "";
    return field(key, any.label, v === null ? "" : String(v), MM_KEYS.has(key) ? "mm" : "len", {
      extra: `${ph} title="${escHtml(any.help)}"`,
      attrs: ` data-size="${key}"${own ? ` style="order:${box.indexOf(own)}"` : " hidden"}`,
    });
  }).join("\n");
  const ratio = sizingOptions("box").map((o, i) => `<option value="${o.value}"${i === 0 ? " selected" : ""}>${o.text}</option>`).join("");
  const r = boxVolume(f);
  return `<div class="calc">
<p class="calc-nojs">The calculator needs JavaScript. The worked example below shows what it gives.</p>
<form id="bv-form" class="calc-form" hidden onsubmit="return false" data-driver-id="${EXAMPLE_DRIVER}">
<fieldset class="calc-units"><legend>Units</legend><label><input type="radio" name="bv-units" id="bv-metric" checked> cm, litres</label><label><input type="radio" name="bv-units" id="bv-imperial"> inches, ft³</label></fieldset>
<fieldset class="calc-units"><legend>Work out</legend><label><input type="radio" name="bv-mode" id="bv-mode-net" checked> Net volume of my box</label><label><input type="radio" name="bv-mode" id="bv-mode-size"> Box size for a net volume</label></fieldset>
<input type="hidden" id="bv-shape" value="${f.shape}">
${chips("bv-shape-chip", "Shape", SHAPE_IDS.map((s) => ({ value: s, label: SHAPE_NAMES[s] })), f.shape)}
<div id="bv-sizing" class="calc-grid" hidden>
${field("target", "Target net volume", "60", "vol")}
<label class="calc-field"><span id="bv-ratio-label">Ratio</span><select id="bv-ratio">${ratio}</select></label>
</div>
<div class="calc-size">
<div id="bv-sizes" class="calc-grid">
${sizes}
</div>
<figure class="calc-shape"><span id="bv-svg" data-shape="${f.shape}">${OUTLINES[f.shape]}</span><figcaption id="bv-caption">${outlineCaption(f.shape)}</figcaption></figure>
</div>
<p id="bv-done" class="calc-done" hidden aria-live="polite"></p>
<fieldset class="calc-part"><legend>Inside the box<span id="bv-parts-total">−${r.parts_l.toFixed(1)} L</span></legend>
<div class="calc-grid"><label class="calc-field calc-wide"><span>Driver (from the database, optional)</span><input id="bv-driver" list="bv-drivers" value="${escHtml(`${rec.data.brand} ${rec.data.model}`)}" placeholder="Start typing a brand or model" autocomplete="off"><datalist id="bv-drivers"></datalist><small id="bv-driver-status" class="calc-status">${rec.data.size_in}″ · cutout ${phys.cutout_mm} mm · depth ${phys.depth_mm} mm · <span class="calc-est">≈ ${est.toFixed(2)} L each, estimated</span> from cutout and depth (no datasheet value)</small></label></div>
<div class="calc-grid">
${count("n", "Number of drivers", f.n, 1)}
${field("dd", "Each driver", String(f.dd), "vol", { extra: ' title="Air each driver takes up inside the box (its displacement, from the datasheet). Filled in from the database when known (an estimate from cutout and depth otherwise)."' })}
</div>
<div class="calc-grid"><label class="calc-field calc-wide"><span>Passive radiator (from the database, optional)</span><input id="bv-pr" list="bv-prs" placeholder="Start typing a brand or model" autocomplete="off"><datalist id="bv-prs"></datalist><small id="bv-pr-status" class="calc-status"></small></label></div>
<div class="calc-grid">
${count("np", "Number of PRs", f.np)}
${field("pd", "Each PR", String(f.pd), "vol", { extra: ' title="Air each passive radiator takes up inside the box."' })}
</div>
<div class="calc-grid">
${count("pc", "Number of ports", f.pc)}
<label class="calc-field"><span>Port type</span><select id="bv-pt"><option value="round"${f.pt === "round" ? " selected" : ""}>Round tube</option><option value="slot"${f.pt === "slot" ? " selected" : ""}>Slot</option></select></label>
${field("pdia", "Inside diameter", String(f.pdia), "len", { attrs: ' data-port="round"' })}
${field("pw", "Slot width", String(f.pw), "len", { attrs: ' data-port="slot" hidden' })}
${field("ph", "Slot height", String(f.ph), "len", { attrs: ' data-port="slot" hidden' })}
${field("pl", "Length", String(f.pl), "len")}
${field("pwt", "Port wall", String(f.pwt), "mm", { extra: ' title="Wall thickness of the port tube: the tube\'s own volume is taken off too."' })}
</div>
<div class="calc-grid">
${field("br", "Bracing", String(f.br), "%", { extra: ' title="Bracing, as a share of the inside volume (5% is typical for a well-braced box)."' })}
${field("o", "Other (crossover, plate amp)", String(f.o), "vol", { extra: ' title="Anything else inside (crossover, amplifier plate, handles), in litres."' })}
</div>
</fieldset>
<div id="bv-out" class="calc-result" aria-live="polite"></div>
${calcActions("bv")}
<p id="bv-hint" class="calc-note"></p>
</form>
</div>`;
}

/** The link icon (packages/web/src/iconPaths.ts), for Copy link. */
const LINK_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATHS.link}"/></svg>`;

/** A calculator's action row: Open in the simulator (the one primary) and Copy link (shown once the script runs). */
export function calcActions(prefix: string, open = "Open this box in the simulator"): string {
  return `<div class="calc-actions"><a id="${prefix}-open" class="button" href="/" hidden>${open}</a><button id="${prefix}-copy" class="ghost" type="button" hidden>${LINK_ICON}<span class="label">Copy link</span></button></div>`;
}

export const CALC_STYLE = `
.calc{margin:1.2rem 0 1rem;padding:1rem 1.1rem 1.2rem;border:1px solid var(--border);border-radius:.8rem;background:var(--card)}
.calc-form h2{margin-top:1.6rem}
.calc-units{display:flex;align-items:center;gap:1.2rem;flex-wrap:wrap;border:0;margin:0 0 .8rem;padding:0;color:#d3d8e2}
.calc-units label{display:flex;align-items:center;gap:.4rem}
.calc .calc-units input,.calc .calc-check input{width:auto;padding:0}
.calc-units legend{float:left;margin-right:.4rem;color:var(--muted)}
.calc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));gap:.7rem 1rem}
.calc-field{display:flex;flex-direction:column;gap:.25rem;font-size:.92rem;color:var(--muted)}
.calc-wide{grid-column:1/-1}
.calc-in{display:flex;align-items:center;gap:.4rem}
.calc-in em{font-style:normal;color:var(--muted);min-width:1.8rem}
.calc input,.calc select{width:100%;padding:.5rem .6rem;border:1px solid var(--border);border-radius:.45rem;background:var(--bg);color:var(--fg);font:inherit;font-size:1rem}
.calc-combo{position:relative;display:block}
.calc-combo-list{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:20;margin:0;padding:.25rem;list-style:none;max-height:320px;overflow-y:auto;overscroll-behavior:contain;border:1px solid var(--border);border-radius:.45rem;background:var(--card);box-shadow:0 8px 24px rgb(0 0 0 / .4)}
.calc-combo-list.up{top:auto;bottom:calc(100% + 4px)}
.calc-combo-list li{display:flex;align-items:center;min-height:44px;padding:0 .6rem;border-radius:.35rem;color:var(--fg);font-size:1rem;cursor:pointer;overflow-wrap:anywhere}
.calc-combo-list li:hover,.calc-combo-list li[aria-selected=true]{background:var(--bg);box-shadow:inset 3px 0 0 var(--accent)}
.calc-combo-list li.note{color:var(--muted);font-size:.9rem;cursor:default;background:none;box-shadow:none}
.calc-check{display:flex;gap:.5rem;align-items:center;margin:.9rem 0 .2rem;color:#d3d8e2}
.calc-result{margin-top:1rem}
.calc-out{width:100%;border-collapse:collapse;margin:.4rem 0 .6rem}
.calc-out th{text-align:left;font-weight:500;color:var(--muted);padding:.35rem .6rem .35rem 0;vertical-align:top}
.calc-out td{padding:.35rem 0}
.calc-out tr+tr th,.calc-out tr+tr td{border-top:1px solid var(--border)}
.calc-note,.calc-status{color:var(--muted);font-size:.95rem}
.calc-speed{padding:.6rem .8rem;border-radius:.5rem;border:1px solid var(--border)}
.calc-speed.over{border-color:#b45309}
.calc-speed.ok{border-color:#15803d}
.calc-actions{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin:1rem 0 .2rem}
.calc-actions .button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;box-sizing:border-box}
.calc-actions .ghost{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;min-height:44px;padding:0 1rem;border:1px solid var(--border);border-radius:.6rem;background:transparent;color:var(--fg);font:inherit;font-weight:600;cursor:pointer}
.calc-actions .ghost:hover{border-color:var(--accent)}
.calc-actions [hidden]{display:none}
@media (max-width:700px){.calc-actions .button,.calc-actions .ghost{flex:1 1 100%}}
.calc-out .sub{display:block;color:var(--muted);font-size:.88em;font-weight:400}
.calc-ts{margin:.1rem 0 .8rem;color:var(--muted);font-size:.92rem}
.calc-ts summary{cursor:pointer;color:var(--accent);font-weight:600;list-style:none;min-height:44px;display:flex;align-items:center}
.calc-ts summary::-webkit-details-marker{display:none}
.calc-ts[open] summary{margin-bottom:.4rem}
.calc-power{display:flex;gap:.5rem;align-items:center}
.calc-power .calc-in{flex:1}
.calc-mini{min-height:44px;padding:0 .8rem;border:1px solid var(--border);border-radius:.6rem;background:transparent;color:var(--fg);font:inherit;font-size:.9rem;font-weight:600;white-space:nowrap;cursor:pointer}
.calc-mini:hover{border-color:var(--accent)}
.calc-mini[hidden]{display:none}
.calc-chips{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center;border:0;margin:.3rem 0 .7rem;padding:0}
.calc-chips legend{float:left;margin-right:.5rem;color:var(--muted);font-size:.92rem;line-height:44px}
.calc-chips label{position:relative;display:inline-flex}
.calc-chips input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}
.calc-chips span{display:inline-flex;align-items:center;min-height:44px;padding:0 1rem;border:1px solid var(--border);border-radius:999px;background:var(--card);color:var(--fg);font-weight:600;font-size:.92rem}
.calc-chips input:checked+span{border-color:var(--accent);color:var(--accent)}
.calc-chips input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}
.calc-chart{margin:1rem 0 .4rem}
.calc-grid+.calc-units{margin-top:.9rem}
.calc-out td.over{color:#f87171}
.calc-out .over{color:#f87171;font-weight:700}
.calc-out td a{font-weight:600}
.calc-picks{display:grid;gap:.7rem;grid-template-columns:repeat(3,minmax(0,1fr));margin:.9rem 0}
.calc-pick{border:1px solid var(--border);border-radius:.7rem;background:var(--bg);padding:.8rem .9rem;display:flex;flex-direction:column;gap:.45rem;min-width:0}
.calc-pick.best{border-color:var(--accent)}
.calc-pick h3{margin:0;font-size:1.05rem;display:flex;align-items:center;gap:.45rem}
.calc-pick h3 .sw{width:.75rem;height:.75rem;border-radius:3px;flex:none}
.calc-pick .start{font-size:.76rem;font-weight:600;color:var(--accent);margin-left:auto}
.calc-pick .big{font-size:1.35rem;font-weight:700;font-variant-numeric:tabular-nums}
.calc-pick .big em{font-style:normal;color:var(--muted);font-size:.9rem;font-weight:500}
.calc-pick dl{display:grid;grid-template-columns:auto 1fr;gap:.25rem .7rem;margin:0;font-size:.9rem}
.calc-pick dt{color:var(--muted)}
.calc-pick dd{margin:0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.calc-pick .over{color:#f87171;font-weight:700}
.calc-pick .open{margin-top:auto;display:inline-flex;justify-content:center;align-items:center;min-height:44px;border:1px solid var(--border);border-radius:.6rem;color:var(--fg);text-decoration:none;font-weight:600;font-size:.92rem}
.calc-pick .open:hover{border-color:var(--accent)}
.calc-pick .open[hidden]{display:none}
.calc .calc-seg{display:inline-flex;align-self:flex-start;border:1px solid var(--border);border-radius:.6rem;overflow:hidden}
.calc-seg label{position:relative;display:flex;align-items:center;min-height:44px;padding:0 1.1rem;font-weight:600;color:var(--fg);cursor:pointer}
.calc .calc-seg input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;padding:0;cursor:pointer}
.calc-seg label:has(input:checked){background:rgba(78,215,233,.14);color:var(--accent)}
.calc-seg label:has(input:focus-visible){outline:2px solid var(--accent);outline-offset:-2px}
@media (max-width:700px){.calc-picks{grid-template-columns:1fr}}
.calc-size{display:grid;grid-template-columns:minmax(0,1fr) 11rem;gap:1rem;align-items:start}
.calc-shape{margin:0;padding:.6rem;border:1px solid var(--border);border-radius:.6rem;background:var(--bg);display:flex;flex-direction:column;align-items:center;gap:.3rem}
.calc-shape>span{display:block;width:100%;max-width:10rem}
.calc-shape svg{display:block;width:100%;height:auto}
.calc-shape .o{fill:none;stroke:var(--draw);stroke-width:2;stroke-linejoin:round}
.calc-shape .g{fill:none;stroke:var(--muted);stroke-dasharray:3 3}
.calc-shape text{fill:var(--muted);font:13px system-ui,sans-serif}
.calc-shape figcaption{margin:0;color:var(--muted);font-size:.85rem;text-align:center;line-height:1.35}
.calc-part{border:0;border-top:1px solid var(--border);margin:1.1rem 0 0;padding:.8rem 0 0;min-width:0}
.calc-part legend{float:left;width:100%;margin:0 0 .5rem;padding:0;font-weight:650;color:var(--fg);display:flex;justify-content:space-between;gap:1rem}
.calc-part legend span{color:var(--muted);font-weight:500;font-variant-numeric:tabular-nums}
.calc-part .calc-grid{clear:both}
.calc-part .calc-grid+.calc-grid{margin-top:.7rem}
.calc-net{display:flex;align-items:baseline;flex-wrap:wrap;gap:.2rem .6rem;margin:.2rem 0 .3rem;font-variant-numeric:tabular-nums}
.calc-net strong{font-size:1.9rem;line-height:1.2}
.calc-net span{color:var(--muted)}
.calc-net+.calc-out td{font-variant-numeric:tabular-nums;text-align:right}
.calc-out tr.total th,.calc-out tr.total td{color:var(--fg);font-weight:700}
.calc-done{padding:.6rem .8rem;border:1px solid var(--border);border-radius:.5rem;margin:.6rem 0 0;color:#d3d8e2}
.calc-est{color:var(--draw);font-weight:600}
@media (max-width:700px){.calc-units label{min-height:44px}.calc-size{grid-template-columns:1fr}.calc-shape{order:-1;flex-direction:row;justify-content:center}.calc-shape>span{max-width:7.5rem}.calc-shape figcaption{text-align:left;max-width:12rem}}
`;

// ---- Open baffle ----

/** The {{calc:…}} values of open-baffle.md: a column per driver of the worked example (p, r). */
export function obExampleValues(): Record<string, string> {
  const v: Record<string, string> = {};
  const f = (x: number | null, dp = 0) => (x === null ? "–" : x.toFixed(dp));
  OB_CALC.driverIds.forEach((id, i) => {
    const k = "pr"[i]!;
    const r = obCalcRun(id);
    const t = r.open.ts;
    const qts = qtsOf(r.open) ?? 0;
    const shelf = r.eq.find((e) => e.type === "lowshelf1");
    v[`${k}-qts`] = qts.toFixed(2);
    v[`${k}-fs`] = f(t.fs ?? null, (t.fs ?? 0) < 30 ? 1 : 0);
    v[`${k}-d`] = f(r.d_m * 100);
    v[`${k}-peak`] = f(r.fPeak);
    v[`${k}-null`] = f(r.fNull);
    v[`${k}-f3`] = f(r.f3);
    v[`${k}-f3eq`] = f(r.f3Eq, 1);
    v[`${k}-loss`] = f(r.loss === null ? null : -r.loss, 1);
    v[`${k}-losseq`] = f(r.lossEq === null ? null : -r.lossEq, 1);
    v[`${k}-shelf`] = shelf ? `+${shelf.gain_db} dB at ${shelf.freq} Hz` : "–";
    v[`${k}-x`] = f(r.x_mm, 1);
    v[`${k}-xmax`] = String(r.xmax_mm);
    v[`${k}-suits`] = r.suits === "passive" ? "an open baffle without EQ" : r.suits === "dsp" ? "an open baffle with DSP EQ" : "neither";
  });
  return v;
}

/** The calculator itself: a form the script makes live (hidden until it starts). Starts with the worked example's first driver and board. */
export function obForm(): string {
  const b = OB_CALC.board;
  const len = (id: string, label: string, value: number, extra = "") =>
    `<label class="calc-field"${extra}><span>${label}</span><span class="calc-in"><input id="${id}" type="number" inputmode="decimal" min="0" step="any" value="${value}"><em data-unit="len">cm</em></span></label>`;
  const count = `<label class="calc-field"><span>Number of drivers</span><input id="ob-n" type="number" inputmode="numeric" min="1" step="1" value="1"></label>\n`;
  return `<div class="calc">
<p class="calc-nojs">The calculator needs JavaScript. The worked example below shows what it gives.</p>
<form id="ob-form" class="calc-form" hidden onsubmit="return false" data-driver-id="${OB_CALC.driverIds[0]}">
<fieldset class="calc-units"><legend>Units</legend><label><input type="radio" name="ob-units" id="ob-metric" checked> cm</label><label><input type="radio" name="ob-units" id="ob-imperial"> inches</label></fieldset>
<fieldset class="calc-units"><legend>Work out</legend><label><input type="radio" name="ob-mode" id="ob-mode-have" checked> Board I have</label><label><input type="radio" name="ob-mode" id="ob-mode-peak"> Board for a peak at …</label></fieldset>
<div id="ob-have">
${chips("ob-framepick", "Frame", [{ value: "flat", label: "Flat board" }, { value: "h", label: "H-frame" }, { value: "u", label: "U-frame" }], b.frame)}
<input type="hidden" id="ob-frame" value="${b.frame}">
<div class="calc-grid">
${len("ob-w", "Width", b.w_cm)}
${len("ob-h", "Height", b.h_cm)}
${len("ob-x", "Driver from the left", b.x_cm)}
${len("ob-y", "Driver from the bottom", b.y_cm)}
${len("ob-depth", "Frame depth", b.depth_cm, ' id="ob-depthfield" hidden')}
</div>
</div>
<div id="ob-peak" hidden>
<div class="calc-grid"><label class="calc-field"><span>Dipole peak at</span><span class="calc-in"><input id="ob-fp" type="number" inputmode="decimal" min="0" step="any" value="300"><em>Hz</em></span></label></div>
<p class="calc-note">Crossing over at a frequency you know? Aim the peak at about twice it.</p>
${chips("ob-arpick", "Board shape", [{ value: "square", label: "Square" }, { value: "tall", label: "Tall (1 : 2)" }], "square")}
<input type="hidden" id="ob-ar" value="square">
</div>
<div class="calc-grid">${len("ob-t", "Board thickness", b.t_cm)}</div>
${driverFields("ob", OB_CALC.power_w, count, OB_CALC.driverIds[0])}
<div id="ob-out" class="calc-result" aria-live="polite"></div>
<div id="ob-chart" class="calc-chart" data-calc-chart></div>
${calcActions("ob", "Open this baffle in the simulator")}
</form>
</div>`;
}

// ---- Pages ----

/**
 * The classes a live chart adds once it's touched or hovered (its tip, cursor and legend's value
 * column; LogChart.tsx, ChartLegend.tsx), which a worked example's still chart doesn't have: their
 * rules come from the app's stylesheet like the still chart's (appChartCss keeps a rule only when
 * every class it names is in the markup it's given). Without them, a tap on a phone dropped the
 * tip's whole table, unstyled, above the chart.
 */
export const LIVE_CHART_MARKUP = `<figure class="chart"><div class="chart-main"><div class="chart-tip chart-hint"><table class="tip-table legend"><tr class="part"><th class="legend-at on num">` +
  `<span class="lead muted over"></span></th><td class="legend-val tip-peak legend-note num"></td></tr></table></div>` +
  `<svg class="chart-point cursor cursor-dot cursor-badge"></svg></div></figure>`;
export const liveChartCss = () => appChartCss(LIVE_CHART_MARKUP);

/**
 * Every calculator page: its text and form (here and in site/calculators/<md>), and its live
 * script (a Vite input, packages/web/vite.config.ts). `chartStyle`: the app's chart styles the
 * live chart needs beyond the worked example's chart (all of them when the example has none).
 */
export interface CalcPage {
  path: string;
  title: string;
  description: string;
  h1: string;
  lede: string;
  /** Breadcrumb name under Calculators. */
  crumb: string;
  md: string;
  values: () => Record<string, string>;
  form: () => string;
  /** The script, as vite.config.ts names its input. */
  entry: string;
  chartStyle?: () => string;
}

export const CALC_PAGES: CalcPage[] = [
  {
    path: "/calculators/subwoofer-box/",
    title: "Subwoofer box calculator: compact, balanced and deep boxes for your sub",
    description: "What box for my sub? Three boxes for your subwoofer and amplifier, compact to deep, sealed or ported, with box size in litres and ft³, port size and air speed.",
    h1: "Subwoofer box calculator",
    lede: "Pick your sub and your amplifier's power: three boxes that suit it, from compact to deep, sealed or ported, each worked out with the simulator's own engine.",
    crumb: "Subwoofer box",
    md: "subwoofer-box.md",
    values: () => subwooferExampleValues(),
    form: () => subwooferForm(),
    entry: "src/calculators/subwooferBox.ts",
  },
  {
    path: "/calculators/port-length/",
    title: "Port length calculator: round and slot ports, with air speed",
    description: "Work out a speaker port's length for any box and tuning, round or slot, with flares, end corrections and the port's own volume. Then check its air speed with your driver.",
    h1: "Port length calculator",
    lede: "The length of a round or slot port for your box and tuning, worked out with the simulator's own port model. Pick your driver to see whether the port will chuff.",
    crumb: "Port length",
    md: "port-length.md",
    values: () => portExampleValues(),
    form: () => portForm(),
    entry: "src/calculators/portLength.ts",
  },
  {
    path: "/calculators/passive-radiator/",
    title: "Passive radiator calculator: added mass, tuning and PR travel",
    description: "Work out how much mass to add to a passive radiator for any box and tuning, from the PR database or your own values. Then check the PRs keep up with your driver.",
    h1: "Passive radiator calculator",
    lede: "The added mass that tunes your box, worked out with the simulator's own PR model. Pick your driver to see whether the PRs run out of travel before the cone does.",
    crumb: "Passive radiator",
    md: "passive-radiator.md",
    values: () => prExampleValues(),
    form: () => prForm(),
    entry: "src/calculators/passiveRadiator.ts",
  },
  {
    path: "/calculators/sealed-box/",
    title: "Sealed box calculator: box volume for any Qtc, with F3 and excursion",
    description: "Work out a sealed speaker box's volume from your driver's T/S parameters and the Qtc you want, or the Qtc, F3 and cone excursion of the box you already have.",
    h1: "Sealed box calculator",
    lede: "The box volume for the Qtc you want, or the Qtc, F3 and cone excursion of the box you have, worked out with the simulator's own engine.",
    crumb: "Sealed box",
    md: "sealed-box.md",
    values: () => sealedExampleValues(),
    form: () => sealedForm(),
    entry: "src/calculators/sealedBox.ts",
  },
  {
    path: "/calculators/ported-box/",
    title: "Ported box calculator: QB3, C4 and BB4 boxes with port size",
    description: "Size a ported speaker box for your driver the way WinISD's wizard does (QB3, C4, BB4), with a port that fits, its air speed and the cone's excursion at your power.",
    h1: "Ported box calculator",
    lede: "A ported box for your driver, sized as WinISD's wizard sizes it, with a port that fits and its air speed, worked out with the simulator's own engine.",
    crumb: "Ported box",
    md: "ported-box.md",
    values: () => portedExampleValues(),
    form: () => portedForm(),
    entry: "src/calculators/portedBox.ts",
  },
  {
    path: "/calculators/box-volume/",
    title: "Speaker box volume calculator: net litres for any shape, minus driver, port and bracing",
    description: "Work out a speaker box's real net volume from its outside size and walls: box, car wedge, cylinder, sphere or tapered, minus driver, port, PR and bracing. Or the size for the litres you want.",
    h1: "Box volume calculator",
    lede: "The real net volume of your box: outside size and walls in, minus the driver, ports, passive radiators and bracing, for a box, car wedge, cylinder, sphere or tapered box. Or the outside size for the net volume you want. The same sums as the simulator's Build tab.",
    crumb: "Box volume",
    md: "box-volume.md",
    values: () => boxVolumeExampleValues(),
    form: () => boxVolumeForm(),
    entry: "src/calculators/boxVolume.ts",
  },
  {
    path: "/calculators/open-baffle/",
    title: "Open baffle calculator: dipole peak, bass loss and the EQ that wins it back",
    description: "Work out an open baffle's dipole peak and null, how much bass it loses against the same driver in a wall, and the EQ that wins it back. Or the board size for the peak you want.",
    h1: "Open baffle calculator",
    lede: "How a board or frame shapes the bass: where its dipole peak and first null fall, how much bass it loses against the same driver in a wall, and the EQ that wins it back. Or the board size for the peak you want. Worked out with the simulator's own open baffle model.",
    crumb: "Open baffle",
    md: "open-baffle.md",
    values: () => obExampleValues(),
    form: () => obForm(),
    entry: "src/calculators/openBaffle.ts",
    // The live chart's in-a-wall curve is dashed, which the worked example's chart isn't: its legend swatch's rules.
    chartStyle: () => appChartCss('<figure class="chart"><table class="legend"><tr><th><span class="legend-name"><svg class="legend-swatch line"></svg></span></th></tr></table></figure>'),
  },
];

// ---- Shared form parts ----

/** The example driver every box calculator starts with (the port and PR pages' worked examples use it too). */
export const EXAMPLE_DRIVER = "dayton-audio/rss315hf-4";

const num = (v: number | undefined) => (v === undefined ? "" : String(Math.round(v * 1000) / 1000));

/**
 * The driver part of a box calculator (packages/web/src/calculators/driverInput.ts wires it):
 * database driver, T/S by hand (filled with the example driver's values), amplifier power with
 * "Rated N W". `power` is the starting power; `before` is markup for fields that sit in the
 * row of the power field (the number of drivers); `driverId` the driver it starts with.
 */
export function driverFields(prefix: string, power: number, before = "", driverId = EXAMPLE_DRIVER): string {
  const rec = loadDb().drivers.find((d) => d.id === driverId);
  if (!rec) throw new Error(`calculators: ${driverId} isn't in the database`);
  const t = rec.data.ts as unknown as Record<string, number | undefined>;
  const field = (id: string, label: string, v: number | undefined, unit: string) =>
    `<label class="calc-field"><span>${label}</span><span class="calc-in"><input id="${prefix}-${id}" type="number" inputmode="decimal" min="0" step="any" value="${num(v)}"><em>${unit}</em></span></label>`;
  const qts = t.qes && t.qms ? (t.qes * t.qms) / (t.qes + t.qms) : t.qts;
  const status = [`${rec.data.size_in}″`, `Fs ${t.fs} Hz`, `Qts ${qts?.toFixed(2)}`, `Vas ${t.vas_l} L`, t.xmax_mm ? `Xmax ${t.xmax_mm} mm` : "", t.pe_w ? `${t.pe_w} W` : ""].filter(Boolean).join(" · ");
  return `<div class="calc-grid">
<label class="calc-field calc-wide"><span>Driver (from the database)</span><input id="${prefix}-driver" list="${prefix}-drivers" value="${rec.data.brand} ${rec.data.model}" placeholder="Start typing a brand or model" autocomplete="off"><datalist id="${prefix}-drivers"></datalist><small id="${prefix}-driver-status" class="calc-status">${status}</small></label>
</div>
<details id="${prefix}-ts" class="calc-ts"><summary>No driver in the database? Enter its T/S by hand</summary>
<div class="calc-grid">
${field("fs", "Fs", t.fs, "Hz")}
${field("qes", "Qes", t.qes, "")}
${field("qms", "Qms", t.qms, "")}
${field("vas", "Vas", t.vas_l, "L")}
${field("re", "Re", t.re, "Ω")}
${field("sd", "Sd", t.sd_cm2, "cm²")}
${field("xmax", "Xmax (one way)", t.xmax_mm, "mm")}
${field("pe", "Rated power, Pe", t.pe_w, "W")}
</div>
</details>
<div class="calc-grid">
${before}<label class="calc-field"><span>Amplifier power</span><span class="calc-power"><span class="calc-in"><input id="${prefix}-power" type="number" inputmode="decimal" min="0" step="any" value="${power}"><em>W</em></span><button id="${prefix}-rated" class="calc-mini" type="button" data-watts="${t.pe_w ?? ""}"${t.pe_w ? "" : " hidden"}>Rated ${t.pe_w ?? ""} W</button></span></label>
</div>`;
}

/**
 * A row of choice chips (radio buttons that look like the site's chips). `options`: value and
 * label; the first is checked unless `checked` names another.
 */
export function chips(name: string, legend: string, options: { value: string; label: string }[], checked?: string): string {
  const on = checked ?? options[0]?.value;
  return `<fieldset class="calc-chips"><legend>${legend}</legend>${options
    .map((o) => `<label><input type="radio" name="${name}" value="${o.value}"${o.value === on ? " checked" : ""}><span>${o.label}</span></label>`)
    .join("")}</fieldset>`;
}

// ---- Hub (/calculators/) ----

/** Every calculator page, in the hub's order. `isNew` puts a "New" tag on its card. */
export const CALCULATORS: { path: string; name: string; blurb: string; isNew?: boolean }[] = [
  { path: "/calculators/subwoofer-box/", name: "Subwoofer box calculator", blurb: "What box for my 12-inch sub? A compact, a balanced and a deep box, sealed or ported, at your amplifier's power.", isNew: true },
  { path: "/calculators/sealed-box/", name: "Sealed box calculator", blurb: "The box volume for a target Qtc, or the Qtc, F3 and cone excursion of the box you have.", isNew: true },
  { path: "/calculators/ported-box/", name: "Ported box calculator", blurb: "QB3, C4 and BB4 boxes sized as WinISD's wizard sizes them, with a port that fits and its air speed.", isNew: true },
  { path: "/calculators/open-baffle/", name: "Open baffle calculator", blurb: "How big a baffle, where its dipole peak and null fall, how much bass it loses and the EQ that wins it back.", isNew: true },
  {
    path: "/calculators/box-volume/",
    name: "Box volume calculator",
    blurb: "The real net litres of a box, car wedge, cylinder, sphere or tapered box, minus driver, ports and bracing. Or the size for the litres you want.",
    isNew: true,
  },
  { path: "/calculators/port-length/", name: "Port length calculator", blurb: "The length of a round or slot port for any box and tuning, and whether it will chuff." },
  { path: "/calculators/passive-radiator/", name: "Passive radiator calculator", blurb: "The added mass that tunes your box, and whether the PRs keep up with your driver." },
];

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A calculator's picture on the hub: site/img/calculators/<slug>.svg (same rules as the guides' pictures). */
export const calcSlug = (path: string): string => path.replace(/^\/calculators\/|\/$/g, "");

/** The hub's card grid. The picture is decorative (the link names the calculator), so its alt is empty, as on the guides list. */
export function hubCards(): string {
  return `<ul class="calc-hub">\n${CALCULATORS.map(
    (c) =>
      `<li><a href="${c.path}">${escHtml(c.name)}</a><img class="thumb" src="/guides/img/calculators/${calcSlug(c.path)}.svg" alt="" width="1200" height="630" loading="lazy"><small>${escHtml(c.blurb)}</small>${c.isNew ? '<span class="tag">New</span>' : ""}</li>`,
  ).join("\n")}\n</ul>`;
}

export const HUB_STYLE = `
.calc-hub{display:grid;gap:.6rem;grid-template-columns:repeat(2,minmax(0,1fr));padding:0;margin:1rem 0 1.4rem;list-style:none}
.calc-hub li{padding:.85rem 1rem;border:1px solid var(--border);border-radius:.7rem;background:var(--card);display:flex;flex-direction:column;gap:.3rem}
.calc-hub a{font-weight:650;text-decoration:none;font-size:1.05rem}
.calc-hub small{color:var(--muted);font-size:.92rem;line-height:1.45}
.calc-hub .tag{align-self:flex-start;font-size:.78rem;font-weight:600;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:.05rem .55rem}
.calc-hub .thumb{order:-1;display:block;width:calc(100% + 2rem);max-width:none;height:auto;aspect-ratio:1200/630;margin:-.85rem -1rem .55rem;border-bottom:1px solid var(--border);border-radius:.7rem .7rem 0 0}
@media (max-width:700px){.calc-hub{grid-template-columns:1fr}
.calc-hub li{display:flow-root}
.calc-hub li>a{display:block;margin-bottom:.35rem}
.calc-hub .thumb{float:left;width:6rem;height:4.5rem;aspect-ratio:auto;margin:.2rem .9rem .35rem 0;object-fit:cover;border:1px solid var(--border);border-radius:.5rem}
.calc-hub small{display:block}
.calc-hub .tag{display:inline-block;margin-top:.35rem}}
`;
