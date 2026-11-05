/**
 * Live example designs for the guides, built from the database at build time so their
 * links always open in the current version of the app. Each is a state for the app's
 * share link (`#z=…`); a page refers to one as {{link:<name>}}.
 */
import { readFileSync } from "node:fs";
import { DEFAULT_STATE, encodeStateShort, type AppState, type DesignState } from "../packages/web/src/state.ts";
import { portLengthForFb } from "../packages/engine/src/index.ts";

const ROOT = new URL("..", import.meta.url);
const json = (path: string) => JSON.parse(readFileSync(new URL(path, ROOT), "utf8"));

/** A database driver as the app loads it (see loadDriver in packages/web/src/library.ts). */
function withDriver(s: AppState, id: string): AppState {
  const rec = json(`drivers/${id}.json`);
  const ts: Record<string, number> = {};
  for (const k of ["fs", "qms", "qes", "qts", "vas_l", "re", "sd_cm2", "mms_g", "bl", "cms_mm_per_n", "rms"]) {
    if (typeof rec.ts[k] === "number") ts[k] = rec.ts[k];
  }
  return {
    ...s,
    driverName: `${rec.brand} ${rec.model}`,
    driverBrand: rec.brand,
    nominal_ohms: rec.nominal_ohms ?? s.nominal_ohms,
    ts: ts as AppState["ts"],
    le_mh: rec.ts.le_mh ?? 0,
    l2_mh: 0,
    r2_ohm: 0,
    xmax_mm: rec.ts.xmax_mm ?? s.xmax_mm,
    pe_w: rec.ts.pe_w ?? s.pe_w,
  };
}

/** A database passive radiator's parameters, as the app uses them. */
function prParams(id: string) {
  const p = json(`passive-radiators/${id}.json`).params;
  return { mms_g: p.mms_g, sd_cm2: p.sd_cm2, xmax_mm: p.xmax_mm, qms: p.qms ?? 10, vas_l: p.vas_l };
}

const byKind = (s: AppState, kind: DesignState["kind"]) => s.designs.find((d) => d.kind === kind)!;

/**
 * The passive radiator guide's worked example: a Dayton Audio DSA215-8 in 16.2 L (its QB3
 * alignment, tuned to 39.8 Hz), as a ported box and with one DS215-PR plus 17 g, at 35 W
 * behind a 30 Hz high-pass filter (what keeps the cone in check below the tuning).
 */
function prExample(): AppState {
  const s = withDriver(
    { ...DEFAULT_STATE, power: 35, highPass: { ...DEFAULT_STATE.highPass, on: true, type: "butterworth", order: 2, freq: 30 } },
    "dayton-audio/dsa215-8",
  );
  const vented = byKind(s, "vented") as Extract<DesignState, { kind: "vented" }>;
  const pr = byKind(s, "pr") as Extract<DesignState, { kind: "pr" }>;
  const vb = 16.2;
  const fb = 39.8;
  // A 5 cm port: short enough to fit in the box, but it chuffs at 35 W (the guide's point).
  const port = { shape: "round" as const, diameter_cm: 5, length_cm: 10 };
  const length = portLengthForFb(vb, port, fb);
  return {
    ...s,
    designs: [
      { ...vented, name: "Ported", vb_l: vb, shape: "round", diameter_cm: 5, length_cm: Math.round(length * 10) / 10, count: 1, targetFb: fb, preset: "QB3" },
      { ...pr, name: "PR", vb_l: vb, prName: "Dayton Audio DS215-PR", params: prParams("dayton-audio/ds215-pr"), count: 1, addedMass_g: 17, targetFb: fb, extra: [] },
    ],
  };
}

/** The WinISD page's example: the same driver in a sealed, a ported and a passive radiator box. */
function winisdExample(): AppState {
  const s = prExample();
  const sealed = byKind(DEFAULT_STATE, "sealed");
  return { ...s, designs: [{ ...sealed, name: "Sealed", vb_l: 12 }, ...s.designs] };
}

export const EXAMPLES: Record<string, () => AppState> = {
  "pr-example": prExample,
  "winisd-example": winisdExample,
};

/** Share links (`https://…/#z=…`) for every example. */
export async function exampleLinks(site: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, make] of Object.entries(EXAMPLES)) out[name] = `${site}/#${await encodeStateShort(make())}`;
  return out;
}
