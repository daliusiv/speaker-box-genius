import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../packages/db-tools/src/load.ts";
import { latestVersion, lint, newNotes, nextVersion, parse, release } from "../scripts/changelog.ts";

const SAMPLE = `# Changelog

Intro.

## Unreleased

### Added
- Box volume calculator.

### Fixed
- Port length with two slots.

## 2026-11-11

- Passive radiator calculator.

## Earlier

Older history.
`;

test("CHANGELOG.md is well formed and fit for the public site", () => {
  const md = readFileSync(join(REPO_ROOT, "CHANGELOG.md"), "utf8");
  assert.deepEqual(lint(md), []);
});

test("the first release is 1.0.0, above the dated sections from before 1.0; the Unreleased heading goes", () => {
  const r = release(SAMPLE, "2026-11-12");
  assert.ok(r.changed);
  assert.equal(r.version, "1.0.0");
  const heads = parse(r.md).sections.map((s) => s.heading);
  assert.deepEqual(heads, ["1.0.0 (2026-11-12)", "2026-11-11", "Earlier"]);
  assert.match(parse(r.md).sections[0].body, /### Added\n- Box volume calculator\.\n\n### Fixed\n- Port length with two slots\./);
  assert.deepEqual(lint(r.md), []);
  assert.equal(latestVersion(r.md), "1.0.0");
  assert.equal(latestVersion(SAMPLE), null);
  const none = release(r.md, "2026-11-13");
  assert.equal(none.changed, false, "nothing to release");
  assert.equal(none.version, null);
  // An empty Unreleased heading left in the file goes too, without a new version.
  const empty = release(SAMPLE.replace(/## Unreleased\n[\s\S]*?(?=## 2026-11-11)/, "## Unreleased\n\n"), "2026-11-13");
  assert.equal(empty.version, null);
  assert.deepEqual(parse(empty.md).sections.map((s) => s.heading), ["2026-11-11", "Earlier"]);
});

test("later releases: Breaking → major, Added → minor, otherwise patch", () => {
  assert.equal(nextVersion(null, "### Breaking\n- x"), "1.0.0");
  assert.equal(nextVersion("1.2.3", "### Fixed\n- x"), "1.2.4");
  assert.equal(nextVersion("1.2.3", "- a line with no heading"), "1.2.4");
  assert.equal(nextVersion("1.2.3", "### Changed\n- x\n\n### Added\n- y"), "1.3.0");
  assert.equal(nextVersion("1.2.3", "### Added\n- y\n\n### Breaking\n- z"), "2.0.0");
  // Two releases on one day are two versions.
  const one = release(SAMPLE, "2026-11-12").md;
  const two = release(one.replace("## 1.0.0", "## Unreleased\n\n### Added\n- Cylinder cut list.\n\n## 1.0.0"), "2026-11-12");
  assert.equal(two.version, "1.1.0");
  assert.deepEqual(parse(two.md).sections.map((s) => s.heading), ["1.1.0 (2026-11-12)", "1.0.0 (2026-11-12)", "2026-11-11", "Earlier"]);
  assert.deepEqual(lint(two.md), []);
});

test("notes are the release sections the old file doesn't have", () => {
  const next = release(SAMPLE, "2026-11-12").md;
  assert.equal(newNotes(next, SAMPLE), "1.0.0 (2026-11-12)\n\n### Added\n- Box volume calculator.\n\n### Fixed\n- Port length with two slots.");
  assert.equal(newNotes(SAMPLE, SAMPLE), "");
});

test("lint: releases newest first and above the dated sections", () => {
  const base = (mid: string) => `# Changelog\n\n## Unreleased\n\n${mid}## Earlier\n\nOld.\n`;
  assert.deepEqual(lint(base("## 1.1.0 (2026-11-20)\n\n- b\n\n## 1.0.0 (2026-11-15)\n\n- a\n\n## 2026-11-13\n\n- c\n\n")), []);
  assert.ok(lint(base("## 1.0.0 (2026-11-15)\n\n- a\n\n## 1.1.0 (2026-11-20)\n\n- b\n\n")).some((p) => /newest first/.test(p)));
  assert.ok(lint(base("## 2026-11-13\n\n- c\n\n## 1.0.0 (2026-11-15)\n\n- a\n\n")).some((p) => /before the dated sections/.test(p)));
  assert.ok(lint(base("## v1.0.0\n\n- a\n\n")).some((p) => /isn't a release/.test(p)));
});

test("lint catches PR numbers, tooling notes and bad headings", () => {
  const bad = SAMPLE.replace("Box volume calculator.", "Box volume calculator (#12), made with Claude.").replace("## 2026-11-11", "## Nov 11");
  const p = lint(bad);
  assert.ok(p.some((x) => /PR\/issue numbers/.test(x)));
  assert.ok(p.some((x) => /tooling/.test(x)));
  assert.ok(p.some((x) => /isn't a release/.test(x)));
});
