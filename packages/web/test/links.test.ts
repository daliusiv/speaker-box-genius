import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STATE,
  decodeState,
  decodeStateAny,
  encodeState,
  encodeStateShort,
  newDesign,
  type AppState,
  type BandpassDesign,
  type PrDesign,
  type VentedDesign,
} from "../src/state.ts";

/** What a long-form link decodes to: the reference every short link must match. */
const viaLong = (s: AppState) => decodeState(encodeState(s));

function variants(): [string, AppState][] {
  const d = DEFAULT_STATE;
  const [sealed, ported, pr] = d.designs as [AppState["designs"][0], VentedDesign, PrDesign];
  const bp = { ...(newDesign("bandpass", d.designs) as BandpassDesign), order: "6s" as const, frontOpening: "pr" as const,
    losses: { front: { ql: 7, qa: 50, qp: 100 }, rear: { ql: 10, qa: 5, qp: 30 }, qicl: 40 } };
  const { fs: _fs, ...noFs } = d.ts;
  return [
    ["default", d],
    ["a value cleared from the T/S editor stays cleared", { ...d, ts: noFs }],
    ["T/S equal to defaults except one", { ...d, ts: { ...d.ts, qes: 0.41 } }],
    ["driver, settings and volume changed", {
      ...d, driverName: "Dayton Audio UM12-22", driverBrand: "Dayton Audio", le_mh: 2.1, l2_mh: 1.2, r2_ohm: 6,
      power: 350, drivers: 2, wiring: "series", isobaric: true, isoCoils: "series",
      dvc: { on: true, entered: "one", wired: "series" },
      settings: { ...d.settings, units: "imperial", rg: 0.3, losses: { ...d.settings.losses, qa: 20 } },
      volume: { ...d.volume, link: ported.id, wall_mm: 25 },
      roomGain: { ...d.roomGain, mode: "car" },
      highPass: { ...d.highPass, on: true, freq: 20 },
      eq: [{ id: "e1", on: true, target: "all", type: "peak", freq: 30, gain_db: 3, q: 1 } as AppState["eq"][0]],
    }],
    ["designs edited, reordered, hidden, plus bandpass and mixed PRs", {
      ...d,
      designs: [
        { ...pr, extra: [{ prName: "Other PR", count: 1, addedMass_g: 40, params: { ...pr.params, mms_g: 200 } }], addedMass_g: 0 },
        { ...ported, on: false, front: undefined, length_cm: 20.946, shape: "slot" } as VentedDesign,
        { ...sealed, name: "My sealed", vb_l: 33.3 },
        bp,
      ],
    }],
  ];
}

test("short links decode to exactly what the long form gives", async () => {
  for (const [name, s] of variants()) {
    const short = await encodeStateShort(s);
    assert.match(short, /^z=[A-Za-z0-9_-]+$/, name);
    assert.deepEqual(await decodeStateAny(short), viaLong(s), name);
    assert.deepEqual(await decodeStateAny("#" + short), viaLong(s), `${name} (with #)`);
  }
});

test("short links are much shorter", async () => {
  const short = await encodeStateShort(DEFAULT_STATE);
  const long = encodeState(DEFAULT_STATE);
  assert.ok(short.length < 200, `default: ${short.length} characters`);
  for (const [name, s] of variants()) {
    const a = (await encodeStateShort(s)).length, b = encodeState(s).length;
    assert.ok(a < b / 2, `${name}: ${a} vs ${b}`);
  }
  assert.ok(long.length > 1500);
});

test("old long links still open", async () => {
  for (const [name, s] of variants()) assert.deepEqual(await decodeStateAny("#" + encodeState(s)), viaLong(s), name);
});

test("broken links decode to null instead of throwing", async () => {
  for (const h of ["#z=AAAA", "#z=!!", "#s=AAAA", "#nothing", ""]) assert.equal(await decodeStateAny(h), null, h);
});
