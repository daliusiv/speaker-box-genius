import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../packages/db-tools/src/load.ts";
import { INDEXNOW_KEY, MAX_URLS, changedPaths, payload } from "./indexnow.ts";

test("only new and changed pages are sent", () => {
  const prev = { "/a/": { hash: "1" }, "/b/": { hash: "2" }, "/gone/": { hash: "3" } };
  const next = { "/a/": { hash: "1" }, "/b/": { hash: "9" }, "/new/": { hash: "4" } };
  assert.deepEqual(changedPaths(prev, next), ["/b/", "/new/"]);
});

test("the payload names the site, the key file and full URLs, capped at IndexNow's limit", () => {
  const p = payload(["/x/", "/y/"]);
  assert.equal(p.host, "speakerboxgenius.com");
  assert.equal(p.keyLocation, `https://speakerboxgenius.com/${INDEXNOW_KEY}.txt`);
  assert.deepEqual(p.urlList, ["https://speakerboxgenius.com/x/", "https://speakerboxgenius.com/y/"]);
  assert.equal(payload(Array.from({ length: MAX_URLS + 5 }, (_, i) => `/${i}/`)).urlList.length, MAX_URLS);
});

test("the site serves the key file IndexNow checks", () => {
  const file = readFileSync(join(REPO_ROOT, "packages", "web", "public", `${INDEXNOW_KEY}.txt`), "utf8");
  assert.equal(file.trim(), INDEXNOW_KEY);
});

test("the Pages deploy pings IndexNow after the site is live", () => {
  const wf = readFileSync(join(REPO_ROOT, ".github", "workflows", "deploy-pages.yml"), "utf8");
  assert.ok(wf.includes("site/indexnow.ts diff .cache/sitemap-prev.json packages/web/dist/sitemap-state.json"));
  assert.match(wf, /indexnow:\n\s+needs: deploy/);
  assert.ok(wf.includes("site/indexnow.ts submit"));
});
