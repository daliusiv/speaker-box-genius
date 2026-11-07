/**
 * The review list: database entries whose values look implausible (plausibility.ts),
 * with a link to each datasheet, as Markdown.
 *
 *   pnpm db:review                    # print to the terminal
 *   pnpm db:review > review.md        # or save it (don't commit it)
 *
 * For each entry: check the datasheet, then either fix the value or, if it's right,
 * add a "plausibility_note" saying what was checked.
 */
import { resolve } from "node:path";
import { loadDatabase, REPO_ROOT } from "./load.ts";

const arg = process.argv[2];
const db = loadDatabase(arg ? resolve(process.cwd(), arg) : REPO_ROOT);
const flagged = [...db.drivers, ...db.passiveRadiators].filter((e) => e.flags.length > 0);

const lines = [
  `# Database review list`,
  ``,
  `${flagged.length} of ${db.drivers.length + db.passiveRadiators.length} entries to check against their datasheets.`,
  ``,
  `| Entry | What to check | Datasheet |`,
  `|---|---|---|`,
];
for (const e of flagged) {
  const url = e.data.sources.find((s) => s.url)?.url;
  const what = e.flags.map((f) => f.message.replace(/\|/g, "/")).join("<br>");
  lines.push(`| \`${e.file}\` | ${what} | ${url ? `[link](${url})` : "–"} |`);
}
console.log(lines.join("\n"));
