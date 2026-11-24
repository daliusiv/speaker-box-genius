import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, decodeState, encodeState, newDesign, type AppState, type DesignState, type ObDesign } from "../src/state.ts";
import { airLimitOf, limitsOf, portLimitOf, runDesigns, solveDriver } from "../src/sim.ts";
import { DIPOLE_SHELF_MAX_DB, dipoleEq } from "../src/dipoleEq.ts";
import { withDriver } from "../../../site/examples.ts";
import { driverLevelDb, suitsOpenBaffle, suitsOpenBaffleDsp } from "../src/boxType.ts";
const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

const ob = (frame: ObDesign["frame"]): ObDesign => ({ ...(newDesign("ob", []) as ObDesign), id: "o", name: `OB ${frame}`, on: true, frame });
const stateWith = (d: DesignState, power = 1): AppState => ({ ...DEFAULT_STATE, power, designs: [d, { ...newDesign("sealed", [d]), on: true } as DesignState] });
const run = (s: AppState, id: string) => runDesigns(s, solveDriver(s)).find((x) => !x.compare && x.design.id === id)!;

/** rms (dB) of open baffle − the same driver in a wall (one run: one frequency grid) from 2 octaves under the dipole peak to 1.25 × it. */
function gap(s: AppState) {
  const ibd = { ...newDesign("ib", []), id: "w", on: true, rear: "open" } as DesignState;
  const all = runDesigns({ ...s, baffle: { ...s.baffle, on: false }, designs: [s.designs[0]!, ibd] }, solveDriver(s)).filter((x) => !x.compare);
  const o = all.find((x) => x.design.id === "o")!, ib = all.find((x) => x.design.id === "w")!;
  // The wall run gets no EQ aimed at "o": compare against it without EQ.
  const fp = o.result.summary.ob!.fPeak;
  let sum = 0, n = 0;
  o.result.freq.forEach((f, i) => {
    const e = o.result.spl[i]! - ib.result.spl[i]!;
    if (f < fp / 4 || f > fp * 1.25 || !Number.isFinite(e)) return;
    sum += e * e;
    n++;
  });
  return Math.sqrt(sum / n);
}

for (const frame of ["flat", "h", "u"] as const) {
  test(`Dipole EQ (${frame}): a 6 dB/oct shelf and a cut at the peak, aimed at this design, bring it far closer to the same driver in a wall`, () => {
    const s = stateWith(ob(frame));
    const before = gap(s);
    const r = dipoleEq(s, solveDriver(s), "o")!;
    assert.ok(r, "an open baffle gets a Dipole EQ");
    const shelf = r.eq.find((e) => e.type === "lowshelf1")!;
    assert.ok(shelf && shelf.target === "o" && shelf.gain_db > 0 && shelf.gain_db <= DIPOLE_SHELF_MAX_DB, JSON.stringify(shelf));
    for (const e of r.eq) assert.equal(e.target, "o", "only this design");
    const after = gap({ ...s, eq: r.eq });
    assert.ok(after < before * 0.6, `${frame}: rms ${before.toFixed(2)} → ${after.toFixed(2)} dB`);
    if (frame === "flat") {
      const cut = r.eq.find((e) => e.type === "peak")!;
      const fPeak = run(s, "o").result.summary.ob!.fPeak;
      assert.ok(cut && cut.gain_db < -3 && Math.abs(cut.freq / fPeak - 1) < 0.15, JSON.stringify(cut));
    }
    assert.match(r.note, /^Dipole EQ for OB /);
    // Added again: replaces itself, never stacks.
    const again = dipoleEq({ ...s, eq: r.eq }, solveDriver(s), "o")!;
    assert.equal(again.eq.length, r.eq.length);
  });
}

test("Dipole EQ is fitted to the limits: when the full shelf would pass Xmax it is cut back until the design is within it", () => {
  // A drive that leaves the bare open baffle at 60 % of Xmax: +12 dB of shelf would be 4 × that.
  const one = stateWith(ob("flat"));
  const peak = (s: AppState) => Math.max(...run(s, "o").result.excursionMm.filter(Number.isFinite));
  const power = one.power * (0.6 / (peak(one) / one.xmax_mm)) ** 2;
  const s = { ...one, power };
  const free = dipoleEq(one, solveDriver(one), "o")!;
  const r = dipoleEq(s, solveDriver(s), "o")!;
  const sh = (x: typeof r) => x.eq.find((e) => e.type === "lowshelf1")!.gain_db;
  assert.ok(sh(r) < sh(free), `${sh(r)} < ${sh(free)}`);
  assert.match(r.note, /cut from/);
  // Judged as the app judges it (limitsOf: the checked band, as "Cut to …" uses).
  const after = run({ ...s, eq: r.eq }, "o").result;
  // Within the limits as the app judges them: no warning from the EQ.
  assert.deepEqual(limitsOf(after, s.xmax_mm, s.highPass.on, portLimitOf(s), airLimitOf(s)).over, []);
});

