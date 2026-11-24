import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { flatBaffleModel } from "../src/edgeDiffraction.ts";
import { flatModel } from "../src/openBaffle.ts";
import { abs } from "../src/complex.ts";

// The flat open baffle's edge-diffraction model against boundary-element solutions of thin rigid
// boards (packages/engine/validation/bem: bempp-cl, cone = a disc patch through the board, on
// axis at 100 m, against a free point source of the same volume velocity, c = 343.2 m/s).
const BEM = join(import.meta.dirname, "..", "validation", "bem");
interface Board { W: number; H: number; x: number; y: number; a: number }
const boards = JSON.parse(readFileSync(join(BEM, "boards.json"), "utf8")) as Record<string, Board>;
const curve = (name: string) =>
  readFileSync(join(BEM, "curves", `${name}.csv`), "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => l.split(",").map(Number) as [number, number, number]);
const C = 343.2;
const model = (b: Board) => flatBaffleModel({ w: b.W, h: b.H, x: b.x, y: b.y, a: b.a }, C);
const dB = (z: { re: number; im: number }) => 20 * Math.log10(abs(z));

/** Peak of a sampled curve, a parabola through the top three points in log f. */
function samplePeak(rows: [number, number, number][]) {
  let i = 0;
  rows.forEach((r, q) => {
    if (r[1] > rows[i]![1]) i = q;
  });
  if (i === 0 || i === rows.length - 1) return { f: rows[i]![0] };
  const [x0, x1, x2] = [i - 1, i, i + 1].map((q) => Math.log(rows[q]![0]));
  const [y0, y1, y2] = [i - 1, i, i + 1].map((q) => rows[q]![1]);
  const d = (x0! - x1!) * (x0! - x2!) * (x1! - x2!);
  const A = (x2! * (y1! - y0!) + x1! * (y0! - y2!) + x0! * (y2! - y1!)) / d;
  const B = (x2! * x2! * (y0! - y1!) + x1! * x1! * (y2! - y0!) + x0! * x0! * (y1! - y2!)) / d;
  const xv = -B / (2 * A);
  return { f: Math.exp(xv) };
}

for (const name of Object.keys(boards)) {
  test(`edge diffraction vs BEM: ${name}`, () => {
    const b = boards[name]!;
    const m = model(b);
    const rows = curve(name).filter((r) => r[0] <= 900);
    const err = rows.map(([f, level]) => dB(m.at(f)) - level);
    const rms = Math.sqrt(err.reduce((s, e) => s + e * e, 0) / err.length);
    assert.ok(rms <= 0.2, `rms ${rms.toFixed(3)} dB`);
    const phase = rows.map(([f, , ph]) => {
      const z = m.at(f);
      return Math.abs(((((Math.atan2(z.im, z.re) * 180) / Math.PI - ph + 180) % 360) + 360) % 360 - 180);
    });
    assert.ok(Math.max(...phase) <= 6, `phase ${Math.max(...phase).toFixed(1)}°`);
    // The peak: level and frequency (the model's maximum on a fine grid near the BEM's).
    const all = curve(name).filter((r) => r[0] <= 1200);
    const bp = samplePeak(all);
    let fm = bp.f / 1.3;
    for (let f = bp.f / 1.3; f < bp.f * 1.3; f *= 1.001) if (abs(m.at(f)) > abs(m.at(fm))) fm = f;
    const top = all.reduce((a, r) => (r[1] > a[1] ? r : a));
    assert.ok(Math.abs(dB(m.at(top[0])) - top[1]) <= 0.2, `peak level ${(dB(m.at(top[0])) - top[1]).toFixed(3)} dB at ${top[0]} Hz`);
    // Peak frequency where the BEM grid is fine enough to place it (≤ 6 % steps), and not on
    // the 60 × 60 board with the driver near a corner (a broad hump, not a peak).
    const i = all.indexOf(top);
    const step = all[i + 1] ? all[i + 1]![0] / top[0] : Infinity;
    if (name !== "N3" && step <= 1.06) assert.ok(Math.abs(fm / bp.f - 1) <= 0.03, `peak ${fm.toFixed(0)} Hz vs BEM ${bp.f.toFixed(0)} Hz`);
  });
}

test("low-frequency path D: the model's own limit matches the rectangle's Laplace solve (rect_bass.py)", () => {
  const rect: Record<string, number> = { B1: 31.43, B2: 40.15, B3: 22.43, B4: 42.03, B5: 29.35, N2: 27.94, N3: 35.53, N4: 17.3, T120: 28.74 };
  for (const [name, D] of Object.entries(rect)) {
    const got = model(boards[name]!).d_m * 100;
    assert.ok(Math.abs(got / D - 1) <= 0.01, `${name}: ${got.toFixed(2)} vs ${D} cm`);
  }
});

test("TypeScript port = the Python reference (btm.py --fixture)", () => {
  const ref = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "ob-edge", "python.json"), "utf8")) as Record<string, { f: number[]; re: number[]; im: number[] }>;
  for (const [name, r] of Object.entries(ref)) {
    const m = model(boards[name]!);
    r.f.forEach((f, i) => {
      const want = { re: r.re[i]!, im: r.im[i]! };
      const diff = dB(m.at(f)) - dB(want);
      assert.ok(Math.abs(diff) <= 0.05, `${name} at ${f} Hz: ${diff.toFixed(4)} dB`);
    });
  }
});

