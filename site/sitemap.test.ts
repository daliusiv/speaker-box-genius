import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contentHash, LastmodStore, sitemapFiles, sitemapGroupOrder } from "./sitemap.ts";
import { tempDir } from "./tempDir.ts";

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
  const file = join(tempDir("lastmod-"), "sub", "lastmod.json");

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
  const file = join(tempDir("lastmod-"), "lastmod.json");
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

test("content hash: share-link fragments at the site root are ignored, other fragments are not", () => {
  const a = (h: string) => page(`<a href="${h}">Open</a>`);
  assert.equal(contentHash(a("https://example.com/#z=AAA"), "https://example.com"), contentHash(a("https://example.com/#z=BBB"), "https://example.com"));
  // Another site's fragment is content.
  assert.notEqual(contentHash(a("https://github.com/#a"), "https://example.com"), contentHash(a("https://github.com/#b"), "https://example.com"));
  assert.equal(contentHash(a("/#z=A")), contentHash(a("/#z=B")));
  assert.notEqual(contentHash(a("/guides/x/#a")), contentHash(a("/guides/x/#b")));
});

test("lastmod: save(extra) writes the same JSON to the extra path, and it works as a state file", () => {
  const dir = tempDir("lastmod-");
  const file = join(dir, "lastmod.json");
  const copy = join(dir, "missing", "nested", "sitemap-state.json");
  const first = new LastmodStore(file, "2026-11-01");
  first.date("/a/", page("a"));
  first.save(copy);
  assert.equal(readFileSync(copy, "utf8"), readFileSync(file, "utf8"));
  const second = new LastmodStore(copy, "2026-11-09");
  assert.equal(second.date("/a/", page("a")), "2026-11-01");
  assert.equal(second.changed, 0);
});

test("sitemap groups: pages, guides, drivers, then brands A-Z, then others", () => {
  assert.deepEqual(
    sitemapGroupOrder(["drivers-b", "zzz", "pages", "drivers-a", "drivers", "guides", "pages", "aaa"]),
    ["pages", "guides", "drivers", "drivers-a", "drivers-b", "aaa", "zzz"],
  );
});

test("sitemap files: one per non-empty group, brands apart, index in order with the newest date", () => {
  const e = (path: string, group: string, lastmod: string) => ({ path, group, lastmod });
  const files = sitemapFiles("https://x.test", [
    e("/drivers/b/m/", "drivers-b", "2026-11-03"),
    e("/drivers/a/m/", "drivers-a", "2026-11-01"),
    e("/drivers/a/n/", "drivers-a", "2026-11-05"),
    e("/drivers/", "drivers", "2026-11-02"),
    e("/", "pages", "2026-11-04"),
  ]);
  assert.deepEqual(Object.keys(files).sort(), ["sitemap-drivers-a.xml", "sitemap-drivers-b.xml", "sitemap-drivers.xml", "sitemap-pages.xml", "sitemap.xml"]);
  assert.equal((files["sitemap-drivers-a.xml"].match(/<url>/g) ?? []).length, 2);
  assert.doesNotMatch(files["sitemap-drivers.xml"], /\/drivers\/a\//);
  const locs = [...files["sitemap.xml"].matchAll(/sitemap-([\w-]+)\.xml<\/loc><lastmod>([\d-]+)</g)].map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual(locs, ["pages 2026-11-04", "drivers 2026-11-02", "drivers-a 2026-11-05", "drivers-b 2026-11-03"]);
});

test("sitemap files: a group name that isn't safe in a file name throws", () => {
  assert.throws(() => sitemapFiles("https://x.test", [{ path: "/", group: "drivers-../x", lastmod: "2026-11-01" }]), /Bad sitemap group/);
  assert.throws(() => sitemapFiles("https://x.test", [{ path: "/", group: "Pages", lastmod: "2026-11-01" }]), /Bad sitemap group/);
});
