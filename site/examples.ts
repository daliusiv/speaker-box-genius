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
import { keeleAlignment, portLengthForFb, sealedVolumeForAlignment, type PortInput } from "../packages/engine/src/index.ts";
import { alignmentDriver, driverInputOf, runDesigns, simOptionsOf, solveDriver } from "../packages/web/src/sim.ts";
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
 * The passive radiator guide's worked example: a Dayton Audio DSA215-8 in 16.2 L (its QB3
 * alignment, tuned to 39.8 Hz), as a ported box and with one DS215-PR plus 17 g, at 35 W
 * behind a 30 Hz high-pass filter (what keeps the cone in check below the tuning).
 */
function prExample(): AppState {
  const s = withDriver(
    { ...DEFAULT_STATE, power: 35, highPass: { ...DEFAULT_STATE.highPass, on: true, type: "butterworth", order: 2, freq: 30 } },
    "dayton-audio/dsa215-8",
  );
  const vented = byKind(s, "vented") as Extract<DesignState, { kind: "vented" }>;
  const pr = byKind(s, "pr") as Extract<DesignState, { kind: "pr" }>;
  const vb = 16.2;
  const fb = 39.8;
  // A 5 cm port: short enough to fit in the box, but it chuffs at 35 W (the guide's point).
  const port = { shape: "round" as const, diameter_cm: 5, length_cm: 10 };
  const length = portLengthForFb(vb, port, fb);
  return {
    ...s,
    designs: [
      { ...vented, name: "Ported", vb_l: vb, shape: "round", diameter_cm: 5, length_cm: Math.round(length * 10) / 10, count: 1, targetFb: fb, preset: "QB3" },
      { ...pr, name: "PR", vb_l: vb, prName: "Dayton Audio DS215-PR", params: prParams("dayton-audio/ds215-pr"), count: 1, addedMass_g: 17, targetFb: fb, extra: [] },
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
 * Sealed vs ported vs PR: a Dayton Audio RSS265HF-4 10″ (Qts 0.45, EBP 48: either box suits
 * it) as the app's presets size it: sealed Qtc 0.707, ported Keele (6 × 30 cm slot), and two
 * RSS265-PRs in the same box, at 130 W behind a 24 dB/oct high-pass at 18 Hz.
 */
function boxTypesExample(): AppState {
  let s = withDriver({ ...DEFAULT_STATE, power: 130, highPass: highPass(4, 18) }, "dayton-audio/rss265hf-4");
  s = {
    ...s,
    designs: s.designs.map((d) =>
      d.kind === "pr" ? { ...d, name: "Passive radiators", prName: "Dayton Audio RSS265-PR", params: prParams("dayton-audio/rss265-pr"), count: 2, extra: [] } : d,
    ),
  };
  s = sizeAllForDriver(s).state;
  return {
    ...s,
    designs: s.designs.map((d) =>
      d.kind === "vented" ? { ...ventedWith(d, "Ported", d.vb_l, d.targetFb, { shape: "slot", width_cm: 6, height_cm: 30 }), preset: d.preset } : d,
    ),
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
 * The car subwoofer guide: an RSS265HF-4 at 200 W in a car (cabin gain on), behind a
 * 24 dB/oct high-pass at 24 Hz: a 28 L sealed box, and 45 L ported tuned to 33 or 28 Hz.
 */
function carExample(): AppState {
  const s = withDriver({ ...DEFAULT_STATE, power: 200, highPass: highPass(4, 24) }, "dayton-audio/rss265hf-4");
  const sealed = byKind(s, "sealed") as Extract<DesignState, { kind: "sealed" }>;
  const v = byKind(s, "vented") as Vented;
  return {
    ...s,
    roomGain: { ...s.roomGain, mode: "car" },
    designs: [
      { ...sealed, id: "d1", name: "Sealed 28 L", vb_l: 28 },
      { ...ventedWith(v, "Ported 45 L, 33 Hz", 45, 33, { shape: "slot", width_cm: 5, height_cm: 30 }), id: "d2" },
      { ...ventedWith(v, "Ported 45 L, 28 Hz", 45, 28, { shape: "slot", width_cm: 5, height_cm: 30 }), id: "d3" },
    ],
  };
}

/**
 * Comparing drivers: the RSS265HF-4 with the RSS265HO-4 as the comparison driver, in a 30 L
 * sealed box and a 40 L ported box tuned to 30 Hz, at 150 W behind a 24 dB/oct high-pass at 20 Hz.
 */
function compareExample(): AppState {
  const s = withDriver({ ...DEFAULT_STATE, power: 150, highPass: highPass(4, 20) }, "dayton-audio/rss265hf-4");
  const sealed = byKind(s, "sealed") as Extract<DesignState, { kind: "sealed" }>;
  const v = byKind(s, "vented") as Vented;
  return {
    ...s,
    compare: asCompare(withDriver(DEFAULT_STATE, "dayton-audio/rss265ho-4")),
    designs: [
      { ...sealed, id: "d1", name: "Sealed 30 L", vb_l: 30 },
      { ...ventedWith(v, "Ported 40 L", 40, 30, { shape: "slot", width_cm: 5, height_cm: 30 }), id: "d2" },
    ],
  };
}

/** T/S parameters guide: the DSA215-8 in its Qtc 0.707 sealed box and its QB3 ported box (5 cm port). */
function tsExample(): AppState {
  const s = sizeAllForDriver(withDriver({ ...DEFAULT_STATE, power: 35, highPass: highPass(2, 30) }, "dayton-audio/dsa215-8")).state;
  return {
    ...s,
    designs: s.designs
      .filter((d) => d.kind === "sealed" || d.kind === "vented")
      .map((d) => (d.kind === "vented" ? { ...ventedWith(d, "Ported", d.vb_l, d.targetFb, { shape: "round", diameter_cm: 5 }), preset: d.preset } : d)),
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

export const EXAMPLES: Record<string, () => AppState> = {
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
  "box-types-example": boxTypesExample,
  "subsonic-off": subsonicExample(false),
  "subsonic-on": subsonicExample(true),
  "car-example": carExample,
  "compare-example": compareExample,
  "ts-example": tsExample,
  "pr-example": prExample,
  "winisd-example": winisdExample,
  "port-example": portExample,
  "tl-example": tlExample,
  "qtc-example": qtcExample,
  "group-delay": groupDelayExample(false),
  "group-delay-subsonic": groupDelayExample(true),
  "mltl-example": mltlExample,
};

/** Share links (`https://…/#z=…`) for every example. */
export async function exampleLinks(site: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, make] of Object.entries(EXAMPLES)) out[name] = `${site}/#${await encodeStateShort(make())}`;
  return out;
}
