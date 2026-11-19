import { test } from "node:test";
import assert from "node:assert/strict";
import { cmsMmPerN, kindOf, lfValue, parseProduct, readSpecs, sizeOf, type StoreProduct } from "../src/sica.ts";
import { validateDriver } from "../../schema/src/index.ts";

// Products as sica.it's Store API lists them (values seen 16 Nov 2026).
const attrs = (o: Record<string, string | string[]>) =>
  Object.entries(o).map(([name, v]) => ({ name, terms: (Array.isArray(v) ? v : [v]).map((t) => ({ name: t })) }));
const product = (name: string, cats: string[], a: Record<string, string | string[]>, slug = "x"): StoreProduct => ({
  id: 1,
  name,
  permalink: `https://sica.it/prodotto/${slug}/`,
  categories: cats.map((c) => ({ slug: c })),
  attributes: attrs(a),
});

const SR12 = product(
  "12 SR 4 CP",
  ["12-0", "ferrite", "subwoofer"],
  {
    "Nominal Impedance": "8 Ω", "Rated Power AES": "1000 W", "Continuos Program Power": "2000 W", "Sensitivity @ 1W/1m": "92.6 dB",
    "Baffle Cutout Diameter": "284 mm", "Total Depth": "154.3 mm",
    Re: "5.2 Ω", Qms: "4.78", Qts: "0.30", Cms: "122 µm/N", Vas: "41.7 l", "X max": "+/- 9.0 mm", N: "0.71 %",
    Fs: "38.0 Hz", Qes: "0.31", Mms: "144.6 g", Bxl: "24.00 Tm", Sd: "490.9 cm²", "X var": "+/- 10.0 mm", "Le (1KHz)": "1.77 mH",
  },
  "12-sr-4-cp",
);

test("categories: drivers in, tweeters, horns, compression drivers and Jensen out", () => {
  assert.deepEqual(kindOf(SR12), { kind: "subwoofer" });
  assert.deepEqual(kindOf(product("x", ["15-0", "coaxial", "neodymium"], {})), { kind: "coaxial" });
  assert.deepEqual(kindOf(product("x", ["6-5", "hi-fi-studio-monitor"], {})), { kind: "by-size" });
  assert.deepEqual(kindOf(product("x", ["8-0", "dual-cone"], {})), { kind: "full-range" });
  assert.ok("skip" in kindOf(product("x", ["compression-driver"], {})));
  assert.ok("skip" in kindOf(product("x", ["dome-tweeter"], {})));
  assert.ok("skip" in kindOf(product("x", ["horn"], {})));
  assert.ok("skip" in kindOf(product("x", ["jensen", "12-0"], {})));
  assert.ok("skip" in kindOf(product("x", ["12-0", "ferrite"], {})));
});

test("units, sizes and coaxial values", () => {
  assert.equal(cmsMmPerN("122 µm/N"), 0.122);
  assert.equal(cmsMmPerN("0.122 mm/N"), 0.122);
  assert.equal(sizeOf("21 S 4 PL", "545 mm / 21 in"), 21);
  assert.equal(sizeOf("12 SR 4 CP", undefined), 12);
  assert.equal(sizeOf("6.5 W 1.5 CP", undefined), 6.5);
  assert.equal(lfValue(["LF 5.1 Ω", "HF 6.0 Ω"]), "5.1 Ω");
  assert.equal(lfValue(["LF 44.5 Hz - HF 710 Hz"]), "44.5 Hz");
  assert.equal(lfValue(["LF: 400 W / HF: 60 W"]), "400 W");
  assert.equal(lfValue(["5.2 Ω"]), "5.2 Ω");
  assert.equal(readSpecs(SR12).xmax, "+/- 9.0 mm");
  assert.equal(readSpecs(SR12).le, "1.77 mH");
});

test("12 SR 4 CP: every value, Cms in µm/N, Xvar ignored", () => {
  const r = parseProduct(SR12, "2026-11-16");
  assert.equal(r.kind, "driver", r.reason ?? "");
  const d = r.driver!;
  assert.deepEqual(validateDriver(d), []);
  assert.equal(d.brand, "Sica");
  assert.equal(d.model, "12 SR 4 CP");
  assert.equal(d.type, "subwoofer");
  assert.equal(d.nominal_ohms, 8);
  assert.equal(d.size_in, 12);
  assert.deepEqual(d.ts, { fs: 38, qms: 4.78, qes: 0.31, vas_l: 41.7, re: 5.2, sd_cm2: 490.9, qts: 0.3, le_mh: 1.77, bl: 24, mms_g: 144.6, xmax_mm: 9, pe_w: 1000 });
  assert.deepEqual(d.physical, { cutout_mm: 284, depth_mm: 154.3 });
  assert.equal(d.sources[0]!.url, "https://sica.it/prodotto/12-sr-4-cp/");
  assert.match(d.sources[0]!.note!, /permission/);
  assert.equal(d.notes, undefined);
});

