import type { TsValues } from "@sbg/engine";

/** Added once to a database driver's name when its T/S values are changed by hand. */
export const EDITED = " (edited)";

/** How the driver's name is shown in Edit T/S: a database driver's is fixed; any other is yours to edit. */
export type NameKind = "database" | "edited" | "own";

export function nameKind(name: string, sourceName: string | undefined): NameKind {
  if (sourceName === undefined) return "own";
  if (name === sourceName) return "database";
  if (name === sourceName + EDITED) return "edited";
  return "own";
}

/** The driver came from the database this session (edited or not): its specs link and published values still apply. */
export const fromDatabase = (name: string, source: { name: string } | null | undefined) => !!source && nameKind(name, source.name) !== "own";

/** The same entered values (keys with no value count as empty). */
export function sameTs(a: TsValues, b: TsValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof TsValues)[]);
  for (const k of keys) if ((a[k] ?? undefined) !== (b[k] ?? undefined)) return false;
  return true;
}

/**
 * The name after a T/S edit: an unedited database driver gets " (edited)" the first time its values
 * differ from the published ones, so shares and exports don't pass it off as the datasheet. Any other
 * name is left alone (already edited, renamed, typed or imported).
 */
export function nameAfterTsEdit(name: string, source: { name: string; ts?: TsValues } | null | undefined, next: TsValues): string {
  if (!source?.ts || nameKind(name, source.name) !== "database") return name;
  return sameTs(next, source.ts) ? name : name + EDITED;
}

/** The name without the notes the app adds ("(edited)", "(measured)", "(fictional)"), for a database submission. */
export const plainName = (name: string) => name.replace(/(\s*\((edited|measured|fictional)\))+\s*$/i, "").trim();
