import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, newDesign, ROOM_PRESETS, type AppState, type BandpassDesign, type SealedDesign } from "../src/state.ts";
import { runDesigns, solveDriver } from "../src/sim.ts";
import { relRefOf } from "../src/chartProps.ts";

const run = (s: AppState) => runDesigns(s, solveDriver(s));
const sealed = (vb_l: number): AppState => ({ ...DEFAULT_STATE, designs: [{ ...(newDesign("sealed", []) as SealedDesign), id: "s", vb_l }] });
const withPeak = (s: AppState): AppState => ({ ...s, settings: { ...s.settings, f3From: "peak" } });

test("passband mode: relRefOf is the reference level and F3 is unchanged by an explicit passband setting", () => {
  const s = sealed(40);
  const a = run(s);
  const b = run({ ...s, settings: { ...s.settings, f3From: "passband" } });
  for (const [i, d] of a.entries()) {
    assert.equal(relRefOf(d.result), d.result.summary.referenceSpl);
    assert.equal(d.result.summary.f3, b[i]!.result.summary.f3);
  }
});

test("peak mode: a small sealed box's bass peak is the 0 dB of the relative curve and F3 moves up", () => {
  const s = sealed(3);
  const pass = run(s)[0]!;
  const peak = run(withPeak(s))[0]!;
  const r = peak.result;
  const fc = r.summary.fc ?? 100;
  let mx = -Infinity;
  for (let i = 0; i < r.freq.length; i++) if (r.freq[i]! <= 5 * fc) mx = Math.max(mx, r.spl[i]! - relRefOf(r));
  assert.ok(Math.abs(mx) < 0.01, `max ${mx}`);
  assert.ok(peak.result.summary.f3! > pass.result.summary.f3!, `${peak.result.summary.f3} vs ${pass.result.summary.f3}`);
});

test("peak mode in the car: F3 in the car is finite and not pinned at the bottom", () => {
  const car: AppState = withPeak({ ...sealed(3), roomGain: { ...DEFAULT_STATE.roomGain, mode: "car", ...ROOM_PRESETS.car } });
  const d = run(car)[0]!;
  assert.ok(d.f3Room != null && Number.isFinite(d.f3Room) && d.f3Room > 15, `${d.f3Room}`);
});

test("bandpass: the reference is the band peak in both modes", () => {
  const s: AppState = { ...DEFAULT_STATE, designs: [{ ...(newDesign("bandpass", []) as BandpassDesign), id: "b", order: "4", vb_l: 30, frontVb_l: 30 }] };
  for (const x of [s, withPeak(s)]) {
    const r = run(x)[0]!.result;
    assert.ok(r.summary.bandPeakSpl != null);
    assert.equal(relRefOf(r), r.summary.bandPeakSpl);
  }
});

test("relative response chart keeps +6 dB headroom in peak mode", async () => {
  const { responseChart } = await import("../src/chartProps.ts");
  const designs = run(withPeak(sealed(3)));
  const c = responseChart({ state: withPeak(sealed(3)), designs } as never, "relative");
  assert.ok((c.yMax ?? 0) >= 6, `${c.yMax}`);
});

test("side-by-side ghost only for a placed port, not the VituixCAD port-sound delay", async () => {
  const { responseChart } = await import("../src/chartProps.ts");
  const { withCompat } = await import("../src/compat.ts");
  const mk = (extra: object): AppState => {
    const s = { ...DEFAULT_STATE, designs: [{ ...newDesign("pr", []), id: "p", ...extra } as never] } as AppState;
    return { ...s, settings: withCompat(s.settings, "vituixcad") };
  };
  const labels = (s: AppState) => responseChart({ state: s, designs: run(s) } as never, "absolute").series.map((x) => x.label);
  assert.ok(!labels(mk({})).some((l) => l.includes("· side by side")));
  assert.ok(labels(mk({ ventAt: "custom", ventDistance_cm: 30 })).some((l) => l.includes("· side by side")));
});
