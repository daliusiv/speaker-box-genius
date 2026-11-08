import { test } from "node:test";
import assert from "node:assert/strict";
import { ATTRIBUTION, convert, nominalOhms, sdFitsSize, sizeInches, type DbRecord } from "../src/driverbase.ts";
import { validateDriver } from "../../schema/src/index.ts";

/** 18 Sound 15ND840 as driver-base publishes it (matches 18 Sound's page). */
const rec = (over: Partial<DbRecord> = {}): DbRecord => ({
  manufacturer: "18Sound",
  canonical_id: "eighteensound__15nd840__8ohm",
  driver_kind: "lf_woofer",
  model: "15ND840",
  source_urls: ["https://www.eighteensound.it/en/products/lf-driver/15-0/8/15nd840"],
  fetched_at: "2026-10-18T00:55:56+00:00",
  fs_hz: 43,
  qts: 0.37,
  qes: 0.39,
  qms: 6.6,
  vas_liters: 163,
  re_ohm: 5,
  le_mh: 0.43,
  bl_tm: 17.9,
  mms_g: 94,
  sd_cm2: 881.4,
  xmax_mm: 9.5,
  impedance_nominal_ohm: 8,
  nominal_size_mm: 393,
  mounting_diameter_mm: 354,
  depth_mm: 184,
  power_aes_watts: 600,
  ...over,
});
const one = new Map<string, number>();

test("converts a clean record, keeps every value and credits driver-base", () => {
  const c = convert(rec(), one);
  assert.equal(c.kind, "driver");
  const d = c.driver!;
  assert.deepEqual(validateDriver(d), []);
  assert.equal(c.brandSlug, "18-sound");
  assert.equal(c.slug, "15nd840");
  assert.equal(d.brand, "18 Sound");
  assert.equal(d.size_in, 15);
  assert.equal(d.type, "woofer"); // 15", but Fs 43 Hz
  assert.deepEqual(d.ts, { fs: 43, qms: 6.6, qes: 0.39, vas_l: 163, re: 5, sd_cm2: 881.4, qts: 0.37, le_mh: 0.43, bl: 17.9, mms_g: 94, xmax_mm: 9.5, pe_w: 600 });
  assert.deepEqual(d.physical, { cutout_mm: 354, depth_mm: 184 });
  assert.equal(d.sources[0]!.url, "https://www.eighteensound.it/en/products/lf-driver/15-0/8/15nd840");
  assert.equal(d.sources[0]!.retrieved, "2026-10-18");
  assert.equal(d.sources[0]!.note, ATTRIBUTION);
  assert.match(ATTRIBUTION, /CC BY 4\.0/);
  assert.equal(d.notes, undefined);
});

test("impedance variants get their own names and files", () => {
  const c = convert(rec(), new Map([["18Sound|15ND840", 2]]));
  assert.equal(c.driver!.model, "15ND840 (8 Ω)");
  assert.equal(c.slug, "15nd840-8ohm");
});

test("Dayton Audio, unknown brands and tweeters are skipped", () => {
  assert.equal(convert(rec({ manufacturer: "Dayton Audio" }), one).kind, "skip");
  assert.equal(convert(rec({ manufacturer: "Nobody" }), one).kind, "skip");
  assert.equal(convert(rec({ driver_kind: "tweeter" }), one).kind, "skip");
  assert.equal(convert(rec({ source_urls: [] }), one).kind, "skip");
  assert.equal(convert(rec({ model: "SW26DAC76-3-DV" }), one).kind, "skip"); // dual voice coil, wiring unknown
});

test("Vas published in cubic feet is recognised", () => {
  const c = convert(rec({ vas_liters: 163 / 28.3168 }), one);
  assert.equal(c.kind, "driver");
  assert.ok(Math.abs(c.driver!.ts.vas_l - 163) < 0.5);
  assert.match(c.notes.join(" "), /cubic feet/);
});

test("big disagreements are left for a human instead of being 'fixed'", () => {
  const c = convert(rec({ vas_liters: 20 }), one);
  assert.equal(c.kind, "skip");
  assert.match(c.reason!, /too much to fix/);
});

