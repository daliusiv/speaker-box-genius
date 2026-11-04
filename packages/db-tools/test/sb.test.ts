import { test } from "node:test";
import assert from "node:assert/strict";
import { kindOf, parseName, parseProduct, perCoil, readSpecs, specItems, type StoreProduct } from "../src/sb.ts";
import { validateDriver, validatePassiveRadiator } from "../../schema/src/index.ts";

// Spec lists as sbacoustics.com shows them (seen 4 Nov 2026), after the site's menu items.
const NAV = ["DRIVERS", "SB14ST-C000-4 / Fabric", "SATORI TW29R / Fabric", "Passive Radiators 4″ SB12PACR-00 / Aluminum", "Nominal sizes 4&#8243; to 15″"];
const page = (items: string[], pdf = "https://sbacoustics.com/wp-content/uploads/2024/04/x.pdf") =>
  `<ul>${NAV.map((x) => `<li><a href="#">${x}</a></li>`).join("")}</ul><div class="specs"><ul>${items
    .map((x) => `<li>${x.replace(/cm2$/, "cm<sup>2</sup>")}</li>`)
    .join("\n")}</ul></div><a href="${pdf}">Datasheet</a>`;
const product = (name: string, cats: string[], slug = "x"): StoreProduct => ({
  id: 1,
  name,
  permalink: `https://sbacoustics.com/product/${slug}/`,
  categories: cats.map((c) => ({ slug: c })),
});

const MW19TX = [
  "Nominal Impedance 4 Ω", "DC resistance, Re 3.4 Ω", "Voice coil inductance, Le 0.14 mH", "Effective piston area, Sd 158 cm2",
  "Voice coil diameter 39 mm", "Voice coil height 19.6 mm", "Air gap height 6 mm", "Linear coil travel (p-p) 13.6 mm",
  "Magnetic flux density 1.1 T", "Magnet weight 0.15 kg", "Net weight 1.46 kg", "Free air resonance, Fs 32 Hz",
  "Sensitivity (2.83V/1m) 93 dB", "Mechanical Q-factor, Qms 5.43", "Electrical Q-factor, Qes 0.28", "Total Q-factor, Qts 0.27",
  "Moving mass incl. air,Mms 16.2 g", "Force factor, Bl 6.3 Tm", "Equivalent volume, Vas 53.2 liters", "Compliance, Cms 1.52 mm/N",
  "Mechanical loss, Rms 0.6 kg/s", "Rated power handling* 70 W",
];

test("names, units and categories", () => {
  assert.deepEqual(parseName("7½″ SATORI MW19TX-4 / TeXtreme"), { model: "MW19TX-4", size_in: 7.5 });
  assert.deepEqual(parseName("4&#8243; SB12NRX25-4 / Norex"), { model: "SB12NRX25-4", size_in: 4 });
  assert.deepEqual(parseName("5&#215;8″ SB15SFCR39-4 / Paper"), { model: "SB15SFCR39-4" });
  assert.deepEqual(parseName("6″ SB17BAC35-8-COAX/ aluminum"), { model: "SB17BAC35-8-COAX", size_in: 6 });
  assert.deepEqual(perCoil("2 x 2.4 Ω"), { coils: 2, value: 2.4 });
  assert.deepEqual(perCoil("3.4 Ω"), { coils: 1, value: 3.4 });
  assert.deepEqual(kindOf(product("x", ["hard-midwoofers", "kits", "midwoofers", "satori-midwoofers"])), { kind: "midbass" });
  assert.deepEqual(kindOf(product("x", ["oem", "shallow-subwoofers-oem"])), { kind: "subwoofer" });
  assert.deepEqual(kindOf(product("x", ["passive-radiators", "soft-passive-radiators"])), { kind: "passive-radiator" });
  assert.ok("skip" in kindOf(product("x", ["satori-tweeters", "tweeters"])));
  assert.ok("skip" in kindOf(product("Ara", ["kits-kits", "open-source-kits"])));
});

test("MW19TX-4: every value, Xmax from the coil travel, menu items ignored", () => {
  assert.equal(readSpecs(specItems(page(MW19TX))).fs, "32 Hz");
  const r = parseProduct(product("7½″ SATORI MW19TX-4 / TeXtreme", ["midwoofers", "satori-midwoofers"], "mw19tx"), page(MW19TX), "2026-11-04");
  assert.equal(r.kind, "driver", r.reason);
  const d = r.driver!;
  assert.deepEqual(validateDriver(d), []);
  assert.equal(d.model, "MW19TX-4");
  assert.equal(d.type, "midbass");
  assert.equal(d.nominal_ohms, 4);
  assert.equal(d.size_in, 7.5);
  assert.deepEqual(d.ts, { fs: 32, qms: 5.43, qes: 0.28, vas_l: 53.2, re: 3.4, sd_cm2: 158, qts: 0.27, le_mh: 0.14, bl: 6.3, mms_g: 16.2, xmax_mm: 6.8, pe_w: 70 });
  assert.equal(d.sources[0]!.url, "https://sbacoustics.com/product/mw19tx/");
  assert.match(d.sources[0]!.note!, /permission/);
  assert.equal(d.sources[1]!.url, "https://sbacoustics.com/wp-content/uploads/2024/04/x.pdf");
  assert.match(d.notes!, /half the published linear coil travel/);
});

