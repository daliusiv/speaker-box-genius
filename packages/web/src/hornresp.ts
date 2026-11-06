import { flowResistivity, portEffectiveLength, semiActive, STANDARD_AIR, type DriverInput, type SemiInductance, type TsValues } from "@sbg/engine";
import { lineLength } from "./sim.ts";
import type { LineDesign, LineSection } from "./state.ts";

/**
 * Hornresp records, both ways, for transmission lines, tapped horns and front-loaded horns.
 *
 * Hornresp describes a horn as up to four segments (S1…S5 areas, L12…L45 lengths, each
 * with its flare: Par = area linear in length, Con = conical, Exp = exponential), the driver
 * arrangement (OD = offset driver: the driver at S2, used for lines; TH = tapped horn: the
 * driver between S2 and S3; Nd = front-loaded: the driver at the throat with chambers
 * Vrc and Vtc), the driver as mechanical parameters, and filling per segment (Fr1…Fr4
 * flow resistivity in mks rayls/m, Tal1…Tal4 percentage of the segment filled).
 *
 * The export follows the layout of recent Hornresp versions ("|SECTION:" headings,
 * "Key = value" lines); Hornresp fills defaults for parameters left out. The import is
 * tolerant: it reads "Key = value" or "Key=value" pairs in order, from a file or from a
 * record pasted onto a single line in a forum post.
 */

const { rho, c } = STANDARD_AIR;
const r2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);
const MAX_SEGMENTS = 4;

interface Seg {
  s1: number;
  s2: number;
  length_cm: number;
  taper: LineSection["taper"];
  fill_kgm3: number;
}

const FLARE: Record<LineSection["taper"], string> = { linear: "Par", conical: "Con", exponential: "Exp" };

/** Area at fraction t along a section from s1 to s2. */
function areaAt(s1: number, s2: number, taper: LineSection["taper"], t: number) {
  if (taper === "conical") return (Math.sqrt(s1) + (Math.sqrt(s2) - Math.sqrt(s1)) * t) ** 2;
  if (taper === "exponential") return s1 * (s2 / s1) ** t;
  return s1 + (s2 - s1) * t;
}

/** The line's sections as segments split at the given points (cm from the closed end). */
function segmentsSplitAt(d: LineDesign, points: number[]): Seg[] {
  const out: Seg[] = [];
  let pos = 0;
  let start = d.closedArea_cm2;
  for (const s of d.sections) {
    const cuts = [0, ...points.filter((p) => p > pos + 0.05 && p < pos + s.length_cm - 0.05).map((p) => (p - pos) / s.length_cm), 1];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = areaAt(start, s.endArea_cm2, s.taper, cuts[i]!);
      const b = areaAt(start, s.endArea_cm2, s.taper, cuts[i + 1]!);
      out.push({ s1: a, s2: b, length_cm: (cuts[i + 1]! - cuts[i]!) * s.length_cm, taper: s.taper, fill_kgm3: s.fill_kgm3 });
    }
    pos += s.length_cm;
    start = s.endArea_cm2;
  }
  return out;
}

/** Hornresp's mechanical driver parameters from T/S (Mmd excludes the air load on both sides). */
export function mechanicalFromTs(d: DriverInput) {
  const sd = d.sd_cm2 / 1e4;
  const cms = d.vas_l / 1000 / (rho * c * c * sd * sd);
  const w = 2 * Math.PI * d.fs;
  const mms = 1 / (w * w * cms);
  const a = Math.sqrt(sd / Math.PI);
  const mmd = mms - (16 * rho * a ** 3) / 3;
  const bl = Math.sqrt((w * mms * d.re) / d.qes);
  const rms = (w * mms) / d.qms;
  return { sd_cm2: d.sd_cm2, bl, cms, rms, mmd_g: mmd * 1000, le_mh: d.le_mh ?? 0, re: d.re };
}

