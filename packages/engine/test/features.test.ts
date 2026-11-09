import { test } from "node:test";
import assert from "node:assert/strict";
import { abs } from "../src/complex.ts";
import { highPassResponse } from "../src/filters.ts";
import { simulate } from "../src/simulate.ts";
import { estimateDriverDisplacement, grossVolume, netVolume, portTubeDisplacement } from "../src/volume.ts";
import { fixConflict, solveTs } from "../src/tsSolver.ts";
import { parseQuantity } from "../src/units.ts";
import { parseDatasheet } from "../src/datasheet.ts";

const near = (a: number, b: number, tol: number, what = "") =>
  assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b} (tol ${tol})`);
const db = (h: { re: number; im: number }) => 20 * Math.log10(abs(h));

// ---------------------------------------------------------------------------
// High-pass filters
// ---------------------------------------------------------------------------

test("Butterworth high-pass: −3.01 dB at fc, −20·n dB/decade, flat passband", () => {
  for (const order of [1, 2, 3, 4]) {
    const hp = { type: "butterworth" as const, order, freq: 20 };
    near(db(highPassResponse(hp, 20)), -3.0103, 0.001, `order ${order} at fc`);
    near(db(highPassResponse(hp, 2)), -10 * Math.log10(1 + 10 ** (2 * order)), 0.001, `order ${order} at fc/10`);
    near(db(highPassResponse(hp, 2000)), 0, 0.001, `order ${order} passband`);
  }
});

test("Linkwitz-Riley high-pass: −6.02 dB at fc", () => {
  for (const order of [2, 4]) {
    near(db(highPassResponse({ type: "linkwitz-riley", order, freq: 25 }, 25)), -6.0206, 0.001, `LR${order}`);
  }
  assert.throws(() => highPassResponse({ type: "linkwitz-riley", order: 3, freq: 25 }, 25), RangeError);
});

test("filter lowers SPL and excursion by exactly the filter response", () => {
  const driver = { fs: 30, qms: 5.2, qes: 0.4, vas_l: 50, re: 3.4, sd_cm2: 330, xmax_mm: 12, pe_w: 250 };
  const box = { kind: "sealed" as const, vb_l: 40 };
  const hp = { type: "butterworth" as const, order: 2, freq: 25 };
  const a = simulate(driver, box);
  const b = simulate(driver, box, { highPass: hp });
  for (let i = 0; i < a.freq.length; i += 37) {
    const h = highPassResponse(hp, a.freq[i]!);
    near(b.spl[i]! - a.spl[i]!, db(h), 1e-9, "SPL");
    near(b.excursionMm[i]! / a.excursionMm[i]!, abs(h), 1e-9, "excursion");
  }
});

// ---------------------------------------------------------------------------
// Volume calculator
// ---------------------------------------------------------------------------

test("gross volumes of standard shapes", () => {
  near(grossVolume({ kind: "box", width_cm: 40, height_cm: 50, depth_cm: 45 }, 18), 36.4 * 46.4 * 41.4 / 1000, 1e-9, "box");
  near(grossVolume({ kind: "cylinder", diameter_cm: 30, length_cm: 60 }, 0), (Math.PI * 15 * 15 * 60) / 1000, 1e-9, "cylinder");
  near(grossVolume({ kind: "sphere", diameter_cm: 40 }, 0), ((4 / 3) * Math.PI * 20 ** 3) / 1000, 1e-9, "sphere");
});

test("frustum: equal top and bottom is a box; zero top is a pyramid", () => {
  const box = grossVolume({ kind: "frustum", bottomWidth_cm: 30, bottomDepth_cm: 20, topWidth_cm: 30, topDepth_cm: 20, height_cm: 50 });
  near(box, (30 * 20 * 50) / 1000, 1e-9, "as box");
  const pyr = grossVolume({ kind: "frustum", bottomWidth_cm: 30, bottomDepth_cm: 20, topWidth_cm: 0, topDepth_cm: 0, height_cm: 50 });
  near(pyr, (30 * 20 * 50) / 3 / 1000, 1e-9, "pyramid");
  // Non-similar frustum (wedge-like): 30×20 bottom, 10×20 top, height 50 → trapezoidal prism
  const wedge = grossVolume({ kind: "frustum", bottomWidth_cm: 30, bottomDepth_cm: 20, topWidth_cm: 10, topDepth_cm: 20, height_cm: 50 });
  near(wedge, (((30 + 10) / 2) * 50 * 20) / 1000, 1e-9, "wedge");
});

test("net volume subtracts everything and applies fill", () => {
  const r = netVolume({
    shape: { kind: "box", width_cm: 40, height_cm: 50, depth_cm: 45 },
    wall_mm: 18,
    drivers: { count: 1, displacement_l: 2 },
    passiveRadiators: { count: 2, displacement_l: 0.5 },
    ports: { count: 1, innerDiameter_cm: 10, length_cm: 30, wall_mm: 3 },
    bracing_pct: 5,
    other_l: 0.4,
    fill_pct: 10,
  });
  const port = portTubeDisplacement(10, 30, 3);
  near(port, (Math.PI * 5.3 ** 2 * 30) / 1000, 1e-9, "port tube");
  const expected = r.gross_l - 2 - 1 - port - r.gross_l * 0.05 - 0.4;
  near(r.net_l, expected, 1e-9, "net");
  near(r.effective_l, expected * 1.1, 1e-9, "effective");
  assert.equal(r.deductions.length, 5);
});

test("driver displacement estimate is in the right ballpark", () => {
  // 10" sub: 235 mm cutout, 136 mm deep → about 2 L
  const v = estimateDriverDisplacement(235, 136);
  assert.ok(v > 1.5 && v < 2.5, String(v));
});

// ---------------------------------------------------------------------------
// T/S solver
// ---------------------------------------------------------------------------

test("T/S solver never changes entered values and derives the rest", () => {
  const entered = { fs: 27, qms: 5.4, qes: 0.41, vas_l: 94, re: 5.6, sd_cm2: 216 };
  const r = solveTs(entered);
  for (const [k, v] of Object.entries(entered)) assert.equal(r.values[k as keyof typeof entered], v);
  assert.deepEqual(r.missing, []);
  near(r.values.qts!, (5.4 * 0.41) / 5.81, 1e-9, "qts");
  near(r.values.mms_g!, 24.46, 0.05, "mms"); // datasheet says 24.5 g
  near(r.values.bl!, 7.5, 0.05, "bl"); // datasheet says 7.5 T·m
  near(r.values.cms_mm_per_n!, 1.42, 0.01, "cms"); // datasheet says 1.42 mm/N
  assert.equal(r.source.mms_g, "derived");
  assert.deepEqual(r.conflicts, []);
});

test("T/S solver works from the mechanical (fundamental) parameters too", () => {
  // Enter Re, Bl, Mms, Cms, Sd, Qms: the small-signal set should be derived.
  const r = solveTs({ re: 5.6, bl: 7.5, mms_g: 24.5, cms_mm_per_n: 1.42, sd_cm2: 216, qms: 5.4 });
  assert.deepEqual(r.missing, []);
  near(r.values.fs!, 27, 0.2, "fs");
  near(r.values.vas_l!, 94, 1, "vas");
  near(r.values.qes!, 0.41, 0.01, "qes");
});

test("T/S solver reports contradictions instead of overwriting", () => {
  // Published RSS265HF-4 figures: Mms disagrees with Fs/Vas/Sd by ~7 %
  const r = solveTs({ fs: 25.6, qms: 3.06, qes: 0.53, vas_l: 53.8, re: 3.5, sd_cm2: 356.3, mms_g: 120 });
  assert.equal(r.values.mms_g, 120);
  assert.equal(r.values.vas_l, 53.8);
  assert.ok(r.conflicts.some((c) => c.param === "mms_g" && c.diff > 0.05 && c.diff < 0.1), JSON.stringify(r.conflicts));
});

test("Accepting every 'use calculated' never breaks the driver (DSA175-8)", () => {
  // Published Dayton DSA175-8: Mms 24.2 g disagrees with Fs/Vas/Sd by ~12 %.
  let ts: Record<string, number> = { fs: 38.36, qms: 1.66, qes: 0.35, vas_l: 18.7, re: 5.8, sd_cm2: 128.7, qts: 0.29, bl: 9.75, mms_g: 24.2 };
  for (let round = 0; round < 10; round++) {
    const r = solveTs(ts);
    assert.deepEqual(r.missing, [], `round ${round}: ${JSON.stringify(ts)}`);
    // A parameter is never blamed through a value that was calculated from it.
    if (r.source.mms_g === "derived") assert.ok(!r.conflicts.some((c) => c.param === "fs" && c.relation.startsWith("Qes")));
    const c = r.conflicts[0];
    if (!c) return;
    const fix = fixConflict(ts, c);
    const after = solveTs(fix.entered);
    // The value used is the one the warning promised.
    near(after.values[c.param]!, c.implied, c.implied * 0.005, `${c.param} after fix`);
    ts = fix.entered as Record<string, number>;
  }
  assert.fail("conflicts never settled: " + JSON.stringify(solveTs(ts).conflicts));
});

test("T/S solver tolerates Qts rounded to two decimals", () => {
  // Published RSS315HF-4: Qms 2.83, Qes 0.45 → Qts 0.388, datasheet says 0.39
  const r = solveTs({ fs: 24.2, qms: 2.83, qes: 0.45, qts: 0.39, vas_l: 84.1, re: 3.1, sd_cm2: 514.7 });
  assert.deepEqual(r.conflicts, []);
  // …but a genuinely wrong Qts is still caught
  const bad = solveTs({ qms: 2.83, qes: 0.45, qts: 0.45 });
  assert.equal(bad.conflicts[0]?.param, "qts");
});

test("T/S solver lists what is still missing", () => {
  const r = solveTs({ fs: 30, qts: 0.4 });
  assert.ok(r.missing.includes("vas_l") && r.missing.includes("sd_cm2") && r.missing.includes("re"));
});

// ---------------------------------------------------------------------------
// Units and datasheet paste
// ---------------------------------------------------------------------------

test("unit parsing", () => {
  near(parseQuantity("1.9 ft³", "volume")!, 53.80, 0.01);
  near(parseQuantity("1,9ft3", "volume")!, 53.80, 0.01);
  near(parseQuantity("54 L", "volume")!, 54, 1e-12);
  near(parseQuantity("356.3cm²", "area")!, 356.3, 1e-12);
  near(parseQuantity("35630 mm2", "area")!, 356.3, 1e-9);
  near(parseQuantity("1420 µm/N", "compliance")!, 1.42, 1e-12);
  near(parseQuantity("0.12 kg", "mass")!, 120, 1e-9);
  near(parseQuantity("0.5 in", "length")!, 12.7, 1e-9);
  assert.equal(parseQuantity("12.3", "length"), 12.3);
  assert.equal(parseQuantity("abc", "length"), null);
  assert.equal(parseQuantity("3 furlongs", "length"), null);
});

test("datasheet paste: retailer-style specification list", () => {
  const text = `Resonant Frequency (Fs)25.6Hz
