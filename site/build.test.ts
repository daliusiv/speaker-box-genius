import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, markdown, parsePage, resolveExamples } from "./build.ts";
import { cardData, designDriver, driverState, loadDb, prCandidate } from "./drivers.ts";
import { cardSvg } from "./og.ts";

// One build for every test below (it takes a while: a page per driver). Share cards need
// Chrome and are tested on their own.
process.env.SBG_CARDS = "0";
let builtOnce: Promise<{ out: string; paths: string[] }> | null = null;
const built = () => (builtOnce ??= (async () => {
  const out = mkdtempSync(join(tmpdir(), "site-"));
  return { out, paths: await build(out) };
})());

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
  assert.equal((markdown("[[One|a]] [[Two|b]]").match(/class="button"/g) ?? []).length, 2);
});

test("builds every guide, the index, sitemap and robots.txt, with live example links", async () => {
  const { out, paths } = await built();
  assert.ok(paths.includes("/guides/passive-radiator-box/"));
  assert.ok(paths.includes("/winisd-alternative/"));
  assert.ok(paths.includes("/guides/"));
  for (const p of [
    "/guides/transmission-line/",
    "/guides/port-chuffing/",
    "/hornresp-alternative/",
    "/guides/sealed-vs-ported/",
    "/guides/subsonic-filter/",
    "/guides/car-subwoofer/",
    "/guides/compare-drivers/",
    "/guides/thiele-small-parameters/",
    "/guides/simulation-vs-measurement/",
    "/guides/port-tuning/",
    "/guides/box-losses/",
    "/guides/linkwitz-transform/",
    "/guides/isobaric/",
  ]) assert.ok(paths.includes(p), p);
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
  const tl = await decodeStateAny(links["tl-example"]!.split("#")[1]!);
  assert.deepEqual(tl?.designs.map((d) => d.name), ["Classic TL", "Offset TL", "MLTL"]);
  const port = await decodeStateAny(links["port-example"]!.split("#")[1]!);
  assert.equal(port?.driverName, "Dayton Audio RSS315HF-4");
  assert.equal(port?.designs.length, 3);
  const cmp = await decodeStateAny(links["compare-example"]!.split("#")[1]!);
  assert.equal(cmp?.compare?.driverName, "Dayton Audio RSS265HO-4");
  const car = await decodeStateAny(links["car-example"]!.split("#")[1]!);
  assert.equal(car?.roomGain.mode, "car");
  const lt = await decodeStateAny(links["lt-example"]!.split("#")[1]!);
  assert.equal(lt?.eq[0]?.type, "linkwitz");
  const iso = await decodeStateAny(links["iso-pair"]!.split("#")[1]!);
  assert.equal(iso?.isobaric, true);
});

test("the validation page shows every case from results.json, with the top bar", async () => {
  const { out, paths } = await built();
  assert.ok(paths.includes("/validation/"));
  const html = readFileSync(join(out, "validation/index.html"), "utf8");
  const rep = JSON.parse(readFileSync(join(import.meta.dirname, "../docs/validation/results.json"), "utf8"));
  for (const c of rep.winisd.cases) assert.match(html, new RegExp(`id="winisd-${c.id}"`));
  for (const c of rep.hornresp.cases) assert.match(html, new RegExp(`id="hornresp-${c.id}"`));
  assert.match(html, /<a href="\/validation\/" class="wide" aria-current="page">Validation<\/a>/);
  assert.match(readFileSync(join(out, "sitemap.xml"), "utf8"), /speakerboxgenius\.com\/validation\//);
  assert.match(readFileSync(join(out, "guides/index.html"), "utf8"), /<a href="\/guides\/" aria-current="page">Guides<\/a>/);
});

test("driver pages: suggested boxes, charts, share link and brand indexes", async () => {
  const { out, paths } = await built();
  const driverPages = paths.filter((p) => /^\/drivers\/[^/]+\/[^/]+\/$/.test(p));
  assert.ok(driverPages.length > 1000, `${driverPages.length} driver pages`);
  assert.ok(paths.includes("/drivers/") && paths.includes("/drivers/dayton-audio/"));
  const html = readFileSync(join(out, "drivers/dayton-audio/dsa215-8/index.html"), "utf8");
  assert.match(html, /<h1>Dayton Audio DSA215-8: box design<\/h1>/);
  assert.match(html, /<\/span>Sealed<\/td>/);
  assert.match(html, /<\/span>Ported<\/td>/);
  assert.match(html, /<\/span>Passive radiator<\/td>/);
  assert.match(html, /href="https:\/\/speakerboxgenius\.com\/#z=[\w-]+"/);
  assert.match(html, /<svg class="chart"/);
  assert.match(html, /<a href="\/drivers\/" aria-current="page">Drivers<\/a>/);
  assert.doesNotMatch(html, /More guides/);
  assert.match(readFileSync(join(out, "drivers/dayton-audio/index.html"), "utf8"), /href="\/drivers\/dayton-audio\/dsa215-8\/"/);
  assert.match(readFileSync(join(out, "sitemap.xml"), "utf8"), /\/drivers\/dayton-audio\/dsa215-8\//);
  assert.doesNotMatch(html, /class="note flag"/);
  // A driver with a value to check says so near the top, with the way to report it.
  const flagged = paths.map((x) => readFileSync(join(out, x, "index.html"), "utf8")).find((h) => h.includes('class="note flag"'));
  assert.ok(flagged, "a driver page with a flag note");
  assert.match(flagged, /class="note flag">⚠ [^<]+<a href="https:\/\/github\.com\/[^"]+data-correction/);
});

test("driver designs follow the app's presets, with a port that fits and a PR that keeps up", () => {
  const db = loadDb();
  const e = db.drivers.find((x) => x.id === "dayton-audio/dsa215-8")!;
  const p = designDriver(e, db.passiveRadiators.map(prCandidate))!;
  const [sealed, vented, pr] = p.designs.map((d) => d.design) as any[];
  assert.equal(sealed.preset, "Qtc 0.707");
  assert.equal(vented.preset, "QB3");
  assert.ok(vented.length_cm + vented.diameter_cm <= 1.618 * Math.cbrt(vented.vb_l * 1000), "the port fits");
  assert.ok(Math.abs(p.designs[1]!.result.summary.fb! - vented.targetFb) < 0.2, "the port tunes the box");
  assert.equal(pr.kind, "pr");
  assert.ok(pr.addedMass_g >= 0);
  // High-Qts guitar speakers get no page: no box type suits them.
  const guitar = db.drivers.find((x) => x.id === "jensen/c12q-8ohm");
  if (guitar) assert.equal(designDriver(guitar, []), null);
  assert.equal(driverState(e.data).driverName, "Dayton Audio DSA215-8");
  const svg = cardSvg(cardData(p));
  assert.match(svg, /^<svg[^>]+width="1200" height="630"/);
  assert.match(svg, />Dayton Audio DSA215-8</);
});

test("every guide image is a figure of its own (an image inside a paragraph shows at full size)", () => {
  const dir = join(import.meta.dirname, "pages");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    readFileSync(join(dir, f), "utf8")
      .split(/\n\s*\n/)
      .forEach((para) => {
        if (/!\[/.test(para)) assert.match(para.trim(), /^!\[[^\]]*\]\([^)]*\)$/, `${f}: an image shares its paragraph: ${para.slice(0, 80)}`);
      });
  }
});