/** T/S values from Hornresp's mechanical parameters. */
export function tsFromMechanical(m: { sd_cm2: number; bl: number; cms: number; rms: number; mmd_g: number; re: number }): TsValues {
  const sd = m.sd_cm2 / 1e4;
  const a = Math.sqrt(sd / Math.PI);
  const mms = m.mmd_g / 1000 + (16 * rho * a ** 3) / 3;
  const w = 1 / Math.sqrt(mms * m.cms);
  const fs = w / (2 * Math.PI);
  return {
    fs,
    qms: (w * mms) / m.rms,
    qes: (w * mms * m.re) / (m.bl * m.bl),
    vas_l: rho * c * c * sd * sd * m.cms * 1000,
    re: m.re,
    sd_cm2: m.sd_cm2,
  };
}

export interface HornrespExport {
  text: string;
  /** Every value, for typing in by hand. */
  rows: { key: string; value: string; note?: string }[];
  warnings: string[];
}

/**
 * A Hornresp record for this line design. `eg` is the drive in volts; `drivers` the number
 * of identical drivers.
 */
export function toHornresp(
  d: LineDesign,
  driver: DriverInput,
  o: { eg: number; drivers: number; wiring?: "parallel" | "series"; name: string; pmax?: number; xmax_mm?: number },
): HornrespExport | string {
  const warnings: string[] = [];
  const L = lineLength(d);
  const tiny = 0.01; // Hornresp's way of saying "the driver is at the closed end"
  let segs: Seg[];
  let topo: "OD" | "TH" | "Nd";
  if (d.end === "horn") {
    topo = "Nd";
    segs = segmentsSplitAt(d, []);
  } else if (d.end === "tapped") {
    topo = "TH";
    segs = segmentsSplitAt(d, [d.driverAt_cm, d.tapAt_cm]);
    if (d.driverAt_cm < 0.05) segs.unshift({ s1: d.closedArea_cm2, s2: d.closedArea_cm2, length_cm: tiny, taper: "linear", fill_kgm3: 0 });
  } else {
    topo = "OD";
    segs = segmentsSplitAt(d, [d.driverAt_cm]);
    if (d.driverAt_cm < 0.05) segs.unshift({ s1: d.closedArea_cm2, s2: d.closedArea_cm2, length_cm: tiny, taper: "linear", fill_kgm3: 0 });
  }
  if (d.end === "port") {
    // The port as one more (uniform) segment; a flared port as its equivalent straight length.
    const port = { shape: "round" as const, diameter_cm: d.portDiameter_cm, length_cm: d.portLength_cm, ...(d.portFlare_cm > 0 ? { flare_cm: d.portFlare_cm } : {}) };
    const area = Math.PI * (d.portDiameter_cm / 2) ** 2;
    // Hornresp's areas are continuous: a very short segment steps down to the port.
    segs.push({ s1: segs.at(-1)!.s2, s2: area, length_cm: tiny, taper: "linear", fill_kgm3: 0 });
    segs.push({ s1: area, s2: area, length_cm: portEffectiveLength(port, 0) * 100, taper: "linear", fill_kgm3: 0 });
    if (d.portFlare_cm > 0) warnings.push("The flared port is exported as a straight port of the same tuning (Hornresp segments can't flare at both ends).");
  }
  if (segs.length > MAX_SEGMENTS) {
    return `Hornresp takes at most ${MAX_SEGMENTS} segments, and this ${d.end === "horn" ? "horn" : "line"} needs ${segs.length} (sections, ${topo === "TH" ? "the rear and the tap" : "the driver position"}${d.end === "port" ? " and the port" : ""} each start one). Merge some sections to export it.`;
  }
  if (L <= 0) return "The line has no length.";
  if (d.mouth !== "front") warnings.push("Hornresp places the mouth next to the driver: the mouth position isn't exported.");

  const m = mechanicalFromTs(driver);
  const rows: HornrespExport["rows"] = [];
  const lines: string[] = [];
  const put = (key: string, value: string, note?: string) => {
    lines.push(`${key} = ${value}`);
    if (note !== "") rows.push({ key, value, ...(note ? { note } : {}) });
  };
  // Settings this app doesn't use, written as Hornresp writes its defaults (no table row).
  const fixed = (key: string, value: string) => put(key, value, "");
  const head = (h: string) => lines.push("", `|${h}:`, "");
  const gap = () => lines.push("");

  // Hornresp's speed of sound (its F values for Exp segments use 344 m/s).
  const C_HR = 344;
  const expCutoff = (sg: Seg) => (C_HR * Math.log(sg.s2 / sg.s1)) / (4 * Math.PI * (sg.length_cm / 100));
  const last = segs[segs.length - 1]!;
  const mouthExp = last.taper === "exponential" && last.s2 > last.s1;

  // The layout of a Hornresp 55.30 export, field for field (test/fixtures/hornresp-55.30-default.txt).
  lines.push("ID = 55.30", "", `Comment = ${o.name.replace(/[\r\n|]/g, " ").slice(0, 60)} (Speaker Box Genius)`);
  head("RADIATION, SOURCE AND MOUTH PARAMETER VALUES");
  put("Ang", "2.0 x Pi", "half space");
  put("Eg", r2(o.eg), "volts");
  put("Rg", "0.00");
  if (mouthExp) {
    // Mouth circumference in wavelengths at the last segment's flare cutoff (free space).
    const cir = (2 * Math.sqrt((last.s2 / 1e4) / Math.PI) * Math.PI * expCutoff(last)) / C_HR;
    put("Cir", r2(cir), "mouth circumference ÷ wavelength at the flare cutoff");
  } else put("Fta", "0.00");
  head("HORN PARAMETER VALUES");
  for (let i = 0; i < MAX_SEGMENTS; i++) {
    const a = i + 1;
    const b = i + 2;
    const sg = segs[i];
    if (sg) {
      put(`S${a}`, r2(sg.s1), "cm²");
      put(`S${b}`, r2(sg.s2), "cm²");
      put(FLARE[sg.taper], r2(sg.length_cm), `L${a}${b}, cm`);
      put(`F${a}${b}`, r2(sg.taper === "exponential" && sg.s2 !== sg.s1 ? expCutoff(sg) : 0), sg.taper === "exponential" ? "flare cutoff, Hz" : undefined);
    } else {
      fixed(`S${a}`, "0.00");
      fixed(`S${b}`, "0.00");
      fixed(`L${a}${b}`, "0.00");
      fixed(`F${a}${b}`, "0.00");
    }
  }
  head("TRADITIONAL DRIVER PARAMETER VALUES");
  put("Sd", r2(m.sd_cm2), "cm²");
  put("Bl", r2(m.bl), "T·m");
  // Hornresp writes a two-digit exponent: 5.91E-04.
  put("Cms", m.cms.toExponential(2).toUpperCase().replace(/E([+-])(\d)$/, "E$10$2"), "m/N");
  put("Rms", r2(m.rms), "N·s/m");
  put("Mmd", r2(m.mmd_g), "g, without air load");
  put("Le", r2(m.le_mh), "mH");
  put("Re", r2(m.re), "Ω");
  // More than one driver is written with its wiring, "2P" or "2S": Hornresp 60.60 ignores a
  // bare "2" (checked: OD = 2 gives the same results as OD = 1).
  const count = Math.max(1, Math.round(o.drivers));
  const kind = topo === "OD" ? "offset driver (driver at S2)" : topo === "TH" ? "tapped horn (driver between S2 and S3)" : "front-loaded";
  put(topo, count > 1 ? `${count}${o.wiring === "series" ? "S" : "P"}` : "1", count > 1 ? `${kind}, ${count} drivers in ${o.wiring === "series" ? "series" : "parallel"}` : kind);
  head("ADVANCED DRIVER PARAMETER VALUES FOR SEMI-INDUCTANCE MODEL");
  // Hornresp's semi-inductance model is the app's (Re' is the model's own Re, if set). Hornresp also
  // needs it switched on: double-click Le, then On.
  const semi = semiActive(driver.semi) ? driver.semi : null;
  if (semi) {
    put("Re'", r2(semi.re_ohm && semi.re_ohm > 0 ? semi.re_ohm : m.re), "Ω");
    put("Leb", r2(semi.leb_mh), "mH");
    put("Le", r2(semi.le_mh), "mH");
    put("Ke", r2(semi.ke), "sH");
    put("Rss", r2(semi.rss_ohm), "Ω");
    warnings.push("The driver uses the semi-inductance model: in Hornresp, double-click Le and click On (Le turns green), or it uses the plain Le.");
  } else for (const k of ["Re'", "Leb", "Le", "Ke", "Rss"]) fixed(k, "0.00");
  head("ADVANCED DRIVER PARAMETER VALUES FOR FREQUENCY-DEPENDENT DAMPING MODEL");
  fixed("Rms", "0.00");
  fixed("Ams", "0.00");
  head("PASSIVE RADIATOR PARAMETER VALUE");
  fixed("Added Mass", "0.00");
  head("CHAMBER PARAMETER VALUES");
  put("Vrc", r2(topo === "Nd" ? d.rearChamber_l : 0), "rear chamber, L");
  // Hornresp drops the rear chamber (and lets the cone's back radiate) when Lrc = 0, so give it
  // the depth of a cube of that volume. With chamber resonances masked the depth changes nothing else.
  put("Lrc", r2(topo === "Nd" && d.rearChamber_l > 0 ? Math.cbrt(d.rearChamber_l * 1000) : 0), "rear chamber depth, cm");
  fixed("Fr", "0.00");
  fixed("Tal", "0.00");
  // Hornresp's throat chamber volume is in cm³.
  put("Vtc", r2(topo === "Nd" ? d.throatChamber_l * 1000 : 0), "throat chamber, cm³");
  put("Atc", r2(topo === "Nd" && d.throatChamber_l > 0 ? m.sd_cm2 * Math.max(1, o.drivers) : 0), "cm²");
  gap();
  fixed("Acoustic Path Length", "0.0");
  head("MAXIMUM SPL PARAMETER VALUES");
  fixed("Pamp", "100");
  fixed("Vamp", "25");
  fixed("Iamp", "4");
  put("Pmax", String(Math.round(o.pmax ?? 100)), "W");
  put("Xmax", (o.xmax_mm ?? 5).toFixed(1), "mm");
  gap();
  fixed("Maximum SPL Setting", "3");
  head("ABSORBENT FILLING MATERIAL PARAMETER VALUES");
  for (let i = 0; i < MAX_SEGMENTS; i++) {
    const f = segs[i]?.fill_kgm3 ?? 0;
    put(`Fr${i + 1}`, r2(f > 0 ? flowResistivity(f) : 0), f > 0 ? `mks rayls/m (${f} kg/m³ polyester)` : "");
  }
  gap();
  for (let i = 0; i < MAX_SEGMENTS; i++) put(`Tal${i + 1}`, "100", segs[i]?.fill_kgm3 ? "% of the segment filled" : "");
  if (segs.some((sg) => sg.fill_kgm3 > 0)) warnings.push("Stuffing is exported as flow resistivity (Fr1…Fr4, rayls/m). Hornresp only uses it in the Loudspeaker Wizard (Tools → Loudspeaker Wizard), not from the main window's Calculate, and its filling model differs from this one, so stuffed lines won't match exactly.");
  lines.push(...HORNRESP_TAIL);
  return { text: lines.join("\r\n") + "\r\n", rows, warnings };
}


