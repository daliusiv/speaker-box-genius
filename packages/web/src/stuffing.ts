/**
 * Box stuffing (polyfill, fibre fill, wall lining) for sealed, ported and passive radiator
 * boxes, as the two things a simulator can model: a box that acts bigger (the fibres make
 * the air's compression closer to isothermal) and extra absorption loss (a lower Qa).
 *
 * No formula predicts a given material and amount well (see the box stuffing guide), so
 * "Filled" maps grams per litre to TYPICAL values, read from Nousaine's impedance
 * measurements and the guide's modelling advice:
 * - sealed, 16–24 g/L: about +20 % volume, Qa 20–30; past ~28 g/L the gain falls and finally
 *   reverses (packed fibres stop working);
 * - ported or PR, filled: a little less gain (+10–20 %) and much more loss (Qa 10–20), since
 *   the loss damps the port's resonance;
 * - lined walls: no volume gain, Qa about 50.
 * "Custom" takes the user's own gain and Qa (from a measurement, say).
 */

export type StuffingMode = "none" | "lined" | "fill" | "custom";

export interface Stuffing {
  mode: StuffingMode;
  /** Filled: fibre per litre of net volume (g/L, same as kg/m³). */
  gL: number;
  /** Custom: how much bigger the box acts (%, negative when overstuffed). */
  gain_pct: number;
  /** Custom: absorption loss as a Q at the tuning (lower = more loss). */
  qa: number;
}

/** Box kinds that take stuffing this way (lines model their fill physically; bandpass has per-chamber losses). */
export type StuffableKind = "sealed" | "vented" | "pr";
export const stuffable = (kind: string): kind is StuffableKind => kind === "sealed" || kind === "vented" || kind === "pr";

/** Lined walls: about Qa 50 (the guide's advice for a lined ported box). */
export const LINED_QA = 50;
/** Past this the gain falls: fibres packed too tightly stop exchanging heat. */
export const BEST_MAX_GL = 28;
/** No gain is left here, and beyond it the box acts smaller than empty. */
const NO_GAIN_GL = 42;

// [g/L, value] points, linear between them and held flat past the ends.
const SEALED_GAIN: [number, number][] = [[0, 0], [4, 2], [8, 10], [12, 15], [16, 20], [24, 22], [28, 20], [36, 9], [NO_GAIN_GL, 0], [50, -14]];
const SEALED_QA: [number, number][] = [[0, 100], [4, 80], [8, 50], [16, 30], [24, 20], [36, 15], [50, 10]];
const VENTED_GAIN: [number, number][] = [[0, 0], [4, 3], [8, 8], [16, 15], [24, 18], [28, 16], [36, 8], [NO_GAIN_GL, 0], [50, -10]];
const VENTED_QA: [number, number][] = [[0, 100], [4, 40], [8, 25], [16, 15], [24, 10], [36, 8], [50, 6]];

function interp(table: [number, number][], x: number): number {
  if (x <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]!;
    if (x <= x1) {
      const [x0, y0] = table[i - 1]!;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1]![1];
}

/** What a design's stuffing does: extra effective volume (%) and the Qa it sets (null = Settings' Qa). */
export function stuffingEffect(st: Stuffing | undefined, kind: StuffableKind): { gain_pct: number; qa: number | null } {
  if (!st || st.mode === "none") return { gain_pct: 0, qa: null };
  if (st.mode === "lined") return { gain_pct: 0, qa: LINED_QA };
  if (st.mode === "custom") return { gain_pct: st.gain_pct, qa: st.qa };
  const sealed = kind === "sealed";
  const gL = Math.max(0, st.gL);
  return {
    gain_pct: Math.round(interp(sealed ? SEALED_GAIN : VENTED_GAIN, gL) * 10) / 10,
    qa: Math.round(interp(sealed ? SEALED_QA : VENTED_QA, gL)),
  };
}

/** How many times bigger the box acts (1 = no stuffing). Never below 0.5, whatever is typed. */
export function stuffFactor(d: { kind: string; stuffing?: Stuffing }): number {
  if (!stuffable(d.kind)) return 1;
  return Math.max(0.5, 1 + stuffingEffect(d.stuffing, d.kind).gain_pct / 100);
}

/** Fibre to weigh out for a filled box (grams), or null when the mode isn't "fill". */
export function fillGrams(st: Stuffing | undefined, net_l: number): number | null {
  if (st?.mode !== "fill" || !(net_l > 0)) return null;
  return Math.max(0, st.gL) * net_l;
}

/** Grams as people weigh them: to 10 g, or 50 g past a kilogram. */
export const roundGrams = (g: number) => (g >= 1000 ? Math.round(g / 50) * 50 : Math.round(g / 10) * 10);

/** A starting amount for a filled box: the guide's sealed rule (16 g/L up to ~85 L, 12 g/L above); ported boxes less. */
export function suggestedGl(kind: StuffableKind, net_l: number): number {
  if (kind !== "sealed") return 12;
  return net_l > 85 ? 12 : 16;
}

/** g/L ↔ lb/ft³ (1 lb/ft³ = 16.02 g/L). */
export const LB_FT3_PER_GL = 1 / 16.0185;

/** Stuffing from a share link or saved project; undefined (no stuffing) if absent or malformed. */
export function stuffingFrom(raw: unknown): Stuffing | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const mode = r.mode;
  if (mode !== "lined" && mode !== "fill" && mode !== "custom") return undefined;
  const num = (x: unknown, lo: number, hi: number, fallback: number) =>
    typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : fallback;
  return {
    mode,
    gL: num(r.gL, 0, 200, 16),
    gain_pct: num(r.gain_pct, -50, 40, 20),
    qa: num(r.qa, 1, 1000, 30),
  };
}

/** What to put in the box, for the build sheet and the design card; null with no stuffing. */
export function stuffingInstruction(st: Stuffing | undefined, kind: StuffableKind, net_l: number): string | null {
  if (!st || st.mode === "none") return null;
  const port = kind === "vented" ? " and the port" : kind === "pr" ? " and the passive radiators" : "";
  if (st.mode === "lined") return `line the walls with 1–2.5 cm of fibre or mineral wool, glued or stapled in place, keeping the driver${port} clear`;
  if (st.mode === "custom") {
    const e = stuffingEffect(st, kind);
    return `the amount you measured (acting ${e.gain_pct >= 0 ? "+" : ""}${e.gain_pct}% bigger, Qa ${e.qa})`;
  }
  const g = fillGrams(st, net_l);
  const lb = g === null ? 0 : g / 453.6;
  return (
    `about ${g === null ? "–" : roundGrams(g)} g (${lb.toFixed(lb < 1 ? 2 : 1)} lb) of polyester fibre fill, ${st.gL} g/L (${(st.gL * LB_FT3_PER_GL).toFixed(2)} lb/ft³): ` +
    `pulled apart into loose tufts and spread through the box, not packed, and kept off the back of the cone${port}`
  );
}
