import type { Conflict, TsValues } from "@sbg/engine";

/**
 * Manufacturers round their T/S figures, so a datasheet's own values rarely agree
 * to better than a few percent. For a database driver whose values haven't been
 * touched, disagreement up to this much is shown as a quiet note, not a warning.
 */
export const DATASHEET_TOLERANCE = 0.1;

/** True when the entered values are exactly the published ones (same parameters, same numbers). */
export function isUntouched(entered: TsValues, published: TsValues | undefined): boolean {
  if (!published) return false;
  const a = Object.keys(entered) as (keyof TsValues)[];
  const b = Object.keys(published) as (keyof TsValues)[];
  return a.length === b.length && a.every((k) => published[k] === entered[k]);
}

/**
 * Split the solver's conflicts into ones worth a warning and ones that are only
 * datasheet rounding. Values the user typed or changed are always checked strictly.
 */
export function splitConflicts(
  entered: TsValues,
  published: TsValues | undefined,
  conflicts: Conflict[],
): { warn: Conflict[]; rounding: Conflict[]; worst: number } {
  if (!isUntouched(entered, published)) return { warn: conflicts, rounding: [], worst: 0 };
  const warn = conflicts.filter((c) => c.diff > DATASHEET_TOLERANCE);
  const rounding = conflicts.filter((c) => c.diff <= DATASHEET_TOLERANCE);
  return { warn, rounding, worst: rounding.reduce((m, c) => Math.max(m, c.diff), 0) };
}