test("Dipole EQ never leaves a design over its limits: RSS315HF-4 on 45 × 100 cm at 100 W", () => {
  const s0 = withDriver({ ...DEFAULT_STATE, power: 100, baffle: { ...DEFAULT_STATE.baffle, on: false } }, "dayton-audio/rss315hf-4");
  const s = { ...s0, designs: [ob("flat")] };
  const r = dipoleEq(s, solveDriver(s), "o")!;
  const after = run({ ...s, eq: r.eq }, "o").result;
  assert.deepEqual(limitsOf(after, s.xmax_mm, s.highPass.on, portLimitOf(s), airLimitOf(s)).over, []);
  assert.match(r.note, /cut from/);
});

test("Dipole EQ: other designs and kinds get none; the shelf survives a link", () => {
  const s = stateWith(ob("flat"));
  const sealed = s.designs[1]!.id;
  assert.equal(dipoleEq(s, solveDriver(s), sealed), null);
  const r = dipoleEq(s, solveDriver(s), "o")!;
  const back = decodeState(encodeState({ ...s, eq: r.eq }))!;
  assert.deepEqual(back.eq.map((e) => e.type), r.eq.map((e) => e.type));
});

test("picker Suits → Open baffle: passive by the driver's own level at 40 Hz (Fs and Qts) ≥ −2 dB; with DSP Qts ≥ 0.35, Xmax ≥ 8 mm and Fs ≤ 45 Hz", () => {
  // The open baffle guide's drivers: Twiggy12 (Qts 1.08, Fs 30: +1.7 dB) passes; FSL-1520R02-08 (0.70, 43 Hz:
  // −3.8 dB) and RSS390HF-4 (0.43, 19.5 Hz: −2.7 dB) don't; Qts alone isn't enough.
  assert.equal(suitsOpenBaffle({ qts: 1.08, fs: 30 }), true);
  assert.equal(suitsOpenBaffle({ qts: 0.71, fs: 25 }), true);
  assert.equal(suitsOpenBaffle({ qts: 0.7, fs: 43 }), false);
  assert.equal(suitsOpenBaffle({ qts: 0.43, fs: 19.5 }), false);
  assert.equal(suitsOpenBaffle({ qts: 0.9 }), false, "no Fs, no verdict");
  near(driverLevelDb(30, 30, 1.08), 20 * Math.log10(1.08), 1e-9, "at Fs the level is Qts");
  near(driverLevelDb(40, 43, 0.7), -3.8, 0.05, "FSL-1520R02-08 at 40 Hz");
  assert.equal(suitsOpenBaffleDsp({ qts: 0.4, xmax_mm: 10, fs: 30 }), true);
  assert.equal(suitsOpenBaffleDsp({ qts: 0.4, xmax_mm: 6, fs: 30 }), false);
  assert.equal(suitsOpenBaffleDsp({ qts: 0.4, xmax_mm: 10, fs: 50 }), false);
  assert.equal(suitsOpenBaffleDsp({ qts: 0.3, xmax_mm: 10, fs: 30 }), false);
});

test("Dipole EQ on a board already past Xmax with no EQ: the note says so and gives the drive that lets the shelf be fitted", () => {
  // A Qts 0.70, 6 mm Xmax 15″ at 100 W on the default board passes Xmax bare.
  const s0 = withDriver({ ...DEFAULT_STATE, power: 100, baffle: { ...DEFAULT_STATE.baffle, on: false } }, "peerless/fsl-1520r02-08");
  const s = { ...s0, designs: [ob("flat")] };
  const bare = limitsOf(run(s, "o").result, s.xmax_mm, s.highPass.on, portLimitOf(s), airLimitOf(s));
  assert.deepEqual(bare.over, ["xmax"]);
  const r = dipoleEq(s, solveDriver(s), "o")!;
  assert.match(r.note, /At 100 W the board is already past Xmax without EQ, so the shelf isn't fitted to the limits: set the drive below \d+ W and add the Dipole EQ again\.$/);
  // At the drive it names, adding it again fits the shelf and leaves the design within the limits.
  const w = Number(/below (\d+) W/.exec(r.note)![1]);
  const lower = { ...s, power: w };
  const again = dipoleEq(lower, solveDriver(lower), "o")!;
  assert.doesNotMatch(again.note, /already past/);
  assert.deepEqual(limitsOf(run({ ...lower, eq: again.eq }, "o").result, lower.xmax_mm, lower.highPass.on, portLimitOf(lower), airLimitOf(lower)).over, []);
});

test("response chart: an open baffle is drawn free-standing, not in half space", async () => {
  const { responseChart, spaceOf } = await import("../src/chartProps.ts");
  const s = { ...stateWith(ob("flat")), designs: [ob("flat")] };
  const designs = runDesigns(s, solveDriver(s));
  const c = responseChart({ state: s, designs } as Parameters<typeof responseChart>[0], "absolute");
  assert.match(c.title, /1 m, free-standing \(open baffle\)/);
  assert.match(c.detail!, /1 m, free-standing/);
  const ib = { ...newDesign("ib", []), id: "w", on: true, rear: "open" } as DesignState;
  assert.equal(spaceOf([{ design: ob("flat") }, { design: ib }], true), "half space (open baffles free-standing)");
  assert.equal(spaceOf([{ design: ib }], false), "half space");
});
