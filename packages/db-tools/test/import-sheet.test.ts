import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { cellValue, convertRows, fieldOf, findLayout, kindOf, unitOf, withOwnTerms, type Options } from "../src/import-sheet.ts";
import { parseCsv, readSheet } from "../src/sheet.ts";
import { validateDriver } from "../../schema/src/index.ts";

const FIX = join(import.meta.dirname, "fixtures");
const opts = (over: Partial<Options> = {}): Options => ({
  brand: { name: "Example Audio" },
  brandSlug: "example-audio",
  date: "2026-11-05",
  note: "Example Audio T/S data supplied by Example Audio, used with permission.",
  kind: "driver",
  decimalComma: false,
  ...over,
});

test("CSV: delimiter, quotes and decimal commas are detected", () => {
  const s = parseCsv('a;"b; c";d\n1,5;"say ""hi""";3\n');
  assert.deepEqual(s.rows, [["a", "b; c", "d"], ["1,5", 'say "hi"', "3"]]);
  assert.equal(s.decimalComma, true);
  assert.equal(parseCsv("a,b\n1.5,2\n").decimalComma, false);
  assert.equal(parseCsv("a\tb\n1,5\t2,25\n").decimalComma, true);
});

test("headers: common manufacturer names map to fields, units come from brackets", () => {
  assert.equal(fieldOf("Fs (Hz)"), "fs");
  assert.equal(fieldOf("Resonance frequency"), "fs");
  assert.equal(fieldOf("BxL"), "bl");
  assert.equal(fieldOf("Force factor"), "bl");
  assert.equal(fieldOf("Vas [ft³]"), "vas");
  assert.equal(fieldOf("Effective piston area"), "sd");
  assert.equal(fieldOf("Xmax (one way)"), "xmax");
  assert.equal(fieldOf("Xmech"), "xmech");
  assert.equal(fieldOf("AES power"), "pe");
  assert.equal(fieldOf("Program power"), null);
  assert.equal(fieldOf("Vd"), null);
  assert.equal(fieldOf("Part No."), "model");
  assert.equal(fieldOf("Baffle cutout diameter"), "cutout");
  // "displacement" contains "spl": it must not be taken for an SPL column and ignored.
  assert.equal(fieldOf("Displacement (L)"), "displacement");
  assert.equal(fieldOf("SPL (1W/1m)"), null);
  assert.equal(fieldOf("Colour"), undefined);
  assert.equal(unitOf("Vas (ft³)"), "ft³");
  assert.equal(unitOf("Sd cm2"), "cm2");
});

test("cells: units in the cell or the column are converted", () => {
  assert.equal(cellValue("2.12", "vas", 28.3168, false), 60.031616);
  assert.equal(cellValue("84 L", "vas", undefined, false), 84);
  assert.equal(cellValue("2.97 ft³", "vas", undefined, false), 84.100896);
  assert.equal(cellValue("0,43", "qes", undefined, true), 0.43);
  assert.equal(cellValue("1.317,4", "sd", 1, true), 1317.4);
  assert.equal(cellValue("1,317", "sd", 1, false), 1317);
  assert.equal(cellValue("2400", "le", 0.001, false), 2.4);
  assert.equal(cellValue("450", "le", undefined, false), 0.45); // bare µH
  assert.equal(cellValue('6-1/2"', "size", undefined, false), 165.1);
  assert.equal(cellValue("12", "size", undefined, false), 304.8); // bare size is inches
  assert.equal(cellValue("n/a", "xmax", undefined, false), undefined);
  assert.equal(cellValue("", "xmax", undefined, false), undefined);
});

