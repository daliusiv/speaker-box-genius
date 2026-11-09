import { withDriver } from "./assistant.ts";
import type { LoadedDriver } from "./library.ts";
import { asCompare, type AppState, type CompareDriver } from "./state.ts";

/**
 * A database driver as the comparison driver, with the same fields the main driver gets when
 * it's loaded. A driver whose entry has no Xmax or power rating borrows the main driver's
 * (there's no field to edit them on the comparison driver), so `borrowed` says which, in words,
 * for the message: its excursion and maximum SPL limits are then the main driver's, not its own.
 */
export function compareWith(s: AppState, d: LoadedDriver): { compare: CompareDriver; borrowed: string[] } {
  const borrowed: string[] = [];
  if (d.xmax_mm === undefined) borrowed.push(`Xmax (${s.xmax_mm} mm)`);
  if (d.pe_w === undefined) borrowed.push(`power rating (${s.pe_w} W)`);
  return { compare: asCompare(withDriver(s, d)), borrowed };
}

/** The message after picking a comparison driver. */
export function compareMessage(name: string, borrowed: string[], flag?: string): string {
  let msg = `Comparing with ${name}: dashed curves in every box.`;
  if (borrowed.length > 0) {
    msg += ` Its database entry has no ${borrowed.length > 1 ? "Xmax or power rating" : borrowed[0]!.split(" (")[0]}, so its limits use the main driver's ${borrowed.join(" and ")}: swap to set its own.`;
  }
  if (flag) msg += ` ${flag}`;
  return msg;
}
