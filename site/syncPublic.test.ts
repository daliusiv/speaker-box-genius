import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../packages/db-tools/src/load.ts";
import { tempDir } from "./tempDir.ts";

/**
 * scripts/sync-public.sh against throwaway repos: a bare "dev" and "public" remote, a
 * maintainer clone of each, and the sync clone that has both as remotes.
 */
const SCRIPT = join(REPO_ROOT, "scripts", "sync-public.sh");
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Dev", GIT_AUTHOR_EMAIL: "dev@example.com",
  GIT_COMMITTER_NAME: "Dev", GIT_COMMITTER_EMAIL: "dev@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();
}

function setup() {
  const root = tempDir("sbg-sync-");
  const dev = join(root, "dev.git"), pub = join(root, "public.git");
  git(root, "init", "-q", "--bare", "-b", "main", dev);
  git(root, "init", "-q", "--bare", "-b", "main", pub);
  // Shared start: one commit in both (like #213 before the split).
  const seed = join(root, "seed");
  git(root, "init", "-q", "-b", "main", seed);
  writeFileSync(join(seed, "a.txt"), "one\ntwo\nthree\n");
  git(seed, "add", "."); git(seed, "commit", "-qm", "start");
  git(seed, "push", "-q", dev, "main"); git(seed, "push", "-q", pub, "main");
  const devWork = join(root, "dw"), pubWork = join(root, "pw"), sync = join(root, "sync");
  git(root, "clone", "-q", dev, devWork);
  git(root, "clone", "-q", pub, pubWork);
  git(root, "init", "-q", "-b", "work", sync);
  git(sync, "remote", "add", "dev", dev);
  git(sync, "remote", "add", "public", pub);
  return { root, dev, pub, devWork, pubWork, sync };
}

function commit(dir: string, file: string, text: string, msg: string, author = "Dev <dev@example.com>") {
  git(dir, "pull", "-q", "--ff-only");
  writeFileSync(join(dir, file), text);
  git(dir, "add", "."); git(dir, "commit", "-q", "--author", author, "-m", msg); git(dir, "push", "-q");
}

function run(sync: string, extra: Record<string, string> = {}) {
  const outFile = join(sync, "..", `out-${Math.random()}`);
  writeFileSync(outFile, "");
  const r = spawnSync("bash", [SCRIPT], {
    cwd: sync, encoding: "utf8",
    env: { ...ENV, SYNC_DATE: "2026-11-11", GITHUB_OUTPUT: outFile, GITHUB_STEP_SUMMARY: "", ...extra },
  });
  const outputs = Object.fromEntries(readFileSync(outFile, "utf8").trim().split("\n").filter(Boolean).map((l) => l.split("=") as [string, string]));
  return { status: r.status, log: r.stdout + r.stderr, outputs };
}

const read = (bare: string, ref: string, file: string) => git(bare, "show", `${ref}:${file}`);

test("sync: dev changes are published as one snapshot commit", () => {
  const s = setup();
  commit(s.devWork, "a.txt", "one\nTWO\nthree\n", "secret-ish dev message");
  const r = run(s.sync);
  assert.equal(r.status, 0, r.log);
  assert.equal(r.outputs.published, "true");
  assert.equal(read(s.pub, "main", "a.txt"), "one\nTWO\nthree");
  assert.equal(git(s.pub, "log", "-1", "--format=%s|%an", "main"), "Release 2026-11-11|github-actions[bot]");
  assert.ok(!git(s.pub, "log", "--format=%B", "main").includes("secret-ish"), "no dev commit messages on public");
  // Running again changes nothing.
  const again = run(s.sync);
  assert.equal(again.outputs.published, "false");
  assert.match(again.log, /already matches/);
});

test("sync: dry run pushes nothing", () => {
  const s = setup();
  commit(s.devWork, "a.txt", "x\n", "dev change");
  const before = git(s.pub, "rev-parse", "main");
  const r = run(s.sync, { DRY_RUN: "1" });
  assert.equal(r.status, 0, r.log);
  assert.match(r.log, /dry run/);
  assert.equal(git(s.pub, "rev-parse", "main"), before);
});

