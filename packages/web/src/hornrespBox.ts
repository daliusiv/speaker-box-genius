import { passiveRadiatorModel, portEffectiveLength, semiActive, STANDARD_AIR, type DriverInput, type SimulationOptions } from "@sbg/engine";
import { fromHornresp, HORNRESP_TAIL, mechanicalFromTs, signalNotes, type HornrespExport, type HornrespImport } from "./hornresp.ts";
import { portOf } from "./sim.ts";
import { withCompat } from "./compat.ts";
import { MAX_DESIGNS, newDesign, type AppState, type DesignState, type LineDesign, type PrDesign, type SealedDesign, type VentedDesign } from "./state.ts";

/**
 * Hornresp records for sealed, ported and passive radiator boxes, both ways.
 *
 * Hornresp has no plain box: it models one as a front-loaded horn so short it does nothing (S1 =
 * S2 = the cones' area, 0.01 cm, conical) with the box as its rear chamber (Vrc, Lrc), and a port
 * (Ap, Lpt) or a passive radiator (Sp1, Cmp, Mmp, Rmp) in that chamber. The validation records
 * B1–B3 are written this way and match the app (docs/hornresp-validation/records). Acoustic Path
 * Length is the port's or PR's distance from the cone.
 */

/** Hornresp's air density: its PR mass Mmp leaves out the air in front, which it adds back. */
const HR_RHO = 1.205;
const r2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);
const exp2 = (x: number) => x.toExponential(2).toUpperCase().replace(/E([+-])(\d)$/, "E$10$2");
/** The air load on one side of a piston of area sd (m²), kg. */
const oneSideAir = (sd: number) => (8 * HR_RHO * Math.pow(sd / Math.PI, 1.5)) / 3;

export type HornrespBoxDesign = SealedDesign | VentedDesign | PrDesign;
export const hornrespBoxKind = (d: DesignState): d is HornrespBoxDesign => d.kind === "sealed" || d.kind === "vented" || d.kind === "pr";

/**
 * A Hornresp record for a sealed, ported or PR box. `vb_l` is the volume the box acts as (with
 * stuffing), `distance_cm` the port's or PRs' distance from the cone.
 */
