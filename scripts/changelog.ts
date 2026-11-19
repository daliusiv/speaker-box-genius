/**
 * CHANGELOG.md helpers for the nightly public sync (scripts/sync-public.sh) and the site's
 * /changelog/ page.
 *
 * Format: "## Unreleased" first (only while it has entries), then releases "## 1.2.0 (YYYY-MM-DD)"
 * (newest first), then the dated sections from before 1.0 "## YYYY-MM-DD", then "## Earlier". Pull
 * requests add bullets under "### Added" / "### Changed" / "### Fixed" (or "### Breaking") to
 * Unreleased, adding the heading if it isn't there. When the sync publishes, it turns Unreleased
 * into the next release (the heading goes, as nothing is unreleased any more): "### Breaking" → next major, "### Added" →
 * next minor, otherwise next patch; the first release is 1.0.0. The new release sections become
 * the public commit's description, and the sync tags the public commit v<version>.
 *
 * CLI:
 *   changelog.ts release <file> <date>   turn Unreleased into the next release in place and print
 *                                        its version (prints nothing when there's nothing to release)
 *   changelog.ts notes <newFile> <oldFile>   print the release sections in newFile that oldFile lacks
 *   changelog.ts version <file>          print the latest released version (nothing before 1.0.0)
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
    else if (sections.length) sections[sections.length - 1]!.body += line + "\n";
    else preamble.push(line);
  }
  for (const s of sections) s.body = s.body.trim();
  return { preamble: preamble.join("\n").trim(), sections };
}

export function render(doc: { preamble: string; sections: Section[] }): string {
  return [doc.preamble, ...doc.sections.map((s) => `## ${s.heading}\n${s.body ? `\n${s.body}\n` : ""}`)].join("\n\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

const DATED = /^\d{4}-\d{2}-\d{2}$/;
const RELEASE = /^(\d+)\.(\d+)\.(\d+) \((\d{4}-\d{2}-\d{2})\)$/;

type Version = [number, number, number];

function versionOf(heading: string): Version | null {
  const m = RELEASE.exec(heading);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** The latest released version ("1.2.0"), or null before the first release. */
export function latestVersion(md: string): string | null {
  for (const s of parse(md).sections) {
    const v = versionOf(s.heading);
    if (v) return v.join(".");
  }
  return null;
}

/** The version after `prev` for these entries: Breaking → major, Added → minor, else patch. */
export function nextVersion(prev: string | null, body: string): string {
  if (!prev) return "1.0.0";
  const [ma, mi, pa] = prev.split(".").map(Number) as Version;
  if (/^### Breaking\b/m.test(body)) return `${ma + 1}.0.0`;
  if (/^### Added\b/m.test(body)) return `${ma}.${mi + 1}.0`;
  return `${ma}.${mi}.${pa + 1}`;
}

/** Turn Unreleased into the next release, "## <version> (<date>)"; an empty Unreleased heading goes too. */
export function release(md: string, date: string): { md: string; changed: boolean; version: string | null } {
  const doc = parse(md);
  const unreleased = doc.sections.find((s) => s.heading === "Unreleased");
  if (!unreleased) return { md, changed: false, version: null };
  if (!unreleased.body) {
    doc.sections.splice(doc.sections.indexOf(unreleased), 1);
    return { md: render(doc), changed: true, version: null };
  }
  const version = nextVersion(latestVersion(md), unreleased.body);
  unreleased.heading = `${version} (${date})`;
  return { md: render(doc), changed: true, version };
}

/** Release (and older dated) sections in `next` that `prev` doesn't have, as Markdown (for a commit description). */
export function newNotes(next: string, prev: string): string {
  const had = new Set(parse(prev).sections.map((s) => s.heading));
  return parse(next).sections
    .filter((s) => (RELEASE.test(s.heading) || DATED.test(s.heading)) && !had.has(s.heading) && s.body)
    .map((s) => `${s.heading}\n\n${s.body}`)
    .join("\n\n");
}

/** Problems with the file's shape and wording (checked in CI). */
export function lint(md: string): string[] {
  const { sections } = parse(md);
  const problems: string[] = [];
  const heads = sections.map((s) => s.heading);
  if (heads.indexOf("Unreleased") > 0) problems.push('"## Unreleased" must be the first section');
  if (heads[heads.length - 1] !== "Earlier") problems.push('the last section must be "## Earlier"');
  const middle = heads.slice(heads[0] === "Unreleased" ? 1 : 0, -1);
  const releases = middle.filter((h) => RELEASE.test(h));
  const dated = middle.filter((h) => DATED.test(h));
  for (const h of middle) if (!RELEASE.test(h) && !DATED.test(h)) problems.push(`"## ${h}" isn't a release ("1.2.0 (YYYY-MM-DD)") or a YYYY-MM-DD date`);
  if (middle.join() !== [...releases, ...dated].join()) problems.push("releases must come before the dated sections from before 1.0");
  const key = (v: Version) => v[0] * 1e6 + v[1] * 1e3 + v[2];
  const versions = releases.map((h) => versionOf(h)!);
  for (let i = 1; i < versions.length; i++) {
    if (key(versions[i]!) >= key(versions[i - 1]!)) problems.push(`"## ${releases[i]}" must be older than "## ${releases[i - 1]}" (newest first)`);
  }
  const releaseDates = releases.map((h) => RELEASE.exec(h)![4]!);
  if ([...releaseDates].sort().reverse().join() !== releaseDates.join()) problems.push("release dates must be newest first");
  if ([...dated].sort().reverse().join() !== dated.join()) problems.push("dated sections must be newest first");
  if (new Set(dated).size !== dated.length) problems.push("a date appears twice");
  // The public site shows this file: no PR numbers, branch names or tooling notes.
  for (const [i, line] of md.split("\n").entries()) {
    if (/(^|[\s(])#\d+\b/.test(line)) problems.push(`line ${i + 1}: PR/issue numbers don't mean anything on the public repo`);
    if (/claude|anthropic|co-authored/i.test(line)) problems.push(`line ${i + 1}: tooling notes don't belong in the changelog`);
    // Also shown on GitHub and in release notes, where a site path like /privacy/ points into the repo and 404s.
    if (/\]\(\//.test(line)) problems.push(`line ${i + 1}: link to the site with https://speakerboxgenius.com/…, not a bare /path`);
  }
  return problems;
}

if (import.meta.main) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "release" && a && b) {
    const r = release(readFileSync(a, "utf8"), b);
    if (r.changed) writeFileSync(a, r.md);
    if (r.version) process.stdout.write(r.version);
  } else if (cmd === "version" && a) {
    process.stdout.write(latestVersion(readFileSync(a, "utf8")) ?? "");
  } else if (cmd === "notes" && a && b) {
    process.stdout.write(newNotes(readFileSync(a, "utf8"), readFileSync(b, "utf8")));
  } else {
    console.error("usage: changelog.ts release <file> <date> | notes <newFile> <oldFile> | version <file>");
    process.exit(2);
  }
}