test("sync: a public change goes to a dev branch, and publishing waits until dev has it", () => {
  const s = setup();
  run(s.sync); // nothing yet
  commit(s.devWork, "b.txt", "dev file\n", "dev adds b");
  run(s.sync); // first snapshot
  commit(s.pubWork, "c.txt", "contributor file\n", "contributor adds c", "Ann <ann@example.com>");
  commit(s.devWork, "a.txt", "one\ntwo\nTHREE\n", "dev edits a");

  const held = run(s.sync);
  assert.equal(held.status, 0, held.log);
  assert.equal(held.outputs.incoming, "true");
  assert.equal(held.outputs.published, "false");
  assert.match(held.log, /Not publishing/);
  assert.equal(read(s.dev, "sync/from-public", "c.txt"), "contributor file");
  assert.equal(git(s.dev, "log", "-1", "--format=%an", "sync/from-public"), "Ann", "contributor kept as author");
  assert.equal(read(s.pub, "main", "c.txt"), "contributor file", "public change still there");

  // Maintainer merges the incoming branch in dev; next run publishes both sides.
  git(s.devWork, "pull", "-q");
  git(s.devWork, "fetch", "-q", "origin", "sync/from-public");
  git(s.devWork, "merge", "-q", "--no-edit", "origin/sync/from-public");
  git(s.devWork, "push", "-q");
  const ok = run(s.sync);
  assert.equal(ok.outputs.published, "true", ok.log);
  assert.equal(read(s.pub, "main", "c.txt"), "contributor file");
  assert.equal(read(s.pub, "main", "a.txt"), "one\ntwo\nTHREE");
  assert.ok(git(s.pub, "log", "--format=%an", "main").includes("Ann"), "contributor commit stays in public history");
});

test("sync: a conflicting public change stops the run without publishing", () => {
  const s = setup();
  commit(s.pubWork, "a.txt", "one\nPUBLIC\nthree\n", "contributor edits line 2");
  commit(s.devWork, "a.txt", "one\nDEV\nthree\n", "dev edits line 2");
  const before = git(s.pub, "rev-parse", "main");
  const r = run(s.sync);
  assert.equal(r.status, 3, r.log);
  assert.equal(r.outputs.conflict, "true");
  assert.match(r.log, /Conflict/);
  assert.equal(git(s.pub, "rev-parse", "main"), before);
});

test("sync: a conflicting public change copied into dev by hand (cherry-pick -x) lets the next run publish", () => {
  const s = setup();
  commit(s.devWork, "b.txt", "dev file\n", "dev adds b");
  run(s.sync); // first snapshot
  commit(s.pubWork, "a.txt", "one\nPUBLIC\nthree\n", "contributor edits line 2", "Ann <ann@example.com>");
  commit(s.devWork, "a.txt", "one\nDEV\nthree\n", "dev edits line 2");
  assert.equal(run(s.sync).status, 3);

  // Maintainer copies it by hand, keeping dev's line, and merges that into dev main.
  const pubCommit = git(s.pub, "rev-parse", "main");
  git(s.devWork, "pull", "-q");
  git(s.devWork, "fetch", "-q", s.pub, "main");
  spawnSync("git", ["cherry-pick", "-x", pubCommit], { cwd: s.devWork, env: ENV });
  writeFileSync(join(s.devWork, "a.txt"), "one\nDEV\nthree\n");
  git(s.devWork, "add", "a.txt");
  git(s.devWork, "commit", "-q", "--allow-empty", "--no-edit"); // keeps the "(cherry picked from commit …)" line
  git(s.devWork, "push", "-q");

  const ok = run(s.sync);
  assert.equal(ok.status, 0, ok.log);
  assert.match(ok.log, /copied into dev by hand/);
  assert.equal(ok.outputs.published, "true", ok.log);
  assert.equal(read(s.pub, "main", "a.txt"), "one\nDEV\nthree", "dev's version wins");
});

