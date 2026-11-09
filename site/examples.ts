/**
 * Live example designs for the guides, built from the database at build time so their
 * links always open in the current version of the app. Each is a state for the app's
 * share link (`#z=…`); a page refers to one as {{link:<name>}}.
 */
import { readFileSync } from "node:fs";
import { DEFAULT_STATE, asCompare, encodeStateShort, newDesign, type AppState, type DesignState } from "../packages/web/src/state.ts";
import { sizeAllForDriver } from "../packages/web/src/presets.ts";
import type { Stuffing } from "../packages/web/src/stuffing.ts";

/** A fresh line design, as "+ Transmission line" adds one. */
const newLine = (s: AppState) => newDesign("line", s.designs);
import { baffleStepFrequency, estimateDriverDisplacement, keeleAlignment, portLengthForFb, sealedVolumeForAlignment, type PortInput } from "../packages/engine/src/index.ts";
import { alignmentDriver, baffleOf, dimensionsFor, driverInputOf, runDesigns, simOptionsOf, solveDriver } from "../packages/web/src/sim.ts";
import { compareLines } from "../packages/web/src/lineopt.ts";

const ROOT = new URL("..", import.meta.url);
const json = (path: string) => JSON.parse(readFileSync(new URL(path, ROOT), "utf8"));

/** A database driver as the app loads it (see loadDriver in packages/web/src/library.ts). */
export function withDriver(s: AppState, id: string): AppState {
  const rec = json(`drivers/${id}.json`);
  const ts: Record<string, number> = {};
  for (const k of ["fs", "qms", "qes", "qts", "vas_l", "re", "sd_cm2", "mms_g", "bl", "cms_mm_per_n", "rms"]) {
    if (typeof rec.ts[k] === "number") ts[k] = rec.ts[k];
  }
  return {
    ...s,
    driverName: `${rec.brand} ${rec.model}`,
    driverBrand: rec.brand,
    nominal_ohms: rec.nominal_ohms ?? s.nominal_ohms,
    ts: ts as AppState["ts"],
    le_mh: rec.ts.le_mh ?? 0,
    l2_mh: 0,
    r2_ohm: 0,
    xmax_mm: rec.ts.xmax_mm ?? s.xmax_mm,
    pe_w: rec.ts.pe_w ?? s.pe_w,
  };
}

/** A database passive radiator's parameters, as the app uses them. */
export function prParams(id: string) {
  const p = json(`passive-radiators/${id}.json`).params;
  return { mms_g: p.mms_g, sd_cm2: p.sd_cm2, xmax_mm: p.xmax_mm, qms: p.qms ?? 10, vas_l: p.vas_l };
}

export const byKind = (s: AppState, kind: DesignState["kind"]) => s.designs.find((d) => d.kind === kind)!;

/**
 * The passive radiator guide's worked example: a Dayton Audio DSA215-8 in 18 L (its QB3
 * alignment as WinISD sizes it, tuned to 41.7 Hz), as a ported box and with one DS215-PR plus 4 g, at 35 W
 * behind a 30 Hz high-pass filter (what keeps the cone in check below the tuning).
 */
function prExample(): AppState {
  const s = withDriver(
    { ...DEFAULT_STATE, power: 35, highPass: { ...DEFAULT_STATE.highPass, on: true, type: "butterworth", order: 2, freq: 30 } },
    "dayton-audio/dsa215-8",
  );
  const vented = byKind(s, "vented") as Extract<DesignState, { kind: "vented" }>;
  const pr = byKind(s, "pr") as Extract<DesignState, { kind: "pr" }>;
  const vb = 18;
  const fb = 41.7;
  // A 5 cm port: short enough to fit in the box, but it chuffs at 35 W (the guide's point).
  const port = { shape: "round" as const, diameter_cm: 5, length_cm: 10 };
  const length = portLengthForFb(vb, port, fb);
  return {
    ...s,
    designs: [
      { ...vented, name: "Ported", vb_l: vb, shape: "round", diameter_cm: 5, flare_cm: 0, length_cm: Math.round(length * 10) / 10, count: 1, targetFb: fb, preset: "QB3" },
      { ...pr, name: "PR", vb_l: vb, prName: "Dayton Audio DS215-PR", params: prParams("dayton-audio/ds215-pr"), count: 1, addedMass_g: 4, targetFb: fb, extra: [] },
    ],
  };
}

/** The WinISD page's example: the same driver in a sealed, a ported and a passive radiator box. */
function winisdExample(): AppState {
  const s = prExample();
  const sealed = byKind(DEFAULT_STATE, "sealed");
  return { ...s, designs: [{ ...sealed, name: "Sealed", vb_l: 12 }, ...s.designs] };
}

type Vented = Extract<DesignState, { kind: "vented" }>;

/** A ported design with its port cut to length for the tuning (as the app's "Set length" does). */
export function ventedWith(base: Vented, name: string, vb_l: number, fb: number, port: { shape: "round"; diameter_cm: number; flare_cm?: number } | { shape: "slot"; width_cm: number; height_cm: number }): Vented {
  const input: PortInput = port.shape === "round" ? { ...port, length_cm: 10 } : { ...port, length_cm: 10 };
  const length = Math.round(portLengthForFb(vb_l, input, fb) * 10) / 10;
  return {
    ...base,
    name,
    vb_l,
    shape: port.shape,
    diameter_cm: port.shape === "round" ? port.diameter_cm : base.diameter_cm,
    slotWidth_cm: port.shape === "slot" ? port.width_cm : base.slotWidth_cm,
    slotHeight_cm: port.shape === "slot" ? port.height_cm : base.slotHeight_cm,
    flare_cm: port.shape === "round" ? (port.flare_cm ?? 0) : 0,
    length_cm: length,
    count: 1,
    targetFb: fb,
  };
}

