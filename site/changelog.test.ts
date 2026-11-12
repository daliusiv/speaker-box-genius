import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../packages/db-tools/src/load.ts";
import { lint, newNotes, parse, release } from "../scripts/changelog.ts";

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

test("release moves Unreleased under the date, newest first, and empties Unreleased", () => {
  const r = release(SAMPLE, "2026-11-12");
  assert.ok(r.changed);
  const heads = parse(r.md).sections.map((s) => s.heading);
  assert.deepEqual(heads, ["Unreleased", "2026-11-12", "2026-11-11", "Earlier"]);
  assert.equal(parse(r.md).sections[0].body, "");
  assert.match(parse(r.md).sections[1].body, /### Added\n- Box volume calculator\.\n\n### Fixed\n- Port length with two slots\./);
  assert.deepEqual(lint(r.md), []);
  assert.equal(release(r.md, "2026-11-13").changed, false, "nothing to release");
});

test("release on a date that already has a section adds to it", () => {
  const r = release(SAMPLE, "2026-11-11");
  const s = parse(r.md).sections;
  assert.deepEqual(s.map((x) => x.heading), ["Unreleased", "2026-11-11", "Earlier"]);
  assert.match(s[1].body, /Box volume calculator[\s\S]*Passive radiator calculator/);
});

test("notes are the dated sections the old file doesn't have", () => {
  const next = release(SAMPLE, "2026-11-12").md;
  assert.equal(newNotes(next, SAMPLE), "2026-11-12\n\n### Added\n- Box volume calculator.\n\n### Fixed\n- Port length with two slots.");
  assert.equal(newNotes(SAMPLE, SAMPLE), "");
});

test("lint catches PR numbers, tooling notes and bad headings", () => {
  const bad = SAMPLE.replace("Box volume calculator.", "Box volume calculator (#12), made with Claude.").replace("## 2026-11-11", "## Nov 11");
  const p = lint(bad);
  assert.ok(p.some((x) => /PR\/issue numbers/.test(x)));
  assert.ok(p.some((x) => /tooling/.test(x)));
  assert.ok(p.some((x) => /isn't a YYYY-MM-DD date/.test(x)));
});
