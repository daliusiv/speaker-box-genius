import { DEFAULT_END_CORRECTION, TS_PARAMS, type EqStage, type HighPassType, type PassiveBranch, type PassiveRadiatorInput, type SemiInductance, type TsValues } from "@sbg/engine";
import { stuffable, stuffingFrom, type Stuffing } from "./stuffing.ts";

export type DesignKind = "sealed" | "vented" | "pr" | "bandpass" | "line";
export type ShapeKind = "box" | "cylinder" | "sphere" | "frustum";
export type PrParams = Required<Pick<PassiveRadiatorInput, "mms_g" | "sd_cm2" | "xmax_mm" | "qms" | "vas_l">>;

interface DesignBase {
  /** Stable id, used by the volume calculator link and as React key. */
  id: string;
  name: string;
  on: boolean;
  vb_l: number;
  /** The preset it was last sized with (a tag on the card), e.g. "QB3" or "Qtc 0.707". */
  preset?: string;
  /**
   * Sealed, ported and PR boxes: fibre fill or lining. `vb_l` stays the real net volume;
   * the simulation uses the bigger volume the stuffing makes it act as, and its Qa. Absent = none.
   */
  stuffing?: Stuffing;
}

export interface SealedDesign extends DesignBase {
  kind: "sealed";
}

export interface VentedDesign extends DesignBase {
  kind: "vented";
  shape: "round" | "slot";
  diameter_cm: number;
  slotWidth_cm: number;
  slotHeight_cm: number;
  length_cm: number;
  count: number;
  /** Last tuning frequency asked for with "Set port length". */
  targetFb: number;
  /** Round ports: round-over radius at both ends (cm), 0 = straight. */
  flare_cm: number;
}

/** A further group of passive radiators in the same box (a different model, or the same with other added mass). */
export interface PrGroupState {
  prName: string;
  count: number;
  addedMass_g: number;
  params: PrParams;
}

export interface PrDesign extends DesignBase {
  kind: "pr";
  prName: string;
  count: number;
  addedMass_g: number;
  targetFb: number;
  params: PrParams;
  /** Mixed passive radiators: groups after the first. */
  extra: PrGroupState[];
}

/** A port's size and count, shared by ported and bandpass designs. */
export interface PortFields {
  shape: "round" | "slot";
  diameter_cm: number;
  slotWidth_cm: number;
  slotHeight_cm: number;
  length_cm: number;
  count: number;
  /** Last tuning frequency asked for with "Set port length". */
  targetFb: number;
  /** Round port: round-over radius at both ends (0 = a straight tube). */
  flare_cm?: number;
}

export type BandpassOrder = "4" | "6p" | "6s";

/**
 * Bandpass box. `vb_l` is the rear chamber (the one the volume calculator feeds).
 * "4": closed rear, ported front. "6p": both ported to the outside.
 * "6s": series-tuned, the rear chamber's port opens into the front chamber.
 */
/** What a bandpass chamber opens through. */
export type ChamberOpening = "port" | "pr";

export interface BandpassDesign extends DesignBase {
  kind: "bandpass";
  order: BandpassOrder;
  frontVb_l: number;
  front: PortFields;
  rear: PortFields;
  /** Port or passive radiators, per chamber (the rear one only matters for 6th order). */
  frontOpening: ChamberOpening;
  rearOpening: ChamberOpening;
  /** Passive radiator groups used when that chamber's opening is "pr" (at least one). */
  frontPrs: PrGroupState[];
  rearPrs: PrGroupState[];
  /** Box losses for each chamber, or null to use the ones in Settings (and WinISD's 100 between the chambers). */
  losses: BandpassLosses | null;
}

export interface ChamberLosses {
  ql: number;
  qa: number;
  qp: number;
}

export interface BandpassLosses {
  front: ChamberLosses;
  rear: ChamberLosses;
  /** Leakage between the chambers, as a Q referred to the driver (WinISD's Qiclfr, default 100). */
  qicl: number;
}

/** Per-chamber losses starting from the shared ones. */
export const bandpassLossesFrom = (l: ChamberLosses): BandpassLosses => ({ front: { ...l }, rear: { ...l }, qicl: 100 });

/** One section of a line: from where the previous one ends to its own end area. */
export interface LineSection {
  length_cm: number;
  endArea_cm2: number;
  taper: "linear" | "conical" | "exponential";
  /** Stuffing density (kg/m³), 0 = empty. */
  fill_kgm3: number;
}

/**
 * Transmission line family: sections from the closed end to the mouth, the driver
 * somewhere along it, and the end open (TL, TQWT), ported (MLTL) or a tapped horn (the
 * driver's front feeds the line further along). `vb_l` is kept equal to the line's volume.
 */
export interface LineDesign extends DesignBase {
  kind: "line";
  closedArea_cm2: number;
  sections: LineSection[];
  /** Driver centre (its rear, for a tapped horn) from the closed end. */
  driverAt_cm: number;
  /** open/port: TL family; tapped: tapped horn; horn: front-loaded horn (driver at the throat). */
  end: "open" | "port" | "tapped" | "horn";
  /** Tapped horn: where the driver's front feeds the line, from the closed end. */
  tapAt_cm: number;
  portDiameter_cm: number;
  portLength_cm: number;
  portFlare_cm: number;
  /** Where the mouth is: next to the driver, on the back (fold depth), or a set extra distance. */
  mouth: "front" | "back" | "custom";
  mouthDistance_cm: number;
  /** Folding into a box: inside width of the line and number of folds. */
  fold: { width_cm: number; folds: number };
  /** Last tuning asked for with "Set length". */
  targetFb: number;
  /** Front-loaded horn: sealed chamber behind the driver and the chamber in front of it (litres). */
  rearChamber_l: number;
  throatChamber_l: number;
}