/**
 * The port guide's example: a Dayton Audio RSS315HF-4 12″ sub in its flat alignment (Keele's:
 * 83.5 L at 23.8 Hz), 300 W behind a 24 dB/oct high-pass at 20 Hz, with three ports: a
 * 10 cm tube (chuffs), a 5 × 30 cm slot and the 10 cm tube with flared ends.
 */
function portExample(): AppState {
  const s = withDriver(
    { ...DEFAULT_STATE, power: 300, highPass: { ...DEFAULT_STATE.highPass, on: true, type: "butterworth", order: 4, freq: 20 } },
    "dayton-audio/rss315hf-4",
  );
  const v = byKind(s, "vented") as Vented;
  const vb = 83.5;
  const fb = 23.8;
  return {
    ...s,
    designs: [
      ventedWith(v, "10 cm port", vb, fb, { shape: "round", diameter_cm: 10 }),
      { ...ventedWith(v, "5 × 30 cm slot", vb, fb, { shape: "slot", width_cm: 5, height_cm: 30 }), id: "d2" },
      { ...ventedWith(v, "10 cm flared", vb, fb, { shape: "round", diameter_cm: 10, flare_cm: 2.5 }), id: "d3" },
    ],
  };
}

/**
 * The transmission line guide's example: the DSA215-8 (the driver of the Hornresp checks) as
 * the app's Compare types makes them: a classic TL, an offset TL and an MLTL, each tuned, at 25 W behind a 28 Hz high-pass.
 */
function tlExample(): AppState {
  const s = withDriver(
    { ...DEFAULT_STATE, power: 25, highPass: { ...DEFAULT_STATE.highPass, on: true, type: "butterworth", order: 2, freq: 28 } },
    "dayton-audio/dsa215-8",
  );
  const solved = solveDriver(s);
  const line = newLine(s) as Extract<DesignState, { kind: "line" }>;
  const rows = compareLines(driverInputOf(s, solved), line, simOptionsOf(s), alignmentDriver(solved, s), 1);
  const pick = (id: string, name: string, n: number) => {
    const d = rows.find((r) => r.id === id)?.design;
    if (!d) throw new Error(`The ${id} line type couldn't be made for the example`);
    return { ...d, id: `d${n}`, name };
  };
  return { ...s, designs: [pick("tl", "Classic TL", 1), pick("otl", "Offset TL", 2), pick("mltl", "MLTL", 3)] };
}

const highPass = (order: number, freq: number): AppState["highPass"] => ({ ...DEFAULT_STATE.highPass, on: true, type: "butterworth", order, freq });

/**
 * The sealed / ported / PR guide: a Dayton Audio RSS265HF-4 10″ at its 350 W rating, behind a
 * 24 dB/oct high-pass at 18 Hz (or none), in the boxes the presets give (tested against them):
 * sealed 37.3 L (Qtc 0.707); ported 86.4 L at 22.3 Hz (QB3, as WinISD sizes it) with a 10 cm
 * flared tube, 50.5 cm long (quiet at 350 W; the straight port Size all picks for a cube chuffs);
 * passive radiators, two RSS265-PR in the same 86.4 L with two of their 75 g disks each.
 */
export const BOX_TYPES = { sealed_l: 37.3, vented_l: 86.4, fb: 22.3, prMass_g: 150 };
function boxTypesExample(filter: boolean) {
  return (): AppState => {
    const s = withDriver({ ...DEFAULT_STATE, power: 350, highPass: { ...highPass(4, 18), on: filter } }, "dayton-audio/rss265hf-4");
    const sealed = { ...(byKind(s, "sealed") as Extract<DesignState, { kind: "sealed" }>), id: "d1", name: "Sealed", vb_l: BOX_TYPES.sealed_l, preset: "Qtc 0.707" };
    const ported = { ...ventedWith(byKind(s, "vented") as Vented, "Ported", BOX_TYPES.vented_l, BOX_TYPES.fb, { shape: "round", diameter_cm: 10, flare_cm: 2.5 }), id: "d2", preset: "QB3" };
    const pr = {
      ...(byKind(s, "pr") as Extract<DesignState, { kind: "pr" }>),
      id: "d3",
      name: "Passive radiators",
      vb_l: BOX_TYPES.vented_l,
      prName: "Dayton Audio RSS265-PR",
      params: prParams("dayton-audio/rss265-pr"),
      count: 2,
      addedMass_g: BOX_TYPES.prMass_g,
      targetFb: 22.8, // what two disks tune it to (the preset's 164 g gives 22.4 Hz)
      extra: [],
    };
    return { ...s, designs: [sealed, ported, pr] };
  };
}

/** The subsonic filter guide: the port guide's sub with its slot port, the filter off or on. */
function subsonicExample(on: boolean) {
  return (): AppState => {
    const s = portExample();
    return { ...s, highPass: { ...highPass(4, 20), on }, designs: [{ ...s.designs[1]!, id: "d1", name: "Slot-ported sub" }] };
  };
}

/**
 * The car subwoofer guide: a Dayton Audio RSS265HF-4 (Pe 350 W, Xmax 12.3 mm) at its full rated
 * 350 W behind a 26 Hz 24 dB/oct subsonic filter: a 28 L sealed box, and 45 L ported tuned to
 * 33 or 28 Hz (5 × 30 cm slot). In a car (2.5 m cabin, 12 dB/oct, up to 18 dB) or, with
 * `cabin` false, the same boxes out of the car.
 */
function carExample(cabin: boolean) {
  return (): AppState => {
    const s = withDriver({ ...DEFAULT_STATE, power: 350, highPass: highPass(4, 26) }, "dayton-audio/rss265hf-4");
    const sealed = byKind(s, "sealed") as Extract<DesignState, { kind: "sealed" }>;
    const v = byKind(s, "vented") as Vented;
    const slot = { shape: "slot" as const, width_cm: 5, height_cm: 30 };
    return {
      ...s,
      roomGain: cabin ? { ...s.roomGain, mode: "car", length_cm: 250, slope: 12, max_db: 18 } : { ...s.roomGain, mode: "off" },
      designs: [
        { ...sealed, id: "d1", name: "Sealed 28 L", vb_l: 28 },
        { ...ventedWith(v, "Ported 45 L, 33 Hz", 45, 33, slot), id: "d2" },
        { ...ventedWith(v, "Ported 45 L, 28 Hz", 45, 28, slot), id: "d3" },
      ],
    };
  };
}

