/**
 * Turn a "new driver" / "new passive radiator" GitHub issue (from the issue
 * forms in .github/ISSUE_TEMPLATE) into a database record.
 *
 * Issue forms render as markdown sections:
 *   ### Brand
 *
 *   Dayton Audio
 *
 *   ### Thiele/Small parameters
 *
 *   Fs (Hz): 25.6
 *   ...
 */
import { parseDatasheet } from "../../engine/src/datasheet.ts";
import { parseQuantity, type Quantity } from "../../engine/src/units.ts";
import { SLUG_RE } from "../../schema/src/index.ts";

export interface IssueRecord {
  kind: "driver" | "passive-radiator";
  brandSlug: string;
  modelSlug: string;
  brand: string;
  record: Record<string, unknown>;
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function sections(body: string): Map<string, string> {
  const out = new Map<string, string>();
  const parts = body.replace(/\r\n/g, "\n").split(/^### /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const head = (nl < 0 ? part : part.slice(0, nl)).trim().toLowerCase();
    let value = nl < 0 ? "" : part.slice(nl + 1).trim();
    if (value === "_No response_") value = "";
    out.set(head, value);
  }
  return out;
}

function find(sec: Map<string, string>, prefix: string): string {
  for (const [k, v] of sec) if (k.startsWith(prefix)) return v;
  return "";
}

function num(text: string): number | undefined {
  const v = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * "Cutout diameter (mm): 216.5" or "Mounting depth (mm): 3.5 in" → number in
 * the label's unit, converting any unit the user typed after the value.
 */
function labelled(text: string, label: RegExp, q: Quantity = "plain"): number | undefined {
  for (const line of text.split("\n")) {
    if (!label.test(line.toLowerCase())) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const value = line.slice(i + 1).trim().replace(/″/g, '"');
    if (!value) return undefined;
    const v = parseQuantity(value, q);
    if (v !== null && v > 0) return Number(v.toPrecision(6)); // drop float noise from unit conversion
    return num(value.replace(/[^\d.,]/g, ""));
  }
  return undefined;
}

const clean = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

export function parseIssue(body: string, opts: { issue: number; author: string; today: string }): IssueRecord {
  const sec = sections(body);
  const brand = find(sec, "brand");
  const model = find(sec, "model");
  if (!brand || !model) throw new Error("The issue needs a Brand and a Model.");
  const brandSlug = slugify(brand);
  const modelSlug = slugify(model);
  if (!SLUG_RE.test(brandSlug) || !SLUG_RE.test(modelSlug)) throw new Error("Brand or model has no usable letters or digits.");

  const url = find(sec, "datasheet link").split(/\s+/)[0] ?? "";
  const measured = find(sec, "your own measurements");
  const sources: Record<string, unknown>[] = [];
  if (url) {
    sources.push({
      kind: "datasheet",
      url,
      retrieved: opts.today,
      note: `Submitted in issue #${opts.issue} by @${opts.author}.`,
    });
  }
  if (measured) {
    sources.push({ kind: "measured", by: `github:${opts.author}`, method: measured.split("\n")[0]!.slice(0, 200) });
  }

  const physicalText = find(sec, "physical data");
  const physical = clean({
    displacement_l: labelled(physicalText, /^(driver displacement|displacement)/, "volume"),
    cutout_mm: labelled(physicalText, /^cutout/, "length"),
    depth_mm: labelled(physicalText, /^mounting depth|^depth/, "length"),
  });
  const size_in = num(find(sec, "nominal size"));

  const tsText = find(sec, "thiele/small parameters");
  if (tsText) {
    const p = parseDatasheet(tsText);
    const ts = clean({
      fs: p.fs,
      qms: p.qms,
      qes: p.qes,
      qts: p.qts,
      vas_l: p.vas_l,
      re: p.re,
      le_mh: p.le_mh,
      bl: p.bl,
      mms_g: p.mms_g,
      sd_cm2: p.sd_cm2,
      xmax_mm: p.xmax_mm,
      pe_w: p.pe_w,
    });
    return {
      kind: "driver",
      brand,
      brandSlug,
      modelSlug,
      record: clean({
        brand,
        model,
        type: find(sec, "driver type") || "other",
        nominal_ohms: num(find(sec, "nominal impedance")),
        size_in,
        ts,
        physical: Object.keys(physical).length ? physical : undefined,
        sources,
        status: "community",
      }),
    };
  }

  // Passive radiator form
  const paramText = find(sec, "parameters");
  if (!paramText) throw new Error("No parameters found in the issue.");
  const p = parseDatasheet(paramText);
  const params = clean({
    fs: p.fs,
    qms: p.qms,
    vas_l: p.vas_l,
    mms_g: p.mms_g,
    cms_mm_per_n: p.cms_mm_per_n,
    sd_cm2: p.sd_cm2,
    xmax_mm: p.xmax_mm,
    max_added_mass_g: labelled(paramText, /^maximum added mass/),
  });
  return {
    kind: "passive-radiator",
    brand,
    brandSlug,
    modelSlug,
    record: clean({
      brand,
      model,
      type: "passive-radiator",
      size_in,
      params,
      physical: Object.keys(physical).length ? physical : undefined,
      sources,
      status: "community",
    }),
  };
}