export type DesignState = SealedDesign | VentedDesign | PrDesign | BandpassDesign | LineDesign;

/** An EQ stage plus where it applies: every design, or one design by id. */
export type EqItem = EqStage & { id: string; on: boolean; target: string };

export const MAX_DESIGNS = 8;

/** Starting points for the room / cabin gain presets. */
export const ROOM_PRESETS = {
  car: { length_cm: 250, slope: 12, max_db: 18 },
  room: { length_cm: 500, slope: 6, max_db: 10 },
} as const;

export interface Settings {
  /** Unit system for box sizes and volumes. */
  units: "metric" | "imperial";
  /** Air constants: 20 °C standard, WinISD's or Hornresp's values, or your own conditions. */
  air: "standard" | "winisd" | "hornresp" | "custom";
  /** The air for "custom": temperature, humidity and pressure (engine airAt). */
  airConditions: { temp_C: number; humidity_pct: number; pressure_hPa: number };
  /** Port air velocity shown as peak (default) or RMS. */
  velocity: "peak" | "rms";
  /** Amplifier output + cable resistance (Ω). */
  rg: number;
  /**
   * What the driver's power rating is held against on the Max SPL chart: V²/Re ("nominal",
   * like WinISD) or the real power it takes ("real", like Hornresp).
   */
  thermalLimit: "nominal" | "real";
  /** The amplifier's own limits on the Max SPL chart: RMS volts and amps at its output (0 = none). */
  ampVolts: number;
  ampAmps: number;
  /** Include voice-coil inductance (Le, and L2/R2 when entered) in the simulation. WinISD leaves it out by default. */
  inductance: boolean;
  /** Box losses as Q values at the tuning frequency: leakage, absorption, port. WinISD's defaults are 10 / 100 / 100. */
  losses: { ql: number; qa: number; qp: number };
  /** Port compression: turbulent port loss that grows with air speed (approximate). Off = like WinISD. */
  portCompression: boolean;
  /**
   * Lines and horns: SPL in front of the box ("on-axis", default) or from the power each opening
   * radiates ("power"), as Hornresp shows it. They part once a mouth is large next to the wavelength.
   */
  lineSpl: "on-axis" | "power";
  /** Vented boxes: ports as lumped air masses (like WinISD) or as pipes with their own resonances. */
  portModel: "lumped" | "pipe";
  /**
   * Port end correction K (× the port's equivalent diameter): how much longer than its physical
   * length a port acts. 0.732 (one end flanged, one free, like WinISD) unless you know better,
   * e.g. from measuring your own slot ports.
   */
  endCorrection: number;
  /** Box leakage: the air that leaks out is heard ("radiates", like WinISD) or lost ("absorbed", like Hornresp). */
  leakage: "radiates" | "absorbed";
  /**
   * What the watts mean: "winisd" (like WinISD) the power into the coil and the amp + cable
   * resistance, with a hot coil's Re; "circuit" (like Hornresp) the volts an amplifier gives
   * into the cold Re, with the amp + cable resistance in the circuit.
   */
  driveModel: "winisd" | "circuit";
  /** Sealed, ported and PR boxes: the cone's front air as a fixed mass (like WinISD) or a piston's radiation impedance (like Hornresp). */
  coneLoad: "mass" | "piston";
  /** Voice-coil temperature (°C): 20 = the datasheet's cold values (like WinISD); hotter raises Re. */
  coilTemp_C: number;
  /**
   * Chuffing line for port (and line mouth) air speed, m/s in the displayed convention: 17 is
   * the usual guide for quiet hi-fi ports; car SPL builds often accept 25–30.
   */
  portLimit_ms: number;
  /**
   * Passive radiators: the share of Xmax (%) from which the PR excursion chart shades a caution
   * band, where a PR's suspension stiffens and its distortion rises (a rule of thumb, not a
   * datasheet figure). 0 = no band.
   */
  prCaution_pct: number;
  /**
   * How the vented alignment presets (QB3, BB4/SBB4, C4/SC4) size a box: as WinISD's wizard does
   * (default; its own curves, which allow for a leaky box and its 0.1 Ω amplifier resistance) or
   * the textbook lossless equations (Thiele/Small/Bullock; QB3/B4, Keele above B4, SQB3).
   */
  alignments: "winisd" | "textbook";
}

/** Everything needed to reproduce a simulation. Stored in the URL hash for sharing. */
/** A measured curve overlaid on the charts: an in-box response (.frd) or impedance (.zma). */
export interface MeasuredCurve {
  id: string;
  name: string;
  kind: "spl" | "impedance";
  on: boolean;
  /** Thinned to 1/24 octave (see thinCurve): Hz and dB or ohms. */
  f: number[];
  v: number[];
  /** dB added to a response, to match the simulation's level. */
  offset_db: number;
  /** Design whose level it was matched to; in the Relative view it shares that design's 0 dB. */
  matchTo: string;
}

export const MAX_MEASURED = 4;

/** Everything that describes one driver and how it's used (count, loading, coils, wiring). */
export const DRIVER_KEYS = [
  "driverName",
  "driverBrand",
  "nominal_ohms",
  "ts",
  "le_mh",
  "l2_mh",
  "r2_ohm",
  "semi",
  "fdd",
  "xmax_mm",
  "pe_w",
  "drivers",
  "wiring",
  "isobaric",
  "isoCoils",
  "dvc",
] as const;
export type DriverSlot = Pick<AppState, (typeof DRIVER_KEYS)[number]>;
/**
 * The fields a comparison driver has of its own; how many drivers there are and how they're
 * loaded and wired stay the main driver's, so the comparison is like for like.
 */
