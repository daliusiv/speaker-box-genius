import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { build, GOATCOUNTER, markdown, parsePage, resolveExamples } from "./build.ts";
import { cardData, designDriver, driverContent, driverState, driverTitle, hubSizes, loadDb, PAGE_MAX_L, prCandidate, SIZE_HUB_MIN, sizeLabel, sizePath, sizeSlug, type DriverPage } from "./drivers.ts";
import { chart } from "./chart.ts";
import { cardSvg } from "./og.ts";
import { tempDir } from "./tempDir.ts";

// One build for every test below (it takes a while: a page per driver). Share cards need
// Chrome and are tested on their own.
process.env.SBG_CARDS = "0";
// Sitemap dates: a fixed build date, and the saved state in a temporary folder, not .cache/.
process.env.SBG_BUILD_DATE = "2026-11-09";
process.env.SBG_LASTMOD_STATE = join(tempDir("lastmod-"), "lastmod.json");
let builtOnce: Promise<{ out: string; paths: string[] }> | null = null;
const built = () => (builtOnce ??= (async () => {
  const out = tempDir("site-");
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
    const html = markdown(parsePage(readFileSync(new URL(`./pages/${f}`, import.meta.url), "utf8")).body, () => "");
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
  assert.ok(existsSync(join(out, "guides/img/shaped-cabinets.png")));
  // A guide whose share card is a chart (image: chart:…): with cards off (no Chrome), the site's card.
  assert.match(pr, /<meta property="og:image" content="https:\/\/speakerboxgenius.com\/og-image.png">/);
  assert.match(readFileSync(join(out, "guides/shaped-cabinets/index.html"), "utf8"), /og:image" content="https:\/\/speakerboxgenius.com\/guides\/img\/shaped-cabinets.png"/);
  // sitemap.xml is an index of one sitemap per kind of page, so Search Console reports each apart.
  const index = readFileSync(join(out, "sitemap.xml"), "utf8");
  assert.match(index, /<sitemapindex /);
  for (const g of ["pages", "guides", "drivers", "drivers-dayton-audio"]) assert.match(index, new RegExp(`<loc>https://speakerboxgenius.com/sitemap-${g}.xml</loc><lastmod>2026-11-09</lastmod>`));
  // The index lists every sitemap file written, and nothing else.
  const files = readdirSync(out).filter((f) => /^sitemap-.*\.xml$/.test(f)).sort();
  assert.deepEqual([...index.matchAll(/sitemap-[\w-]+\.xml/g)].map((m) => m[0]).sort(), files);
  const site = (g: string) => readFileSync(join(out, `sitemap-${g}.xml`), "utf8");
  assert.match(site("pages"), /<loc>https:\/\/speakerboxgenius.com\/<\/loc><lastmod>2026-11-09<\/lastmod>/);
  assert.match(site("pages"), /\/about\/</);
  assert.match(site("guides"), /<loc>https:\/\/speakerboxgenius.com\/winisd-alternative\/<\/loc>/);
  assert.match(site("guides"), /\/guides\/<\/loc>/);
  assert.match(site("guides"), /\/guides\/passive-radiator-box\/</);
  assert.doesNotMatch(site("guides"), /\/drivers\//);
  assert.doesNotMatch(site("pages"), /\/guides\/|\/drivers\//);
  assert.match(site("drivers"), /<loc>https:\/\/speakerboxgenius.com\/drivers\/<\/loc>/);
  assert.doesNotMatch(site("drivers"), /\/drivers\/dayton-audio\//);
  // Every built page is in exactly one sitemap.
  const locs = files.flatMap((f) => [...readFileSync(join(out, f), "utf8").matchAll(/<loc>https:\/\/speakerboxgenius\.com([^<]*)<\/loc>/g)].map((m) => m[1]));
  assert.equal(locs.length, new Set(locs).size);
  assert.deepEqual(new Set(locs), new Set(["/", ...paths]));
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
  assert.match(readFileSync(join(out, "sitemap-pages.xml"), "utf8"), /speakerboxgenius\.com\/validation\//);
  assert.match(readFileSync(join(out, "guides/index.html"), "utf8"), /<a href="\/guides\/" aria-current="page">Guides<\/a>/);
});

test("the validation page has the SPICE section, and its netlist links download the case's netlist", async () => {
  const { out } = await built();
  const html = readFileSync(join(out, "validation/index.html"), "utf8");
  const sp = JSON.parse(readFileSync(join(import.meta.dirname, "../docs/validation/spice.json"), "utf8"));
  assert.match(html, /<h2 id="spice">/);
  assert.match(html, new RegExp(`${sp.compared} circuit cases`));
  for (const o of sp.outputs) assert.ok(html.includes(`<td>${o.comparisons}</td>`), o.output);
  for (const c of sp.showcase) {
    assert.match(html, new RegExp(`href="/validation/spice/${c.id}\\.cir" download`));
    const cir = readFileSync(join(out, "validation/spice", `${c.id}.cir`), "utf8");
    assert.ok(cir.startsWith(`* ${c.id}:`), c.id);
  }
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
  const brandMap = readFileSync(join(out, "sitemap-drivers-dayton-audio.xml"), "utf8");
  assert.match(brandMap, /\/drivers\/dayton-audio\/dsa215-8\//);
  assert.match(brandMap, /\/drivers\/dayton-audio\/<\/loc>/);
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
  assert.ok(paths.includes("/changelog/"));
  assert.match(readFileSync(join(out, "changelog/index.html"), "utf8"), /<h2[^>]*>(Unreleased|\d+\.\d+\.\d+ \(\d{4}-\d{2}-\d{2}\))<\/h2>/);
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

test("home page: title, canonical, structured data, and its links go to built pages", async () => {
  const { paths } = await built();
  const index = readFileSync(new URL("../packages/web/index.html", import.meta.url), "utf8");
  assert.match(index, /<title>Speaker Box Genius: [^<]+<\/title>/);
  assert.match(index, /<link rel="canonical" href="https:\/\/speakerboxgenius.com\/" \/>/);
  const desc = /<meta name="description" content="([^"]+)"/.exec(index)?.[1] ?? "";
  assert.ok(desc.length >= 100 && desc.length <= 170, `description is ${desc.length} characters`);
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(index)![1]!) as { "@graph": { "@type": string }[] };
  assert.deepEqual(ld["@graph"].map((g) => g["@type"]), ["WebSite", "WebApplication"]);
  // The loading text (read by crawlers without JavaScript) and the app's footer link to site pages.
  const app = readFileSync(new URL("../packages/web/src/App.tsx", import.meta.url), "utf8");
  const links = [...`${index}\n${app}`.matchAll(/href="(\/[a-z0-9/-]*)"/g)].map((m) => m[1]!).filter((h) => h !== "/");
  assert.ok(links.length >= 10);
  for (const h of links) assert.ok(paths.includes(h), `${h} is not a built page`);
});

test("port length calculator page: form, live script hook, worked example that matches its text", async () => {
  const { out, paths } = await built();
  assert.ok(paths.includes("/calculators/port-length/"));
  const html = readFileSync(join(out, "calculators/port-length/index.html"), "utf8");
  assert.match(html, /<title>Port length calculator: [^<]+<\/title>/);
  assert.match(html, /<form id="pc-form"/);
  for (const id of ["pc-vb", "pc-fb", "pc-shape", "pc-d", "pc-w", "pc-h", "pc-n", "pc-ends", "pc-sub", "pc-driver", "pc-power", "pc-out", "pc-speed", "pc-open"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.doesNotMatch(html, /\{\{calc:/);
  // No Vite build in tests: no script tag, and no broken one.
  assert.doesNotMatch(html, /<script type="module"/);
  assert.match(readFileSync(join(out, "sitemap-pages.xml"), "utf8"), /\/calculators\/port-length\//);

  // The example's claims, in the page's words.
  const { portExample } = await import("./calculators.ts");
  const e = portExample();
  assert.ok(e.r75.r.fits && !e.r100.r.fits && !e.r150.r.fits && !e.r2x100.r.fits && !e.slot.r.fits);
  const ratio = e.r75.vp / 17;
  assert.ok(ratio > 2.75 && ratio < 3.4, `"three times the 17 m/s line": ${ratio.toFixed(2)}`);
  assert.ok(e.r100.vp > 17, "the 10 cm port isn't quiet");
  for (const k of ["r150", "r2x100", "slot"] as const) assert.ok(e[k].vp < 17, `${k} is quiet`);
  const { loadDb } = await import("./drivers.ts");
  const xmax = loadDb().drivers.find((d) => d.id === "dayton-audio/rss315hf-4")!.data.ts.xmax_mm;
  assert.equal(xmax, 14.3, "the page names a 14.3 mm Xmax");
  assert.ok(e.r100.x < xmax, "the cone stays inside Xmax at 250 W");
  assert.ok(e.slot.r.wallRange!.low < 25 && e.slot.r.wallRange!.high > 25);
});

test("passive radiator calculator page: form, worked example that matches its text", async () => {
  const { out, paths } = await built();
  assert.ok(paths.includes("/calculators/passive-radiator/"));
  const html = readFileSync(join(out, "calculators/passive-radiator/index.html"), "utf8");
  assert.match(html, /<title>Passive radiator calculator: [^<]+<\/title>/);
  assert.match(html, /<form id="prc-form"/);
  for (const id of ["prc-vb", "prc-fb", "prc-n", "prc-pr", "prc-mms", "prc-sd", "prc-vas", "prc-xmax", "prc-qms", "prc-max", "prc-driver", "prc-power", "prc-out", "prc-keep", "prc-open"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.doesNotMatch(html, /\{\{calc:/);
  assert.doesNotMatch(html, /<script type="module"/);
  assert.match(readFileSync(join(out, "sitemap-pages.xml"), "utf8"), /\/calculators\/passive-radiator\//);

  // The example's claims, in the page's words.
  const { prExample } = await import("./calculators.ts");
  const e = prExample();
  const row = (k: string) => e.rows.find((r) => r.key === k)!;
  const [rss1, rss2, ds1, ds2, ds4, sb1] = ["rss1", "rss2", "ds1", "ds2", "ds4", "sb1"].map(row);
  assert.equal(e.s.xmax_mm, 14.3);
  assert.ok(rss1!.ok && rss1!.c.prUse > 0.75 && rss1!.c.prUse < 1, `one RSS315-PR keeps up, past 75 %: ${rss1!.c.prUse}`);
  assert.ok(rss2!.ok && rss2!.c.prUse > 0.45 && rss2!.c.prUse < 0.55, `two use about half: ${rss2!.c.prUse}`);
  assert.ok(rss2!.c.f3! < rss1!.c.f3!, "two go deeper");
  assert.ok(rss2!.r.addedMass_g > rss1!.r.addedMass_g, "two PRs need more mass each, not half");
  assert.ok(!ds1!.ok && 1 / ds1!.c.prUse < 0.5, "one DS315-PR runs out with the cone at under half its Xmax");
  assert.ok(!ds2!.ok && ds2!.c.prUse > 1, "two DS315-PRs still run out first");
  assert.ok(ds4!.c.prUse < 1 && ds4!.r.massRatio > 3 && !ds4!.ok, "four keep up only with over 3 × mass");
  assert.equal(e.fewestDs, null, "no number of DS315-PRs up to six passes");
  assert.ok(sb1!.r.tooLow && sb1!.r.bareFb < 25, "SB34NRX-00 already tunes below 25 Hz");
  assert.ok(Math.abs(ds2!.c.vdRatio - rss1!.c.vdRatio) < 0.2, "two DS315-PRs have about the displacement ratio of one RSS315-PR");
  assert.ok(Math.cbrt(e.rows[0]!.i.vb_l * 1000) > 41 && Math.cbrt(e.rows[0]!.i.vb_l * 1000) < 43, "faces about 42 cm across");
});

test("calculators: the script is found through Vite's manifest", async () => {
  const { viteScript } = await import("./calculators.ts");
  const dir = tempDir("vite-");
  assert.equal(viteScript(dir, "src/calculators/portLength.ts"), null);
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(join(dir, ".vite"));
  writeFileSync(join(dir, ".vite/manifest.json"), JSON.stringify({ "src/calculators/portLength.ts": { file: "assets/calc-port-length-abc123.js" } }));
  assert.equal(viteScript(dir, "src/calculators/portLength.ts"), "/assets/calc-port-length-abc123.js");
});

test("the validation page has no duplicate ids", async () => {
  const { out } = await built();
  const html = readFileSync(join(out, "validation/index.html"), "utf8");
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dup, []);
  assert.match(html, /<h3>Equivalent circuit \(SPICE\)<\/h3>/);
  // The full run's "largest difference" lists wrap between figures: no unbreakable run of several.
  assert.doesNotMatch(html, /class="n">[^<]*;/);
  // Relative circuit-check differences carry % like their tolerances.
  assert.match(html, /<a href="#spice">Impedance<\/a><\/td><td>\d+<\/td><td>[^<]*<sup>[^<]*<\/sup>&nbsp;%<\/td><td>0\.1 %/);
});

test("driver pages: versions link each other and the opening line says what differs", async () => {
  const { out, paths } = await built();
  const html = readFileSync(join(out, "drivers/18-sound/18nlw4100-8ohm/index.html"), "utf8");
  assert.match(html, /<ul class="chips">/);
  assert.match(html, /<a href="\/drivers\/18-sound\/18nlw4100-4ohm\/">4 Ω<\/a>/);
  assert.match(html, /aria-current="page">8 Ω</);
  assert.match(html, /Re 4\.9 Ω \(4 Ω version 2\.5 Ω\)/);
  assert.match(html, /≈ 96 dB at 2\.83 V \(≈ 99\.6 dB\)/);
  assert.match(html, /a 97\.3 L ported box \(62\.2 L\)/);
  // The version has its chip; the similar list doesn't repeat it.
  const similar = html.slice(html.indexOf('id="similar"'));
  assert.doesNotMatch(similar.slice(0, similar.indexOf("</ul>")), /18nlw4100-4ohm/);

  // A driver with one version keeps the old page.
  const single = readFileSync(join(out, "drivers/dayton-audio/dsa215-8/index.html"), "utf8");
  assert.doesNotMatch(single, /class="chips"/);
  assert.match(single, /Suggested .* boxes worked out from its Thiele\/Small parameters/);

  // Every chip leads to a page that was built.
  const pathSet = new Set(paths);
  let chips = 0;
  for (const p of paths.filter((x) => /^\/?drivers\/[^/]+\/[^/]+\/(index\.html)?$/.test(x)).slice(0, 4000)) {
    const page = readFileSync(join(out, p.endsWith("index.html") ? p : join(p, "index.html")), "utf8");
    for (const m of page.matchAll(/<ul class="chips">(.*?)<\/ul>/g)) {
      for (const h of m[1]!.matchAll(/href="([^"]+)"/g)) {
        chips++;
        assert.ok(pathSet.has(h[1]!) || pathSet.has(`${h[1]}index.html`) || pathSet.has(h[1]!.slice(1)) || pathSet.has(`${h[1]!.slice(1)}index.html`), `chip link ${h[1]} was not built`);
      }
    }
  }
  assert.ok(chips > 100);
});

test("size names: slug and label keep up to two decimals", () => {
  assert.deepEqual([12, 6.5, 5.25, 8, 10].map(sizeSlug), ["12-inch", "6.5-inch", "5.25-inch", "8-inch", "10-inch"]);
  assert.deepEqual([12, 6.5, 5.25, 3.5].map(sizeLabel), ["12″", "6.5″", "5.25″", "3.5″"]);
  assert.equal(sizePath(6.5), "/drivers/6.5-inch/");
});

const readPage = (out: string, path: string) => readFileSync(join(out, path, "index.html"), "utf8");
/** The driver pages, as the build makes them (to count what the size pages should list). Simulated once and shared, like `built()`. */
let pagesOnce: DriverPage[] | null = null;
const allPages = () => (pagesOnce ??= (() => {
  const db = loadDb();
  const prs = db.passiveRadiators.map(prCandidate);
  return db.drivers.map((e) => designDriver(e, prs)).filter((p): p is DriverPage => p !== null);
})());

test("size pages: one per size with enough drivers, listing each driver once", async () => {
  const { out, paths } = await built();
  const pages = allPages();
  const hubs = hubSizes(pages);
  assert.ok(hubs.length >= 10);
  assert.ok(hubs.every((h) => h.count >= SIZE_HUB_MIN));
  for (const h of hubs) assert.ok(paths.includes(sizePath(h.inches)), `${sizePath(h.inches)} built`);
  // Sizes below the minimum have no page.
  const small = new Set(pages.map((p) => p.rec.size_in).filter((z): z is number => z !== undefined));
  for (const z of small) if (!hubs.some((h) => h.inches === z)) assert.ok(!paths.includes(sizePath(z)), `${sizePath(z)} not built`);
  for (const path of ["/drivers/12-inch/", "/drivers/6.5-inch/", "/drivers/5.25-inch/"]) assert.ok(paths.includes(path), path);

  const twelve = pages.filter((p) => p.rec.size_in === 12);
  const brands = new Set(twelve.map((p) => p.brandSlug)).size;
  const html = readPage(out, "drivers/12-inch");
  assert.match(html, /<h1>12-inch drivers: box designs<\/h1>/);
  assert.match(html, new RegExp(`<p class="lede">Suggested sealed, ported and passive radiator boxes for ${twelve.length} 12-inch drivers from ${brands} brands, .* Sorted by Fs\\.</p>`));
  const rowLinks = [...html.matchAll(/<tr><td><a href="(\/drivers\/[^"]+)">/g)].map((m) => m[1]!);
  assert.equal(rowLinks.length, twelve.length);
  assert.equal(new Set(rowLinks).size, rowLinks.length);
  for (const p of twelve) assert.ok(rowLinks.includes(`/drivers/${p.id}/`));
  for (const l of rowLinks) assert.ok(paths.includes(l), `${l} built`);
  // A chip for each kind, in the order of its section.
  const chipIds = [...html.matchAll(/<li><a href="#([\w-]+)">/g)].map((m) => m[1]!);
  assert.deepEqual(chipIds, [...html.matchAll(/<h2 id="([\w-]+)">/g)].map((m) => m[1]!));
  assert.ok(chipIds.includes("woofer"));
  assert.match(html, /<small>\d+<\/small>/);
  // Sorted by Fs within a kind.
  const woofers = html.slice(html.indexOf('id="woofer"'), html.indexOf("</table>", html.indexOf('id="woofer"')));
  const fs = [...woofers.matchAll(/<td class="n">([\d.]+) Hz<\/td>/g)].map((m) => Number(m[1]));
  assert.deepEqual(fs, [...fs].sort((a, b) => a - b));
  assert.match(html, /Other sizes: <a href="\/drivers\/2.5-inch\/">2.5″<\/a> · /);
  assert.doesNotMatch(html.slice(html.indexOf("Other sizes")), /href="\/drivers\/12-inch\/"/);
  assert.match(html, /"@type":"ItemList"/);
});

test("driver list: sizes by size and by brand, smallest first", async () => {
  const { out } = await built();
  const hubs = hubSizes(allPages());
  const html = readPage(out, "drivers");
  assert.match(html, /<h2 id="sizes">By size<\/h2><ul class="chips sizes">/);
  assert.match(html, /<h2 id="brands">By brand<\/h2><ul class="brands">/);
  const links = [...html.matchAll(/<li><a href="(\/drivers\/[\d.]+-inch\/)">/g)].map((m) => m[1]);
  assert.deepEqual(links, hubs.map((h) => sizePath(h.inches)));
});

test("driver pages: the opening line and similar drivers link the size page, and list at least four", async () => {
  const { out, paths } = await built();
  const html = readPage(out, "drivers/18-sound/18nlw4100-8ohm");
  assert.match(html, /<p class="lede"><a href="\/drivers\/18-inch\/">18-inch subwoofer<\/a>, 8 Ω\. The 8 Ω version/);
  assert.match(html, /<p class="more"><a href="\/drivers\/18-inch\/">All 18-inch drivers →<\/a><\/p>/);
  const single = readPage(out, "drivers/dayton-audio/dsa215-8");
  assert.match(single, /<p class="lede"><a href="\/drivers\/\d+-inch\/">/);

  const few: string[] = [];
  for (const p of paths.filter((x) => /^\/drivers\/[^/]+\/[^/]+\/$/.test(x))) {
    const page = readPage(out, p);
    const similar = page.slice(page.indexOf('id="similar"'));
    const n = (similar.slice(0, similar.indexOf("</ul>")).match(/<li>/g) ?? []).length;
    if (n < 4) few.push(`${p} (${n})`);
  }
  // Allowed only for a size with fewer than four drivers from other brands.
  const pages = allPages();
  const fewer = few.filter((f) => {
    const id = f.slice("/drivers/".length, f.indexOf("/ ("));
    const d = pages.find((p) => p.id === id)!;
    return pages.filter((p) => p.rec.size_in === d.rec.size_in && p.brandSlug !== d.brandSlug).length >= 4 || !d.rec.size_in;
  });
  assert.deepEqual(fewer, []);
  console.log(`${few.length} driver pages list fewer than four similar drivers`);
});

test("brand pages: the size links its page, and 5.25 is not rounded", async () => {
  const { out } = await built();
  const pages = allPages();
  const brand = pages.find((p) => p.rec.size_in === 5.25)!.brandSlug;
  const html = readPage(out, `drivers/${brand}`);
  assert.match(html, /<td><a href="\/drivers\/5.25-inch\/">5.25″<\/a><\/td>/);
  assert.doesNotMatch(html, /5\.3″/);
  const small = pages.find((p) => p.rec.size_in && !hubSizes(pages).some((h) => h.inches === p.rec.size_in));
  if (small) assert.match(readPage(out, `drivers/${small.brandSlug}`), new RegExp(`<td>${sizeLabel(small.rec.size_in!)}</td>`));
});

test("PR candidates keep a maker's Xmech as Xmech (so the driver pages' redlines say so)", () => {
  const db = loadDb();
  const mech = db.passiveRadiators.find((x) => x.data.params.xmax_mm === undefined && x.data.params.xmech_mm !== undefined)!;
  assert.equal((prCandidate(mech).params as { xmech?: boolean }).xmech, true);
  const lin = db.passiveRadiators.find((x) => x.data.params.xmax_mm !== undefined)!;
  assert.equal((prCandidate(lin).params as { xmech?: boolean }).xmech, undefined);
});