DC Resistance (Re)3.5Ω
Voice Coil Inductance (Le)0.96mH
Mechanical Q (Qms)3.06
Electromagnetic Q (Qes)0.53
Total Q (Qts)0.45
Diaphragm Mass Inc. Airload (Mms)120g
Mechanical Compliance of Suspension (Cms)0.32mm/N
Surface Area of Cone (Sd)356.3cm²
BL Product (BL)11.43T·m
Compliance Equivalent Volume (Vas)1.9ft³
Maximum Linear Excursion (Xmax)12.3mm
Power Handling (RMS)350 Watts
Sensitivity 87.8dB 2.83V/1m`;
  const p = parseDatasheet(text);
  assert.equal(p.fs, 25.6);
  assert.equal(p.re, 3.5);
  assert.equal(p.le_mh, 0.96);
  assert.equal(p.qms, 3.06);
  assert.equal(p.qes, 0.53);
  assert.equal(p.qts, 0.45);
  assert.equal(p.mms_g, 120);
  assert.equal(p.cms_mm_per_n, 0.32);
  assert.equal(p.sd_cm2, 356.3);
  assert.equal(p.bl, 11.43);
  near(p.vas_l!, 53.8, 0.01, "vas");
  assert.equal(p.xmax_mm, 12.3);
  assert.equal(p.pe_w, 350);
});

test("datasheet paste: manufacturer-style list with symbols after labels", () => {
  const text = `Free air resonance, Fs 27 Hz