export const COMPARE_KEYS = ["driverName", "driverBrand", "nominal_ohms", "ts", "le_mh", "l2_mh", "r2_ohm", "semi", "fdd", "xmax_mm", "pe_w", "dvc"] as const;
/**
 * The comparison driver: its own T/S, limits and coil wiring, and optionally its own number of
 * drivers and how they're wired (one 15″ against two 10″). Without `drivers` it follows the main
 * driver's count and wiring, so the comparison stays like for like as you change them.
 */
export type CompareDriver = Pick<AppState, (typeof COMPARE_KEYS)[number]> & { drivers?: number; wiring?: "parallel" | "series" };
/** Most drivers a comparison can have (the main driver's field has no upper limit, but links are kept sane). */
export const COMPARE_MAX_DRIVERS = 16;

export interface AppState {
  v: 4;
  driverName: string;
  /** Brand part of driverName (for WinISD export); empty if unknown. */
  driverBrand: string;
  nominal_ohms: number;
  /** T/S values the user entered. Derived values are never stored. */
  ts: TsValues;
  le_mh: number;
  /** L2R2 voice-coil model: Le + (L2 ∥ R2). 0 = plain Le. */
  l2_mh: number;
  r2_ohm: number;
  /**
   * Semi-inductance coil model (Hornresp's: Re + jωLeb + (jωLe ∥ Rss ∥ Ke·√(jω))). When any
   * of Leb, Le, Ke is above 0 it replaces Le and L2R2. Absent = not used.
   */
  semi?: SemiInductance;
  /**
   * Frequency-dependent damping (Hornresp's FDD): the suspension's own Rms (N·s/m) and Ams
   * (mm/N), in place of the Rms from Qms. Absent = not used.
   */
  fdd?: { rms: number; ams_mm_per_n: number };
  xmax_mm: number;
  pe_w: number;
  power: number;
  /** Drive level as power (W, V = √(P·Re) like WinISD) or as a voltage (e.g. 2.83 V, as datasheets quote). */
  drive: "watts" | "volts";
  volts: number;
  drivers: number;
  /** How several drivers (or isobaric pairs) are wired to the amplifier. */
  wiring: "parallel" | "series";
  /** Isobaric loading: each "driver" above is a pair working as one. */
  isobaric: boolean;
  /** Voice coils within an isobaric pair. */
  isoCoils: "series" | "parallel";
  /**
   * Dual voice coil drivers: what the entered Re / Qes / Le describe (one coil on its own,
   * or both coils wired in parallel or series) and how the coils are actually wired.
   */
  dvc: { on: boolean; entered: "one" | "parallel" | "series"; wired: "parallel" | "series" };
  /** Low-frequency lift of the listening space, added to the SPL curves. */
  /** "curve": a profile of your own (dB against Hz, 0 dB where the space adds nothing), imported from a .txt or .frd file. */
  roomGain: { mode: "off" | "car" | "room" | "curve"; length_cm: number; slope: 6 | 12; max_db: number; curve?: RoomCurve };
  /**
   * Baffle step: the speaker free-standing (full space) with its front baffle, instead of
   * an infinite baffle. Size from the volume calculator's box when `fromBox`.
   */
  baffle: { on: boolean; fromBox: boolean; width_cm: number; height_cm: number; x_cm: number; y_cm: number };
  highPass: { on: boolean; type: HighPassType; order: number; freq: number };
  /** Passive parts between the amplifier and the drivers: branches 1–4 (in line, across, in line, across). */
  passive: { on: boolean; branches: PassiveBranch[] };
  settings: Settings;
  eq: EqItem[];
  /** Measurements overlaid on the charts (travel with the link). */
  measured: MeasuredCurve[];
  /** A second driver shown in every box (faint, dashed) to compare with the main one; null = none. */
  compare: CompareDriver | null;
  designs: DesignState[];
  volume: {
    /** Id of the design whose Vb follows the calculator, or "none". */
    link: string;
    shape: ShapeKind;
    /** External dimensions (cm). Only the ones the shape uses matter. */
    width_cm: number;
    height_cm: number;
    depth_cm: number;
    diameter_cm: number;
    topWidth_cm: number;
    topDepth_cm: number;
    wall_mm: number;
    /** Cylinder: end-cap thickness (mm) when it differs from the tube wall; null = the same as the wall. */
    capWall_mm: number | null;
    driverDisp_l: number;
    prDisp_l: number;
    portWall_mm: number;
    bracing_pct: number;
    other_l: number;
    /** Build sheet: driver and PR cutouts (0 = unknown), stock sheet size and saw kerf (mm). */
    driverCutout_mm: number;
    prCutout_mm: number;
    sheetW_mm: number;
    sheetH_mm: number;
    kerf_mm: number;
  };
}

export const EXAMPLE_PR: PrParams = { mms_g: 122, sd_cm2: 330, xmax_mm: 18, qms: 6, vas_l: 80 };

export function newId(existing: { id: string }[]): string {
  let i = existing.length + 1;
  while (existing.some((d) => d.id === `d${i}`)) i++;
  return `d${i}`;
}

