import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { impedanceOf, kindOfListing, parsePage, tsValue } from "../src/volt.ts";
import { toCsv } from "../src/site-sheet.ts";

// The B2500.1 product page as voltloudspeakers.co.uk serves it (24 Nov 2026, trimmed).
const HTML = readFileSync(new URL("./fixtures/volt/b2500-1.html", import.meta.url), "utf8");
const URL_B2500 = "https://voltloudspeakers.co.uk/speaker/b2500-1-10inch/";

test("product page: T/S table, specifications and mounting", () => {
  const r = parsePage(HTML, URL_B2500, "https://voltloudspeakers.co.uk/bass-speakers/");
  assert.ok(!("skip" in r));
  assert.equal(r.model, "B2500.1");
  assert.equal(r.kind, "woofer");
  assert.equal(r.size_in, 10);
  assert.equal(r.impedance, 8); // "8, 16, or 24" with Re 5.7
  assert.equal(r.fs, 39);
  assert.equal(r.qts, 0.34);
  assert.equal(r.qes, 0.41); // "Qe"
  assert.equal(r.qms, 2.21); // "Qa"
  assert.equal(r.vas_l, 26);
  assert.equal(r.sd_cm2, 337);
  assert.equal(r.xmax_mm, 5.5); // "±5.5mm"
  assert.equal(r.bl, 18.7); // from the specifications
  assert.equal(r.mms_g, 104); // "Effective Moving Mass (Kg): 0.104"
  assert.equal(r.pe_w, 250);
  assert.equal(r.cutout_mm, 253); // front mount
  assert.equal(r.depth_mm, 111.5); // below the front flange
  assert.match(toCsv([r]), /^Model,URL,Type,/);
});

test("pages without T/S values are skipped", () => {
  const radial = HTML.replace(/Qt[\s\S]*?0\.34/, "Qts n/a");
  assert.ok("skip" in parsePage(radial, URL_B2500));
  assert.equal(tsValue("Fs 502Hz Qms n/a", ["Qms"]), undefined);
});

test("impedance: the lowest listed at or above Re; listing → type", () => {
  assert.equal(impedanceOf("4, 8, or 16", 5.8), 8);
  assert.equal(impedanceOf("4 or 8", 3.2), 4);
  assert.equal(impedanceOf("8", 5.5), 8);
  assert.equal(kindOfListing("https://voltloudspeakers.co.uk/sub-bass-speakers/", "SB220.1"), "subwoofer");
  assert.equal(kindOfListing(undefined, "CX160.1"), "coaxial");
});
