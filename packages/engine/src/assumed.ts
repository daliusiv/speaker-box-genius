/**
 * A value an importer filled in because the file didn't have it, shown to the user as
 * "assumed" so nothing is defaulted silently. `value` is what was used ("10", "not set").
 */
export interface Assumed {
  field: string;
  value: string;
  note?: string;
}

/** Add an entry once per field (a file with three ports lists its end correction once). */
export function pushAssumed(list: Assumed[], a: Assumed): void {
  if (!list.some((x) => x.field === a.field)) list.push(a);
}
