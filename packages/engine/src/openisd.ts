/**
 * OpenISD files (openisd.app, MIT licence): projects (.owpr) and drivers (.owdr), JSON.
 * Read from OpenISD's own goldens (layouts 1–5 and older stored projects): a project keeps
 * its state under `saved` (and unsaved edits under `edited`), the driver under
 * `driverEmbedding.device.specs.woofer`, each value as { value, state: "E" (entered) | "C"
 * (calculated) }, SI units.
 */
import { solveTs, type TsValues } from "./tsSolver.ts";

/** A driver read from OpenISD: the T/S values entered there, and the rest. */
export interface OpenisdDriver {
  brand: string;
  model: string;
  ts: TsValues;
  le_mh?: number;
  xmax_mm?: number;
  pe_w?: number;
  nominal_ohms?: number;
}

/** A port as OpenISD keeps it (round or slot), in cm. */
export interface OpenisdPort {
  shape: "round" | "slot";
  diameter_cm: number;
  width_cm: number;
  height_cm: number;
  count: number;
  /** Physical length, if OpenISD has one (otherwise the tuning sets it). */
  length_cm?: number;
}

export interface OpenisdLosses {
  ql: number;
  qa: number;
  qp: number;
}

export type OpenisdBox =
  | { type: "sealed"; vb_l: number; losses: OpenisdLosses }
  | { type: "vented"; vb_l: number; fb?: number; port: OpenisdPort; losses: OpenisdLosses }
  | {
      type: "passive-radiator";
      vb_l: number;
      count: number;
      addedMass_g: number;
      fb?: number;
      pr: { name: string; mms_g: number; sd_cm2: number; vas_l: number; qms: number; xmax_mm: number };
      losses: OpenisdLosses;
    }
  | {
      type: "bandpass";
      /** 4th order; 6th order with the rear chamber ported to the room (6p) or into the front one (6s, OpenISD's "abc"). */
      order: "4" | "6p" | "6s";
      rear: { vb_l: number; fb?: number; port?: OpenisdPort; losses: OpenisdLosses };
      front: { vb_l: number; fb?: number; port: OpenisdPort; losses: OpenisdLosses };
      qicl: number;
    };

export type OpenisdFilter =
  | { type: "highpass"; family: "butterworth" | "linkwitz-riley"; order: number; freq: number }
  | { type: "linkwitz"; f0: number; q0: number; fp: number; qp: number }
  | { type: "peak" | "lowshelf" | "highshelf"; freq: number; gain_db: number; q: number };

export interface OpenisdProject {
  name: string;
  driver: OpenisdDriver;
  drivers: number;
  wiring: "parallel" | "series";
  /** Amplifier + cable resistance (Ω). */
  rs_ohm: number;
  box: OpenisdBox | null;
  /** Air: temperature (°C), relative humidity (%), pressure (hPa). */
  air?: { temp_C: number; humidity_pct: number; pressure_hPa: number };
  /** The drive: watts or volts, whichever was entered. */
  drive?: { watts: number } | { volts: number };
  filters: OpenisdFilter[];
  /** Filters that can't be brought across (low-pass, all-pass, other families…). */
  unsupportedFilters: number;
}

