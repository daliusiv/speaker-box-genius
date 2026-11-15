/**
 * Versions of one driver: the same driver sold with different impedances or voice coils
 * ("18NLW4100 (4 Ω)" and "(8 Ω)", Dayton's "ND90-4" and "ND90-8", Purifi's "M04" and "M08").
 * The driver pages link them to each other and say what differs.
 */
import type { Driver } from "../../schema/src/index.ts";
import type { Entry } from "./load.ts";

/** Sd of versions of one driver agree within this (a different cone is a different driver). */
const SD_TOLERANCE = 0.02;

const OHMS = "(?:4|6|8|16|04|08)";

/** A model name without the part that only says the impedance or the voice coils. */
export function stripImpedance(model: string, dvc: boolean): string {
  const m = model.trim();
  // One token off the end (a "-2" before "(16 Ω)" is a revision, not an impedance):
  // "X (4 Ω)", "X-8 ohm", "X 4Ω", "X-8", "X-44" (dual coil), "X-3-DV", "X D2".
  const ends = [
    /\s*\(\s*\d+(?:\.\d+)?\s*(?:Ω|ohms?)\s*\)$/i,
    /[\s-]*\d+(?:\.\d+)?\s*(?:Ω|ohms?)$/i,
    /-\d+-DV$/i,
    ...(dvc ? [/-(?:22|44|88)$/] : []),
    new RegExp(`-${OHMS}$`),
    /(?<=\d)D[1248]$/i,
  ];
  const hit = ends.find((re) => re.test(m));
  return finish(hit ? m.replace(hit, "") : m);
}

/** Purifi puts the impedance inside the name ("PTT6.5M04-NAA-07" and "PTT6.5M08-NAA-07"). */
function finish(m: string): string {
  return m.replace(/(?<=\d)M0[48](?=-)/, "M").toUpperCase();
}

/** Brand, model without its impedance and coil tokens, and size: what versions of a driver share. */
export function variantKey(brandSlug: string, rec: Driver): string {
  return `${brandSlug}|${stripImpedance(rec.model, rec.voice_coils === 2)}|${rec.size_in ?? ""}`;
}

const brandOf = (id: string) => id.split("/")[0]!;
const coils = (rec: Driver) => rec.voice_coils ?? 1;

/**
 * Each driver id that has other versions, to its whole family (itself included), ordered by
 * impedance, then single before dual voice coil, then id. Versions need an Sd within 2 %.
 */
export function variantFamilies(entries: Entry<Driver>[]): Map<string, string[]> {
  const groups = new Map<string, Entry<Driver>[]>();
  for (const e of entries) {
    const k = variantKey(brandOf(e.id), e.data);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
  }
  const out = new Map<string, string[]>();
  for (const members of groups.values()) {
    // Split by Sd: walk the sizes in order, starting a new family when one is > 2 % above the first.
    const bySd = [...members].sort((a, b) => a.data.ts.sd_cm2 - b.data.ts.sd_cm2 || (a.id < b.id ? -1 : 1));
    const clusters: Entry<Driver>[][] = [];
    for (const e of bySd) {
      const c = clusters[clusters.length - 1];
      if (c && e.data.ts.sd_cm2 <= c[0]!.data.ts.sd_cm2 * (1 + SD_TOLERANCE)) c.push(e);
      else clusters.push([e]);
    }
    for (const c of clusters) {
      if (c.length < 2) continue;
      const ids = c
        .sort((a, b) => coils(a.data) - coils(b.data) || a.data.nominal_ohms - b.data.nominal_ohms || (a.id < b.id ? -1 : 1))
        .map((e) => e.id);
      for (const id of ids) out.set(id, ids);
    }
  }
  return out;
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

/** "8 Ω", or "DVC 2+2 Ω" for a dual voice coil (each coil's impedance, as the app's driver list shows it). */
export function variantLabel(rec: Driver): string {
  if (rec.voice_coils !== 2) return `${f1(rec.nominal_ohms)} Ω`;
  const coil = rec.ts_wiring === "series" ? rec.nominal_ohms / 2 : rec.nominal_ohms * 2;
  return `DVC ${f1(coil)}+${f1(coil)} Ω`;
}

/**
 * Labels for a family, in order. Two versions with the same label (say two dual-coil models at
 * 4 Ω) get the end of the model name that tells them apart added: "DVC 2+2 Ω (D2)".
 */
export function variantLabels(recs: Driver[]): string[] {
  const base = recs.map(variantLabel);
  return base.map((l, i) => {
    if (base.indexOf(l) === base.lastIndexOf(l)) return l;
    const others = recs.filter((_, j) => j !== i && base[j] === l);
    const m = recs[i]!.model;
    let n = 0;
    while (n < m.length && others.some((o) => o.model[n] === m[n])) n++;
    // Back up to the start of the token the names first differ in.
    const at = Math.max(m.lastIndexOf("-", n), m.lastIndexOf(" ", n), m.lastIndexOf("(", n));
    return `${l} (${m.slice(at + 1).replace(/[()]/g, "").trim()})`;
  });
}