test("a Qts that contradicts Qes and Qms is skipped", () => {
  const c = convert(rec({ qts: 0.6 }), one);
  assert.equal(c.kind, "skip");
  assert.match(c.reason!, /Qts/);
});

test("an Sd that can't fit the frame is skipped", () => {
  assert.match(sdFitsSize(134, 457)!, /doesn't fit/);
  assert.match(sdFitsSize(5000, 305)!, /doesn't fit/);
  assert.equal(sdFitsSize(881.4, 393), undefined);
  const c = convert(rec({ sd_cm2: 134 }), one);
  assert.equal(c.kind, "skip");
});

test("Qes is derived from Qts and Qms when missing", () => {
  const c = convert(rec({ qes: null }), one);
  assert.equal(c.kind, "driver");
  assert.ok(Math.abs(c.driver!.ts.qes - 0.391) < 0.002);
  assert.match(c.notes.join(" "), /Qes .* calculated/);
});

test("sizes and impedances", () => {
  assert.equal(sizeInches(393), 15);
  assert.equal(sizeInches(165), 6.5);
  assert.equal(sizeInches(254), 10);
  assert.equal(sizeInches(undefined), undefined);
  assert.deepEqual(nominalOhms(undefined, 5.6), { ohms: 8, guessed: true });
  assert.deepEqual(nominalOhms(undefined, 3.2), { ohms: 4, guessed: true });
  assert.deepEqual(nominalOhms(16, 12), { ohms: 16, guessed: false });
});

test("types: full-range, guitar, midbass and subwoofer", () => {
  assert.equal(convert(rec({ driver_kind: "fullrange" }), one).driver!.type, "full-range");
  const g = convert(rec({ driver_kind: "guitar_bass" }), one);
  assert.equal(g.driver!.type, "other");
  assert.match(g.driver!.notes!, /Guitar/);
  assert.equal(convert(rec({ nominal_size_mm: 165, sd_cm2: 132, vas_liters: 163 * (132 / 881.4) ** 2 }), one).driver!.type, "midbass");
});

test("an impedance below Re is replaced by an estimate", () => {
  const c = convert(rec({ impedance_nominal_ohm: 2 }), one); // Re 5 Ω
  assert.equal(c.driver!.nominal_ohms, 8);
  assert.match(c.notes.join(" "), /below Re/);
});

test("a size smaller than the cone falls back to the model name", () => {
  const c = convert(rec({ model: '15" Test', nominal_size_mm: 12.7 }), one);
  assert.equal(c.driver!.size_in, 15);
  assert.match(c.notes.join(" "), /model name/);
  assert.equal(convert(rec({ nominal_size_mm: 12.7 }), one).driver!.size_in, undefined);
});

test("every brand we import from the manufacturer is on DIRECT_BRANDS, so driver-base can't add to it", async () => {
  const { DIRECT_BRANDS } = await import("../src/driverbase.ts");
  const { readdirSync, readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { REPO_ROOT } = await import("../src/load.ts");
  const dir = join(REPO_ROOT, "drivers");
  for (const b of readdirSync(dir, { withFileTypes: true })) {
    if (!b.isDirectory() || !existsSync(join(dir, b.name, "_brand.json"))) continue;
    const files = readdirSync(join(dir, b.name)).filter((f) => f.endsWith(".json") && f !== "_brand.json");
    const fromDriverBase = files.filter((f) => readFileSync(join(dir, b.name, f), "utf8").includes("driver-base")).length;
    // A brand with a real set of entries and none from driver-base came from the manufacturer
    // (a handful entered by hand, like Scan-Speak's three, doesn't count).
    if (files.length >= 10 && fromDriverBase === 0) {
      const name = JSON.parse(readFileSync(join(dir, b.name, "_brand.json"), "utf8")).name;
      assert.ok(DIRECT_BRANDS.has(name), `${name}: ${files.length} entries from the manufacturer, not on DIRECT_BRANDS`);
    }
  }
});