/**
 * Comparing drivers: the RSS265HF-4 with the RSS265HO-4 as the comparison driver, in a 30 L
 * sealed box and a 50 L ported box tuned to 26 Hz (4″ port flared 2.5 cm at both ends), from
 * the same amplifier: 350 W (35 V into these 3.5 Ω coils, the HF's rating) behind a 22 Hz
 * 24 dB/oct high-pass filter.
 */
export const COMPARE = { power: 350, hp: 22, sealed_l: 30, vented_l: 50, fb: 26 };
function compareExample(): AppState {
  const s = withDriver({ ...DEFAULT_STATE, power: COMPARE.power, highPass: highPass(4, COMPARE.hp) }, "dayton-audio/rss265hf-4");
  const sealed = byKind(s, "sealed") as Extract<DesignState, { kind: "sealed" }>;
  const v = byKind(s, "vented") as Vented;
  return {
    ...s,
    compare: asCompare(withDriver(DEFAULT_STATE, "dayton-audio/rss265ho-4")),
    designs: [
      { ...sealed, id: "d1", name: `Sealed ${COMPARE.sealed_l} L`, vb_l: COMPARE.sealed_l },
      { ...ventedWith(v, `Ported ${COMPARE.vented_l} L, ${COMPARE.fb} Hz`, COMPARE.vented_l, COMPARE.fb, { shape: "round", diameter_cm: 10.16, flare_cm: 2.5 }), id: "d2" },
    ],
  };
}

/**
 * T/S parameters guide: the Dayton DSA215-8 (Qts 0.33, EBP 88) with the RSS210HF-4 (Qts 0.57,
 * EBP 43) as the comparison driver, in the DSA215-8's own boxes as Size all gives them (fixed
 * here; the test checks the presets still give them): sealed 10.4 L (Qtc 0.707) and ported
 * 18 L at 41.7 Hz (QB3, as WinISD sizes it) with a 5 cm port flared 0.8 cm. Driven at 21.7 V, the DSA215-8's
 * rated 80 W into its 5.9 Ω coil, behind a 12 dB/oct high-pass at 30 Hz.
 */
export const TS_EX = { volts: 21.7, sealed_l: 10.4, vented_l: 18, fb: 41.7, port_cm: 5, flare_cm: 0.8 };
function tsExample(): AppState {
  const s = withDriver({ ...DEFAULT_STATE, drive: "volts", volts: TS_EX.volts, highPass: highPass(2, 30) }, "dayton-audio/dsa215-8");
  const v = byKind(s, "vented") as Vented;
  return {
    ...s,
    compare: asCompare(withDriver(DEFAULT_STATE, "dayton-audio/rss210hf-4")),
    designs: [
      { ...byKind(s, "sealed"), id: "d1", name: `Sealed ${TS_EX.sealed_l} L`, vb_l: TS_EX.sealed_l },
      { ...ventedWith(v, `Ported ${TS_EX.vented_l} L, ${TS_EX.fb} Hz`, TS_EX.vented_l, TS_EX.fb, { shape: "round", diameter_cm: TS_EX.port_cm, flare_cm: TS_EX.flare_cm }), id: "d2" },
    ],
  };
}

/**
 * The DSA215-8 with only the six core T/S values (no Mms or Bl, so changing one doesn't
 * fight the others), in its QB3 ported box (16.2 L at 39.8 Hz, 5 cm port), driven at 2.83 V
 * (the level measurements and datasheets use).
 */
function dsaPorted(): AppState {
  const s = withDriver({ ...DEFAULT_STATE, drive: "volts", volts: 2.83 }, "dayton-audio/dsa215-8");
  const t = s.ts;
  const core = { fs: t.fs, qms: t.qms, qes: t.qes, vas_l: t.vas_l, re: t.re, sd_cm2: t.sd_cm2 } as AppState["ts"];
  const v = byKind(s, "vented") as Vented;
  return { ...s, ts: core, designs: [{ ...ventedWith(v, "Ported, QB3", 16.2, 39.8, { shape: "round", diameter_cm: 5 }), id: "d1" }] };
}

/** "Doesn't match": the box with the datasheet driver, compared with the same driver 15 % stiffer (Fs +15 %). */
function mismatchExample(): AppState {
  const s = dsaPorted();
  return { ...s, compare: { ...asCompare(s), driverName: "Dayton Audio DSA215-8 (Fs +15 %)", ts: { ...s.ts, fs: s.ts.fs! * 1.15 } } };
}

/** Port tuning: the same port in the box as designed (16.2 L) and as built (14.1 L net, after the driver, port tube and bracing). */
function portTuningExample(): AppState {
  const s = dsaPorted();
  const d = s.designs[0] as Vented;
  return { ...s, designs: [{ ...d, name: "As designed, 16.2 L" }, { ...d, id: "d2", name: "As built, 14.1 L net", vb_l: 14.1 }] };
}

/** Box losses: the ported box with leakage Ql set as given. */
function lossesExample(ql: number) {
  return (): AppState => {
    const s = dsaPorted();
    return { ...s, settings: { ...s.settings, losses: { ...s.settings.losses, ql } } };
  };
}

/**
 * Linkwitz Transform: an RSS265HF-4 in 20 L sealed, with an LT from its own fc and Qtc to
 * 25 Hz at Q 0.707, next to the same box without EQ and the 37 L Qtc 0.707 box; 40 W behind
 * a 24 dB/oct high-pass at 18 Hz.
 */
