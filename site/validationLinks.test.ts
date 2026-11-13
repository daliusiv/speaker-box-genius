import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWpr, simulate } from "../packages/engine/src/index.ts";
import { WINISD_CASES } from "../packages/engine/validation/winisd.ts";
import { HORNRESP_TITLES, HORNRESP_TOL, hornrespBoxIds, hornrespIds, readBoxCase, readTable, runHornrespBox } from "../packages/engine/validation/hornresp.ts";
import { decodeStateAny } from "../packages/web/src/state.ts";
import { builtVbOf, driverInputOf, enclosureOf, lossesFor, runDesigns, simOptionsOf, solveDriver } from "../packages/web/src/sim.ts";
import { hornrespBoxState, hornrespLineState, validationLinks, winisdCaseState } from "./validationLinks.ts";

const FIXTURES = join(import.meta.dirname, "../packages/engine/test/fixtures");
const interp = (f: Float64Array, y: ArrayLike<number>, x: number) => {
  let i = 1;
  while (i < f.length - 1 && f[i]! < x) i++;
  const t = Math.log(x / f[i - 1]!) / Math.log(f[i]! / f[i - 1]!);
  return y[i - 1]! + t * (y[i]! - y[i - 1]!);
};
const REL = new Set(["x", "xpr", "vport", "vrear", "z", "gd", "maxPower"]);

test("every WinISD case opened in the app gives WinISD's values (as the validation page holds them)", () => {
  for (const c of WINISD_CASES) {
    const s = winisdCaseState(c.id);
    assert.ok(s, `${c.id}: no project`);
    // WinISD's ports are straight, whatever the app's new-box default is.
    for (const d of s.designs) if (d.kind === "vented") assert.equal(d.flare_cm, 0, `${c.id}: flared port`);
    const r = runDesigns(s, solveDriver(s))[0]!.result;
    // WinISD plots one driver's impedance; the app shows what the amplifier sees (a known convention).
    const zScale = c.setup(parseWpr(readFileSync(join(FIXTURES, c.fixture), "latin1"))).zScale ?? 1;
    const sm = r.summary as unknown as Record<string, number>;
    for (const k of c.checks) {
      const at = (y?: ArrayLike<number> | null) => (y ? interp(r.freq, y, k.f) : undefined);
      const ours =
        k.what === "spl" ? at(r.spl)
        : k.what === "tf" ? at(r.spl)! - sm.referenceSpl!
        : k.what === "x" ? at(r.excursionMm)
        : k.what === "xpr" ? at(r.prExcursionMm)
        : k.what === "vport" ? at(r.portVelocity)
        : k.what === "vrear" ? at(r.rearPortVelocity)
        : k.what === "z" ? at(r.impedanceOhm)! * zScale
        : k.what === "fb" || k.what === "prFb" ? sm.fb
        : k.what === "fc" ? sm.fc
        : k.what === "f3" ? sm.f3
        : k.what === "qtc" ? sm.qtc
        : undefined; // values the page works out on its own (max SPL and the like)
      if (ours === undefined) continue;
      const diff = REL.has(k.what) ? ours / k.winisd - 1 : ours - k.winisd;
      // The app's 300-point sweep against the report's finer one: half a tolerance more, and 0.01 for rounded tunings.
      assert.ok(Math.abs(diff) <= Math.max(1.5 * k.tol, 0.01), `${c.id} ${k.what} at ${k.f} Hz: WinISD ${k.winisd}, app ${ours}`);
    }
  }
});

test("every Hornresp line and horn opened in the app matches Hornresp (at the report's resolution)", () => {
  for (const id of hornrespIds()) {
    const s = hornrespLineState(id, HORNRESP_TITLES[id as keyof typeof HORNRESP_TITLES] ?? id);
    assert.ok(s, `${id}: no project`);
    const d = s.designs[0]!;
    const r = simulate(driverInputOf(s, solveDriver(s)), enclosureOf(d, builtVbOf(s, d), lossesFor(s, d), s.volume.wall_mm, s.volume), { ...simOptionsOf(s), fMin: 10, fMax: 2000, points: 16000 });
    const rows = readTable(join(FIXTURES, "hornresp", id, "hornresp.txt")).filter((x) => x.Freq! <= 1000);
    const mean = (a: number[]) => a.reduce((p, c) => p + c, 0) / a.length;
    const spl = mean(rows.map((x) => Math.abs(interp(r.freq, r.spl, x.Freq!) - x.SPL!)));
    const ze = mean(rows.map((x) => Math.abs(interp(r.freq, r.impedanceOhm, x.Freq!) / x.Ze! - 1) * 100));
    assert.ok(spl < HORNRESP_TOL.splMean, `${id}: SPL ${spl.toFixed(3)} dB`);
    assert.ok(ze < HORNRESP_TOL.zeMean, `${id}: impedance ${ze.toFixed(2)} %`);
  }
});

test("every Hornresp box, filter, EQ and stuffed-line case opened in the app is the comparison's own simulation", () => {
  for (const id of hornrespBoxIds()) {
    const c = readBoxCase(id);
    // Full space isn't a setting in the app yet: no link for those cases.
    if (c.space === "full") {
      assert.equal(hornrespBoxState(id), null);
      continue;
    }
    const s = hornrespBoxState(id);
    assert.ok(s, `${id}: no project`);
    const ref = runHornrespBox(id).result;
    const d = s.designs[0]!;
    // The app's pipeline (sim.ts): its driver, enclosure and options, at the comparison's sweep.
    const eq = s.eq.map(({ id: _i, on: _o, target: _t, ...e }) => e);
    const r = simulate(driverInputOf(s, solveDriver(s)), enclosureOf(d, builtVbOf(s, d), lossesFor(s, d), s.volume.wall_mm, s.volume), {
      ...simOptionsOf(s),
      eq: eq as never,
      fMin: 10,
      fMax: Math.max(1000, c.zeFMax ?? 0),
      points: 8000,
    });
    for (let i = 0; i < r.freq.length && r.freq[i]! <= (c.fMax ?? 300); i++) {
      assert.ok(Math.abs(r.impedanceOhm[i]! / ref.impedanceOhm[i]! - 1) < 1e-5, `${id}: impedance at ${r.freq[i]} Hz`);
      assert.ok(Math.abs(r.excursionMm[i]! / ref.excursionMm[i]! - 1) < 1e-5, `${id}: excursion at ${r.freq[i]} Hz`);
      assert.ok(Math.abs(r.spl[i]! - ref.spl[i]!) < 1e-4, `${id}: SPL at ${r.freq[i]} Hz`);
    }
  }
});

test("the links open those projects", async () => {
  const links = await validationLinks("https://speakerboxgenius.com", {
    winisd: [{ id: "bandpass-6" }],
    hornresp: [{ id: "06-tapped-horn", title: "Tapped horn" }],
  });
  assert.deepEqual(Object.keys(links), ["winisd-bandpass-6", "hornresp-06-tapped-horn"]);
  const open = async (k: string) => decodeStateAny(links[k]!.href.split("#")[1]!);
  assert.deepEqual((await open("winisd-bandpass-6"))?.designs, winisdCaseState("bandpass-6")!.designs);
  const th = await open("hornresp-06-tapped-horn");
  assert.equal(th?.designs[0]?.kind, "line");
  assert.equal(th?.settings.air, "hornresp");
  assert.equal(th?.drive, "volts");
});
