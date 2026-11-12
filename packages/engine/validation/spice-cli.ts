/**
 * SPICE validation command line.
 *
 *   pnpm spice:netlists                 rewrite test/fixtures/spice/cases/*.cir from inputs/ (validation/spice/fixtures.ts)
 *   pnpm spice:case <id> [--ngspice] [--dump] [--frequency <Hz>]
 *       print the netlist and engine vs SPICE per output; --dump prints every node voltage and
 *       source current at the frequency nearest --frequency (default: the box's tuning or 50 Hz)
 *   pnpm spice:ngspice                  every case in ngspice vs mna.py vs the engine (CI job; needs ngspice)
 *   pnpm spice:summary                  worst engine-vs-circuit difference per output over every case (mna.py)
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simulate } from "../src/simulate.ts";
import { compare, formatStat, SOLVER_TOL } from "./spice/compare.ts";
import type { SpiceCase } from "./spice/elements.ts";
import { cirPath, loadCases } from "./spice/fixtures.ts";
import { buildNetlist } from "./spice/netlist.ts";
import { outputs, runMna, runNgspice, type C, type RawResult } from "./spice/run.ts";

const engineFor = (c: SpiceCase, freq: number[]) =>
  simulate(c.driver, c.box as Parameters<typeof simulate>[1], { ...c.opts, air: c.air, frequencies: freq });

/**
 * Both solvers run the same ".ac dec" grid (mna.py builds it as ngspice 45 does: steps rounded,
 * stretched to end on fMax). Put mna.py's frequencies on ngspice's points when every point is
 * within 1e-5 of its partner, so last-digit differences don't drop points.
 */
function alignFrequencies(ng: RawResult, mna: RawResult): boolean {
  if (ng.freq.length !== mna.freq.length) return false;
  if (!ng.freq.every((f, k) => Math.abs(f - mna.freq[k]!) <= 1e-5 * mna.freq[k]!)) return false;
  ng.freq = mna.freq.slice();
  return true;
}

/**
 * Largest relative difference between two raw results over the probes both have, on matching
 * frequencies. Each signal's difference is taken relative to its own value, but never to less
 * than 1e-8 of its largest value over the sweep: far down a roll-off (a small PR's flow at 2 kHz is
 * 1e-7 of its peak) both solvers are only exact to rounding of the peak-sized values around it.
 */
function solverDiff(a: RawResult, b: RawResult): { worst: number; where: string; matched: number; values: string } {
  let worst = 0;
  let where = "";
  let values = "";
  let matched = 0;
  const peak = (z: C[]) => Math.max(...z.map((x) => Math.hypot(x[0], x[1])));
  const signals: [string, C[], C[]][] = [];
  for (const n of Object.keys(a.v)) if (b.v[n]) signals.push([`V(${n})`, a.v[n]!, b.v[n]!]);
  for (const s of Object.keys(a.i)) if (b.i[s]) signals.push([`I(${s})`, a.i[s]!, b.i[s]!]);
  const floors = signals.map(([, , y]) => Math.max(SOLVER_TOL.abs / SOLVER_TOL.rel, 1e-8 * peak(y)));
  a.freq.forEach((f, ka) => {
    const kb = b.freq.findIndex((g) => Math.abs(g - f) <= 1e-9 * f);
    if (kb < 0) return;
    matched++;
    signals.forEach(([name, xs, ys], k) => {
      const x = xs[ka]!;
      const y = ys[kb]!;
      const rel = Math.hypot(x[0] - y[0], x[1] - y[1]) / Math.max(Math.hypot(y[0], y[1]), floors[k]!);
      if (rel > worst) {
        worst = rel;
        where = `${name} at ${f.toFixed(2)} Hz`;
        values = `first ${x[0]}, ${x[1]}; second ${y[0]}, ${y[1]}`;
      }
    });
  });
  return { worst, where, matched, values };
}

function caseReport(c: SpiceCase, ngspice: boolean, dump: boolean, at: number | null): boolean {
  const net = buildNetlist(c);
  console.log(net.text);
  const mna = runMna([cirPath(c.id)], dump)[cirPath(c.id)]!;
  console.log(`mna.py residual ${mna.residual?.toExponential(2)}`);
  let ok = true;
  if (ngspice) {
    const ng = runNgspice(cirPath(c.id), net.probes, { freqs: mna.freq });
    if (!alignFrequencies(ng, mna)) console.log(`FAIL ngspice's frequencies don't match mna.py's: ${ng.freq.slice(0, 4).join(", ")}…`);
    const d = solverDiff(ng, mna);
    const pass = d.worst <= SOLVER_TOL.rel && d.matched >= 0.95 * mna.freq.length;
    ok &&= pass;
    console.log(`${pass ? "ok  " : "FAIL"} ngspice vs mna.py: worst ${d.worst.toExponential(2)} (${d.where}), ${d.matched}/${mna.freq.length} frequencies matched`);
  }
  if (c.box.kind !== "free-air") {
    const sp = outputs(mna, net.probes);
    for (const s of compare(sp, engineFor(c, sp.freq), net.fRef)) {
      ok &&= s.pass;
      console.log(formatStat(s));
    }
  }
  if (dump) {
    const target = at ?? net.fRef ?? 50;
    let k = 0;
    mna.freq.forEach((f, n) => {
      if (Math.abs(f - target) < Math.abs(mna.freq[k]! - target)) k = n;
    });
    console.log(`\nAt ${mna.freq[k]!.toFixed(3)} Hz (re, im):`);
    for (const [n, z] of Object.entries(mna.v)) console.log(`  V(${n}) = ${z[k]![0].toExponential(6)}, ${z[k]![1].toExponential(6)}`);
    for (const [s, z] of Object.entries(mna.i)) console.log(`  I(${s}) = ${z[k]![0].toExponential(6)}, ${z[k]![1].toExponential(6)}`);
  }
  return ok;
}

