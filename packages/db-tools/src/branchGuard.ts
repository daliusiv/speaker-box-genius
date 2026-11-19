/**
 * The submission bot's pull request branch (db/issue-<n>) is rebuilt from the issue form on
 * every body edit, unless a maintainer has pushed to it: then the form edit is not applied, so
 * their fixes aren't overwritten. The bot commits as github-actions[bot] (set explicitly in the
 * workflow); any other author is a maintainer. Pure, for tests.
 */

export const BOT_NAME = "github-actions[bot]";
export const BOT_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";

/** A commit as the compare API lists it (`.commits[]`). */
export interface BranchCommit {
  author?: { login?: string } | null;
  commit: { author?: { name?: string; email?: string } | null };
}

export function isBotCommit(c: BranchCommit): boolean {
  return c.author?.login === BOT_NAME || c.commit.author?.email === BOT_EMAIL;
}

/** Commits on the branch (ahead of main) that the bot didn't make. */
export function maintainerCommits(commits: BranchCommit[]): BranchCommit[] {
  return commits.filter((c) => !isBotCommit(c));
}