function ltExample(): AppState {
  const s = withDriver({ ...DEFAULT_STATE, power: 40, highPass: highPass(4, 18) }, "dayton-audio/rss265hf-4");
  const sealed = byKind(s, "sealed") as Extract<DesignState, { kind: "sealed" }>;
  const small = { ...sealed, id: "d1", name: "20 L + Linkwitz Transform", vb_l: 20 };
  const plain = { ...s, designs: [small] };
  const r = runDesigns(plain, solveDriver(plain))[0]!.result.summary;
  const f0 = Math.round(r.fc! * 10) / 10;
  const q0 = Math.round(r.qtc! * 1000) / 1000;
  return {
    ...s,
    designs: [small, { ...sealed, id: "d2", name: "20 L, no EQ", vb_l: 20 }, { ...sealed, id: "d3", name: "37 L, no EQ", vb_l: 37.3 }],
    eq: [{ id: "e1", on: true, target: "d1", type: "linkwitz", f0, q0, fp: 25, qp: 0.707 }],
  };
}

/** Isobaric: an RSS265HF-4 single in its Qtc 0.707 box (37.3 L), or an isobaric pair (coils in parallel) in half of it, and in the full box. */
function isoExample(pair: boolean) {
  return (): AppState => {
    const s = withDriver({ ...DEFAULT_STATE, power: 100, highPass: highPass(4, 18) }, "dayton-audio/rss265hf-4");
    const sealed = byKind(s, "sealed") as Extract<DesignState, { kind: "sealed" }>;
    if (!pair) return { ...s, designs: [{ ...sealed, id: "d1", name: "Single, 37.3 L", vb_l: 37.3 }] };
    return {
      ...s,
      isobaric: true,
      isoCoils: "parallel",
      designs: [
        { ...sealed, id: "d1", name: "Isobaric pair, 18.7 L", vb_l: 18.65 },
        { ...sealed, id: "d2", name: "Isobaric pair, 37.3 L", vb_l: 37.3 },
      ],
    };
  };
}

/** A copy of the state with the absorption loss Qa (in Settings, so it applies to every design) set. */

/**
 * Stuffing guide, sealed: an RSS265HF-4 in an 18 L box (half its Qtc 0.707 volume), stuffed
 * with each design's own Custom stuffing: +25 % (acting as 22.5 L) for the right amount,
 * −14 % (15.5 L) for an overstuffed box, as Nousaine measured. `losses` adds the absorption
 * stuffing brings (Qa 20); without it, Qa stays at the default 100 so the links compare the
 * volume effect alone, next to the empty box and the full-size 37.3 L box.
 */
const custom = (built: number, acting: number, qa: number): Stuffing => ({ mode: "custom", gL: 16, gain_pct: (acting / built - 1) * 100, qa });

function stuffingSealed(losses: boolean) {
  return (): AppState => {
    const s = withDriver({ ...DEFAULT_STATE, power: 100, highPass: highPass(4, 18) }, "dayton-audio/rss265hf-4");
    const sealed = byKind(s, "sealed") as Extract<DesignState, { kind: "sealed" }>;
    if (losses) {
      return {
        ...s,
        designs: [
          { ...sealed, id: "d1", name: "18 L stuffed (acts as 22.5 L)", vb_l: 18, stuffing: custom(18, 22.5, 20) },
          { ...sealed, id: "d2", name: "18 L overstuffed (acts as 15.5 L)", vb_l: 18, stuffing: custom(18, 15.5, 20) },
        ],
      };
    }
    return {
      ...s,
      designs: [
        { ...sealed, id: "d1", name: "18 L empty", vb_l: 18 },
        { ...sealed, id: "d2", name: "18 L stuffed (acts as 22.5 L)", vb_l: 18, stuffing: custom(18, 22.5, 100) },
        { ...sealed, id: "d3", name: "37.3 L empty (Qtc 0.707)", vb_l: 37.3 },
      ],
    };
  };
}

/**
 * Stuffing guide, ported: the DSA215-8's QB3 box (16.2 L, 5 cm port tuned to 39.8 Hz), empty
 * or filled. Filling is modelled as Custom stuffing: +20 % volume with the same port (acting
 * as 19.4 L) and Qa 10.
 */
function stuffingPorted(filled: boolean) {
  return (): AppState => {
    const s = dsaPorted();
    const d = s.designs[0] as Vented;
    if (!filled) return { ...s, designs: [{ ...d, name: "Empty, 16.2 L" }] };
    return { ...s, designs: [{ ...d, name: "Filled (acts as 19.4 L, Qa 10)", stuffing: custom(d.vb_l, 19.4, 10) }] };
  };
}

/**
 * The sealed Qtc guide: a Dayton Audio RSS265HO-4 10″ (Qts 0.36) in sealed boxes for Qtc 0.5,
 * 0.577, 0.707, 0.9 and 1.1, at 100 W, voice-coil inductance off so each box's own shape shows.
 */
export const QTCS = [0.5, 0.577, 0.707, 0.9, 1.1];
function qtcExample(): AppState {
  const s = withDriver({ ...DEFAULT_STATE, power: 100, settings: { ...DEFAULT_STATE.settings, inductance: false } }, "dayton-audio/rss265ho-4");
  const align = alignmentDriver(solveDriver(s), s)!;
  const sealed = byKind(DEFAULT_STATE, "sealed");
  return {
    ...s,
    designs: QTCS.map((q, i) => {
      const vb = sealedVolumeForAlignment(align, q);
      if (!vb) throw new Error(`No sealed box for Qtc ${q}`);
      return { ...sealed, id: `d${i + 1}`, name: `Qtc ${q}`, vb_l: Math.round(vb * 10) / 10, preset: `Qtc ${q}` };
    }),
  };
}

