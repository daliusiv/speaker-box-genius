import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOT_EMAIL, maintainerCommits } from "../src/branchGuard.ts";

const bot = { author: { login: "github-actions[bot]" }, commit: { author: { name: "github-actions[bot]", email: BOT_EMAIL } } };
const botNoLogin = { author: null, commit: { author: { name: "github-actions[bot]", email: BOT_EMAIL } } };
const maintainer = { author: { login: "daliusiv" }, commit: { author: { name: "Dalius", email: "daliusiv@users.noreply.github.com" } } };

test("a branch with only bot commits is rebuilt; a maintainer commit locks it", () => {
  assert.deepEqual(maintainerCommits([bot, botNoLogin]), []);
  assert.equal(maintainerCommits([bot, maintainer]).length, 1);
  // Branches made before the bot set its author have the submitter as author: treated as a maintainer's (safe).
  assert.equal(maintainerCommits([{ author: { login: "someone" }, commit: { author: { email: "x@y" } } }]).length, 1);
});

const run = (stdin: string) => {
  const dir = mkdtempSync(join(tmpdir(), "guard-"));
  const out = join(dir, "out");
  execFileSync(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "packages/db-tools/src/branch-guard.ts"], {
    input: stdin,
    env: { ...process.env, GITHUB_OUTPUT: out, BRANCH: "db/issue-214", PR_NUMBER: "215" },
  });
  return readFileSync(out, "utf8");
};

test("the workflow helper: locked with a comment, unlocked for a new or bot-only branch", () => {
  assert.equal(run(""), "locked=false\n");
  assert.equal(run(JSON.stringify({ commits: [bot] })), "locked=false\n");
  assert.equal(run(JSON.stringify({ commits: [bot, maintainer] })), "locked=true\n");
  const comment = readFileSync("issue-comment.md", "utf8");
  assert.match(comment, /^<!-- sbg-db-check -->/);
  assert.match(comment, /pull request #215 \(branch `db\/issue-214`\).*wasn't applied/s);
});
