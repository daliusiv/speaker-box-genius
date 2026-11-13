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
      "compared with a second driver",
      {
        ...d,
        compare: { driverName: "Other 12", driverBrand: "", nominal_ohms: 4, ts: { fs: 24, qms: 4, qes: 0.35, vas_l: 120, re: 3.2, sd_cm2: 480 }, le_mh: 1, l2_mh: 0, r2_ohm: 0, xmax_mm: 15, pe_w: 400, dvc: d.dvc },
      },
    ],
    ["a value cleared from the T/S editor stays cleared", { ...d, ts: noFs }],
    ["T/S equal to defaults except one", { ...d, ts: { ...d.ts, qes: 0.41 } }],
    ["semi-inductance coil and Hornresp-style limits", {
      ...d, semi: { leb_mh: 0.3, le_mh: 1, ke: 0.05, rss_ohm: 30 }, fdd: { rms: 2, ams_mm_per_n: 0.3 },
      settings: { ...d.settings, thermalLimit: "real", ampVolts: 25, ampAmps: 8 },
    }],
    ["driver, settings and volume changed", {
      ...d, driverName: "Dayton Audio UM12-22", driverBrand: "Dayton Audio", le_mh: 2.1, l2_mh: 1.2, r2_ohm: 6,
      power: 350, drivers: 2, wiring: "series", isobaric: true, isoCoils: "series",
      dvc: { on: true, entered: "one", wired: "series" },
      settings: { ...d.settings, units: "imperial", rg: 0.3, losses: { ...d.settings.losses, qa: 20 }, leakage: "absorbed", coneLoad: "piston" },
      volume: { ...d.volume, link: ported.id, wall_mm: 25 },
      roomGain: { ...d.roomGain, mode: "car" },
      highPass: { ...d.highPass, on: true, freq: 20 },
      passive: { on: true, branches: [{ l_mH: 2, r: 0.3 }, { c_uF: 200 }, {}, { r: 6, l_mH: 1, join: "parallel" }] },
      eq: [{ id: "e1", on: true, target: "all", type: "peak", freq: 30, gain_db: 3, q: 1 } as AppState["eq"][0], { id: "e2", on: true, target: "all", type: "highshelf", freq: 120, gain_db: -4, q: 0.7 } as AppState["eq"][0]],
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
    ["port and PR positions", {
      ...d,
      designs: [
        { ...ported, ventAt: "back" },
        { ...pr, ventAt: "custom", ventDistance_cm: 24.5 },
        { ...(newDesign("bandpass", d.designs) as BandpassDesign), id: "d7", order: "6p", ventDistance_cm: 40 },
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

test("passive parts, new settings and a high shelf survive a link exactly", async () => {
  const s = variants().find(([name]) => name === "driver, settings and volume changed")![1];
  const back = (await decodeStateAny(await encodeStateShort(s)))!;
  assert.deepEqual(back.passive, s.passive);
  assert.equal(back.settings.leakage, "absorbed");
  assert.equal(back.settings.coneLoad, "piston");
  assert.deepEqual(back.eq, s.eq);
  // Bad values in a link are dropped, not passed to the engine.
  const raw = JSON.parse(JSON.stringify(s));
  raw.passive = { on: true, branches: [{ r: -1, l_mH: "x", c_uF: 10, join: "sideways" }] };
  const fixed = decodeState(encodeState(raw))!;
  assert.deepEqual(fixed.passive, { on: true, branches: [{ c_uF: 10 }, {}, {}, {}] });
});

test("the example's ported box has a port that fits and tunes it; older links keep their old port", async () => {
  const { portRoom_cm, airOf } = await import("../src/sim.ts");
  const { ventedFb, DEFAULT_END_CORRECTION } = await import("@sbg/engine");
  const { DEFAULT_STATE, decodeState, decodeStateAny, encodeStateShort, compactState } = await import("../src/state.ts");
  const v = DEFAULT_STATE.designs.find((d) => d.kind === "vented")!;
  assert.ok(v.kind === "vented");
  if (v.kind !== "vented") return;
  assert.ok(v.length_cm <= portRoom_cm(v.vb_l, v.diameter_cm), "fits a cube-shaped box of its volume");
  const fb = ventedFb(v.vb_l, { shape: "round", diameter_cm: v.diameter_cm, length_cm: v.length_cm, flare_cm: v.flare_cm }, v.count, DEFAULT_END_CORRECTION, airOf(DEFAULT_STATE));
  assert.ok(Math.abs(fb - v.targetFb) < 0.1, `tunes to ${fb}`);
  // A new short link of the example opens the new port.
  const again = (await decodeStateAny(await encodeStateShort(DEFAULT_STATE)))!.designs.find((d) => d.kind === "vented")!;
  assert.deepEqual(again, v);
  // A link made before 8 Nov 2026 (version 3) left the old default port out: it opens that port.
  const raw = compactState(DEFAULT_STATE) as Record<string, any>;
  const old = { ...raw, v: 3, designs: raw.designs.map((d: Record<string, any>) => (d.kind === "vented" ? { id: d.id, kind: d.kind, name: d.name } : d)) };
  const opened = decodeState("s=" + Buffer.from(JSON.stringify(old)).toString("base64url"))!.designs.find((d) => d.kind === "vented")!;
  assert.ok(opened.kind === "vented" && opened.diameter_cm === 10 && opened.length_cm === 30 && opened.flare_cm === 0);
  // One that gave its own port keeps it.
  const own = { ...old, designs: old.designs.map((d: Record<string, any>) => (d.kind === "vented" ? { ...d, diameter_cm: 12, length_cm: 25 } : d)) };
  const kept = decodeState("s=" + Buffer.from(JSON.stringify(own)).toString("base64url"))!.designs.find((d) => d.kind === "vented")!;
  assert.ok(kept.kind === "vented" && kept.diameter_cm === 12 && kept.length_cm === 25 && kept.flare_cm === 0);
});

test("a link with odd T/S values opens: unknown keys and bad values are dropped, numeric strings read", async () => {
  const { encodeState: enc, decodeState: dec } = await import("../src/state.ts");
  const { runDesigns: run, solveDriver: solve } = await import("../src/sim.ts");
  const base = DEFAULT_STATE.ts;
  const cases: [unknown, Record<string, number>][] = [
    [{ ...base, le_mh: 1 }, base as Record<string, number>],
    [{ ...base, fs: "30" }, base as Record<string, number>],
    [{ ...base, qes: -1, qms: "x" }, { fs: 30, vas_l: 50, re: 3.4, sd_cm2: 330 }],
    ["oops", base as Record<string, number>],
    [[1, 2], base as Record<string, number>],
  ];
  for (const [ts, want] of cases) {
    const s = dec(enc({ ...DEFAULT_STATE, ts: ts as never }))!;
    assert.deepEqual(s.ts, want, JSON.stringify(ts));
    assert.doesNotThrow(() => run(s, solve(s)));
  }
});

test("port positions: side by side stays out of links; odd values are dropped", () => {
  const [, ported] = DEFAULT_STATE.designs as [AppState["designs"][0], VentedDesign];
  const plain = encodeState(DEFAULT_STATE);
  const front = encodeState({ ...DEFAULT_STATE, designs: DEFAULT_STATE.designs.map((x) => (x.id === ported.id ? { ...ported, ventAt: undefined } : x)) });
  assert.equal(front, plain);
  const odd = decodeState(encodeState({ ...DEFAULT_STATE, designs: DEFAULT_STATE.designs.map((x) => (x.id === ported.id ? ({ ...ported, ventAt: "sideways", ventDistance_cm: -3 } as unknown as VentedDesign) : x)) }))!;
  const v = odd.designs.find((x) => x.id === ported.id) as VentedDesign;
  assert.equal(v.ventAt, undefined);
  assert.equal(v.ventDistance_cm, undefined);
});
