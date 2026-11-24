// Headroom step 6 (#168): the engine's power breakdown against the independently built circuit
// (mna.py). Power into the bank = Re{V(terminals)·I*} at the bank's terminals; the coil's heat =
// |I|²·Re; the sound = the radiation resistance of a small baffled source, ρω²/(2πc) in half space
// (4π: ρω²/(4πc)), times |U|² of the net radiated flow (ports + leak + PRs − cones).
import assert from "node:assert/strict";
import test from "node:test";
import { simulate } from "../src/simulate.ts";
import type { SpiceCase } from "../validation/spice/elements.ts";
import { loadCases } from "../validation/spice/fixtures.ts";
import { buildNetlist } from "../validation/spice/netlist.ts";
import { runMnaText, type C } from "../validation/spice/run.ts";

const abs2 = (z: C) => z[0] * z[0] + z[1] * z[1];

/**
 * One coil, one cone, no passive parts: the bank's terminal current is the coil's. Ports and PRs at
 * the cone (no vent distance): the engine then sums the flows at one point, as a radiation
 * resistance does; sources set apart radiate a different power (their cross-term goes as sin(kd)/kd).
 */
const plain = (c: SpiceCase) =>
  (c.box.kind === "sealed" || c.box.kind === "vented" || c.box.kind === "passive-radiator") &&
  (c.opts.drivers ?? 1) === 1 &&
  !c.opts.isobaric &&
  !c.opts.passive &&
  !(c.driver as { dvc?: unknown }).dvc &&
  !(c.opts as { coneLoad?: string }).coneLoad &&
  !(c.box as { ventDistance_cm?: number }).ventDistance_cm;

test("SPICE power: power into the driver, coil heat and radiated sound match the circuit", () => {
  const cases = loadCases().filter(plain);
  assert.ok(cases.length >= 20, `${cases.length} cases`);
  const nets = cases.map((c) => buildNetlist(c));
  const raws = runMnaText(
    nets.map((n) => n.text),
    true,
  );
  let worstIn = 0, worstCoil = 0, worstSound = 0, n = 0;
  let where = "";
  cases.forEach((c, k) => {
    const raw = raws[k]!;
    const p = nets[k]!.probes;
    const r = simulate(c.driver, c.box as Parameters<typeof simulate>[1], { ...c.opts, air: c.air, frequencies: raw.freq, powerBreakdown: true });
    const pw = r.power!;
    const space = (c.opts as { space?: string }).space === "full" ? 4 : 2;
    const sd = c.driver.sd_cm2 / 1e4;
    raw.freq.forEach((f, i) => {
      const v = raw.v[p.terminals]![i]!;
      const cur = raw.i[p.coilSense.toLowerCase()]![i]!;
      const pin = v[0] * cur[0] + v[1] * cur[1];
      // Net flow into the room: everything out of the box, less the cone's flow into it (its front radiates).
      const flows = [p.port, p.leak, ...p.prs].filter((s): s is string => !!s).map((s) => raw.i[s.toLowerCase()]![i]!);
      const cone = raw.i[p.cone.toLowerCase()]![i]!;
      const u: C = [flows.reduce((a, z) => a + z[0], 0) - cone[0], flows.reduce((a, z) => a + z[1], 0) - cone[1]];
      const w = 2 * Math.PI * f;
      const rar = (c.air.rho * w * w) / (space * Math.PI * c.air.c);
      const sound = rar * abs2(u);
      const re = c.driver.re * (c.opts.coilTemp_C ? 1 + 0.00393 * (c.opts.coilTemp_C - 20) : 1);
      const dIn = Math.abs(pw.inW[i]! / pin - 1);
      const dCoil = Math.abs(pw.coilW[i]! / (abs2(cur) * re) - 1);
      if (dIn > worstIn) (worstIn = dIn), (where = `${c.id} @ ${f.toFixed(1)} Hz (in)`);
      worstCoil = Math.max(worstCoil, dCoil);
      // A small source only (the engine's baffled-piston factor matters above ka ≈ 0.1), and not
      // where the port or PRs cancel the cone (below tuning the net flow is a small difference of
      // large ones, and the sum is then too sensitive to compare).
      if ((w / c.air.c) * Math.sqrt(sd / Math.PI) < 0.1 && abs2(u) > 0.01 * abs2(cone)) {
        worstSound = Math.max(worstSound, Math.abs(pw.acousticW[i]! / sound - 1));
        n++;
      }
    });
  });
  console.log(`# SPICE power: ${cases.length} cases, in ${worstIn.toExponential(1)}, coil ${worstCoil.toExponential(1)}, sound ${worstSound.toExponential(1)} (${n} points, ka < 0.1)`);
  assert.ok(worstIn < 1e-6, `power in: ${worstIn} at ${where}`);
  assert.ok(worstCoil < 1e-6, `coil: ${worstCoil}`);
  assert.ok(worstSound < 0.005, `sound: ${worstSound}`);
});
