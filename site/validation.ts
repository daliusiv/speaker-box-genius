/**
 * The /validation/ page: every WinISD and Hornresp comparison, from the report the engine
 * writes (docs/validation/results.json, `pnpm validation:report`). Nothing here is typed by
 * hand: adding a case to packages/engine/validation adds it to the page.
 */
import { readFileSync } from "node:fs";
import type { Report, WinIsdCaseReport, HornrespCaseReport, HornrespBoxCaseReport, ImpulseReport, MaxSplReport, Curve } from "../packages/engine/validation/report.ts";
import { REPORT_FILE } from "../packages/engine/validation/report.ts";
import { chart } from "./chart.ts";
import { winisdBb4Alignment, winisdC4Alignment, winisdQb3Alignment, winisdQts } from "../packages/engine/src/winisdAlignments.ts";
import { sealedVolumeForAlignment } from "../packages/engine/src/alignments.ts";
import { WINISD_AIR } from "../packages/engine/src/constants.ts";
import { prFb } from "../packages/engine/src/model.ts";
import { simulate } from "../packages/engine/src/simulate.ts";
import { OUTPUT_UNITS, readSpiceReport, type SpiceReport } from "../packages/engine/validation/spice-report.ts";

const REPO = "https://github.com/daliusiv/speaker-box-genius";

export const readReport = (file = REPORT_FILE) => JSON.parse(readFileSync(file, "utf8")) as Report;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const minus = (s: string) => s.replace(/^-/, "−");
/** A value as read: up to three decimals, trailing zeros dropped. */
const num = (x: number, d = 3) => minus(String(Number(x.toFixed(d))));
const signed = (x: number, d: number) => (x > 0 ? "+" : x < 0 ? "−" : "±") + Math.abs(x).toFixed(d);

