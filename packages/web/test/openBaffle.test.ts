import { test } from "node:test";
import assert from "node:assert/strict";
import { openBaffleFrequencies, simulate } from "@sbg/engine";
import { DEFAULT_STATE, decodeState, encodeState, newDesign, type AppState, type ObDesign } from "../src/state.ts";
import { airOf, driverInputOf, enclosureOf, runDesigns, simOptionsOf, solveDriver } from "../src/sim.ts";
import { wprExportable, wprFor } from "../src/wprExport.ts";
import { spiceExportable, spiceFor } from "../src/spiceExport.ts";
import { hornrespBoxKind } from "../src/hornrespBox.ts";
import { sizeAllForDriver } from "../src/presets.ts";
import { KIND_COLORS } from "../src/palette.ts";

// Open baffle box type: state, share links, the engine input, the simulation and the exports.

const designs = DEFAULT_STATE.designs;
const ob = (patch: Partial<ObDesign> = {}): ObDesign => ({ ...(newDesign("ob", designs) as ObDesign), ...patch });
const withDesigns = (...ds: AppState["designs"]): AppState => ({ ...DEFAULT_STATE, designs: ds });
const losses = DEFAULT_STATE.settings.losses;

test("a new open baffle is a flat 45 × 100 cm board, the driver centred and 35 cm up, amber", () => {
  const d = ob();
  assert.equal(d.kind, "ob");
  assert.equal(d.name, "Open baffle");
  assert.deepEqual([d.frame, d.w_cm, d.h_cm, d.x_cm, d.y_cm, d.t_cm, d.depth_cm], ["flat", 45, 100, 22.5, 35, 1.8, 30]);
  assert.equal(KIND_COLORS.ob[0], "#f59e0b");
});

test("engine input: the board's sizes; a frame adds its depth", () => {
  assert.deepEqual(enclosureOf(ob(), 0, losses), { kind: "open-baffle", frame: "flat", w_cm: 45, h_cm: 100, x_cm: 22.5, y_cm: 35, t_cm: 1.8 });
  assert.deepEqual(enclosureOf(ob({ frame: "u", depth_cm: 40 }), 0, losses), { kind: "open-baffle", frame: "u", w_cm: 45, h_cm: 100, x_cm: 22.5, y_cm: 35, t_cm: 1.8, depth_cm: 40 });
});

test("share links keep every frame and size; bad values are made usable", () => {
  for (const d of [ob(), ob({ frame: "h", w_cm: 60, h_cm: 120, x_cm: 25, y_cm: 40, t_cm: 2.5, depth_cm: 45 }), ob({ frame: "u", depth_cm: 25 })]) {
    const back = decodeState(encodeState(withDesigns(d)));
    assert.ok(back);
    const got = back.designs.find((x) => x.kind === "ob") as ObDesign;
    assert.deepEqual([got.frame, got.w_cm, got.h_cm, got.x_cm, got.y_cm, got.t_cm, got.depth_cm], [d.frame, d.w_cm, d.h_cm, d.x_cm, d.y_cm, d.t_cm, d.depth_cm]);
  }
  const odd = { ...ob(), frame: "w", x_cm: 80, y_cm: -5, depth_cm: 1 } as unknown as ObDesign;
  const got = decodeState(encodeState(withDesigns(odd)))!.designs.find((x) => x.kind === "ob") as ObDesign;
  assert.equal(got.frame, "flat");
  assert.ok(got.x_cm > 0 && got.x_cm < got.w_cm, "driver back on the board (width)");
  assert.ok(got.y_cm > 0 && got.y_cm < got.h_cm, "driver back on the board (height)");
  assert.ok(got.depth_cm > got.t_cm, "a frame deeper than its walls");
});

test("the app simulates an open baffle (no box volume) as the engine does, in full space, without the baffle step", () => {
  const d = ob({ frame: "u" });
  const s: AppState = { ...withDesigns(d), baffle: { ...DEFAULT_STATE.baffle, on: true } };
  const solved = solveDriver(s);
  const [r] = runDesigns(s, solved);
  assert.ok(r, "an open baffle is simulated even though it has no volume");
  assert.ok(r.result.spl.every(Number.isFinite));
  const opts = simOptionsOf(s);
  assert.equal(opts.fMax, 1000, "charts reach 1 kHz to show the dipole peak and null");
  const own = simulate(driverInputOf(s, solved), enclosureOf(d, 0, losses), { ...opts, eq: [] });
  r.result.spl.forEach((v, i) => assert.ok(Math.abs(v - own.spl[i]!) < 1e-9, "no baffle step added on top"));
  // A U-frame's front source is the cone: its numbers depend on the cone's size.
  assert.deepEqual(r.result.summary.ob, openBaffleFrequencies(enclosureOf(d, 0, losses) as Parameters<typeof openBaffleFrequencies>[0], airOf(s), driverInputOf(s, solved).sd_cm2 / 1e4));
});

test("a flat board's readouts come from the engine's edge-diffraction model with the driver's cone", () => {
  const d = ob();
  const s = withDesigns(d);
  const solved = solveDriver(s);
  const [r] = runDesigns(s, solved);
  const sd = (driverInputOf(s, solved).sd_cm2 ?? 0) / 1e4;
  const fr = openBaffleFrequencies(enclosureOf(d, 0, losses) as Parameters<typeof openBaffleFrequencies>[0], airOf(s), sd);
  assert.deepEqual(r!.result.summary.ob, fr);
  // 45 × 100 cm, driver centred across and 35 cm up: BEM gives 40.1 cm for a small cone.
  assert.ok(fr.d_m > 0.36 && fr.d_m < 0.44, `D ${fr.d_m}`); // an 18 mm board's path is a few cm longer than a thin one's
  assert.ok(fr.fNull > fr.fPeak);
});

test("Size all leaves an open baffle alone, without a message", () => {
  const out = sizeAllForDriver(withDesigns(ob()));
  assert.deepEqual(out.changed, []);
  assert.deepEqual(out.skipped, []);
});

test("exports: WinISD, SPICE and Hornresp leave an open baffle out and say why", () => {
  assert.equal(wprExportable(ob()), false);
  assert.match(wprFor(withDesigns(ob()), ob()) as string, /WinISD can't open an open baffle/);
  assert.equal(spiceExportable(ob()), false);
  assert.match(spiceFor(withDesigns(ob()), ob(), "https://example.invalid/") as string, /not open baffles/);
  assert.equal(hornrespBoxKind(ob()), false);
});
