import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentHash, LastmodStore, sitemapFiles } from "./sitemap.ts";

const page = (body: string, nav = "<nav>A</nav>") => `<html><head><title>x</title></head><body>${nav}<main>${body}</main><footer>f</footer></body></html>`;

test("content hash: only what's in <main>, without the volatile parts", () => {
  assert.equal(contentHash(page("<p>Same</p>")), contentHash(page("<p>Same</p>", "<nav>A new guide in the menu</nav>")));
  assert.notEqual(contentHash(page("<p>One</p>")), contentHash(page("<p>Two</p>")));
  assert.equal(
    contentHash(page("<p>Results<!--volatile--> Built from commit abc on 8 November 2026.<!--/volatile--></p>")),
    contentHash(page("<p>Results<!--volatile--> Built from commit def on 9 November 2026.<!--/volatile--></p>")),
  );
  // A page with no <main> (the app's index.html) is hashed whole.
  assert.notEqual(contentHash("<html>a</html>"), contentHash("<html>b</html>"));
});

test("lastmod: a page keeps its date until its content changes; removed pages drop out", () => {
  const file = join(mkdtempSync(join(tmpdir(), "lastmod-")), "sub", "lastmod.json");

  const first = new LastmodStore(file, "2026-11-01");
  assert.equal(first.date("/a/", page("a")), "2026-11-01");
  assert.equal(first.date("/b/", page("b")), "2026-11-01");
  assert.equal(first.date("/gone/", page("gone")), "2026-11-01");
  assert.equal(first.changed, 3);
  first.save();

  const second = new LastmodStore(file, "2026-11-09");
  assert.equal(second.date("/a/", page("a", "<nav>other menu</nav>")), "2026-11-01"); // unchanged content
  assert.equal(second.date("/b/", page("b, edited")), "2026-11-09"); // changed
  assert.equal(second.date("/c/", page("c")), "2026-11-09"); // new
  assert.equal(second.changed, 2);
  second.save();
  const saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, { lastmod: string }>;
  assert.deepEqual(Object.keys(saved).sort(), ["/a/", "/b/", "/c/"]);
  assert.equal(saved["/b/"]!.lastmod, "2026-11-09");
});

test("lastmod: unreadable saved state counts every page as new", () => {
  const file = join(mkdtempSync(join(tmpdir(), "lastmod-")), "lastmod.json");
  writeFileSync(file, "not json");
  const store = new LastmodStore(file, "2026-11-09");
  assert.equal(store.date("/a/", page("a")), "2026-11-09");
});

test("sitemap files: an index with one sitemap per group, each dated by its newest page", () => {
  const files = sitemapFiles("https://example.com", [
    { path: "/", group: "pages", lastmod: "2026-11-02" },
    { path: "/guides/x/", group: "guides", lastmod: "2026-11-05" },
    { path: "/guides/", group: "guides", lastmod: "2026-11-07" },
    { path: "/drivers/a&b/", group: "drivers", lastmod: "2026-11-01" },
  ]);
  assert.deepEqual(Object.keys(files).sort(), ["sitemap-drivers.xml", "sitemap-guides.xml", "sitemap-pages.xml", "sitemap.xml"]);
  assert.match(files["sitemap.xml"]!, /<sitemap><loc>https:\/\/example.com\/sitemap-guides.xml<\/loc><lastmod>2026-11-07<\/lastmod><\/sitemap>/);
  assert.match(files["sitemap-pages.xml"]!, /<url><loc>https:\/\/example.com\/<\/loc><lastmod>2026-11-02<\/lastmod><\/url>/);
  assert.match(files["sitemap-drivers.xml"]!, /<loc>https:\/\/example.com\/drivers\/a&amp;b\/<\/loc>/);
  // A group with no pages gets no sitemap.
  assert.deepEqual(Object.keys(sitemapFiles("https://example.com", [{ path: "/", group: "pages", lastmod: "2026-11-02" }])).sort(), ["sitemap-pages.xml", "sitemap.xml"]);
});
