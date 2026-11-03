import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  firstNumber,
  parseCategory,
  parseCm2,
  parseInches,
  parseLitres,
  parseMm,
  parseProduct,
  reconcile,
  slugOf,
} from "../src/dayton.ts";
import { validateDriver } from "../../schema/src/index.ts";

const fx = (f: string) => readFileSync(join(import.meta.dirname, "fixtures/dayton", f), "utf8");
const URL = "https://www.daytonaudio.com/product/121/rss315hf-4-12-reference-hf-subwoofer-4-ohm";

test("unit parsing", () => {
  assert.equal(firstNumber("1,317.4 cm³"), 1317.4);
  assert.equal(parseInches('12"'), 12);
  assert.equal(parseInches('6-1/2"'), 6.5);
  assert.equal(parseInches('5-1/4"'), 5.25);
  assert.equal(parseInches('3/4"'), 0.75);
  assert.equal(parseMm("282 mm"), 282);
  assert.equal(parseMm('11.1"'), 281.9);
  assert.equal(parseLitres("84.1 liters"), 84.1);
  assert.equal(parseLitres("2.97 ft³"), 84.1);
  assert.equal(parseCm2("514.7 cm²"), 514.7);
  assert.equal(parseCm2("35630 mm²"), 356.3);
  assert.equal(slugOf("RSS315HF-4"), "rss315hf-4");
  assert.equal(slugOf("ODEUM 18F"), "odeum-18f");
});

test("category page: product links", () => {
  const links = parseCategory(fx("category-121.html"));
  assert.equal(links.length, 20);
  assert.ok(links.includes("https://www.daytonaudio.com/product/1792/mx12-22-12-max-x-high-excursion-dvc-subwoofer-2-ohms-per-coil"));
});

test("product page: RSS315HF-4, with its wrong Bl dropped", () => {
  const p = parseProduct(fx("rss315hf-4.html"), URL, "2026-11-03");
  assert.equal(p.kind, "driver");
  const d = p.driver!;
  assert.deepEqual(validateDriver(d), []);
  assert.equal(d.model, "RSS315HF-4");
  assert.equal(d.type, "subwoofer");
  assert.equal(d.nominal_ohms, 4);
  assert.equal(d.size_in, 12);
  assert.deepEqual(
    { fs: d.ts.fs, qms: d.ts.qms, qes: d.ts.qes, vas: d.ts.vas_l, re: d.ts.re, sd: d.ts.sd_cm2, mms: d.ts.mms_g, xmax: d.ts.xmax_mm, pe: d.ts.pe_w, le: d.ts.le_mh },
    { fs: 24.2, qms: 2.83, qes: 0.45, vas: 84.1, re: 3.1, sd: 514.7, mms: 188, xmax: 14.3, pe: 400, le: 0.96 },
  );
  // The product page says "1 Tm" (the spec sheet says 13.99): dropped, with a note.
  assert.equal(d.ts.bl, undefined);
  assert.match(d.notes ?? "", /Bl 1 T·m disagrees/);
  assert.deepEqual(d.physical, { cutout_mm: 282, depth_mm: 146 });
  assert.equal(d.sources[0]!.url, URL);
  assert.match(d.sources[1]!.url!, /295-464-dayton-audio-rss315hf-4-specifications/);
  assert.equal(d.voice_coils, undefined);
});

const row = (k: string, v: string) => `<tr><td>${k}</td><td>${v}</td></tr>`;
const page = (title: string, rows: [string, string][], extra = "") =>
  `<h1>${title}</h1>${extra}<table>${rows.map(([k, v]) => row(k, v)).join("")}</table>`;
const MX12: [string, string][] = [
  ["Model Number", "MX12-22"],
  ["Speaker Type", "Subwoofer"],
  ["Nominal Diameter", '12"'],
  ["Impedance", "4 ohms (2 ohms per coil)"],
  ["DC Resistance (Re)", "3.95 ohms"],
  ["Resonant Frequency (Fs)", "28.8 Hz"],
  ["Mechanical Q (Qms)", "3.25"],
  ["Electromagnetic Q (Qes)", "0.39"],
  ["Total Q (Qts)", "0.35"],
  ["Diaphragm Mass Inc. Airload (Mms)", "252g"],
  ["BL Product (BL)", "21.5 Tm"],
  ["Surface Area Of Cone (Sd)", "514.7 cm²"],
  ["Compliance Equivalent Volume (Vas)", "1.61 ft³"],
  ["Maximum Linear Excursion (Xmax)", "15.5 mm"],
];

test("dual voice coil: stated wiring wins, nominal is for that wiring", () => {
  const p = parseProduct(
    page("MX12-22 12&quot; Max-X DVC Subwoofer 2 Ohms Per Coil", MX12, "<p>Note: All specifications measured with the voice coils wired in series for a 4 ohm load.</p>"),
    URL,
    "2026-11-03",
  );
  assert.equal(p.kind, "driver");
  assert.equal(p.driver!.voice_coils, 2);
  assert.equal(p.driver!.ts_wiring, "series");
  assert.equal(p.driver!.nominal_ohms, 4);
  assert.equal(p.driver!.ts.vas_l, 45.6);
  assert.equal(p.driver!.notes, undefined);
});

test("dual voice coil: wiring inferred from Re when not stated", () => {
  const rows = MX12.map(([k, v]): [string, string] => (k === "Impedance" ? [k, "8+8 ohms"] : [k, v]));
  const p = parseProduct(page("SD315A-88 12&quot; DVC Subwoofer", rows), URL, "2026-11-03");
  assert.equal(p.driver!.ts_wiring, "parallel"); // Re 3.95 with 8 Ω coils
  assert.equal(p.driver!.nominal_ohms, 4);
  assert.match(p.driver!.notes!, /inferred from Re/);
});

test("tweeters and drivers missing parameters are skipped", () => {
  assert.equal(parseProduct(page("x", [["Model Number", "ND25FA-4"], ["Speaker Type", "Tweeter"]]), URL, "d").kind, "skip");
  const p = parseProduct(page("x", MX12.filter(([k]) => !k.includes("Qms"))), URL, "d");
  assert.equal(p.kind, "skip");
  assert.match(p.reason!, /missing qms/);
});

test("reconcile: wrong Vas is recalculated from Cms when Mms and Cms agree", () => {
  // RSS315HF-4 values with Vas typed as 48 L instead of 84.1 L.
  const ts = { fs: 24.2, qms: 2.83, qes: 0.45, vas_l: 48, re: 3.1, sd_cm2: 514.7, mms_g: 188 };
  const notes: string[] = [];
  assert.equal(reconcile(ts, 0.23, notes), true);
  assert.ok(Math.abs(ts.vas_l - 84) < 3, String(ts.vas_l));
  assert.match(notes[0]!, /Vas recalculated/);
});

test("reconcile: drops a lone bad Mms; nothing to compare means no change", () => {
  const ts = { fs: 24.2, qms: 2.83, qes: 0.45, vas_l: 84.1, re: 3.1, sd_cm2: 51.47 }; // Sd typed 10× small, no Mms/Bl
  assert.equal(reconcile(ts, undefined, []), true); // nothing to compare against: passes as published
  const ts2 = { fs: 24.2, qms: 2.83, qes: 0.45, vas_l: 84.1, re: 3.1, sd_cm2: 514.7, mms_g: 50 };
  const notes: string[] = [];
  assert.equal(reconcile(ts2, undefined, notes), true);
  assert.equal(ts2.mms_g, undefined);
});
