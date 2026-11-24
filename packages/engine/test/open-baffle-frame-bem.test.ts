import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { flatModel, frameModel, openBaffleGeometry, openBaffleFrequencies } from "../src/openBaffle.ts";
import { discSources, rectSources, slabModels } from "../src/slabDiffraction.ts";
import { simulate } from "../src/simulate.ts";
import { lineNetwork } from "../src/line.ts";
import { abs, add, div, mul, scale, type Complex } from "../src/complex.ts";
import type { DriverInput, OpenBaffleInput } from "../src/model.ts";

// Open-baffle frame ducts against boundary-element solutions (packages/engine/validation/bem/frames:
// H and U frames of zero-thickness rigid walls, cone = a disc patch on the board). The BEM gives the
// volume velocity out of the rear mouth per unit cone volume velocity; the engine's duct model gives
// the same from its transmission line and mouth radiation impedance. The 1-D duct holds below the
// duct's first cross-mode (c/W), so the comparison stops at 0.9·c/W.
const DIR = join(import.meta.dirname, "..", "validation", "bem", "frames");
interface Frame { frame: "H" | "U"; W: number; H: number; depth: number; board_z: number; T?: number; /** cone height (m), default centred */ y?: number }
const frames = JSON.parse(readFileSync(join(DIR, "frames.json"), "utf8")) as Record<string, Frame>;
const air = { c: 343.2, rho: 1.204 };
const TAU = 2 * Math.PI;

function rows(id: string) {
  const lines = readFileSync(join(DIR, `${id}-mouths.csv`), "utf8").trim().split("\n");
  const head = lines[0]!.split(",");
  const [re, im] = [head.indexOf("Ur_re"), head.indexOf("Ur_im")];
  // Outward rear-mouth flow (−1 at low frequency for a cone moving forward): flip to the duct's own sense.
  return lines.slice(1).map((l) => {
    const v = l.split(",").map(Number);
    return { f: v[0]!, u: { re: -v[re]!, im: -v[im]! } as Complex };
  });
}

function box(fr: Frame, ductMouth: "open" | "baffled"): OpenBaffleInput {
  return { kind: "open-baffle", frame: fr.frame === "H" ? "h" : "u", w_cm: fr.W * 100, h_cm: fr.H * 100, t_cm: (fr.T ?? 0) * 100, depth_cm: fr.depth * 100, ...(fr.y !== undefined ? { y_cm: fr.y * 100 } : {}), ductMouth };
}

// The same frames with 18 mm walls and board (frames/frame_thick.py: the frame as one rigid solid).
const thick: Record<string, Frame> = {
  FT1: { ...frames.F1!, T: 0.018 },
  FT4: { ...frames.F4!, T: 0.018 },
  FT5: { frame: "U", W: 0.45, H: 1.0, depth: 0.3, board_z: 0, T: 0.018, y: 0.35 }, // tall, cone 35 cm up
};

function compare(id: string, ductMouth: "open" | "baffled") {
  const fr = frames[id]!;
  const b = box(fr, ductMouth);
  const g = openBaffleGeometry(b);
  const net = lineNetwork(g.rearLine!, air);
  const top = (0.9 * air.c) / fr.W;
  const r = rows(id).filter((x) => x.f <= top);
  const err = r.map((x) => {
    const q = div(net.exitPerCone(TAU * x.f), x.u);
    return { f: x.f, db: 20 * Math.log10(abs(q)), deg: (Math.atan2(q.im, q.re) * 180) / Math.PI };
  });
  const rms = Math.sqrt(err.reduce((s, e) => s + e.db * e.db, 0) / err.length);
  const maxDb = Math.max(...err.map((e) => Math.abs(e.db)));
  const maxDeg = Math.max(...err.map((e) => Math.abs(e.deg)));
  // Peaks: the BEM's grid maximum (2 % steps round it) against the model's own resonance readout.
  const pk = r.reduce((a, x) => (abs(x.u) > abs(a.u) ? x : a));
  const fq = openBaffleFrequencies(b, air).fQuarter!;
  const peakFreq = fq / pk.f - 1;
  const peakDb = 20 * Math.log10(abs(net.exitPerCone(TAU * fq)) / abs(pk.u));
  return { rms, maxDb, maxDeg, peakFreq, peakDb, n: err.length };
}