/** A fresh design of the given kind with sensible starting values. */
export function newDesign(kind: DesignKind, existing: DesignState[]): DesignState {
  const id = newId(existing);
  const n = existing.filter((d) => d.kind === kind).length + 1;
  const suffix = n > 1 ? ` ${n}` : "";
  switch (kind) {
    case "sealed":
      return { id, kind, name: `Sealed${suffix}`, on: true, vb_l: 40 };
    case "vented":
      return {
        id,
        kind,
        name: `Ported${suffix}`,
        on: true,
        vb_l: 60,
        // A port that fits a 60 L box and tunes it to 30 Hz (what Size all boxes picks for the
        // example driver). Older links keep the old port (LEGACY_VENTED_PORT, link v3).
        shape: "round",
        diameter_cm: 7.5,
        slotWidth_cm: 20,
        slotHeight_cm: 5,
        length_cm: 21.5,
        count: 1,
        flare_cm: 2,
        targetFb: 30,
      };
    case "line":
      return {
        id,
        kind,
        name: `Transmission line${suffix}`,
        on: true,
        vb_l: 32,
        closedArea_cm2: 200,
        sections: [
          { length_cm: 120, endArea_cm2: 152, taper: "linear", fill_kgm3: 8 },
          { length_cm: 80, endArea_cm2: 120, taper: "linear", fill_kgm3: 0 },
        ],
        driverAt_cm: 0,
        end: "open",
        tapAt_cm: 90,
        portDiameter_cm: 5,
        portLength_cm: 10,
        portFlare_cm: 0,
        mouth: "front",
        mouthDistance_cm: 0,
        fold: { width_cm: 20, folds: 2 },
        targetFb: 40,
        rearChamber_l: 20,
        throatChamber_l: 0,
      };
    case "bandpass":
      return {
        id,
        kind,
        name: `Bandpass${suffix}`,
        on: true,
        order: "4",
        vb_l: 20,
        frontVb_l: 25,
        front: { shape: "round", diameter_cm: 10, slotWidth_cm: 20, slotHeight_cm: 5, length_cm: 25, count: 1, targetFb: 50, flare_cm: 0 },
        rear: { shape: "round", diameter_cm: 7.5, slotWidth_cm: 15, slotHeight_cm: 4, length_cm: 30, count: 1, targetFb: 35, flare_cm: 0 },
        frontOpening: "port",
        rearOpening: "port",
        frontPrs: [{ prName: "Example Audio EX10-PR (fictional)", count: 1, addedMass_g: 0, params: { ...EXAMPLE_PR } }],
        rearPrs: [{ prName: "Example Audio EX10-PR (fictional)", count: 1, addedMass_g: 0, params: { ...EXAMPLE_PR } }],
        losses: null,
      };
    case "pr":
      return {
        id,
        kind,
        name: `Passive radiators${suffix}`,
        on: true,
        vb_l: 50,
        prName: "Example Audio EX10-PR (fictional)",
        count: 2,
        addedMass_g: 100,
        targetFb: 30,
        params: { ...EXAMPLE_PR },
        extra: [],
      };
  }
}

const defaultDesigns = (): DesignState[] => {
  const out: DesignState[] = [];
  for (const k of ["sealed", "vented", "pr"] as const) out.push(newDesign(k, out));
  return out;
};

/** The fictional example driver and PR from docs/examples. */
export const DEFAULT_STATE: AppState = {
  v: 4,
  driverName: "Example Audio EX10-4 (fictional)",
  driverBrand: "Example Audio",
  nominal_ohms: 4,
  ts: { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330 },
  le_mh: 1.2,
  l2_mh: 0,
  r2_ohm: 0,
  xmax_mm: 12,
  pe_w: 250,
  // 1 W into Re, as WinISD and Hornresp (2.83 V into 8 Ω) start, so the charts read the same.
  power: 1,
  drive: "watts",
  volts: 2.83,
  drivers: 1,
  wiring: "parallel",
  isobaric: false,
  isoCoils: "parallel",
  dvc: { on: false, entered: "parallel", wired: "parallel" },
  roomGain: { mode: "off", length_cm: 250, slope: 12, max_db: 18 },
  baffle: { on: false, fromBox: true, width_cm: 25, height_cm: 40, x_cm: 12.5, y_cm: 15 },
  highPass: { on: false, type: "butterworth", order: 2, freq: 18 },
  passive: { on: false, branches: [{}, {}, {}, {}] },
  settings: {
    units: "metric",
    air: "standard",
    airConditions: { temp_C: 20, humidity_pct: 50, pressure_hPa: 1013 },
    velocity: "peak",
    rg: 0.1, // WinISD's default (Rg 0.1 Ω): with it, presets and responses match WinISD as it opens
    thermalLimit: "nominal",
    ampVolts: 0,
    ampAmps: 0,
    inductance: true,
    losses: { ql: 10, qa: 100, qp: 100 },
    portCompression: false,
    lineSpl: "on-axis",
    portModel: "lumped",
    endCorrection: DEFAULT_END_CORRECTION,
    leakage: "radiates",
    driveModel: "circuit",
    coneLoad: "mass",
    coilTemp_C: 20,
    portLimit_ms: 17,
    prCaution_pct: 75,
    alignments: "winisd",
  },
  eq: [],
  measured: [],
  compare: null,
  designs: defaultDesigns(),
  volume: {
    link: "none",
    shape: "box",
    width_cm: 40,
    height_cm: 50,
    depth_cm: 45,
    diameter_cm: 40,
    topWidth_cm: 25,
    topDepth_cm: 30,
    wall_mm: 18,
    capWall_mm: null,
    driverDisp_l: 1.8,
    prDisp_l: 0.6,
    portWall_mm: 3,
    bracing_pct: 3,
    other_l: 0,
    driverCutout_mm: 0,
    prCutout_mm: 0,
    sheetW_mm: 2440,
    sheetH_mm: 1220,
    kerf_mm: 3,
  },
};

// ---------------------------------------------------------------------------
// URL encoding
// ---------------------------------------------------------------------------

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const nonNeg = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** Long form: plain JSON in base64url. Kept for saved projects and as a fallback; always decodes synchronously. */
/** Measured curves from a link: well-formed ones only. */
function measuredFrom(raw: unknown): MeasuredCurve[] {
  if (!Array.isArray(raw)) return [];
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  return raw
    .filter(
      (m: Raw) =>
        m &&
        (m.kind === "spl" || m.kind === "impedance") &&
        Array.isArray(m.f) &&
        Array.isArray(m.v) &&
        m.f.length === m.v.length &&
        m.f.length >= 2 &&
        m.f.every((x: unknown) => num(x) && (x as number) > 0) &&
        m.v.every(num),
    )
    .slice(0, MAX_MEASURED)
    .map((m: Raw, i: number) => ({
      id: typeof m.id === "string" ? m.id : `m${i + 1}`,
      name: typeof m.name === "string" ? m.name.slice(0, 60) : "Measured",
      kind: m.kind,
      on: m.on !== false,
      f: m.f,
      v: m.v,
      offset_db: num(m.offset_db) ? m.offset_db : 0,
      matchTo: typeof m.matchTo === "string" ? m.matchTo : "",
    }));
}

