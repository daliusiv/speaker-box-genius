import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDriver, validatePassiveRadiator } from "../../schema/src/index.ts";
import { brandCase, hintLines, leadingNumber, modelCase, parseIssue, sizeInches } from "../src/issue.ts";

const opts = { issue: 12, author: "alice", today: "2026-11-03" };

const DRIVER_BODY = `### Brand

Dayton Audio

### Model

RSS210HF-4

### Driver type

subwoofer

### Nominal impedance (Ω)

4

### Nominal size (inches)

8

### Thiele/Small parameters

Fs (Hz): 28.5
Qms: 3.2
Qes: 0.48
Qts:
Vas (L): 23.4
Re (Ω): 3.3
Le (mH): 0.9
Bl (T·m): 9.1
Mms (g): 62
Sd (cm²): 220
Xmax (mm, one way): 10.5
Pe (W, RMS): 250

### Physical data (optional, helps the volume calculator)

Displacement volume (L):
Cutout diameter (mm): 186
Mounting depth (mm): 120

### Datasheet link

https://www.example.com/rss210hf-4.pdf

### Your own measurements (optional)

_No response_

### Confirmation

- [X] These values come from the linked datasheet or my own measurement, not from another database or website.
- [X] I agree that my submission is licensed under CC BY-NC-SA 4.0 (see LICENSE-DATA).`;

