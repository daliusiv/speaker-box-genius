import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, type AppState } from "../src/state.ts";
import { dspFileFor, dspFiltersFor } from "../src/dspExport.ts";

const base = (): AppState => ({
  ...DEFAULT_STATE,
  highPass: { on: true, type: "linkwitz-riley", order: 4, freq: 18 },
  eq: [
    { id: "e1", on: true, target: "all", type: "peak", freq: 45, gain_db: -3, q: 2 },
    { id: "e2", on: true, target: "nobody", type: "lowshelf", freq: 40, gain_db: 6, q: 0.707 },
    { id: "e3", on: false, target: "all", type: "peak", freq: 80, gain_db: 3, q: 1 },
  ],
});

test("a design gets the high-pass and only the EQ that's on and aimed at it", () => {
  const s = base();
  const id = s.designs[0]!.id;
  const f = dspFiltersFor(s, id);
  assert.equal(f.hp?.order, 4);
  assert.deepEqual(f.eq.map((e) => e.type), ["peak"]);
  const aimed = { ...s, eq: s.eq.map((e) => (e.id === "e2" ? { ...e, target: id } : e)) };
  assert.equal(dspFiltersFor(aimed, id).eq.length, 2);
});

test("each format downloads with a sensible name and the right number of sections", () => {
  const s = base();
  const d = s.designs[0]!;
  const apo = dspFileFor(s, d.id, "apo", 48000);
  assert.ok(typeof apo !== "string");
  assert.match(apo.name, /EqualizerAPO 48k\.txt$/);
  // LR4 = two sections, plus one peak.
  assert.equal(apo.text.split("\r\n").filter((l) => l.startsWith("Filter: ON IIR")).length, 3);
  const cam = dspFileFor(s, d.id, "camilla", 96000);
  assert.ok(typeof cam !== "string" && cam.name.endsWith("CamillaDSP 96k.yml"));
  const mini = dspFileFor(s, d.id, "minidsp", 44100);
  assert.ok(typeof mini !== "string" && (mini.text.match(/^biquad\d+,$/gm) ?? []).length === 3);
  const csv = dspFileFor(s, d.id, "csv", 48000);
  assert.ok(typeof csv !== "string" && csv.name.endsWith(".csv"));
});

test("nothing to export says so", () => {
  const s = { ...base(), highPass: { ...base().highPass, on: false }, eq: [] };
  assert.match(String(dspFileFor(s, s.designs[0]!.id, "apo", 48000)), /No high-pass or EQ/);
});
