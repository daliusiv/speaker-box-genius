import type { Assumed } from "@sbg/engine";

/**
 * What an import did, for the notice under the driver card: a line saying what was opened,
 * notes on what changed, and the values the file didn't have (filled with a default and listed,
 * never silently). `error` when the file couldn't be read at all.
 */
export interface ImportReport {
  text: string;
  assumed: Assumed[];
  error?: boolean;
}

/** The nominal impedance used when a file has none (labels and wiring only). */
export const ASSUMED_NOMINAL_OHMS = 4;

/** Driver values an imported file may leave out. */
export interface DriverExtras {
  le_mh?: number;
  xmax_mm?: number;
  pe_w?: number;
  nominal_ohms?: number;
}

/**
 * The driver's Le, Xmax, Pe and Znom from a file, never the previous driver's: a missing Le is
 * 0 mH (inductance off), a missing Xmax or Pe stays unset (0: no redline or rated power until
 * entered), a missing Znom is 4 Ω. Each default is listed. `le: false` for formats that always
 * carry Le (or set it some other way).
 */
export function driverExtras(d: DriverExtras, opts: { le?: boolean } = {}): { le_mh: number; xmax_mm: number; pe_w: number; nominal_ohms: number; assumed: Assumed[] } {
  const assumed: Assumed[] = [];
  const has = (v: number | undefined): v is number => v !== undefined && v > 0;
  if (opts.le !== false && !has(d.le_mh)) assumed.push({ field: "Le", value: "0 mH", note: "coil inductance not modelled" });
  if (!has(d.xmax_mm)) assumed.push({ field: "Xmax", value: "not set", note: "no cone redline until you enter it" });
  if (!has(d.pe_w)) assumed.push({ field: "Pe", value: "not set", note: "no rated power until you enter it" });
  if (!has(d.nominal_ohms)) assumed.push({ field: "Znom", value: `${ASSUMED_NOMINAL_OHMS} Ω`, note: "labels and wiring only" });
  return {
    le_mh: has(d.le_mh) ? d.le_mh : 0,
    xmax_mm: has(d.xmax_mm) ? d.xmax_mm : 0,
    pe_w: has(d.pe_w) ? d.pe_w : 0,
    nominal_ohms: has(d.nominal_ohms) ? d.nominal_ohms : ASSUMED_NOMINAL_OHMS,
    assumed,
  };
}

/** "Xmax — not set (no cone redline until you enter it)". */
export const assumedLine = (a: Assumed) => `${a.field} — ${a.value}${a.note ? ` (${a.note})` : ""}`;