/** Filter, EQ, flag and other settings, exactly as Hornresp 55.30 writes its defaults. */
const HORNRESP_TAIL = `
|ACTIVE BAND PASS FILTER PARAMETER VALUES:

High Pass Frequency = 0
High Pass Slope = 1
Low Pass Frequency = 0
Low Pass Slope = 1

Butterworth High Pass Order = 1
Butterworth Low Pass Order = 1
Linkwitz-Riley High Pass Order = 2
Linkwitz-Riley Low Pass Order = 2
Bessel High Pass Order = 1
Bessel Low Pass Order = 1

2nd Order High Pass Q = 0.5
2nd Order Low Pass Q = 0.5
4th Order High Pass Q = 0.5
4th Order Low Pass Q = 0.5

Active Filter Alignment = 1
Active Filter On / Off Switch = 1

|PASSIVE FILTER PARAMETER VALUES:

Series / Parallel 1 = S
Series / Parallel 2 = S
Series / Parallel 3 = S
Series / Parallel 4 = S

|EQUALISER FILTER PARAMETER VALUES:

${[1, 2, 3, 4, 5, 6].map((b) => `Band ${b} Frequency = 0\nBand ${b} Q Factor = 0.01\nBand ${b} Gain = 0.0\nBand ${b} Type = -1`).join("\n")}

|STATUS FLAGS:

Auto Path Flag = 0
Lossy Inductance Model Flag = 0
Semi-Inductance Model Flag = 0
Damping Model Flag = 0
Closed Mouth Flag = 0
Continuous Flag = 1
End Correction Flag = 1

|OTHER SETTINGS:

Filter Type Index = 0
Filter Input Index = 0
Filter Output Index = 0

Filter Type = 1

MEH Configuration = 0
ME Amplifier Polarity Value = 1`.split("\n");