export function encodeState(s: AppState): string {
  return "s=" + toBase64Url(JSON.stringify(s));
}

// Short links: values equal to their defaults are left out, then the JSON is deflated.
// decodeState fills every left-out value back in from the defaults, so only keys whose
// absence decodes to the same value may be dropped:
// - top-level keys, whole (ts never partially: its keys mean "values the user typed");
// - one level into objects that decoding merges with their defaults;
// - per design, its keys against a fresh design of the same kind, one level into front/rear/params.
/** A room-gain profile of your own: its file name and points (Hz increasing, dB). */
export interface RoomCurve {
  name: string;
  f: number[];
  v: number[];
}

/** A link's air conditions, each within what the earth's surface sees (else the default's). */
/** A port end correction from a saved project or link: 0–3 (× diameter), else WinISD's 0.732. */
export const END_CORRECTION_MAX = 3;
function endCorrectionFrom(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= END_CORRECTION_MAX ? raw : DEFAULT_END_CORRECTION;
}

function airConditionsFrom(raw: Raw | undefined, d: Settings["airConditions"]): Settings["airConditions"] {
  const pick = (v: unknown, lo: number, hi: number, dv: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : dv);
  return {
    temp_C: pick(raw?.temp_C, -40, 60, d.temp_C),
    humidity_pct: pick(raw?.humidity_pct, 0, 100, d.humidity_pct),
    pressure_hPa: pick(raw?.pressure_hPa, 500, 1100, d.pressure_hPa),
  };
}

/** A link's room-gain mode and profile: a "curve" mode needs a valid profile, or it's off. */
function roomCurveFields(raw: Raw): { mode: AppState["roomGain"]["mode"]; curve?: RoomCurve } {
  const c = raw?.curve;
  const ok =
    c && Array.isArray(c.f) && Array.isArray(c.v) && c.f.length === c.v.length && c.f.length >= 2 && c.f.length <= 400 &&
    c.f.every((x: unknown, i: number) => typeof x === "number" && x > 0 && (i === 0 || x > c.f[i - 1])) &&
    c.v.every((x: unknown) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 60);
  const curve: RoomCurve | undefined = ok ? { name: typeof c.name === "string" ? c.name.slice(0, 40) : "Room curve", f: c.f, v: c.v } : undefined;
  const mode = ["off", "car", "room", "curve"].includes(raw?.mode) ? raw.mode : "off";
  return { mode: mode === "curve" && !curve ? "off" : mode, ...(curve ? { curve } : {}) };
}

/** A link's passive network: four branches of non-negative R (Ω), L (mH), C (µF), joined in series or parallel. */
function passiveFrom(raw: Raw): AppState["passive"] | null {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.branches)) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
  const branches = [0, 1, 2, 3].map((k) => {
    const b = raw.branches[k] ?? {};
    const out: PassiveBranch = {};
    const r = num(b.r), l = num(b.l_mH), c = num(b.c_uF);
    if (r !== undefined) out.r = r;
    if (l !== undefined) out.l_mH = l;
    if (c !== undefined) out.c_uF = c;
    if (b.join === "parallel") out.join = "parallel";
    return out;
  });
  return { on: raw.on === true, branches };
}

const MERGED_TOP = new Set(["settings", "volume", "highPass", "roomGain", "baffle"]);
const MERGED_DESIGN = new Set(["front", "rear", "params", "fold"]);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function stripKeys(v: Raw, d: Raw, mergedOneLevel: Set<string>, keep: string[]): Raw {
  const out: Raw = {};
  for (const k of Object.keys(v)) {
    if (keep.includes(k)) {
      out[k] = v[k];
    } else if (mergedOneLevel.has(k) && v[k] && typeof v[k] === "object" && d[k] && typeof d[k] === "object") {
      const inner = stripKeys(v[k], d[k], k === "settings" ? new Set(["losses"]) : new Set(), []);
      if (Object.keys(inner).length > 0) out[k] = inner;
    } else if (!sameJson(v[k], d[k])) {
      out[k] = v[k];
    }
  }
  return out;
}

/** The default drive before 8 Nov 2026, for links and saves made then (they leave the power out). */
const LEGACY_POWER_W = 100;

/** A loss Q this high is no loss at all (shown as "none"; clearing a loss field sets it). */
export const NO_LOSS_Q = 1e9;
/** A loss Q for showing: "none" from 10⁶ up (no loss for any practical purpose). */
export const qText = (q: number) => (q >= 1e6 ? "none" : String(q));
/** The props a loss-Q field takes for its "none". */
export const NO_LOSS = { text: "None", at: NO_LOSS_Q } as const;

/**
 * The ported box's port before 8 Nov 2026 (link version 3 and older): 10 cm, 30 cm, straight,
 * too long to fit its 60 L. Links leave out what equals the defaults, so a v3 link without
 * these fields meant this port.
 */
const LEGACY_VENTED_PORT = { diameter_cm: 10, length_cm: 30, flare_cm: 0 } as const;

/** The state with default values left out (see above). The power is always kept (see LEGACY_POWER_W). */
export function compactState(s: AppState): Raw {
  const out = stripKeys({ ...s, designs: [] }, { ...DEFAULT_STATE, designs: [] }, MERGED_TOP, ["v", "driverBrand", "power"]);
  const before: DesignState[] = [];
  out.designs = s.designs.map((d) => {
    const base = newDesign(d.kind, before);
    before.push(d);
    return stripKeys(d, base, MERGED_DESIGN, ["id", "kind", "name"]);
  });
  return out;
}

