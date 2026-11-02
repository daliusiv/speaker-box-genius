import type { TsValues } from "./tsSolver.ts";

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

/** Write a .wdr file WinISD can open (dot decimals, SI units). */
export function writeWdr(d: WdrExport): string {
  const t = d.ts;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const n = (v: number | undefined) => (v === undefined ? "0" : String(Number(v.toPrecision(12))));
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
