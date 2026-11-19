/**
 * GitHub Action helper: write the database file for a "new driver" or
 * "new passive radiator" issue. Reads ISSUE_BODY, ISSUE_NUMBER, ISSUE_AUTHOR.
 * Writes outputs (path, title, branch, warnings) to $GITHUB_OUTPUT and the
 * bot's issue comment to issue-comment.md (all problems at once, plus what was
 * read from the form). On a problem it exits 1 so the workflow comments it.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hintLines, parseIssue, type IssueRecord } from "./issue.ts";
import { COUNT_DIRS, fixCounts } from "./counts.ts";
import { loadDatabase, REPO_ROOT } from "./load.ts";

const body = process.env.ISSUE_BODY ?? "";
const issue = Number(process.env.ISSUE_NUMBER ?? 0);
const author = process.env.ISSUE_AUTHOR ?? "unknown";
const COMMENT = join(REPO_ROOT, "issue-comment.md");
/** Marks the bot's one comment so later runs edit it instead of adding another. */
const MARKER = "<!-- sbg-db-check -->";

const TS_LABELS = {
  fs: "Fs (Hz)", qms: "Qms", qes: "Qes", qts: "Qts", vas_l: "Vas (L)", re: "Re (Ω)", le_mh: "Le (mH)",
  bl: "Bl (T·m)", mms_g: "Mms (g)", sd_cm2: "Sd (cm²)", xmax_mm: "Xmax (mm)", pe_w: "Pe (W)",
};
const PR_LABELS = { fs: "Fs (Hz)", qms: "Qms", vas_l: "Vas (L)", mms_g: "Mms (g)", sd_cm2: "Sd (cm²)", xmax_mm: "Xmax (mm)" };

const cell = (v: unknown) => String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");

/** What the bot read from the form, so a field that didn't come through is easy to spot. */
function readTable(p: IssueRecord): string {
  const r = p.record;
  const rows: [string, unknown][] = [
    ["Brand", r.brand],
    ["Model", r.model],
    ["Type", r.type],
    ["Nominal impedance (Ω)", r.nominal_ohms],
    ["Voice coils", r.voice_coils === 2 ? `Dual${r.ts_wiring ? `, T/S in ${String(r.ts_wiring)}` : ""}` : "Single"],
    ["Size (in)", r.size_in],
    ...(Object.entries(p.kind === "driver" ? TS_LABELS : PR_LABELS).map(([k, label]) => [label, ((r.ts ?? r.params ?? {}) as Record<string, unknown>)[k]]) as [string, unknown][]),
    ...Object.entries((r.physical ?? {}) as Record<string, unknown>),
  ];
  return (
    "<details><summary>What I read from the form</summary>\n\n| Field | Value |\n|---|---|\n" +
    rows.map(([k, v]) => `| ${cell(k)} | ${v === undefined ? "**missing**" : cell(v)} |`).join("\n") +
    "\n\n</details>"
  );
}

function finish(text: string, ok: boolean): never | void {
  writeFileSync(COMMENT, `${MARKER}\n${text}\n`);
  if (!ok) {
    console.error(text);
    process.exit(1);
  }
}

let parsed: IssueRecord;
try {
  parsed = parseIssue(body, { issue, author, today: new Date().toISOString().slice(0, 10) });
} catch (e) {
  finish(`I couldn't read this submission: ${(e as Error).message}\n\nEdit the issue to fix it and I'll try again.`, false);
  process.exit(1);
}

const folder = parsed.kind === "driver" ? "drivers" : "passive-radiators";
const dir = join(REPO_ROOT, folder, parsed.brandSlug);
const file = join(dir, `${parsed.modelSlug}.json`);
const rel = `${folder}/${parsed.brandSlug}/${parsed.modelSlug}.json`;
const brandFile = join(dir, "_brand.json");

// A brand already in the database keeps its spelling ("edge" → "Edge" if that folder exists).
if (existsSync(brandFile)) {
  const name = (JSON.parse(readFileSync(brandFile, "utf8")) as { name?: string }).name;
  if (name) parsed = { ...parsed, brand: name, record: { ...parsed.record, brand: name } };
}
const title = `${parsed.kind === "driver" ? "[Driver]" : "[PR]"} ${parsed.brand} ${String(parsed.record.model)}`;
const out = process.env.GITHUB_OUTPUT;
if (out) appendFileSync(out, `issue_title=${title}\n`);

if (existsSync(file)) {
  finish(`\`${rel}\` is already in the database. If its values are wrong, please use **Report a correction** on its driver page.`, false);
}

mkdirSync(dir, { recursive: true });
const newBrand = !existsSync(brandFile);
if (newBrand) writeFileSync(brandFile, JSON.stringify({ name: parsed.brand }, null, 2) + "\n");
writeFileSync(file, JSON.stringify(parsed.record, null, 2) + "\n");

// Validate the whole database with the new file in place.
const db = loadDatabase();
const mine = db.errors.filter((e) => e.startsWith(`${folder}/${parsed.brandSlug}/`));
const warnings = [...db.warnings.filter((w) => w.startsWith(rel)), ...hintLines(parsed)];
const list = (xs: string[]) => xs.map((x) => `- ${x.replace(`${folder}/${parsed.brandSlug}/`, "")}`).join("\n");

if (mine.length > 0) {
  finish(
    `Thanks! I found ${mine.length === 1 ? "one thing" : `${mine.length} things`} to fix before this can be added:\n\n${list(mine)}\n\n` +
      (warnings.length ? `Also worth a check (these don't block it):\n\n${list(warnings)}\n\n` : "") +
      `Edit the issue to fix ${mine.length === 1 ? "it" : "them all"} and I'll try again (this comment updates).\n\n${readTable(parsed)}`,
    false,
  );
}

// A new brand changes "N brands" in the README and docs: update them in the same pull request,
// or CI's counts check fails on it.
if (newBrand) {
  const totals = { drivers: db.drivers.length, prs: db.passiveRadiators.length, brands: db.brands.size };
  const files = ["README.md", ...COUNT_DIRS.flatMap((d) => readdirSync(join(REPO_ROOT, d)).filter((f) => f.endsWith(".md")).map((f) => `${d}/${f}`))];
  for (const f of files) {
    const before = readFileSync(join(REPO_ROOT, f), "utf8");
    const after = fixCounts(before, totals);
    if (after !== before) writeFileSync(join(REPO_ROOT, f), after);
  }
}

if (out) {
  appendFileSync(out, `path=${rel}\ntitle=Add ${parsed.brand} ${String(parsed.record.model)}\nbranch=db/issue-${issue}\n`);
  appendFileSync(out, `warnings<<EOF\n${list(warnings)}\nEOF\n`);
}
finish(
  `Thanks! The database checks passed and I've opened a pull request with this entry. A maintainer will check it against the datasheet and merge it.` +
    (warnings.length ? `\n\nWorth a check (edit the issue if any of these is a mistake):\n\n${list(warnings)}` : "") +
    `\n\n${readTable(parsed)}`,
  true,
);
console.log(`Wrote ${rel}${warnings.length ? ` (${warnings.length} warning(s))` : ""}`);
