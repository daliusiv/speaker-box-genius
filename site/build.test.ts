import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { askAi, askAiPrompt, build, contents, GOATCOUNTER, markdown, parsePage, resolveExamples, topHeadings, withAskAi } from "./build.ts";
import { cardData, COMPACT, DEEP_MIN_GAIN_HZ, describe, designDriver, driverContent, driverState, driverTitle, hubSizes, loadDb, mergeNotes, PAGE_MAX_L, prCandidate, PR_MAX_SD, PR_OTHERS, prsFor, typeLabel, SIZE_HUB_MIN, sizeLabel, sizePath, sizeSlug, withPr, type DriverPage } from "./drivers.ts";
import { chart } from "./chart.ts";
import { cardSvg } from "./og.ts";
import { twinPath } from "./aiDocs.ts";
import { CALCULATORS } from "./calculators.ts";
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
  assert.doesNotMatch(markdown("a <script>x</script>"), /<script>/i);
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
  assert.match(html, /<a href="\/validation\/" class="wider" aria-current="page">Validation<\/a>/);
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
  assert.deepEqual(lds[0].author, { "@type": "Organization", "@id": "https://speakerboxgenius.com/#organization", name: "Speaker Box Genius", url: "https://speakerboxgenius.com/", logo: "https://speakerboxgenius.com/icons/icon-512.png", sameAs: ["https://github.com/daliusiv/speaker-box-genius"] });
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
  // The publisher ties the name to the site and repo; the alternative pages are about the app (same @ids as the app's index.html).
  const alt = readFileSync(join(out, "winisd-alternative/index.html"), "utf8");
  const altLd = JSON.parse(alt.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
  assert.equal(altLd.publisher["@id"], "https://speakerboxgenius.com/#organization");
  assert.deepEqual(altLd.publisher.sameAs, ["https://github.com/daliusiv/speaker-box-genius"]);
  assert.equal(altLd.about["@type"], "WebApplication");
  assert.equal(altLd.about["@id"], "https://speakerboxgenius.com/#app");
  assert.match(alt, /<h2 id="questions">Questions<\/h2>/);
  const appHtml = readFileSync(new URL("../packages/web/index.html", import.meta.url), "utf8");
  for (const id of ["#organization", "#app"]) assert.ok(appHtml.includes(`"@id": "https://speakerboxgenius.com/${id}"`), `index.html defines ${id}`);
  assert.match(appHtml, /href="\/hornresp-alternative\/"/);
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

test("a PR box lists the next PRs that work in it, each opening the app with that PR in place", () => {
  const db = loadDb();
  const prs = db.passiveRadiators.map(prCandidate);
  const e = db.drivers.find((x) => x.id === "dayton-audio/dsa215-8")!;
  const p = designDriver(e, prs)!;
  assert.ok(p.pr && p.prOthers && p.prOthers.length > 0 && p.prOthers.length <= PR_OTHERS);
  const names = p.prOthers.map((o) => o.prName);
  assert.equal(new Set(names).size, names.length, "one row per PR");
  assert.ok(!names.includes(p.pr.name), "not the chosen PR");
  // Each is a database PR with its own parameters, as the PR finder would put it in the box.
  for (const o of p.prOthers) assert.deepEqual(o.params, prs.find((c) => c.name === o.prName)!.params);
  const swapped = withPr(p.state, p.prOthers[0]!);
  const pr = swapped.designs.find((d) => d.kind === "pr") as any;
  assert.equal(pr.prName, p.prOthers[0]!.prName);
  assert.equal(pr.vb_l, (p.state.designs.find((d) => d.kind === "pr") as any).vb_l, "same box");
  assert.deepEqual(swapped.designs.filter((d) => d.kind !== "pr"), p.state.designs.filter((d) => d.kind !== "pr"));
  const links = { all: "https://speakerboxgenius.com/#z=x", related: [], prOthers: p.prOthers.map((_, i) => `https://speakerboxgenius.com/#z=pr${i}`) };
  const html = driverContent(p, links, chart).content;
  const line = html.match(/<span class="pr-alt">Other PRs that work here: (.*?)<\/span>/)?.[1];
  assert.ok(line, "the PR row has the line");
  assert.equal((line.match(/<a href="https:\/\/speakerboxgenius\.com\/#z=pr\d" rel="nofollow">\d × [^<]+<\/a> \((\d+ g( each)?|no added mass)\)/g) ?? []).length, p.prOthers.length);
  // Without the links (or none to list) the row is as before.
  assert.doesNotMatch(driverContent(p, { all: links.all, related: [] }, chart).content, /pr-alt/);
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
  // A high-Qts mid-bass driver (Qts 0.55): its ported and PR boxes are kept, no bigger than twice Vas when QB3 is over it.
  const midbass = db.drivers.find((x) => x.id === "beyma/12cmv3");
  if (midbass) {
    const p = designDriver(midbass, prs)!;
    assert.ok(p.designs.some((d) => d.design.kind === "vented"), p.notes.join("; "));
    assert.ok(p.designs.every((d) => d.design.preset !== COMPACT || d.design.vb_l <= 2.01 * midbass.data.ts.vas_l!));
    assert.ok(!p.notes.some((n) => /suits a sealed box/.test(n)), p.notes.join("; "));
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
  assert.ok(app.includes(GOATCOUNTER), "the app's index.html has the same counter");
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
  // Illustrations: the card's title comes first (above the picture on phones), then the picture, lazy and sized.
  assert.match(html, /<li><a href="\/guides\/port-chuffing\/">[^<]+<\/a><img class="thumb" src="\/guides\/img\/guides\/port-chuffing\.svg" alt="" width="1200" height="630" loading="lazy"><p>/);
  assert.ok(existsSync(join(out, "guides/img/guides/port-chuffing.svg")));
  const chuff = readFileSync(join(out, "guides/port-chuffing/index.html"), "utf8");
  assert.equal((chuff.match(/<figure class="hero">/g) ?? []).length, 1);
  assert.match(chuff, /<p class="lede">[\s\S]*?<\/p>\n<figure class="hero"><img src="\/guides\/img\/guides\/port-chuffing\.svg" alt="[^"]{20,}"/);
  assert.ok(chuff.indexOf('class="hero"') < chuff.indexOf('class="cta"'), "banner before the open buttons");
  assert.doesNotMatch(chuff.match(/<section class="related">[\s\S]*?<\/section>/)![0], /<img/);
  // Every guide card has its picture.
  assert.equal((html.match(/<img class="thumb"/g) ?? []).length, pages.length);
});

test("every guide has its own share card: an image or a chart, never the site's", () => {
  for (const f of readdirSync(join(import.meta.dirname, "pages")).filter((f) => f.endsWith(".md"))) {
    assert.ok(parsePage(readFileSync(join(import.meta.dirname, "pages", f), "utf8"), f).image, `${f}: set "image:" (a chart: or an image in site/img)`);
  }
});

test("home page: title, canonical, structured data, and its links go to built pages", async () => {
  const { paths } = await built();
  const index = readFileSync(new URL("../packages/web/index.html", import.meta.url), "utf8");
  assert.match(index, /<title>Speaker Box Genius: [^<]+<\/title>/);
  assert.match(index, /<link rel="canonical" href="https:\/\/speakerboxgenius.com\/" \/>/);
  const desc = /<meta name="description" content="([^"]+)"/.exec(index)?.[1] ?? "";
  assert.ok(desc.length >= 100 && desc.length <= 170, `description is ${desc.length} characters`);
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(index)![1]!) as { "@graph": { "@type": string }[] };
  assert.deepEqual(ld["@graph"].map((g) => g["@type"]), ["WebSite", "Organization", "WebApplication"]);
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

test("open baffle calculator page: form, worked example from the same code, hub card and driver-page lines", async () => {
  const { out, paths } = await built();
  assert.ok(paths.includes("/calculators/open-baffle/"));
  const html = readFileSync(join(out, "calculators/open-baffle/index.html"), "utf8");
  assert.match(html, /<h1>Open baffle calculator<\/h1>/);
  assert.match(html, /<form id="ob-form"[^>]*data-driver-id="sb-acoustics\/sb34nrx75-16"/);
  for (const id of ["ob-metric", "ob-imperial", "ob-mode-have", "ob-mode-peak", "ob-frame", "ob-w", "ob-h", "ob-x", "ob-y", "ob-depth", "ob-fp", "ob-ar", "ob-t", "ob-driver", "ob-ts", "ob-n", "ob-power", "ob-out", "ob-chart", "ob-open", "ob-copy"])
    assert.match(html, new RegExp(`id="${id}"`), id);
  // Element order: units, mode, frame, board, peak fields, thickness, driver, power, results, chart, actions, then the text.
  // Page order, leaving out the "On this page" list (it repeats the section titles).
  const page = html.replace(/<nav class="toc"[\s\S]*?<\/nav>/, "");
  const at = (x: string) => page.indexOf(x);
  const order = ['id="ob-metric"', 'id="ob-mode-have"', 'name="ob-framepick"', 'id="ob-w"', 'id="ob-fp"', 'id="ob-t"', 'id="ob-driver"', 'id="ob-power"', 'id="ob-out"', 'id="ob-chart"', 'id="ob-open"', "How it's worked out", "Worked example", "Related guides"].map(at);
  assert.ok(order.every((n, i) => n > 0 && (i === 0 || n > order[i - 1]!)), `element order: ${order}`);
  assert.match(html, /Open this baffle in the simulator/);
  assert.doesNotMatch(html, /\{\{calc:/);
  assert.match(html, /<figure class="guide-chart">/, "the worked example's chart");
  // The example's numbers are the calculator's own.
  const { obCalcRun, OB_CALC } = await import("./examples.ts");
  const p = obCalcRun(OB_CALC.driverIds[0]!);
  const r = obCalcRun(OB_CALC.driverIds[1]!);
  assert.equal(p.suits, "passive");
  assert.equal(r.suits, "dsp");
  for (const v of [`${p.fPeak.toFixed(0)} Hz / ${p.fNull.toFixed(0)} Hz`, `${p.f3Eq!.toFixed(1)} Hz`, `${r.f3Eq!.toFixed(1)} Hz`, "an open baffle without EQ", "an open baffle with DSP EQ"]) assert.ok(html.includes(v), v);
  // Claims in the text: same board, nearly the same peak; the high-Qts driver goes deeper without EQ.
  assert.ok(Math.abs(p.fPeak / r.fPeak - 1) < 0.03, "nearly the same peak");
  assert.ok(p.f3! < r.f3!, "the SB34NRX75-16 goes deeper without EQ");
  assert.ok(p.lossEq! > p.loss! && r.lossEq! > r.loss!, "the EQ wins bass back");
  // The hub card, with its picture, and its line.
  const hub = readFileSync(join(out, "calculators/index.html"), "utf8");
  assert.match(hub, /<li><a href="\/calculators\/open-baffle\/">Open baffle calculator<\/a><img class="thumb" src="\/guides\/img\/calculators\/open-baffle\.svg"/);
  assert.match(hub, /You're building an open baffle/);
  // Driver pages: the open baffle line by the picker's Suits rules, linking the calculator for that driver.
  const pcs = readFileSync(join(out, "drivers/dayton-audio/pcs12-4/index.html"), "utf8");
  assert.match(pcs, /<strong>Open baffle:<\/strong> suits one without EQ \(Qts 0\.67, Fs 30 Hz: its own level at 40 Hz is −1\.6 dB\)\. <a href="\/calculators\/open-baffle\/\?d=dayton-audio%2Fpcs12-4">Size its baffle →<\/a>/);
  // Qts 0.64 with Fs 34 Hz: −2.7 dB of its own at 40 Hz, no better than a DSP woofer: no longer "passive".
  assert.doesNotMatch(readFileSync(join(out, "drivers/peerless/sls-p830669/index.html"), "utf8"), /suits one without EQ/);
  const rss = readFileSync(join(out, "drivers/dayton-audio/rss315hf-4/index.html"), "utf8");
  assert.match(rss, /<strong>Open baffle:<\/strong> suits one with DSP EQ \(Qts 0\.39, Xmax 14\.3 mm, Fs 24\.2 Hz\)/);
  const { openBaffleLine } = await import("./drivers.ts");
  assert.equal(openBaffleLine("x/y", 60, 0.4, 4), "", "neither: no line");
  assert.equal(openBaffleLine("x/y", 30, 0.4, 6), "", "too little travel for EQ: no line");
});

test("calculator pages: a live chart's tip and cursor are styled (a tap on a phone left the tip's table unstyled above the chart)", async () => {
  const { out } = await built();
  const { CALC_PAGES } = await import("./calculators.ts");
  for (const c of CALC_PAGES) {
    const html = readFileSync(join(out, c.path.slice(1), "index.html"), "utf8");
    const css = html.replace(/\s*([{}:;,()])\s*/g, "$1");
    for (const rule of [/\.chart-tip\{[^}]*position:absolute/, /@media\(max-width:860px\)\{\.chart-tip,\.chart-hint\{display:none/, /\.tip-table\{/, /\.cursor-dot\{/])
      assert.match(css, rule, `${c.path}: ${rule}`);
  }
});

test("sealed box calculator page: form, worked example that matches its text", async () => {
  const { out, paths } = await built();
  assert.ok(paths.includes("/calculators/sealed-box/"));
  const html = readFileSync(join(out, "calculators/sealed-box/index.html"), "utf8");
  assert.match(html, /<title>Sealed box calculator: [^<]+<\/title>/);
  assert.match(html, /<h1>Sealed box calculator<\/h1>/);
  assert.match(html, /<form id="sc-form"[^>]*data-driver-id="dayton-audio\/rss315hf-4"/);
  for (const id of ["sc-metric", "sc-imperial", "sc-driver", "sc-ts", "sc-n", "sc-power", "sc-rated", "sc-mode-box", "sc-mode-qtc", "sc-qtc", "sc-vb", "sc-out", "sc-chart", "sc-open", "sc-copy"]) assert.match(html, new RegExp(`id="${id}"`), id);
  // Element order: units, driver, T/S by hand, drivers and power, mode, Qtc chips, results, chart, actions, then the text.
  // Page order, leaving out the "On this page" list (it repeats the section titles).
  const page = html.replace(/<nav class="toc"[\s\S]*?<\/nav>/, "");
  const at = (s: string) => page.indexOf(s);
  const order = ['id="sc-metric"', 'id="sc-driver"', 'id="sc-ts"', 'id="sc-n"', 'id="sc-power"', 'id="sc-mode-box"', 'name="sc-qtcpick"', 'id="sc-out"', 'id="sc-chart"', 'id="sc-open"', "How the box is worked out", "Worked example"].map(at);
  assert.ok(order.every((n, i) => n > 0 && (i === 0 || n > order[i - 1]!)), `element order: ${order}`);
  assert.match(html, /name="sc-qtcpick" value="0.707" checked/);
  assert.doesNotMatch(html, /\{\{calc:/);
  assert.doesNotMatch(html, /<script type="module"/);
  assert.match(readFileSync(join(out, "sitemap-pages.xml"), "utf8"), /\/calculators\/sealed-box\//);
  // The worked example's chart is the app's, with its three boxes; the page links both guides.
  assert.match(html, /<figure class="guide-chart">/);
  assert.match(html, /Qtc 0\.577, 75\.9 L/);
  assert.match(html, /href="\/guides\/sealed-qtc\/"/);
  assert.match(html, /href="\/guides\/sealed-vs-ported\/"/);

  // The example's claims, in the page's words.
  const { sealedExample } = await import("./calculators.ts");
  const { loadDb } = await import("./drivers.ts");
  const ts = loadDb().drivers.find((d) => d.id === "dayton-audio/rss315hf-4")!.data.ts;
  assert.deepEqual([ts.fs, ts.vas_l, ts.xmax_mm], [24.2, 84.1, 14.3], "the page names Fs 24.2 Hz, Vas 84.1 L, Xmax 14.3 mm");
  assert.ok(Math.abs((ts.qes! * ts.qms!) / (ts.qes! + ts.qms!) - 0.39) < 0.005, "and a Qts of 0.39");
  const [a, b, c] = sealedExample().map((e) => e.r);
  assert.ok(a!.vb_l / b!.vb_l > 1.9 && a!.vb_l / b!.vb_l < 2.05, "the biggest box is nearly twice the middle one");
  assert.ok(a!.vb_l / c!.vb_l > 3.5 && a!.vb_l / c!.vb_l < 4, "and almost four times the smallest");
  assert.ok(Math.abs(a!.f3! - b!.f3!) < 0.5 && c!.f3! - a!.f3! < 5, "F3 barely moves");
  assert.ok(c!.f10! - a!.f10! > 7, "F10 drops by 8 Hz");
  assert.ok(a!.spl30! > b!.spl30! && b!.spl30! > c!.spl30!, "the bigger box is louder at 30 Hz");
  assert.ok(a!.x_mm! > a!.xmax_mm && b!.x_mm! < b!.xmax_mm && c!.x_mm! < c!.xmax_mm, "only the biggest box's cone goes past its Xmax at 250 W");
  assert.ok(a!.x_mm! - a!.xmax_mm < 0.5, "and only just");
  assert.ok(a!.x_mm! > b!.x_mm! && b!.x_mm! > c!.x_mm!, "the biggest box needs the most cone");
  assert.ok(Math.abs(b!.qtc! - 0.707) < 0.003 && b!.qtc! < 0.707, "it reads a hair under 0.707");
  // The 2 × Vas paragraph: Qts 0.68 needs over 10 × Vas for 0.707, and the preset's Qtc is Qts × √1.5 (0.83).
  const { sealedVolumeForAlignment } = await import("../packages/engine/src/index.ts");
  const vb = sealedVolumeForAlignment({ fs: 30, qms: 6, qes: 0.767, vas_l: 100, style: "winisd" } as never, 0.707)!;
  assert.ok(vb / 100 > 10, `over 10 × Vas: ${vb / 100}`);
  assert.equal((0.68 * Math.sqrt(1.5)).toFixed(2), "0.83");
});

test("ported box calculator page: form, worked example that matches its text", async () => {
  const { out, paths } = await built();
  assert.ok(paths.includes("/calculators/ported-box/"));
  const html = readFileSync(join(out, "calculators/ported-box/index.html"), "utf8");
  assert.match(html, /<title>Ported box calculator: [^<]+<\/title>/);
  assert.match(html, /<h1>Ported box calculator<\/h1>/);
  assert.match(html, /<form id="vc-form"[^>]*data-driver-id="dayton-audio\/rss315hf-4"/);
  for (const id of ["vc-metric", "vc-imperial", "vc-driver", "vc-ts", "vc-n", "vc-power", "vc-rated", "vc-chips", "vc-align", "vc-other", "vc-vb", "vc-fb", "vc-out", "vc-chart", "vc-open", "vc-copy"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.doesNotMatch(html, /\{\{calc:/);
  assert.doesNotMatch(html, /<script type="module"/);
  assert.match(readFileSync(join(out, "sitemap-pages.xml"), "utf8"), /\/calculators\/ported-box\//);
  // Order: driver, number of drivers and power, alignment chips, other, results, chart, actions, text, example.
  // Page order, leaving out the "On this page" list (it repeats the section titles).
  const page = html.replace(/<nav class="toc"[\s\S]*?<\/nav>/, "");
  const at = (s: string) => page.indexOf(s);
  const order = ['id="vc-driver"', 'id="vc-n"', 'id="vc-power"', 'id="vc-chips"', 'id="vc-other"', 'id="vc-out"', 'id="vc-chart"', 'id="vc-open"', "How the box is worked out", "Worked example"];
  for (let i = 1; i < order.length; i++) assert.ok(at(order[i - 1]!) >= 0 && at(order[i - 1]!) < at(order[i]!), `${order[i - 1]} before ${order[i]}`);
  // The worked example's chart is the app's, drawn at build.
  assert.match(html, /<figure class="chart" data-chart="response">[\s\S]*?<svg viewBox="0 0 640 \d+" role="img" aria-label="Relative response at 250 W/);
  // Cross-links from the page.
  for (const href of ["/calculators/port-length/", "/guides/port-chuffing/", "/guides/sealed-vs-ported/", "/calculators/sealed-box/"]) assert.match(html, new RegExp(`href="${href}"`), href);

  // The example's claims, in the page's words.
  const { portedExample } = await import("./calculators.ts");
  const { portExample } = await import("./calculators.ts");
  const e = portedExample();
  const row = (k: string) => e.rows.find((r) => r.key === k)!;
  const [qb3, c4, bb4] = ["qb3", "c4", "bb4"].map(row);
  assert.equal(e.rows.length, 3, "QB3, C4 and BB4");
  assert.equal(e.s.xmax_mm, 14.3, "the page names a 14.3 mm Xmax");
  assert.equal(e.s.power, 250);
  assert.deepEqual([qb3!.chip.vb_l, qb3!.chip.fb], [75.6, 24.4], "WinISD's QB3 for this driver");
  assert.ok(c4!.chip.db < 0.1 && Math.abs(c4!.chip.vb_l - qb3!.chip.vb_l) < 1 && Math.abs(c4!.r.f3! - qb3!.r.f3!) < 0.5, "C4 is QB3's box with a tiny ripple");
  assert.ok(bb4!.chip.vb_l / qb3!.chip.vb_l > 0.72 && bb4!.chip.vb_l / qb3!.chip.vb_l < 0.8, "BB4 is nearly a quarter smaller");
  assert.ok(bb4!.r.f3! > qb3!.r.f3! + 2, "and gives up bass");
  assert.ok(bb4!.chip.db > 0 && bb4!.chip.db < 0.5, "with a small peak");
  for (const r of e.rows) {
    assert.ok(r.r.x! < e.s.xmax_mm, `${r.key}: the cone stays inside Xmax`);
    assert.ok(r.r.vp! > 17 && !r.r.quiet, `${r.key}: the port is over the 17 m/s line`);
    assert.equal(r.r.design.shape, "round");
  }
  assert.ok(qb3!.r.design.flare_cm > 0 && qb3!.r.design.diameter_cm === 7.5, "a flared 7.5 cm port");
  // A 10 cm tube doesn't fit straight in the QB3 box (the page says it's too long).
  const { portLengthForFb } = await import("../packages/engine/src/index.ts");
  const { portRoom_cm } = await import("../packages/web/src/sim.ts");
  const len = portLengthForFb(qb3!.chip.vb_l, { shape: "round", diameter_cm: 10, length_cm: 10 }, qb3!.chip.fb);
  assert.ok(len > portRoom_cm(qb3!.chip.vb_l, 10), `a 10 cm tube needs ${len.toFixed(1)} cm`);
  assert.ok(!portExample().r100.r.fits, "and the port length page's example agrees");
});

test("subwoofer box calculator page: form, worked example that matches its text, linked from the hub and two guides", async () => {
  const { out, paths } = await built();
  assert.ok(paths.includes("/calculators/subwoofer-box/"));
  const html = readFileSync(join(out, "calculators/subwoofer-box/index.html"), "utf8");
  assert.match(html, /<title>Subwoofer box calculator: compact, balanced and deep boxes for your sub[^<]*<\/title>/);
  assert.match(html, /<form id="sb-form"[^>]*data-driver-id="dayton-audio\/rss315hf-4"/);
  for (const id of ["sb-imperial", "sb-size", "sb-type", "sb-driver", "sb-power", "sb-rated", "sb-ts", "sb-picks", "sb-note", "sb-chart", "sb-open", "sb-copy"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /name="sb-size-chip" value="12" checked/);
  assert.match(html, /name="sb-t" value="ported" checked/);
  assert.match(html, /Open Balanced in the simulator/);
  assert.doesNotMatch(html, /\{\{calc:/);
  assert.doesNotMatch(html, /<script type="module"/);
  assert.match(html, /class="chart/, "the worked example's chart is drawn");
  assert.match(readFileSync(join(out, "sitemap-pages.xml"), "utf8"), /\/calculators\/subwoofer-box\//);
  const { CALCULATORS } = await import("./calculators.ts");
  assert.equal(CALCULATORS[0]!.path, "/calculators/subwoofer-box/", "its card comes first");
  assert.match(readFileSync(join(out, "calculators/index.html"), "utf8"), /Subwoofer box calculator/);
  for (const g of ["guides/car-subwoofer", "guides/one-15-vs-two-10s"]) assert.match(readFileSync(join(out, g, "index.html"), "utf8"), /href="\/calculators\/subwoofer-box\/"/, g);

  // The example's claims, in the page's words.
  const { subwooferExample } = await import("./calculators.ts");
  const e = subwooferExample();
  const { KIND_COLOR_NAMES } = await import("../packages/web/src/palette.ts");
  assert.deepEqual(KIND_COLOR_NAMES.vented.slice(0, 3), ["orange", "light orange", "dark orange"], "the caption's colour names");
  assert.equal(e.s.power, 250);
  assert.equal(e.s.xmax_mm, 14.3, "the page names a 14.3 mm Xmax");
  const p = e.ported;
  assert.deepEqual([p.compact.vb_l, p.balanced.vb_l, p.deep.vb_l], [58.1, 75.6, 113.4]);
  assert.ok(Math.abs(p.deep.f3! - 20.3) < 0.2 && Math.abs(p.deep.fb! - 21) < 0.5);
  for (const k of ["compact", "balanced", "deep"] as const) assert.ok(p[k].air! > 17, `${k} chuffs at 250 W`);
  assert.ok(p.balanced.spl30! > p.compact.spl30! && p.balanced.spl30! > p.deep.spl30!, "Balanced is loudest at 30 Hz");
  assert.ok(p.deep.f3! < p.balanced.f3! && p.balanced.f3! < p.compact.f3!);
  assert.ok(Math.abs(p.compact.f3! - p.balanced.f3! - 3.5) < 0.1, "Compact costs about 3.5 Hz of F3");
  assert.ok(e.sealed.deep.x! > e.s.xmax_mm && e.sealed.balanced.x! < e.s.xmax_mm, "only the deep sealed box passes Xmax");
  assert.ok(Math.abs(e.sealed.balanced.f3! - p.balanced.f3! - 21) < 1, "sealed gives up about 21 Hz");
  assert.ok(Math.abs(e.sealed.deep.f3! - e.sealed.balanced.f3!) < 0.5, "sealed F3 barely moves with size");
  assert.ok(e.sealed.deep.spl30! > e.sealed.balanced.spl30!);
  // Every port the app's picker tries (tubes, two tubes, flared, slots that fit) is over the line at 250 W.
  const { bestVentedPort } = await import("../packages/web/src/presets.ts");
  const { newDesign } = await import("../packages/web/src/state.ts");
  for (const k of ["compact", "balanced", "deep"] as const) {
    const d = p[k].design as import("../packages/web/src/state.ts").VentedDesign;
    const best = bestVentedPort({ ...e.s, designs: [] }, newDesign("vented", []) as never, d.vb_l, d.targetFb);
    assert.ok(best && !best.quiet, `${k}: no port the picker tries stays quiet`);
  }
});

test("box volume calculator page: form in the planned order, worked example that matches its text, hub card and guide links", async () => {
  const { out, paths } = await built();
  assert.ok(paths.includes("/calculators/box-volume/"));
  const html = readFileSync(join(out, "calculators/box-volume/index.html"), "utf8");
  assert.match(html, /<title>Speaker box volume calculator: net litres for any shape, minus driver, port and bracing[^<]*<\/title>/);
  assert.match(html, /<h1>Box volume calculator<\/h1>/);
  assert.match(html, /<form id="bv-form"[^>]*data-driver-id="dayton-audio\/rss315hf-4"/);
  for (const id of ["bv-metric", "bv-imperial", "bv-mode-net", "bv-mode-size", "bv-shape", "bv-sizing", "bv-target", "bv-ratio", "bv-w", "bv-h", "bv-d", "bv-dia", "bv-len", "bv-tw", "bv-td", "bv-bw", "bv-bd", "bv-lip", "bv-wall", "bv-cap", "bv-sw", "bv-svg", "bv-caption", "bv-done", "bv-parts-total", "bv-driver", "bv-driver-status", "bv-n", "bv-dd", "bv-pr", "bv-np", "bv-pd", "bv-pc", "bv-pt", "bv-pdia", "bv-pw", "bv-ph", "bv-pl", "bv-pwt", "bv-br", "bv-o", "bv-out", "bv-open", "bv-copy", "bv-hint"])
    assert.match(html, new RegExp(`id="${id}"`), id);
  for (const shape of ["Box", "Car wedge", "Cylinder", "Sphere", "Tapered"]) assert.match(html, new RegExp(`name="bv-shape-chip" value="[a-z]+"[^>]*><span>${shape}</span>`), shape);
  assert.match(html, /name="bv-shape-chip" value="box" checked/);
  assert.match(html, /<span class="calc-est">≈ 3\.01 L each, estimated<\/span>/, "the example driver's displacement is marked as an estimate");
  assert.doesNotMatch(html, /\{\{calc:/);
  assert.match(readFileSync(join(out, "sitemap-pages.xml"), "utf8"), /\/calculators\/box-volume\//);
  // The plan's element order: units, work out, shape, sizing, sizes | outline, done, inside the box, result, actions, hint, text, example.
  // Page order, leaving out the "On this page" list (it repeats the section titles).
  const page = html.replace(/<nav class="toc"[\s\S]*?<\/nav>/, "");
  const at = (s: string) => page.indexOf(s);
  const order = ['id="bv-metric"', 'id="bv-mode-net"', 'name="bv-shape-chip"', 'id="bv-sizing"', 'class="calc-size"', 'id="bv-w"', 'id="bv-wall"', 'class="calc-shape"', 'id="bv-done"', 'class="calc-part"', 'id="bv-driver"', 'id="bv-n"', 'id="bv-dd"', 'id="bv-pr"', 'id="bv-np"', 'id="bv-pd"', 'id="bv-pc"', 'id="bv-pt"', 'id="bv-pdia"', 'id="bv-pl"', 'id="bv-pwt"', 'id="bv-br"', 'id="bv-o"', 'id="bv-out"', 'id="bv-open"', 'id="bv-copy"', 'id="bv-hint"', "How it's worked out", "Worked example"];
  for (let i = 1; i < order.length; i++) assert.ok(at(order[i - 1]!) >= 0 && at(order[i - 1]!) < at(order[i]!), `${order[i - 1]} before ${order[i]}`);
  for (const href of ["/guides/shaped-cabinets/", "/guides/box-stuffing/", "/calculators/port-length/", "/calculators/sealed-box/"]) assert.match(html, new RegExp(`href="${href}"`), href);

  // The worked example's numbers, from the calculator's own sums, as the shaped-cabinets guide gives them.
  const { boxVolumeExample } = await import("./calculators.ts");
  const e = boxVolumeExample();
  assert.deepEqual([e.tube.dia, e.tube.len, e.tube.wall, e.tube.cap, e.tube.dd], [36.8, 98.5, 6, 38, 3.01]);
  assert.equal(e.tubeSized.len, 98.5, "sizing the tube from 100 cm lands on the guide's length");
  assert.deepEqual([e.t.r.gross_l.toFixed(2), e.t.r.net_l.toFixed(2)], ["90.48", "83.45"]);
  assert.deepEqual([e.box.w, e.box.h, e.box.d], [49.3, 79.7, 30.4]);
  assert.deepEqual([e.b.r.gross_l.toFixed(2), e.b.r.net_l.toFixed(1)], ["93.20", "83.4"]);
  assert.equal(e.wg.r.gross_l.toFixed(2), "75.60", "the guide's car wedge");
  for (const v of ["90.48", "83.45", "49.3 × 79.7 × 30.4", "93.20", "75.60"]) assert.ok(html.includes(v), v);

  // The hub: the card after Ported box (and Open baffle), before Port length, and its "Which one do I need?" line.
  const { CALCULATORS } = await import("./calculators.ts");
  const i = CALCULATORS.findIndex((c) => c.path === "/calculators/box-volume/");
  assert.equal(CALCULATORS[i - 1]!.path, "/calculators/open-baffle/");
  assert.equal(CALCULATORS[i - 2]!.path, "/calculators/ported-box/");
  assert.equal(CALCULATORS[i + 1]!.path, "/calculators/port-length/");
  assert.ok(CALCULATORS[i]!.isNew);
  const hub = readFileSync(join(out, "calculators/index.html"), "utf8");
  assert.ok(hub.indexOf("You know the box you'll build") > 0 && hub.indexOf("You know the box you'll build") < hub.indexOf("You have a box and want to tune it"), "the hub's line, before tuning");
  for (const g of ["guides/shaped-cabinets", "guides/car-subwoofer", "guides/box-stuffing", "guides/port-tuning"]) assert.match(readFileSync(join(out, g, "index.html"), "utf8"), /href="\/calculators\/box-volume\/"/, g);
});

test("calculators hub: every calculator listed, in the nav and footer of every page, with breadcrumbs on each calculator", async () => {
  const { out, paths } = await built();
  assert.ok(paths.includes("/calculators/"), "the hub is built (/calculators/ used to be an error)");
  const html = readFileSync(join(out, "calculators/index.html"), "utf8");
  const { CALCULATORS } = await import("./calculators.ts");
  for (const c of CALCULATORS) {
    assert.ok(paths.includes(c.path), `${c.path} is built`);
    assert.match(html, new RegExp(`<li><a href="${c.path}">`), `hub card for ${c.path}`);
    const page = readFileSync(join(out, c.path, "index.html"), "utf8");
    assert.match(page, /"@type":"BreadcrumbList"/, `${c.path} has breadcrumbs`);
    assert.match(page, /<a href="\/calculators\/" aria-current="page">Calculators<\/a>/, `${c.path}: Calculators is current in the nav`);
    // One primary (Open) and a Copy link button in one action row.
    assert.match(page, /<div class="calc-actions"><a id="[a-z]+-open" class="button"[^>]*>[^<]+<\/a><button id="[a-z]+-copy" class="ghost"/);
  }
  assert.match(html, /"@type":"CollectionPage"/);
  assert.match(html, /<a href="\/calculators\/" aria-current="page">Calculators<\/a>/);
  // Every page's top bar: Calculators shown at all widths (no class), Validation hidden on phones.
  const guides = readFileSync(join(out, "guides/index.html"), "utf8");
  assert.match(guides, /<a href="\/calculators\/">Calculators<\/a><a href="\/validation\/" class="wider">Validation<\/a>/);
  assert.doesNotMatch(guides, /Port calculator/);
  assert.match(guides, /<footer>[\s\S]*<a href="\/calculators\/">Calculators<\/a>[\s\S]*<\/footer>/);
  assert.match(readFileSync(join(out, "sitemap-pages.xml"), "utf8"), /speakerboxgenius\.com\/calculators\/<\/loc>/);
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
  assert.doesNotMatch(listOf(html, "similar"), /18nlw4100-4ohm/);
  assert.doesNotMatch(sectionOf(html, "substitutes"), /18nlw4100-4ohm/);

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
  // The smallest size with a page comes first (2″ since the BRAX, HELIX and GLADEN imports).
  const first = hubs[0]!.inches;
  assert.match(html, new RegExp(`Other sizes: <a href="${sizePath(first).replace(/[./]/g, "\\$&")}">${String(first).replace(".", "\\.")}″</a> · `));
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

/** A page's section from its h2 to the next h2 (empty when it has none). */
const sectionOf = (page: string, id: string) => {
  const i = page.indexOf(`<h2 id="${id}">`);
  if (i < 0) return "";
  const j = page.indexOf("<h2", i + 4);
  return page.slice(i, j < 0 ? undefined : j);
};
const listOf = (page: string, id: string) => {
  const s = sectionOf(page, id);
  return s.slice(0, s.indexOf("</ul>") + 1);
};

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
    // Driver links in the substitutes table and the list after it.
    const n = new Set([...sectionOf(page, "substitutes").matchAll(/<td><a href="(\/drivers\/[^"]+)"/g), ...listOf(page, "similar").matchAll(/<li><a href="([^"]+)"/g)].map((m) => m[1])).size;
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

test("driver pages: scored substitutes before the brand's other drivers, no risky rows, compare links, how it's scored", async () => {
  const { out, paths } = await built();
  const pages = allPages();
  const byId = new Map(pages.map((p) => [p.id, p]));
  let withTable = 0;
  for (const path of paths.filter((x) => /^\/drivers\/[^/]+\/[^/]+\/$/.test(x))) {
    const page = readPage(out, path);
    const id = path.slice("/drivers/".length, -1);
    const me = byId.get(id)!;
    const subs = sectionOf(page, "substitutes");
    if (!subs) {
      // No scored list: the old similar list stays.
      if (page.includes('id="similar"')) assert.match(page, /<h2 id="similar">Similar drivers<\/h2>/);
      continue;
    }
    withTable++;
    const rows = [...subs.matchAll(/<tr class="main"><td><a href="\/drivers\/([^"]+)\/">/g)].map((m) => m[1]!);
    assert.ok(rows.length >= 1 && rows.length <= 10, path);
    assert.ok(!rows.includes(id), `${path} lists itself`);
    assert.doesNotMatch(subs, /tier-risky|>Risky</);
    assert.equal((subs.match(/>Compare in the app →<\/a>/g) ?? []).length, rows.length);
    assert.match(subs, /<a href="\/about\/#credits">How this is scored<\/a>/);
    // Before the brand list, which keeps only the brand's own drivers.
    const similar = listOf(page, "similar");
    if (similar && !similar.includes("More from")) {
      assert.match(similar, /<h2 id="similar">More drivers<\/h2>/);
      for (const r of rows) assert.doesNotMatch(similar, new RegExp(`href="/drivers/${r}/"`));
    } else if (similar) {
      assert.ok(page.indexOf('id="substitutes"') < page.indexOf('id="similar"'));
      assert.match(similar, new RegExp(`More from ${me.brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/&/g, "&amp;")}`));
      for (const m of similar.matchAll(/<li><a href="\/drivers\/([^/]+)\/([^/]+)\//g)) {
        assert.equal(m[1], me.brandSlug, path);
        assert.ok(!rows.includes(`${m[1]}/${m[2]}`), `${path}: ${m[1]}/${m[2]} listed twice`);
      }
    }
  }
  assert.ok(withTable > 1500, `only ${withTable} pages have substitutes`);
  // One worked page: the closest match first, its compare link opens both drivers.
  const page = readPage(out, "drivers/dayton-audio/rss315hf-4");
  assert.match(sectionOf(page, "substitutes"), /<p>The closest match is the Dayton Audio RSS315HFA-8: in this driver's \w[\w ]* box it /);
  const href = sectionOf(page, "substitutes").match(/<a href="([^"]+)" rel="nofollow">Compare in the app/)![1]!.replace(/&amp;/g, "&");
  const { decodeStateAny } = await import("../packages/web/src/state.ts");
  const s = await decodeStateAny(href.slice(href.indexOf("#") + 1));
  assert.match(s!.driverName, /RSS315HF-4$/);
  assert.match(s!.compare!.driverName, /RSS315HFA-8$/);
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

test("readability: sources list class, button rows, and the page's own sections", () => {
  // The numbered list under "## Sources" gets its class; other lists don't.
  const md = markdown("# T\n\nIntro.\n\n## Notes\n\n1. one\n\n## Sources\n\n1. [A](https://a.example)\n2. B");
  assert.match(md, /<h2 id="sources">Sources<\/h2>\n<ol class="sources">/);
  assert.equal(md.match(/<ol class="sources">/g)?.length, 1);
  // A lone button is the row's only .button child (solid); a row keeps every button (outline, by CSS).
  assert.match(markdown("[[Open it|ex]]"), /^<p class="cta"><a class="button" href="ex">Open it →<\/a><\/p>$/);
  assert.equal(markdown("[[A|a]] [[B|b]] [[C|c]]").match(/class="button"/g)?.length, 3);
  // Only top-level h2s with ids count: not those in sections, forms or other blocks.
  const html = '<h2 id="a">A <code>x</code></h2><section><h2 id="s">S</h2></section><form><div><h2 id="f">F</h2></div></form><h2>no id</h2><h2 id="b">B</h2><h2 id="c">C</h2>';
  assert.deepEqual(topHeadings(html), [{ id: "a", text: "A x" }, { id: "b", text: "B" }, { id: "c", text: "C" }]);
  assert.match(contents(html), /^<nav class="toc" aria-label="On this page">.*<li><a href="#a">A x<\/a><\/li><li><a href="#b">B<\/a><\/li><li><a href="#c">C<\/a><\/li><\/ol><\/div><\/nav>\n$/);
  assert.equal(contents('<h2 id="a">A</h2><h2 id="b">B</h2>'), "", "fewer than three sections: none");
  assert.equal(contents('<ul><li><a href="#a">A</a></li><li><a href="#b">B</a></li><li><a href="#c">C</a></li></ul><h2 id="a">A</h2><h2 id="b">B</h2><h2 id="c">C</h2>'), "", "the page already links to each section: none");
});

test("readability: built pages get an 'On this page' list of their own sections", async () => {
  const { out } = await built();
  const list = (path: string) => {
    const html = readFileSync(join(out, path, "index.html"), "utf8");
    const nav = /<nav class="toc"[\s\S]*?<\/nav>/.exec(html)?.[0];
    return { html, links: nav ? [...nav.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!) : null };
  };
  for (const path of ["guides/port-chuffing", "changelog", "validation", "calculators/port-length", "drivers/hoqs/n185c"]) {
    const { html, links } = list(path);
    assert.ok(links && links.length >= 3, `${path} has a list`);
    for (const id of links!) assert.match(html, new RegExp(`<h2 id="${id}">`), `${path}: #${id} is a section`);
  }
  // Form and section headings stay out; the guides index and size pages (own chips) have none.
  assert.ok(!list("calculators/port-length").links!.includes("air-speed"));
  assert.equal(list("guides").links, null);
  assert.equal(list("drivers/12-inch").links, null);
  assert.ok(!list("guides/port-chuffing").links!.includes("related-guides"));
  assert.match(list("guides/baffle-step").html, /<h2 id="sources">Sources<\/h2>\n<ol class="sources">/);
});

test("markdown: a link whose URL holds brackets keeps them", () => {
  const html = markdown("See [Passive radiator](https://en.wikipedia.org/wiki/Passive_radiator_(speaker)): it works.");
  assert.match(html, /<a href="https:\/\/en\.wikipedia\.org\/wiki\/Passive_radiator_\(speaker\)" rel="noopener">Passive radiator<\/a>: it works\./);
  // Plain links and a link followed by a bracketed aside are unchanged.
  assert.match(markdown("[A](/guides/a/) (see [B](/guides/b/))"), /<a href="\/guides\/a\/">A<\/a> \(see <a href="\/guides\/b\/">B<\/a>\)/);
});

// Markdown twins, llms.txt and llms-full.txt (site/aiDocs.ts).
const SITE_URL = "https://speakerboxgenius.com";
const twinPaths = (): string[] => [
  "/guides/",
  ...readdirSync(new URL("./pages/", import.meta.url)).filter((f) => f.endsWith(".md")).map((f) => parsePage(readFileSync(new URL(`./pages/${f}`, import.meta.url), "utf8"), f).path),
  "/calculators/",
  ...CALCULATORS.map((c) => c.path),
  "/about/",
  "/validation/",
  "/changelog/",
  "/privacy/",
  "/mcp/",
];
const twinFile = (out: string, path: string) => join(out, twinPath(path).slice(1));
const htmlText = (html: string) =>
  html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|nbsp|#39|#x27);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " ", "#39": "'", "#x27": "'" })[e]!);
/** A twin's chart tables: [caption, tables' rows per panel]. */
const chartBlocks = (md: string): { caption: string; rows: string[][] }[] => {
  const lines = md.split("\n");
  const blocks: { caption: string; rows: string[][] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.startsWith("**Chart:** ")) continue;
    const block = { caption: lines[i]!.slice(11), rows: [] as string[][] };
    let table: string[] = [];
    const flush = () => {
      if (table.length) block.rows.push(table.slice(2));
      table = [];
    };
    for (i++; i < lines.length && (lines[i]! === "" || lines[i]!.startsWith("|") || /^\*[^*].*\*/.test(lines[i]!)); i++) {
      if (lines[i]!.startsWith("|")) table.push(lines[i]!);
      else flush();
    }
    flush();
    i--;
    blocks.push(block);
  }
  return blocks;
};

test("twins: every guide, calculator and reference page has a Markdown twin, driver pages none", async () => {
  const { out, paths } = await built();
  const want = twinPaths();
  assert.ok(want.length >= 44);
  for (const p of want) {
    assert.ok(paths.includes(p), `${p} is a built page`);
    const md = readFileSync(twinFile(out, p), "utf8");
    assert.match(md, /^# .+\n\n> .+\n\nSource: https:\/\/speakerboxgenius\.com\/\S+ · Speaker Box Genius · built 2026-11-09\n/, p);
    assert.ok(md.includes(`Source: ${SITE_URL}${p} `), p);
    // The page says where its twin is.
    const html = readFileSync(join(out, p, "index.html"), "utf8");
    assert.ok(html.includes(`<link rel="alternate" type="text/markdown" href="${SITE_URL}${twinPath(p)}">`), `${p}: link rel`);
  }
  assert.ok(!existsSync(join(out, "drivers.md")));
  assert.ok(!readdirSync(join(out, "drivers")).some((f) => f.endsWith(".md")));
  assert.doesNotMatch(readFileSync(join(out, "drivers/index.html"), "utf8"), /text\/markdown/);
  assert.doesNotMatch(readFileSync(join(out, "drivers/dayton-audio/index.html"), "utf8"), /text\/markdown/);
});

test("twins: no placeholder, button syntax, chart source or relative link is left", async () => {
  const { out } = await built();
  for (const p of twinPaths()) {
    const md = readFileSync(twinFile(out, p), "utf8");
    assert.doesNotMatch(md, /\{\{|\}\}|\[\[|\]\]/, `${p}: placeholder or button syntax`);
    assert.doesNotMatch(md, /\]\((chart|figure):|\bchart:[\w:,+-]+\/\w+|\bfigure:[\w-]+\)/, `${p}: chart source`);
    assert.doesNotMatch(md, /\bNaN\b|\bundefined\b|<img|<a /, `${p}: broken output`);
    for (const m of md.matchAll(/\]\(((?:[^()\s]|\([^()\s]*\))+)(?: "[^"]*")?\)/g)) assert.match(m[1]!, /^(https?:|mailto:)/, `${p}: relative link ${m[1]}`);
  }
});

test("twins: their numbers are the page's numbers", async () => {
  const { out } = await built();
  for (const p of twinPaths()) {
    const md = readFileSync(twinFile(out, p), "utf8");
    const text = htmlText(readFileSync(join(out, p, "index.html"), "utf8"));
    // Without the header, the key-point tables of charts (worked out beside the drawing) and the links' URLs.
    let body = md.split("\n").slice(5).join("\n");
    for (const b of chartBlocks(md)) for (const rows of b.rows) for (const r of rows) body = body.replace(r, "");
    body = body.replace(/\]\([^)\s]*(?:\([^()\s]*\))?[^)\s]*\)/g, "]").replace(/https?:\/\/\S+/g, "");
    const missing = [...new Set(body.match(/\d+(?:\.\d+)?/g) ?? [])].filter((n) => !text.includes(n));
    assert.deepEqual(missing, [], `${p}: numbers not on the page`);
  }
});

test("twins: every chart is a caption and a table with a row per design", async () => {
  const { out } = await built();
  let charts = 0;
  for (const p of twinPaths()) {
    const md = readFileSync(twinFile(out, p), "utf8");
    const html = readFileSync(join(out, p, "index.html"), "utf8");
    const blocks = chartBlocks(md);
    assert.equal(blocks.length, (html.match(/<figure class="guide-chart">/g) ?? []).length, `${p}: a block per chart figure`);
    const text = htmlText(html);
    for (const b of blocks) {
      assert.ok(b.rows.length >= 1, `${p}: ${b.caption.slice(0, 40)}: a table`);
      for (const rows of b.rows) {
        assert.ok(rows.length >= 1, `${p}: a row per design`);
        // Each row names a design (or curve) the page's chart shows.
        for (const r of rows) assert.ok(text.includes(r.split("|")[1]!.trim()), `${p}: "${r.slice(0, 50)}" is on the page`);
      }
      charts++;
    }
  }
  assert.ok(charts >= 40, `${charts} charts`);
  // A known chart: three boxes, F3 in the table.
  const svp = readFileSync(join(out, "guides/sealed-vs-ported.md"), "utf8");
  assert.match(svp, /\| Design \| F3 \(Hz\) \| F6 \(Hz\) \| Peak \(dB @ Hz\) \|\n\| --- \| --- \| --- \| --- \|\n\| Sealed \| 41 \| 32 \|[^\n]*\n\| Ported \| 21 \|[^\n]*\n\| Passive radiators \| 23 \|/);
});

test("llms.txt: llmstxt.org layout, every link written, the MCP page listed with its page", async () => {
  const { out, paths } = await built();
  const txt = readFileSync(join(out, "llms.txt"), "utf8");
  const lines = txt.split("\n");
  assert.equal(lines[0], "# Speaker Box Genius");
  assert.match(lines[2]!, /^> .+/);
  assert.deepEqual([...txt.matchAll(/^## (.+)$/gm)].map((m) => m[1]), ["Guides", "Calculators", "Reference", "Optional"]);
  const entries = [...txt.matchAll(/^- \[([^\]]+)\]\(([^)]+)\): (.+)$/gm)];
  assert.equal(entries.length, lines.filter((l) => l.startsWith("- ")).length, "every list line is [Title](url): description");
  for (const [, , url] of entries) {
    if (!url!.startsWith(SITE_URL)) continue;
    const path = new URL(url!).pathname;
    assert.ok(existsSync(join(out, path)) || existsSync(join(out, path, "index.html")), `${url} is written`);
  }
  const twinLinks = entries.map((e) => e[2]!).filter((u) => u.startsWith(SITE_URL) && u.endsWith(".md"));
  assert.equal(twinLinks.length, twinPaths().length);
  assert.equal(twinLinks.includes(`${SITE_URL}/mcp.md`), paths.includes("/mcp/"));
  assert.ok(entries.some((e) => e[2] === `${SITE_URL}/drivers/`), "the drivers index (HTML) is optional reading");
  // Sections hold what they should.
  const section = (name: string) => txt.split(`## ${name}\n`)[1]!.split("\n## ")[0]!;
  assert.match(section("Guides"), /\/guides\.md\)[\s\S]*\/winisd-alternative\.md\)[\s\S]*\/guides\/port-chuffing\.md\)/);
  assert.match(section("Calculators"), /\/calculators\.md\)[\s\S]*\/calculators\/port-length\.md\)/);
  assert.match(section("Reference"), /\/about\.md[\s\S]*\/validation\.md[\s\S]*\/changelog\.md[\s\S]*\/privacy\.md/);
  assert.deepEqual([...section("Optional").matchAll(/\]\((https:\/\/speakerboxgenius\.com\/[^)]+\.md)\)/g)].map((m) => m[1]), [`${SITE_URL}/mcp.md`], "only the MCP page is a twin in Optional");
});

test("llms-full.txt is every twin in llms.txt order, split by ---", async () => {
  const { out } = await built();
  const links = [...readFileSync(join(out, "llms.txt"), "utf8").matchAll(/\]\((https:\/\/speakerboxgenius\.com\/[^)]+\.md)\)/g)].map((m) => m[1]!.replace(SITE_URL, ""));
  const full = readFileSync(join(out, "llms-full.txt"), "utf8");
  assert.equal(full, links.map((l) => readFileSync(join(out, l), "utf8").trim()).join("\n\n---\n\n") + "\n");
  console.log(`llms-full.txt: ${full.length} bytes (${Math.round(full.length / 1024)} KB), ${links.length} twins`);
});

test("twins are not in the sitemaps, and robots.txt is unchanged", async () => {
  const { out } = await built();
  for (const f of readdirSync(out).filter((f) => /^sitemap.*\.(xml|json)$/.test(f))) assert.doesNotMatch(readFileSync(join(out, f), "utf8"), /\.md\b|llms/, f);
  assert.equal(readFileSync(join(out, "robots.txt"), "utf8"), `User-agent: *\nAllow: /\nDisallow: /sitemap-state.json\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

// "Ask AI about this page" (#393).
test("ask AI: a <details> menu with Copy (the twin), Claude and ChatGPT links carrying the encoded prompt", () => {
  const html = askAi("/guides/port-tuning/");
  assert.match(html, /^<div class="ask-ai"><details class="ask-ai-d"><summary class="ask-ai-btn">/, "opens without JS");
  assert.equal(askAiPrompt("/guides/port-tuning/"), `Read ${SITE_URL}/guides/port-tuning.md from Speaker Box Genius so I can ask questions about it.`);
  const q = encodeURIComponent(askAiPrompt("/guides/port-tuning/"));
  assert.ok(html.includes(`data-ask-ai="copy" href="/guides/port-tuning.md"`), "Copy links the twin (the no-JS fallback)");
  assert.ok(html.includes(`href="https://claude.ai/new?q=${q}" target="_blank" rel="noopener"`));
  assert.ok(html.includes(`href="https://chatgpt.com/?q=${q}" target="_blank" rel="noopener"`));
  assert.deepEqual([...html.matchAll(/class="ask-ai-label">([^<]+)</g)].map((m) => m[1]), ["Copy page as Markdown", "Copied", "Open in Claude", "Open in ChatGPT"]);
  // Counts only when GoatCounter is there (the preview build strips it).
  assert.match(html, /window\.goatcounter&&window\.goatcounter\.count&&window\.goatcounter\.count\(\{path:"ask-ai-"\+k/);
  assert.match(withAskAi("<h1>T</h1>\n<p class=\"lede\">L</p>", "/x/"), /^<h1>T<\/h1>\n<div class="ask-ai">[\s\S]*<\/script>\n<p class="lede">L<\/p>$/);
});

test("ask AI: on every guide and calculator page, right under the H1 and not in On this page; nowhere else", async () => {
  const { out } = await built();
  const want = [...twinPaths().filter((p) => !["/guides/", "/calculators/", "/about/", "/validation/", "/changelog/", "/privacy/", "/mcp/"].includes(p))];
  for (const p of want) {
    const html = readFileSync(join(out, p.slice(1), "index.html"), "utf8");
    const main = html.split("<main>")[1]!.split("</main>")[0]!;
    assert.equal(main.match(/class="ask-ai"/g)?.length, 1, `${p}: one menu`);
    assert.match(main, /<\/h1>\n<div class="ask-ai">/, `${p}: right after the H1`);
    // After the menu comes the page as before: the lede first.
    assert.match(main, /<\/script>\n<p class="lede">/, `${p}: lede follows`);
    const toc = /<nav class="toc"[\s\S]*?<\/nav>/.exec(main)?.[0] ?? "";
    assert.doesNotMatch(toc, /Ask AI/, `${p}: not in On this page`);
    assert.ok(main.includes(`href="${twinPath(p)}"`), `${p}: copies its own twin`);
    assert.match(html, /\.ask-ai-menu\{/, `${p}: styled`);
  }
  for (const p of ["/guides/", "/calculators/", "/about/", "/validation/", "/changelog/", "/privacy/", "/mcp/", "/drivers/"]) {
    assert.doesNotMatch(readFileSync(join(out, p.slice(1), "index.html"), "utf8"), /class="ask-ai"/, `${p}: no menu`);
  }
});

test("the visit counter loads only without Do Not Track / GPC and with Help improve the app on", () => {
  const code = GOATCOUNTER.replace(/^<script>/, "").replace(/<\/script>$/, "");
  const loads = (nav: Record<string, unknown>, win: Record<string, unknown> = {}, stored: string | null = null, storageThrows = false, search = "") => {
    const added: { src?: string; async?: boolean; attrs: Record<string, string> }[] = [];
    const localStorage = { getItem: (k: string) => { if (storageThrows) throw new Error("blocked"); return k === "sbg.usageStats" ? stored : null; } };
    const document = { createElement: () => ({ attrs: {}, setAttribute(k: string, v: string) { this.attrs[k] = v; } }), head: { appendChild: (el: (typeof added)[0]) => added.push(el) } };
    runInNewContext(code, { navigator: nav, window: win, localStorage, document, location: { pathname: "/", search } });
    return added;
  };
  const [s] = loads({});
  assert.equal(s.src, "https://gc.zgo.at/count.js");
  assert.equal(s.async, true);
  assert.equal(s.attrs["data-goatcounter"], "https://speakerboxgenius.goatcounter.com/count");
  assert.equal(loads({ globalPrivacyControl: true }).length, 0, "GPC");
  assert.equal(loads({ doNotTrack: "1" }).length, 0, "DNT");
  assert.equal(loads({ doNotTrack: "yes" }).length, 0, "DNT yes");
  assert.equal(loads({}, { doNotTrack: "1" }).length, 0, "window.doNotTrack");
  assert.equal(loads({}, {}, "off").length, 0, "Help improve the app off");
  assert.equal(loads({ doNotTrack: "0" }).length, 1, "DNT 0 still counts");
  assert.equal(loads({}, {}, null, true).length, 1, "no storage: can't have switched it off");
  // A share link from the MCP server (?ref=mcp): counted as coming from "mcp", the path without the tag.
  const fromMcp: Record<string, unknown> = {};
  assert.equal(loads({}, fromMcp, null, false, "?ref=mcp").length, 1);
  assert.equal(JSON.stringify(fromMcp.goatcounter), JSON.stringify({ referrer: "mcp", path: "/" }));
  const plain: Record<string, unknown> = {};
  loads({}, plain, null, false, "?ref=other");
  assert.equal(plain.goatcounter, undefined);
  // Same switch and same browser test as the app's usage stats.
  assert.match(readFileSync(new URL("../packages/web/src/telemetry.ts", import.meta.url), "utf8"), /const PREF = "sbg\.usageStats";/);
  assert.match(readFileSync(new URL("../packages/web/src/telemetrySchema.ts", import.meta.url), "utf8"), /nav\.globalPrivacyControl === true \|\| nav\.doNotTrack === "1" \|\| nav\.doNotTrack === "yes" \|\| win\?\.doNotTrack === "1"/);
});

test("a high-Qts car-audio woofer gets a Compact ported box, a PR in it, a Deep row, an infinite baffle and the Fs line", () => {
  const db = loadDb();
  const prs = db.passiveRadiators.map(prCandidate);
  const e = db.drivers.find((x) => x.id === "gladen/aerospace-165-dc");
  if (!e) return;
  const p = designDriver(e, prs)!;
  const by = (k: string) => p.designs.find((d) => d.design.kind === k);
  const vas = e.data.ts.vas_l!;
  const ported = by("vented")!;
  assert.equal(ported.design.preset, COMPACT);
  assert.ok(Math.abs(ported.vb_l - 2 * vas) < 0.2, `${ported.vb_l} L`);
  assert.ok(ported.result.summary.f3! < e.data.ts.fs, `ported F3 ${ported.result.summary.f3} should be below Fs`);
  assert.equal(by("pr")?.vb_l, ported.vb_l);
  assert.ok(by("ib"), "infinite baffle for a car-audio driver");
  // Deep: QB3, meaningfully deeper, as a row and not a curve.
  assert.ok(p.deep && p.deep.vb_l > ported.vb_l && p.deep.f3 <= ported.result.summary.f3! - DEEP_MIN_GAIN_HZ);
  assert.equal(p.designs.length, 4);
  // The PR is sized to a 6.5-inch driver.
  const sd = e.data.ts.sd_cm2!;
  assert.ok(prs.find((x) => x.name === p.pr!.name)!.pr.sd_cm2 <= PR_MAX_SD * sd, p.pr!.name);
  assert.ok(p.notes.length === 0, p.notes.join("; "));
  const { content, description } = driverContent(p, { all: "https://x/#a", deep: "https://x/#deep", related: [] }, chart);
  assert.match(content, /<tr class="main deep"><td>Deep ported<\/td>/);
  assert.match(content, /href="https:\/\/x\/#deep"/);
  assert.match(content, /<line class="mk"[^>]*\/><text class="mk"[^>]*>Fs 49 Hz<\/text>/);
  assert.match(content, /A sealed box can't go below the driver's Fs \(49 Hz\)/);
  assert.match(content, /Free air/);
  assert.match(description, /infinite baffle \(F3 \d+ Hz\)/);
  assert.equal(describe(e.data).split(",")[0], "6.5-inch car audio woofer");
});

test("car-audio drivers under 8 inches are woofers, from 8 inches subwoofers", () => {
  assert.equal(typeLabel({ type: "car-audio", size_in: 6.5 }), "car audio woofer");
  assert.equal(typeLabel({ type: "car-audio", size_in: 10 }), "car audio subwoofer");
  assert.equal(typeLabel({ type: "car-audio", size_in: undefined }), "car audio subwoofer");
  assert.equal(typeLabel({ type: "woofer", size_in: 6.5 }), "woofer");
});

test("a page offers PRs up to PR_MAX_SD times the driver's cone area", () => {
  const prs = [{ pr: { sd_cm2: 130 } }, { pr: { sd_cm2: 337 } }, { pr: { sd_cm2: 500 } }];
  assert.deepEqual(prsFor(prs, 135).map((x) => x.pr.sd_cm2), [130, 337]);
  assert.equal(prsFor(prs, undefined).length, 3);
});

test("the same reason for the ported and PR boxes is said once", () => {
  assert.deepEqual(mergeNotes(["a ported box (X)", "a passive radiator box (X)", "a sealed box (Y)", "a sealed box (Y)"]), ["a ported or passive radiator box (X)", "a sealed box (Y)"]);
  assert.deepEqual(mergeNotes(["a ported box (X)", "a passive radiator box (Z)"]), ["a ported box (X)", "a passive radiator box (Z)"]);
});

test("no driver page shows a ported or PR curve bigger than twice Vas when it is the Compact box, and Deep rows are deeper", () => {
  const db = loadDb();
  const prs = db.passiveRadiators.map(prCandidate);
  for (const e of db.drivers.filter((x) => x.data.type === "car-audio").slice(0, 60)) {
    const p = designDriver(e, prs);
    if (!p) continue;
    for (const d of p.designs) if (d.design.preset === COMPACT) assert.ok(d.vb_l <= 2.01 * (p.state.designs.length ? solveVas(p) : Infinity), `${e.id} ${d.vb_l}`);
    if (p.deep) {
      const c = p.designs.find((d) => d.design.kind === "vented")!;
      assert.ok(p.deep.f3 <= c.result.summary.f3! - DEEP_MIN_GAIN_HZ && p.deep.vb_l <= PAGE_MAX_L, e.id);
    }
  }
});
const solveVas = (p: DriverPage) => (p.rec.ts.vas_l ?? Infinity) * p.state.drivers;