Mechanical Q-factor, Qms 5.4
Electrical Q-factor, Qes 0.41
Moving mass incl.air, Mms 24.5 g
Force factor, Bl 7.5 Tm
Equivalent volume, Vas 94 liters
Effective piston area, Sd 216 cm2
Linear coil travel (p-p) 13 mm
Rated power handling 60 W`;
  const p = parseDatasheet(text);
  assert.deepEqual(
    { fs: p.fs, qms: p.qms, qes: p.qes, mms: p.mms_g, bl: p.bl, vas: p.vas_l, sd: p.sd_cm2, xmax: p.xmax_mm, pe: p.pe_w },
    { fs: 27, qms: 5.4, qes: 0.41, mms: 24.5, bl: 7.5, vas: 94, sd: 216, xmax: 6.5, pe: 60 },
  );
});

test("datasheet paste: units in brackets before the value", () => {
  const p = parseDatasheet("Vas (ft³) 1.9\nMms (g) 120\nFs (Hz) 25.6\nSd (sq.mm) 35630");
  near(p.vas_l!, 53.8, 0.01, "vas");
  assert.equal(p.mms_g, 120);
  assert.equal(p.fs, 25.6);
  near(p.sd_cm2!, 356.3, 1e-9, "sd");
});

test("datasheet paste: units with digits or dots convert (ft3, in2, ft.³, sq cm), and an unknown unit is left out, not read as litres", async () => {
  const { readDatasheet } = await import("../src/datasheet.ts");
  near(parseDatasheet("Vas 1.9 ft3").vas_l!, 53.8, 0.01, "ft3");
  near(parseDatasheet("Compliance Equivalent Volume (Vas) 1.32 ft.³").vas_l!, 37.38, 0.01, "Dayton's ft.³");
  near(parseDatasheet("Vas 100 in3").vas_l!, 1.639, 0.001, "in3");
  near(parseDatasheet("Sd 33 in2").sd_cm2!, 212.9, 0.1, "in2");
  assert.equal(parseDatasheet("Sd 211.2 sq cm").sd_cm2, 211.2);
  assert.equal(parseDatasheet("Le 1.0 mH @ 1 kHz").le_mh, 1);
  assert.equal(parseDatasheet("Mms 34.6 g.").mms_g, 34.6);
  // Bare numbers are still database units; plain values keep any unit.
  assert.equal(parseDatasheet("Vas 37.4").vas_l, 37.4);
  assert.equal(parseDatasheet("Bl 10.6 T*m").bl, 10.6);
  const r = readDatasheet("Fs 35 Hz\nVas 37.4 qt");
  assert.deepEqual(r.values, { fs: 35 });
  assert.deepEqual(r.unread, [{ field: "vas_l", text: "Vas 37.4 qt" }]);
});

test("the T/S solver ignores keys it doesn't know instead of throwing", async () => {
  const { solveTs } = await import("../src/tsSolver.ts");
  const r = solveTs({ fs: 35, qms: 1.87, qes: 0.4, vas_l: 37.4, re: 5.9, sd_cm2: 211.2, le_mh: 1 } as never);
  assert.deepEqual(r.missing, []);
  assert.equal(r.values.qts!.toFixed(3), "0.330");
});