export function toHornrespBox(
  d: HornrespBoxDesign,
  driver: DriverInput,
  o: { vb_l: number; distance_cm: number; eg: number; drivers: number; wiring?: "parallel" | "series"; pmax?: number; xmax_mm?: number; sim?: SimulationOptions; stuffed?: boolean },
): HornrespExport | string {
  if (!(o.vb_l > 0)) return "The box has no volume.";
  const warnings: string[] = signalNotes(o.sim);
  const m = mechanicalFromTs(driver);
  const count = Math.max(1, Math.round(o.drivers));
  const rows: HornrespExport["rows"] = [];
  const lines: string[] = [];
  const put = (key: string, value: string, note?: string) => {
    lines.push(`${key} = ${value}`);
    if (note !== "") rows.push({ key, value, ...(note ? { note } : {}) });
  };
  const fixed = (key: string, value: string) => put(key, value, "");
  const head = (h: string) => lines.push("", `|${h}:`, "");

  lines.push("ID = 55.30", "", `Comment = ${d.name.replace(/[\r\n|]/g, " ").slice(0, 60)} (Speaker Box Genius)`);
  head("RADIATION, SOURCE AND MOUTH PARAMETER VALUES");
  put("Ang", "2.0 x Pi", "half space");
  put("Eg", r2(o.eg), "volts");
  put("Rg", r2(Math.max(0, o.sim?.rg ?? 0)), "amplifier + cable resistance (Ω)");
  fixed("Fta", "0.00");
  head("HORN PARAMETER VALUES");
  // The box as a horn too short to matter, from the cones' area.
  const sd = r2(m.sd_cm2 * count);
  put("S1", sd, "cm², the cones' area");
  put("S2", sd, "cm²");
  put("Con", "0.01", "L12, cm: no horn");
  fixed("F12", "0.00");
  for (const [a, b] of [[2, 3], [3, 4], [4, 5]] as const) {
    fixed(`S${a}`, "0.00");
    fixed(`S${b}`, "0.00");
    fixed(`L${a}${b}`, "0.00");
    fixed(`F${a}${b}`, "0.00");
  }
  head("TRADITIONAL DRIVER PARAMETER VALUES");
  put("Sd", r2(m.sd_cm2), "cm²");
  put("Bl", r2(m.bl), "T·m");
  put("Cms", exp2(m.cms), "m/N");
  put("Rms", r2(m.rms), "N·s/m");
  put("Mmd", r2(m.mmd_g), "g, without air load");
  put("Le", r2(m.le_mh), "mH");
  put("Re", r2(m.re), "Ω");
  put("Nd", count > 1 ? `${count}${o.wiring === "series" ? "S" : "P"}` : "1", count > 1 ? `${count} drivers in ${o.wiring === "series" ? "series" : "parallel"}` : "one driver");
  head("ADVANCED DRIVER PARAMETER VALUES FOR SEMI-INDUCTANCE MODEL");
  const semi = semiActive(driver.semi) ? driver.semi : null;
  if (semi) {
    put("Re'", r2(semi.re_ohm && semi.re_ohm > 0 ? semi.re_ohm : m.re), "Ω");
    put("Leb", r2(semi.leb_mh), "mH");
    put("Le", r2(semi.le_mh), "mH");
    put("Ke", r2(semi.ke), "sH");
    put("Rss", r2(semi.rss_ohm), "Ω");
  } else for (const k of ["Re'", "Leb", "Le", "Ke", "Rss"]) fixed(k, "0.00");
  head("ADVANCED DRIVER PARAMETER VALUES FOR FREQUENCY-DEPENDENT DAMPING MODEL");
  const fdd = driver.fdd && driver.fdd.ams_mm_per_n > 0 ? driver.fdd : null;
  if (fdd) {
    put("Rms", r2(fdd.rms), "N·s/m (FDD)");
    put("Ams", exp2(fdd.ams_mm_per_n / 1000), "m/N (FDD)");
  } else {
    fixed("Rms", "0.00");
    fixed("Ams", "0.00");
  }
  head("PASSIVE RADIATOR PARAMETER VALUE");
  // n PRs are written as one (below), so it carries all their added mass.
  put("Added Mass", r2(d.kind === "pr" ? d.addedMass_g * d.count : 0), d.kind === "pr" ? (d.count > 1 ? `g, the ${d.count} PRs' added mass` : "g") : "");
  head("CHAMBER PARAMETER VALUES");
  put("Vrc", r2(o.vb_l), "box, L");
  // Hornresp needs a depth for the chamber; a cube's, as the validation records use.
  put("Lrc", r2(Math.cbrt(o.vb_l * 1000)), "box depth, cm (a cube's)");
  if (d.kind === "sealed") {
    fixed("Fr", "0.00");
    fixed("Tal", "0.00");
  } else if (d.kind === "vented") {
    // n identical ports as one of n × the area: the same tuning but for the end corrections.
    const port = portOf(d);
    const area = d.shape === "slot" ? d.slotWidth_cm * d.slotHeight_cm : Math.PI * (d.diameter_cm / 2) ** 2;
    put("Ap", r2(area * d.count), d.count > 1 ? `cm², the ${d.count} ports' area` : "cm², the port's area");
    put("Lpt", r2(portEffectiveLength(port, 0) * 100), "cm, the port's length");
    fixed("Vtc", "0.00");
    fixed("Atc", "0.00");
    if (d.count > 1) warnings.push(`The ${d.count} ports are written as one port of their total area (Hornresp has one): the same tuning but a slightly longer end correction, so Fb comes out a little lower.`);
    if (d.shape === "slot") warnings.push("The slot is written by its area (Hornresp's ports are round).");
    if (d.shape === "round" && (d.flare_cm ?? 0) > 0) warnings.push("The flared port is written as a straight port of the same tuning (Hornresp's ports have no round-overs).");
  } else {
    // n identical PRs as one with n × the area and mass, 1/n the compliance: the same acoustics.
    const pr = passiveRadiatorModel(d.params, 0, STANDARD_AIR);
    const n = d.count;
    // Hornresp adds the air in front of the one big PR it has.
    const mmp = pr.mmp * n - oneSideAir(pr.sd * n);
    put("Sp1", r2(pr.sd * 1e4 * n), n > 1 ? `cm², the ${n} PRs' area` : "cm²");
    put("Cmp", exp2(pr.cmp / n), "m/N");
    put("Mmp", r2(mmp * 1000), "g, without the air in front (Hornresp adds it)");
    put("Rmp", r2(pr.rmp * n), "N·s/m");
    if (n > 1) warnings.push(`The ${n} passive radiators are written as one with their total area and mass and their added mass (Hornresp has one): the same response and excursion.`);
    if (d.extra.length > 0) warnings.push("Only the first group of passive radiators is written (Hornresp has one).");
  }
  lines.push("");
  // The port's or PRs' distance from the cone: Hornresp's Path, two sources that far apart.
  put("Acoustic Path Length", o.distance_cm.toFixed(1), "cm, the port's or PRs' distance from the cone");
  if (o.distance_cm > 0) warnings.push("The port's distance from the cone is Hornresp's Acoustic Path Length, which sets the level from radiated power: compare with Settings → SPL → From radiated power.");
  head("MAXIMUM SPL PARAMETER VALUES");
  fixed("Pamp", "100");
  fixed("Vamp", "25");
  fixed("Iamp", "4");
  put("Pmax", String(Math.round(o.pmax ?? 100)), "W");
  put("Xmax", (o.xmax_mm ?? 5).toFixed(1), "mm");
  lines.push("");
  fixed("Maximum SPL Setting", "3");
  head("ABSORBENT FILLING MATERIAL PARAMETER VALUES");
  for (let i = 1; i <= 4; i++) fixed(`Fr${i}`, "0.00");
  lines.push("");
  for (let i = 1; i <= 4; i++) fixed(`Tal${i}`, "100");
  if (o.stuffed) warnings.push("Stuffing is written as the bigger volume it makes the box act as (Vrc); its damping isn't.");
  warnings.push("Hornresp's ordinary boxes have no leakage or absorption: set Settings → Box losses to none to compare.");
  lines.push(
    ...HORNRESP_TAIL.map((l) =>
      l === "Semi-Inductance Model Flag = 0" && semi ? "Semi-Inductance Model Flag = 1" : l === "Damping Model Flag = 0" && fdd ? "Damping Model Flag = 1" : l,
    ),
  );
  return { text: lines.join("\r\n") + "\r\n", rows, warnings };
}