for (const id of Object.keys(frames)) {
  test(`${id}: frame duct mouth flow vs BEM, open pipe end (below the duct's first cross-mode)`, () => {
    const s = compare(id, "open");
    const msg = `rms ${s.rms.toFixed(2)} dB, max ${s.maxDb.toFixed(2)} dB, ${s.maxDeg.toFixed(1)}°, peak ${(s.peakFreq * 100).toFixed(1)} % ${s.peakDb.toFixed(2)} dB (${s.n} points)`;
    assert.ok(s.n > 40, msg);
    assert.ok(s.rms < 0.8, msg);
    assert.ok(s.maxDb < 1.5, msg);
    assert.ok(s.maxDeg < 20, msg);
    assert.ok(Math.abs(s.peakFreq) < 0.05, msg);
    assert.ok(Math.abs(s.peakDb) < 1, msg);
  });
}

test("frame ducts: the earlier baffled-mouth model is well off the BEM (why the default is an open pipe end)", () => {
  for (const id of Object.keys(frames)) {
    const s = compare(id, "baffled");
    assert.ok(s.peakFreq < -0.05 && s.rms > 1.4, `${id}: peak ${(s.peakFreq * 100).toFixed(1)} %, rms ${s.rms.toFixed(2)} dB`);
  }
});

// ---------------------------------------------------------------------------------------------
// On axis: the frame's outside sound (slabDiffraction.ts) with the duct model's mouth flows.
// ---------------------------------------------------------------------------------------------
const curve = (id: string) =>
  readFileSync(join(DIR, `${id}.csv`), "utf8").trim().split("\n").slice(1).map((l) => l.split(",").map(Number) as [number, number, number]);
interface Py { inset_m: number; frames: Record<string, number[][]> }
const py = JSON.parse(readFileSync(join(DIR, "slab-python.json"), "utf8")) as Py;
const cone = (fr: Frame) => (fr.frame === "U" ? 0.1236 : 0);

test("frame outside model: the TS port matches btm_thick.py (F1–F4, to 600 Hz)", () => {
  // Mouths inset from the edges, where neither code refines the first edge (see sourceKernels).
  const t = py.inset_m;
  for (const [id, rowsPy] of Object.entries(py.frames)) {
    const fr = frames[id]!;
    const mouth = (face: "front" | "rear") => rectSources(face, t, t, fr.W - 2 * t, fr.H - 2 * t, 8);
    const front = fr.frame === "H" ? mouth("front") : discSources("front", fr.W / 2, fr.H / 2, cone(fr));
    const [F, R] = slabModels({ w: fr.W, h: fr.H, t: fr.depth }, [front, mouth("rear")], air.c);
    let worst = 0;
    for (const [f, fre, fim, rre, rim] of rowsPy) {
      const a = F!.at(f!);
      const b = R!.at(f!);
      worst = Math.max(worst, Math.hypot(a.re - fre!, a.im - fim!), Math.hypot(b.re - rre!, b.im - rim!));
    }
    assert.ok(worst < 1e-3, `${id}: worst |TS − Python| ${worst.toExponential(2)}`);
  }
});

/** Model F on axis against the BEM curve, with the duct model's mouth flows; stats below 0.9·c/W. */
function onAxis(id: string, fr: Frame = frames[id]!) {
  const b = box(fr, "open");
  const g = openBaffleGeometry(b);
  const m = frameModel(b, Math.PI * cone(fr) ** 2, air);
  const net = lineNetwork(g.rearLine!, air);
  const front = g.frontLine ? lineNetwork(g.frontLine, air) : null;
  const top = (0.9 * air.c) / fr.W;
  const rows = curve(id).filter((r) => r[0] <= top);
  const lv = rows.map(([f]) => {
    const w = TAU * f;
    // Cone flow 1 into the ducts: the rear mouth sends exitPerCone out; the front source is the
    // cone (U, outward −1 … here +1 out of the front face) or the front mouth (H).
    const uFront: Complex = front ? front.exitPerCone(w) : { re: 1, im: 0 };
    const uRear = scale(net.exitPerCone(w), -1);
    return add(mul(uFront, m.front.at(f)), mul(uRear, m.rear.at(f)));
  });
  const err = rows.map((r, i) => 20 * Math.log10(abs(lv[i]!)) - r[1]);
  const bass = err.filter((_, i) => rows[i]![0] < 100);
  const rms = Math.sqrt(err.reduce((s, e) => s + e * e, 0) / err.length);
  // Peaks: the BEM's through a parabola on its three highest points (log f), the model's by a fine search.
  const ib = rows.reduce((a, r, i) => (r[1] > rows[a]![1] ? i : a), 0);
  let bemF = rows[ib]![0];
  let bemDb = rows[ib]![1];
  if (ib > 0 && ib < rows.length - 1) {
    const [y0, y1, y2] = [rows[ib - 1]![1], rows[ib]![1], rows[ib + 1]![1]];
    const h = Math.log(rows[ib + 1]![0] / rows[ib]![0]);
    const den = y0 - 2 * y1 + y2;
    if (den < 0) {
      bemF = rows[ib]![0] * Math.exp((h * (y0 - y2)) / (2 * den));
      bemDb = y1 - (y0 - y2) ** 2 / (8 * den);
    }
  }
  const level = (f: number) => {
    const w = TAU * f;
    const uFront: Complex = front ? front.exitPerCone(w) : { re: 1, im: 0 };
    return 20 * Math.log10(abs(add(mul(uFront, m.front.at(f)), mul(scale(net.exitPerCone(w), -1), m.rear.at(f)))));
  };
  let mF = bemF;
  for (let f = bemF * 0.7; f <= Math.min(bemF * 1.3, top); f *= 1.002) if (level(f) > level(mF)) mF = f;
  return {
    bass: bass.reduce((s, e) => s + Math.abs(e), 0) / bass.length,
    rms,
    max: Math.max(...err.map(Math.abs)),
    peakFreq: mF / bemF - 1,
    peakDb: level(mF) - bemDb,
    d: openBaffleFrequencies(b, air, Math.PI * cone(fr) ** 2).d_m,
  };
}