/**
 * The group delay guide: a Dayton Audio RSS315HF-4 12″ sub at 50 W in three boxes: sealed for
 * Qtc 0.707 (36.3 L), a small ported box tuned high (50 L at 42 Hz, peaked) and its low-tuned
 * Keele alignment (83.5 L at 23.8 Hz), both with a 10 cm port. `subsonic` adds the 18 Hz
 * 24 dB/oct high-pass filter a low-tuned box needs.
 */
function groupDelayExample(subsonic: boolean) {
  return (): AppState => {
    let s = withDriver({ ...DEFAULT_STATE, power: 50 }, "dayton-audio/rss315hf-4");
    if (subsonic) s = { ...s, highPass: highPass(4, 18) };
    const align = alignmentDriver(solveDriver(s), s)!;
    const keele = keeleAlignment(align);
    const vb = sealedVolumeForAlignment(align, 0.707);
    if (!keele || !vb) throw new Error("The group delay example needs a sealed and a Keele box");
    const vented = byKind(DEFAULT_STATE, "vented") as Vented;
    const kVb = Math.round(keele.vb_l * 10) / 10;
    const kFb = Math.round(keele.fb * 10) / 10;
    return {
      ...s,
      designs: [
        { ...byKind(DEFAULT_STATE, "sealed"), id: "d1", name: `Sealed, Qtc 0.707 (${Math.round(vb * 10) / 10} L)`, vb_l: Math.round(vb * 10) / 10 },
        { ...ventedWith(vented, "Ported, tuned high (50 L, 42 Hz)", 50, 42, { shape: "round", diameter_cm: 10 }), id: "d2" },
        { ...ventedWith(vented, `Ported, tuned low (${kVb} L, ${kFb} Hz)`, kVb, kFb, { shape: "round", diameter_cm: 10 }), id: "d3" },
      ],
    };
  };
}

/**
 * The 15″ vs two 10″ guide: a Dayton Audio RSS390HF-4 (one 15″) with two RSS265HF-4 as the
 * comparison (its own count: two, in parallel for 2 Ω, or in series for 8 Ω), in the same two
 * boxes: 100 L sealed and 150 L ported at 22 Hz with a 15 cm port, behind an 18 Hz 24 dB/oct
 * high-pass filter, on the same amplifier (one channel of a Crown XLS 1002: 350 W into 4 Ω =
 * 37.4 V, 550 W into 2 Ω = 16.6 A), at 28.3 V (2.83 V + 20 dB).
 */
export const SUBS_AMP = { volts: 37.4, amps: 16.6 };
export const SUBS_VOLTS = 28.3;
function subsExample(wiring: "parallel" | "series") {
  return (): AppState => {
    let s = withDriver({ ...DEFAULT_STATE, drive: "volts", volts: SUBS_VOLTS, highPass: highPass(4, 18) }, "dayton-audio/rss390hf-4");
    s = { ...s, drivers: 1, wiring: "parallel", settings: { ...s.settings, ampVolts: SUBS_AMP.volts, ampAmps: SUBS_AMP.amps } };
    return {
      ...s,
      compare: { ...asCompare(withDriver(DEFAULT_STATE, "dayton-audio/rss265hf-4")), drivers: 2, wiring },
      designs: [
        { ...byKind(DEFAULT_STATE, "sealed"), id: "d1", name: "100 L sealed", vb_l: 100 },
        { ...ventedWith(byKind(DEFAULT_STATE, "vented") as Vented, "150 L ported, 22 Hz", 150, 22, { shape: "round", diameter_cm: 15 }), id: "d2" },
      ],
    };
  };
}

/**
 * The power compression guide: a Dayton Audio RSS315HF-4 in its flat ported box (Keele's
 * alignment, 83.5 L at 23.8 Hz, a 12.5 cm port) at 25 V, with the voice coil at `temp_C`.
 */
export const COMPRESSION_TEMPS = [20, 120, 180];
function compressionExample(temp_C: number) {
  return (): AppState => {
    const s = withDriver({ ...DEFAULT_STATE, drive: "volts", volts: 25 }, "dayton-audio/rss315hf-4");
    const vented = ventedWith(byKind(DEFAULT_STATE, "vented") as Vented, `Ported 83.5 L, coil at ${temp_C} °C`, 83.5, 23.8, { shape: "round", diameter_cm: 12.5 });
    return { ...s, settings: { ...s.settings, coilTemp_C: temp_C }, designs: [{ ...vented, id: "d1" }] };
  };
}

/**
 * The MLTL guide: the transmission line guide's DSA215-8 MLTL (from Compare types, 24 L, 86 cm,
 * a 7.3 cm port, tuned to 40 Hz, stuffed behind the driver), the same line empty, and the same
 * volume and port as a plain ported box, at 25 W behind a 28 Hz high-pass filter.
 */
function mltlExample(): AppState {
  const s = withDriver({ ...DEFAULT_STATE, power: 25, highPass: highPass(2, 28) }, "dayton-audio/dsa215-8");
  const solved = solveDriver(s);
  const rows = compareLines(driverInputOf(s, solved), newLine(s) as Extract<DesignState, { kind: "line" }>, simOptionsOf(s), alignmentDriver(solved, s), 1);
  const mltl = rows.find((r) => r.id === "mltl")?.design;
  if (!mltl) throw new Error("The MLTL couldn't be made for the example");
  const vb = Math.round(mltl.vb_l * 10) / 10;
  const ported = ventedWith(byKind(DEFAULT_STATE, "vented") as Vented, "Ported box", vb, mltl.targetFb, { shape: "round", diameter_cm: mltl.portDiameter_cm, flare_cm: mltl.portFlare_cm });
  return {
    ...s,
    designs: [
      { ...ported, id: "d1" },
      { ...mltl, id: "d2", name: "MLTL, empty", sections: mltl.sections.map((x) => ({ ...x, fill_kgm3: 0 })) },
      { ...mltl, id: "d3", name: "MLTL" },
    ],
  };
}

