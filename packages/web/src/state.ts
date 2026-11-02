import type { DriverInput, PassiveRadiatorInput } from "@sbg/engine";

/** Everything needed to reproduce a simulation. Stored in the URL hash for sharing. */
export interface AppState {
  v: 1;
  driverName: string;
  driver: Required<Pick<DriverInput, "fs" | "qms" | "qes" | "vas_l" | "re" | "sd_cm2" | "le_mh" | "xmax_mm" | "pe_w">>;
  power: number;
  drivers: number;
  sealed: { on: boolean; vb_l: number };
  vented: { on: boolean; vb_l: number; diameter_cm: number; length_cm: number; count: number };
  pr: {
    on: boolean;
    vb_l: number;
    count: number;
    addedMass_g: number;
    params: Required<Pick<PassiveRadiatorInput, "mms_g" | "sd_cm2" | "xmax_mm" | "qms" | "vas_l">>;
  };
}

/** The fictional example driver and PR from docs/examples. */
export const DEFAULT_STATE: AppState = {
  v: 1,
  driverName: "Example Audio EX10-4 (fictional)",
  driver: { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, le_mh: 1.2, xmax_mm: 12, pe_w: 250 },
  power: 100,
  drivers: 1,
  sealed: { on: true, vb_l: 40 },
  vented: { on: true, vb_l: 60, diameter_cm: 10, length_cm: 30, count: 1 },
  pr: {
    on: true,
    vb_l: 50,
    count: 2,
    addedMass_g: 100,
    params: { mms_g: 122, sd_cm2: 330, xmax_mm: 18, qms: 6, vas_l: 80 },
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

/** Reads state from a URL hash, falling back to defaults for anything missing or invalid. */
export function decodeState(hash: string): AppState | null {
  const m = /(?:^#?|&)s=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return null;
  try {
    const raw = JSON.parse(fromBase64Url(m[1]!)) as Partial<AppState>;
    if (raw.v !== 1) return null;
    const d = DEFAULT_STATE;
    return {
      v: 1,
      driverName: typeof raw.driverName === "string" ? raw.driverName : d.driverName,
      driver: { ...d.driver, ...raw.driver },
      power: raw.power ?? d.power,
      drivers: raw.drivers ?? d.drivers,
      sealed: { ...d.sealed, ...raw.sealed },
      vented: { ...d.vented, ...raw.vented },
      pr: { ...d.pr, ...raw.pr, params: { ...d.pr.params, ...raw.pr?.params } },
    };
  } catch {
    return null;
  }
}