async function deflate(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

const bytesToB64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64UrlToBytes = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

export const canCompress = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";

/** Text deflated to base64url (for links). */
export async function deflateToB64Url(text: string): Promise<string> {
  return bytesToB64Url(await deflate(text));
}
/** Back from deflateToB64Url; throws on bad input. */
export async function inflateFromB64Url(s: string): Promise<string> {
  return inflate(b64UrlToBytes(s) as Uint8Array<ArrayBuffer>);
}

/** Short form for links: "z=" + deflated JSON without defaults. Falls back to the long form without compression support. */
export async function encodeStateShort(s: AppState): Promise<string> {
  if (!canCompress()) return encodeState(s);
  return "z=" + bytesToB64Url(await deflate(JSON.stringify(compactState(s))));
}

/** Reads either link form (short "z=" or long "s="). */
export async function decodeStateAny(hash: string): Promise<AppState | null> {
  const m = /(?:^#?|&)z=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return decodeState(hash);
  if (!canCompress()) return null;
  try {
    return decodeState("s=" + toBase64Url(await inflate(b64UrlToBytes(m[1]!))));
  } catch {
    return null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

/** Bring an older saved state up to the current version. Each step upgrades by one version. */
function migrate(raw: Raw): Raw {
  if (raw.v === 1 && raw.driver) {
    const d = raw.driver;
    raw = {
      ...raw,
      v: 2,
      ts: { fs: d.fs, qms: d.qms, qes: d.qes, vas_l: d.vas_l, re: d.re, sd_cm2: d.sd_cm2 },
      le_mh: d.le_mh,
      xmax_mm: d.xmax_mm,
      pe_w: d.pe_w,
    };
  }
  if (raw.v === 2) {
    // v2 had exactly one sealed, one ported and one PR design.
    const [s, v, p] = defaultDesigns() as [SealedDesign, VentedDesign, PrDesign];
    // v2's pr.name was the passive radiator model, not the design name.
    const { name: oldPrName, params: oldParams, ...prRest } = (raw.pr ?? {}) as Raw;
    const designs: DesignState[] = [
      { ...s, ...(raw.sealed ?? {}) },
      { ...v, ...LEGACY_VENTED_PORT, ...(raw.vented ?? {}) },
      { ...p, ...prRest, prName: oldPrName ?? p.prName, params: { ...p.params, ...(oldParams ?? {}) } },
    ];
    const idOf: Record<string, string> = { sealed: s.id, vented: v.id, pr: p.id };
    const link = raw.volume?.link;
    raw = {
      ...raw,
      v: 3,
      designs,
      volume: { ...(raw.volume ?? {}), link: link && idOf[link] ? idOf[link] : "none" },
    };
  }
  if (raw.v === 3) {
    // v3 measured ported boxes against the old default port (LEGACY_VENTED_PORT).
    const designs = Array.isArray(raw.designs)
      ? raw.designs.map((x: Raw) => (x?.kind === "vented" ? { ...LEGACY_VENTED_PORT, ...x } : x))
      : raw.designs;
    raw = { ...raw, v: 4, designs };
  }
  return raw;
}

const qOr = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);

/** Per-chamber bandpass losses from a share link or saved project; null (use Settings) if absent. */
function bandpassLossesOf(raw: unknown): BandpassLosses | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const ch = (c: Raw | undefined): ChamberLosses => ({ ql: qOr(c?.ql, 10), qa: qOr(c?.qa, 100), qp: qOr(c?.qp, 100) });
  return { front: ch(r.front), rear: ch(r.rear), qicl: qOr(r.qicl, 100) };
}

/** Passive radiator groups from a share link or saved project, with anything odd fixed. */
function prGroupsFrom(raw: unknown): PrGroupState[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g: unknown) => g && typeof g === "object")
    .map((g: Raw) => ({
      prName: typeof g.prName === "string" ? g.prName : "Passive radiator",
      count: Number.isFinite(g.count) && g.count >= 1 ? Math.round(g.count) : 1,
      addedMass_g: Number.isFinite(g.addedMass_g) && g.addedMass_g >= 0 ? g.addedMass_g : 0,
      params: { ...EXAMPLE_PR, ...(g.params ?? {}) },
    }));
}

/** Line fields from a link, including the first (single-piece) form of 4 Nov 2026. */
function lineFrom(d: Raw, base: LineDesign): Partial<LineDesign> {
  const out: Partial<LineDesign> = {};
  if (!Array.isArray(d.sections) && typeof d.length_cm === "number") {
    // Old form: one piece with stuffing from the closed end for fillLength_cm, maybe a port.
    const L = d.length_cm;
    const s1 = d.closedArea_cm2 ?? base.closedArea_cm2;
    const s2 = d.mouthArea_cm2 ?? s1;
    const taper = ["linear", "conical", "exponential"].includes(d.taper) ? d.taper : "linear";
    const at = (t: number) =>
      taper === "conical" ? (Math.sqrt(s1) + (Math.sqrt(s2) - Math.sqrt(s1)) * t) ** 2 : taper === "exponential" ? s1 * (s2 / s1) ** t : s1 + (s2 - s1) * t;
    const fill = d.fill_kgm3 > 0 ? Math.min(L, Math.max(0, d.fillLength_cm ?? 0)) : 0;
    out.sections = [
      ...(fill > 0 ? [{ length_cm: fill, endArea_cm2: at(fill / L), taper, fill_kgm3: d.fill_kgm3 }] : []),
      ...(L - fill > 0 ? [{ length_cm: L - fill, endArea_cm2: s2, taper, fill_kgm3: 0 }] : []),
    ];
    out.end = d.port === true ? "port" : "open";
  } else {
    out.sections = (Array.isArray(d.sections) ? d.sections : base.sections)
      .filter((x: Raw) => x && x.length_cm > 0 && x.endArea_cm2 > 0)
      .slice(0, 4)
      .map((x: Raw) => ({
        length_cm: x.length_cm,
        endArea_cm2: x.endArea_cm2,
        taper: ["linear", "conical", "exponential"].includes(x.taper) ? x.taper : "linear",
        fill_kgm3: x.fill_kgm3 > 0 ? x.fill_kgm3 : 0,
      }));
    if (out.sections.length === 0) out.sections = base.sections;
    out.end = ["open", "port", "tapped", "horn"].includes(d.end) ? d.end : "open";
  }
  out.mouth = ["front", "back", "custom"].includes(d.mouth) ? d.mouth : "front";
  out.fold = { ...base.fold, ...(d.fold ?? {}) };
  return out;
}

