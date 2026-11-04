import type { EqStage, HighPassType, PassiveRadiatorInput, TsValues } from "@sbg/engine";

export type DesignKind = "sealed" | "vented" | "pr" | "bandpass" | "line";
export type ShapeKind = "box" | "cylinder" | "sphere" | "frustum";
export type PrParams = Required<Pick<PassiveRadiatorInput, "mms_g" | "sd_cm2" | "xmax_mm" | "qms" | "vas_l">>;

interface DesignBase {
  /** Stable id, used by the volume calculator link and as React key. */
  id: string;
  name: string;
  on: boolean;
  vb_l: number;
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
  /** Air constants: 20 °C standard, or WinISD's values for like-for-like comparison. */
  air: "standard" | "winisd";
  /** Port air velocity shown as peak (default) or RMS. */
  velocity: "peak" | "rms";
  /** Amplifier output + cable resistance (Ω). */
  rg: number;
  /** Include voice-coil inductance (Le, and L2/R2 when entered) in the simulation. WinISD leaves it out by default. */
  inductance: boolean;
  /** Box losses as Q values at the tuning frequency: leakage, absorption, port. WinISD's defaults are 10 / 100 / 100. */
  losses: { ql: number; qa: number; qp: number };
  /** Port compression: turbulent port loss that grows with air speed (approximate). Off = like WinISD. */
  portCompression: boolean;
}

/** Everything needed to reproduce a simulation. Stored in the URL hash for sharing. */
export interface AppState {
  v: 3;
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
  roomGain: { mode: "off" | "car" | "room"; length_cm: number; slope: 6 | 12; max_db: number };
  /**
   * Baffle step: the speaker free-standing (full space) with its front baffle, instead of
   * an infinite baffle. Size from the volume calculator's box when `fromBox`.
   */
  baffle: { on: boolean; fromBox: boolean; width_cm: number; height_cm: number; x_cm: number; y_cm: number };
  highPass: { on: boolean; type: HighPassType; order: number; freq: number };
  settings: Settings;
  eq: EqItem[];
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
    driverDisp_l: number;
    prDisp_l: number;
    portWall_mm: number;
    bracing_pct: number;
    other_l: number;
    fill_pct: number;
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
        shape: "round",
        diameter_cm: 10,
        slotWidth_cm: 20,
        slotHeight_cm: 5,
        length_cm: 30,
        count: 1,
        flare_cm: 0,
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
        front: { shape: "round", diameter_cm: 10, slotWidth_cm: 20, slotHeight_cm: 5, length_cm: 25, count: 1, targetFb: 50 },
        rear: { shape: "round", diameter_cm: 7.5, slotWidth_cm: 15, slotHeight_cm: 4, length_cm: 30, count: 1, targetFb: 35 },
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
  v: 3,
  driverName: "Example Audio EX10-4 (fictional)",
  driverBrand: "Example Audio",
  nominal_ohms: 4,
  ts: { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330 },
  le_mh: 1.2,
  l2_mh: 0,
  r2_ohm: 0,
  xmax_mm: 12,
  pe_w: 250,
  power: 100,
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
  settings: {
    units: "metric",
    air: "standard",
    velocity: "peak",
    rg: 0,
    inductance: true,
    losses: { ql: 10, qa: 100, qp: 100 },
    portCompression: false,
  },
  eq: [],
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
    driverDisp_l: 1.8,
    prDisp_l: 0.6,
    portWall_mm: 3,
    bracing_pct: 3,
    other_l: 0,
    fill_pct: 0,
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
export function encodeState(s: AppState): string {
  return "s=" + toBase64Url(JSON.stringify(s));
}

// Short links: values equal to their defaults are left out, then the JSON is deflated.
// decodeState fills every left-out value back in from the defaults, so only keys whose
// absence decodes to the same value may be dropped:
// - top-level keys, whole (ts never partially: its keys mean "values the user typed");
// - one level into objects that decoding merges with their defaults;
// - per design, its keys against a fresh design of the same kind, one level into front/rear/params.
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

/** The state with default values left out (see above). */
export function compactState(s: AppState): Raw {
  const out = stripKeys({ ...s, designs: [] }, { ...DEFAULT_STATE, designs: [] }, MERGED_TOP, ["v", "driverBrand"]);
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

const canCompress = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";

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
      { ...v, ...(raw.vented ?? {}) },
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
  return merged;
}

/** Reads state from a URL hash, falling back to defaults for anything missing. */
export function decodeState(hash: string): AppState | null {
  const m = /(?:^#?|&)s=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return null;
  try {
    const raw = migrate(JSON.parse(fromBase64Url(m[1]!)) as Raw);
    if (raw.v !== 3) return null;
    const d = DEFAULT_STATE;
    const designs: DesignState[] = [];
    for (const x of Array.isArray(raw.designs) ? raw.designs.slice(0, MAX_DESIGNS) : []) {
      const fixed = fixDesign(x, designs);
      if (fixed) designs.push(fixed);
    }
    return {
      v: 3,
      driverName: typeof raw.driverName === "string" ? raw.driverName : d.driverName,
      driverBrand: typeof raw.driverBrand === "string" ? raw.driverBrand : "",
      nominal_ohms: raw.nominal_ohms ?? d.nominal_ohms,
      ts: raw.ts ?? d.ts,
      le_mh: raw.le_mh ?? d.le_mh,
      l2_mh: nonNeg(raw.l2_mh),
      r2_ohm: nonNeg(raw.r2_ohm),
      xmax_mm: raw.xmax_mm ?? d.xmax_mm,
      pe_w: raw.pe_w ?? d.pe_w,
      power: raw.power ?? d.power,
      drive: raw.drive === "volts" ? "volts" : "watts",
      volts: typeof raw.volts === "number" && raw.volts > 0 && Number.isFinite(raw.volts) ? raw.volts : d.volts,
      drivers: raw.drivers ?? d.drivers,
      wiring: raw.wiring === "series" ? "series" : "parallel",
      isobaric: raw.isobaric === true,
      isoCoils: raw.isoCoils === "series" ? "series" : "parallel",
      roomGain: {
        ...d.roomGain,
        ...(raw.roomGain ?? {}),
        mode: ["off", "car", "room"].includes(raw.roomGain?.mode) ? raw.roomGain.mode : "off",
        slope: raw.roomGain?.slope === 6 ? 6 : 12,
      },
      dvc: {
        on: raw.dvc?.on === true,
        entered: ["one", "parallel", "series"].includes(raw.dvc?.entered) ? raw.dvc.entered : "parallel",
        wired: raw.dvc?.wired === "series" ? "series" : "parallel",
      },
      highPass: { ...d.highPass, ...raw.highPass },
      baffle: { ...d.baffle, ...(raw.baffle ?? {}) },
      settings: { ...d.settings, ...raw.settings, losses: { ...d.settings.losses, ...raw.settings?.losses } },
      eq: Array.isArray(raw.eq)
        ? raw.eq.filter((e: Raw) => e && ["linkwitz", "peak", "lowshelf"].includes(e.type)).slice(0, 12)
        : [],
      designs,
      volume: { ...d.volume, ...raw.volume },
    };
  } catch {
    return null;
  }
}
