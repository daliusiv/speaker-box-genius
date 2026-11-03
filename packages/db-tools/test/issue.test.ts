import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDriver, validatePassiveRadiator } from "../../schema/src/index.ts";
import { parseIssue } from "../src/issue.ts";

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
