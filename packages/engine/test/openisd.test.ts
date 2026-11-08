import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOwdr, parseOwpr } from "../src/openisd.ts";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/openisd/${f}`, import.meta.url), "utf8");

test("a real OpenISD project: the Tang Band W5-1138SMF in 8 L sealed, as entered there", () => {
  const p = parseOwpr(fixture("w5-sealed.owpr"));
  assert.equal(p.driver.brand, "Tang Band");
  assert.equal(p.driver.model, "W5-1138SMF");
  assert.deepEqual(p.box, { type: "sealed", vb_l: 8, losses: { ql: 10, qa: 100, qp: 100 } });
  assert.equal(p.driver.ts.fs, 45);
  assert.ok(Math.abs(p.driver.ts.vas_l! - 4.85) < 1e-9);
  assert.equal(p.driver.xmax_mm, 9.25);
  assert.equal(p.driver.pe_w, 40);
  assert.equal(p.driver.nominal_ohms, 4);
  assert.deepEqual(p.drive, { watts: 1 });
  assert.equal(p.rs_ohm, 0.1);
  assert.ok(Math.abs(p.air!.temp_C - 20) < 1e-9 && p.air!.humidity_pct === 30 && Math.abs(p.air!.pressure_hPa - 1013.25) < 1e-9);
});

test("OpenISD's current file layout (5): a 4th-order bandpass with a driver of entered values only", () => {
  const p = parseOwpr(fixture("bandpass4-layout5.owpr"));
  assert.equal(p.box?.type, "bandpass");
  if (p.box?.type !== "bandpass") return;
  assert.equal(p.box.order, "4");
  assert.equal(p.box.rear.vb_l, 7);
  assert.equal(p.box.front.vb_l, 10);
  assert.equal(p.box.front.port.diameter_cm, 5);
  assert.ok(Math.abs(p.box.front.port.length_cm! - 44.892) < 0.001);
  // Calculated values (Qms, Vas, Bl there) are left for our solver; the entered ones come across.
  assert.equal(p.driver.ts.qms, undefined);
  assert.equal(p.driver.ts.fs, 29);
  assert.equal(p.driver.ts.mms_g, 50);
});

test("older OpenISD projects: 6th-order bandpass (parallel and series) and a passive radiator box", () => {
  const b6 = parseOwpr(fixture("bandpass6-old.owpr")).box;
  assert.ok(b6?.type === "bandpass" && b6.order === "6p" && b6.rear.port?.length_cm! > 0);
  const abc = parseOwpr(fixture("abc-old.owpr")).box;
  assert.ok(abc?.type === "bandpass" && abc.order === "6s" && abc.rear.port?.length_cm === 5);
  const pr = parseOwpr(fixture("passiveRadiator-old.owpr")).box;
  assert.ok(pr?.type === "passive-radiator");
  if (pr?.type !== "passive-radiator") return;
  assert.equal(pr.vb_l, 7);
  assert.equal(pr.pr.sd_cm2, 200);
  assert.ok(Math.abs(pr.pr.mms_g - 50) < 1e-6);
});

test("an OpenISD driver file, and things that aren't OpenISD files", () => {
  const d = parseOwdr(fixture("driver-layout5.owdr"));
  assert.equal(d.model, "G-2");
  assert.equal(d.ts.fs, 33);
  assert.throws(() => parseOwpr("not json"), /not JSON/);
  assert.throws(() => parseOwpr("{}"), /no driver/);
  assert.throws(() => parseOwdr("{}"), /no specs/);
});

test("filters: high-passes, Linkwitz Transform and EQ come across; others are counted", () => {
  const p = JSON.parse(fixture("w5-sealed.owpr"));
  p.saved.filters.filters = [
    { enabled: true, type: "highpass", family: "butterworth", order: 2, fc: 25, Q: 0.707 },
    { enabled: true, type: "linkwitz", f0: 60, Q0: 0.9, fp: 30, Qp: 0.6 },
    { enabled: true, type: "peaking", fc: 40, Q: 2, gain: -3 },
    { enabled: true, type: "lowpass", family: "butterworth", order: 2, fc: 80, Q: 0.707 },
    { enabled: false, type: "peaking", fc: 50, Q: 1, gain: 6 },
  ];
  const r = parseOwpr(JSON.stringify(p));
  assert.deepEqual(r.filters, [
    { type: "highpass", family: "butterworth", order: 2, freq: 25 },
    { type: "linkwitz", f0: 60, q0: 0.9, fp: 30, qp: 0.6 },
    { type: "peak", freq: 40, gain_db: -3, q: 2 },
  ]);
  assert.equal(r.unsupportedFilters, 1);
});