/**
 * The DVC wiring guide: a Dayton Audio UMII12-22 (dual 2 Ω coils; its T/S parameters are for
 * the coils in series) wired in series (4 Ω, the main driver) and in parallel (1 Ω, the
 * comparison driver), in Dayton's 1 ft³ sealed and 2.5 ft³ ported (25 Hz) boxes, behind a
 * 20 Hz 24 dB/oct high-pass filter, with 0.15 Ω of amplifier + cable resistance and the limits
 * of a Kicker CXA1200.1 (600 W into 4 Ω = 49 V, 1200 W into 1 Ω = 34.6 A). "watts" drives each
 * wiring with the same rated power (300 W); "volts" with the same amplifier voltage (20 V), as
 * an unchanged gain knob would.
 */
export const DVC_AMP = { volts: 49, amps: 34.6 };
export const DVC_RG = 0.15;
function dvcExample(drive: "watts" | "volts") {
  return (): AppState => {
    const base = withDriver({ ...DEFAULT_STATE, highPass: highPass(4, 20) }, "dayton-audio/umii12-22");
    const s: AppState = {
      ...base,
      ...(drive === "watts" ? { drive: "watts" as const, power: 300 } : { drive: "volts" as const, volts: 20 }),
      dvc: { on: true, entered: "series", wired: "series" },
      settings: { ...base.settings, rg: DVC_RG, ampVolts: DVC_AMP.volts, ampAmps: DVC_AMP.amps },
    };
    return {
      ...s,
      compare: asCompare({ ...s, dvc: { on: true, entered: "series", wired: "parallel" } }),
      designs: [
        { ...byKind(DEFAULT_STATE, "sealed"), id: "d1", name: "Sealed 28.3 L (1 ft³)", vb_l: 28.3 },
        { ...ventedWith(byKind(DEFAULT_STATE, "vented") as Vented, "Ported 70.8 L (2.5 ft³), 25 Hz", 70.8, 25, { shape: "slot", width_cm: 5, height_cm: 30 }), id: "d2" },
      ],
    };
  };
}

/**
 * The round vs slot port guide: a Dayton Audio RSS265HF-4 in 40 L tuned to 35 Hz behind a 25 Hz
 * 24 dB/oct high-pass filter, with a 4″ (10.16 cm) round port flared 2.5 cm at both ends, an
 * 8:1 slot of the same area (25.5 × 3.2 cm) cut to the length the app gives for 35 Hz, and a
 * stand-in for that slot built along the box walls: a straight tube of the same area with the
 * extra length the forums' K = 2.227 shelf-vent end correction would add ((2.227 − 0.732) × the
 * 10.16 cm equivalent diameter = 15.2 cm), i.e. how it may tune as built.
 * At 350 W, the driver's rating. "pipes" turns on ports as pipes, to show the first pipe resonance.
 */
export const PORT_SHAPE = { round_cm: 10.16, flare_cm: 2.5, vb_l: 40, fb: 35, kShelf: 2.227 };
function portShapeExample(pipes: boolean) {
  return (): AppState => {
    const base = withDriver({ ...DEFAULT_STATE, power: 350, highPass: highPass(4, 25) }, "dayton-audio/rss265hf-4");
    const s: AppState = { ...base, settings: { ...base.settings, portCompression: true, ...(pipes ? { portModel: "pipe" as const } : {}) } };
    const v = byKind(DEFAULT_STATE, "vented") as Vented;
    const { round_cm, flare_cm, vb_l, fb, kShelf } = PORT_SHAPE;
    const area = Math.PI * (round_cm / 2) ** 2;
    const h = Math.round(Math.sqrt(area / 8) * 100) / 100;
    const w = Math.round((area / h) * 10) / 10;
    const slot = ventedWith(v, `8:1 slot ${w} × ${h} cm, as calculated`, vb_l, fb, { shape: "slot", width_cm: w, height_cm: h });
    const extra = Math.round((kShelf - 0.732) * 2 * Math.sqrt((w * h) / Math.PI) * 10) / 10;
    return {
      ...s,
      designs: [
        { ...ventedWith(v, `4″ round port, flared`, vb_l, fb, { shape: "round", diameter_cm: round_cm, flare_cm }), id: "d1" },
        { ...slot, id: "d2" },
        // A wall-backed slot can't be modelled directly (the end correction is one setting for
        // every port), so its stand-in: a plain tube of the same area, the extra end correction
        // added as length. It tunes, moves air and resonates as the slot would with K 2.227.
        {
          ...slot,
          id: "d3",
          name: `Stand-in: the slot if its walls add K ${kShelf}`,
          shape: "round",
          diameter_cm: Math.round(2 * Math.sqrt((w * h) / Math.PI) * 100) / 100,
          flare_cm: 0,
          length_cm: Math.round((slot.length_cm + extra) * 10) / 10,
        },
      ],
    };
  };
}

/**
 * The Hofmann's Iron Law guide: a B&C 18SW115 (8 Ω, PA) as the main driver and a Dayton Audio
 * SS18-22 (dual 2 Ω coils in series, 4 Ω, home) as the comparison driver, at 1 W, in each maker's
 * recommended ported box: B&C's 150 L tuned to 35 Hz, and Parts Express's 5 ft³ (141.6 L) for the
 * SS18-22 (F3 26 Hz; tuned here to 21 Hz, its QB3 tuning), with a 20 cm port behind an 18 Hz
 * 24 dB/oct high-pass filter; "sealed" puts both in a 141.6 L sealed box with no filter.
 */
