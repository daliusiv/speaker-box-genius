// End to end: the "vituixcad" compat preset on an app state gives VituixCAD 3's Enclosure-tool readings.
// Driver "SBG Q45", 2.83 V, Rg 0, end correction 0.85. Volumes are as typed in VituixCAD.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, newDesign, type AppState, type DesignState } from "../src/state.ts";
import { withCompat } from "../src/compat.ts";
import { enclosureOf, enclosureOptsOf, driverInputOf, lossesFor, simOptionsOf, solveDriver, vbOf } from "../src/sim.ts";
import { simulate } from "@sbg/engine";

const near = (name: string, a: number | null | undefined, want: number, tol: number) =>
  assert.ok(a != null && Math.abs(a - want) <= tol, `${name}: got ${a}, want ${want} +-${tol}`);

const base = (preset: "default" | "vituixcad", ql: number, qa: number, qp: number): AppState => {
  const s: AppState = {
    ...DEFAULT_STATE,
    ts: { fs: 30, qms: 5, qes: 0.45, vas_l: 50, re: 6, sd_cm2: 500 },
    le_mh: 0,
    drive: "volts",
    volts: 2.83,
    drivers: 1,
    designs: [],
  };
  return { ...s, settings: { ...withCompat(s.settings, preset), rg: 0, endCorrection: 0.85, losses: { ql, qa, qp } } };
};
const sealed = (s: AppState, vb_l: number): AppState => ({ ...s, designs: [{ ...newDesign("sealed", []), id: "d", vb_l } as DesignState] });
const vented = (s: AppState, vb_l: number, d_cm: number, len_cm: number): AppState => ({
  ...s,
  designs: [{ ...newDesign("vented", []), id: "d", vb_l, shape: "round", diameter_cm: d_cm, length_cm: len_cm, flare_cm: 0, count: 1 } as DesignState],
});

function run(s: AppState) {
  const d = s.designs[0]!;
  const solved = solveDriver(s);
  const vb = vbOf(s, d);
  const opts = { ...simOptionsOf(s), fMin: 5, fMax: 500, points: 2000 };
  const r = simulate(driverInputOf(s, solved), enclosureOf(d, vb, lossesFor(s, d), s.volume.wall_mm, s.volume, enclosureOptsOf(s)), opts);
  const maxAbove = (a: Float64Array, f0: number) => a.reduce((m, v, i) => (r.freq[i]! > f0 ? Math.max(m, v) : m), -Infinity);
  const gd = r.groupDelayMs;
  let gi = -1;
  for (let i = 0; i < gd.length; i++) if (r.freq[i]! > 10 && (gi < 0 || gd[i]! > gd[gi]!)) gi = i;
  // Lower impedance peak: the first local maximum above 8 Hz.
  let zi = -1;
  for (let i = 1; i < r.freq.length - 1; i++) {
    if (r.freq[i]! > 8 && r.impedanceOhm[i]! >= r.impedanceOhm[i - 1]! && r.impedanceOhm[i]! >= r.impedanceOhm[i + 1]!) { zi = i; break; }
  }
  return {
    vb,
    f3: r.summary.f3, f6: r.summary.f6, f10: r.summary.f10,
    gd: gd[gi]!, gdF: r.freq[gi]!,
    v: r.portVelocity ? maxAbove(r.portVelocity, 0) : NaN,
    z: zi >= 0 ? r.impedanceOhm[zi]! : NaN, zF: zi >= 0 ? r.freq[zi]! : NaN,
  };
}

const F = (name: string, r: ReturnType<typeof run>, f: [number, number, number], tol: [number, number, number]) => {
  near(`${name} f3`, r.f3, f[0], tol[0]);
  near(`${name} f6`, r.f6, f[1], tol[1]);
  near(`${name} f10`, r.f10, f[2], tol[2]);
};

test("1: sealed 20 l, Qa 1000, QL 1000", () => {
  const r = run(sealed(base("vituixcad", 1000, 1000, 1000), 20));
  near("vb", r.vb, 20.04, 0.05);
  F("c1", r, [52.6, 41.2, 31.7], [0.3, 0.3, 0.3]);
});

test("2: sealed 20 l, Qa 100, QL 7", () => {
  const r = run(sealed(base("vituixcad", 7, 100, 1000), 20));
  near("vb", r.vb, 20.3, 0.05);
  F("c2", r, [56.6, 43.6, 33.6], [0.5, 0.35, 0.35]);
  near("Zmax", r.z, 39.4, 39.4 * 0.015);
});

test("3: vented 50 l, all Q 1000, port 7 x 19.6", () => {
  const r = run(vented(base("vituixcad", 1000, 1000, 1000), 50, 7, 19.6));
  F("c3", r, [27.9, 25.2, 22.8], [0.3, 0.3, 0.3]);
  near("GDmax", r.gd, 25.6, 0.15);
  near("GDmax f", r.gdF, 28.7, 0.5);
  near("port speed", r.v, 5.3, 0.1);
  near("Zmax", r.z, 71.2, 71.2 * 0.01);
  near("Zmax f", r.zF, 18.6, 0.2);
});

