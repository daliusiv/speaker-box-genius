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
import { DEFAULT_STATE, newDesign, type VentedDesign } from "../packages/web/src/state.ts";
import { airOf, limitsOf, PORT_LIMIT, runDesigns, solveDriver } from "../packages/web/src/sim.ts";
import { driverState, loadDb } from "./drivers.ts";

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
<p><a id="pc-open" class="button" href="/" hidden>Open this box in the simulator</a></p>
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

function prParamsOf(id: string): PrCalcInput["pr"] & { name: string; maxAdded_g?: number } {
  const rec = loadDb().passiveRadiators.find((p) => p.id === id);
  if (!rec) throw new Error(`calculators: ${id} isn't in the database`);
  const p = rec.data.params;
  if (p.vas_l === undefined) throw new Error(`calculators: ${id} has no Vas`);
  return { name: `${rec.data.brand} ${rec.data.model}`, mms_g: p.mms_g, sd_cm2: p.sd_cm2, xmax_mm: p.xmax_mm, qms: p.qms ?? 10, vas_l: p.vas_l, ...(p.max_added_mass_g ? { maxAdded_g: p.max_added_mass_g } : {}) };
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
<form id="prc-form" class="calc-form" hidden onsubmit="return false" data-pr-name="${p.name}">
<fieldset class="calc-units"><legend>Units</legend><label><input type="radio" name="prc-units" id="prc-metric" checked> litres, grams</label><label><input type="radio" name="prc-units" id="prc-imperial"> ft³, ounces</label></fieldset>
<div class="calc-grid">
${num("prc-vb", "Net box volume", String(PR_EXAMPLE.vb_l), "L")}
${num("prc-fb", "Tuning frequency", String(PR_EXAMPLE.fb), "Hz")}
<label class="calc-field"><span>Number of PRs</span><input id="prc-n" type="number" inputmode="numeric" min="1" step="1" value="1"></label>
<label class="calc-field calc-wide"><span>Passive radiator (from the database, or type its values below)</span><input id="prc-pr" list="prc-prs" value="${p.name}" placeholder="Start typing a brand or model" autocomplete="off"><datalist id="prc-prs"></datalist><small id="prc-pr-status" class="calc-status"></small></label>
${num("prc-mms", "Moving mass, Mms", String(p.mms_g), "g")}
${num("prc-sd", "Cone area, Sd", String(p.sd_cm2), "cm²")}
${num("prc-vas", "Compliance volume, Vas", String(p.vas_l), "L", ' title="Vas stays in litres in both unit systems, as on most datasheets"')}
${num("prc-xmax", "Xmax (one way)", String(p.xmax_mm), "mm")}
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
<p><a id="prc-open" class="button" href="/" hidden>Open this box in the simulator</a></p>
</form>
</div>`;
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
`;