type J = Record<string, unknown>;
const obj = (x: unknown): J => (x && typeof x === "object" && !Array.isArray(x) ? (x as J) : {});
/** A field's value: OpenISD wraps most as { value, state }. */
function val(x: unknown): unknown {
  return x && typeof x === "object" && !Array.isArray(x) && "value" in (x as J) ? (x as J).value : x;
}
function num(x: unknown): number | undefined {
  const v = val(x);
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
const str = (x: unknown): string => {
  const v = val(x);
  return typeof v === "string" ? v : "";
};
const entered = (x: unknown) => obj(x).state === "E";

/** T/S keys in OpenISD's specs and how to turn them into ours. */
const TS_MAP: [string, keyof TsValues, number][] = [
  ["Fs_hz", "fs", 1],
  ["Qms", "qms", 1],
  ["Qes", "qes", 1],
  ["Qts", "qts", 1],
  ["Vas_m3", "vas_l", 1000],
  ["Re_ohm", "re", 1],
  ["Sd_m2", "sd_cm2", 1e4],
  ["Mms_kg", "mms_g", 1000],
  ["Cms_m_per_N", "cms_mm_per_n", 1000],
  ["BL_Tm", "bl", 1],
  ["Rms_kg_per_s", "rms", 1],
];

/**
 * A driver from OpenISD's `device` record: the T/S values entered there (our editor's "typed"
 * values, so its own consistency checks see what the user typed); calculated ones only when
 * the entered ones aren't enough to simulate.
 */
export function openisdDriver(device: unknown): OpenisdDriver {
  const d = obj(device);
  const specs = obj(obj(d.specs).woofer);
  const pick = (onlyEntered: boolean): TsValues => {
    const ts: TsValues = {};
    for (const [k, ours, scale] of TS_MAP) {
      const v = num(specs[k]);
      if (v !== undefined && v > 0 && (!onlyEntered || entered(specs[k]))) ts[ours] = v * scale;
    }
    return ts;
  };
  let ts = pick(true);
  if (solveTs(ts).missing.length > 0) ts = { ...pick(false), ...ts };
  const pos = (k: string, scale = 1) => {
    const v = num(specs[k]);
    return v !== undefined && v > 0 ? v * scale : undefined;
  };
  return {
    brand: str(d.brand) || str(d.manufacturer),
    model: str(d.model),
    ts,
    le_mh: pos("Le_H", 1000),
    xmax_mm: pos("Xmax_m", 1000),
    pe_w: pos("Pe_W"),
    nominal_ohms: pos("Znom_ohm"),
  };
}

function losses(x: unknown): OpenisdLosses {
  const l = obj(obj(x).losses);
  return { ql: num(l.Ql) ?? 10, qa: num(l.Qa) ?? 100, qp: num(l.Qp) ?? 100 };
}

function port(x: unknown): OpenisdPort | undefined {
  const v = obj(x);
  if (!Object.keys(v).length) return undefined;
  const slot = val(v.shape) === "rectangular" || val(v.shape) === "slot";
  const area = num(v.area_m2);
  const dia = num(v.diameter_m) ?? (area ? 2 * Math.sqrt(area / Math.PI) : undefined);
  const w = num(v.width_m);
  const h = num(v.height_m) ?? (w && area ? area / w : undefined);
  const len = num(v.length_m);
  if (slot ? !(w && h) : !dia) return undefined;
  return {
    shape: slot ? "slot" : "round",
    diameter_cm: (dia ?? 0) * 100,
    width_cm: (w ?? 0) * 100,
    height_cm: (h ?? 0) * 100,
    count: Math.max(1, Math.round(num(v.count) ?? 1)),
    ...(len !== undefined && len > 0 ? { length_cm: len * 100 } : {}),
  };
}

function boxOf(b: J): OpenisdBox | null {
  const type = String(val(b.boxType) ?? "");
  const vol = (x: unknown) => (num(obj(x).volume_m3) ?? 0) * 1000;
  if (type === "sealed") {
    const s = obj(b.sealed);
    return vol(s) > 0 ? { type: "sealed", vb_l: vol(s), losses: losses(s) } : null;
  }
  if (type === "vented") {
    const v = obj(b.vented);
    const p = port(v.vent);
    if (!(vol(v.chamber) > 0) || !p) return null;
    return { type: "vented", vb_l: vol(v.chamber), fb: num(obj(v.chamber).tuning_goal_hz) ?? num(v.tuning_goal_hz), port: p, losses: losses(v.chamber) };
  }
  if (type === "passiveRadiator" || type === "box-passive-radiator") {
    const p = obj(b.passiveRadiator);
    const c = obj(p.component);
    const s = obj(obj(c.specs)["passive-radiator"]);
    const sd = num(s.Sd_m2);
    const fs = num(s.Fs_hz);
    const vas = num(s.Vas_m3);
    if (!(vol(p) > 0) || !sd || !vas) return null;
    // Mms from Fs and Vas (as OpenISD and WinISD keep a PR) when it isn't stored.
    const mms = num(s.Mms_kg) ?? (fs ? 1 / ((2 * Math.PI * fs) ** 2 * (vas / (1.204 * 343.2 ** 2 * sd * sd))) : undefined);
    if (!mms) return null;
    return {
      type: "passive-radiator",
      vb_l: vol(p),
      count: Math.max(1, Math.round(num(p.count) ?? 1)),
      addedMass_g: (num(p.addedMass_kg) ?? 0) * 1000,
      fb: num(p.tuning_goal_hz) ?? num(p.systemTuning_hz),
      pr: {
        name: [str(c.brand), str(c.model)].filter(Boolean).join(" ") || "From OpenISD",
        mms_g: mms * 1000,
        sd_cm2: sd * 1e4,
        vas_l: vas * 1000,
        qms: num(s.Qms) ?? 10,
        xmax_mm: (num(s.Xmax_m) ?? 0) * 1000,
      },
      losses: losses(p),
    };
  }
  if (type === "bandpass4" || type === "bandpass6" || type === "abc") {
    const bp = obj(b[type]);
    const front = obj(bp.front);
    const rear = obj(bp.rear);
    const fp = port(bp.frontVent);
    const rp = type === "bandpass6" ? port(bp.rearVent) : type === "abc" ? port(bp.intraVent) : undefined;
    if (!(vol(front) > 0) || !(vol(rear) > 0) || !fp || (type !== "bandpass4" && !rp)) return null;
    return {
      type: "bandpass",
      order: type === "bandpass4" ? "4" : type === "bandpass6" ? "6p" : "6s",
      front: { vb_l: vol(front), fb: num(front.tuning_goal_hz), port: fp, losses: losses(front) },
      rear: { vb_l: vol(rear), fb: num(rear.tuning_goal_hz), ...(rp ? { port: rp } : {}), losses: losses(rear) },
      qicl: num(bp.Qiclfr) ?? 100,
    };
  }
  return null;
}

function filtersOf(list: unknown): { filters: OpenisdFilter[]; unsupportedFilters: number } {
  const out: OpenisdFilter[] = [];
  let unsupported = 0;
  for (const raw of Array.isArray(list) ? list : []) {
    const f = obj(raw);
    if (f.enabled === false) continue;
    const t = f.type;
    if (t === "highpass" && (f.family === "butterworth" || f.family === "linkwitzRiley") && num(f.order) && num(f.fc)) {
      out.push({ type: "highpass", family: f.family === "butterworth" ? "butterworth" : "linkwitz-riley", order: Math.round(num(f.order)!), freq: num(f.fc)! });
    } else if (t === "linkwitz" && num(f.f0) && num(f.Q0) && num(f.fp) && num(f.Qp)) {
      out.push({ type: "linkwitz", f0: num(f.f0)!, q0: num(f.Q0)!, fp: num(f.fp)!, qp: num(f.Qp)! });
    } else if ((t === "peaking" || t === "lowshelf" || t === "highshelf") && num(f.fc) && num(f.Q) && num(f.gain) !== undefined) {
      out.push({ type: t === "peaking" ? "peak" : t, freq: num(f.fc)!, gain_db: num(f.gain)!, q: num(f.Q)! });
    } else unsupported++;
  }
  return { filters: out, unsupportedFilters: unsupported };
}

/** Read an OpenISD project (.owpr): its unsaved edits if it has them, else what was saved. */
export function parseOwpr(text: string): OpenisdProject {
  let root: J;
  try {
    root = obj(JSON.parse(text.replace(/^﻿/, "")));
  } catch {
    throw new Error("Not an OpenISD project (not JSON)");
  }
  const s = obj(root.edited && Object.keys(obj(root.edited)).length ? root.edited : root.saved);
  const de = obj(s.driverEmbedding);
  if (!Object.keys(obj(de.device)).length) throw new Error("Not an OpenISD project (no driver)");
  const env = obj(s.environment);
  const T = num(env.temperature_K);
  const sig = obj(s.signal);
  const w = num(sig.power_W);
  const v = num(sig.voltage_V);
  const drive = entered(sig.voltage_V) && v ? { volts: v } : w ? { watts: w } : v ? { volts: v } : undefined;
  const meta = obj(s.meta);
  return {
    name: str(meta.name) || str(root.label) || "OpenISD project",
    driver: openisdDriver(de.device),
    drivers: Math.max(1, Math.round(num(de.nDrivers) ?? 1)),
    wiring: de.wiring === "series" ? "series" : "parallel",
    rs_ohm: num(de.Rs_ohm) ?? 0,
    box: boxOf(obj(s.box)),
    ...(T ? { air: { temp_C: T - 273.15, humidity_pct: num(env.humidity_pct) ?? 0, pressure_hPa: (num(env.pressure_Pa) ?? 101325) / 100 } } : {}),
    ...(drive ? { drive } : {}),
    ...filtersOf(obj(s.filters).filters),
  };
}

/** Read an OpenISD driver file (.owdr): the device record at the top level. */
export function parseOwdr(text: string): OpenisdDriver {
  let root: J;
  try {
    root = obj(JSON.parse(text.replace(/^﻿/, "")));
  } catch {
    throw new Error("Not an OpenISD driver (not JSON)");
  }
  if (!Object.keys(obj(root.specs)).length) throw new Error("Not an OpenISD driver (no specs)");
  return openisdDriver(root);
}