test("4: vented 50 l, Qa 100, QL 7, Qp 100, port 7 x 19.3", () => {
  const r = run(vented(base("vituixcad", 7, 100, 100), 50, 7, 19.3));
  near("vb", r.vb, 50.7, 0.05);
  F("c4", r, [29.5, 25.9, 22.4], [0.3, 0.3, 0.3]);
  near("GDmax", r.gd, 19.5, 0.2);
  near("Zmax", r.z, 42.1, 42.1 * 0.015);
});

test("5: group delay at Fb 30 for other ports", () => {
  const b = base("vituixcad", 1000, 1000, 1000);
  for (const [d, l, want] of [[3, 2.1, 26.1], [5, 8.8, 25.9], [10, 43.7, 24.8]] as const) {
    near(`GDmax port ${d}x${l}`, run(vented(b, 50, d, l)).gd, want, 0.15);
  }
});

test("6: vented 10 l, port 7 x 12", () => {
  near("GDmax", run(vented(base("vituixcad", 1000, 1000, 1000), 10, 7, 12)).gd, 11.9, 0.15);
});

test("7: Qa volume, closed 500 l typed", () => {
  const want = { 2: 741.1, 5: 605.7, 10: 556.7, 20: 530.4, 50: 513.3, 100: 507.1, 200: 503.8, 500: 501.7, 1000: 500.9 } as const;
  for (const [qa, w] of Object.entries(want)) {
    const s = sealed(base("vituixcad", 1000, Number(qa), 1000), 500);
    near(`vb Qa ${qa}`, vbOf(s, s.designs[0]!), w, 0.06);
  }
});

test("8: the default preset gives the larger, co-located group delay on case 3", () => {
  const r = run(vented(base("default", 1000, 1000, 1000), 50, 7, 19.6));
  assert.ok(r.gd > 26.1 && r.gd < 26.6, `GDmax ${r.gd}`);
  const v = run(vented(base("vituixcad", 1000, 1000, 1000), 50, 7, 19.6));
  assert.ok(r.gd - v.gd > 0.4, `${r.gd} vs ${v.gd}`);
});

// Passive radiators, 40 l / 10 l: PR Vas 214 l, Qms 10, xmax 12. Group delay is the max above 20 Hz (40 Hz for 10 l).
const prBox = (s: AppState, vb_l: number, sd: number, mms: number, count: number): AppState => ({
  ...s,
  designs: [{ ...newDesign("pr", []), id: "d", vb_l, count, addedMass_g: 0, extra: [], params: { mms_g: mms, sd_cm2: sd, qms: 10, vas_l: 214, xmax_mm: 12 } } as DesignState],
});
function runPr(s: AppState, gdFrom: number) {
  const d = s.designs[0]!;
  const solved = solveDriver(s);
  const opts = { ...simOptionsOf(s), fMin: 5, fMax: 500, points: 2000 };
  const r = simulate(driverInputOf(s, solved), enclosureOf(d, vbOf(s, d), lossesFor(s, d), s.volume.wall_mm, s.volume, enclosureOptsOf(s)), opts);
  let gi = -1;
  for (let i = 0; i < r.freq.length; i++) if (r.freq[i]! > gdFrom && (gi < 0 || r.groupDelayMs[i]! > r.groupDelayMs[gi]!)) gi = i;
  let zi = -1;
  for (let i = 0; i < r.freq.length; i++) if (r.freq[i]! > 20 && (zi < 0 || r.impedanceOhm[i]! > r.impedanceOhm[zi]!)) zi = i;
  return { f3: r.summary.f3, f6: r.summary.f6, f10: r.summary.f10, gd: r.groupDelayMs[gi]!, gdF: r.freq[gi]!, z: r.impedanceOhm[zi]!, zF: r.freq[zi]! };
}
const prCase = (name: string, vb: number, sd: number, mms: number, n: number, gdFrom: number, gd: number, gdF: number, f: [number, number, number]) => {
  const r = runPr(prBox(base("vituixcad", 1000, 1000, 1000), vb, sd, mms, n), gdFrom);
  near(`${name} GDmax`, r.gd, gd, 0.12);
  near(`${name} GDmax f`, r.gdF, gdF, 1.5);
  near(`${name} f3`, r.f3, f[0], 0.4);
  near(`${name} f6`, r.f6, f[1], 0.4);
  near(`${name} f10`, r.f10, f[2], 0.4);
  return r;
};

test("9: PR 40 l, Sd 200 / 46 g, 1 PR", () => { prCase("9a", 40, 200, 46, 1, 20, 22.9, 27.9, [30, 26.7, 24.1]); });
test("10: PR 40 l, Sd 800 / 736 g, 1 PR", () => { prCase("9b", 40, 800, 736, 1, 20, 22.5, 28.3, [30, 26.7, 24.1]); });
test("11: PR 40 l, Sd 200 / 46 g, 2 PRs", () => {
  const r = prCase("9c", 40, 200, 46, 2, 20, 21.1, 43, [40.6, 37.2, 33.6]);
  near("Zmax", r.z, 62.2, 62.2 * 0.015);
  near("Zmax f", r.zF, 56.6, 1.5);
});
test("12: PR 10 l, Sd 200 / 46 g, 1 PR", () => { prCase("9d", 10, 200, 46, 1, 40, 8.2, 80, [71.3, 63.5, 55]); });
