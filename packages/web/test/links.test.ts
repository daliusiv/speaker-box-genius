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
  type LineDesign,
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
    [
      "a second driver, used by one design",
      {
        ...d,
        extraDrivers: [{ id: "B" as const, driverName: "Other 12", driverBrand: "", nominal_ohms: 4, ts: { fs: 24, qms: 4, qes: 0.35, vas_l: 120, re: 3.2, sd_cm2: 480 }, le_mh: 1, l2_mh: 0, r2_ohm: 0, xmax_mm: 15, pe_w: 400, drivers: 2, wiring: "series" as const, isobaric: false, isoCoils: "parallel" as const, dvc: d.dvc }],
        designs: d.designs.map((x, i) => (i === 1 ? { ...x, driverId: "B" } : x)),
      },
    ],
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
    ["transmission lines, flared ports, baffle step and port compression", {
      ...d,
      settings: { ...d.settings, portCompression: true },
      baffle: { ...d.baffle, on: true, fromBox: false, width_cm: 22, x_cm: 11 },
      designs: [
        { ...(newDesign("line", d.designs) as LineDesign), driverAt_cm: 40, end: "port", portLength_cm: 18.5, portFlare_cm: 1.5, mouth: "back",
          sections: [
            { length_cm: 60, endArea_cm2: 140, taper: "exponential", fill_kgm3: 12 },
            { length_cm: 45.5, endArea_cm2: 90, taper: "conical", fill_kgm3: 5.5 },
            { length_cm: 30, endArea_cm2: 90, taper: "linear", fill_kgm3: 0 },
          ], fold: { width_cm: 24, folds: 3 } },
        { ...ported, flare_cm: 2.5 },
        { ...(newDesign("line", d.designs) as LineDesign), id: "d9", name: "TH", end: "tapped", tapAt_cm: 77, mouth: "custom", mouthDistance_cm: 12 },
        { ...(newDesign("line", d.designs) as LineDesign), id: "d10", name: "FLH", end: "horn", rearChamber_l: 33.5, throatChamber_l: 4.2,
          sections: [{ length_cm: 250, endArea_cm2: 9000, taper: "exponential", fill_kgm3: 0 }] },
      ],
    }],
  ];
}

test("a line design survives a link exactly", async () => {
  const s = variants().at(-1)![1];
  const back = await decodeStateAny(await encodeStateShort(s));
  assert.deepEqual(back!.designs[0], s.designs[0]);
  assert.equal(back!.designs[1]!.kind === "vented" && back!.designs[1]!.flare_cm, 2.5);
  assert.equal(back!.baffle.on, true);
  assert.equal(back!.settings.portCompression, true);
  assert.deepEqual(back!.designs[2], s.designs[2]);
  assert.deepEqual(back!.designs[3], s.designs[3]);
});

test("old single-piece line links open as sections", () => {
  const s = variants().at(-1)![1];
  const raw = JSON.parse(JSON.stringify(s)) as AppState;
  // The form PR #12 shipped: one tapered piece, stuffing from the closed end.
  raw.designs[0] = {
    id: "d1", name: "Old TL", kind: "line", on: true, vb_l: 30, closedArea_cm2: 200, length_cm: 150, mouthArea_cm2: 100, taper: "linear",
    driverAt_cm: 20, fill_kgm3: 8, fillLength_cm: 50, port: false, portDiameter_cm: 5, portLength_cm: 10, targetFb: 40,
  } as unknown as LineDesign;
  const back = decodeState(encodeState(raw))!;
  const l = back.designs[0] as LineDesign;
  assert.equal(l.end, "open");
  assert.equal(l.sections.length, 2);
  assert.equal(l.sections[0]!.length_cm, 50);
  assert.equal(l.sections[0]!.fill_kgm3, 8);
  assert.equal(l.sections[1]!.length_cm, 100);
  assert.equal(l.sections[1]!.endArea_cm2, 100);
  assert.ok(Math.abs(l.sections[0]!.endArea_cm2 - (200 - (100 * 50) / 150)) < 0.01);
  assert.equal("length_cm" in l, false);
});

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

test("measured curves travel with the link, and the link stays postable", async () => {
  const { parseCurve, thinCurve } = await import("@sbg/engine");
  // A realistic REW export: 1/48-octave points from 10 Hz to 20 kHz with ripple and noise.
  const lines: string[] = ["* Freq(Hz) SPL(dB) Phase(degrees)"];
  for (let i = 0; i <= 48 * 11; i++) {
    const f = 10 * 2 ** (i / 48);
    lines.push(`${f.toFixed(3)} ${(85 - 24 / (1 + (f / 35) ** 2) + 2 * Math.sin(i / 7) + ((i * 37) % 11) / 20).toFixed(3)} ${(i % 360) - 180}`);
  }
  const c = thinCurve(parseCurve(lines.join("\n"), "spl"), 24, 5, 2000);
  const s: AppState = {
    ...DEFAULT_STATE,
    measured: [{ id: "m1", name: "Ground plane 1 m", kind: "spl", on: true, f: c.f, v: c.v, offset_db: -3.2, matchTo: DEFAULT_STATE.designs[1]!.id }],
  };
  const hash = await encodeStateShort(s);
  const back = await decodeStateAny(hash);
  assert.deepEqual(back!.measured, s.measured);
  assert.ok(hash.length < 2000, `short link with a measurement: ${hash.length} characters`);
  // Garbage is dropped, not trusted.
  const bad = decodeState(encodeState({ ...s, measured: [{ ...s.measured[0]!, f: [1, 2], v: [1] }] as AppState["measured"] }));
  assert.deepEqual(bad!.measured, []);
});
