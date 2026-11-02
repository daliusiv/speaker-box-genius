import type { TsParam } from "./tsSolver.ts";
import { parseQuantity, type Quantity } from "./units.ts";

/** Everything the paste box can recognise. */
export type DatasheetField = TsParam | "le_mh" | "xmax_mm" | "pe_w";

interface Pattern {
  field: DatasheetField;
  /** Matched against the start of a line, case-insensitive. */
  key: RegExp;
  q: Quantity;
}

// Order matters: more specific keys first (e.g. "Qts" before a generic "Q").
const PATTERNS: Pattern[] = [
  { field: "fs", key: /^(fs|f\s?s|resonant frequency|free air resonance|resonance frequency)\b/, q: "plain" },
  { field: "qms", key: /^(qms|mechanical q)/, q: "plain" },
  { field: "qes", key: /^(qes|electrical q|electromagnetic q)/, q: "plain" },
  { field: "qts", key: /^(qts|total q)/, q: "plain" },
  { field: "vas_l", key: /^(vas|equivalent volume|compliance equivalent volume)/, q: "volume" },
  { field: "re", key: /^(re|rdc|dc resistance)\b/, q: "plain" },
  { field: "le_mh", key: /^(le|voice coil inductance|inductance)\b/, q: "inductance" },
  { field: "sd_cm2", key: /^(sd|effective piston area|surface area of cone|effective area|cone area)/, q: "area" },
  { field: "mms_g", key: /^(mms|moving mass|diaphragm mass)/, q: "mass" },
  { field: "cms_mm_per_n", key: /^(cms|compliance|mechanical compliance)/, q: "compliance" },
  { field: "bl", key: /^(bl|force factor|bl product)/, q: "plain" },
  { field: "rms", key: /^(rms|mechanical (loss|resistance))(?!\s*power)/, q: "plain" },
  { field: "xmax_mm", key: /^(xmax|x-max|maximum linear excursion|max\.? linear excursion|linear coil travel)/, q: "length" },
  { field: "pe_w", key: /^(pe|rated power|power handling|rms power|nominal power)/, q: "plain" },
];

/**
 * Pull T/S parameters out of text pasted from a datasheet or product page.
 * Handles "Fs: 25.6 Hz", "Vas 1.9ft³", "Mms (g) 120", "Sd = 356.3 cm²", tables
 * copied as tab-separated text, and labels with the symbol in brackets.
 */
export function parseDatasheet(text: string): Partial<Record<DatasheetField, number>> {
  const out: Partial<Record<DatasheetField, number>> = {};
  const lines = text
    .split(/\r?\n|;/)
    .map((l) => l.replace(/[•*·|]/g, " ").trim())
    .filter(Boolean);

  for (const raw of lines) {
    // "Resonant Frequency (Fs) 25.6Hz" → also try the bracketed symbol as the key.
    const bracket = /\(([A-Za-z]{1,4})\)/.exec(raw);
    const candidates = [raw, bracket ? bracket[1] + " " + raw.slice(bracket.index + bracket[0].length) : null];
    for (const line of candidates) {
      if (!line) continue;
      const lower = line.toLowerCase();
      const p = PATTERNS.find((pt) => pt.key.test(lower));
      if (!p || out[p.field] !== undefined) continue;
      const rest = line.slice(lower.match(p.key)![0].length);
      // First number in the rest of the line, with whatever follows as its unit.
      const m = /([-+]?\d+(?:[.,]\d+)?)\s*([^\s\d:=,;()]*(?:\s?\/\s?[^\s\d]+)?)/.exec(rest.replace(/[:=]/g, " "));
      if (!m) continue;
      let v = m[2] ? parseQuantity(`${m[1]} ${m[2]}`, p.q) : null;
      if (v === null) {
        // No usable unit after the number: look for one in brackets before it, e.g. "Vas (ft³) 1.9".
        const hint = /\(([^)]*)\)/.exec(rest.slice(0, m.index));
        v = (hint && parseQuantity(`${m[1]} ${hint[1]}`, p.q)) ?? parseQuantity(m[1]!, p.q);
      }
      if (v !== null && v > 0) {
        // Linear coil travel quoted peak-to-peak? Only when explicitly labelled.
        if (p.field === "xmax_mm" && /p-?p|peak.to.peak/i.test(line)) v /= 2;
        out[p.field] = v;
        break;
      }
    }
  }
  return out;
}
