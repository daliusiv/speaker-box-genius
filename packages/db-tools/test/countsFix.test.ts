import { test } from "node:test";
import assert from "node:assert/strict";
import { countProblems, fixCounts, isCountFile, totalsFromPaths } from "../src/counts.ts";

const t = { drivers: 1797, prs: 59, brands: 21 };

test("a new brand: \"N brands\" is updated, driver and PR wording left alone when still close", () => {
  const text = "About 1,800 drivers from 20 brands, plus 59 passive radiators. Over 1,700 drivers.";
  assert.equal(countProblems("README.md", text, t).length, 1);
  const fixed = fixCounts(text, t);
  assert.equal(fixed, "About 1,800 drivers from 21 brands, plus 59 passive radiators. Over 1,700 drivers.");
  assert.deepEqual(countProblems("README.md", fixed, t), []);
});

test("counts outside the tolerance are rewritten in the same style", () => {
  const far = { drivers: 2140, prs: 70, brands: 21 };
  const fixed = fixCounts("about 1,800 drivers; over 1,700 drivers; 1,800 drivers; 59 passive radiators", far);
  assert.equal(fixed, "about 2,140 drivers; over 2,100 drivers; 2,140 drivers; 70 passive radiators");
  assert.deepEqual(countProblems("x.md", fixed, far), []);
});

test("totals from the repo's file list match how the database counts", () => {
  const paths = [
    "drivers/edge/_brand.json",
    "drivers/edge/eds15d2-e3.json",
    "drivers/dayton-audio/_brand.json",
    "drivers/dayton-audio/rss265hf-4.json",
    "passive-radiators/dayton-audio/_brand.json",
    "passive-radiators/dayton-audio/dsa270-pr.json",
    "drivers/README.md",
    "docs/examples/drivers/example-audio/ex10-4.json",
  ];
  assert.deepEqual(totalsFromPaths(paths), { drivers: 2, prs: 1, brands: 2 });
});

test("which files state counts", () => {
  for (const f of ["README.md", "docs/data-sources.md", "site/about.md", "site/pages/design-assistant.md"]) assert.ok(isCountFile(f), f);
  for (const f of ["drivers/README.md", "docs/examples/x.md", "site/pages/sub/x.md", "site/build.ts"]) assert.ok(!isCountFile(f), f);
});
