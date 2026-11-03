import type { EqStage, HighPassType, PassiveRadiatorInput, TsValues } from "@sbg/engine";

export type DesignKind = "sealed" | "vented" | "pr";
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
}

export interface PrDesign extends DesignBase {
  kind: "pr";
  prName: string;
  count: number;
  addedMass_g: number;
  targetFb: number;
  params: PrParams;
}

export type DesignState = SealedDesign | VentedDesign | PrDesign;

/** An EQ stage plus where it applies: every design, or one design by id. */
export type EqItem = EqStage & { id: string; on: boolean; target: string };

export const MAX_DESIGNS = 8;

export interface Settings {
  /** Unit system for box sizes and volumes. */
  units: "metric" | "imperial";
  /** Air constants: 20 °C standard, or WinISD's values for like-for-like comparison. */
  air: "standard" | "winisd";
  /** Port air velocity shown as peak (default) or RMS. */
  velocity: "peak" | "rms";
  /** Amplifier output + cable resistance (Ω). */
  rg: number;
  /** Include voice-coil inductance (Le) in the simulation. WinISD leaves it out by default. */
  inductance: boolean;
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
  xmax_mm: number;
  pe_w: number;
  power: number;
  drivers: number;
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
  };
}

const EXAMPLE_PR: PrParams = { mms_g: 122, sd_cm2: 330, xmax_mm: 18, qms: 6, vas_l: 80 };

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
        targetFb: 30,
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
  xmax_mm: 12,
  pe_w: 250,
  power: 100,
  drivers: 1,
  highPass: { on: false, type: "butterworth", order: 2, freq: 18 },
  settings: { units: "metric", air: "standard", velocity: "peak", rg: 0, inductance: true },
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

export function encodeState(s: AppState): string {
  return "s=" + toBase64Url(JSON.stringify(s));
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

function fixDesign(d: Raw, all: DesignState[]): DesignState | null {
  if (d?.kind !== "sealed" && d?.kind !== "vented" && d?.kind !== "pr") return null;
  const base = newDesign(d.kind, all);
  const merged = { ...base, ...d } as DesignState;
  if (merged.kind === "pr") merged.params = { ...(base as PrDesign).params, ...(d.params ?? {}) };
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
      xmax_mm: raw.xmax_mm ?? d.xmax_mm,
      pe_w: raw.pe_w ?? d.pe_w,
      power: raw.power ?? d.power,
      drivers: raw.drivers ?? d.drivers,
      highPass: { ...d.highPass, ...raw.highPass },
      settings: { ...d.settings, ...raw.settings },
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