test("semicolon CSV with a title, a units row and mixed product types", () => {
  const sheet = readSheet(join(FIX, "sheet-semicolon.csv"));
  const layout = findLayout(sheet.rows, new Map());
  assert.equal(layout.headerRow, 1); // the blank row is dropped, so the header is the 2nd row
  assert.equal(layout.firstDataRow, 3); // units row skipped
  const r = convertRows(sheet.rows, layout, opts({ decimalComma: sheet.decimalComma }));
  const by = Object.fromEntries(r.map((x) => [x.model, x]));

  const a = by["10EX300"]!;
  assert.equal(a.kind, "driver");
  if (a.kind !== "driver") return;
  assert.deepEqual(validateDriver(a.driver), []);
  assert.equal(a.driver.ts.qes, 0.43);
  assert.equal(a.driver.ts.pe_w, 250); // AES, not program
  assert.equal(a.driver.size_in, 10);
  assert.equal(a.driver.physical?.cutout_mm, 233);
  assert.equal(a.driver.type, "woofer");
  assert.equal(a.driver.sources[0]!.url, "https://example.com/10ex300");
  assert.match(a.driver.sources[0]!.note!, /used with permission/);

  const b = by["15EX800"]!;
  assert.equal(b.kind, "driver");
  if (b.kind === "driver") {
    assert.equal(b.driver.type, "subwoofer");
    assert.equal(b.driver.ts.qes, 0.341); // from Qts and Qms
    assert.match(b.driver.notes!, /Qes 0.341 calculated/);
  }

  assert.equal(by["EX1"]!.kind, "skip"); // compression driver
  assert.equal(by["12EXD"]!.kind, "skip"); // DVC, wiring unknown
  assert.match((by["12EXD"] as { reason: string }).reason, /dual voice coil/);

  const pr = by["10EXPR"]!;
  assert.equal(pr.kind, "passive-radiator");
  if (pr.kind === "passive-radiator") {
    assert.deepEqual(pr.pr.params, { mms_g: 180, sd_cm2: 350, xmax_mm: 15, fs: 20 });
    assert.equal(pr.pr.size_in, 10);
  }
});

test("DVC rows are imported when the wiring is given", () => {
  const sheet = readSheet(join(FIX, "sheet-semicolon.csv"));
  const r = convertRows(sheet.rows, findLayout(sheet.rows, new Map()), opts({ decimalComma: true, dvcWiring: "parallel" }));
  const d = r.find((x) => x.model === "12EXD")!;
  assert.equal(d.kind, "driver");
  if (d.kind !== "driver") return;
  assert.equal(d.driver.voice_coils, 2);
  assert.equal(d.driver.ts_wiring, "parallel");
  assert.equal(d.driver.ts.bl, undefined); // Bl 12 disagrees with the rest, so it's dropped
  assert.match(d.driver.notes!, /Bl 12/);
});

test("xlsx with imperial units, µH and fractional sizes; --type forces the type", () => {
  const sheet = readSheet(join(FIX, "sheet-imperial.xlsx"));
  const layout = findLayout(sheet.rows, new Map());
  const r = convertRows(sheet.rows, layout, opts({ type: "car-audio" }));
  assert.equal(r.length, 2);
  const cx = r[0]!;
  const mid = r[1]!;
  assert.equal(cx.kind, "driver");
  assert.equal(mid.kind, "driver");
  if (cx.kind !== "driver" || mid.kind !== "driver") return;
  assert.deepEqual(validateDriver(cx.driver), []);
  assert.equal(cx.driver.type, "car-audio");
  assert.equal(cx.driver.ts.vas_l, 60.031616);
  assert.equal(cx.driver.ts.sd_cm2, 499.999);
  assert.equal(cx.driver.ts.le_mh, 2.4);
  assert.equal(cx.driver.ts.xmax_mm, 13.97);
  assert.equal(cx.driver.size_in, 12);
  assert.equal(mid.driver.size_in, 6.5);
  assert.equal(mid.driver.ts.le_mh, 0.5);
});

test("xlsx: another worksheet by name, and a clear error for a missing one", () => {
  const notes = readSheet(join(FIX, "sheet-imperial.xlsx"), { sheet: "notes" });
  assert.deepEqual(notes.rows, [["nothing here"]]);
  assert.throws(() => readSheet(join(FIX, "sheet-imperial.xlsx"), { sheet: "Nope" }), /Sheets: Drivers, Notes/);
});

