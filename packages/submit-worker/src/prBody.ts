/**
 * The pull request text for a web submission. Everything the submitter typed is
 * escaped: no @-mentions (a zero-width space after "@"), no HTML, no markdown
 * links or images, and links only when they are http(s).
 */
import type { BuiltRecord, Problem } from "../../db-tools/src/submission.ts";
import { FORM_VERSION } from "./payload.ts";

/** Plain text safe for a markdown table cell. */
export function md(s: unknown): string {
  return String(s)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]()#!|~])/g, "\\$1")
    .replace(/@/g, "@​")
    .replace(/\s+/g, " ")
    .trim();
}

/** `<url>` only for http(s) links, else the escaped text. */
export function link(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return `<${u.href.replace(/[<>\s]/g, encodeURIComponent)}>`;
  } catch {
    // fall through
  }
  return md(url);
}

const LABELS: Record<string, string> = {
  fs: "Fs (Hz)",
  qms: "Qms",
  qes: "Qes",
  qts: "Qts",
  vas_l: "Vas (L)",
  re: "Re (Ω)",
  le_mh: "Le (mH)",
  bl: "Bl (T·m)",
  mms_g: "Mms (g)",
  sd_cm2: "Sd (cm²)",
  xmax_mm: "Xmax (mm)",
  xmech_mm: "Xmech (mm)",
  pe_w: "Pe (W)",
  cms_mm_per_n: "Cms (mm/N)",
  max_added_mass_g: "Max added mass (g)",
  displacement_l: "Displacement (L)",
  cutout_mm: "Cutout (mm)",
  depth_mm: "Mounting depth (mm)",
};

export function prTitle(b: BuiltRecord): string {
  return `Add ${md(b.brand)} ${md(b.record.model)}`.slice(0, 120);
}

export function prBody(b: BuiltRecord, path: string, warnings: Problem[], credit: string, brandLicence: string | null): string {
  const r = b.record;
  const rows: [string, unknown][] = [
    ["Brand", r.brand],
    ["Model", r.model],
    ["Type", r.type],
    ...(b.kind === "driver"
      ? ([
          ["Nominal impedance (Ω)", r.nominal_ohms],
          ["Voice coils", r.voice_coils === 2 ? `Dual, T/S in ${String(r.ts_wiring)}` : "Single"],
        ] as [string, unknown][])
      : []),
    ["Size (in)", r.size_in ?? "—"],
    ...Object.entries((r.ts ?? r.params ?? {}) as Record<string, unknown>).map(([k, v]) => [LABELS[k] ?? k, v] as [string, unknown]),
    ...Object.entries((r.physical ?? {}) as Record<string, unknown>).map(([k, v]) => [LABELS[k] ?? k, v] as [string, unknown]),
  ];
  const url = ((r.sources as { url?: string }[] | undefined) ?? []).find((s) => s.url)?.url ?? "";
  const lines = [
    `Submitted on the website form${credit ? ` by **${md(credit)}**` : " (anonymous)"}. Adds \`${path}\`. The database checks passed.`,
    "",
    `**Datasheet:** ${link(url)}`,
    "",
    "| Field | Value |",
    "|---|---|",
    ...rows.map(([k, v]) => `| ${md(k)} | ${md(v)} |`),
    "",
  ];
  if (r.inconsistency_reason) lines.push(`**Submitter's note on flagged values:** ${md(r.inconsistency_reason)}`, "");
  if (warnings.length) lines.push("**Worth a check:**", "", ...warnings.map((w) => `- ${md(w.message)}`), "");
  if (brandLicence) lines.push(`**Brand terms:** this brand's \`_brand.json\` has its own licence (${md(brandLicence)}): check the entry fits it.`, "");
  lines.push(
    `Licence consent given on the form (v${FORM_VERSION}): values from the datasheet, not another database; CC BY-NC-SA 4.0.`,
    "",
    "Reviewer: compare every value with the datasheet, then merge.",
  );
  return lines.join("\n");
}