/** Inline Markdown for the notes: **bold**, `code`, paragraphs and - lists. */
function notes(md: string): string {
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  return md
    .split(/\n\n+/)
    .map((block) =>
      block.startsWith("- ")
        ? `<ul>${block
            .split(/\n(?=- )/)
            .map((li) => `<li>${inline(li.slice(2))}</li>`)
            .join("")}</ul>`
        : `<p>${inline(block)}</p>`,
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// WinISD
// ---------------------------------------------------------------------------

type Q = Report["quantities"];

function diffText(c: WinIsdCaseReport["checks"][number], q: Q[keyof Q]): string {
  if (c.diff === null) return "—";
  return q.rel ? `${signed(c.diff * 100, 2)} %` : `${signed(c.diff, 3)}${q.unit ? ` ${q.unit}` : ""}`;
}
function tolText(c: WinIsdCaseReport["checks"][number], q: Q[keyof Q]): string {
  return q.rel ? `±${num(c.tol * 100, 2)} %` : `±${num(c.tol, 3)}${q.unit ? ` ${q.unit}` : ""}`;
}

/** The largest difference in a case, per kind: dB, % and Hz. */
function largest(k: WinIsdCaseReport, q: Q): string {
  let db = -1, pct = -1, hz = -1;
  for (const c of k.checks) {
    if (c.diff === null) continue;
    const u = q[c.what];
    if (u.rel) pct = Math.max(pct, Math.abs(c.diff) * 100);
    else if (u.unit === "dB") db = Math.max(db, Math.abs(c.diff));
    else if (u.unit === "Hz") hz = Math.max(hz, Math.abs(c.diff));
  }
  return [db >= 0 ? `${num(db)} dB` : "", pct >= 0 ? `${num(pct, 2)} %` : "", hz >= 0 ? `${num(hz)} Hz` : ""]
    .filter(Boolean)
    .map((t) => `<span class="n">${t}</span>`)
    .join(" · ");
}

interface AlignmentCheck {
  driver: string;
  fs: number;
  qms: number;
  qes: number;
  vas_l: number;
  re: number;
  qb3: [number, number] | null;
  bb4: number | null;
  c4: [number, number] | null;
}

/** WinISD's own alignment boxes for 19 drivers, the same file the engine's tests check. */
export const readAlignmentChecks = (): AlignmentCheck[] =>
  JSON.parse(readFileSync(new URL("../packages/engine/test/fixtures/winisd-alignments.json", import.meta.url), "utf8")).cases;

/** The vented presets against WinISD's wizard: a table, and the largest differences. */
export function alignmentSection(cases: AlignmentCheck[]): { html: string; vbWorst: number; fbWorst: number; values: number } {
  let vbWorst = 0;
  let fbWorst = 0;
  let values = 0;
  const pct = (a: number, b: number, which: "vb" | "fb") => {
    const d = ((a - b) / b) * 100;
    // WinISD shows two decimals: a box under 2 L is held to that rounding, not to a percentage.
    if (which === "vb" && b >= 2) vbWorst = Math.max(vbWorst, Math.abs(d));
    if (which === "fb") fbWorst = Math.max(fbWorst, Math.abs(d));
    values++;
    return `<span class="n">${signed(d, 2)} %</span>`;
  };
  const cell = (w: [number, number] | null, ours: { vb_l: number; fb: number } | null, bb4 = false) => {
    if (!w) return "<td>–</td>";
    if (!ours) return `<td>${num(w[0], 2)} L / ${num(w[1], 2)} Hz<br><small>not offered</small></td>`;
    return `<td>${num(w[0], 2)} L / ${num(w[1], 2)} Hz<br><small>ours ${num(ours.vb_l, 2)} L ${pct(ours.vb_l, w[0], "vb")}${bb4 ? "" : ` / ${num(ours.fb, 2)} Hz ${pct(ours.fb, w[1], "fb")}`}</small></td>`;
  };
  const rows = cases
    .map((c) => {
      const d = { fs: c.fs, qms: c.qms, qes: c.qes, vas_l: c.vas_l, re: c.re };
      const qts = (c.qms * c.qes) / (c.qms + c.qes);
      return `<tr><td>${esc(c.driver)}</td><td>${qts.toFixed(2)} <small>(${winisdQts(d).toFixed(3)})</small></td>${cell(c.qb3, winisdQb3Alignment(d))}${cell(c.bb4 === null ? null : [c.bb4, c.fs], winisdBb4Alignment(d), true)}${cell(c.c4, winisdC4Alignment(d))}</tr>`;
    })
    .join("");
  const html = `<div class="table"><table><thead><tr><th>Driver</th><th>Qts <small>(with Rg)</small></th><th>QB3</th><th>BB4 / SBB4 <small>(Fb = Fs)</small></th><th>C4 / SC4</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return { html, vbWorst, fbWorst, values };
}

/** WinISD's other wizard and panel numbers (fixtures/winisd-parity.json): sealed presets, Qtc and Fsc, PR tuning. */
export function paritySection(): { html: string; values: number; worst: number } {
  const F = JSON.parse(readFileSync(new URL("../packages/engine/test/fixtures/winisd-parity.json", import.meta.url), "utf8"));
  let values = 0;
  let worst = 0;
  const d = (ours: number, w: number, digits: number) => {
    values++;
    const pc = ((ours - w) / w) * 100;
    worst = Math.max(worst, Math.abs(pc));
    return `<td>${num(w, digits)}</td><td>${num(ours, digits)} <small class="n">${signed(pc, 2)} %</small></td>`;
  };
  const drv = (qts: number) => ({ fs: 30, qms: 5, qes: 1 / (1 / qts - 1 / 5), vas_l: 50, re: 6 });
  const sealed = F.sealed.cases
    .map((c: { qts: number; qtc: number; vb: number }) => `<tr><td>${c.qts.toFixed(2)}</td><td>${c.qtc}</td>${d(sealedVolumeForAlignment({ ...drv(c.qts), style: "winisd" }, c.qtc)!, c.vb, 2)}</tr>`)
    .join("");
  const qtc = F.qtc.cases
    .map((c: { vb: number; qa: number | null; qtc: number; fsc: number }) => {
      const r = simulate({ ...drv(0.4), sd_cm2: 220 }, { kind: "sealed", vb_l: c.vb, ql: Infinity, qa: c.qa ?? Infinity }, { rg: 0.1, air: WINISD_AIR, fMin: 20, fMax: 200, points: 20 });
      return `<tr><td>${num(c.vb, 2)} L, Qa ${c.qa ?? "none"}</td>${d(r.summary.qtc!, c.qtc, 3)}${d(r.summary.fc!, c.fsc, 2)}</tr>`;
    })
    .join("");
  const pr = { mms_g: 300, sd_cm2: 506.7, xmax_mm: 26, qms: 4.79, vas_l: 78.9 };
  const prs = F.prTuning.cases
    .map((c: { vb: number; count: number; added_g: number; fb: number }) => `<tr><td>${c.vb} L, ${c.count} × RSS315-PR, +${num(c.added_g, 2)} g</td>${d(prFb(c.vb, pr, c.count, c.added_g, WINISD_AIR), c.fb, 2)}</tr>`)
    .join("");
  const html = `<div class="table"><table><thead><tr><th>Qts</th><th>Qtc</th><th>WinISD Vb (L)</th><th>Ours</th></tr></thead><tbody>${sealed}</tbody></table></div>
<p>WinISD's Box panel (leak off: with its default leak, its Qtc and Fsc readouts move in ways its own response curves don't show, so they aren't compared):</p>
<div class="table"><table><thead><tr><th>Box</th><th>WinISD Qtc</th><th>Ours</th><th>WinISD Fsc (Hz)</th><th>Ours</th></tr></thead><tbody>${qtc}</tbody></table></div>
<p>Passive radiator tuning (WinISD's Fh):</p>
<div class="table"><table><thead><tr><th>Box</th><th>WinISD Fh (Hz)</th><th>Ours</th></tr></thead><tbody>${prs}</tbody></table></div>`;
  return { html, values, worst };
}

/** The full WinISD run: a table per project of what was compared and the largest difference per graph. */
function runSection(r: Report["winisdRun"], group: (id: string, label: string, cases: { pass: boolean }[], body: string) => string): string {
  const fmt = (g: keyof Report["winisdRun"]["tol"], d: number) => (r.tol[g].rel ? `${(d * 100).toFixed(2)} %` : `${d.toFixed(3)} ${r.tol[g].unit}`);
  const rows = r.cases
    .map((c) => {
      // A percentage over its tolerance passed on the absolute rule (WinISD's last digit, or group delay in ms): show that gap too.
      const worst = (Object.entries(c.worst) as [keyof Report["winisdRun"]["tol"], number][])
        .map(([g, d]) => {
          const a = c.abs?.[g];
          const extra = r.tol[g].rel && d > r.tol[g].tol && a !== undefined ? ` (${a} ${r.tol[g].unit})` : "";
          return `<span class="n">${esc(r.tol[g].label)} ${fmt(g, d)}${extra}</span>`;
        })
        // Each figure stays on one line; the list wraps between them.
        .join("; ");
      // A project whose readings were all left out was checked again as its u-repeat.
      const redo = c.compared === 0 ? r.cases.find((u) => u.id === `u${c.id.slice(1)}` && u.compared > 0) : undefined;
      if (redo) return `<tr><td><code>${esc(c.id)}</code> ${esc(c.title)}</td><td>0</td><td><small>All left out (see below); checked again as <code>${esc(redo.id)}</code></small></td><td><span class="muted">—</span></td></tr>`;
      return `<tr><td><code>${esc(c.id)}</code> ${esc(c.title)}</td><td>${c.compared}</td><td><small>${worst || "—"}</small></td><td>${ok(c.pass)}</td></tr>`;
    })
    .join("");
  const tols = (Object.entries(r.tol) as [keyof Report["winisdRun"]["tol"], Report["winisdRun"]["tol"][keyof Report["winisdRun"]["tol"]]][])
    .filter(([g]) => g !== "tfpr")
    .map(([, t]) => `${esc(t.label)} ${t.rel ? `${(t.tol * 100).toFixed(1)} %` : `${t.tol} ${esc(t.unit)}`}`)
    .join(", ");
  const skipped = Object.entries(r.skipped)
    .sort((a, b) => b[1] - a[1])
    .map(([why, n]) => `<li>${n}: ${esc(why)}</li>`)
    .join("");
  const known = r.known.map((k) => `<li><code>${esc(k.id)}</code> ${esc(r.tol[k.graph].label)} at ${num(k.f, 2)} Hz: WinISD ${minus(String(k.winisd))}, ours ${minus(String(k.ours))}. ${esc(k.note)}</li>`).join("");
  const ocr = r.ocr.map((k) => `<code>${esc(k.id)}</code> ${esc(r.tol[k.graph].label)} at ${num(k.f, 2)} Hz (${esc(k.note)})`).join("; ");
  return `<p>${r.cases.length} WinISD projects written by the app's own WinISD export and opened in WinISD, with ${r.readings} values read off WinISD's graph cursor at six frequencies from 15 to 150 Hz: sealed, ported, passive radiator and bandpass boxes with losses, amplifier resistance, coil inductance and heating, air conditions, distance, two and four drivers, isobaric pairs, high-pass filters and runs at rated power. ${r.compared} values are compared, each within ${tols}, or within WinISD's last displayed digit (0.0015), and a group delay also passes within ${r.gdAbsMs} ms: near a notch the delay is tiny, so a large percentage can be a fraction of a millisecond. Where a percentage below is over its tolerance, the absolute gap is shown in brackets. The projects and readings are in <a href="${REPO}/tree/main/packages/engine/test/fixtures/winisd-run">fixtures/winisd-run</a>.</p>
${group("winisd-run-cases", `${r.cases.length} projects, ${r.compared} values`, r.cases, `<div class="table"><table><thead><tr><th>Project</th><th>Values</th><th>Largest difference</th><th>OK</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="known"><h4>Left out</h4><ul>${skipped}</ul><p>OCR misreads, one digit off and plain against the neighbouring values: ${ocr}.</p><h4>Leftover differences</h4><ul>${known}</ul></div>`)}`;
}

/** How an output is named on the page (units go with the numbers; group delay is a share of its tolerance). */
const spiceName = (o: string) => (o === "Group delay (ms)" ? "Group delay (share of tolerance)" : o.replace(/ \((dB|°)\)$/, ""));

/** A circuit-check difference with its unit: dB, degrees, per cent for relative outputs (as their tolerances are), or a bare share of tolerance. */
function spiceValue(output: string, x: number): string {
  const u = OUTPUT_UNITS[output]!.unit;
  return u === "dB" ? `${sci(x)}&nbsp;dB` : u === "°" ? `${sci(x)}°` : u === "rel" ? `${sci(x * 100)}&nbsp;%` : sci(x);
}

/** 1.6 × 10⁻⁷ for the circuit check's tiny differences. */
function sci(x: number): string {
  if (x === 0) return "0";
  const e = Math.floor(Math.log10(x) + 1e-9);
  return `${(x / 10 ** e).toFixed(1)}&nbsp;×&nbsp;10<sup>${minus(String(e))}</sup>`;
}

const KIND_LABEL: Record<string, string> = {
  sealed: "sealed",
  vented: "ported",
  pr: "passive radiator",
  bandpass: "hand-made bandpass",
  bp4: "4th-order bandpass",
  bp6p: "6th-order bandpass (parallel)",
  bp6s: "6th-order bandpass (series)",
  chain: "with high-pass filters, EQ and passive parts",
};

/** The independent circuit check (docs/validation/spice.json, `pnpm spice:report`). */
export function spiceSection(rep: SpiceReport, cirHref: (id: string) => string): { html: string; failing: number } {
  const cell = (o: SpiceReport["outputs"][number], r: "below" | "around" | "above") => {
    const g = o.regions[r];
    if (!g.points) return "<td>–</td>";
    return `<td>${spiceValue(o.output, g.worst)}<br><span class="muted">mean ${spiceValue(o.output, g.mean)}</span></td>`;
  };
  const rows = rep.outputs
    .map((o) => `<tr><td>${esc(spiceName(o.output))}</td><td>${o.comparisons}</td>${cell(o, "below")}${cell(o, "around")}${cell(o, "above")}<td>${OUTPUT_UNITS[o.output]!.tol}</td><td>${ok(o.pass)}</td></tr>`)
    .join("");
  const kinds = Object.entries(rep.kinds)
    .map(([k, n]) => `${n} ${KIND_LABEL[k] ?? k}`)
    .join(", ");
  const charts = rep.showcase
    .map((c) => {
      const pts = (i: 1 | 2) => c.points.map((p) => [p[0], p[i]] as [number, number]);
      const peak = Math.max(...c.points.map((p) => p[2]));
      const what = c.output === "spl" ? "SPL" : "Impedance";
      return `<figure>${chart({
        label: what,
        unit: c.unit,
        series: [
          { points: pts(2), style: "ref" },
          { points: pts(1), style: "line" },
        ],
        aria: `${what} of ${c.title}: the circuit's curve as a wide band, ours as a line on top of it`,
        ...(c.output === "spl" ? { yMin: Math.floor((peak - 45) / 10) * 10 } : {}),
      })}<figcaption>${what}: ${esc(c.title)} · <a href="${cirHref(c.id)}" download>netlist</a></figcaption></figure>`;
    })
    .join("");
  const failing = rep.outputs.filter((o) => !o.pass).length;
  const spl = rep.outputs.find((o) => o.output === "SPL (dB)")!;
  const html = `<p>WinISD and Hornresp are other people's models of the same physics, so agreeing with them shows the app does what they do. This check is different: for each case a separate program writes the textbook equivalent circuit of the box (Thiele and Small's lumped elements: the voice coil, the cone's mass, compliance and losses, the motor as a gyrator, the box, ports and passive radiators, the filters and passive parts) as a standard SPICE netlist, and a circuit solver works it out. That program doesn't use the app's code (a test checks it only borrows the app's type names), so a mistake in the app's maths, or a shortcut that isn't exact, shows up as a difference.</p>
<p>${rep.compared} cases are compared: ${kinds}. Most were drawn at random, but stratified, across the database's drivers, box sizes and tunings, losses, amplifier resistance, hot voice coils, air conditions, several drivers in series or parallel and isobaric pairs. Each circuit is solved by <a href="https://ngspice.sourceforge.io/">ngspice</a> on every change to the engine, and by a small solver written for the tests (mna.py) in every test run; the two agree to one part in a million or better. The app matches the circuit to rounding: the largest SPL difference over ${spl.points.toLocaleString("en-GB")} points is ${sci(spl.worst)}&nbsp;dB.</p>
<p>Differences are listed by where they fall: below half the box's resonance, within a factor of two of it, and above twice it, each the worst with the mean under it. Relative differences are in per cent, like their tolerances (10<sup>−6</sup>&nbsp;% is a millionth of a per cent). The tolerances are the ones the tests hold the app to; SPL and phase are only compared within 60 and 40&nbsp;dB of the case's peak.</p>
<div class="table"><table><thead><tr><th>Output</th><th>Cases</th><th>Below resonance</th><th>Around resonance</th><th>Above resonance</th><th>Tolerance</th><th>OK</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="key"><span class="k-ref">Circuit (SPICE netlist)</span><span>Speaker Box Genius</span></p>
<div class="charts">${charts}</div>
<p>Every case's netlist is in <a href="${REPO}/tree/main/packages/engine/test/fixtures/spice/cases">fixtures/spice/cases</a>, with its inputs next to it; they're plain SPICE (SI units, the acoustic side in pascals and m³/s) and run in ngspice as they are. Any box in the app downloads as the same circuit for LTspice: Save &amp; Export → LTspice netlist. Not covered: the cone's air load as a piston (no exact circuit exists for it), a port's own pipe resonances and compression, and lines and horns, which the Hornresp comparisons above cover. How the circuits are built is in <a href="${REPO}/blob/main/docs/validation.md#independent-circuit-check-spice">docs/validation.md</a>.</p>`;
  return { html, failing };
}

const ok = (pass: boolean) => (pass ? '<span class="ok">✓</span>' : '<span class="bad">✗ outside</span>');

function winisdCase(k: WinIsdCaseReport, q: Q, link?: { href: string; note?: string }): string {
  const rows = k.checks
    .map((c) => {
      const u = q[c.what];
      const sub = [c.f ? `<span class="n">at ${num(c.f, 2)} Hz</span>` : "", c.note ? esc(c.note) : ""].filter(Boolean).join(", ");
      const what = `${esc(u.label)}${c.limit ? ` (${c.limit === "xmax" ? "Xmax" : c.limit} limit)` : ""}${c.graph ? ' <span class="tag">graph</span>' : ""}${sub ? `<br><small>${sub}</small>` : ""}`;
      const unit = u.unit ? ` ${u.unit}` : "";
      const v = (x: number) => `<span class="n">${num(x)}${unit}</span>`;
      return `<tr${c.pass ? "" : ' class="fail"'}><td>${what}</td><td>${v(c.winisd)}</td><td>${c.ours === null ? "—" : v(c.ours)}</td><td><span class="n">${diffText(c, u)}</span><br><small class="n">${tolText(c, u)}</small></td></tr>`;
    })
    .join("");
  const charts = k.curves.map((cv: Curve) => {
    const u = q[cv.what];
    return `<figure>${chart({
      label: u.label,
      unit: u.unit,
      aria: `${u.label}: our curve with WinISD's read-outs as dots`,
      series: [
        { points: cv.ours.filter((p): p is [number, number] => p[1] !== null), style: "line" },
        { points: cv.points, style: "dots" },
      ],
    })}<figcaption>${esc(u.label)}</figcaption></figure>`;
  });
  return `<section class="case" id="winisd-${k.id}">
<h3>${esc(k.title)} ${ok(k.pass)}</h3>
<p class="setup">${esc(k.setup)} · <a href="${REPO}/blob/main/packages/engine/test/fixtures/${k.fixture}">${esc(k.fixture)}</a>${openLink(link)}</p>
<div class="table"><table class="cmp"><thead><tr><th>Quantity</th><th>WinISD</th><th>Ours</th><th>Difference<br><small>tolerance</small></th></tr></thead><tbody>${rows}</tbody></table></div>
${charts.length ? `${KEY_WINISD}<div class="charts">${charts.join("")}</div>` : ""}
${k.notes ? `<div class="known"><h4>Known differences</h4>${notes(k.notes)}</div>` : ""}
</section>`;
}

// ---------------------------------------------------------------------------
// Hornresp
// ---------------------------------------------------------------------------

/** Rows and charts for Hornresp's impulse response (and the step response from it), where exported. */
function impulseParts(ir: ImpulseReport | undefined, tol: Report["hornresp"]["impulseTol"]) {
  if (!ir) return { rows: "", figs: "" };
  const row = (what: string, val: string, lim: string, pass: boolean) => `<tr${pass ? "" : ' class="fail"'}><td>${what}</td><td class="n">${val}</td><td>${lim}</td></tr>`;
  const s = ir.stats;
  const rows = [
    row("Impulse response, RMS difference (−5 to 200 ms, peak = 1)", s.impulseRms.toFixed(4), `under ${tol.impulseRms}`, s.impulseRms < tol.impulseRms),
    row("Impulse response, largest difference", s.impulseMax.toFixed(3), `under ${tol.impulseMax}`, s.impulseMax < tol.impulseMax),
    row("Step response, RMS difference", s.stepRms.toFixed(4), `under ${tol.stepRms}`, s.stepRms < tol.stepRms),
  ].join("");
  const fig = (label: string, pts: [number, number, number][]) => {
    const early = pts.filter((p) => p[0] <= 40);
    return `<figure>${chart({
      label,
      unit: "",
      xScale: "linear",
      aria: `${label}, −5 to 40 ms: Hornresp as a wide grey line, Speaker Box Genius as a thin orange line on top`,
      series: [
        { points: early.map((p) => [p[0], p[1]]), style: "ref" },
        { points: early.map((p) => [p[0], p[2]]), style: "line" },
      ],
    })}<figcaption>${label} (ms)</figcaption></figure>`;
  };
  return { rows, figs: fig("Impulse response", ir.impulse) + fig("Step response", ir.step) };
}

/** Rows and a chart for Hornresp's Maximum SPL, where it was exported. */
function maxSplParts(ms: MaxSplReport[] | undefined, tol: Report["hornresp"]["maxSplTol"]) {
  if (!ms) return { rows: "", figs: "" };
  const row = (what: string, val: string, lim: string, pass: boolean) => `<tr${pass ? "" : ' class="fail"'}><td>${what}</td><td class="n">${val}</td><td>${lim}</td></tr>`;
  const rows = ms
    .map((m) => {
      const at = m.ampVolts ? ` (amplifier at ${m.ampVolts} V)` : "";
      const s = m.stats;
      return [
        row(`Maximum SPL${at}, mean difference`, `${s.splMean.toFixed(3)} dB`, `under ${tol.splMean} dB`, s.splMean < tol.splMean),
        row(`Maximum SPL${at}, 95th percentile`, `${s.splP95.toFixed(3)} dB`, `under ${tol.splP95} dB`, s.splP95 < tol.splP95),
        row(`Voltage at maximum${at}, mean difference`, `${s.einMean.toFixed(2)} %`, `under ${tol.einMean} %`, s.einMean < tol.einMean),
        row(`Input power at maximum${at}, mean difference`, `${s.pinMean.toFixed(2)} %`, `under ${tol.pinMean} %`, s.pinMean < tol.pinMean),
      ].join("");
    })
    .join("");
  const figs = ms
    .map((m) => {
      const label = `Maximum SPL${m.ampVolts ? `, amplifier at ${m.ampVolts} V` : ""}`;
      return `<figure>${chart({
        label,
        unit: "dB",
        aria: `${label}: Hornresp as a wide grey line, Speaker Box Genius as a thin orange line on top`,
        series: [
          { points: m.spl.map((p) => [p[0], p[1]]), style: "ref" },
          { points: m.spl.map((p) => [p[0], p[2]]), style: "line" },
        ],
      })}<figcaption>${label}</figcaption></figure>`;
    })
    .join("");
  return { rows, figs };
}

function hornrespCase(k: HornrespCaseReport, tol: Report["hornresp"]["tol"], mtol: Report["hornresp"]["maxSplTol"], itol: Report["hornresp"]["impulseTol"], link?: { href: string; note?: string }): string {
  const ms = maxSplParts(k.maxSpl, mtol);
  const ir = impulseParts(k.impulse, itol);
  const s = k.stats;
  const row = (what: string, val: string, lim: string, pass: boolean) => `<tr${pass ? "" : ' class="fail"'}><td>${what}</td><td class="n">${val}</td><td>${lim}</td></tr>`;
  const rows = [
    row("SPL, mean difference", `${s.splMean.toFixed(3)} dB`, `under ${tol.splMean} dB`, s.splMean < tol.splMean),
    row("SPL, 95th percentile", `${s.splP95.toFixed(3)} dB`, `under ${tol.splP95} dB`, s.splP95 < tol.splP95),
    row("SPL, worst point", `${s.splWorst.toFixed(2)} dB`, "not held (deep nulls)", true),
    row("Impedance, mean difference", `${s.zeMean.toFixed(2)} %`, `under ${tol.zeMean} %`, s.zeMean < tol.zeMean),
    row("Impedance, worst point", `${s.zeWorst.toFixed(2)} %`, `under ${tol.zeWorst} %`, s.zeWorst < tol.zeWorst),
    row("Impedance phase, mean difference", `${s.zePhaseMean.toFixed(2)}°`, `under ${tol.zePhaseMean}°`, s.zePhaseMean < tol.zePhaseMean),
    row("Cone excursion, mean difference", `${s.xdMean.toFixed(2)} %`, `under ${tol.xdMean} %`, s.xdMean < tol.xdMean),
    row("Cone excursion, 95th percentile", `${s.xdP95.toFixed(2)} %`, `under ${tol.xdP95} %`, s.xdP95 < tol.xdP95),
    row("SPL phase, median difference", `${s.phaseMedian.toFixed(2)}°`, `under ${tol.phaseMedian}°`, s.phaseMedian < tol.phaseMedian),
    row("Amplifier current, mean difference", `${s.iinMean.toFixed(2)} %`, `under ${tol.zeMean} %`, s.iinMean < tol.zeMean),
    row("Efficiency, mean difference", `${s.effMean.toFixed(2)} %`, `under ${tol.effMean} %`, s.effMean < tol.effMean),
    row("Group delay, 95th percentile", `${s.gdP95.toFixed(2)} ms`, `under ${tol.gdP95} ms (away from deep nulls)`, s.gdP95 < tol.gdP95),
    ...(s.mouthMean !== undefined ? [row("Mouth or port output alone, mean difference", `${s.mouthMean.toFixed(3)} dB`, `under ${tol.splMean} dB`, s.mouthMean < tol.splMean)] : []),
    ...(s.zaMean !== undefined ? [row("Line load (Za), mean difference", `${s.zaMean.toFixed(3)} dB`, `under ${tol.zaMean} dB`, s.zaMean < tol.zaMean)] : []),
  ].join("") + ms.rows + ir.rows;
  const fig = (label: string, unit: string, pts: [number, number, number][]) =>
    `<figure>${chart({
      label,
      unit,
      aria: `${label}: Hornresp as a wide grey line, Speaker Box Genius as a thin orange line on top`,
      series: [
        { points: pts.map((p) => [p[0], p[1]]), style: "ref" },
        { points: pts.map((p) => [p[0], p[2]]), style: "line" },
      ],
    })}<figcaption>${label}</figcaption></figure>`;
  return `<section class="case" id="hornresp-${k.id}">
<h3>${esc(k.title)} ${ok(k.pass)}</h3>
<p class="setup">${esc(k.setup)} · <a href="${REPO}/tree/main/packages/engine/test/fixtures/hornresp/${k.id}">${esc(k.id)}</a>${openLink(link)}</p>
<div class="table"><table class="cmp"><thead><tr><th>Measure (10 Hz–1 kHz)</th><th>Result</th><th>Tolerance</th></tr></thead><tbody>${rows}</tbody></table></div>
${KEY_HORNRESP}<div class="charts">${fig("SPL at 1 m", "dB", k.spl)}${fig("Impedance", "Ω", k.ze)}${fig("Cone excursion", "mm", k.xd)}${ms.figs}${ir.figs}</div>
</section>`;
}

function hornrespBoxCase(k: HornrespBoxCaseReport, mtol: Report["hornresp"]["maxSplTol"], itol: Report["hornresp"]["impulseTol"], link?: { href: string; note?: string }): string {
  const ms = maxSplParts(k.maxSpl, mtol);
  const ir = impulseParts(k.impulse, itol);
  const s = k.stats;
  const t = k.tol;
  const row = (what: string, val: string, lim: string, pass: boolean) => `<tr${pass ? "" : ' class="fail"'}><td>${what}</td><td class="n">${val}</td><td>${lim}</td></tr>`;
  const db = (what: string, m?: number, p?: number) =>
    m === undefined
      ? []
      : [
          row(`${what}, mean difference`, `${m.toFixed(3)} dB`, `under ${t.splMean} dB`, m < t.splMean),
          row(`${what}, 95th percentile`, `${p!.toFixed(3)} dB`, `under ${t.splP95} dB`, p! < t.splP95),
        ];
  const rows = [
    ...db("SPL", s.splMean, s.splP95),
    ...db("Cone's output alone", s.coneMean, s.coneP95),
    ...db("Port's or radiator's output alone", s.ventMean, s.ventP95),
    ...db("SPL change from the coil model (to 20 kHz)", s.coilMean, s.coilP95),
    row("Impedance, mean difference", `${s.zeMean.toFixed(2)} %`, `under ${t.zeMean} %`, s.zeMean < t.zeMean),
    row("Impedance, 95th percentile", `${s.zeP95.toFixed(2)} %`, `under ${t.zeP95} %`, s.zeP95 < t.zeP95),
    row("Impedance, worst point", `${s.zeWorst.toFixed(2)} %`, "for reference", true),
    row("Impedance phase, mean difference", `${s.zePhaseMean.toFixed(2)}°`, `under ${t.zePhaseMean}°`, s.zePhaseMean < t.zePhaseMean),
    row("Cone excursion, mean difference", `${s.xdMean.toFixed(2)} %`, `under ${t.xdMean} %`, s.xdMean < t.xdMean),
    row("Cone excursion, 95th percentile", `${s.xdP95.toFixed(2)} %`, `under ${t.xdP95} %`, s.xdP95 < t.xdP95),
    ...(s.gdP95 !== undefined ? [row("Group delay, 95th percentile (away from nulls)", `${s.gdP95.toFixed(2)} ms`, `under ${t.gdP95} ms`, s.gdP95 < t.gdP95)] : []),
    ...(s.einMax !== undefined ? [row("Voltage after the EQ, worst difference (10 Hz–20 kHz)", `${s.einMax.toFixed(4)} %`, "under 0.01 %", s.einMax < 0.01)] : []),
  ].join("") + ms.rows + ir.rows;
  const fig = (label: string, unit: string, pts?: [number, number, number][]) =>
    pts && pts.length
      ? `<figure>${chart({
          label,
          unit,
          aria: `${label}: Hornresp as a wide grey line, Speaker Box Genius as a thin orange line on top`,
          series: [
            { points: pts.map((p) => [p[0], p[1]]), style: "ref" },
            { points: pts.map((p) => [p[0], p[2]]), style: "line" },
          ],
        })}<figcaption>${label}</figcaption></figure>`
      : "";
  return `<section class="case" id="hornresp-${k.id}">
<h3>${esc(k.title)} ${ok(k.pass)}</h3>
<p class="setup">${esc(k.setup)}${k.options ? ` · ${esc(k.options)}` : ""} · <a href="${REPO}/tree/main/packages/engine/test/fixtures/hornresp-boxes/${k.id}">${esc(k.id)}</a>${openLink(link)}</p>
<div class="table"><table class="cmp"><thead><tr><th>Measure (10–${k.fMax ?? 300} Hz${k.zeFMax ? `; impedance to ${k.zeFMax / 1000} kHz` : ""})</th><th>Result</th><th>Tolerance</th></tr></thead><tbody>${rows}</tbody></table></div>
${KEY_HORNRESP}<div class="charts">${fig("SPL at 1 m", "dB", k.spl)}${fig("Cone's output alone", "dB", k.cone)}${fig("Port's or radiator's output alone", "dB", k.vent)}${fig("Impedance", "Ω", k.ze)}${fig("Cone excursion", "mm", k.xd)}${ms.figs}${ir.figs}</div>
</section>`;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export interface BuildInfo {
  commit?: string;
  date: Date;
  /** "Open in app" links by case anchor ("winisd-ported", "hornresp-05-mltl"); see validationLinks.ts. */
  links?: Record<string, { href: string; note?: string }>;
}

/** The case's "Open in app" link, if it has one. */
const openLink = (l: { href: string; note?: string } | undefined) =>
  l ? ` · <a class="open" href="${l.href}">Open in app →</a>${l.note ? ` <small>(${esc(l.note)})</small>` : ""}` : "";

/** Opens the group holding the case a link points to (on load and on every # change), then scrolls to it. */
const GROUP_SCRIPT = `(function(){function show(){var id=decodeURIComponent(location.hash.slice(1));if(!id)return;var el=document.getElementById(id);if(!el)return;for(var d=el;d;d=d.parentElement)if(d.tagName==="DETAILS")d.open=true;el.scrollIntoView();}addEventListener("hashchange",show);document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest('a[href^="#"]');if(a)setTimeout(show,0);});show();})();`;

/** What the curves are, under each case (so a link straight to one case explains them). */
const KEY_WINISD = '<p class="key"><span>Speaker Box Genius</span><span class="k-pt">WinISD read-outs</span></p>';
const KEY_HORNRESP = '<p class="key"><span class="k-ref">Hornresp</span><span>Speaker Box Genius</span></p>';

export const VALIDATION_STYLE = `
details.group{margin:1rem 0;border:1px solid var(--border);border-radius:.7rem;background:var(--card)}
details.group>summary{cursor:pointer;padding:.8rem 1rem;font-weight:700;font-size:1.05rem;list-style-position:inside}
details.group>summary .muted{color:var(--muted);font-weight:400;font-size:.95rem}
details.group[open]>summary{border-bottom:1px solid var(--border)}
details.group>.case,details.group>.known{margin-left:1rem;margin-right:1rem}
.to-summary{position:fixed;right:1rem;bottom:1rem;z-index:5;padding:.5rem .9rem;border:1px solid var(--border);border-radius:999px;background:var(--card);color:var(--fg);text-decoration:none;font-size:.9rem;box-shadow:0 4px 14px rgb(0 0 0 / .35)}

.status{padding:.7rem 1rem;border:1px solid var(--border);border-radius:.7rem;background:var(--card);color:var(--muted);font-size:.95rem}
.status strong{color:var(--fg)}
.ok{color:#4ade80;font-weight:700}
.bad{color:#f87171;font-weight:700}
tr.fail td{color:#fca5a5}
.tag{padding:0 .3rem;border:1px solid var(--border);border-radius:.3rem;color:var(--muted);font-size:.75rem}
td small,th small{color:var(--muted);font-weight:400}
.n{white-space:nowrap}
@media (max-width:600px){.cmp{font-size:.84rem}.cmp th,.cmp td{padding:.4rem .3rem}}
.case{margin:2rem 0 2.5rem;scroll-margin-top:1rem}
.case h3{margin-bottom:.2rem}
.setup{margin:.2rem 0 .6rem;color:var(--muted);font-size:.95rem}
.setup a.open{font-weight:700;white-space:nowrap}
.known{margin-top:1rem;padding:.2rem 1rem;border-left:3px solid var(--draw);border-radius:.4rem;background:var(--card)}
.known h4{margin:.7rem 0 0;font-size:.95rem}
.known p,.known li{font-size:.95rem}
h4{font-size:1rem}
`;

/** One row per output for the Summary: the worst difference over every region. */
function spiceSummaryRows(rep: SpiceReport): string {
  return rep.outputs
    .map((o) => {
      return `<tr><td><a href="#spice">${esc(spiceName(o.output))}</a></td><td>${o.comparisons}</td><td>${spiceValue(o.output, o.worst)}</td><td>${OUTPUT_UNITS[o.output]!.tol}</td><td>${ok(o.pass)}</td></tr>`;
    })
    .join("");
}

/** Where the site build puts the showcase netlists. */
export const spiceNetlistHref = (id: string) => `/validation/spice/${id}.cir`;

export function validationContent(rep: Report, info: BuildInfo, spiceRep: SpiceReport = readSpiceReport()): string {
  const q = rep.quantities;
  const w = rep.winisd.cases;
  const h = rep.hornresp.cases;
  const b = rep.hornresp.boxes.cases;
  // Stuffed lines come from the box set (they're compared the same way) but get their own group.
  const stuffed = b.filter((k) => /^s\d/.test(k.id));
  const boxes = b.filter((k) => !stuffed.includes(k));
  const checks = w.reduce((n, c) => n + c.checks.length, 0);
  const sp = spiceSection(spiceRep, spiceNetlistHref);
  const failing = w.filter((c) => !c.pass).length + h.filter((c) => !c.pass).length + b.filter((c) => !c.pass).length + rep.winisdRun.cases.filter((c) => !c.pass).length + sp.failing;
  const date = info.date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const al = alignmentSection(readAlignmentChecks());
  const par = paritySection();
  const commit = info.commit ? ` from commit <a href="${REPO}/commit/${info.commit}"><code>${info.commit.slice(0, 7)}</code></a>` : "";

  const winisdSummary = w
    .map((k) => `<tr><td><a href="#winisd-${k.id}">${esc(k.title)}</a></td><td>${k.checks.length}</td><td>${largest(k, q)}</td><td>${ok(k.pass)}</td></tr>`)
    .join("");
  const hornrespSummary = h
    .map(
      (k) =>
        `<tr><td><a href="#hornresp-${k.id}">${esc(k.title)}</a></td><td>${k.stats.splMean.toFixed(2)} / ${k.stats.splP95.toFixed(2)} dB</td><td>${k.stats.zeMean.toFixed(2)} / ${k.stats.zeWorst.toFixed(2)} %</td><td>${k.stats.xdMean.toFixed(2)} %</td><td>${ok(k.pass)}</td></tr>`,
    )
    .join("");
  const boxSummary = b
    .map((k) => {
      const spl = k.stats.splMean !== undefined ? k.stats.splMean : (k.stats.coneMean ?? k.stats.ventMean)!;
      const p95 = k.stats.splP95 !== undefined ? k.stats.splP95 : Math.max(k.stats.coneP95 ?? 0, k.stats.ventP95 ?? 0);
      return `<tr><td><a href="#hornresp-${k.id}">${esc(k.title)}</a></td><td>${spl.toFixed(2)} / ${p95.toFixed(2)} dB</td><td>${k.stats.zeMean.toFixed(2)} / ${k.stats.zeWorst.toFixed(2)} %</td><td>${k.stats.xdMean.toFixed(2)} %</td><td>${ok(k.pass)}</td></tr>`;
    })
    .join("");

  /** A group of cases, closed until asked for: the page carries 200 charts. A link to a case opens it (GROUP_SCRIPT). */
  const group = (id: string, label: string, cases: { pass: boolean }[], body: string) => {
    const bad = cases.filter((c) => !c.pass).length;
    return `<details class="group" id="${id}"><summary>${esc(label)} <span class="muted">· ${bad ? `${bad} outside tolerance` : "all within tolerance"}</span></summary>\n${body}\n</details>`;
  };
  return `<h1>Validation</h1>
<p class="lede">Speaker Box Genius is checked against WinISD and Hornresp, the two free simulators most DIY builders know, and against an equivalent circuit of each box built independently and solved by a circuit simulator. Every comparison on this page is an automated test that runs on every change to the code, and the page is rebuilt from those results.</p>
<p class="status"><strong>${w.length} WinISD cases (${checks} values), the full WinISD run (${rep.winisdRun.compared} values), ${h.length + b.length} Hornresp cases and ${spiceRep.compared} circuit cases, ${failing ? `${failing} outside tolerance` : "all within tolerance"}.</strong><!--volatile--> Built${commit} on ${date}.<!--/volatile--></p>

<h2 id="summary">Summary</h2>
<h3>WinISD ${esc(rep.winisd.version.replace(/^WinISD /, ""))}</h3>
<div class="table"><table><thead><tr><th>Case</th><th>Values</th><th>Largest difference</th><th>OK</th></tr></thead><tbody>${winisdSummary}</tbody></table></div>
<h3>Hornresp ${esc(rep.hornresp.version.replace(/^Hornresp /, ""))}</h3>
<div class="table"><table><thead><tr><th>Line or horn</th><th>SPL, mean / 95 %</th><th>Impedance, mean / worst</th><th>Excursion, mean</th><th>OK</th></tr></thead><tbody>${hornrespSummary}</tbody></table></div>
<div class="table"><table><thead><tr><th>Box</th><th>SPL, mean / 95 %</th><th>Impedance, mean / worst</th><th>Excursion, mean</th><th>OK</th></tr></thead><tbody>${boxSummary}</tbody></table></div>
<h3>Equivalent circuit (SPICE)</h3>
<p>${spiceRep.compared} cases against an independently built circuit: the largest difference per output, wherever it falls. <a href="#spice">Details and the netlists</a>.</p>
<div class="table"><table><thead><tr><th>Output</th><th>Cases</th><th>Largest difference</th><th>Tolerance</th><th>OK</th></tr></thead><tbody>${spiceSummaryRows(spiceRep)}</tbody></table></div>

<h2 id="known-differences">Known differences</h2>
<ul>
<li><strong>Max SPL and the port.</strong> WinISD's maximum SPL is limited only by the driver's power rating and Xmax; the app's is also limited by port air speed (the chuffing line in Settings), on purpose. Where the port sets the limit, the two differ.</li>
<li><strong>6th-order bandpass, series.</strong> WinISD's only 6th-order bandpass has both chambers ported to the room. The app's series kind (rear chamber ported into the front) has no WinISD equivalent and isn't written to WinISD projects.</li>
<li><strong>Level on the DSA215-8 projects.</strong> On the hand-made projects below the level sits a uniform ~0.04 dB above WinISD (cone excursion and port speed 0.5 %): their driver record isn't self-consistent (its Bl, Mms and Cms give Fs 35.18 Hz, not 35). On the full run, whose projects carry a consistent record, the level matches to 0.01 dB.</li>
<li><strong>Conventions, not differences.</strong> WinISD applies the amplifier resistance to each driver (each coil of an isobaric pair) and plots one driver's impedance; the app shares it between the drivers and shows what the amplifier sees. The comparisons use WinISD's conventions, and importing a WinISD project converts automatically. WinISD's watts go into the voice coil and the amp + cable resistance together; the app does the same with Settings → Watts “Into coil + cable”, which the WinISD preset and opening a WinISD project set (the default counts watts from the amplifier, a few hundredths of a dB apart at 0.1 Ω).</li>
<li><strong>Deep nulls in lines and horns.</strong> Against Hornresp, nulls fall at the same frequency but differ in depth, so SPL is held to its mean and 95th percentile.</li>
</ul>

<h2 id="winisd">WinISD</h2>
<p>Each case is a real WinISD project (linked) with values read from WinISD's cursor read-out, next to ours (Speaker Box Genius); values marked <span class="tag">graph</span> were read off its graphs, so they're held to reading accuracy. Relative quantities (excursion, air speed, impedance, group delay, power) are compared in percent. ${esc(rep.winisd.driver)}.</p>
${group("winisd-cases", `${w.length} WinISD cases`, w, w.map((k) => winisdCase(k, q, info.links?.[`winisd-${k.id}`])).join("\n"))}

<h3 id="winisd-run">The full WinISD run (9 November 2026)</h3>
${runSection(rep.winisdRun, group)}

<h3 id="winisd-alignments">Ported presets (alignments)</h3>
<p>The ported and passive radiator presets (QB3, BB4/SBB4, C4/SC4) give the boxes WinISD's new-project wizard gives. WinISD doesn't use the textbook equations: each alignment is one curve of box size and tuning against the driver's Qts, and that Qts includes WinISD's 0.1&nbsp;Ω amplifier resistance in series with the voice coil. The app carries those curves, measured from WinISD for 32 drivers from Qts 0.14 to 0.76. Below, ${al.values} values for 19 other drivers (database drivers and test drivers, Re 3–6.5&nbsp;Ω) are compared with WinISD's own boxes: the largest difference is ${al.vbWorst.toFixed(2)}&nbsp;% in volume and ${al.fbWorst.toFixed(2)}&nbsp;% in tuning, the rounding of WinISD's two-decimal display. (Boxes under 2&nbsp;L differ by up to 0.01&nbsp;L, the same rounding.) WinISD's QB3 above Qts 0.62 and its C4 below 0.20 aren't offered: there WinISD's boxes stop making sense (the QB3 shrinks and tunes below Fs; the C4 shrinks to nothing). Settings &rarr; Box presets &rarr; Textbook gives the lossless textbook alignments instead.</p>
${al.html}

<h3 id="winisd-sealed-presets">Sealed presets, Qtc, the driver editor and passive radiators</h3>
<p>The sealed presets (Qtc 0.5, 0.577, 0.707) give the boxes WinISD's closed-box wizard gives. It doesn't use the textbook Vb = Vas / ((Qtc/Qts)² − 1) either: its Qts counts the 0.1&nbsp;Ω amplifier resistance (Qes × (Re + 0.1) / Re) and the box's absorption (1/Q + 1/100), so its boxes come out a few per cent bigger. A box's Qtc in the summary counts the same two. The T/S solver's Mms, Cms, Rms and Bl, and the reference efficiency, match WinISD's driver editor for four database drivers within its display rounding (with WinISD's air). Largest difference below: ${par.worst.toFixed(2)}&nbsp;% over ${par.values} values.</p>
${par.html}

<h2 id="hornresp">Hornresp</h2>
<p>Each case is a Hornresp record with Hornresp's own results (SPL, impedance and its phase, cone excursion, group delay and the line's acoustic impedance), compared at every exported frequency from 10 Hz to ${rep.hornresp.fMax >= 1000 ? `${rep.hornresp.fMax / 1000} kHz` : `${rep.hornresp.fMax} Hz`}. ${esc(rep.hornresp.driver)}. The records are in <a href="${REPO}/tree/main/docs/hornresp-validation/records">docs/hornresp-validation</a>; open them in Hornresp to repeat any case.</p>
${group("hornresp-lines", `Lines and horns: ${h.length} cases`, h, h.map((k) => hornrespCase(k, rep.hornresp.tol, rep.hornresp.maxSplTol, rep.hornresp.impulseTol, info.links?.[`hornresp-${k.id}`])).join("\n") + `<div class="known"><h4>Notes</h4>${notes(rep.hornresp.notes)}</div>`)}
<p>Sealed, ported, passive-radiator and bandpass boxes and two drivers, compared from 10 to ${rep.hornresp.boxes.fMax} Hz, and stuffed lines from Hornresp's Loudspeaker Wizard to 1 kHz (the boxes are modelled without standing waves inside, as Hornresp's lumped chambers are). Where Hornresp's outputs were exported one by one, the cone's and the port's (or radiator's) are compared each on its own.</p>
${group("hornresp-boxes", `Boxes, filters and EQ: ${boxes.length} cases`, boxes, boxes.map((k) => hornrespBoxCase(k, rep.hornresp.maxSplTol, rep.hornresp.impulseTol, info.links?.[`hornresp-${k.id}`])).join("\n") + `<div class="known"><h4>Notes</h4>${notes(rep.hornresp.boxes.notes)}</div>`)}
${group("hornresp-stuffed", `Stuffed lines: ${stuffed.length} cases`, stuffed, stuffed.map((k) => hornrespBoxCase(k, rep.hornresp.maxSplTol, rep.hornresp.impulseTol, info.links?.[`hornresp-${k.id}`])).join("\n"))}

<h2 id="spice">Independent circuit check (SPICE)</h2>
${sp.html}

<h2 id="not-compared">Not compared</h2>
<p>Some features have no equivalent in WinISD or Hornresp and are checked by their own tests instead: the L2R2 voice-coil model (fitted against Dayton Audio's published impedance measurements), a port's own pipe resonances, and a hot voice coil. They're described in <a href="${REPO}/blob/main/docs/validation.md#not-compared-with-winisd-or-hornresp">docs/validation.md</a>. With those settings at their defaults, the app gives the results above.</p>

<h2 id="reproduce">Check it yourself</h2>
<p>Every number here comes from <a href="${REPO}/blob/main/docs/validation/results.json">docs/validation/results.json</a>, and the circuit check's from <a href="${REPO}/blob/main/docs/validation/spice.json">docs/validation/spice.json</a>, both written by the same code the tests run. To repeat the comparisons, clone the repository and run:</p>
<pre><code>pnpm test                # every comparison, with the other engine tests
pnpm validation:report   # rewrites results.json
pnpm spice:report        # rewrites spice.json (the circuit check, with Python 3)
pnpm spice:ngspice       # every netlist in ngspice too, if it's installed</code></pre>
<p>To compare your own design, open the same WinISD project or Hornresp record in the app: <a href="/winisd-alternative/">importing WinISD projects</a>, <a href="/hornresp-alternative/">Hornresp records</a>. Found a case that doesn't match? <a href="${REPO}/issues">Open an issue</a> with the project file.</p>
<a class="to-summary" href="#summary">↑ Summary</a>
<script>${GROUP_SCRIPT}</script>`;
}
