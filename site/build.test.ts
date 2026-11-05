import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, markdown, parsePage, resolveExamples } from "./build.ts";

test("markdown: headings, lists, tables, links, figures and notes", () => {
  const html = markdown(
    "## Step 1: size\n\nSome **bold** and `code` with a [link](https://example.com).\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n![Caption here](img/x.png)\n\n> A note",
  );
  assert.match(html, /<h2 id="step-1-size">Step 1: size<\/h2>/);
  assert.match(html, /<strong>bold<\/strong> and <code>code<\/code> with a <a href="https:\/\/example.com" rel="noopener">link<\/a>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<th>a<\/th><th>b<\/th>.*<td>1<\/td><td>2<\/td>/s);
  assert.match(html, /<figure><img src="\/guides\/img\/x.png" alt="Caption here" loading="lazy"><figcaption>Caption here<\/figcaption><\/figure>/);
  assert.match(html, /<aside class="note"><p>A note<\/p><\/aside>/);
  assert.doesNotMatch(markdown("a <script>x</script>"), /<script>/);
  assert.match(markdown("# Title\n\nThe intro.\n\nMore."), /<h1>Title<\/h1>\n<p class="lede">The intro.<\/p>\n<p>More.<\/p>/);
});

test("pages need front matter; unknown examples are an error", () => {
  assert.throws(() => parsePage("# no front matter"), /front matter/);
  assert.equal(parsePage("---\ntitle: T\ndescription: D\npath: guides/x\n---\nbody").path, "/guides/x/");
  assert.throws(() => resolveExamples("[[Open|nope]]", {}), /no example called "nope"/);
});

test("builds every guide, the index, sitemap and robots.txt, with live example links", async () => {
  const out = mkdtempSync(join(tmpdir(), "site-"));
  const paths = await build(out);
  assert.ok(paths.includes("/guides/passive-radiator-box/"));
  assert.ok(paths.includes("/winisd-alternative/"));
  assert.ok(paths.includes("/guides/"));
  const pr = readFileSync(join(out, "guides/passive-radiator-box/index.html"), "utf8");
  assert.match(pr, /<title>How to design a passive radiator box · Speaker Box Genius<\/title>/);
  assert.match(pr, /<link rel="canonical" href="https:\/\/speakerboxgenius.com\/guides\/passive-radiator-box\/">/);
  assert.match(pr, /class="button" href="https:\/\/speakerboxgenius.com\/#z=[A-Za-z0-9_-]+"/);
  assert.ok(existsSync(join(out, "guides/img/pr-spl.png")));
  const sitemap = readFileSync(join(out, "sitemap.xml"), "utf8");
  assert.match(sitemap, /<loc>https:\/\/speakerboxgenius.com\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/speakerboxgenius.com\/winisd-alternative\/<\/loc>/);
  assert.match(readFileSync(join(out, "robots.txt"), "utf8"), /Sitemap: https:\/\/speakerboxgenius.com\/sitemap.xml/);
});

test("the example links open the designs the guides describe", async () => {
  const { exampleLinks } = await import("./examples.ts");
  const { decodeStateAny } = await import("../packages/web/src/state.ts");
  const links = await exampleLinks("https://speakerboxgenius.com");
  const s = await decodeStateAny(links["pr-example"]!.split("#")[1]!);
  assert.equal(s?.driverName, "Dayton Audio DSA215-8");
  assert.deepEqual(s?.designs.map((d) => d.kind), ["vented", "pr"]);
});
