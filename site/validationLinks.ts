/**
 * "Open in app" links for the validation page: each case as an app project, built the way the
 * app's own imports build it, so the link opens what importing the same file would.
 *
 * - WinISD cases: the case's .wpr through applyWpr (the app's WinISD import).
 * - Hornresp lines and horns: the case's Hornresp record through fromHornresp (the app's Hornresp
 *   import), with Hornresp's drive (2.83 V), air and SPL from radiated power, and the case's
 *   options (two drivers, a hot voice coil).
 *
 * validationLinks.test.ts checks that every linked project simulates to the case's reference.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseWpr } from "../packages/engine/src/index.ts";
import { WINISD_CASES } from "../packages/engine/validation/winisd.ts";
import { HORNRESP_DRIVER } from "../packages/engine/validation/hornresp.ts";
import { DEFAULT_STATE, encodeStateShort, newDesign, type AppState, type LineDesign } from "../packages/web/src/state.ts";
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

/** Short links for every case that has one, keyed by the page's anchor ("winisd-ported", "hornresp-05-mltl"). */
export async function validationLinks(site: string, cases: { winisd: { id: string }[]; hornresp: { id: string; title: string }[] }): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const c of cases.winisd) {
    const s = winisdCaseState(c.id);
    if (s) out[`winisd-${c.id}`] = `${site}/#${await encodeStateShort(s)}`;
  }
  for (const c of cases.hornresp) {
    const s = hornrespLineState(c.id, c.title);
    if (s) out[`hornresp-${c.id}`] = `${site}/#${await encodeStateShort(s)}`;
  }
  return out;
}