test("above the full model (orders ≤ 2) the response joins on without a step", () => {
  const m = model(boards.B1!);
  const below = dB(m.at(1199));
  const above = dB(m.at(1201));
  assert.ok(Math.abs(below - above) < 0.3, `${below} → ${above}`);
});

// ---------------------------------------------------------------------------------------------
// Thick boards (validation/bem/thick: 30, 45 and 60 cm squares, 18, 25 and 40 mm, cone a 2 cm
// disc through the board, closed-slab BEM, thick.py) against the engine's flat board with t_cm.
// The engine runs the thin model on a slightly bigger board (openBaffle.ts, OB_THICK_*): the 45 cm
// boards set its constants, the 30 and 60 cm ones check them.
// ---------------------------------------------------------------------------------------------
const THICK = join(BEM, "thick");
const thickRows = (name: string) =>
  readFileSync(join(THICK, `${name}.csv`), "utf8").trim().split("\n").slice(1).map((l) => l.split(",").map(Number) as [number, number, number]);

for (const name of ["K30-18", "K30-25", "K30-40", "K45-18", "K45-25", "K45-40", "K60-18", "K60-25", "K60-40"]) {
  test(`${name}: thick flat board vs BEM (bass, peak, rms to 900 Hz)`, () => {
    const g = JSON.parse(readFileSync(join(THICK, `${name}.json`), "utf8")) as { W: number; H: number; T: number; x: number; y: number; a: number };
    const b = { kind: "open-baffle" as const, w_cm: g.W * 100, h_cm: g.H * 100, x_cm: g.x * 100, y_cm: g.y * 100, t_cm: g.T * 100 };
    const m = flatModel(b, Math.PI * g.a * g.a, { c: C, rho: 1.204 });
    const rows = thickRows(name).filter((r) => r[0] <= 900);
    const err = rows.map((r) => dB(m.at(r[0])) - r[1]);
    const bassErr = err.filter((_, i) => rows[i]![0] < 100);
    const bass = bassErr.reduce((s, e) => s + Math.abs(e), 0) / bassErr.length;
    const rms = Math.sqrt(err.reduce((s, e) => s + e * e, 0) / err.length);
    const fb = samplePeak(rows).f;
    let fm = fb * 0.8;
    for (let f = fb * 0.8; f < fb * 1.25; f *= 1.002) if (dB(m.at(f)) > dB(m.at(fm))) fm = f;
    const msg = `bass ${bass.toFixed(2)} dB, rms ${rms.toFixed(2)} dB, peak ${((fm / fb - 1) * 100).toFixed(1)} %`;
    assert.ok(bass < 0.2, msg);
    assert.ok(rms < 0.6, msg);
    assert.ok(Math.abs(fm / fb - 1) < 0.03, msg);
    // A thin board (t = 0) misses by 0.6–2.1 dB in the bass: the thickness is worth modelling.
    const thin = flatModel({ ...b, t_cm: 0 }, Math.PI * g.a * g.a, { c: C, rho: 1.204 });
    const thinBass = rows.filter((r) => r[0] < 100).reduce((s, r) => s + Math.abs(dB(thin.at(r[0])) - r[1]), 0) / bassErr.length;
    assert.ok(thinBass > 0.5, `thin board bass ${thinBass.toFixed(2)} dB`);
  });
}