/** A box read from a Hornresp record, with the record's driver. */
export interface HornrespBoxImport {
  design: HornrespBoxDesign;
  driver?: HornrespImport["driver"];
  drivers?: HornrespImport["drivers"];
  rg?: number;
  warnings: string[];
}

/**
 * A sealed, ported or PR box from a Hornresp record written as above (a horn of 0.01 cm or less,
 * the box as its rear chamber); null when the record is a real horn or line.
 */
export function fromHornrespBox(text: string, existing: DesignState[], name: string): HornrespBoxImport | null | string {
  const pairs = [...text.matchAll(/(?:^|[\s|])([A-Za-z][A-Za-z0-9']*(?: [A-Za-z][A-Za-z0-9']*)*)\s*=\s*([-+]?\d(?:[\d.,]*\d)?(?:E[-+]?\d+)?)/gi)].map((m) => [m[1]!.toLowerCase(), m[2]!] as const);
  const get = (k: string) => {
    const v = pairs.find(([key]) => key === k.toLowerCase())?.[1];
    if (v === undefined) return undefined;
    return Number(v.includes(".") ? v.replace(/,/g, "") : v.replace(",", "."));
  };
  // A box: a horn of at most 0.1 cm (in whichever flare) into nothing, and a rear chamber.
  const len = ["par", "con", "exp", "l12"].map((k) => get(k)).find((x) => x !== undefined && x > 0);
  const vrc = get("Vrc") ?? 0;
  const s3 = pairs.filter(([k]) => k === "s3").some(([, v]) => Number(v.replace(",", ".")) > 0);
  if (!(len !== undefined && len <= 0.1 && vrc > 0 && !s3)) return null;
  const line = fromHornresp(text, newDesign("line", existing) as Parameters<typeof fromHornresp>[1]);
  if (typeof line === "string") return line;
  // Keep the driver notes; the line reader's notes about horns, chambers and ports don't apply.
  const warnings = line.warnings.filter((w) => /semi-inductance|damping|without P or S|radiates into/i.test(w));
  const path = get("Acoustic Path Length") ?? 0;
  const at = path > 0 ? { ventAt: "custom" as const, ventDistance_cm: Math.round(path * 10) / 10 } : {};
  if (path > 0) warnings.push(`Acoustic Path Length ${at.ventDistance_cm} cm is the port's or PR's distance from the cone; it matches Hornresp with Settings → SPL → From radiated power.`);
  const vb_l = Math.round(vrc * 1000) / 1000;
  const ap = get("Ap") ?? get("Ap1") ?? 0;
  const sp = get("Sp1") ?? get("Sp") ?? 0;
  let design: HornrespBoxDesign;
  if (sp > 0) {
    const cmp = get("Cmp") ?? 0;
    const mmp = get("Mmp") ?? 0;
    const rmp = get("Rmp") ?? 0;
    if (!(cmp > 0 && mmp > 0)) return "The record's passive radiator has no Cmp or Mmp.";
    const base = newDesign("pr", existing) as PrDesign;
    // The app's PR mass includes the air in front, which Hornresp adds to Mmp itself.
    const m0 = mmp / 1000 + oneSideAir(sp / 1e4);
    const vas = STANDARD_AIR.rho * STANDARD_AIR.c ** 2 * (sp / 1e4) ** 2 * cmp * 1000;
    // Rmp as passiveRadiatorModel derives it from Qms: Rmp = √(M/C) / Qms.
    const qms = rmp > 0 ? Math.sqrt(m0 / cmp) / rmp : 10;
    design = {
      ...base,
      name,
      vb_l,
      prName: "From Hornresp record",
      count: 1,
      extra: [],
      addedMass_g: Math.round((get("Added Mass") ?? 0) * 100) / 100,
      params: { mms_g: Number((m0 * 1000).toFixed(3)), sd_cm2: Number(sp.toFixed(2)), vas_l: Number(vas.toFixed(3)), qms: Number(qms.toPrecision(5)), xmax_mm: base.params.xmax_mm },
      ...at,
    };
    warnings.push("Hornresp has no PR Xmax: the PR's Xmax is a placeholder, set it from the datasheet.");
  } else if (ap > 0) {
    const lpt = get("Lpt") ?? get("Lp") ?? 0;
    if (!(lpt > 0)) return "The record's port has no length (Lpt).";
    const base = newDesign("vented", existing) as VentedDesign;
    design = { ...base, name, vb_l, shape: "round", diameter_cm: Number((2 * Math.sqrt(ap / Math.PI)).toFixed(2)), length_cm: Number(lpt.toFixed(2)), count: 1, flare_cm: 0, ...at };
  } else {
    design = { ...(newDesign("sealed", existing) as SealedDesign), name, vb_l };
    if (path > 0) warnings.pop();
  }
  return { design, ...(line.driver ? { driver: line.driver } : {}), ...(line.drivers ? { drivers: line.drivers } : {}), ...(line.rg ? { rg: line.rg } : {}), warnings };
}