test("coaxial 15 Cx 3 PL T: the woofer's values", () => {
  const p = product(
    "15 Cx 3 PL T",
    ["15-0", "coaxial", "neodymium"],
    {
      "Nominal Impedance": "8+8 Ω", "Rated Power AES": ["LF 400 W", "HF 60 W"], Re: ["LF 5.1 Ω", "HF 6.0 Ω"], Fs: ["LF 44.5 Hz", "HF 710 Hz"],
      Qms: "12.88", Qts: "0.40", Qes: "0.42", Cms: "147 µm/N", Vas: "152.4 l", Mms: "87.2 g", Bxl: "17.26 Tm", Sd: "855.3 cm²",
      "Le (1KHz)": "1.12 mH", "X max": "± 5.5 mm", "Baffle Cutout Diameter": "355 mm", "Total Depth": "178.9 mm",
    },
    "15-cx-3-pl-t",
  );
  const r = parseProduct(p, "2026-11-16");
  assert.equal(r.kind, "driver", r.reason ?? "");
  const d = r.driver!;
  assert.deepEqual(validateDriver(d), []);
  assert.equal(d.type, "woofer");
  assert.equal(d.nominal_ohms, 8);
  assert.equal(d.ts.re, 5.1);
  assert.equal(d.ts.fs, 44.5);
  assert.equal(d.ts.pe_w, 400);
  assert.equal(d.ts.xmax_mm, 5.5);
  assert.match(d.notes!, /^Coaxial: the woofer's parameters/);
});

test("coaxial with a separate attribute per section (as sica.it lists them)", () => {
  const p = product("15 Cx 3 PL T", ["15-0", "coaxial", "neodymium"], {
    "Nominal Impedance LF": "8 Ω", "Nominal Impedance HF": "8 Ω", "Rated Power AES LF": "400 W", "Rated Power AES HF": "60 W",
    "HF Recommended Crossover Frequency": "1.6 kHz", "Re (LF)": "5.1 Ω", "Re (HF)": "6.0 Ω", "Fs (LF)": "44.5 Hz", "Fs (HF)": "710 Hz",
    Qms: "12.88", Qts: "0.40", Qes: "0.42", Cms: "147 µm/N", Vas: "152.4 l", Mms: "87.2 g", Bxl: "17.26 Tm", Sd: "855.3 cm²",
  });
  const r = parseProduct(p, "2026-11-16");
  assert.equal(r.kind, "driver", r.reason ?? "");
  assert.deepEqual([r.driver!.nominal_ohms, r.driver!.ts.re, r.driver!.ts.fs, r.driver!.ts.pe_w], [8, 5.1, 44.5, 400]);
  const noLfRe = parseProduct(product("12 Cx 3 PL", ["coaxial"], { "Re (HF)": "6.0 Ω", "Fs (LF)": "50 Hz" }), "2026-11-16");
  assert.match(noLfRe.reason!, /missing .*re/);
});

test("missing T/S and dual voice coils are skipped with a reason", () => {
  const bare = parseProduct(product("10 W 2", ["professional-woofer"], { Re: "5.5 Ω", Fs: "50 Hz" }), "2026-11-16");
  assert.equal(bare.kind, "skip");
  assert.match(bare.reason!, /missing qms, qes, vas, sd/);
  const dvc = parseProduct(product("12 S 2x4", ["subwoofer"], { "Nominal Impedance": "2x4 Ω", Re: "2x3.4 Ω" }), "2026-11-16");
  assert.equal(dvc.kind, "skip");
  assert.match(dvc.reason!, /dual voice coil/);
});

test("small professional woofers are midbass", () => {
  const p = product("6.5 W 1.5 CP", ["6-5", "professional-woofer"], {
    "Nominal Impedance": "8 Ω", Re: "5.6 Ω", Fs: "70 Hz", Qms: "5.0", Qes: "0.45", Vas: "13 l", Sd: "132 cm²",
  });
  const r = parseProduct(p, "2026-11-16");
  assert.equal(r.kind, "driver", r.reason ?? "");
  assert.equal(r.driver!.type, "midbass");
  assert.equal(r.driver!.size_in, 6.5);
});
