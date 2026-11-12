import type { HighPass } from "./filters.ts";
import { solveTs, type TsValues } from "./tsSolver.ts";
import { STANDARD_AIR, WINISD_AIR, type Air } from "./constants.ts";

/**
 * WinISD driver files (.wdr): an INI file with a [Driver] section, values in
 * SI units. The decimal separator follows the Windows locale of whoever saved
 * it, so "0,0012" and "0.0012" both occur.
 */

export interface WdrDriver {
  brand: string;
  model: string;
  comment: string;
  /** T/S values in this project's units (L, cm², g, mm/N…). */
  ts: TsValues;
  le_mh?: number;
  xmax_mm?: number;
  pe_w?: number;
  nominal_ohms?: number;
  voiceCoils?: number;
  displacement_l?: number;
  depth_mm?: number;
  /** Raw key/value pairs, for anything not mapped above. */
  raw: Record<string, string>;
}

function num(raw: Record<string, string>, key: string): number | undefined {
  const s = raw[key.toLowerCase()];
  if (s === undefined) return undefined;
  const v = Number(s.trim().replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Multiply if defined, rounding away floating-point noise from unit conversion. */
const conv = (v: number | undefined, k: number) => (v === undefined ? undefined : Number((v * k).toPrecision(10)));

export function parseWdr(text: string): WdrDriver {
  const raw: Record<string, string> = {};
  let section = "";
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith(";")) continue;
    const sec = /^\[(.+)\]$/.exec(t);
    if (sec) {
      section = sec[1]!.toLowerCase();
      continue;
    }
    if (section !== "driver") continue;
    const eq = t.indexOf("=");
    if (eq > 0) raw[t.slice(0, eq).trim().toLowerCase()] = t.slice(eq + 1).trim();
  }
  if (Object.keys(raw).length === 0) throw new Error("Not a WinISD driver file (no [Driver] section)");

  const ts: TsValues = {};
  const set = (k: keyof TsValues, v: number | undefined) => {
    if (v !== undefined) ts[k] = v;
  };
  set("fs", num(raw, "Fs"));
  set("qms", num(raw, "Qms"));
  set("qes", num(raw, "Qes"));
  set("qts", num(raw, "Qts"));
  set("vas_l", conv(num(raw, "Vas"), 1000));
  set("re", num(raw, "Re"));
  set("sd_cm2", conv(num(raw, "Sd"), 1e4));
  set("mms_g", conv(num(raw, "Mms"), 1000));
  set("cms_mm_per_n", conv(num(raw, "Cms"), 1000));
  set("bl", num(raw, "BL"));
  set("rms", num(raw, "Rms"));

  return {
    brand: raw["brand"] ?? raw["manufacturer"] ?? "",
    model: raw["model"] ?? "",
    comment: raw["comment"] ?? "",
    ts,
    le_mh: conv(num(raw, "Le"), 1000),
    xmax_mm: conv(num(raw, "Xmax"), 1000),
    pe_w: num(raw, "Pe"),
    nominal_ohms: num(raw, "Znom"),
    voiceCoils: num(raw, "numVC"),
    displacement_l: conv(num(raw, "DVol"), 1000),
    depth_mm: conv(num(raw, "Depth"), 1000),
    raw,
  };
}

export interface WdrExport {
  brand: string;
  model: string;
  /** Solved T/S values (all of fs, qms, qes, vas_l, re, sd_cm2 required). */
  ts: TsValues;
  le_mh?: number;
  xmax_mm?: number;
  pe_w?: number;
  nominal_ohms?: number;
  displacement_l?: number;
  comment?: string;
}

/**
 * A number as WinISD (a Delphi program) reads it: dot decimals, 12 significant digits, never
 * scientific notation (JavaScript writes 1e-7 below 0.000001), and 0 for anything not finite
 * (NaN or Infinity would stop WinISD opening the file).
 */
export function winisdNumber(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return "0";
  const x = Number(v.toPrecision(12));
  const s = String(x);
  if (!/e/i.test(s)) return s;
  return x.toLocaleString("en-US", { useGrouping: false, maximumSignificantDigits: 12, maximumFractionDigits: 20 });
}

const definedOnly = (t: TsValues): TsValues => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined && Number.isFinite(v))) as TsValues;