function ironLawExample(box: "ported" | "sealed") {
  return (): AppState => {
    const base = withDriver({ ...DEFAULT_STATE, power: 1, highPass: box === "ported" ? highPass(4, 18) : { ...DEFAULT_STATE.highPass, on: false } }, "bc-speakers/18sw115-8ohm");
    const home = withDriver(DEFAULT_STATE, "dayton-audio/ss18-22");
    const v = byKind(DEFAULT_STATE, "vented") as Vented;
    return {
      ...base,
      compare: asCompare({ ...home, dvc: { on: true, entered: "series", wired: "series" } }),
      designs:
        box === "ported"
          ? [
              { ...ventedWith(v, "PA box: 150 L, 35 Hz", 150, 35, { shape: "round", diameter_cm: 20 }), id: "d1" },
              { ...ventedWith(v, "Home box: 141.6 L, 21 Hz", 141.6, 21, { shape: "round", diameter_cm: 20 }), id: "d2" },
            ]
          : [{ ...byKind(DEFAULT_STATE, "sealed"), id: "d1", name: "Sealed 141.6 L", vb_l: 141.6 }],
    };
  };
}

/**
 * The baffle step guide: an SB Acoustics SB17NRX2C35-8 in its Keele box (35 L tuned to 33 Hz,
 * a 5 cm port flared 1 cm) at 2.83 V, on a 20 × 32 cm front baffle with the woofer 10 cm from
 * the side and 22 cm from the top (a two-way's tweeter above it): on an infinite baffle
 * ("ib"), free-standing ("free"), free-standing with the app's +3 dB low shelf at the step
 * ("eq3"), and with a passive 6 dB compensation network, a 2.4 mH coil with a 5.6 Ω resistor
 * across it in line with the woofer ("passive").
 */
export const BAFFLE = { on: true, fromBox: false, width_cm: 20, height_cm: 32, x_cm: 10, y_cm: 22 };
function baffleExample(kind: "ib" | "free" | "eq3" | "passive") {
  return (): AppState => {
    const s = withDriver({ ...DEFAULT_STATE, drive: "volts", volts: 2.83 }, "sb-acoustics/sb17nrx2c35-8");
    const align = alignmentDriver(solveDriver(s), s)!;
    const a = keeleAlignment(align)!;
    const vb = Math.round(a.vb_l * 10) / 10;
    const fb = Math.round(a.fb * 10) / 10;
    const box = { ...ventedWith(byKind(DEFAULT_STATE, "vented") as Vented, `Ported ${vb} L, ${fb} Hz`, vb, fb, { shape: "round", diameter_cm: 5, flare_cm: 1 }), id: "d1" };
    const baffled = { ...s, designs: [box], baffle: kind === "ib" ? { ...BAFFLE, on: false } : BAFFLE };
    if (kind === "eq3") {
      const step = baffleStepFrequency(baffleOf(baffled, solveDriver(s).values.sd_cm2)!);
      return { ...baffled, eq: [{ id: "e1", on: true, target: "all", type: "lowshelf", freq: Math.round(step), gain_db: 3, q: 0.5 }] };
    }
    if (kind === "passive") return { ...baffled, passive: { on: true, branches: [{ r: 5.6, l_mH: 2.4, join: "parallel" }, {}, {}, {}] } };
    return baffled;
  };
}

/**
 * The shaped-cabinets guide's example: the port guide's sub (an RSS315HF-4 in 83.5 L at 23.8 Hz,
 * 10 cm flared port, 300 W behind a 20 Hz high-pass) built four ways, each sized by the volume
 * calculator ("Size the box") to the same 83.5 L net: a golden-ratio MDF box, a 14″ Sonotube
 * with double-MDF end caps, a sphere and a tapered (truncated pyramid) box.
 */
export const SHAPED = { vb_l: 83.5, fb: 23.8 };
export const SHAPED_START: Record<"box" | "tube" | "sphere" | "wedge", Partial<AppState["volume"]>> = {
  box: { shape: "box", width_cm: 40, height_cm: 65, depth_cm: 25, wall_mm: 18, bracing_pct: 3 },
  // A 14″ Sonotube: sold by its inside diameter (35.56 cm), 6 mm wall; end caps two layers of 19 mm MDF.
  tube: { shape: "cylinder", diameter_cm: 36.8, height_cm: 100, wall_mm: 6, capWall_mm: 38, bracing_pct: 0 },
  sphere: { shape: "sphere", diameter_cm: 60, wall_mm: 15, bracing_pct: 0 },
  wedge: { shape: "frustum", width_cm: 50, depth_cm: 50, topWidth_cm: 30, topDepth_cm: 30, height_cm: 60, wall_mm: 18, bracing_pct: 3 },
};
function shapedExample(kind: keyof typeof SHAPED_START) {
  return (): AppState => {
    const s = withDriver({ ...DEFAULT_STATE, power: 300, highPass: highPass(4, 20) }, "dayton-audio/rss315hf-4");
    const box = { ...ventedWith(byKind(s, "vented") as Vented, "Ported 83.5 L, 23.8 Hz", SHAPED.vb_l, SHAPED.fb, { shape: "round", diameter_cm: 10, flare_cm: 2.5 }), id: "d1" };
    const start: AppState = {
      ...s,
      designs: [box],
      volume: { ...s.volume, ...SHAPED_START[kind], link: "d1", driverDisp_l: Math.round(estimateDriverDisplacement(282, 146) * 100) / 100, portWall_mm: 3 },
    };
    return { ...start, volume: dimensionsFor(start, box, SHAPED.vb_l, kind === "box" ? "golden" : kind === "tube" ? "length" : "keep")! };
  };
}


/**
 * The amplifier guide's example: the port guide's sub (an RSS315HF-4 in 83.5 L at 23.8 Hz, 10 cm
 * flared port, 20 Hz high-pass) on a Crown XLS 1002, modelled as a voltage and a current limit
 * that reproduce its ratings: 37.4 V and 16.6 A per channel (350 W into 4 Ω, 550 W into 2 Ω),
 * 74.8 V and 16.6 A bridged (700 W into 8 Ω, 1100 W into 4 Ω). Two subs are one 167 L box with
 * two drivers and two ports (the same as two 83.5 L boxes). Driven at 35.2 V per driver: the
 * driver's 400 W rating as V²/Re.
 */