test("dual voice coil sub: per-coil values, parallel Bl", () => {
  const items = [
    "Nominal Impedance 2 x 3 Ω", "DC resistance, Re 2 x 2.4 Ω", "Effective piston area, Sd 312 cm2", "Voice coil diameter 75.5 mm",
    "Linear coil travel (p-p) 24 mm", "Free air resonance, Fs 19.5 Hz", "Sensitivity (2.83V/1m) 88/82 dB", "Mechanical Q-factor, Qms 5.96",
    "Electrical Q-factor, Qes 0.29", "Total Q-factor, Qts 0.28", "Moving mass incl. air,Mms 185 g", "Force factor, Bl(par./ser.) 9.7/19.4 Tm",
    "Equivalent volume, Vas 49.7 ltr.", "Compliance, Cms 0.36 mm/N", "Mechanical loss, Rms 3.8 kg/s", "Rated power handling* 300 W",
  ];
  const r = parseProduct(product("10″ SW26DBAC76-3-DV / Aluminum", ["oem", "shallow-subwoofers-oem"]), page(items), "2026-11-04");
  assert.equal(r.kind, "driver", r.reason);
  const d = r.driver!;
  assert.deepEqual(validateDriver(d), []);
  assert.equal(d.voice_coils, 2);
  assert.equal(d.ts_wiring, "parallel");
  assert.equal(d.ts.re, 1.2);
  assert.equal(d.ts.bl, 9.7);
  assert.equal(d.nominal_ohms, 1.5);
  assert.equal(d.ts.xmax_mm, 12);
  assert.equal(d.type, "subwoofer");
  assert.match(d.notes!, /OEM only/);
});

test("coaxial: the woofer block only", () => {
  const items = [
    "Nominal Impedance 8 Ω", "DC resistance, Re 5.2 Ω", "Voice coil inductance, Le 0.13 mH", "Effective piston area, Sd 108 cm2",
    "Linear coil travel (p-p) 6.2 mm", "Free air resonance, Fs 35.2 Hz", "Mechanical Q-factor, Qms 4.1", "Electrical Q-factor, Qes 0.36",
    "Total Q-factor, Qts 0.33", "Moving mass incl. air,Mms 10.2 g", "Force factor, Bl 5.7 Tm", "Equivalent volume, Vas 33.1 liters",
    "Compliance, Cms 2.0 mm/N", "Mechanical loss, Rms 0.55 kg/s", "Rated power handling* 45 W",
    "Nominal Impedance 4 Ω", "DC resistance, Re 3.6 Ω", "Free air resonance, Fs 1350 Hz", "Rated power handling* 30 W",
  ];
  const r = parseProduct(product("6″ SB17BAC35-8-COAX/ aluminum", ["coaxial-family-product", "coaxials"]), page(items), "2026-11-04");
  assert.equal(r.kind, "driver", r.reason);
  assert.equal(r.driver!.ts.fs, 35.2);
  assert.equal(r.driver!.ts.re, 5.2);
  assert.equal(r.driver!.nominal_ohms, 8);
  assert.match(r.driver!.notes!, /Coaxial/);
});

test("passive radiator: Xmech used for Xmax, said so", () => {
  const items = [
    "Effective piston area, Sd 210 cm2", "Free air resonance, Fs 19 Hz", "Compliance, Cms 0.5 mm/N", "Moving mass incl. air,Mms 141 g",
    "Maximum mechanical cone excursion,Xmech ± 19mm", "Mechanical loss, Rms 1.1 kg/s", "Mechanical Q-factor, Qms 15.3",
    "Equivalent volume, Vas 31.2 liters", "Net weight 0.89 kg",
  ];
  const r = parseProduct(product("8″ SB23MFCL-00 / Polyprophylene", ["passive-radiators", "soft-passive-radiators"]), page(items), "2026-11-04");
  assert.equal(r.kind, "passive-radiator", r.reason);
  const pr = r.pr!;
  assert.deepEqual(validatePassiveRadiator(pr), []);
  assert.deepEqual(pr.params, { mms_g: 141, sd_cm2: 210, xmax_mm: 19, fs: 19, qms: 15.3, vas_l: 31.2, cms_mm_per_n: 0.5 });
  assert.equal(pr.size_in, 8);
  assert.match(pr.notes!, /Xmech/);
});

test("missing values: skipped with the reason", () => {
  const r = parseProduct(product("6″ SB16PFC25-4 / Paper", ["midwoofers"]), page(MW19TX.filter((x) => !/Vas|Qes/.test(x))), "2026-11-04");
  assert.equal(r.kind, "skip");
  assert.match(r.reason!, /missing qes, vas/);
});
