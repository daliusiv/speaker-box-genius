/**
 * CHANGELOG.md helpers for the nightly public sync (scripts/sync-public.sh) and the site's
 * /changelog/ page.
 *
 * Format: "## Unreleased" first, then dated sections "## YYYY-MM-DD" (newest first), then
 * "## Earlier". Pull requests add bullets (optionally under "### Added" / "### Changed" /
 * "### Fixed") to Unreleased. When the sync publishes, it moves Unreleased into a section
 * dated that night, and the new dated sections become the public commit's description.
 *
 * CLI:
 *   changelog.ts release <file> <date>   move Unreleased into "## <date>" in place; exit 0 either way
 *   changelog.ts notes <newFile> <oldFile>   print the dated sections in newFile that oldFile lacks
 */
import { readFileSync, writeFileSync } from "node:fs";

export interface Section { heading: string; body: string }

/** Split into the preamble (title and intro) and the "## " sections, in order. */
export function parse(md: string): { preamble: string; sections: Section[] } {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const preamble: string[] = [];
  const sections: Section[] = [];
  for (const line of lines) {
    if (line.startsWith("## ")) sections.push({ heading: line.slice(3).trim(), body: "" });
    else if (sections.length) sections[sections.length - 1].body += line + "\n";
    else preamble.push(line);
  }
  for (const s of sections) s.body = s.body.trim();
  return { preamble: preamble.join("\n").trim(), sections };
}

export function render(doc: { preamble: string; sections: Section[] }): string {
  return [doc.preamble, ...doc.sections.map((s) => `## ${s.heading}\n${s.body ? `\n${s.body}\n` : ""}`)].join("\n\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Move Unreleased's entries into a new "## <date>" section (merged if that date exists). */
export function release(md: string, date: string): { md: string; changed: boolean } {
  const doc = parse(md);
  const unreleased = doc.sections.find((s) => s.heading === "Unreleased");
  if (!unreleased || !unreleased.body) return { md, changed: false };
  const body = unreleased.body;
  unreleased.body = "";
  const existing = doc.sections.find((s) => s.heading === date);
  if (existing) existing.body = `${body}\n\n${existing.body}`.trim();
  else doc.sections.splice(doc.sections.indexOf(unreleased) + 1, 0, { heading: date, body });
  return { md: render(doc), changed: true };
}

const DATED = /^\d{4}-\d{2}-\d{2}$/;

/** Dated sections in `next` that `prev` doesn't have, as Markdown (for a commit description). */
export function newNotes(next: string, prev: string): string {
  const had = new Set(parse(prev).sections.map((s) => s.heading));
  return parse(next).sections
    .filter((s) => DATED.test(s.heading) && !had.has(s.heading) && s.body)
    .map((s) => `${s.heading}\n\n${s.body}`)
    .join("\n\n");
}

/** Problems with the file's shape and wording (checked in CI). */
export function lint(md: string): string[] {
  const { sections } = parse(md);
  const problems: string[] = [];
  const heads = sections.map((s) => s.heading);
  if (heads[0] !== "Unreleased") problems.push('the first section must be "## Unreleased"');
  if (heads[heads.length - 1] !== "Earlier") problems.push('the last section must be "## Earlier"');
  const dated = heads.slice(1, -1);
  for (const h of dated) if (!DATED.test(h)) problems.push(`"## ${h}" isn't a YYYY-MM-DD date`);
  if ([...dated].sort().reverse().join() !== dated.join()) problems.push("dated sections must be newest first");
  if (new Set(dated).size !== dated.length) problems.push("a date appears twice");
  // The public site shows this file: no PR numbers, branch names or tooling notes.
  for (const [i, line] of md.split("\n").entries()) {
    if (/(^|[\s(])#\d+\b/.test(line)) problems.push(`line ${i + 1}: PR/issue numbers don't mean anything on the public repo`);
    if (/claude|anthropic|co-authored/i.test(line)) problems.push(`line ${i + 1}: tooling notes don't belong in the changelog`);
  }
  return problems;
}

if (import.meta.main) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "release" && a && b) {
    const r = release(readFileSync(a, "utf8"), b);
    if (r.changed) writeFileSync(a, r.md);
  } else if (cmd === "notes" && a && b) {
    process.stdout.write(newNotes(readFileSync(a, "utf8"), readFileSync(b, "utf8")));
  } else {
    console.error("usage: changelog.ts release <file> <date> | notes <newFile> <oldFile>");
    process.exit(2);
  }
}
