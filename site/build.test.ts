import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, GOATCOUNTER, markdown, parsePage, resolveExamples } from "./build.ts";
import { cardData, designDriver, driverContent, driverState, driverTitle, loadDb, PAGE_MAX_L, prCandidate } from "./drivers.ts";
import { chart } from "./chart.ts";
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
  // Nested lists: an indented list inside an item, in bullet and numbered lists; plain indented
  // lines still continue the item.
  assert.equal(markdown("- a\n  - b\n  - c\n    wraps\n- d"), "<ul><li>a<ul><li>b</li><li>c wraps</li></ul></li><li>d</li></ul>");
  assert.equal(markdown("1. a\n   more\n   - b\n2. c"), "<ol><li>a more<ul><li>b</li></ul></li><li>c</li></ol>");
  assert.equal(markdown("- a\n  continued"), "<ul><li>a continued</li></ul>");
});

test("guides: no list item swallows an indented list as text", () => {
  for (const f of readdirSync(new URL("./pages/", import.meta.url))) {
    if (!f.endsWith(".md")) continue;
    const html = markdown(parsePage(readFileSync(new URL(`./pages/${f}`, import.meta.url), "utf8")).body);
    for (const li of html.match(/<li>.*?<\/li>/g) ?? []) assert.doesNotMatch(li, /\s-\s<strong>|<\/strong>\s-\s/, `${f}: ${li.slice(0, 80)}`);
  }
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
  assert.equal(cmp?.power, 350);
  assert.deepEqual(cmp?.designs.map((d) => d.name), ["Sealed 30 L", "Ported 50 L, 26 Hz"]);
  const subs = await decodeStateAny(links["subs-example"]!.split("#")[1]!);
  assert.equal(subs?.drivers, 1);
  assert.deepEqual([subs?.compare?.driverName, subs?.compare?.drivers, subs?.compare?.wiring], ["Dayton Audio RSS265HF-4", 2, "parallel"]);
  const tsx = await decodeStateAny(links["ts-example"]!.split("#")[1]!);
  assert.equal(tsx?.compare?.driverName, "Dayton Audio RSS210HF-4");
  assert.equal(tsx?.volts, 21.7);
  const car = await decodeStateAny(links["car-example"]!.split("#")[1]!);
  assert.equal(car?.roomGain.mode, "car");
  assert.equal(car?.power, 350);
  const carOut = await decodeStateAny(links["car-nocabin"]!.split("#")[1]!);
  assert.equal(carOut?.roomGain.mode, "off");
  assert.deepEqual(carOut?.designs.map((d) => d.name), car?.designs.map((d) => d.name));
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

test("validation cases: in number order, each with its own key, and the same impedance columns in both Hornresp tables", async () => {
  const { out } = await built();
  const html = readFileSync(join(out, "validation/index.html"), "utf8");
  const ids = [...html.matchAll(/<section class="case" id="hornresp-(b\d+)/g)].map((m) => Number(m[1]!.slice(1)));
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), "B2 comes before B10");
  const cases = html.split('<section class="case"').slice(1);
  for (const c of cases) assert.match(c, /<p class="key">/, `a case without its key: ${c.slice(0, 60)}`);
  const heads = [...html.matchAll(/<th>Impedance, mean \/ (\w+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(heads, ["worst", "worst"]);
});

test("validation cases sit in five closed groups that a link opens, with a way back to the summary", async () => {
  const { out } = await built();
  const html = readFileSync(join(out, "validation/index.html"), "utf8");
  const groups = [...html.matchAll(/<details class="group" id="([\w-]+)"><summary>([^<]+)/g)].map((m) => [m[1], m[2]!.trim()]);
  assert.deepEqual(groups.map((g) => g[0]), ["winisd-cases", "winisd-run-cases", "hornresp-lines", "hornresp-boxes", "hornresp-stuffed"]);
  assert.ok(!/<details class="group"[^>]* open/.test(html), "closed until asked for");
  // Every case is inside a group; the summary and known differences are not.
  const before = html.split('<details class="group"')[0]!;
  assert.ok(!before.includes('<section class="case"') && before.includes('id="summary"') && before.includes('id="known-differences"'));
  assert.match(html, /<a class="to-summary" href="#summary">/);
  assert.match(html, /d\.open=true/);
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
});

test("driver and brand pages: search titles and structured data (subject and breadcrumbs)", async () => {
  const { out } = await built();
  const html = readFileSync(join(out, "drivers/dayton-audio/dsa215-8/index.html"), "utf8");
  assert.match(html, /<title>Dayton Audio DSA215-8: box size, port tuning and T\/S parameters · Speaker Box Genius<\/title>/);
  const lds = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]!));
  assert.equal(lds.length, 2);
  assert.equal(lds[0].about.name, "Dayton Audio DSA215-8");
  assert.deepEqual(lds[0].author, { "@type": "Organization", name: "Speaker Box Genius", url: "https://speakerboxgenius.com" });
  assert.doesNotMatch(html, /"@type":"Person"/);
  assert.deepEqual(
    lds[1].itemListElement.map((x: { name: string; item: string }) => [x.name, x.item]),
    [
      ["Drivers", "https://speakerboxgenius.com/drivers/"],
      ["Dayton Audio", "https://speakerboxgenius.com/drivers/dayton-audio/"],
      ["DSA215-8", "https://speakerboxgenius.com/drivers/dayton-audio/dsa215-8/"],
    ],
  );
  const brand = readFileSync(join(out, "drivers/dayton-audio/index.html"), "utf8");
  assert.match(brand, /<title>Dayton Audio drivers: box sizes and T\/S parameters/);
  assert.match(brand, /"@type":"BreadcrumbList"/);
  // Guides keep one block, without breadcrumbs.
  assert.equal((readFileSync(join(out, "guides/passive-radiator-box/index.html"), "utf8").match(/application\/ld\+json/g) ?? []).length, 1);
});

test("driver designs follow the app's presets, with a port that fits and a PR that keeps up", () => {
  const db = loadDb();
  const e = db.drivers.find((x) => x.id === "dayton-audio/dsa215-8")!;
  const p = designDriver(e, db.passiveRadiators.map(prCandidate))!;
  const [sealed, vented, pr] = p.designs.map((d) => d.design) as any[];
  assert.equal(sealed.preset, "Qtc 0.707");
  assert.equal(vented.preset, "QB3");
  const across = vented.shape === "slot" ? vented.slotHeight_cm : vented.diameter_cm;
  assert.ok(vented.length_cm + across <= 1.618 * Math.cbrt(vented.vb_l * 1000), "the port fits");
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

test("no driver page suggests a box over the page limit, and a high-Qts driver's sealed box stays near twice Vas", () => {
  const db = loadDb();
  const prs = db.passiveRadiators.map(prCandidate);
  // Qts 0.68: Qtc 0.707 would ask for about 2,400 L.
  const hiQ = db.drivers.find((x) => x.id === "celestion/pulse-xl-15-25");
  if (hiQ) {
    const p = designDriver(hiQ, prs);
    const sealed = p?.designs.find((d) => d.design.kind === "sealed")?.design;
    assert.ok(sealed && sealed.vb_l <= Math.min(PAGE_MAX_L, 2.01 * hiQ.data.ts.vas_l!) && sealed.preset !== "Qtc 0.707", `${sealed?.vb_l} L, ${sealed?.preset}`);
  }
  // A high-Qts mid-bass driver (Qts 0.55): no ported or PR box over twice Vas; the page says it suits a sealed box.
  const midbass = db.drivers.find((x) => x.id === "beyma/12cmv3");
  if (midbass) {
    const p = designDriver(midbass, prs)!;
    assert.ok(p.designs.every((d) => d.design.kind === "sealed" || d.design.vb_l <= 2 * midbass.data.ts.vas_l!));
    assert.ok(p.notes.some((n) => /suits a sealed box/.test(n)), p.notes.join("; "));
  }
  // Big QB3 boxes for 18-inch drivers are left off, with a reason on the page.
  const big = db.drivers.find((x) => x.id === "dayton-audio/umii18-22");
  if (big) {
    const p = designDriver(big, prs);
    assert.ok(!p || p.designs.every((d) => d.design.vb_l <= PAGE_MAX_L));
    if (p) assert.ok(p.notes.some((n) => /over 300 L/.test(n)), p.notes.join("; "));
  }
});

test("a driver page with a value to check says so near the top, with the way to report it", () => {
  const db = loadDb();
  const e = db.drivers.find((x) => x.id === "dayton-audio/dsa215-8")!;
  const links = { all: "https://speakerboxgenius.com/#z=x", related: [] };
  const clean = driverContent(designDriver(e, [])!, links, chart).content;
  assert.doesNotMatch(clean, /class="note flag"/);
  const flags = [{ code: "xmax-high" as const, message: "Xmax 19 mm is very large for a 60 mm cone." }];
  const html = driverContent(designDriver({ ...e, flags }, [])!, links, chart).content;
  assert.match(html, /class="note flag">⚠ Xmax 19 mm is very large for a 60 mm cone\. The cone excursion and maximum SPL below depend on it\. <a href="https:\/\/github\.com\/[^"]+data-correction/);
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

test("driver pages open the designs at the driver's power rating", () => {
  const db = loadDb();
  const e = db.drivers.find((x) => x.id === "dayton-audio/dsa215-8")!;
  const s = driverState(e.data);
  assert.equal(s.drive, "watts");
  assert.equal(s.power, Math.round(e.data.ts.pe_w!));
});

test("every page counts visits the same way, and the privacy page says what that sees", async () => {
  const { out, paths } = await built();
  assert.ok(paths.includes("/privacy/"));
  assert.ok(paths.includes("/about/"));
  const about = readFileSync(join(out, "about/index.html"), "utf8");
  for (const must of [/PolyForm Noncommercial/, /CC BY-NC-SA/, /CLA/, /driver-base/, /not affiliated/i]) assert.match(about, must);
  for (const p of ["/guides/", "/winisd-alternative/", "/validation/", "/privacy/", "/drivers/", paths.find((x) => /^\/drivers\/[^/]+\/[^/]+\/$/.test(x))!]) {
    const html = readFileSync(join(out, p, "index.html"), "utf8");
    assert.equal(html.split(GOATCOUNTER).length - 1, 1, `${p}: one counter tag`);
    assert.match(html, /<a href="\/privacy\/">Privacy<\/a>/, `${p}: links the privacy page`);
    assert.match(html, /<a href="\/about\/">About<\/a>/, `${p}: links the about page`);
  }
  // The app counts with the same tag (and never sends the design: it's after the #).
  const app = readFileSync(new URL("../packages/web/index.html", import.meta.url), "utf8");
  assert.ok(app.includes(GOATCOUNTER.replace("></script>", "")), "the app's index.html has the same counter");
  const privacy = readFileSync(join(out, "privacy/index.html"), "utf8");
  assert.match(privacy, /GoatCounter/);
  assert.match(privacy, /no cookies/i);
});

test("driver page titles name port tuning only when a ported box is suggested", () => {
  assert.equal(driverTitle("X Y", ["sealed", "vented", "pr"]), "X Y: box size, port tuning and T/S parameters");
  assert.equal(driverTitle("X Y", ["sealed", "pr"]), "X Y: box size, tuning and T/S parameters");
  assert.equal(driverTitle("X Y", ["sealed"]), "X Y: box size and T/S parameters");
});

test("guides index: every guide in a section, cards once, search box, list data; guides end with related guides", async () => {
  const { out } = await built();
  const pages = readdirSync(join(import.meta.dirname, "pages")).filter((f) => f.endsWith(".md"));
  for (const f of pages) assert.ok(parsePage(readFileSync(join(import.meta.dirname, "pages", f), "utf8"), f).group, `${f} has no group`);
  assert.throws(() => parsePage("---\ntitle: T\ndescription: D\npath: guides/x\ngroup: nope\n---\nbody"), /unknown group/);
  const html = readFileSync(join(out, "guides/index.html"), "utf8");
  assert.match(html, /<title>Speaker box design guides · Speaker Box Genius<\/title>/);
  assert.equal((html.match(/<section class="group">/g) ?? []).length, 6);
  assert.match(html, /<input class="find" type="search"/);
  assert.doesNotMatch(html, /More guides/);
  // Each guide is linked once in the page body (the lede links two of them again).
  const box = html.match(/href="\/guides\/box-stuffing\/"/g) ?? [];
  assert.equal(box.length, 1);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]!);
  assert.equal(ld["@type"], "CollectionPage");
  assert.equal(ld.mainEntity.itemListElement.length, pages.length);
  const guide = readFileSync(join(out, "guides/box-stuffing/index.html"), "utf8");
  assert.doesNotMatch(guide, /More guides/);
  const related = guide.match(/<section class="related">([\s\S]*?)<\/section>/)![1]!;
  assert.match(related, /href="\/guides\/box-losses\/"/);
  assert.doesNotMatch(related, /href="\/guides\/box-stuffing\/"/);
  assert.ok((related.match(/<li>/g) ?? []).length <= 4);
});
