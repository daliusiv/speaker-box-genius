import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  articleLinks,
  disallowed,
  guessType,
  pageLinks,
  parseDatasheet,
  rangeHz,
  readArticle,
  readTable,
  sizeFrom,
  splitTitle,
} from "../src/seas.ts";
import { validateDriver, validatePassiveRadiator } from "../../schema/src/index.ts";

// Datasheet tables as `pdftotext -layout` gives them (seas.no, seen 9 Nov 2026).
const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures/seas", `${name}.txt`), "utf8");
const M15CH002 = fixture("m15ch002");
const M64F001 = fixture("m64f001");
const at = { url: "https://www.seas.no/index.php?option=com_content&view=article&id=354", pdf: "https://www.seas.no/images/x_datasheet.pdf" };

test("a datasheet table: two columns of label and value", () => {
  const t = readTable(M15CH002);
  assert.equal(t.fs, "67 Hz");
  assert.equal(t.moving, "6.75 g");
  assert.equal(t.airLoad, "0.38 g");
  assert.equal(t.cms, "0.8 mm/N");
  assert.equal(t.travel, "6 mm");
  assert.equal(t.maxTravel, "14 mm");
  assert.equal(t.vas, "6 Litres");
  assert.equal(t.qts, "0.4");
  assert.equal(t.pe, "70 W", "long term, not short term");
  // Newer sheets: "(p -p)", "41.2 cm 2", "350 Hz - 10 kHz".
  const m = readTable(M64F001);
  assert.equal(m.travel, "1.4 mm");
  assert.equal(m.sd, "41.2 cm 2");
  assert.deepEqual(rangeHz(m.range), [350, 10000]);
});

test("M15CH002: Mms adds the air load, Xmax is half the linear travel", () => {
  const r = parseDatasheet({ title: "E0043-06S M15CH002", kind: "midrange", ...at, text: M15CH002 }, "2026-11-09");
  assert.equal(r.kind, "driver");
  const d = r.driver!;
  assert.deepEqual(validateDriver(d), []);
  assert.equal(d.model, "M15CH002");
  assert.equal(d.brand, "SEAS");
  assert.equal(d.type, "midrange");
  assert.equal(d.nominal_ohms, 6);
  assert.equal(d.size_in, 5);
  assert.equal(d.ts.mms_g, 7.13);
  assert.equal(d.ts.xmax_mm, 3);
  assert.equal(d.ts.pe_w, 70);
  assert.equal(d.sources.length, 2);
  assert.match(d.sources[0]!.note!, /E0043-06S.*permission \(9 Nov 2026\).*CC BY-NC-SA 4\.0/);
  assert.equal(d.sources[1]!.url, at.pdf);
});

test("a dome midrange without Q or Vas is skipped, saying what was found", () => {
  const r = parseDatasheet({ title: "E0103-06 M64F001", kind: "midrange", ...at, text: M64F001 }, "2026-11-09");
  assert.equal(r.kind, "skip");
  assert.match(r.reason!, /missing qms, qes, vas/);
  assert.match(r.reason!, /found: .*fs/);
});

test("coaxials keep the woofer's block; series without a type get one from the data", () => {
  const coax = parseDatasheet({ title: "E0121-04 C16NX001/X", kind: "coaxial", ...at, text: M15CH002 }, "2026-11-09");
  assert.equal(coax.driver!.type, "midbass");
  assert.match(coax.driver!.notes!, /^.*Coaxial/);
  const auto = parseDatasheet({ title: "L22RNX/P", kind: "auto", ...at, text: M15CH002 }, "2026-11-09");
  assert.equal(auto.driver!.type, "woofer");
  assert.match(auto.driver!.notes!, /Type woofer chosen/);
  assert.equal(guessType([40, 20000], 8, 40), "full-range");
  assert.equal(guessType([300, 5000], 5, 120), "midrange");
  assert.equal(guessType([30, 3000], 10, 25), "woofer");
});

test("passive radiators: moving mass plus air load, Xmax from travel", () => {
  const text = [
    "    Free Air Resonance                 25 Hz                  Moving Mass                      60 g",
    "    Effective Piston Area              220 cm2                Air Load Mass In IEC Baffle      2 g",
    "    Suspension Compliance              0.65 mm/N              Linear Travel (p-p)              20 mm",
    "    VAS                                44 Litres              QMS                              6.1",
  ].join("\n");
  const r = parseDatasheet({ title: "H1215 P21RN", kind: "passive-radiator", ...at, text }, "2026-11-09");
  assert.equal(r.kind, "passive-radiator");
  assert.deepEqual(validatePassiveRadiator(r.pr!), []);
  assert.deepEqual(r.pr!.params, { mms_g: 62, sd_cm2: 220, xmax_mm: 10, fs: 25, qms: 6.1, vas_l: 44, cms_mm_per_n: 0.65 });
  const none = parseDatasheet({ title: "x", kind: "passive-radiator", ...at, text: "Moving Mass   60 g" }, "2026-11-09");
  assert.equal(none.kind, "skip");
});

