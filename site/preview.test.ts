import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GOATCOUNTER } from "./build.ts";
import { makePreview, MAX_FILE_BYTES } from "./preview.ts";

function fakeDist(): string {
  const d = mkdtempSync(join(tmpdir(), "sbg-preview-"));
  mkdirSync(join(d, "guides", "x"), { recursive: true });
  writeFileSync(join(d, "index.html"), `<head>\n    ${GOATCOUNTER}\n</head>`);
  writeFileSync(join(d, "guides", "x", "index.html"), `<body>${GOATCOUNTER}</body>`);
  writeFileSync(join(d, "robots.txt"), "User-agent: *\nAllow: /\n");
  writeFileSync(join(d, "CNAME"), "speakerboxgenius.com\n");
  return d;
}

test("preview build: no counter, no indexing, no CNAME", () => {
  const d = fakeDist();
  const r = makePreview(d);
  assert.equal(r.pagesStripped, 2);
  for (const p of ["index.html", "guides/x/index.html"]) {
    assert.ok(!readFileSync(join(d, p), "utf8").includes("goatcounter"), p);
  }
  assert.match(readFileSync(join(d, "robots.txt"), "utf8"), /Disallow: \/\n/);
  assert.match(readFileSync(join(d, "_headers"), "utf8"), /X-Robots-Tag: noindex/);
  assert.ok(!existsSync(join(d, "CNAME")));
  assert.deepEqual(r.problems, []);
});

test("preview build: a file over Cloudflare's 25 MiB limit is reported", () => {
  const d = fakeDist();
  writeFileSync(join(d, "big.json"), Buffer.alloc(MAX_FILE_BYTES + 1));
  const r = makePreview(d);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /big\.json/);
});
