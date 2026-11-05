/**
 * Live example designs for the guides, built from the database at build time so their
 * links always open in the current version of the app. Each is a state for the app's
 * share link (`#z=…`); a page refers to one as {{link:<name>}}.
 */
import { readFileSync } from "node:fs";
import { DEFAULT_STATE, asCompare, encodeStateShort, newDesign, type AppState, type DesignState } from "../packages/web/src/state.ts";
import { sizeAllForDriver } from "../packages/web/src/presets.ts";

/** A fresh line design, as "+ Transmission line" adds one. */
const newLine = (s: AppState) => newDesign("line", s.designs);
import { portLengthForFb, type PortInput } from "../packages/engine/src/index.ts";
import { alignmentDriver, driverInputOf, simOptionsOf, solveDriver } from "../packages/web/src/sim.ts";
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

export const EXAMPLES: Record<string, () => AppState> = {
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
};

/** Share links (`https://…/#z=…`) for every example. */
export async function exampleLinks(site: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, make] of Object.entries(EXAMPLES)) out[name] = `${site}/#${await encodeStateShort(make())}`;
  return out;
}
