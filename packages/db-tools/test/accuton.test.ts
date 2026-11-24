import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modelOf, nominalOf, num, parseListing, parsePage, parseProduct, sizeOf, typeOf, type Page } from "../src/accuton.ts";
import { validateDriver } from "../../schema/src/index.ts";

// A product page as accuton.com serves it (values seen 19 Nov 2026, trimmed).
const HTML = readFileSync(new URL("./fixtures/accuton/C220-6-221.html", import.meta.url), "utf8");
const URL_C220 = "https://accuton.com/home-audio/drivers/ceramic/C220-6-221";

test("listing: product links one level below the listing page only", () => {
  const html = `<a href="https://accuton.com/home-audio/drivers/ceramic/C220-6-221">x</a>
    <a href="/home-audio/drivers/ceramic/C158-6-851/">x</a>
    <a href="https://accuton.com/home-audio/drivers/diamond">other listing</a>
    <a href="https://accuton.com/home-audio/drivers/ceramic">itself</a>
    <a href="https://example.com/home-audio/drivers/ceramic/X">elsewhere</a>`;
  assert.deepEqual(parseListing(html, "/home-audio/drivers/ceramic"), [URL_C220, "https://accuton.com/home-audio/drivers/ceramic/C158-6-851"]);
});

test("page: title, application and spec rows by symbol", () => {
  const p = parsePage(HTML, URL_C220);
  assert.equal(p.title, "C220-6-221*");
  assert.equal(p.application, "Bass-Midrange");
  assert.ok(p.rows.some((r) => r[1] === "Fs" && r[2] === "26.3"));
  assert.ok(p.rows.some((r) => r[0] === "Screwfitting" && r[2] === "DIN 7984 / Ø 4.50"));
  assert.ok(!p.rows.some((r) => r[0] === "Specification"));
});

test("numbers as Accuton writes them", () => {
  assert.equal(num("26.3"), 26.3);
  assert.equal(num("21,37"), 21.37);
  assert.equal(num("0..40"), 0.4);
  assert.equal(num("120*"), 120);
  assert.equal(num("+/-5.25"), 5.25);
  assert.equal(num("-"), undefined);
  assert.equal(num("--"), undefined);
  assert.equal(num("0"), undefined);
});

test("model names, impedance from the code, size, type", () => {
  assert.equal(modelOf("C220-6-221*"), "C220-6-221");
  assert.equal(modelOf("BD 90-6-727"), "BD90-6-727");
  assert.equal(modelOf("Cl173-6-191*"), "CL173-6-191");
  assert.equal(modelOf("C51-6-286 CELL"), "C51-6-286 Cell");
  assert.equal(nominalOf("C220-6-221"), 6);
  assert.equal(nominalOf("C6.5AM-6-670"), 6);
  assert.equal(nominalOf("AS250AM-4-559"), 4);
  assert.equal(nominalOf("P220"), undefined);
  assert.equal(sizeOf(220), 8.5);
  assert.equal(sizeOf(168), 6.5);
  assert.equal(typeOf("Bass-Midrange", 8.5, false), "woofer");
  assert.equal(typeOf("Bass-Midrange", 6.5, false), "midbass");
  assert.equal(typeOf("MIDRANGE", 5, false), "midrange");
  assert.equal(typeOf("Subwoofer", 10, true), "car-audio");
  assert.ok(typeof typeOf("Tweeter", 1, false) !== "string");
  assert.ok(typeof typeOf("Passive-Radiator", 11, false) !== "string");
});

test("product: a valid driver linking to its page, Xmax one-way, Cms checked", () => {
  const r = parseProduct(parsePage(HTML, URL_C220), "2026-11-19");
  assert.equal(r.kind, "driver");
  const d = r.driver!;
  assert.deepEqual(validateDriver(d), []);
  assert.equal(d.brand, "Accuton");
  assert.equal(d.model, "C220-6-221");
  assert.equal(d.nominal_ohms, 6);
  assert.equal(d.type, "woofer");
  assert.equal(d.ts.fs, 26.3);
  assert.equal(d.ts.xmax_mm, 5);
  assert.equal(d.ts.pe_w, 150);
  assert.deepEqual(d.physical, { cutout_mm: 191, depth_mm: 105 });
  assert.equal(d.sources[0]!.url, URL_C220);
  assert.match(d.sources[0]!.note ?? "", /Not covered by CC BY-NC-SA/);
});

test("product: a missing required value skips with the reason", () => {
  const p: Page = { url: "u", title: "C51-6-286 CELL", application: "Midrange", rows: [["Overall diameter", "", "85.6", ""], ["", "Re", "5.6", ""], ["", "Fs", "581", ""], ["", "Vas", "-", ""], ["", "Qms", "4.86", ""], ["", "Qes", "1.61", ""], ["", "Sd", "24", ""]] };
  const r = parseProduct(p, "2026-11-19");
  assert.equal(r.kind, "skip");
  assert.match(r.reason ?? "", /missing vas/);
});