test("a driver issue becomes a valid database record", () => {
  const r = parseIssue(DRIVER_BODY, opts);
  assert.equal(r.kind, "driver");
  assert.equal(r.brandSlug, "dayton-audio");
  assert.equal(r.modelSlug, "rss210hf-4");
  assert.deepEqual(validateDriver(r.record), []);
  const ts = r.record.ts as Record<string, number>;
  assert.equal(ts.fs, 28.5);
  assert.equal(ts.vas_l, 23.4);
  assert.equal(ts.xmax_mm, 10.5);
  assert.equal(ts.pe_w, 250);
  assert.equal(ts.qts, undefined); // left blank
  assert.deepEqual(r.record.physical, { cutout_mm: 186, depth_mm: 120 });
  const src = (r.record.sources as Record<string, string>[])[0]!;
  assert.equal(src.url, "https://www.example.com/rss210hf-4.pdf");
  assert.match(src.note!, /issue #12 by @alice/);
});

test("a passive radiator issue becomes a valid database record", () => {
  const body = `### Brand

Dayton Audio

### Model

DSA215-PR

### Nominal size (inches)

8

### Parameters

Fs (Hz, with no added mass): 30
Qms: 6.1
Vas (L): 40
Mms (g, with no added mass): 45
Cms (mm/N):
Sd (cm²): 214
Xmax (mm, one way): 9
Maximum added mass (g): 150

### Physical data (optional)

Displacement volume (L): 0.4

### Datasheet link

https://www.example.com/dsa215-pr

### Confirmation

- [X] yes`;
  const r = parseIssue(body, opts);
  assert.equal(r.kind, "passive-radiator");
  assert.deepEqual(validatePassiveRadiator(r.record), []);
  const p = r.record.params as Record<string, number>;
  assert.deepEqual(p, { fs: 30, qms: 6.1, vas_l: 40, mms_g: 45, sd_cm2: 214, xmax_mm: 9, max_added_mass_g: 150 });
});

test("a passive radiator issue with only Xmech keeps it as Xmech", () => {
  const body = `### Brand

Dayton Audio

### Model

DSA215-PR

### Parameters

Fs (Hz, with no added mass): 30
Qms: 6.1
Vas (L): 40
Mms (g, with no added mass): 45
Sd (cm²): 214
Xmax (mm, one way):
Xmech (mm, one way, only if no Xmax): 12

### Datasheet link

https://www.example.com/dsa215-pr

### Confirmation

- [X] yes`;
  const r = parseIssue(body, opts);
  assert.deepEqual(validatePassiveRadiator(r.record), []);
  const p = r.record.params as Record<string, number>;
  assert.equal(p.xmech_mm, 12);
  assert.equal(p.xmax_mm, undefined);
});

test("own measurements become a second source", () => {
  const r = parseIssue(DRIVER_BODY.replace("_No response_", "DATS v3, added mass 20 g"), opts);
  const src = r.record.sources as Record<string, string>[];
  assert.deepEqual(src[1], { kind: "measured", by: "github:alice", method: "DATS v3, added mass 20 g" });
});

test("missing brand or model is reported", () => {
  assert.throws(() => parseIssue("### Model\n\nX", opts), /Brand and a Model/);
});

const REAL = `### Brand

Dayton Audio

### Model

DSA215-8

### Driver type

woofer

### Nominal impedance (Ω)

8

### Thiele/Small parameters

Fs (Hz):35
Qms:1.87
Qes:0.40
Vas (L):37.4
Re (Ω):5.9
Sd (cm²):211.2
Xmax (mm, one way):5.5

### Physical data (optional, helps the volume calculator)

Displacement volume (L):0.1162
Cutout diameter (mm):216.5
Mounting depth (mm):3.5

### Datasheet link

https://example.com/x.pdf`;

test("inches in a mm field: the error says so", () => {
  const r = parseIssue(REAL, opts);
  const errs = validateDriver(r.record);
  assert.ok(errs.some((e) => /depth_mm: 3.5 .*if that.s inches, 3.5 in is 88.9 mm/.test(e)), errs.join("\n"));
});

test("units typed after the value are converted", () => {
  const r = parseIssue(REAL.replace("Mounting depth (mm):3.5", "Mounting depth (mm): 3.5 in").replace("Cutout diameter (mm):216.5", 'Cutout diameter (mm): 7.25"'), opts);
  const ph = r.record.physical as Record<string, number>;
  assert.equal(ph.depth_mm, 88.9);
  assert.equal(ph.cutout_mm, 184.15);
  assert.deepEqual(validateDriver(r.record), []);
});

test("a datasheet that gives Mmd: stored as Mms (air load added from Sd)", () => {
  const r = parseIssue(DRIVER_BODY.replace("Mms (g): 62", "Mms (g):\nMmd (g, without air load): 58.24"), opts);
  assert.deepEqual(validateDriver(r.record), []);
  const ts = r.record.ts as Record<string, number>;
  // Sd 220 cm²: 16ρa³/3 = 3.763 g of air load.
  assert.ok(Math.abs(ts.mms_g! - 62.0) < 0.01, `Mms ${ts.mms_g}`);
});

// The first real submission (public #214): "2 ohm" was rejected as a missing
// impedance, brand and model came in lower case, and the link was for a sibling model.
const EDGE_BODY = `### Brand

edge

### Model

eds15d2-e3

### Driver type

subwoofer

### Nominal impedance (Ω)

2 ohm

### Voice coils

Dual (DVC)

### Dual voice coil wiring

Series

### Nominal size (inches)

15"

### Thiele/Small parameters

Fs (Hz): 36
Qms: 4.122
Qes: 0.612
Qts: 0.533
Vas (L): 8.187
Re (Ω): 3.6
Le (mH): 2.4
Bl (T·m): 19.6
Mms (g): 283
Sd (cm²): 295
Xmax (mm, one way): 28.5
Pe (W, RMS): 1850

### Datasheet link

https://edgecaraudio.com/products/edge-street-series-eds15d2-e0-subwoofer

### Your own measurements (optional)

_No response_`;

test("units after the impedance and size are accepted; casing and DVC fields come through", () => {
  const r = parseIssue(EDGE_BODY, opts);
  assert.equal(r.record.nominal_ohms, 4, "2 Ω per coil, wired in series");
  assert.equal(r.record.size_in, 15);
  assert.equal(r.record.brand, "Edge");
  assert.equal(r.record.model, "EDS15D2-E3");
  assert.equal(r.modelSlug, "eds15d2-e3");
  assert.equal(r.record.voice_coils, 2);
  assert.equal(r.record.ts_wiring, "series");
  assert.deepEqual(validateDriver(r.record), []);
});

test("DVC: wiring left as Not stated is worked out from Re, with a note", () => {
  const r = parseIssue(EDGE_BODY.replace("\nSeries\n", "\nNot stated\n"), opts);
  assert.equal(r.record.ts_wiring, "series");
  assert.equal(r.record.nominal_ohms, 4);
  assert.match(String(r.record.notes), /inferred from Re 3.6 Ω with 2 Ω coils/);
  assert.deepEqual(validateDriver(r.record), []);

  const par = parseIssue(EDGE_BODY.replace("\nSeries\n", "\nNot stated\n").replace("Re (Ω): 3.6", "Re (Ω): 0.9"), opts);
  assert.equal(par.record.ts_wiring, "parallel");
  assert.equal(par.record.nominal_ohms, 1);
});

test("DVC: Re that fits neither wiring leaves it unset and asks", () => {
  const r = parseIssue(EDGE_BODY.replace("\nSeries\n", "\nNot stated\n").replace("Re (Ω): 3.6", "Re (Ω): 1.8"), opts);
  assert.equal(r.record.ts_wiring, undefined);
  assert.equal(r.record.nominal_ohms, 2);
  assert.ok(hintLines(r).some((h) => /Series\*\* or \*\*Parallel/.test(h)));
});

test("DVC: a chosen wiring that doesn't fit Re is pointed out", () => {
  // The wired impedance (4) typed instead of one coil's (2): 8 Ω series vs Re 3.6.
  const r = parseIssue(EDGE_BODY.replace("2 ohm", "4"), opts);
  assert.equal(r.record.nominal_ohms, 8);
  assert.ok(hintLines(r).some((h) => /one coil's/.test(h)));
});

test("hints: a datasheet link for a sibling model is pointed out", () => {
  const hints = hintLines(parseIssue(EDGE_BODY, opts));
  assert.equal(hints.length, 1);
  assert.match(hints[0]!, /different variant/);
});

test("hints: Re far above a single coil's nominal suggests a dual voice coil", () => {
  const body = EDGE_BODY.replace("Dual (DVC)", "Single").replace("eds15d2-e0", "eds15d2-e3");
  const hints = hintLines(parseIssue(body, opts));
  assert.equal(hints.length, 1);
  assert.match(hints[0]!, /dual voice coil/);
});

test("number parsing helpers", () => {
  for (const [t, v] of [["2 Ω", 2], ["2ohm", 2], ["4 (DVC 2x2)", 4], ["8Ω nominal", 8], ["3,2", 3.2], ["", undefined], ["ohm", undefined]] as const) {
    assert.equal(leadingNumber(t), v, t);
  }
  for (const [t, v] of [["15", 15], ["15 in", 15], ['15"', 15], ["15″", 15], ["380 mm", 15], ["6.5", 6.5]] as const) {
    assert.equal(sizeInches(t), v, t);
  }
  assert.equal(brandCase("dayton audio"), "Dayton Audio");
  assert.equal(brandCase("B&C"), "B&C");
  assert.equal(brandCase("SB Acoustics"), "SB Acoustics");
  assert.equal(modelCase("rss265hf-4"), "RSS265HF-4");
  assert.equal(modelCase("alpha 10a"), "alpha 10a");
  assert.equal(modelCase("PTT8.0X04-NAB-02"), "PTT8.0X04-NAB-02");
});
