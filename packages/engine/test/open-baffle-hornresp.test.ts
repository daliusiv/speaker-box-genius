import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { simulate } from "../src/simulate.ts";
import { openBaffleGeometry } from "../src/openBaffle.ts";
import { lineNetwork, pistonPowerFactor } from "../src/line.ts";
import { abs } from "../src/complex.ts";
import type { DriverInput, OpenBaffleInput } from "../src/model.ts";
import { HORNRESP_AIR, hornrespDriver } from "../validation/hornresp.ts";

// Open baffles against Hornresp 60.70 (17 Nov 2026, records O1–O5 in docs/hornresp-validation/records).
// Hornresp models a flat baffle, a U-frame and an H-frame as a compound horn (CH) with no rear or
// throat chamber, its sides as two point sources a path apart, and gives the on-axis pressure from
// its Loudspeaker Wizard. Two conventions differ from the app's, so they are taken out first:
// - Hornresp needs Ang = 2π for an open baffle (4π is refused): every level is 6.02 dB above the
//   app's free-standing (full space) one.
// - Hornresp's path is its own (0.862·√S for a flat baffle of area S, S being a disc; a frame adds
//   its depth): the flat cases use a board as wide as that path, so D is the same; the frames
//   can't (the duct must keep its area), so their low-frequency level differs by 20·log(D ratio).
//   Outside the frame the app uses edge diffraction (see the frames' recorded difference below).
// - Hornresp's duct mouth radiates as a hole in a wall; the app's frames default to an open pipe end
//   (checked against BEM, open-baffle-frame-bem.test.ts), so these runs set `ductMouth: "baffled"`.
const DIR = join(import.meta.dirname, "fixtures", "hornresp-ob");
interface Case { title: string; driver: DriverInput; box: OpenBaffleInput; hornrespPath_cm: number }
const read = (id: string, f: string) =>
  readFileSync(join(DIR, id, f), "utf8").split("\n").slice(1).map((l) => l.trim().split(/\s+/).map(Number)).filter((r) => r.length >= 2 && r[0]! > 0);

function run(id: string) {
  const c = JSON.parse(readFileSync(join(DIR, id, "case.json"), "utf8")) as Case;
  c.box = { ...c.box, ductMouth: "baffled" };
  // Hornresp's cone load: both faces a baffled piston (the open rear's "piston" load), Mms unchanged.
  const r = simulate(hornrespDriver(c.driver, 2), c.box, { power: 2.83, convention: "volts", fMin: 10, fMax: 2000, points: 8000, air: HORNRESP_AIR, coneLoad: "piston" });
  const at = (a: Float64Array, f: number) => {
    let i = 0;
    while (r.freq[i + 1]! < f) i++;
    const t = (f - r.freq[i]!) / (r.freq[i + 1]! - r.freq[i]!);
    return a[i]! + t * (a[i + 1]! - a[i]!);
  };
  return { c, r, at, ob: r.summary.ob! };
}
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

/** Cone impedance and excursion: the same driver load either way. */
function coneChecks(id: string) {
  const { r, at } = run(id);
  const ze = read(id, "ze.txt").filter((x) => x[0]! <= 1000).map((x) => Math.abs(at(r.impedanceOhm, x[0]!) / x[1]! - 1) * 100);
  const xdRows = read(id, "xd.txt");
  const xmax = Math.max(...xdRows.map((x) => x[1]!));
  const xd = xdRows.filter((x) => x[1]! > 0.02 * xmax && x[0]! <= 1000).map((x) => Math.abs(at(r.excursionMm, x[0]!) / x[1]! - 1) * 100);
  assert.ok(mean(ze) < 0.1 && Math.max(...ze) < 0.3, `${id} impedance: mean ${mean(ze).toFixed(3)} %, max ${Math.max(...ze).toFixed(3)} %`);
  assert.ok(mean(xd) < 0.5 && Math.max(...xd) < 2, `${id} excursion: mean ${mean(xd).toFixed(3)} %, max ${Math.max(...xd).toFixed(3)} %`);
}