const TAPER: Record<string, LineSection["taper"]> = { par: "linear", con: "conical", exp: "exponential" };

export interface HornrespImport {
  design: Partial<LineDesign>;
  /** The record's driver, when it has one. */
  driver?: { ts: TsValues; le_mh: number; xmax_mm?: number; name: string; semi?: SemiInductance };
  /** How many drivers the record has, and their wiring ("2P" / "2S"). */
  drivers?: { count: number; wiring: "parallel" | "series" };
  warnings: string[];
}

/** Read a Hornresp record (file text, or pasted from a forum on one line). */
export function fromHornresp(text: string, base: LineDesign): HornrespImport | string {
  const warnings: string[] = [];
  // Key = value pairs in order. Values: numbers (comma or point decimals), or "2.0 x Pi".
  const re = /(?:^|[\s|])([A-Za-z][A-Za-z0-9']*(?: [A-Za-z][A-Za-z0-9']*)*)\s*=\s*([-+]?\d(?:[\d.,]*\d)?(?:E[-+]?\d+)?(?:\s*x\s*Pi|,\s*[A-Za-z]{3}\b)?|[A-Za-z][^\s|]*)/gi;
  const pairs: [string, string][] = [];
  for (const m of text.matchAll(re)) pairs.push([m[1]!.trim(), m[2]!.trim()]);
  if (pairs.length === 0) return "No Hornresp values found: paste a whole record (it starts with ID = …).";
  // Regional decimals: "0,000151" is 0.000151 (Hornresp writes the user's decimal separator).
  const num = (v: string) => {
    const x = v.replace(/,\s*[A-Za-z]{3}$/, "").replace(/,$/, "");
    return Number(x.includes(".") ? x.replace(/,/g, "") : x.replace(",", "."));
  };
  const get = (k: string) => {
    const p = pairs.find(([key]) => key.toLowerCase() === k.toLowerCase());
    return p ? num(p[1]) : undefined;
  };

  // Segments: S areas and lengths keyed by their flare, in order.
  const areas: number[] = [];
  const segs: { length_cm: number; taper: LineSection["taper"]; flare: string }[] = [];
  for (const [k, v] of pairs) {
    const sm = /^S([1-6])$/i.exec(k);
    if (sm) {
      // Unused segments are written as zeros ("S3 = 0.00" after "S3 = 2400.00"): keep the real area.
      const idx = Number(sm[1]) - 1;
      const val = num(v);
      if (val > 0 || areas[idx] === undefined) areas[idx] = val;
      continue;
    }
    const lm = /^L(\d)(\d)$/i.exec(k);
    const flare = lm ? (/,\s*([A-Za-z]+)/.exec(v)?.[1] ?? "Par") : ["par", "con", "exp", "hyp", "tra", "obl"].includes(k.toLowerCase()) ? k : null;
    if (flare) {
      const len = num(v.split(/,\s*[A-Za-z]/)[0]!);
      segs.push({ length_cm: len, taper: TAPER[flare.toLowerCase()] ?? "linear", flare });
      if (!TAPER[flare.toLowerCase()]) warnings.push(`Segment ${segs.length}: Hornresp's "${flare}" flare is read as linear (Par).`);
    }
  }
  const used = segs.filter((s, i) => s.length_cm > 0 && areas[i] !== undefined && areas[i + 1] !== undefined && areas[i]! > 0 && areas[i + 1]! > 0);
  if (used.length === 0) return "The record has no horn or line segments (S1, S2 and a length).";

  const typeValue = pairs.find(([k]) => k.toLowerCase() === "type")?.[1]?.toUpperCase();
  const topo = pairs.find(([k]) => /^(OD|TH|Nd|ND)$/.test(k))?.[0]?.toUpperCase() ?? (typeValue === "OD" || typeValue === "TH" ? typeValue : "ND");
  const fills = [1, 2, 3, 4].map((i) => {
    const fr = get(`Fr${i}`) ?? 0;
    // mks rayls/m (Pa·s/m²) → the density that gives it (inverse of Garai–Pompoli).
    return fr > 0 ? Math.round(((fr / 25.989) ** (1 / 1.404)) * 10) / 10 : 0;
  });

  // Sections from the segments (closed end / throat = S1).
  let sections: LineSection[] = used.map((s, i) => ({ length_cm: s.length_cm, endArea_cm2: areas[i + 1]!, taper: s.taper, fill_kgm3: fills[i] ?? 0 }));
  const lengths = used.map((s) => s.length_cm);
  const design: Partial<LineDesign> = { closedArea_cm2: areas[0]!, mouth: "front" };
  if (topo === "TH") {
    design.end = "tapped";
    design.driverAt_cm = lengths[0]! < 0.5 ? 0 : lengths[0]!;
    design.tapAt_cm = lengths[0]! + (lengths[1] ?? 0);
    if (lengths[0]! < 0.5) sections = sections.slice(1);
  } else if (topo === "OD") {
    design.end = "open";
    design.driverAt_cm = lengths[0]! < 0.5 ? 0 : lengths[0]!;
    if (lengths[0]! < 0.5) sections = sections.slice(1);
    // A port, as exported here: a very short step down to a narrow uniform last segment.
    // (A uniform tail without the step is simply the last section: it simulates the same.)
    const n = sections.length;
    if (n > 2) {
      const last = sections[n - 1]!;
      const step = sections[n - 2]!;
      const startOfLast = step.endArea_cm2;
      if (step.length_cm < 0.5 && Math.abs(last.endArea_cm2 - startOfLast) <= 0.01 * startOfLast) {
        design.end = "port";
        design.portDiameter_cm = Math.round(2 * Math.sqrt(last.endArea_cm2 / Math.PI) * 10) / 10;
        design.portLength_cm = Math.round(last.length_cm * 10) / 10;
        design.portFlare_cm = 0;
        sections = sections.slice(0, -2);
      }
    }
  } else {
    design.end = "horn";
    design.driverAt_cm = 0;
    // Hornresp only has a rear chamber when both Vrc and Lrc are set; otherwise the driver's back is open.
    const vrc = get("Vrc") ?? 0;
    const closed = vrc > 0 && (get("Lrc") ?? 0) > 0;
    design.rearChamber_l = vrc > 0 ? vrc : base.rearChamber_l;
    if (!closed) warnings.push(`The record has no rear chamber (Vrc or Lrc = 0, an open-backed driver, which isn't modelled here): using a sealed ${design.rearChamber_l} L.`);
    design.throatChamber_l = (get("Vtc") ?? 0) / 1000; // Hornresp: cm³
  }
  // Sections: the first starts at S1 (or at the driver), so re-base the closed area.
  if ((topo === "TH" || topo === "OD") && lengths[0]! < 0.5) design.closedArea_cm2 = areas[1]!;
  if (sections.length > 4) {
    warnings.push("Only the first four sections are kept.");
    sections = sections.slice(0, 4);
  }
  design.sections = sections.map((s) => ({ ...s, length_cm: Math.round(s.length_cm * 100) / 100, endArea_cm2: Math.round(s.endArea_cm2 * 100) / 100 }));
  if (get("Lrc") && (get("Lrc") ?? 0) > 0) warnings.push("The rear chamber's length (Lrc) isn't modelled: it's treated as a plain volume.");
  if ((get("Ap1") ?? 0) > 0 || (get("Ap") ?? 0) > 0) warnings.push("The record has a port in a chamber (Ap1/Lp), which isn't modelled here.");
  const ang = pairs.find(([k]) => k.toLowerCase() === "ang")?.[1];
  if (ang && !/^2(\.0+)?\s*x\s*Pi$/i.test(ang)) warnings.push(`The record radiates into ${ang}; here it's half space (2 × Pi).`);

  // The semi-inductance values: Leb, then the second "Le" (the first is the plain Le), Ke, Rss.
  const semiOf = (): { semi?: SemiInductance } => {
    const at = pairs.findIndex(([k]) => k.toLowerCase() === "leb");
    if (at < 0) return {};
    const after = (key: string) => {
      const v = pairs.slice(at).find(([k]) => k.toLowerCase() === key)?.[1];
      return v === undefined ? 0 : num(v) || 0;
    };
    const s: SemiInductance = { leb_mh: after("leb"), le_mh: after("le"), ke: after("ke"), rss_ohm: after("rss") };
    if (!semiActive(s)) return {};
    // Re' only when it differs from Re (Hornresp takes it as the coil's resistance, Bl kept).
    const reP = Number(/Re'\s*=\s*([-+\d.eE]+)/.exec(text)?.[1] ?? 0);
    if (reP > 0 && Math.abs(reP / (get("Re") ?? reP) - 1) > 0.001) s.re_ohm = reP;
    return { semi: s };
  };
  const sd = get("Sd");
  const bl = get("Bl");
  const cms = get("Cms");
  const rms = get("Rms");
  const mmd = get("Mmd");
  const reV = get("Re");
  let driver: HornrespImport["driver"];
  if (sd && bl && cms && rms && mmd && reV) {
    const comment = /Comment\s*=\s*([^|\r\n]*)/i.exec(text)?.[1]?.trim();
    driver = {
      ts: tsFromMechanical({ sd_cm2: sd, bl, cms, rms, mmd_g: mmd, re: reV }),
      le_mh: get("Le") ?? 0,
      ...(get("Xmax") ? { xmax_mm: get("Xmax")! } : {}),
      ...semiOf(),
      name: comment ? `Hornresp: ${comment.slice(0, 50)}` : "Driver from a Hornresp record",
    };
  }
  // The driver count: "OD = 2P" (parallel) or "2S" (series). Hornresp ignores a bare "2".
  let drivers: HornrespImport["drivers"];
  const nd = /(?:^|[\s|])(?:OD|TH|Nd)\s*=\s*(\d+)\s*([PS])?\b/i.exec(text);
  if (nd && Number(nd[1]) > 1) {
    if (nd[2]) drivers = { count: Number(nd[1]), wiring: nd[2].toUpperCase() === "S" ? "series" : "parallel" };
    else warnings.push(`The record says ${nd[1]} drivers without P or S; Hornresp reads that as one driver, so it was left as it is.`);
  }
  return { design, ...(driver ? { driver } : {}), ...(drivers ? { drivers } : {}), warnings };
}