/** Write a .wdr file WinISD can open (dot decimals, SI units). */
export function writeWdr(d: WdrExport, air: Air = WINISD_AIR): string {
  // The full record (Bl, Mms, Cms, Rms worked out from the rest where missing): with only Fs, Qes,
  // Qms and Vas, WinISD fills its own values in and its impedance and isobaric curves differ
  // (found in the 9 Nov 2026 run).
  const t: TsValues = { ...d.ts, ...solveTs(d.ts, 0.03, air).values, ...definedOnly(d.ts) };
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const n = winisdNumber;
  const qts = t.qts ?? (t.qms !== undefined && t.qes !== undefined ? (t.qms * t.qes) / (t.qms + t.qes) : undefined);
  const lines: [string, string][] = [
    ["Brand", d.brand],
    ["Model", d.model],
    ["Manufacturer", d.brand],
    ["ProvidedBy", "Speaker Box Genius"],
    ["Comment", (d.comment ?? "").replace(/[\r\n]+/g, " ")],
    ["DateAdded", today],
    ["DateModified", today],
    ["Qts", n(qts)],
    ["Znom", n(d.nominal_ohms)],
    ["Fs", n(t.fs)],
    ["Pe", n(d.pe_w)],
    ["Re", n(t.re)],
    ["Le", n(d.le_mh !== undefined ? d.le_mh / 1000 : undefined)],
    ["fLe", "1000"],
    // No lossy-inductance correction: Le is a plain inductor, as the app has it.
    ["KLe", "0"],
    ["BL", n(t.bl)],
    ["Xmax", n(d.xmax_mm !== undefined ? d.xmax_mm / 1000 : undefined)],
    ["Cms", n(t.cms_mm_per_n !== undefined ? t.cms_mm_per_n / 1000 : undefined)],
    ["Qms", n(t.qms)],
    ["Qes", n(t.qes)],
    ["Rms", n(t.rms)],
    ["Mms", n(t.mms_g !== undefined ? t.mms_g / 1000 : undefined)],
    ["Sd", n(t.sd_cm2 !== undefined ? t.sd_cm2 / 1e4 : undefined)],
    ["Vas", n(t.vas_l !== undefined ? t.vas_l / 1000 : undefined)],
    ["numVC", "1"],
    ["VCCon", "1"],
    ["DVol", n(d.displacement_l !== undefined ? d.displacement_l / 1000 : undefined)],
  ];
  return "[Driver]\r\n" + lines.map(([k, v]) => `${k}=${v}`).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// WinISD projects (.wpr)
// ---------------------------------------------------------------------------

export interface WprPort {
  count: number;
  /** Round port: its diameter. Slot: the diameter of a round port of the same area, which is how WinISD tunes it. */
  diameter_cm: number;
  /** A rectangular vent (WinISD Shape=2: dia1 = width, dia2 = height). */
  slot?: { width_cm: number; height_cm: number };
  length_cm: number;
  endCorrection: number;
}

export interface WprProject {
  driver: WdrDriver;
  /** Box types read: sealed (BType 0), vented (1), passive radiator (4). Others import the driver and Vb only. */
  box: { type: "vented" | "sealed" | "passive-radiator" | "bandpass" | "other"; bType: number; vb_l: number; fb?: number; ql: number; qa: number; qp: number };
  port?: WprPort;
  /**
   * Bandpass box (BType=2: 4th order; BType=3: 6th order, both chambers ported out). Front chamber: Vf, Ff, Qlf/Qaf/Qpf and [VentFront].
   * Rear chamber: Vr, Qlr/Qar/Qpr, and [VentRear] (to the outside) or [VentIntra] (into the
   * front chamber) for 6th order. Qiclfr is the leakage between the chambers.
   */
  bandpass?: {
    order: "4" | "6p" | "6s";
    front: { vb_l: number; fb: number; port: WprPort; ql: number; qa: number; qp: number };
    rear: { vb_l: number; fb?: number; port?: WprPort; ql: number; qa: number; qp: number };
    qicl: number;
  };
  /** Passive radiator box (BType=4). WinISD stores Fs and Vas; Mms is derived from them. */
  pr?: {
    count: number;
    addedMass_g: number;
    params: { mms_g: number; sd_cm2: number; vas_l: number; fs: number; qms: number; xmax_mm: number };
  };
  /**
   * WinISD's Rg (Ω). WinISD applies it to each driver separately (as if every
   * driver had its own cable), so with N parallel drivers the equivalent shared
   * amplifier resistance is Rg / N.
   */
  rg: number;
  /** Number of drivers (Box Nd). WinISD wires them in parallel. */
  drivers: number;
  /** Isobaric (Iso-Barik) loading: the pair's coils in series. */
  isobaric: boolean;
  /** Input power (W). */
  power: number;
  /** WinISD's "voice coil inductance" simulator option (VCInd); 0 = Le not simulated. */
  simulateLe: boolean;
  air?: { rho: number; c: number };
  /** Listening distance (m), Box d. */
  distance_m: number;
  /** Voice-coil temperature rise (°C), Box dTVC; WinISD raises Re by alfaVC (0.39 %/°C) per degree. */
  coilTempRise_C: number;
  /**
   * [Filters]. Only a Butterworth high-pass is recognised so far (filterNtype=1,
   * params "0;1;order;fc;Q"); anything else is counted in `unsupportedFilters`.
   */
  highPass?: HighPass;
  unsupportedFilters: number;
}

function parseFilters(sec: Record<string, string> | undefined): { highPass?: HighPass; unsupportedFilters: number } {
  const count = n0(sec, "Count");
  let highPass: HighPass | undefined;
  let unsupported = 0;
  for (let i = 0; i < count; i++) {
    const type = n0(sec, `filter${i}type`);
    const params = (sec?.[`filter${i}params`] ?? "").split(";").map(Number);
    const order = params[2] ?? NaN;
    const fc = params[3] ?? NaN;
    if (!highPass && type === 1 && params[0] === 0 && params[1] === 1 && order >= 1 && order <= 4 && fc > 0) {
      highPass = { type: "butterworth", order: Math.round(order), freq: fc };
    } else unsupported++;
  }
  return { highPass, unsupportedFilters: unsupported };
}

function iniSections(text: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  let cur: Record<string, string> | null = null;
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const t = line.trim();
    const sec = /^\[(.+)\]$/.exec(t);
    if (sec) {
      cur = {};
      out.set(sec[1]!.toLowerCase(), cur);
      continue;
    }
    const eq = t.indexOf("=");
    if (cur && eq > 0) cur[t.slice(0, eq).trim().toLowerCase()] = t.slice(eq + 1).trim();
  }
  return out;
}

