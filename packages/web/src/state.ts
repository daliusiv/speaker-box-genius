import type { HighPassType, PassiveRadiatorInput, TsValues } from "@sbg/engine";

export type DesignKey = "sealed" | "vented" | "pr";
export type ShapeKind = "box" | "cylinder" | "sphere" | "frustum";

/** Everything needed to reproduce a simulation. Stored in the URL hash for sharing. */
export interface AppState {
  v: 2;
  driverName: string;
  /** T/S values the user entered. Derived values are never stored. */
  ts: TsValues;
  le_mh: number;
  xmax_mm: number;
  pe_w: number;
  power: number;
  drivers: number;
  highPass: { on: boolean; type: HighPassType; order: number; freq: number };
  sealed: { on: boolean; vb_l: number };
  vented: { on: boolean; vb_l: number; diameter_cm: number; length_cm: number; count: number };
  pr: {
    on: boolean;
    name: string;
    vb_l: number;
    count: number;
    addedMass_g: number;
    params: Required<Pick<PassiveRadiatorInput, "mms_g" | "sd_cm2" | "xmax_mm" | "qms" | "vas_l">>;
  };
  volume: {
    link: DesignKey | "none";
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

/** The fictional example driver and PR from docs/examples. */
export const DEFAULT_STATE: AppState = {
  v: 2,
  driverName: "Example Audio EX10-4 (fictional)",
  ts: { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330 },
  le_mh: 1.2,
  xmax_mm: 12,
  pe_w: 250,
  power: 100,
  drivers: 1,
  highPass: { on: false, type: "butterworth", order: 2, freq: 18 },
  sealed: { on: true, vb_l: 40 },
  vented: { on: true, vb_l: 60, diameter_cm: 10, length_cm: 30, count: 1 },
  pr: {
    on: true,
    name: "Example Audio EX10-PR (fictional)",
    vb_l: 50,
    count: 2,
    addedMass_g: 100,
    params: { mms_g: 122, sd_cm2: 330, xmax_mm: 18, qms: 6, vas_l: 80 },
  },
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

type AnyState = Partial<Omit<AppState, "v">> & {
  v?: number;
  // v1 fields
  driver?: { fs: number; qms: number; qes: number; vas_l: number; re: number; sd_cm2: number; le_mh: number; xmax_mm: number; pe_w: number };
};

/** Bring an older saved state up to the current version. */
function migrate(raw: AnyState): AnyState {
  if (raw.v === 1 && raw.driver) {
    const d = raw.driver;
    return {
      ...raw,
      v: 2,
      ts: { fs: d.fs, qms: d.qms, qes: d.qes, vas_l: d.vas_l, re: d.re, sd_cm2: d.sd_cm2 },
      le_mh: d.le_mh,
      xmax_mm: d.xmax_mm,
      pe_w: d.pe_w,
    };
  }
  return raw;
}

/** Reads state from a URL hash, falling back to defaults for anything missing. */
export function decodeState(hash: string): AppState | null {
  const m = /(?:^#?|&)s=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return null;
  try {
    const raw = migrate(JSON.parse(fromBase64Url(m[1]!)) as AnyState);
    if (raw.v !== 2) return null;
    const d = DEFAULT_STATE;
    return {
      v: 2,
      driverName: typeof raw.driverName === "string" ? raw.driverName : d.driverName,
      ts: raw.ts ?? d.ts,
      le_mh: raw.le_mh ?? d.le_mh,
      xmax_mm: raw.xmax_mm ?? d.xmax_mm,
      pe_w: raw.pe_w ?? d.pe_w,
      power: raw.power ?? d.power,
      drivers: raw.drivers ?? d.drivers,
      highPass: { ...d.highPass, ...raw.highPass },
      sealed: { ...d.sealed, ...raw.sealed },
      vented: { ...d.vented, ...raw.vented },
      pr: { ...d.pr, ...raw.pr, params: { ...d.pr.params, ...raw.pr?.params } },
      volume: { ...d.volume, ...raw.volume },
    };
  } catch {
    return null;
  }
}
