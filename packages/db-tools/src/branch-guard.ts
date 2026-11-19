/**
 * GitHub Action helper: reads the compare API's JSON for main...db/issue-<n> on stdin (or nothing
 * when the branch doesn't exist yet) and writes `locked=true` to $GITHUB_OUTPUT when a maintainer
 * has pushed to the branch, with the comment for the issue in issue-comment.md.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { maintainerCommits, type BranchCommit } from "./branchGuard.ts";
import { REPO_ROOT } from "./load.ts";

const input = readFileSync(0, "utf8").trim();
const commits = input ? ((JSON.parse(input) as { commits?: BranchCommit[] }).commits ?? []) : [];
const theirs = maintainerCommits(commits);
const out = process.env.GITHUB_OUTPUT;
if (theirs.length > 0) {
  const branch = process.env.BRANCH ?? "the pull request branch";
  const pr = process.env.PR_NUMBER ? `pull request #${process.env.PR_NUMBER}` : "the pull request";
  writeFileSync(
    join(REPO_ROOT, "issue-comment.md"),
    `<!-- sbg-db-check -->\nThanks for the update! A maintainer has already made changes on ${pr} (branch \`${branch}\`), so this edit of the form **wasn't applied**, to keep their changes.\n\nTo change a value now, edit the database file on that branch, or say in a comment what should change.\n`,
  );
  if (out) appendFileSync(out, "locked=true\n");
  console.log(`${theirs.length} maintainer commit(s) on ${branch}: not rebuilding it.`);
} else {
  if (out) appendFileSync(out, "locked=false\n");
  console.log("Branch is the bot's own (or new): rebuilding it from the form.");
}
