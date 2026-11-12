// SPICE validation, engine vs an independently built equivalent circuit solved by mna.py
// (docs/validation.md "Independent circuit check (SPICE)").
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSpiceReport, readSpiceReport, sameSpiceReport } from "../validation/spice-report.ts";
import { formatStat } from "../validation/spice/compare.ts";
import { cirPath, loadCases } from "../validation/spice/fixtures.ts";
import { buildNetlist } from "../validation/spice/netlist.ts";
import { outputs, runMnaText } from "../validation/spice/run.ts";

const cases = loadCases();

test("SPICE: committed netlists are what the builder writes from the inputs", () => {
  for (const c of cases) assert.equal(readFileSync(cirPath(c.id), "utf8"), buildNetlist(c).text, `${c.id}.cir is stale: run validation/spice/fixtures.ts`);
});

test("SPICE: engine matches the circuit (mna.py), and docs/validation/spice.json is current", () => {
  const failures: string[] = [];
  const fresh = buildSpiceReport(undefined, (c, stats, r) => {
    assert.ok(r.residual! < 1e-9, `${c.id}: solver residual ${r.residual}`);
    for (const s of stats) if (!s.pass) failures.push(`${c.id} ${formatStat(s)}`);
  });
  assert.deepEqual(failures, []);
  const stale = sameSpiceReport(readSpiceReport(), fresh);
  assert.equal(stale, null, `docs/validation/spice.json is out of date at ${stale}: run \`pnpm spice:report\` and commit it`);
});

test("SPICE: the spice.json staleness check is loose about rounding, strict about counts", () => {
  const rep = readSpiceReport();
  const copy = () => JSON.parse(JSON.stringify(rep)) as typeof rep;
  const a = copy();
  a.outputs[0]!.worst *= 1.5;
  a.outputs[0]!.worstCase = "elsewhere";
  a.showcase[0]!.points[0]![1] += 0.001;
  assert.equal(sameSpiceReport(a, rep), null);
  const b = copy();
  b.outputs[0]!.regions.around.mean *= 3;
  assert.match(sameSpiceReport(b, rep) ?? "", /regions\.around\.mean/);
  const c = copy();
  c.outputs[0]!.comparisons++;
  assert.match(sameSpiceReport(c, rep) ?? "", /comparisons/);
  const d = copy();
  d.showcase[0]!.points[3]![2] += 0.01;
  assert.match(sameSpiceReport(d, rep) ?? "", /showcase/);
  const e = copy();
  e.outputs[1]!.pass = false;
  assert.match(sameSpiceReport(e, rep) ?? "", /pass/);
});

test("SPICE: the LTspice dialect (Laplace sources, Rser=0) solves the same as the ngspice netlist", () => {
  // Every case with filters or EQ, and a few without, solved from both texts.
  const picked = cases.filter((c) => c.opts.highPass || c.opts.eq?.length || ["v01", "s01", "b03", "g-pr-001"].includes(c.id));
  assert.ok(picked.length > 40);
  const lt = picked.map((c) => buildNetlist(c, { dialect: "ltspice" }).text);
  for (const t of lt) {
    assert.doesNotMatch(t, /s_xfer|%vd/);
    for (const line of t.split("\n")) if (/^L\S*\s/.test(line)) assert.match(line, / Rser=0$/);
  }
  const a = runMnaText(lt);
  const b = runMnaText(picked.map((c) => buildNetlist(c).text));
  picked.forEach((c, k) => {
    const x = outputs(a[k]!, buildNetlist(c).probes);
    const y = outputs(b[k]!, buildNetlist(c).probes);
    const worst = Math.max(...x.spl.map((v, i) => Math.abs(v - y.spl[i]!)), ...x.impedanceOhm.map((v, i) => Math.abs(v / y.impedanceOhm[i]! - 1)));
    assert.ok(worst < 1e-9, `${c.id}: ${worst}`);
  });
});