test("titles, sizes and ranges", () => {
  assert.deepEqual(splitTitle(" E0017-08S W18EX001"), { code: "E0017-08S", name: "W18EX001" });
  assert.deepEqual(splitTitle("X2-08 EXOTIC W8"), { code: "X2-08", name: "Exotic W8" });
  assert.deepEqual(splitTitle("XM011-04 L22ROY2"), { code: "XM011-04", name: "L22ROY2" });
  assert.deepEqual(splitTitle("Some article"), { name: "Some article" });
  assert.equal(sizeFrom("The M15CH002 is a 15cm (5”) cone midrange"), 5);
  assert.equal(sizeFrom("The Exotic W8 is an 8 inch woofer-midrange driver"), 8);
  assert.equal(sizeFrom("a 17 cm (6½”) woofer"), 6.5);
  assert.equal(sizeFrom("Voice coil 26 mm, 1.0 T"), undefined);
  assert.deepEqual(rangeHz("60 - 3500 Hz"), [60, 3500]);
  assert.deepEqual(rangeHz("1 - 5 kHz"), [1000, 5000]);
});

test("product pages: links in the category, title, category and English datasheet", () => {
  const cat = `
    <a href="/index.php?option=com_content&amp;view=article&amp;id=349:e0021-08s-w12cy001&amp;catid=49:excel-woofers&amp;Itemid=246">W12CY001</a>
    <a href="/index.php?option=com_content&amp;view=article&amp;id=349:e0021-08s-w12cy001&amp;catid=49&amp;Itemid=359">again</a>
    <a href="/index.php?option=com_content&amp;view=article&amp;id=349:e0021-08s-w12cy001&amp;catid=49&amp;tmpl=component&amp;print=1">print</a>
    <a href="/index.php?option=com_content&amp;view=article&amp;id=124&amp;Itemid=440">menu</a>
    <a href="/index.php?option=com_content&amp;view=article&amp;id=346:x3-06-exotic-t35&amp;catid=92&amp;Itemid=498">tweeter</a>
    <a href="/index.php?option=com_content&amp;view=category&amp;id=49&amp;Itemid=246&amp;limitstart=20">2</a>
    <a href="/index.php?option=com_content&amp;view=category&amp;id=50&amp;Itemid=247">tweeters</a>`;
  assert.deepEqual([...articleLinks(cat, 49).entries()], [
    [349, "https://www.seas.no/index.php?option=com_content&view=article&id=349:e0021-08s-w12cy001&catid=49:excel-woofers&Itemid=246"],
  ]);
  assert.deepEqual(pageLinks(cat, 49), ["https://www.seas.no/index.php?option=com_content&view=category&id=49&Itemid=246&limitstart=20"]);

  const page = `<title>E0043-06S M15CH002</title><div class="item-page"><h2 itemprop="name">
    <a href="#"> E0043-06S M15CH002</a></h2>
    <dd class="category-name">Category: <a href="/index.php?option=com_content&amp;view=category&amp;id=109&amp;Itemid=644">Excel Midranges</a></dd>
    <div itemprop="articleBody"><p>The M15CH002 is a 15cm (5&rdquo;) cone midrange.</p>
    <a href="/images/stories/excel/pdfdataheet/e0043_m15ch002_datasheet_CN.pdf">中文</a>
    <a href="/images/stories/excel/pdfdataheet/excel_datasheet.pdf">range</a>
    <a href="/images/stories/excel/pdfdataheet/e0043_m15ch002_datasheet.pdf">Datasheet</a></div></div>`;
  const a = readArticle(page);
  assert.equal(a.title, "E0043-06S M15CH002");
  assert.equal(a.catid, 109);
  assert.equal(a.pdf, "https://www.seas.no/images/stories/excel/pdfdataheet/e0043_m15ch002_datasheet.pdf");
  assert.equal(sizeFrom(a.body), 5);
});

test("robots.txt: the * group applies", () => {
  const robots = "User-agent: *\nDisallow: /administrator/\nDisallow: /tmp/\n\nUser-agent: BadBot\nDisallow: /\n";
  assert.deepEqual(disallowed(robots), ["/administrator/", "/tmp/"]);
  assert.deepEqual(disallowed("User-agent: SpeakerBoxGenius-importer\nDisallow: /\nUser-agent: *\nDisallow:\n"), ["/"]);
});

test("found in the first live run: codes without an impedance, borrowed datasheets, voice-coil sizes", async () => {
  const { pickPdf, sizeFromModel } = await import("../src/seas.ts");
  assert.deepEqual(splitTitle("H1480 L16RN-SL"), { code: "H1480", name: "L16RN-SL" });
  assert.deepEqual(splitTitle("E0051-04/06 C16N001/F"), { code: "E0051-04/06", name: "C16N001/F" });
  assert.equal(splitTitle("Design by SEAS Woofers").code, undefined, "an overview page, not a product");
  // The Extreme L26ROY page links the Exotic F8's sheet first.
  const pdfs = ["https://www.seas.no/images/stories/exotic/pdf_datasheet/x1-08_exotic-f8_datasheet.pdf", "https://www.seas.no/images/XM001-04_L26ROY_datasheet.pdf"];
  assert.equal(pickPdf(pdfs, "XM001-04 L26ROY"), pdfs[1]);
  assert.equal(pickPdf(pdfs, "X1-08 EXOTIC F8"), pdfs[0]);
  assert.equal(sizeFrom('The L26RFX/P has a 2" voice coil'), undefined, "a bare inch mark is often the voice coil");
  assert.equal(sizeFromModel("CA26RFX"), 10);
  assert.equal(sizeFromModel("W22NY001"), 8);
  assert.equal(sizeFromModel("Exotic W8"), undefined);
});
