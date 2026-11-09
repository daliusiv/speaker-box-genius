/**
 * Unit-aware number parsing for parameter inputs and pasted datasheets.
 * Converts to the database units: L, cm², g, mm/N, mm, mH, W, Hz, Ω, T·m, kg/s.
 */

export type Quantity = "volume" | "area" | "mass" | "compliance" | "length" | "inductance" | "plain";

const UNITS: Record<Quantity, [RegExp, number][]> = {
  volume: [
    [/^(l|ltr|liters?|litres?)$/, 1],
    [/^(ft3|ft\^3|ft³|cuft|cu\.?ft\.?|cubic ?feet|cf)$/, 28.316846592],
    [/^(in3|in\^3|in³|cuin|cu\.?in\.?)$/, 0.016387064],
    [/^(m3|m\^3|m³)$/, 1000],
    [/^(cm3|cm\^3|cm³|cc|ml)$/, 0.001],
  ],
  area: [
    [/^(cm2|cm\^2|cm²|sq\.?\s?cm\.?)$/, 1],
    [/^(m2|m\^2|m²)$/, 1e4],
    [/^(mm2|mm\^2|mm²|sq\.?\s?mm\.?)$/, 0.01],
    [/^(in2|in\^2|in²|sq\.?\s?in\.?)$/, 6.4516],
  ],
  mass: [
    [/^(g|gr|gram|grams)$/, 1],
    [/^(kg)$/, 1000],
    [/^(oz)$/, 28.349523125],
  ],
  compliance: [
    [/^(mm\/n)$/, 1],
    [/^(um\/n|µm\/n|μm\/n)$/, 0.001],
    [/^(m\/n)$/, 1000],
  ],
  length: [
    [/^(mm)$/, 1],
    [/^(cm)$/, 10],
    [/^(m)$/, 1000],
    [/^(in|inch|inches|")$/, 25.4],
  ],
  inductance: [
    [/^(mh)$/, 1],
    [/^(uh|µh|μh)$/, 0.001],
    [/^(h)$/, 1000],
  ],
  plain: [],
};

/**
 * Parse "1.9 ft³", "53,8 L", "356.3cm2", "12.3" → number in database units.
 * A bare number is taken to already be in database units. Returns null if unparseable.
 */
export function parseQuantity(text: string, q: Quantity): number | null {
  const m = /^\s*([-+]?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?)\s*(.*?)\s*$/i.exec(text);
  if (!m) return null;
  const value = Number(m[1]!.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  // "ft.³" (Dayton's spec sheets), "g.", "mH @ 1 kHz": dots and anything after an "@" don't change the unit.
  const unit = m[2]!.toLowerCase().replace(/@.*$/, "").replace(/\s+/g, " ").trim();
  if (unit === "") return value;
  for (const u of [unit, unit.replace(/\.\s?/g, "")]) for (const [re, k] of UNITS[q]) if (re.test(u)) return value * k;
  // Units that don't need conversion (Hz, Ω, ohms, T·m, W, kg/s, dB…) are accepted as-is.
  if (q === "plain" && /^(hz|ω|ohms?|t·?m|tm|n\/a|w|watts?|kg\/s|ns\/m|n·s\/m)$/.test(unit)) return value;
  return null;
}
