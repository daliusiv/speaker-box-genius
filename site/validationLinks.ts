/**
 * "Open in app" links for the validation page: each case as an app project, built the way the
 * app's own imports build it, so the link opens what importing the same file would.
 *
 * - WinISD cases: the case's .wpr through applyWpr (the app's WinISD import).
 * - Hornresp lines and horns: the case's Hornresp record through fromHornresp (the app's Hornresp
 *   import), with Hornresp's drive (2.83 V), air and SPL from radiated power, and the case's
 *   options (two drivers, a hot voice coil).
 * - Hornresp boxes, filters, EQ and stuffed lines: the case's own test input (case.json) as app
 *   settings and a design. There's no Hornresp box import in the app, so these are mapped here;
 *   the driver is the one the comparison uses (Hornresp's front-air convention applied).
 *
 * validationLinks.test.ts checks that every linked project simulates to the case's reference.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseWpr } from "../packages/engine/src/index.ts";
import { WINISD_CASES } from "../packages/engine/validation/winisd.ts";
import { HORNRESP_AIR, HORNRESP_DRIVER, hornrespDriver, readBoxCase } from "../packages/engine/validation/hornresp.ts";
import type { EnclosureInput, PassiveRadiatorInput, PortInput } from "../packages/engine/src/index.ts";
import { DEFAULT_STATE, encodeStateShort, newDesign, NO_LOSS_Q, type AppState, type BandpassDesign, type DesignState, type LineDesign, type PortFields, type PrDesign, type PrGroupState, type PrParams, type VentedDesign } from "../packages/web/src/state.ts";
import { applyWpr } from "../packages/web/src/wprImport.ts";
import { fromHornresp } from "../packages/web/src/hornresp.ts";

const ROOT = join(import.meta.dirname, "..");
const FIXTURES = join(ROOT, "packages/engine/test/fixtures");
const RECORDS = join(ROOT, "docs/hornresp-validation/records");

/** The app's defaults with no boxes: each case adds its own. */
const EMPTY: AppState = { ...DEFAULT_STATE, designs: [] };

/** A WinISD case as the app opens its project file. */
export function winisdCaseState(id: string): AppState | null {
  const c = WINISD_CASES.find((x) => x.id === id);
  if (!c) return null;
  const p = parseWpr(readFileSync(join(FIXTURES, c.fixture), "latin1"));
  const s = applyWpr(EMPTY, p, c.fixture).state;
  return s.designs.length ? { ...s, designs: s.designs.map((d) => ({ ...d, name: c.title })) } : null;
}

const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The Hornresp record for a line case: the one named like it, or (a case that only changes an
 * option, such as a hot voice coil) the record of the case with the same line.
 */
function recordFor(id: string): string | null {
  const own = join(RECORDS, `${id}.txt`);
  if (existsSync(own)) return own;
  const input = read(join(FIXTURES, "hornresp", id, "input.json"));
  for (const other of readdirSync(join(FIXTURES, "hornresp"))) {
    const rec = join(RECORDS, `${other}.txt`);
    if (other !== id && existsSync(rec) && same(read(join(FIXTURES, "hornresp", other, "input.json")), input)) return rec;
  }
  return null;
}

/** A Hornresp line or horn case as the app opens its record, with Hornresp's drive and air. */
export function hornrespLineState(id: string, title: string): AppState | null {
  const rec = recordFor(id);
  if (!rec) return null;
  const r = fromHornresp(readFileSync(rec, "latin1"), newDesign("line", []) as LineDesign);
  if (typeof r === "string" || !r.driver) return null;
  const opts = existsSync(join(FIXTURES, "hornresp", id, "options.json")) ? read(join(FIXTURES, "hornresp", id, "options.json")) : {};
  const line = { ...(newDesign("line", []) as LineDesign), ...r.design, name: title } as LineDesign;
  // Hornresp records carry no power rating or Xmax: the case's own driver data has them.
  const own = join(FIXTURES, "hornresp", id, "driver.json");
  const caseDriver = existsSync(own) ? read(own) : HORNRESP_DRIVER;
  return {
    ...EMPTY,
    driverName: r.driver.name || "Hornresp driver",
    driverBrand: "",
    ts: r.driver.ts,
    le_mh: r.driver.le_mh,
    l2_mh: 0,
    r2_ohm: 0,
    semi: r.driver.semi,
    fdd: r.driver.fdd,
    xmax_mm: r.driver.xmax_mm ?? caseDriver.xmax_mm ?? EMPTY.xmax_mm,
    pe_w: caseDriver.pe_w ?? 0,
    drive: "volts",
    volts: 2.83,
    drivers: opts.drivers ?? r.drivers?.count ?? 1,
    wiring: opts.wiring ?? r.drivers?.wiring ?? "parallel",
    settings: {
      ...EMPTY.settings,
      air: "hornresp",
      lineSpl: "power",
      rg: r.rg ?? 0,
      coilTemp_C: opts.coilTemp_C ?? EMPTY.settings.coilTemp_C,
    },
    designs: [line],
  };
}

