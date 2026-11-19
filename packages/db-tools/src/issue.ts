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
import { solveTs } from "../../engine/src/tsSolver.ts";
import { parseQuantity, type Quantity } from "../../engine/src/units.ts";
import { SLUG_RE } from "../../schema/src/index.ts";
import { brandCase, buildRecord, modelCase, submissionHints, type BuiltRecord, type SubmissionFields } from "./submission.ts";

export { brandCase, modelCase, slugify, submissionHints } from "./submission.ts";

export type IssueRecord = BuiltRecord;

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

/** The first number in "2 Ω", "2ohm", "4 (DVC)", "8Ω nominal" → 2, 2, 4, 8. */
export function leadingNumber(text: string): number | undefined {
  const m = /^\s*(\d+(?:[.,]\d+)?)/.exec(text);
  return m ? num(m[1]!) : undefined;
}

/** "15", "15 in", '15"', "15 inch", "380 mm", "38 cm" → inches. */
export function sizeInches(text: string): number | undefined {
  const t = text.trim().replace(/[″”]/g, '"');
  if (!t) return undefined;
  const mm = parseQuantity(t, "length");
  const bare = /^\d+(?:[.,]\d+)?$/.test(t);
  if (mm !== null && mm > 0 && !bare) return Number((mm / 25.4).toPrecision(3));
  return leadingNumber(t);
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

/** "Voice coils: Dual" (+ the wiring the datasheet's T/S were measured with) → `voice_coils` / `ts_wiring`. */
function voiceCoils(sec: Map<string, string>): { voice_coils?: 2; ts_wiring?: "series" | "parallel" } {
  if (!/^dual/i.test(find(sec, "voice coils"))) return {};
  const w = find(sec, "dual voice coil wiring").toLowerCase();
  return { voice_coils: 2, ...(w.startsWith("series") ? { ts_wiring: "series" as const } : w.startsWith("parallel") ? { ts_wiring: "parallel" as const } : {}) };
}

export function parseIssue(body: string, opts: { issue: number; author: string; today: string }): IssueRecord {
  const sec = sections(body);
  const fields: SubmissionFields = {
    kind: "driver",
    brand: find(sec, "brand"),
    model: find(sec, "model"),
    source_url: find(sec, "datasheet link"),
    measured: find(sec, "your own measurements") || undefined,
    size_in: sizeInches(find(sec, "nominal size")),
  };
  if (!brandCase(fields.brand) || !modelCase(fields.model)) throw new Error("The issue needs a Brand and a Model.");

  const physicalText = find(sec, "physical data");
  fields.physical = {
    displacement_l: labelled(physicalText, /^(driver displacement|displacement)/, "volume"),
    cutout_mm: labelled(physicalText, /^cutout/, "length"),
    depth_mm: labelled(physicalText, /^mounting depth|^depth/, "length"),
  };

  const tsText = find(sec, "thiele/small parameters");
  if (tsText) {
    const p = parseDatasheet(tsText);
    fields.type = find(sec, "driver type") || "other";
    fields.nominal_ohms = leadingNumber(find(sec, "nominal impedance"));
    Object.assign(fields, voiceCoils(sec));
    fields.ts = {
      ...p,
      // A datasheet that gives Mmd (without the air load): the database stores Mms.
      mms_g: p.mms_g ?? (p.mmd_g !== undefined && p.sd_cm2 !== undefined ? Number(solveTs({ mmd_g: p.mmd_g, sd_cm2: p.sd_cm2 }).values.mms_g!.toPrecision(4)) : undefined),
    };
  } else {
    // Passive radiator form
    const paramText = find(sec, "parameters");
    if (!paramText) throw new Error("No parameters found in the issue.");
    const p = parseDatasheet(paramText);
    fields.kind = "passive-radiator";
    fields.params = {
      ...p,
      xmech_mm: labelled(paramText, /^xmech/, "length"),
      max_added_mass_g: labelled(paramText, /^maximum added mass/),
    };
  }
  const built = buildRecord(fields, { kind: "issue", ...opts });
  if (!SLUG_RE.test(built.brandSlug) || !SLUG_RE.test(built.modelSlug)) throw new Error("Brand or model has no usable letters or digits.");
  return built;
}

/** The submission hints as text lines (issue comment and pull request body). */
export const hintLines = (r: IssueRecord) => submissionHints(r).map((h) => h.message);
