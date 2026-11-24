import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kindOfCategory, labelled, parsePage } from "../src/celestion.ts";

// The TSQ1230 product page as celestion.com serves it (24 Nov 2026, trimmed).
const HTML = readFileSync(new URL("./fixtures/celestion/tsq1230.html", import.meta.url), "utf8");
const URL_TSQ = "https://celestion.com/product/tsq1230/";

test("product page: breadcrumb, parameters and mounting", () => {
  const r = parsePage(HTML, URL_TSQ);
  assert.ok(!("skip" in r));
  assert.equal(r.model, "TSQ1230");
  assert.equal(r.kind, "woofer");
  assert.equal(r.size_in, 12);
  assert.equal(r.impedance, 8);
  assert.equal(r.fs, 55);
  assert.equal(r.qts, 0.303);
  assert.equal(r.vas_l, 45.2);
  assert.equal(r.bl, 20.5); // "BI"
  assert.equal(r.mms_g, 69.5);
  assert.equal(r.sd_cm2, 530.93);
  assert.equal(r.le_mh, 0.72); // "Le (at 1kHz)"
  assert.equal(r.xmax_mm, 6.75);
  assert.equal(r.xmech_mm, 8); // 16 mm peak to peak
  assert.equal(r.pe_w, 700); // AES, not the continuous rating
  assert.equal(r.cutout_mm, 285);
  assert.equal(r.depth_mm, 140.1);
});

test("summary line above the list doesn't fool it; categories", () => {
  const summary = HTML.replace("Specifications", "Specifications 8in Diameter 300W Continuous power rating 8Ω Rated impedance 94dB Sensitivity");
  const r = parsePage(summary, URL_TSQ);
  assert.ok(!("skip" in r));
  assert.equal(r.impedance, 8);
  assert.equal(kindOfCategory("Coaxial Loudspeakers"), "coaxial");
  assert.equal(kindOfCategory("HF Compression Drivers"), undefined);
  assert.equal(kindOfCategory("Guitar & Bass Speakers / Bass Guitar Speakers"), undefined);
  assert.equal(kindOfCategory("Legacy / Legacy Pro Audio"), "woofer");
  assert.equal(labelled("Vas 45.12I / 1.59ft 3", "Vas"), 45.12);
});