/** On-axis SPL against Hornresp's pressure at 0°, the level offset taken out: worst |difference| up to fTop. */
function onAxis(id: string, offset: number, fTop: number) {
  const { r, at } = run(id);
  return Math.max(...read(id, "pressure.txt").filter((x) => x[0]! <= fTop).map((x) => Math.abs(at(r.spl, x[0]!) - x[1]! - offset)));
}

for (const id of ["ob12-flat", "ob15-flat"]) {
  test(`${id}: Hornresp's flat open baffle, the paths' ratio taken out in the bass (a recorded difference)`, () => {
    // Hornresp's path rule (0.862·√S) is about 1.2 × the board's real low-frequency path (BEM and
    // edge diffraction agree within 1 %), so its bass is that much louder: 20·log(D ratio).
    const { c, ob } = run(id);
    const offset = -6.02 + 20 * Math.log10((ob.d_m * 100) / c.hornrespPath_cm);
    assert.ok(offset < -7.5 && offset > -8.5, `bass offset ${offset.toFixed(2)} dB`);
    assert.ok(onAxis(id, offset, 30) < 0.1, `to 30 Hz: ${onAxis(id, offset, 30)}`);
    coneChecks(id);
  });
}

test("ob12-u: the cone's load and excursion match Hornresp's U-frame", () => {
  coneChecks("ob12-u");
});

test("H-frames: each mouth's own output is Hornresp's Output 1 / Output 2; the cone's load and excursion match", () => {
  const { c, r, at } = run("ob12-h");
  const g = openBaffleGeometry(c.box);
  const net = lineNetwork(g.rearLine!, HORNRESP_AIR);
  const area = g.ductArea_cm2 / 1e4;
  const sd = c.driver.sd_cm2 / 1e4;
  for (const f of ["output1.txt", "output2.txt"]) {
    const d = read("ob12-h", f).filter((x) => x[0]! <= 400).map(([fr, spl]) => {
      const w = 2 * Math.PI * fr!;
      // Mouth volume velocity (RMS) from the cone's, as a baffled piston of the duct's area in half space.
      const u = ((w * at(r.excursionMm, fr!)) / 1000 / Math.SQRT2) * sd * abs(net.exitPerCone(w));
      const db = 20 * Math.log10((HORNRESP_AIR.rho * w * u * pistonPowerFactor(area, w, HORNRESP_AIR)) / (2 * Math.PI) / 2e-5);
      return Math.abs(db - spl!);
    });
    assert.ok(Math.max(...d) < 0.05, `${f}: ${Math.max(...d)}`);
  }
  coneChecks("ob12-h");
  coneChecks("ob15-h");
});

test("frames on axis: a recorded difference against Hornresp (23 Nov)", () => {
  // Each mouth matches Hornresp (above), but outside the frame the two programs differ: Hornresp
  // adds the mouths as two points a path apart (its own path rule plus the depth), while the app
  // takes edge diffraction round the frame as a block, checked against boundary-element runs of
  // four frames (open-baffle-frame-bem.test.ts). With the paths' ratio taken out the bass agrees;
  // above it Hornresp has no baffle step, so it falls away. Held here so a change shows.
  const seen: Record<string, [number, number, number]> = { "ob12-u": [0.06, 0.81, 2.22], "ob12-h": [0.11, 1.48, 7.3], "ob15-h": [0.22, 2.61, 7.3] };
  for (const [id, [to30, to100, toQ]] of Object.entries(seen)) {
    const { c, ob } = run(id);
    const offset = -6.02 + 20 * Math.log10((ob.d_m * 100) / c.hornrespPath_cm);
    const got = [onAxis(id, offset, 30), onAxis(id, offset, 100), onAxis(id, offset, ob.fQuarter!)] as const;
    for (const [k, want] of [to30, to100, toQ].entries()) assert.ok(Math.abs(got[k]! - want) < 0.1, `${id} ${["to 30 Hz", "to 100 Hz", "to fQuarter"][k]}: ${got[k]!.toFixed(3)} dB, recorded ${want}`);
  }
});
