import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, newDesign, type AppState, type DesignState } from "../src/state.ts";
import { actingFactor, builtVbOf, enclosureOf, enclosureOptsOf, lossesFor, vbOf } from "../src/sim.ts";
import { qaGain, stuffFactor } from "../src/stuffing.ts";

const near = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const withSettings = (s: AppState, p: Record<string, unknown>, qa?: number): AppState => ({
  ...s,
  settings: { ...s.settings, ...p, ...(qa === undefined ? {} : { losses: { ...s.settings.losses, qa } }) },
});
const mk = (kind: "sealed" | "vented" | "pr" | "bandpass", extra: Record<string, unknown> = {}): DesignState =>
  ({ ...newDesign(kind, []), vb_l: 500, ...extra }) as DesignState;
const stateOf = (designs: DesignState[], p: Record<string, unknown> = {}, qa?: number): AppState => withSettings({ ...DEFAULT_STATE, designs }, p, qa);

test("qaGain matches VituixCAD's measured volume gain", () => {
  near(qaGain(2), 1.4823, 1e-4);
  near(qaGain(10), 1.1133, 1e-4);
  near(qaGain(100), 1.014268, 1e-5);
  near(qaGain(1000), 1.0018, 1e-4);
  assert.equal(qaGain(Infinity), 1);
});

test("VituixCAD Info readings: 500 l typed", () => {
  const d = mk("sealed");
  for (const [qa, want] of [[5, 605.7], [50, 513.3], [500, 501.7]] as const) {
    near(vbOf(stateOf([d], { qaVolume: true }, qa), d), want, 0.06);
  }
});

test("qaVolume off: vbOf is built volume x stuffing factor, bit-identical", () => {
  for (const kind of ["sealed", "vented", "pr"] as const) {
    for (const stuffing of [undefined, { mode: "custom", gain_pct: 12, qa: 8 }] as const) {
      const d = mk(kind, stuffing ? { stuffing } : {});
      const s = stateOf([d], { qaVolume: false });
      assert.equal(vbOf(s, d), builtVbOf(s, d) * stuffFactor(d));
    }
  }
});

test("a stuffed design counts only its stuffing", () => {
  const d = mk("sealed", { stuffing: { mode: "custom", gain_pct: 12, qa: 8 } });
  const s = stateOf([d], { qaVolume: true });
  assert.equal(actingFactor(s, d), stuffFactor(d));
  assert.equal(stuffFactor(d), 1.12);
});

test("bandpass chambers scale by their own Qa gain, only with qaVolume", () => {
  const d = mk("bandpass") as Extract<DesignState, { kind: "bandpass" }>;
  const s = stateOf([d]);
  const losses = lossesFor(s, d);
  const off = enclosureOf(d, d.vb_l, losses, 18) as any;
  const on = enclosureOf(d, d.vb_l, losses, 18, undefined, { qaVolume: true }) as any;
  const g = qaGain(losses.qa);
  assert.ok(g > 1);
  near(on.rear.vb_l, off.rear.vb_l * g, 1e-9);
  near(on.front.vb_l, off.front.vb_l * g, 1e-9);
  assert.equal(off.rear.vb_l, d.vb_l);
  assert.equal(off.front.vb_l, d.frontVb_l);
});

test("ventPlacement portLength delays a side-by-side vented port by its physical length (VituixCAD)", () => {
  const v = mk("vented", { shape: "round", diameter_cm: 7, length_cm: 19.6, flare_cm: 0, count: 1 }) as any;
  const pr = mk("pr");
  const s = stateOf([v, pr], { ventPlacement: "portLength", endCorrection: 0.85 });
  const opts = enclosureOptsOf(s);
  const enc = (d: DesignState) => enclosureOf(d, d.vb_l, lossesFor(s, d), 18, undefined, opts) as any;
  near(enc(v).ventDistance_cm, 19.6, 1e-9);
  near(enc({ ...v, ventAt: "custom", ventDistance_cm: 10 }).ventDistance_cm, 10, 1e-12);
  // (a PR gets the driver/PR spacing instead: next test)
});

test("default state: enclosures are unchanged", () => {
  const s = DEFAULT_STATE;
  const opts = enclosureOptsOf(s);
  for (const d of s.designs) {
    const a = enclosureOf(d, vbOf(s, d), lossesFor(s, d), 18, s.volume);
    const b = enclosureOf(d, vbOf(s, d), lossesFor(s, d), 18, s.volume, opts);
    assert.deepEqual(b, a);
    assert.equal((b as any).ventDistance_cm, undefined);
    assert.equal(vbOf(s, d), builtVbOf(s, d) * stuffFactor(d));
  }
});

test("ventPlacement portLength delays a side-by-side PR by the driver/PR centre spacing (VituixCAD)", () => {
  const pr = mk("pr", { params: { mms_g: 46, sd_cm2: 200, xmax_mm: 12, qms: 10, vas_l: 214 }, extra: [] }) as any;
  const s = stateOf([pr], { ventPlacement: "portLength", endCorrection: 0.85 });
  const s500 = { ...s, ts: { ...s.ts, sd_cm2: 500 } };
  const enc = (st: AppState, d: DesignState) => enclosureOf(d, d.vb_l, lossesFor(st, d), 18, undefined, enclosureOptsOf(st)) as any;
  near(enc(s500, pr).ventDistance_cm, 20.595, 0.005); // 12.616 + 7.979 (the brief's 20.61 was a rounding slip)
  near(enc(s500, { ...pr, ventAt: "custom", ventDistance_cm: 10 }).ventDistance_cm, 10, 1e-12);
  const own = { ...s500, settings: { ...s500.settings, ventPlacement: "own" } } as AppState;
  assert.equal(enc(own, pr).ventDistance_cm, undefined);
  const bad = { ...s500, ts: { ...s500.ts, sd_cm2: 0 } };
  assert.equal(enc(bad, pr).ventDistance_cm, undefined);
});
