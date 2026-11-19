/**
 * A calculator's inputs in its page address (?vb=60&fb=28…), so "Copy link" shares exactly what's
 * on screen and the link opens with the same values. Pure functions (no DOM), tested on their
 * own; common.ts reads and writes the form with them.
 *
 * Only values that differ from the page's defaults go in the link, so links stay short and a
 * page with nothing changed has a clean address. Anything that doesn't fit a field's kind (a
 * word in a number field, a choice the page doesn't offer) is dropped, and the field keeps its
 * default.
 */

export type QueryField =
  /** A number field; empty is allowed (an optional field left blank). */
  | { id: string; kind: "num" }
  /** A whole number of at least 1 (a count). */
  | { id: string; kind: "int" }
  /** A <select> or one of a set of words. */
  | { id: string; kind: "choice"; choices: readonly string[] }
  /** A checkbox or radio: in the link as `on` ("1" unless given) when ticked. */
  | { id: string; kind: "check"; on?: string }
  /** Free text, such as a database id ("dayton-audio/rss315hf-4"). */
  | { id: string; kind: "text" };

/** Link key → the form field it stands for. Keys are short: they're what people paste into forums. */
export type QuerySpec = Record<string, QueryField>;

/** A form's values by link key, as strings (what the inputs hold). Checks are "1"/"" (or `on`/""). */
export type QueryValues = Record<string, string>;

const MAX_NUM = 1e6;
const MAX_TEXT = 120;
/** Database ids and the like: letters, digits and a few separators. */
const TEXT_OK = /^[\w./+-]+$/;

/** One value checked against its field's kind: the value to use, or null to keep the default. */
export function cleanValue(f: QueryField, raw: string): string | null {
  const v = raw.trim();
  switch (f.kind) {
    case "num": {
      if (v === "") return "";
      const n = Number(v.replace(",", "."));
      return Number.isFinite(n) && n >= 0 && n <= MAX_NUM ? String(n) : null;
    }
    case "int": {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 100 ? String(n) : null;
    }
    case "choice":
      return f.choices.includes(v) ? v : null;
    case "check":
      return v === (f.on ?? "1") ? v : v === "" || v === "0" ? "" : null;
    case "text":
      return v.length <= MAX_TEXT && TEXT_OK.test(v) ? v : null;
  }
}

/** The link's values that fit the page's fields (unknown keys and bad values left out). */
export function decodeQuery(search: string, spec: QuerySpec): QueryValues {
  const p = new URLSearchParams(search);
  const out: QueryValues = {};
  for (const [k, f] of Object.entries(spec)) {
    const raw = p.get(k);
    if (raw === null) continue;
    const v = cleanValue(f, raw);
    if (v !== null) out[k] = v;
  }
  return out;
}

/** The query string ("" or "?a=1&b=2") for these values: only the ones that differ from the defaults, in spec order. */
export function encodeQuery(values: QueryValues, defaults: QueryValues, spec: QuerySpec): string {
  const p = new URLSearchParams();
  for (const [k, f] of Object.entries(spec)) {
    const v = values[k];
    if (v === undefined || v === (defaults[k] ?? "")) continue;
    const clean = cleanValue(f, v);
    // A check that's off but on by default is written as "0", so the link can turn it off.
    if (clean !== null) p.set(k, f.kind === "check" && clean === "" ? "0" : clean);
  }
  const s = p.toString();
  // Keep "/" readable in ids ("d=dayton-audio/rss315hf-4"): it's allowed in a query.
  return s ? `?${s.replace(/%2F/gi, "/")}` : "";
}