const n0 = (sec: Record<string, string> | undefined, key: string): number => {
  const v = Number((sec?.[key.toLowerCase()] ?? "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};

/**
 * Read a WinISD project. Verified against WinISD 0.7.0.950 for single-chamber
 * vented boxes with round rear ports (BType=1); other box types import the
 * driver and rear-chamber volume only.
 */
export function parseWpr(text: string): WprProject {
  const s = iniSections(text);
  if (!s.has("driver") || !s.has("box")) throw new Error("Not a WinISD project file (needs [Driver] and [Box])");
  const driverText = text.slice(text.search(/^\[Driver\]/im));
  const driver = parseWdr(driverText.split(/^\[(?!Driver\])/im)[0]!);
  const box = s.get("box")!;
  const bType = n0(box, "BType");
  const vent = s.get("ventrear");
  const vb_l = n0(box, "Vr") * 1000;
  const ventOf = (sec: Record<string, string> | undefined): WprPort | undefined => {
    if (!sec || !(n0(sec, "len") > 0 && n0(sec, "dia1") > 0)) return undefined;
    const port: WprPort = { count: n0(sec, "Num") || 1, diameter_cm: n0(sec, "dia1") * 100, length_cm: n0(sec, "len") * 100, endCorrection: n0(sec, "endcorrection") || 0.732 };
    if (n0(sec, "Shape") === 2 && n0(sec, "dia2") > 0) {
      const slot = { width_cm: n0(sec, "dia1") * 100, height_cm: n0(sec, "dia2") * 100 };
      return { ...port, slot, diameter_cm: 2 * Math.sqrt((slot.width_cm * slot.height_cm) / Math.PI) };
    }
    return port;
  };
  const frontVent = ventOf(s.get("ventfront"));
  const rearVent = ventOf(vent);
  const intraVent = ventOf(s.get("ventintra"));
  // BType 2 / 3 are the 4th- and 6th-order bandpass; other codes are recognised by their vents.
  const isBandpass = bType === 2 || (frontVent !== undefined && n0(box, "Vf") > 0 && bType !== 1 && bType !== 0 && bType !== 4);
  const type: WprProject["box"]["type"] = isBandpass
    ? "bandpass"
    : bType === 1
      ? "vented"
      : bType === 0
        ? "sealed"
        : bType === 4
          ? "passive-radiator"
          : "other";
  let bandpass: WprProject["bandpass"];
  if (type === "bandpass" && frontVent) {
    const rearPort = bType === 2 ? undefined : (intraVent ?? rearVent);
    bandpass = {
      order: rearPort === undefined ? "4" : intraVent ? "6s" : "6p",
      front: { vb_l: n0(box, "Vf") * 1000, fb: n0(box, "Ff"), port: frontVent, ql: n0(box, "Qlf") || 10, qa: n0(box, "Qaf") || 100, qp: n0(box, "Qpf") || 100 },
      rear: { vb_l: n0(box, "Vr") * 1000, fb: n0(box, "Fr") || undefined, port: rearPort, ql: n0(box, "Qlr") || 10, qa: n0(box, "Qar") || 100, qp: n0(box, "Qpr") || 100 },
      qicl: n0(box, "Qiclfr") || 100,
    };
  }
  const d = s.get("driver");
  const rho = n0(d, "roo");
  const c = n0(d, "c");
  const air = rho > 0 && c > 0 ? { rho, c } : STANDARD_AIR;
  const prSec = s.get("passiveradiator");
  let pr: WprProject["pr"];
  if (type === "passive-radiator" && prSec) {
    const vas = n0(prSec, "Vas"); // m³
    const sd = n0(prSec, "Sd"); // m²
    const fs = n0(prSec, "Fs");
    const cms = vas / (air.rho * air.c * air.c * sd * sd);
    const mms = 1 / ((2 * Math.PI * fs) ** 2 * cms);
    pr = {
      count: n0(box, "Npr") || 1,
      addedMass_g: n0(prSec, "Me") * 1000,
      params: { mms_g: mms * 1000, sd_cm2: sd * 1e4, vas_l: vas * 1000, fs, qms: n0(prSec, "Qms") || 10, xmax_mm: n0(prSec, "Xmax") * 1000 },
    };
  }
  return {
    driver,
    pr,
    bandpass,
    box: { type, bType, vb_l, fb: type === "vented" || type === "passive-radiator" ? n0(box, "Fr") : undefined, ql: n0(box, "Qlr") || 10, qa: n0(box, "Qar") || 100, qp: n0(box, "Qpr") || 100 },
    port:
      type === "vented" && vent
        ? (rearVent ?? {
            count: n0(vent, "Num") || 1,
            diameter_cm: n0(vent, "dia1") * 100,
            length_cm: n0(vent, "len") * 100,
            endCorrection: n0(vent, "endcorrection") || 0.732,
          })
        : undefined,
    rg: n0(s.get("signalsource"), "Rg"),
    drivers: Math.max(1, Math.round(n0(box, "Nd") || 1)),
    isobaric: n0(box, "Isobarik") !== 0,
    power: n0(s.get("signalsource"), "P") || 1,
    simulateLe: n0(s.get("simulatoroptions"), "VCInd") !== 0,
    air: rho > 0 && c > 0 ? { rho, c } : undefined,
    distance_m: n0(box, "d") || 1,
    coilTempRise_C: n0(box, "dTVC"),
    ...parseFilters(s.get("filters")),
  };
}

/** A WinISD port as written to a project: count, inside diameter (or slot) and physical length. */
export interface WprPortOut {
  count: number;
  /** Round port's diameter (ignored for a slot). */
  diameter_cm: number;
  /** A rectangular vent: written as WinISD's Shape=2, dia1 = width, dia2 = height. */
  slot?: { width_cm: number; height_cm: number };
  length_cm: number;
  /** End correction WinISD adds (× diameter); 0.732 is its default. */
  endCorrection?: number;
  /** The tuning this port gives (Hz), stored alongside it. */
  fb: number;
}

/** What writeWpr needs: one box design, the driver, and the settings that change its results. */
export interface WprExport {
  driver: WdrExport;
  /** Losses of the (rear) chamber. */
  losses: { ql: number; qa: number; qp: number };
  box:
    | { type: "sealed"; vb_l: number }
    | { type: "vented"; vb_l: number; port: WprPortOut }
    | { type: "passive-radiator"; vb_l: number; fb: number; count: number; addedMass_g: number; pr: { mms_g: number; sd_cm2: number; vas_l: number; qms: number; xmax_mm: number } }
    | {
        type: "bandpass";
        order: "4" | "6p" | "6s";
        /** Rear chamber (the driver's back); its port only for 6th order (6p: to the room, 6s: into the front chamber). */
        rear: { vb_l: number; port?: WprPortOut };
        front: { vb_l: number; port: WprPortOut; losses: { ql: number; qa: number; qp: number } };
        /** Leak between the chambers (WinISD Qiclfr). */
        qicl: number;
      };
  /** WinISD's Rg, per driver (Ω). */
  rg: number;
  /** Drivers (WinISD wires them in parallel). */
  drivers: number;
  isobaric: boolean;
  /** WinISD's input power (W). */
  power: number;
  /** Simulate the coil inductance (WinISD's VCInd). */
  simulateLe: boolean;
  /** Air: density and speed of sound, and the conditions WinISD keeps with them. */
  air: { rho: number; c: number; temp_C: number; pressure_hPa: number; humidity_pct: number };
  /** A Butterworth high-pass (WinISD's filter type 1), if any. */
  highPass?: { order: number; freq: number };
  /** Curve colour, "#rrggbb". */
  color?: string;
}

/**
 * Write a WinISD project (.wpr) for one box, laid out as WinISD 0.7 saves them (every section and
 * key it writes, unused ones zeroed), so WinISD opens it and parseWpr reads it back.
 */
export function writeWpr(p: WprExport): string {
  const n = winisdNumber;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const section = (name: string, rows: [string, string | number][]) =>
    `[${name}]\r\n` + rows.map(([k, v]) => `${k}=${typeof v === "number" ? n(v) : v}`).join("\r\n") + "\r\n";
  const vent = (name: string, v?: WprPortOut, vb_l = 0) => {
    const slot = v?.slot;
    const area = slot ? (slot.width_cm * slot.height_cm) / 1e4 : v ? Math.PI * (v.diameter_cm / 200) ** 2 : 0;
    return section(name, [
      ["Num", v?.count ?? 1],
      ["Shape", slot ? 2 : 1],
      ["Fb", v?.fb ?? 0],
      ["Vb", v ? vb_l / 1000 : 0],
      ["dia1", slot ? slot.width_cm / 100 : v ? v.diameter_cm / 100 : 0.102],
      ["dia2", slot ? slot.height_cm / 100 : v ? v.diameter_cm / 100 : 0.102],
      ["carea", area],
      ["len", v ? v.length_cm / 100 : 0],
      ["endcorrection", v?.endCorrection ?? 0.732],
      ["crosscalc", 1],
    ]);
  };
  const b = p.box;
  const rearLoss = p.losses;
  const zero = { ql: 0, qa: 0, qp: 0 };
  const front = b.type === "bandpass" ? b.front.losses : zero;
  const bType = b.type === "sealed" ? 0 : b.type === "vented" ? 1 : b.type === "passive-radiator" ? 4 : b.order === "4" ? 2 : 3;
  const vr = b.type === "bandpass" ? b.rear.vb_l : b.vb_l;
  // A closed (rear) chamber's Fr is the driver's resonance in it: Fs·√(1 + Vas/Vr), Vas for all the drivers.
  const vasAll = (p.driver.ts.vas_l ?? 0) * (p.drivers / (p.isobaric ? 2 : 1));
  const closedFr = (p.driver.ts.fs ?? 0) * Math.sqrt(1 + vasAll / vr);
  const fr =
    b.type === "vented" ? b.port.fb : b.type === "passive-radiator" ? b.fb : b.type === "bandpass" ? (b.rear.port?.fb ?? closedFr) : closedFr;
  const portArea = (v?: WprPortOut) => (v ? v.count * (v.slot ? (v.slot.width_cm * v.slot.height_cm) / 1e4 : Math.PI * (v.diameter_cm / 200) ** 2) : 0);
  // The [Driver] block, with the air WinISD keeps there.
  const driver = writeWdr(p.driver, p.air).replace(/\r\n$/, "") + `\r\nc=${n(p.air.c)}\r\nroo=${n(p.air.rho)}\r\n`;
  const rgb = /^#([0-9a-f]{6})$/i.exec(p.color ?? "")?.[1];
  // WinISD stores colours as Windows COLORREF (0x00BBGGRR).
  const colorref = rgb ? parseInt(rgb.slice(4, 6) + rgb.slice(2, 4) + rgb.slice(0, 2), 16) : 8388608;
  let filters: [string, string | number][] = [["Count", 0]];
  if (p.highPass) {
    filters = [
      ["Count", 1],
      ["filter0type", 1],
      ["filter0params", `0;1;${p.highPass.order};${n(p.highPass.freq)};0.707`],
    ];
  }
  const parts = [
    section("ProjectInfo", [
      ["Description", "Exported from Speaker Box Genius"],
      ["CreateDate", today],
      ["ModifyDate", today],
    ]),
    driver,
    section("Box", [
      ["BType", bType],
      ["Vf", b.type === "bandpass" ? b.front.vb_l / 1000 : 0],
      ["Ff", b.type === "bandpass" ? b.front.port.fb : 0],
      ["Qlf", front.ql],
      ["Qaf", front.qa],
      ["Qpf", front.qp],
      ["Vr", vr / 1000],
      ["Fr", fr],
      ["Qlr", rearLoss.ql],
      ["Qar", rearLoss.qa],
      ["Qpr", rearLoss.qp],
      ["Vc", 0],
      ["Fc", 0],
      ["Qlc", 0],
      ["Qac", 0],
      ["Qpc", 0],
      ["Qiclfr", b.type === "bandpass" ? b.qicl : 100],
      ["Qiclfc", 0],
      ["Qiclcr", 0],
      ["T", p.air.temp_C + 273.15],
      ["p", p.air.pressure_hPa * 100],
      ["phi", p.air.humidity_pct / 100],
      ["d", 1],
      ["Med", 0],
      ["Nd", p.drivers],
      ["Angle", 0],
      ["Isobarik", p.isobaric ? 1 : 0],
      ["alfaVC", 0.0039],
      ["dTVC", 0],
      ["Sdfport", b.type === "bandpass" ? portArea(b.front.port) : 0],
      ["Sdrport", b.type === "vented" ? portArea(b.port) : b.type === "bandpass" && b.order === "6p" ? portArea(b.rear.port) : 0],
      ...(b.type === "passive-radiator" ? ([["Npr", b.count]] as [string, number][]) : []),
    ]),
    vent("VentFront", b.type === "bandpass" ? b.front.port : undefined, b.type === "bandpass" ? b.front.vb_l : 0),
    vent("VentRear", b.type === "vented" ? b.port : b.type === "bandpass" && b.order === "6p" ? b.rear.port : undefined, vr),
    vent("VentIntra", b.type === "bandpass" && b.order === "6s" ? b.rear.port : undefined, vr),
    section("PlotSettings", [
      ["Color", colorref],
      ["Width", 1],
    ]),
    section("SignalSource", [
      ["Rg", p.rg],
      ["P", p.power],
    ]),
    section("Filters", filters),
  ];
  if (b.type === "passive-radiator") {
    // WinISD keeps a PR's Fs and Vas (its Mms follows from them).
    const sd = b.pr.sd_cm2 / 1e4;
    const cms = b.pr.vas_l / 1000 / (p.air.rho * p.air.c * p.air.c * sd * sd);
    const fs = 1 / (2 * Math.PI * Math.sqrt((b.pr.mms_g / 1000) * cms));
    parts.push(
      section("PassiveRadiator", [
        ["Vas", b.pr.vas_l / 1000],
        ["Qms", b.pr.qms],
        ["Fs", fs],
        ["Sd", sd],
        ["Xmax", b.pr.xmax_mm / 1000],
        ["Me", b.addedMass_g / 1000],
      ]),
    );
  }
  parts.push(
    section("SimulatorOptions", [
      ["VCInd", p.simulateLe ? 1 : 0],
      ["FlatResponse", 0],
      ["TLPorts", 0],
    ]),
  );
  return parts.join("\r\n");
}