/**
 * A Hornresp record opened from the Open window: the box (or line) as a new design, the record's
 * driver, and Settings matched to Hornresp's conventions (as a WinISD project sets WinISD's).
 */
export function applyHornresp(s: AppState, text: string, fileName: string): { state: AppState; message: string } | string {
  const base = fileName.replace(/\.txt$/i, "");
  const name = `Hornresp: ${base}`.slice(0, 40);
  const box = fromHornrespBox(text, s.designs, name);
  if (typeof box === "string") return box;
  let design: DesignState;
  let imp: { driver?: HornrespImport["driver"]; drivers?: HornrespImport["drivers"]; rg?: number; warnings: string[] };
  if (box) {
    design = box.design;
    imp = box;
  } else {
    const lineBase = newDesign("line", s.designs) as LineDesign;
    const r = fromHornresp(text, lineBase);
    if (typeof r === "string") return r;
    design = { ...lineBase, ...r.design, name } as LineDesign;
    imp = r;
  }
  if (s.designs.length >= MAX_DESIGNS) return `There are already ${MAX_DESIGNS} designs: delete one to open another.`;
  const x = imp.driver;
  const state: AppState = {
    ...s,
    ...(x
      ? {
          driverName: x.name,
          driverBrand: "",
          ts: x.ts,
          le_mh: x.le_mh,
          l2_mh: 0,
          r2_ohm: 0,
          semi: x.semi,
          fdd: x.fdd,
          ...(x.xmax_mm !== undefined ? { xmax_mm: x.xmax_mm } : {}),
          dvc: { ...s.dvc, on: false },
        }
      : {}),
    ...(imp.drivers ? { drivers: imp.drivers.count, wiring: imp.drivers.wiring } : x ? { drivers: 1 } : {}),
    settings: { ...withCompat(s.settings, "hornresp"), rg: imp.rg ?? 0 },
    designs: [...s.designs, design],
  };
  const what = design.kind === "line" ? "line" : design.kind === "pr" ? "passive radiator box" : design.kind === "vented" ? "ported box" : "sealed box";
  const message = [`Opened ${fileName} as a ${what}${x ? " with its driver" : ""}; Settings now match Hornresp's conventions.`, ...imp.warnings].join(" ");
  return { state, message };
}
