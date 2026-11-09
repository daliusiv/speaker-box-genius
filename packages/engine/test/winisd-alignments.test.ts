import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WINISD_SWEEP, winisdBb4Alignment, winisdC4Alignment, winisdQb3Alignment, winisdQts } from "../src/winisdAlignments.ts";

/** WinISD's own boxes for drivers that aren't in the sweep (fixtures/winisd-alignments.json). */
interface AlignmentCheck {
  driver: string;
  fs: number;
  qms: number;
  qes: number;
  vas_l: number;
  re: number;
  qb3: [number, number] | null;
  bb4: number | null;
  c4: [number, number] | null;
}
const CASES: AlignmentCheck[] = JSON.parse(readFileSync(new URL("./fixtures/winisd-alignments.json", import.meta.url), "utf8")).cases;

// WinISD shows two decimals: a 1.05 L box can be off by 0.5 % from rounding alone.
const near = (got: number, want: number, rel: number, what: string) =>
  assert.ok(Math.abs(got - want) <= Math.max(rel * want, 0.006), `${what}: ${got.toFixed(3)} vs WinISD ${want}`);

test("WinISD's alignments: database and test drivers match WinISD within its display rounding", () => {
  assert.equal(CASES.length, 19);
  for (const { driver: name, fs, qms, qes, vas_l, re, qb3, bb4, c4 } of CASES) {
    const d = { fs, qms, qes, vas_l, re };
    const a = winisdQb3Alignment(d);
    if (winisdQts(d) > 0.62) assert.equal(a, null, `${name}: no QB3 where WinISD's turns over`);
    else if (qb3) {
      assert.ok(a, `${name}: QB3`);
      near(a.vb_l, qb3[0], 0.004, `${name} QB3 Vb`);
      near(a.fb, qb3[1], 0.002, `${name} QB3 Fb`);
    }
    if (bb4 !== null) {
      const b = winisdBb4Alignment(d)!;
      near(b.vb_l, bb4, 0.004, `${name} BB4 Vb`);
      assert.equal(b.fb, fs);
    }
    if (c4) {
      const c = winisdC4Alignment(d)!;
      near(c.vb_l, c4[0], 0.004, `${name} C4 Vb`);
      near(c.fb, c4[1], 0.002, `${name} C4 Fb`);
    }
  }
});

test("WinISD's alignments reproduce the sweep they're built from", () => {
  const S = WINISD_SWEEP;
  for (const [qts, qb3, qb3fb, bb4, c4, c4fb] of S.rows) {
    const d = { fs: S.fs, qms: S.qms, qes: (qts * S.qms) / (S.qms - qts), vas_l: S.vas_l, re: S.re };
    if (qts <= 0.62) near(winisdQb3Alignment(d)!.vb_l, qb3, 1e-6, `QB3 ${qts}`), near(winisdQb3Alignment(d)!.fb, qb3fb, 1e-6, `QB3 Fb ${qts}`);
    else assert.equal(winisdQb3Alignment(d), null);
    near(winisdBb4Alignment(d)!.vb_l, bb4, 1e-6, `BB4 ${qts}`);
    if (qts >= 0.2) near(winisdC4Alignment(d)!.vb_l, c4, 1e-6, `C4 ${qts}`), near(winisdC4Alignment(d)!.fb, c4fb, 1e-6, `C4 Fb ${qts}`);
    else assert.equal(winisdC4Alignment(d), null, `no C4 at ${qts} (WinISD's collapses)`);
  }
});

test("WinISD's Qts includes its 0.1 Ω amplifier resistance; N drivers scale the box", () => {
  // 3 Ω coil: Qes 0.5 acts as 0.5167.
  assert.ok(Math.abs(winisdQts({ qms: 3, qes: 0.5, re: 3 }) - (3 * 0.51667) / 3.51667) < 1e-4);
  assert.equal(winisdQts({ qms: 3, qes: 0.5 }), (3 * 0.5) / 3.5);
  const d = { fs: 25, qms: 3, qes: 0.5, vas_l: 80, re: 3.5 };
  assert.ok(Math.abs(winisdQb3Alignment(d, 2)!.vb_l - 2 * winisdQb3Alignment(d)!.vb_l) < 1e-9);
  assert.equal(winisdQb3Alignment(d, 2)!.fb, winisdQb3Alignment(d)!.fb);
  // Names follow the shape (with WinISD's Ql 10): flat at low Qts, a peak/ripple above.
  const at = (q: number) => ({ fs: 30, qms: 1e6, qes: q, vas_l: 50 });
  assert.equal(winisdBb4Alignment(at(0.3))!.name, "SBB4");
  assert.equal(winisdBb4Alignment(at(0.5))!.name, "BB4");
  assert.equal(winisdC4Alignment(at(0.3))!.name, "SC4");
  assert.equal(winisdC4Alignment(at(0.5))!.name, "C4");
  // Outside WinISD's sensible range: none.
  assert.equal(winisdBb4Alignment(at(0.85)), null);
  assert.equal(winisdC4Alignment(at(0.15)), null);
});
