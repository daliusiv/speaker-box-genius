/**
 * The /validation/ page: every WinISD and Hornresp comparison, from the report the engine
 * writes (docs/validation/results.json, `pnpm validation:report`). Nothing here is typed by
 * hand: adding a case to packages/engine/validation adds it to the page.
 */
import { readFileSync } from "node:fs";
import type { Report, WinIsdCaseReport, HornrespCaseReport, Curve } from "../packages/engine/validation/report.ts";
import { REPORT_FILE } from "../packages/engine/validation/report.ts";
import { chart } from "./chart.ts";

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

const ok = (pass: boolean) => (pass ? '<span class="ok">✓</span>' : '<span class="bad">✗ outside</span>');

function winisdCase(k: WinIsdCaseReport, q: Q): string {
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
<p class="setup">${esc(k.setup)} · <a href="${REPO}/blob/main/packages/engine/test/fixtures/${k.fixture}">${esc(k.fixture)}</a></p>
<div class="table"><table class="cmp"><thead><tr><th>Quantity</th><th>WinISD</th><th>Ours</th><th>Difference<br><small>tolerance</small></th></tr></thead><tbody>${rows}</tbody></table></div>
${charts.length ? `<div class="charts">${charts.join("")}</div>` : ""}
${k.notes ? `<div class="known"><h4>Known differences</h4>${notes(k.notes)}</div>` : ""}
</section>`;
}

// ---------------------------------------------------------------------------
// Hornresp
// ---------------------------------------------------------------------------

function hornrespCase(k: HornrespCaseReport, tol: Report["hornresp"]["tol"]): string {
  const s = k.stats;
  const row = (what: string, val: string, lim: string, pass: boolean) => `<tr${pass ? "" : ' class="fail"'}><td>${what}</td><td class="n">${val}</td><td>${lim}</td></tr>`;
  const rows = [
    row("SPL, mean difference", `${s.splMean.toFixed(3)} dB`, `under ${tol.splMean} dB`, s.splMean < tol.splMean),
    row("SPL, 95th percentile", `${s.splP95.toFixed(3)} dB`, `under ${tol.splP95} dB`, s.splP95 < tol.splP95),
    row("SPL, worst point", `${s.splWorst.toFixed(2)} dB`, "not held (deep nulls)", true),
    row("Impedance, mean difference", `${s.zeMean.toFixed(2)} %`, `under ${tol.zeMean} %`, s.zeMean < tol.zeMean),
    row("Impedance, worst point", `${s.zeWorst.toFixed(2)} %`, `under ${tol.zeWorst} %`, s.zeWorst < tol.zeWorst),
    ...(s.zaMean !== undefined ? [row("Line load (Za), mean difference", `${s.zaMean.toFixed(3)} dB`, `under ${tol.zaMean} dB`, s.zaMean < tol.zaMean)] : []),
  ].join("");
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
<p class="setup">${esc(k.setup)} · <a href="${REPO}/tree/main/packages/engine/test/fixtures/hornresp/${k.id}">${esc(k.id)}</a></p>
<div class="table"><table class="cmp"><thead><tr><th>Measure (10 Hz–1 kHz)</th><th>Result</th><th>Tolerance</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="charts">${fig("SPL at 1 m", "dB", k.spl)}${fig("Impedance", "Ω", k.ze)}</div>
</section>`;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export interface BuildInfo {
  commit?: string;
  date: Date;
}

export const VALIDATION_STYLE = `
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
.known{margin-top:1rem;padding:.2rem 1rem;border-left:3px solid var(--accent);border-radius:.4rem;background:var(--card)}
.known h4{margin:.7rem 0 0;font-size:.95rem}
.known p,.known li{font-size:.95rem}
h4{font-size:1rem}
`;

export function validationContent(rep: Report, info: BuildInfo): string {
  const q = rep.quantities;
  const w = rep.winisd.cases;
  const h = rep.hornresp.cases;
  const checks = w.reduce((n, c) => n + c.checks.length, 0);
  const failing = w.filter((c) => !c.pass).length + h.filter((c) => !c.pass).length;
  const date = info.date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const commit = info.commit ? ` from commit <a href="${REPO}/commit/${info.commit}"><code>${info.commit.slice(0, 7)}</code></a>` : "";

  const winisdSummary = w
    .map((k) => `<tr><td><a href="#winisd-${k.id}">${esc(k.title)}</a></td><td>${k.checks.length}</td><td>${largest(k, q)}</td><td>${ok(k.pass)}</td></tr>`)
    .join("");
  const hornrespSummary = h
    .map(
      (k) =>
        `<tr><td><a href="#hornresp-${k.id}">${esc(k.title)}</a></td><td>${k.stats.splMean.toFixed(2)} / ${k.stats.splP95.toFixed(2)} dB</td><td>${k.stats.zeMean.toFixed(2)} / ${k.stats.zeWorst.toFixed(2)} %</td><td>${ok(k.pass)}</td></tr>`,
    )
    .join("");

  return `<h1>Validation</h1>
<p class="lede">Speaker Box Genius is checked against WinISD and Hornresp, the two free simulators most DIY builders know. Every comparison on this page is an automated test that runs on every change to the code, and the page is rebuilt from those results.</p>
<p class="status"><strong>${w.length} WinISD cases (${checks} values) and ${h.length} Hornresp cases, ${failing ? `${failing} outside tolerance` : "all within tolerance"}.</strong> Built${commit} on ${date}.</p>

<h2 id="summary">Summary</h2>
<h3>WinISD ${esc(rep.winisd.version.replace(/^WinISD /, ""))}</h3>
<div class="table"><table><thead><tr><th>Case</th><th>Values</th><th>Largest difference</th><th>OK</th></tr></thead><tbody>${winisdSummary}</tbody></table></div>
<h3>Hornresp ${esc(rep.hornresp.version.replace(/^Hornresp /, ""))}</h3>
<div class="table"><table><thead><tr><th>Case</th><th>SPL, mean / 95 %</th><th>Impedance, mean / worst</th><th>OK</th></tr></thead><tbody>${hornrespSummary}</tbody></table></div>

<h2 id="known-differences">Known differences</h2>
<ul>
<li><strong>Passive radiator damping near the tuning.</strong> Tuning, radiator mass and stiffness match WinISD exactly, but near Fb WinISD shows less loss than the standard box-loss model (up to 0.5 dB at a high-Q peak). See <a href="#winisd-pr-18l">the PR cases</a>.</li>
<li><strong>Level and impedance peaks.</strong> Against WinISD the absolute level sits a uniform ~0.03 dB (0.35 %) lower and impedance peaks up to 0.8 % higher, far below anything measurable.</li>
<li><strong>Conventions, not differences.</strong> WinISD applies the amplifier resistance to each driver and plots one driver's impedance, and drives isobaric pairs at half its stated power. The comparisons use WinISD's conventions; the app keeps power physical. Importing a WinISD project converts automatically.</li>
<li><strong>Deep nulls in lines and horns.</strong> Against Hornresp, nulls fall at the same frequency but differ in depth, so SPL is held to its mean and 95th percentile.</li>
</ul>

<h2 id="winisd">WinISD</h2>
<p>Each case is a real WinISD project (linked) with values read from WinISD's cursor read-out, next to ours (Speaker Box Genius); values marked <span class="tag">graph</span> were read off its graphs, so they're held to reading accuracy. Relative quantities (excursion, air speed, impedance, group delay, power) are compared in percent. ${esc(rep.winisd.driver)}.</p>
<p class="key"><span>Speaker Box Genius</span><span class="k-pt">WinISD read-outs</span></p>
${w.map((k) => winisdCase(k, q)).join("\n")}

<h2 id="hornresp">Hornresp</h2>
<p>Each case is a Hornresp record with Hornresp's own SPL and impedance exports, compared at every exported frequency from 10 Hz to ${rep.hornresp.fMax >= 1000 ? `${rep.hornresp.fMax / 1000} kHz` : `${rep.hornresp.fMax} Hz`}. ${esc(rep.hornresp.driver)}. The records are in <a href="${REPO}/tree/main/docs/hornresp-validation/records">docs/hornresp-validation</a>; open them in Hornresp to repeat any case.</p>
<p class="key"><span class="k-ref">Hornresp</span><span>Speaker Box Genius</span></p>
${h.map((k) => hornrespCase(k, rep.hornresp.tol)).join("\n")}
<div class="known"><h4>Notes</h4>${notes(rep.hornresp.notes)}</div>

<h2 id="not-compared">Not compared</h2>
<p>Some features have no equivalent in WinISD or Hornresp and are checked by their own tests instead: the L2R2 voice-coil model (fitted against Dayton Audio's published impedance measurements), ports modelled as pipes, and a hot voice coil. They're described in <a href="${REPO}/blob/main/docs/validation.md#not-compared-with-winisd-or-hornresp">docs/validation.md</a>. With those settings at their defaults, the app gives the results above.</p>

<h2 id="reproduce">Check it yourself</h2>
<p>Every number here comes from <a href="${REPO}/blob/main/docs/validation/results.json">docs/validation/results.json</a>, written by the same code the tests run. To repeat the comparisons, clone the repository and run:</p>
<pre><code>pnpm test                # every comparison, with the other engine tests
pnpm validation:report   # rewrites results.json</code></pre>
<p>To compare your own design, open the same WinISD project or Hornresp record in the app: <a href="/winisd-alternative/">importing WinISD projects</a>, <a href="/hornresp-alternative/">Hornresp records</a>. Found a case that doesn't match? <a href="${REPO}/issues">Open an issue</a> with the project file.</p>`;
}