test("sync: publishing can be held by the checks gate", () => {
  const s = setup();
  commit(s.devWork, "a.txt", "y\n", "dev change");
  const r = run(s.sync, { PUBLISH_ALLOWED: "0" });
  assert.equal(r.outputs.published, "false");
  assert.match(r.log, /checks aren't all green/);
});

test("sync: changelog entries become the next version on dev main, the public commit's description and a tag", () => {
  const s = setup();
  const log = (body: string) => `# Changelog\n\nIntro.\n\n${body ? `## Unreleased\n${body}\n` : ""}## Earlier\n\nOlder.\n`;
  commit(s.devWork, "CHANGELOG.md", log(""), "add changelog");
  const first = run(s.sync); // publishes a changelog with nothing unreleased: no notes, no version, no tag
  assert.equal(first.outputs.version, undefined, first.log);
  assert.equal(git(s.pub, "tag"), "");
  commit(s.devWork, "CHANGELOG.md", log("\n### Added\n- Box volume calculator.\n"), "feature with entry");
  const r = run(s.sync);
  assert.equal(r.outputs.published, "true", r.log);
  assert.equal(r.outputs.version, "1.0.0", r.log);
  // Dev main got the release commit, and public has the same file.
  assert.equal(git(s.dev, "log", "-1", "--format=%s|%an", "main"), "Changelog: v1.0.0 (2026-11-11)|github-actions[bot]");
  const dated = read(s.dev, "main", "CHANGELOG.md");
  assert.match(dated, /Intro\.\n\n## 1\.0\.0 \(2026-11-11\)\n\n### Added\n- Box volume calculator\./);
  assert.doesNotMatch(dated, /Unreleased/);
  assert.equal(read(s.pub, "main", "CHANGELOG.md"), dated);
  assert.equal(git(s.pub, "log", "-1", "--format=%B", "main"), "Release v1.0.0\n\n1.0.0 (2026-11-11)\n\n### Added\n- Box volume calculator.");
  assert.equal(git(s.pub, "rev-parse", "v1.0.0"), git(s.pub, "rev-parse", "main"), "public commit tagged v1.0.0");
  // Next night with nothing new: nothing to publish, no new version.
  const again = run(s.sync, { SYNC_DATE: "2026-11-12" });
  assert.equal(again.outputs.published, "false", again.log);
  assert.equal(git(s.dev, "log", "-1", "--format=%s", "main"), "Changelog: v1.0.0 (2026-11-11)");
  // A fix only: the next patch.
  commit(s.devWork, "CHANGELOG.md", read(s.dev, "main", "CHANGELOG.md").replace("## 1.0.0", "## Unreleased\n\n### Fixed\n- Port length with two slots.\n\n## 1.0.0"), "fix with entry");
  const patch = run(s.sync, { SYNC_DATE: "2026-11-13" });
  assert.equal(patch.outputs.version, "1.0.1", patch.log);
  assert.equal(git(s.pub, "tag"), "v1.0.0\nv1.0.1");
  assert.match(git(s.pub, "log", "-1", "--format=%s", "main"), /^Release v1\.0\.1$/);
});

test("sync: a new release moves the plugin's pinned npm version with it", () => {
  const s = setup();
  git(s.devWork, "pull", "-q", "--ff-only");
  mkdirSync(join(s.devWork, "plugin/.claude-plugin"), { recursive: true });
  writeFileSync(join(s.devWork, "plugin/.claude-plugin/plugin.json"), '{ "name": "speaker-box-genius", "version": "0.9.0" }\n');
  writeFileSync(join(s.devWork, "plugin/.mcp.json"), '{ "mcpServers": { "speaker-box-genius": { "command": "npx", "args": ["-y", "speaker-box-genius@0.9.0", "mcp"] } } }\n');
  writeFileSync(join(s.devWork, "CHANGELOG.md"), "# Changelog\n\nIntro.\n\n## Unreleased\n\n### Added\n- Plugin.\n\n## Earlier\n\nOlder.\n");
  git(s.devWork, "add", "."); git(s.devWork, "commit", "-qm", "plugin"); git(s.devWork, "push", "-q");
  const r = run(s.sync);
  assert.equal(r.outputs.version, "1.0.0", r.log);
  for (const repo of [s.dev, s.pub]) {
    assert.equal(JSON.parse(read(repo, "main", "plugin/.claude-plugin/plugin.json")).version, "1.0.0");
    assert.deepEqual(JSON.parse(read(repo, "main", "plugin/.mcp.json")).mcpServers["speaker-box-genius"].args, ["-y", "speaker-box-genius@1.0.0", "mcp"]);
  }
});

test("sync: an older \"Sync from dev\" commit on public still counts as the last release", () => {
  const s = setup();
  commit(s.devWork, "b.txt", "dev file\n", "dev adds b");
  // Public main as an older version of the script left it: dev's files in a "Sync from dev" commit.
  git(s.pubWork, "pull", "-q");
  git(s.pubWork, "fetch", "-q", s.dev, "main");
  const tree = git(s.pubWork, "rev-parse", "FETCH_HEAD^{tree}");
  const old = execFileSync("git", ["commit-tree", tree, "-p", "HEAD", "-m", "Sync from dev, 2026-11-10: v1.0.0"], {
    cwd: s.pubWork, encoding: "utf8",
    env: { ...ENV, GIT_AUTHOR_NAME: "github-actions[bot]", GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com" },
  }).trim();
  git(s.pubWork, "push", "-q", "origin", `${old}:refs/heads/main`);
  commit(s.devWork, "a.txt", "one\ntwo\nfour\n", "dev change");
  const r = run(s.sync);
  assert.equal(r.status, 0, r.log);
  assert.equal(r.outputs.incoming, "false", "nothing on public after the old sync commit to bring back");
  assert.ok(r.log.includes(`last sync point \`${old.slice(0, 7)}\``), r.log);
  assert.equal(r.outputs.published, "true", r.log);
  assert.equal(git(s.pub, "log", "-1", "--format=%s", "main"), "Release 2026-11-11");
});

test("sync: a public repo with its own history starts from the public commit whose files match dev", () => {
  const s = setup();
  // Public main replaced by a squashed copy of the same files (no shared commits).
  const orphan = git(s.pubWork, "commit-tree", git(s.pubWork, "rev-parse", "HEAD^{tree}"), "-m", "squashed");
  git(s.pubWork, "push", "-q", "-f", "origin", `${orphan}:refs/heads/main`);
  commit(s.devWork, "a.txt", "one\ntwo\nfour\n", "dev change");
  const r = run(s.sync);
  assert.equal(r.status, 0, r.log);
  assert.match(r.log, /No shared history; starting from public/);
  assert.equal(r.outputs.published, "true");
  assert.equal(read(s.pub, "main", "a.txt"), "one\ntwo\nfour");
  assert.equal(git(s.pub, "rev-parse", "main~1"), orphan, "snapshot sits on top of public's own history");
});

test("sync: unrelated public files with no shared history stop the run", () => {
  const s = setup();
  writeFileSync(join(s.pubWork, "a.txt"), "something else\n");
  git(s.pubWork, "add", ".");
  const tree = git(s.pubWork, "write-tree");
  const orphan = git(s.pubWork, "commit-tree", tree, "-m", "unrelated");
  git(s.pubWork, "push", "-q", "-f", "origin", `${orphan}:refs/heads/main`);
  const before = git(s.pub, "rev-parse", "main");
  const r = run(s.sync);
  assert.equal(r.status, 4, r.log);
  assert.match(r.log, /share no history/);
  assert.equal(git(s.pub, "rev-parse", "main"), before);
});
