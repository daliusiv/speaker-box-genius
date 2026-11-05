import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, newDesign, decodeState, decodeStateAny, encodeState, encodeStateShort, type AppState, type DesignState } from "../src/state.ts";
import { builtVbOf, lossesFor, runDesigns, solveDriver, vbOf } from "../src/sim.ts";
import { sizeAllForDriver } from "../src/presets.ts";
import { fillGrams, stuffFactor, stuffingEffect, stuffingFrom, stuffingInstruction, type Stuffing } from "../src/stuffing.ts";

const fill = (gL: number): Stuffing => ({ mode: "fill", gL, gain_pct: 20, qa: 30 });

test("fill: typical gain and Qa follow the guide (sealed bigger gain, ported more loss, overstuffed goes backwards)", () => {
  // Sealed 16–24 g/L: about +20 %, Qa 20–30 (guide: plan on 15–25 %, Qa 20–50).
  for (const gL of [16, 20, 24]) {
    const e = stuffingEffect(fill(gL), "sealed");
    assert.ok(e.gain_pct >= 15 && e.gain_pct <= 25, `${gL} g/L: ${e.gain_pct} %`);
    assert.ok(e.qa! >= 20 && e.qa! <= 50, `${gL} g/L: Qa ${e.qa}`);
  }
  // Ported filled: +10–20 %, Qa 10–20.
  const v = stuffingEffect(fill(16), "vented");
  assert.ok(v.gain_pct >= 10 && v.gain_pct <= 20 && v.qa! >= 10 && v.qa! <= 20, JSON.stringify(v));
  assert.deepEqual(stuffingEffect(fill(16), "pr"), v);
  // More fill past the best amount gains less, and packed fill acts smaller than empty.
  assert.ok(stuffingEffect(fill(36), "sealed").gain_pct < stuffingEffect(fill(24), "sealed").gain_pct);
  assert.ok(stuffingEffect(fill(50), "sealed").gain_pct < 0);
  // Never past the physical ceiling of +40 %.
  for (let g = 0; g <= 80; g += 2) assert.ok(stuffingEffect(fill(g), "sealed").gain_pct < 40);
  // Lined: no gain, Qa 50. None: nothing.
  assert.deepEqual(stuffingEffect({ ...fill(0), mode: "lined" }, "vented"), { gain_pct: 0, qa: 50 });
  assert.deepEqual(stuffingEffect(undefined, "sealed"), { gain_pct: 0, qa: null });
  assert.deepEqual(stuffingEffect({ mode: "custom", gL: 0, gain_pct: 25, qa: 20 }, "sealed"), { gain_pct: 25, qa: 20 });
});

test("fill weight: grams per litre times the net volume, and the build-sheet line", () => {
  assert.equal(fillGrams(fill(16), 28), 448);
  assert.equal(fillGrams({ ...fill(16), mode: "lined" }, 28), null);
  const line = stuffingInstruction(fill(16), "vented", 28)!;
  assert.match(line, /about 450 g \(0\.99 lb\)/);
  assert.match(line, /1\.00 lb\/ft³/);
  assert.match(line, /port/);
  assert.equal(stuffingInstruction(undefined, "sealed", 28), null);
});

test("stuffing from links: malformed values are fixed, unknown modes dropped", () => {
  assert.equal(stuffingFrom({ mode: "none" }), undefined);
  assert.equal(stuffingFrom("fill"), undefined);
  assert.deepEqual(stuffingFrom({ mode: "custom", gain_pct: 90, qa: -3 }), { mode: "custom", gL: 16, gain_pct: 40, qa: 1 });
});

function stuffed(): AppState {
  const d = DEFAULT_STATE;
  const designs = d.designs.map((x) =>
    x.kind === "sealed" ? { ...x, stuffing: fill(20) } : x.kind === "vented" ? { ...x, stuffing: { ...fill(0), mode: "lined" as const } } : x,
  );
  return { ...d, designs };
}

test("a stuffed design simulates as the same box at its acting volume with the stuffing's Qa", () => {
  const s = stuffed();
  const sealed = s.designs[0]!;
  const e = stuffingEffect(sealed.stuffing, "sealed");
  assert.equal(builtVbOf(s, sealed), sealed.vb_l);
  assert.ok(Math.abs(vbOf(s, sealed) - sealed.vb_l * (1 + e.gain_pct / 100)) < 1e-9);
  assert.equal(lossesFor(s, sealed).qa, e.qa);
  assert.equal(lossesFor(s, s.designs[1]!).qa, 50);
  assert.equal(lossesFor(s, s.designs[2]!).qa, s.settings.losses.qa);

  // The old way: a bigger box and Settings' Qa.
  const old: AppState = {
    ...s,
    settings: { ...s.settings, losses: { ...s.settings.losses, qa: e.qa! } },
    designs: [{ ...sealed, stuffing: undefined, vb_l: vbOf(s, sealed) }],
  };
  const a = runDesigns(s, solveDriver(s)).find((x) => x.design.id === sealed.id)!;
  const b = runDesigns(old, solveDriver(old))[0]!;
  assert.deepEqual([...a.result.spl], [...b.result.spl]);
  assert.equal(a.vb_l, sealed.vb_l);
  assert.ok(a.acting_l! > a.vb_l);
});

test("presets size a stuffed box to act as the alignment's volume", () => {
  const s = stuffed();
  const plain = sizeAllForDriver(DEFAULT_STATE).state.designs[0]!;
  const sized = sizeAllForDriver(s).state;
  const d = sized.designs[0]!;
  assert.ok(Math.abs(vbOf(sized, d) - plain.vb_l) < 0.1, `${vbOf(sized, d)} vs ${plain.vb_l}`);
  assert.ok(d.vb_l < plain.vb_l);
});

test("stuffing survives both link forms, and the old calculator stuffing moves to the design it fed", async () => {
  const s = stuffed();
  assert.deepEqual(decodeState(encodeState(s)), s);
  assert.deepEqual(await decodeStateAny("#" + (await encodeStateShort(s))), s);
  // Stuffing on a kind that can't take it is dropped.
  const bp = { ...newDesign("bandpass", s.designs), stuffing: fill(20) } as DesignState;
  const withBp = decodeState(encodeState({ ...s, designs: [...s.designs, bp] }))!;
  assert.equal(withBp.designs[3]!.stuffing, undefined);

  const old = JSON.parse(JSON.stringify(DEFAULT_STATE));
  old.volume = { ...old.volume, link: "d2", fill_pct: 15 };
  old.settings.losses.qa = 60;
  const back = decodeState(encodeState(old))!;
  assert.deepEqual(back.designs[1]!.stuffing, { mode: "custom", gL: 16, gain_pct: 15, qa: 60 });
  assert.equal("fill_pct" in back.volume, false);
  assert.equal(stuffFactor(back.designs[1]!), 1.15);
});
