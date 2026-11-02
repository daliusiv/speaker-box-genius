import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWdr, writeWdr } from "../src/wdr.ts";
import { solveTs } from "../src/tsSolver.ts";
import { netVolume, slotPortDisplacement } from "../src/volume.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
const near = (a: number | undefined, b: number, tol: number, what = "") =>
  assert.ok(a !== undefined && Math.abs(a - b) <= tol, `${what} ${a} vs ${b}`);

test("parse a WinISD file with dot decimals and convert units", () => {
  const d = parseWdr(fixture("um15-22.wdr"));
  assert.equal(d.brand, "Dayton Audio");
  assert.equal(d.model, "Ultimax UM15-22");
  assert.equal(d.ts.fs, 19.5);
  near(d.ts.vas_l, 224.34, 1e-9, "Vas L");
  near(d.ts.sd_cm2, 814.6, 1e-9, "Sd cm²");
  near(d.ts.mms_g, 279.51, 0.01, "Mms g");
  near(d.ts.cms_mm_per_n, 0.2383, 0.0001, "Cms mm/N");
  near(d.le_mh, 1.31, 1e-9, "Le mH");
  near(d.xmax_mm, 19, 1e-9, "Xmax mm");
  near(d.displacement_l, 5.88, 0.01, "DVol L");
  assert.equal(d.pe_w, 800);
  assert.equal(d.voiceCoils, 2);
});

test("parse a WinISD file with comma decimals and CRLF line endings", () => {
  const d = parseWdr(fixture("sp-250p.wdr"));
  assert.equal(d.model, "SP-250P");
  near(d.ts.fs, 33.353, 0.001, "Fs");
  near(d.ts.vas_l, 117.178, 0.001, "Vas");
  near(d.xmax_mm, 3.5, 1e-9, "Xmax");
  assert.equal(d.nominal_ohms, 10);
});

test("WinISD's own values are self-consistent in our solver", () => {
  for (const f of ["um15-22.wdr", "sp-250p.wdr"]) {
    const r = solveTs(parseWdr(fixture(f)).ts);
    assert.deepEqual(r.conflicts, [], f);
    assert.deepEqual(r.missing, [], f);
  }
});

test("export → import round-trips", () => {
  const src = parseWdr(fixture("um15-22.wdr"));
  const out = writeWdr({ brand: src.brand, model: src.model, ts: src.ts, le_mh: src.le_mh, xmax_mm: src.xmax_mm, pe_w: src.pe_w, nominal_ohms: 2, displacement_l: src.displacement_l });
  assert.ok(out.startsWith("[Driver]\r\n"));
  const back = parseWdr(out);
  for (const [k, v] of Object.entries(src.ts)) near(back.ts[k as keyof typeof src.ts], v, Math.abs(v) * 1e-9, k);
  near(back.xmax_mm, 19, 1e-9);
  near(back.le_mh, 1.31, 1e-9);
});

test("rejects files that aren't WinISD drivers", () => {
  assert.throws(() => parseWdr("hello world"), /Not a WinISD driver file/);
});

test("slot ports are deducted with their walls", () => {
  near(slotPortDisplacement(20, 5, 30, 18), (23.6 * 8.6 * 30) / 1000, 1e-9);
  const r = netVolume({
    shape: { kind: "box", width_cm: 40, height_cm: 50, depth_cm: 45 },
    wall_mm: 18,
    ports: { count: 1, length_cm: 30, wall_mm: 18, slot: { width_cm: 20, height_cm: 5 } },
  });
  assert.equal(r.deductions[0]?.label, "Slot ports (1×)");
});
