/**
 * GitHub Action helper: write the database file for a "new driver" or
 * "new passive radiator" issue. Reads ISSUE_BODY, ISSUE_NUMBER, ISSUE_AUTHOR.
 * Writes outputs (path, title, folder) to $GITHUB_OUTPUT. On failure prints
 * the reason to issue-error.md and exits 1 so the workflow can comment it.
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseIssue } from "./issue.ts";
import { loadDatabase, REPO_ROOT } from "./load.ts";

const body = process.env.ISSUE_BODY ?? "";
const issue = Number(process.env.ISSUE_NUMBER ?? 0);
const author = process.env.ISSUE_AUTHOR ?? "unknown";

function fail(msg: string): never {
  writeFileSync(join(REPO_ROOT, "issue-error.md"), msg + "\n");
  console.error(msg);
  process.exit(1);
}

let parsed;
try {
  parsed = parseIssue(body, { issue, author, today: new Date().toISOString().slice(0, 10) });
} catch (e) {
  fail(`I couldn't read this submission: ${(e as Error).message}`);
}

const folder = parsed.kind === "driver" ? "drivers" : "passive-radiators";
const dir = join(REPO_ROOT, folder, parsed.brandSlug);
const file = join(dir, `${parsed.modelSlug}.json`);
const rel = `${folder}/${parsed.brandSlug}/${parsed.modelSlug}.json`;
if (existsSync(file)) fail(`\`${rel}\` is already in the database. If its values are wrong, please open a pull request that edits it.`);

mkdirSync(dir, { recursive: true });
const brandFile = join(dir, "_brand.json");
if (!existsSync(brandFile)) writeFileSync(brandFile, JSON.stringify({ name: parsed.brand }, null, 2) + "\n");
writeFileSync(file, JSON.stringify(parsed.record, null, 2) + "\n");

// Validate the whole database with the new file in place.
const db = loadDatabase();
const mine = db.errors.filter((e) => e.startsWith(`${folder}/${parsed.brandSlug}/`));
if (mine.length > 0) {
  fail(
    "Thanks! The submission has some problems the database checks caught:\n\n" +
      mine.map((e) => `- ${e.replace(`${folder}/${parsed.brandSlug}/`, "")}`).join("\n") +
      "\n\nEdit the issue to fix them and I'll try again.",
  );
}
const warnings = db.warnings.filter((w) => w.startsWith(rel));

const out = process.env.GITHUB_OUTPUT;
const title = `Add ${parsed.brand} ${String(parsed.record.model)}`;
if (out) {
  appendFileSync(out, `path=${rel}\ntitle=${title}\nbranch=db/issue-${issue}\n`);
  appendFileSync(out, `warnings<<EOF\n${warnings.map((w) => `- ${w}`).join("\n")}\nEOF\n`);
}
console.log(`Wrote ${rel}${warnings.length ? ` (${warnings.length} warning(s))` : ""}`);