function fixDesign(d: Raw, all: DesignState[]): DesignState | null {
  if (!["sealed", "vented", "pr", "bandpass", "line"].includes(d?.kind)) return null;
  const base = newDesign(d.kind, all);
  const merged = { ...base, ...d } as DesignState;
  if (merged.kind === "pr") {
    merged.params = { ...(base as PrDesign).params, ...(d.params ?? {}) };
    merged.extra = prGroupsFrom(d.extra);
  }
  if (merged.kind === "line") {
    Object.assign(merged, lineFrom(d, base as LineDesign));
    for (const old of ["length_cm", "mouthArea_cm2", "taper", "fill_kgm3", "fillLength_cm", "port"]) delete (merged as Raw)[old];
  }
  if (merged.kind === "bandpass") {
    const b = base as BandpassDesign;
    merged.front = { ...b.front, ...(d.front ?? {}) };
    merged.rear = { ...b.rear, ...(d.rear ?? {}) };
    if (!["4", "6p", "6s"].includes(merged.order)) merged.order = b.order;
    if (merged.frontOpening !== "pr") merged.frontOpening = "port";
    if (merged.rearOpening !== "pr") merged.rearOpening = "port";
    const fp = prGroupsFrom(d.frontPrs);
    const rp = prGroupsFrom(d.rearPrs);
    merged.frontPrs = fp.length ? fp : b.frontPrs;
    merged.rearPrs = rp.length ? rp : b.rearPrs;
    merged.losses = bandpassLossesOf(d.losses);
  }
  if (typeof merged.id !== "string" || all.some((x) => x.id === merged.id)) merged.id = base.id;
  // Older versions put the preset in the name ("Ported QB3"): move it to the tag.
  const old = / (Qtc [\d.]+|QB3|B4|Keele)$/.exec(merged.name ?? "");
  if (old && merged.preset === undefined) {
    merged.preset = old[1];
    merged.name = merged.name.slice(0, -old[0].length);
  }
  if (typeof merged.preset !== "string" || merged.preset.length > 20) delete merged.preset;
  const st = stuffable(merged.kind) ? stuffingFrom(d.stuffing) : undefined;
  if (st) merged.stuffing = st;
  else delete merged.stuffing;
  return merged;
}

/**
 * T/S values from raw (decoded) data: the known parameters with positive numbers (numeric
 * strings read as numbers); anything else is dropped. Not an object: the default driver's.
 */
function tsFrom(raw: unknown, d: TsValues): TsValues {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  const out: TsValues = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
    if (Object.hasOwn(TS_PARAMS, k) && typeof n === "number" && Number.isFinite(n) && n > 0) out[k as keyof TsValues] = n;
  }
  return out;
}

/** One driver's fields from raw (decoded) data, with defaults for anything missing or malformed. */
function driverSlotFrom(raw: Raw, d: DriverSlot): DriverSlot {
  return {
    driverName: typeof raw.driverName === "string" ? raw.driverName : d.driverName,
    driverBrand: typeof raw.driverBrand === "string" ? raw.driverBrand : "",
    nominal_ohms: raw.nominal_ohms ?? d.nominal_ohms,
    ts: tsFrom(raw.ts, d.ts),
    le_mh: raw.le_mh ?? d.le_mh,
    l2_mh: nonNeg(raw.l2_mh),
    r2_ohm: nonNeg(raw.r2_ohm),
    ...(raw.fdd && typeof raw.fdd === "object" ? { fdd: { rms: nonNeg(raw.fdd.rms), ams_mm_per_n: nonNeg(raw.fdd.ams_mm_per_n) } } : {}),
    ...(raw.semi && typeof raw.semi === "object"
      ? {
          semi: {
            leb_mh: nonNeg(raw.semi.leb_mh),
            le_mh: nonNeg(raw.semi.le_mh),
            ke: nonNeg(raw.semi.ke),
            rss_ohm: nonNeg(raw.semi.rss_ohm),
            ...(nonNeg(raw.semi.re_ohm) > 0 ? { re_ohm: nonNeg(raw.semi.re_ohm) } : {}),
          },
        }
      : {}),
    xmax_mm: raw.xmax_mm ?? d.xmax_mm,
    pe_w: raw.pe_w ?? d.pe_w,
    drivers: raw.drivers ?? d.drivers,
    wiring: raw.wiring === "series" ? "series" : "parallel",
    isobaric: raw.isobaric === true,
    isoCoils: raw.isoCoils === "series" ? "series" : "parallel",
    dvc: {
      on: raw.dvc?.on === true,
      entered: ["one", "parallel", "series"].includes(raw.dvc?.entered) ? raw.dvc.entered : "parallel",
      wired: raw.dvc?.wired === "series" ? "series" : "parallel",
    },
  };
}