export const AMP = { channel: { volts: 37.4, amps: 16.6 }, bridged: { volts: 74.8, amps: 16.6 } };
function ampExample(kind: "one" | "parallel" | "series" | "bridged") {
  return (): AppState => {
    const n = kind === "one" ? 1 : 2;
    const wiring = kind === "series" || kind === "bridged" ? "series" : "parallel";
    const s = withDriver({ ...DEFAULT_STATE, drive: "volts", volts: 35.2 * (wiring === "series" ? n : 1), highPass: highPass(4, 20), drivers: n, wiring }, "dayton-audio/rss315hf-4");
    const one = ventedWith(byKind(s, "vented") as Vented, "", 83.5, 23.8, { shape: "round", diameter_cm: 10, flare_cm: 2.5 });
    const names = { one: "One sub, one channel", parallel: "Two subs in parallel, one channel", series: "Two subs in series, one channel", bridged: "Two subs in series, bridged" };
    const box = { ...one, name: names[kind], vb_l: 83.5 * n, count: n, id: "d1" };
    const amp = kind === "bridged" ? AMP.bridged : AMP.channel;
    return { ...s, designs: [box], settings: { ...s.settings, ampVolts: amp.volts, ampAmps: amp.amps } };
  };
}

/**
 * The design assistant guide: what the assistant opens for its own home-subwoofer defaults (80 L,
 * 300 W, 4 Ω, 8–18″, balanced): its first result, a Dayton Audio RSS315HO-44 (coils in series,
 * 8 Ω) with two RSS315-PRs (+723 g each) in 43.5 L at 23 Hz, opened with the same driver's ported
 * box ("Open with ported too": the port it picks, 5 cm flared 1.5 cm, is all that fits) and its
 * sealed box. Fixed here; guideNumbers checks the assistant still gives them.
 */
export const ASSISTANT_EX = { power: 300, pr_l: 43.5, fb: 23, prMass_g: 723, prCount: 2, sealed_l: 23, port: { diameter_cm: 5, flare_cm: 1.5, length_cm: 23.8 } };
function assistantExample(): AppState {
  const s = withDriver({ ...DEFAULT_STATE, power: ASSISTANT_EX.power, highPass: { ...DEFAULT_STATE.highPass, on: false } }, "dayton-audio/rss315ho-44");
  const pr = byKind(DEFAULT_STATE, "pr") as Extract<DesignState, { kind: "pr" }>;
  const v = byKind(DEFAULT_STATE, "vented") as Vented;
  return {
    ...s,
    dvc: { on: true, entered: "series", wired: "series" },
    designs: [
      { ...pr, id: "d1", name: "PR RSS315HO-44", vb_l: ASSISTANT_EX.pr_l, prName: "Dayton Audio RSS315-PR", count: ASSISTANT_EX.prCount, addedMass_g: ASSISTANT_EX.prMass_g, targetFb: ASSISTANT_EX.fb, params: prParams("dayton-audio/rss315-pr"), extra: [], preset: "Assistant" },
      { ...v, id: "d2", name: "Ported RSS315HO-44", vb_l: ASSISTANT_EX.pr_l, shape: "round", ...ASSISTANT_EX.port, count: 1, targetFb: ASSISTANT_EX.fb, preset: "Assistant" },
      { ...byKind(DEFAULT_STATE, "sealed"), id: "d3", name: "Sealed RSS315HO-44", vb_l: ASSISTANT_EX.sealed_l, preset: "Assistant" },
    ],
  };
}

export const EXAMPLES: Record<string, () => AppState> = {
  "assistant-example": assistantExample,
  "stuffing-sealed": stuffingSealed(false),
  "stuffing-sealed-losses": stuffingSealed(true),
  "stuffing-ported-empty": stuffingPorted(false),
  "stuffing-ported-filled": stuffingPorted(true),
  "mismatch-example": mismatchExample,
  "port-tuning-example": portTuningExample,
  "losses-ql10": lossesExample(10),
  "losses-ql5": lossesExample(5),
  "lt-example": ltExample,
  "iso-single": isoExample(false),
  "iso-pair": isoExample(true),
  "box-types-example": boxTypesExample(true),
  "box-types-nofilter": boxTypesExample(false),
  "subsonic-off": subsonicExample(false),
  "subsonic-on": subsonicExample(true),
  "car-example": carExample(true),
  "car-nocabin": carExample(false),
  "compare-example": compareExample,
  "ts-example": tsExample,
  "pr-example": prExample,
  "winisd-example": winisdExample,
  "port-example": portExample,
  "tl-example": tlExample,
  "qtc-example": qtcExample,
  "group-delay": groupDelayExample(false),
  "subs-example": subsExample("parallel"),
  "coil-20": compressionExample(20),
  "coil-120": compressionExample(120),
  "coil-180": compressionExample(180),
  "subs-series": subsExample("series"),
  "group-delay-subsonic": groupDelayExample(true),
  "mltl-example": mltlExample,
  "dvc-watts": dvcExample("watts"),
  "dvc-volts": dvcExample("volts"),
  "port-shape": portShapeExample(false),
  "amp-one": ampExample("one"),
  "amp-parallel": ampExample("parallel"),
  "amp-series": ampExample("series"),
  "amp-bridged": ampExample("bridged"),
  "shape-box": shapedExample("box"),
  "shape-tube": shapedExample("tube"),
  "shape-sphere": shapedExample("sphere"),
  "shape-wedge": shapedExample("wedge"),
  "port-shape-pipes": portShapeExample(true),
  "iron-law": ironLawExample("ported"),
  "iron-law-sealed": ironLawExample("sealed"),
  "baffle-ib": baffleExample("ib"),
  "baffle-free": baffleExample("free"),
  "baffle-eq3": baffleExample("eq3"),
  "baffle-passive": baffleExample("passive"),
};

/** Share links (`https://…/#z=…`) for every example. */
export async function exampleLinks(site: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, make] of Object.entries(EXAMPLES)) out[name] = `${site}/#${await encodeStateShort(make())}`;
  return out;
}