test("--map names an unrecognised column; rows without a link use --url", () => {
  const rows = [
    ["Name", "Resonanz", "Qts", "Qes", "Qms", "Vas", "Re", "Sd"],
    ["W8", "40", "0.4", "0.43", "6", "30", "5.6", "220"],
  ];
  assert.throws(() => findLayout(rows, new Map()), /header row/);
  const maps = new Map([
    ["name", { field: "model" as const }],
    ["resonanz", { field: "fs" as const }],
  ]);
  const r = convertRows(rows, findLayout(rows, maps), opts({ url: "https://example.com/p/{slug}" }));
  assert.equal(r[0]!.kind, "driver");
  if (r[0]!.kind === "driver") assert.equal(r[0]!.driver.sources[0]!.url, "https://example.com/p/w8");
  const noUrl = convertRows(rows, findLayout(rows, maps), opts());
  assert.equal(noUrl[0]!.kind, "skip");
});

test("xlsx: formula strings with xml:space=\"preserve\" are read (B&C's comparison matrix)", async () => {
  const { rowsOfWorksheet } = await import("../src/sheet.ts");
  const xml =
    '<sheetData><row r="1"><c r="A1" t="str"><v>name</v></c><c r="B1" t="str"><v xml:space="preserve"> Fs (Hz)</v></c></row>' +
    '<row r="2"><c r="A2" t="str"><v>10BG76</v></c><c r="B2"><v>48</v></c></row></sheetData>';
  assert.deepEqual(rowsOfWorksheet(xml), [
    ["name", "Fs (Hz)"],
    ["10BG76", "48"],
  ]);
});

test("a missing Fs or Re is calculated from the other values, with a note", () => {
  const rows = [
    ["Model", "URL", "Type", "Size (in)", "Nominal impedance", "Qts", "Qes", "Qms", "Vas (L)", "Cms (mm/N)", "Le (mH)", "BL", "Mms (g)", "Sd (cm2)", "Xmax (mm)"],
    ["CX12", "https://example.com/cx12", "Coax Coaxial", "12", "8", "0.5", "0.54", "6.53", "63.9", "0.16", "0.7", "13.4", "50.3", "530.93", "3.9"],
  ];
  const r = convertRows(rows, findLayout(rows, new Map()), opts());
  assert.equal(r[0]!.kind, "driver");
  if (r[0]!.kind !== "driver") return;
  assert.equal(r[0]!.driver.ts.fs, 56.1);
  assert.equal(r[0]!.driver.ts.re, 5.47);
  assert.match(r[0]!.driver.notes!, /Fs 56.1 Hz calculated/);
  assert.match(r[0]!.driver.notes!, /Re 5.47 Ω calculated/);
});

test("types: hyphenated and prefixed type names are recognised", () => {
  assert.deepEqual(kindOf("LF Mid-Woofer", "driver"), { kind: "lf_woofer", type: "midbass" });
  assert.deepEqual(kindOf("LF Sub-woofer", "driver"), { kind: "lf_woofer", type: "subwoofer" });
  assert.deepEqual(kindOf("LF Woofer", "driver"), { kind: "lf_woofer", type: "woofer" });
  assert.deepEqual(kindOf("LF Midrange", "driver"), { kind: "lf_woofer", type: "midrange" });
  assert.equal(kindOf("HF Compression Driver", "driver").kind, "skip");
});

test("a brand can carry its own terms instead of CC BY-NC-SA", async () => {
  const { validateBrand } = await import("../../schema/src/index.ts");
  assert.deepEqual(validateBrand({ name: "Markaudio", licence: "Not covered by CC BY-NC-SA 4.0." }), []);
  assert.ok(validateBrand({ name: "X", licence: 3 }).length > 0);
});

test("re-importing a brand under its own terms keeps the not-CC line in the note", () => {
  const own = { name: "Beyma", licence: "Not covered by CC BY-NC-SA 4.0." };
  const n = withOwnTerms("From the datasheets.", own);
  assert.match(n, /Not covered by CC BY-NC-SA 4\.0: do not reuse outside Speaker Box Genius without Beyma's permission/);
  assert.equal(withOwnTerms(n, own), n);
  assert.equal(withOwnTerms("From the datasheets.", { name: "SEAS" }), "From the datasheets.");
});