function ngspiceAll(): boolean {
  let ok = true;
  for (const c of loadCases()) {
    const net = buildNetlist(c);
    const mna = runMna([cirPath(c.id)])[cirPath(c.id)]!;
    const ng = runNgspice(cirPath(c.id), net.probes, { freqs: mna.freq });
    const aligned = alignFrequencies(ng, mna);
    if (!aligned) console.log(`  ngspice's frequencies don't match mna.py's: ${ng.freq.slice(0, 4).join(", ")}…`);
    const d = solverDiff(ng, mna);
    const solverOk = d.worst <= SOLVER_TOL.rel && d.matched >= 0.95 * mna.freq.length;
    const lines = [`${solverOk ? "ok  " : "FAIL"} ngspice vs mna.py: worst ${d.worst.toExponential(2)} (${d.where}), ${d.matched}/${mna.freq.length} frequencies`];
    if (!solverOk) lines.push(`  ngspice vs mna.py values there: ${d.values}`);
    let caseOk = solverOk;
    if (c.box.kind !== "free-air") {
      const sp = outputs(ng, net.probes);
      for (const s of compare(sp, engineFor(c, sp.freq), net.fRef)) {
        caseOk &&= s.pass;
        if (!s.pass) lines.push(formatStat(s));
      }
    }
    console.log(`${caseOk ? "PASS" : "FAIL"} ${c.id} ${c.title}`);
    for (const l of lines) console.log(`  ${l}`);
    ok &&= caseOk;
  }
  return ok;
}

function summary(): boolean {
  const cases = loadCases().filter((c) => c.box.kind !== "free-air");
  const raw = runMna(cases.map((c) => cirPath(c.id)));
  const worst = new Map<string, { w: number; id: string; hz: number; n: number }>();
  let ok = true;
  const kinds = new Map<string, number>();
  for (const c of cases) {
    kinds.set(c.box.kind, (kinds.get(c.box.kind) ?? 0) + 1);
    const net = buildNetlist(c);
    const sp = outputs(raw[cirPath(c.id)]!, net.probes);
    for (const s of compare(sp, engineFor(c, sp.freq), net.fRef)) {
      ok &&= s.pass;
      const key = s.output.startsWith("PR ") ? "PR excursion" : s.output;
      const cur = worst.get(key);
      if (!cur || s.worst > cur.w) worst.set(key, { w: s.worst, id: c.id, hz: s.worstHz, n: (cur?.n ?? 0) + 1 });
      else cur.n++;
    }
  }
  console.log(`${cases.length} cases: ${[...kinds].map(([k, n]) => `${n} ${k}`).join(", ")}`);
  for (const [k, v] of worst) console.log(`  ${k}: worst ${v.w.toExponential(2)} (${v.id} at ${v.hz.toFixed(1)} Hz), ${v.n} comparisons`);
  return ok;
}

/**
 * Diagnose ngspice vs mna.py on one case: the netlist's own sweep (one factorisation order for
 * every point) with the default and the KLU solver, and each named frequency run on its own
 * (".ac lin 1 f f", a fresh factorisation), with ngspice's log.
 */
function probe(id: string, freqs: number[]): void {
  const c = loadCases().find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  const net = buildNetlist(c);
  const mna = runMna([cirPath(c.id)])[cirPath(c.id)]!;
  for (const options of [[], [".options klu"]]) {
    let log = "";
    const ng = runNgspice(cirPath(c.id), net.probes, { options, log: (s) => (log = s), sweep: true });
    alignFrequencies(ng, mna);
    const d = solverDiff(ng, mna);
    console.log(`[${options.join(" ") || "default"}] worst ${d.worst.toExponential(2)} (${d.where}); ${d.values}`);
    for (const line of log.split("\n")) if (/warn|error|unknown|solver|klu|sparse/i.test(line)) console.log(`   log: ${line.trim()}`);
  }
  const text = readFileSync(cirPath(c.id), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "sbg-probe-"));
  for (const f of freqs) {
    const p = join(dir, "one.cir");
    writeFileSync(p, text.replace(/^\.ac .*$/m, `.ac lin 1 ${f} ${f}`));
    const ng = runNgspice(p, net.probes, { sweep: true });
    const m = runMna([p])[p]!;
    const d = solverDiff(ng, m);
    console.log(`[alone at ${f} Hz] worst ${d.worst.toExponential(2)} (${d.where}); ${d.values}`);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "case") {
  const id = rest.find((a) => !a.startsWith("--"));
  const c = loadCases().find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  const fi = rest.indexOf("--frequency");
  const ok = caseReport(c, rest.includes("--ngspice"), rest.includes("--dump"), fi >= 0 ? Number(rest[fi + 1]) : null);
  process.exitCode = ok ? 0 : 1;
} else if (cmd === "probe") {
  probe(rest[0]!, rest.slice(1).map(Number));
} else if (cmd === "summary") {
  process.exitCode = summary() ? 0 : 1;
} else if (cmd === "ngspice") {
  process.exitCode = ngspiceAll() ? 0 : 1;
} else {
  console.log("usage: cli.ts case <id> [--ngspice] [--dump] [--frequency <Hz>] | ngspice");
  process.exitCode = 2;
}