function compareFrom(raw: unknown): CompareDriver | null {
  if (!raw || typeof raw !== "object") return null;
  const slot = driverSlotFrom(raw as Raw, DEFAULT_STATE);
  const out = {} as Record<string, unknown>;
  for (const k of COMPARE_KEYS) out[k] = slot[k];
  // Its own count (and wiring) only when the link has one: older links follow the main driver.
  const n = (raw as Raw).drivers;
  if (typeof n === "number" && Number.isFinite(n) && n >= 1) {
    out.drivers = Math.min(COMPARE_MAX_DRIVERS, Math.round(n));
    out.wiring = (raw as Raw).wiring === "series" ? "series" : "parallel";
  }
  return out as CompareDriver;
}

/** Reads state from a URL hash, falling back to defaults for anything missing. */
export function decodeState(hash: string): AppState | null {
  const m = /(?:^#?|&)s=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return null;
  try {
    const raw = migrate(JSON.parse(fromBase64Url(m[1]!)) as Raw);
    if (raw.v !== 4) return null;
    const d = DEFAULT_STATE;
    const designs: DesignState[] = [];
    // Projects from the short-lived drivers A–D: driver B becomes the comparison; boxes copied for
    // another driver (same kind and name as one of A's boxes) go, boxes moved to one by hand stay.
    const olds: Raw[] = Array.isArray(raw.designs) ? raw.designs.slice(0, MAX_DESIGNS) : [];
    const isCopy = (x: Raw) =>
      typeof x?.driverId === "string" && olds.some((o) => typeof o?.driverId !== "string" && o?.kind === x.kind && o?.name === x.name);
    for (const x of olds) {
      if (isCopy(x)) continue;
      const fixed = fixDesign(x, designs);
      if (fixed) {
        delete (fixed as Raw).driverId;
        designs.push(fixed);
      }
    }
    // Before 5 Nov 2026 stuffing was a volume gain in the calculator, for the design it fed:
    // it becomes that design's own stuffing (same gain, Settings' Qa) when it can take one.
    const { fill_pct: oldFill, ...rawVolume } = (raw.volume ?? {}) as Raw;
    if (typeof oldFill === "number" && oldFill > 0) {
      const fed = designs.find((x) => x.id === rawVolume.link);
      if (fed && stuffable(fed.kind) && !fed.stuffing) {
        fed.stuffing = { mode: "custom", gL: 16, gain_pct: Math.min(40, oldFill), qa: qOr(raw.settings?.losses?.qa, d.settings.losses.qa) };
      }
    }
    const compare = compareFrom(raw.compare ?? (Array.isArray(raw.extraDrivers) ? raw.extraDrivers[0] : null));
    return {
      v: 4,
      ...driverSlotFrom(raw, d),
      // Links and saves leave out values equal to the default, and the default was 100 W until
      // 8 Nov 2026: one without a power was made at 100 W. (compactState now always writes it.)
      power: raw.power ?? LEGACY_POWER_W,
      drive: raw.drive === "volts" ? "volts" : "watts",
      volts: typeof raw.volts === "number" && raw.volts > 0 && Number.isFinite(raw.volts) ? raw.volts : d.volts,
      roomGain: (({ curve: _unchecked, ...given }: Raw) => ({
        ...d.roomGain,
        ...given,
        ...roomCurveFields(raw.roomGain),
        slope: raw.roomGain?.slope === 6 ? 6 : 12,
      }))(raw.roomGain ?? {}),
      highPass: { ...d.highPass, ...raw.highPass },
      passive: passiveFrom(raw.passive) ?? d.passive,
      baffle: { ...d.baffle, ...(raw.baffle ?? {}) },
      settings: {
        ...d.settings,
        ...raw.settings,
        losses: { ...d.settings.losses, ...raw.settings?.losses },
        endCorrection: endCorrectionFrom(raw.settings?.endCorrection),
        airConditions: airConditionsFrom(raw.settings?.airConditions, d.settings.airConditions),
        alignments: raw.settings?.alignments === "textbook" ? "textbook" : "winisd",
      },
      eq: Array.isArray(raw.eq)
        ? raw.eq.filter((e: Raw) => e && ["linkwitz", "peak", "lowshelf", "highshelf"].includes(e.type)).slice(0, 12)
        : [],
      measured: measuredFrom(raw.measured),
      compare,
      designs,
      volume: { ...d.volume, ...rawVolume },
    };
  } catch {
    return null;
  }
}


// ---------------------------------------------------------------------------
// Comparison driver
// ---------------------------------------------------------------------------

/** The state with the comparison driver in place of the main one (same boxes, count and wiring); null without one. */
export function compareView(s: AppState): AppState | null {
  if (!s.compare) return null;
  const { drivers, wiring, ...driver } = s.compare;
  return { ...s, ...driver, ...(drivers !== undefined ? { drivers, wiring: wiring ?? s.wiring } : {}) };
}

/** Whether the comparison has its own number of drivers or wiring (not the main driver's). */
export const compareOwnCount = (s: AppState): boolean =>
  !!s.compare && s.compare.drivers !== undefined && (s.compare.drivers !== s.drivers || (s.compare.wiring ?? s.wiring) !== s.wiring);

/** The main driver's own fields, as a comparison driver. */
export function asCompare(s: AppState): CompareDriver {
  const out = {} as Record<string, unknown>;
  for (const k of COMPARE_KEYS) out[k] = s[k];
  return out as CompareDriver;
}

/** The comparison driver becomes the main one, and the main one the comparison. */
export function swapCompare(s: AppState): AppState {
  if (!s.compare) return s;
  const view = compareView(s)!;
  // With its own count, the counts swap too; otherwise both keep following the one count.
  const own = s.compare.drivers !== undefined;
  return { ...view, compare: { ...asCompare(s), ...(own ? { drivers: s.drivers, wiring: s.wiring } : {}) } };
}
