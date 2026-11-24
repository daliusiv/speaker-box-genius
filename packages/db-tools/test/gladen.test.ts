import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dvc, field, parsePage } from "../src/gladen.ts";

// Product pages as gladen.com serves them (24 Nov 2026, trimmed).
const ZETA10 = readFileSync(new URL("./fixtures/gladen/zeta-10.html", import.meta.url), "utf8");
const GAMMA = readFileSync(new URL("./fixtures/gladen/gamma-165-2-ac.html", import.meta.url), "utf8");

test("subwoofer: one coil's values restated for both coils in series", () => {
  const r = parsePage(ZETA10, "https://www.gladen.com/de/gladen/subwoofer/gladen-zeta/zeta-10") as Record<string, unknown>;
  assert.ok(!("skip" in r));
  assert.equal(r.model, "ZETA 10");
  assert.equal(r.kind, "subwoofer");
  assert.equal(r.size_in, 10);
  assert.equal(r.coils, 2);
  assert.equal(r.wiring, "series");
  assert.equal(r.impedance, 4); // 2 x 2 Ω
  assert.equal(r.re, 3.8); // 1,9 Ω (dual) × 2
  assert.equal(r.bl, 15.8); // 7,9 Tm × 2
  assert.equal(r.qes, 0.43); // 0,86 / 2
  assert.equal(r.fs, 26.5);
  assert.equal(r.mms_g, 170);
  assert.equal(r.sd_cm2, 312);
  assert.equal(r.vas_l, 29.3);
  assert.equal(r.xmax_mm, 11.5);
  assert.equal(r.cutout_mm, 231);
  assert.equal(r.depth_mm, 147);
});

test("two-way kit: the woofer's values, not the tweeter's", () => {
  const r = parsePage(GAMMA, "https://www.gladen.com/de/gladen/gladen-lautsprecher/gladen-gamma-lautsprecher/gladen-gamma-165-2-ac") as Record<string, unknown>;
  assert.ok(!("skip" in r));
  assert.equal(r.fs, 59);
  assert.equal(r.re, 2.63);
  assert.equal(r.sd_cm2, 135); // "Sq"
  assert.equal(r.impedance, 3);
  assert.equal(r.pe_w, 100); // "175 | 100 Watt"
  assert.equal(r.size_in, 6.5);
});

test("DVC readings; labels; a page showing another model's values", () => {
  // Qes = 2π·Fs·Mms·Re/Bl²: series values stay as published.
  assert.equal(dvc(2, 1.85, 16.62, 0.51, 36, 153.2).note, undefined);
  assert.match(dvc(2, 1.9, 7.9, 0.86, 26.5, 170).note!, /one coil/);
  assert.equal(field("Resonanzfrequenz (Fs): 36 Hz", "Fs", "Hz"), 36);
  assert.equal(field("Kraftfaktor (BL): 16,62Tm", "B[Ll]|BxL"), 16.62);
  const at = GAMMA.indexOf("Technische Daten");
  const wrong = GAMMA.slice(0, at) + GAMMA.slice(at).replace("Gladen Gamma 165.2 (AC)", "Gladen Sigma 200.2"); // the list's own heading
  assert.match((parsePage(wrong, "https://x/y/z/a/b/c/d") as { skip: string }).skip, /lists the values of/);
});
