/**
 * The engine against four other programs, fed the same inputs (10 Nov 2026): REW's EQ and
 * Thiele-Small calculator, XSim, FreeCAD and WinISD's vent panel. Setups and readings are in
 * fixtures/crosscheck/ (README.md there says what was entered where).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { biquadsDb, dspBiquads, type Biquad } from "../src/dsp.ts";
import type { EqStage } from "../src/filters.ts";
import { driverImpedance, fitImpedance, parseImpedance, type ImpedanceParams } from "../src/impedance.ts";
import { passiveBankGain, passiveInputImpedance, type PassiveNetwork } from "../src/passive.ts";
import { grossVolume, portTubeDisplacement } from "../src/volume.ts";
import { portLengthForFb } from "../src/model.ts";
import { parseWpr } from "../src/wdr.ts";

const DIR = join(import.meta.dirname, "fixtures", "crosscheck");
const read = (p: string) => readFileSync(join(DIR, p), "latin1");
const cases = JSON.parse(read("cases.json"));
const rel = (a: number, b: number) => Math.abs(a / b - 1);

test("REW EQ: the app's biquads equal REW's coefficients (48 kHz)", () => {
  const rew: Biquad[] = [];
  for (const m of read("rew-eq/rew-minidsp-48k.txt").matchAll(/b0=([-\d.eE]+),\s*b1=([-\d.eE]+),\s*b2=([-\d.eE]+),\s*a1=([-\d.eE]+),\s*a2=([-\d.eE]+)/g)) {
    const [b0, b1, b2, a1, a2] = m.slice(1).map(Number) as [number, number, number, number, number];
    if (b0 === 1 && b1 === 0 && b2 === 0 && a1 === 0 && a2 === 0) continue; // unused slots
    rew.push({ b0, b1, b2, a1: -a1, a2: -a2, order: 2, label: "" }); // miniDSP: a1, a2 sign-inverted
  }
  assert.equal(rew.length, 5);
  const fs = 48000;
  const eq = (st: EqStage) => dspBiquads(null, [st], fs)[0]!;
  const ours = [
    dspBiquads({ type: "butterworth", order: 2, freq: 25 }, [], fs)[0]!,
    eq({ type: "lowshelf", freq: 30, gain_db: 6, q: 0.8 }),
    eq({ type: "peak", freq: 40, gain_db: -6, q: 2 }),
    eq({ type: "linkwitz", f0: 50, q0: 1.2, fp: 30, qp: 0.5 }),
    eq({ type: "highshelf", freq: 150, gain_db: -6, q: 0.6 }),
  ];
  const order = [1, 2, 0, 4, 3]; // where each is in REW's file (filters 1–5 as entered: PK, HP, LS Q, HS Q, L-T)
  ours.forEach((o, k) => {
    const r = rew[order[k]!]!;
    // Same bilinear transform, prewarped at the filter's frequency: equal to rounding. The
    // Linkwitz transform is prewarped at √(f0·fp) here and a little differently in REW.
    const tol = k === 3 ? 2e-9 : 1e-14;
    for (const c of ["b0", "b1", "b2", "a1", "a2"] as const) assert.ok(Math.abs(o[c] - r[c]) <= tol, `filter ${k} ${c}: ${o[c]} vs ${r[c]}`);
  });
  let worst = 0;
  for (let i = 0; i <= 400; i++) {
    const f = 10 * 2000 ** (i / 400);
    worst = Math.max(worst, Math.abs(biquadsDb(ours, f, fs) - biquadsDb(rew, f, fs)));
  }
  assert.ok(worst < 1e-4, `chain ${worst} dB`);
});

test("REW Thiele-Small: the fitter agrees with REW and with the truth", () => {
  for (const [id, c] of Object.entries<{ truth: ImpedanceParams; rew: { fs: number; qms: number; qes: number } }>(cases.rewTs)) {
    const d = parseImpedance(read(`rew-ts/${id}.zma`));
    // REW was given the coil's DC resistance; so is the fitter. The L2R2 file is fitted with the L2R2 coil.
    const fit = fitImpedance(d, c.truth.re, c.truth.l2_mh ? { inductance: "lr2" } : {});
    for (const k of ["fs", "qms", "qes"] as const) {
      assert.ok(rel(fit[k], c.rew[k]) < 0.005, `${id} ${k}: ours ${fit[k]} vs REW ${c.rew[k]}`);
      assert.ok(rel(fit[k], c.truth[k]) < 0.005, `${id} ${k}: ours ${fit[k]} vs truth ${c.truth[k]}`);
    }
  }
});

test("XSim: a passive ladder in front of a driver, response and impedance", () => {
  const rows = (p: string) =>
    read(p)
      .split(/\r?\n/)
      .filter((l) => /^\s*\d/.test(l))
      .map((l) => l.trim().split(/[\s,]+/).map(Number));
  const fr = rows("xsim/system.frd"), zm = rows("xsim/system.zma");
  const net: PassiveNetwork = { branches: [{ r: 0.3, l_mH: 2.2 }, { c_uF: 220 }, { r: 1 }, { r: 3.3, c_uF: 50 }] };
  const drv = cases.rewTs["sbg-za"].truth as ImpedanceParams;
  const deg = (z: { re: number; im: number }) => (Math.atan2(z.im, z.re) * 180) / Math.PI;
  const wrap = (d: number) => ((d + 540) % 360) - 180;
  let n = 0;
  for (let i = 0; i < fr.length; i++) {
    const [f, db, ph] = fr[i]!;
    // XSim interpolates the driver files on its own grid; below 6 Hz it extrapolates off the files' 5 Hz start.
    if (!(f! >= 6 && f! <= 20000)) continue;
    const zb = driverImpedance(drv, f!);
    const w = 2 * Math.PI * f!;
    const g = passiveBankGain(net, w, zb, 0), zi = passiveInputImpedance(net, w, zb);
    const ours = 90 + 20 * Math.log10(Math.hypot(g.re, g.im));
    if (db! > 30) {
      assert.ok(Math.abs(ours - db!) < 0.05, `${f} Hz: ${ours} vs XSim ${db} dB`);
      assert.ok(Math.abs(wrap(deg(g) - ph!)) < 0.2, `${f} Hz phase: ${deg(g)} vs XSim ${ph}`);
    }
    const [, zx, zp] = zm[i]!;
    assert.ok(rel(Math.hypot(zi.re, zi.im), zx!) < 0.001, `${f} Hz |Z|: ${Math.hypot(zi.re, zi.im)} vs XSim ${zx}`);
    assert.ok(Math.abs(wrap(deg(zi) - zp!)) < 0.05, `${f} Hz Z phase`);
    n++;
  }
  assert.ok(n > 400, `${n} points`);
});

test("FreeCAD: inside volumes of walled shapes", () => {
  const cad = JSON.parse(read("freecad/vol.json")) as Record<string, number>;
  const frustum = { kind: "frustum" as const, bottomWidth_cm: 50, bottomDepth_cm: 40, topWidth_cm: 30, topDepth_cm: 25, height_cm: 45 };
  const app: Record<string, number> = {
    box: grossVolume({ kind: "box", width_cm: 50, height_cm: 40, depth_cm: 35 }, 18),
    cylinder: grossVolume({ kind: "cylinder", diameter_cm: 40, length_cm: 60, capWall_mm: 18 }, 12),
    sphere: grossVolume({ kind: "sphere", diameter_cm: 40 }, 12),
    frustum: grossVolume(frustum, 18),
    frustum_outer: grossVolume(frustum, 0),
    wedge_outer: grossVolume({ kind: "frustum", bottomWidth_cm: 50, bottomDepth_cm: 40, topWidth_cm: 50, topDepth_cm: 20, height_cm: 45 }, 0),
    steep: grossVolume({ kind: "frustum", bottomWidth_cm: 60, bottomDepth_cm: 60, topWidth_cm: 10, topDepth_cm: 10, height_cm: 30 }, 18),
    tube: portTubeDisplacement(10, 30, 3),
  };
  for (const [k, v] of Object.entries(app)) assert.ok(rel(v, cad[k]!) < 1e-6, `${k}: ${v} vs FreeCAD ${cad[k]}`);
  // A wedge with one vertical face: the car wedge shape is exact. Entered as "Tapered (all sides)"
  // it reads 0.31 % high, since that shape splits the taper between front and back.
  const wedge = grossVolume({ kind: "wedge", width_cm: 50, height_cm: 45, topDepth_cm: 20, bottomDepth_cm: 40 }, 18);
  assert.ok(rel(wedge, cad.wedge!) < 1e-9, `wedge ${wedge} vs ${cad.wedge}`);
  const tapered = grossVolume({ kind: "frustum", bottomWidth_cm: 50, bottomDepth_cm: 40, topWidth_cm: 50, topDepth_cm: 20, height_cm: 45 }, 18);
  assert.ok(Math.abs(tapered / cad.wedge! - 1.0031) < 0.0005, `tapered ${tapered} vs ${cad.wedge}`);
});

test("WinISD: a slot vent's length is a round vent's of the same area", () => {
  const s = cases.winisdSlot;
  for (const v of s.lengths_cm) {
    const ours = portLengthForFb(s.box.vb_l, { shape: "slot", width_cm: v.width_cm, height_cm: v.height_cm, length_cm: 0 }, s.box.fb, 1, s.box.endCorrection, s.air);
    assert.ok(Math.abs(ours - v.winisd) < 0.006, `${v.width_cm}×${v.height_cm}: ${ours} vs WinISD ${v.winisd}`);
  }
  const r = s.roundCheck;
  const round = portLengthForFb(s.box.vb_l, { shape: "round", diameter_cm: r.diameter_cm, length_cm: 0 }, s.box.fb, 1, s.box.endCorrection, s.air);
  assert.ok(Math.abs(round - r.winisd) < 0.006);
  // The saved project: Shape=2, dia1 = width, dia2 = height (m), len = the vent length (m).
  const text = read("winisd/slot-40x2.5.wpr");
  assert.match(text, /\[VentRear\][^[]*Shape=2/);
  assert.match(text, /\[VentRear\][^[]*dia1=0\.4\r?\n/);
  assert.match(text, /\[VentRear\][^[]*dia2=0\.025\r?\n/);
  assert.equal(parseWpr(text).box.vb_l, 60);
});