/** No loss: the comparisons leave losses out (Infinity); a link carries the app's "none" (NO_LOSS_Q). */
const NONE = NO_LOSS_Q;
const q = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? NONE : v);
/** The DSA270-PR's Xmax (the cases give its mass, area and suspension; the app also wants its travel). */
const DSA270_XMAX = 11;

function prParams(pr: PassiveRadiatorInput): PrParams {
  // Vas from Cms with Hornresp's air, which the link's settings use too.
  const sd = pr.sd_cm2 / 1e4;
  const vas_l = pr.vas_l ?? (HORNRESP_AIR.rho * HORNRESP_AIR.c ** 2 * sd * sd * (pr.cms_mm_per_n! / 1000)) * 1000;
  return { mms_g: pr.mms_g, sd_cm2: pr.sd_cm2, vas_l, qms: pr.qms ?? 10, xmax_mm: pr.xmax_mm ?? DSA270_XMAX };
}

function portFields(p: PortInput, count: number, base: PortFields): PortFields {
  return p.shape === "round"
    ? { ...base, shape: "round", diameter_cm: p.diameter_cm, length_cm: p.length_cm, count, flare_cm: p.flare_cm ?? 0 }
    : { ...base, shape: "slot", slotWidth_cm: p.width_cm, slotHeight_cm: p.height_cm, length_cm: p.length_cm, count, flare_cm: 0 };
}

const groups = (prs: { pr: PassiveRadiatorInput; count: number; addedMass_g?: number }[]): PrGroupState[] =>
  prs.map((g) => ({ prName: "Dayton Audio DSA270-PR", count: g.count, addedMass_g: g.addedMass_g ?? 0, params: prParams(g.pr) }));

/** The case's enclosure as an app design (and the losses it wants in Settings). */
function boxDesign(input: EnclosureInput, name: string): { design: DesignState; losses: { ql: number; qa: number; qp: number } } | null {
  const i = input as EnclosureInput & { ql?: number; qa?: number; qp?: number };
  const losses = { ql: q(i.ql), qa: q(i.qa), qp: q(i.qp) };
  // A port or PR some way from the cone (Hornresp's Acoustic Path Length).
  const at = (input.kind === "vented" || input.kind === "passive-radiator") && (input.ventDistance_cm ?? 0) > 0 ? { ventAt: "custom" as const, ventDistance_cm: input.ventDistance_cm } : {};
  switch (input.kind) {
    case "sealed":
      return { design: { ...newDesign("sealed", []), name, vb_l: input.vb_l }, losses };
    case "vented": {
      const v = newDesign("vented", []) as VentedDesign;
      return { design: { ...v, ...portFields(input.port, input.portCount ?? 1, v), name, vb_l: input.vb_l, targetFb: v.targetFb, ...at }, losses };
    }
    case "passive-radiator": {
      const p = newDesign("pr", []) as PrDesign;
      return { design: { ...p, name, vb_l: input.vb_l, prName: "Dayton Audio DSA270-PR", count: input.prCount ?? 1, addedMass_g: input.addedMass_g ?? 0, params: prParams(input.pr), extra: [], ...at }, losses };
    }
    case "bandpass": {
      const b = newDesign("bandpass", []) as BandpassDesign;
      const { rear, front } = input;
      const chamber = (c: { ql?: number; qa?: number; qp?: number }) => ({ ql: q(c.ql), qa: q(c.qa), qp: q(c.qp) });
      const order: BandpassDesign["order"] = !("port" in rear && rear.port) && !("prs" in rear && rear.prs) ? "4" : input.rearPortTo === "front" ? "6s" : "6p";
      const design: BandpassDesign = {
        ...b,
        name,
        order,
        vb_l: rear.vb_l,
        frontVb_l: front.vb_l,
        front: "port" in front && front.port ? portFields(front.port, front.portCount ?? 1, b.front) : b.front,
        rear: "port" in rear && rear.port ? portFields(rear.port, rear.portCount ?? 1, b.rear) : b.rear,
        frontOpening: "prs" in front && front.prs ? "pr" : "port",
        rearOpening: "prs" in rear && rear.prs ? "pr" : "port",
        frontPrs: "prs" in front && front.prs ? groups(front.prs) : b.frontPrs,
        rearPrs: "prs" in rear && rear.prs ? groups(rear.prs) : b.rearPrs,
        losses: { front: chamber(front), rear: chamber(rear), qicl: q(input.qicl) },
      };
      return { design, losses };
    }
    case "line": {
      const l = newDesign("line", []) as LineDesign;
      const segs = input.segments;
      return {
        design: {
          ...l,
          name,
          closedArea_cm2: segs[0]!.startArea_cm2,
          sections: segs.map((g) => ({ length_cm: g.length_cm, endArea_cm2: g.endArea_cm2, taper: g.taper, fill_kgm3: g.fill_kgm3 ?? 0 })),
          driverAt_cm: input.driverAt_cm ?? 0,
          end: "open",
          mouth: "front",
          mouthDistance_cm: 0,
        } as LineDesign,
        losses,
      };
    }
    default:
      return null;
  }
}