for (const [id, fr] of [...Object.entries(frames), ...Object.entries(thick)]) {
  test(`${id}: on axis vs BEM, frame edge diffraction + duct model (below the duct's first cross-mode)${fr.T ? ", 18 mm walls" : ""}`, () => {
    const s = onAxis(id, fr);
    const msg = `bass ${s.bass.toFixed(2)} dB, rms ${s.rms.toFixed(2)} dB, max ${s.max.toFixed(2)} dB, peak ${(s.peakFreq * 100).toFixed(1)} % ${s.peakDb.toFixed(2)} dB, D ${(s.d * 100).toFixed(1)} cm`;
    assert.ok(s.bass < 0.4, msg);
    assert.ok(s.rms < 0.9, msg);
    assert.ok(s.max < 2.5, msg);
    // FT1, an H-frame with 18 mm walls, peaks 8 % high (thin-walled F1: 4 %; the U-frames within 2 %):
    // its rims are a small flange the open-pipe mouth leaves out, and the two mouths load each other
    // through the air outside, which the duct model leaves out too. Held at its value so a change shows.
    if (id === "FT1") assert.ok(s.peakFreq > 0.07 && s.peakFreq < 0.09, msg);
    else assert.ok(Math.abs(s.peakFreq) < 0.06, msg);
    assert.ok(Math.abs(s.peakDb) < 0.8, msg);
  });
}

test("frames in the simulator: the cone and mouths through the frame model (F1, F4 vs BEM)", () => {
  // Scale: SPL − 20·log(f·excursion·Sd) is a term that depends on f alone plus 20·log|F|, F against
  // a free source of the cone's flow. That term comes from a flat board at each frequency, whose F
  // the flat model gives (its wiring is checked to 1e-9 in open-baffle.test.ts); the frame's F then
  // goes against the BEM.
  const DRV: DriverInput = { fs: 41, qms: 9.0, qes: 1.47, vas_l: 260, re: 5.8, sd_cm2: 480, le_mh: 0, xmax_mm: 3.4, pe_w: 150 };
  const sd = DRV.sd_cm2 / 1e4;
  const flatB: OpenBaffleInput = { kind: "open-baffle", w_cm: 45, h_cm: 45 };
  for (const id of ["F1", "F4"]) {
    const fr = frames[id]!;
    const rows = curve(id).filter((r) => r[0] >= 20 && r[0] <= (0.9 * air.c) / fr.W);
    const freqs = rows.map((r) => r[0]);
    const level = (res: ReturnType<typeof simulate>) => freqs.map((f, i) => res.spl[i]! - 20 * Math.log10(f * res.excursionMm[i]! * sd));
    const flatF = flatModel(flatB, sd, air);
    const lf = level(simulate(DRV, flatB, { frequencies: freqs, air }));
    const C = freqs.map((f, i) => lf[i]! - 20 * Math.log10(abs(flatF.at(f))));
    const lr = level(simulate(DRV, box(fr, "open"), { frequencies: freqs, air }));
    const err = freqs.map((_, i) => lr[i]! - C[i]! - rows[i]![1]);
    const rms = Math.sqrt(mean(err.map((e) => e * e)));
    // The driver's cone (480 cm²) is the BEM's (radius 12.36 cm).
    assert.ok(rms < 0.9, `${id}: rms ${rms.toFixed(2)} dB, worst ${Math.max(...err.map(Math.abs)).toFixed(2)} dB`);
  }
});

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