/** A Hornresp box, filter, EQ or stuffed-line case as an app project, from its test input. */
export function hornrespBoxState(id: string): AppState | null {
  const c = readBoxCase(id);
  // The app has no full-space setting yet (the engine has): those cases get no link.
  if (c.space === "full") return null;
  const box = boxDesign(c.input, c.title);
  if (!box) return null;
  const d = hornrespDriver({ ...(c.driver ?? HORNRESP_DRIVER) }, c.frontAir);
  return {
    ...EMPTY,
    driverName: c.driver ? "Hornresp test driver" : "Dayton Audio DSA215-8 (Hornresp)",
    driverBrand: "",
    ts: { fs: d.fs, qms: d.qms, qes: d.qes, vas_l: d.vas_l, re: d.re, sd_cm2: d.sd_cm2 },
    le_mh: d.le_mh ?? 0,
    l2_mh: 0,
    r2_ohm: 0,
    semi: c.semi,
    fdd: c.fdd,
    xmax_mm: d.xmax_mm ?? EMPTY.xmax_mm,
    pe_w: d.pe_w ?? 0,
    drive: "volts",
    volts: 2.83,
    drivers: c.drivers ?? 1,
    wiring: c.wiring ?? "parallel",
    highPass: c.highPass ? { on: true, type: c.highPass.type, order: c.highPass.order, freq: c.highPass.freq } : { ...EMPTY.highPass, on: false },
    eq: (c.eq ?? []).map((e, i) => ({ ...e, id: `e${i + 1}`, on: true, target: "all" })),
    settings: {
      ...EMPTY.settings,
      air: "hornresp",
      lineSpl: c.splFrom === "power" ? "power" : "on-axis",
      rg: c.rg ?? 0,
      coilTemp_C: c.coilTemp_C ?? EMPTY.settings.coilTemp_C,
      portModel: c.portModel === "pipe" ? "pipe" : "lumped",
      leakage: c.leakage ?? "radiates",
      coneLoad: c.coneLoad ?? "mass",
      losses: box.losses,
    },
    designs: [box.design],
  };
}

/** A case's link, and a note when the app shows something the comparison doesn't. */
export interface CaseLink {
  href: string;
  note?: string;
}

/** Links for every case that has one, keyed by the page's anchor ("winisd-ported", "hornresp-05-mltl"). */
export async function validationLinks(site: string, cases: { winisd: { id: string }[]; hornresp: { id: string; title: string }[]; boxes?: { id: string }[] }): Promise<Record<string, CaseLink>> {
  const out: Record<string, CaseLink> = {};
  const link = async (s: AppState, note?: string): Promise<CaseLink> => ({ href: `${site}/#${await encodeStateShort(s)}`, ...(note ? { note } : {}) });
  for (const c of cases.winisd) {
    const s = winisdCaseState(c.id);
    if (s) out[`winisd-${c.id}`] = await link(s);
  }
  for (const c of cases.hornresp) {
    const s = hornrespLineState(c.id, c.title);
    if (s) out[`hornresp-${c.id}`] = await link(s);
  }
  for (const c of cases.boxes ?? []) {
    const s = hornrespBoxState(c.id);
    if (s) out[`hornresp-${c.id}`] = await link(s);
  }
  return out;
}
