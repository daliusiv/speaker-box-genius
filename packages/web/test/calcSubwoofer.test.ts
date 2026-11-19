import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_STATE, type AppState, type VentedDesign } from "../src/state.ts";
import { winisdQts } from "@sbg/engine";
import { alignmentDriver, colorOf, solveDriver } from "../src/sim.ts";
import { moreVentedFor, sealedPreset, SEALED_MAX_VAS, ventedAlignmentFor } from "../src/presets.ts";
import {
  alignOf,
  DEEP_PEAK_DB,
  DEEP_SIZE,
  deepTuning,
  lengthText,
  peakDb,
  portText,
  SUBWOOFER_QUERY,
  SIZES,
  subwooferPicks,
  sealedPlans,
  ventedPlans,
  volumeText,
  type Pick,
} from "../src/calculators/subwooferMath.ts";
import { runDesigns, solveDriver as solve } from "../src/sim.ts";

const WINISD = JSON.parse(readFileSync(new URL("../../engine/test/fixtures/winisd-alignments.json", import.meta.url), "utf8")).cases as {
  driver: string;
  fs: number;
  qms: number;
  qes: number;
  vas_l: number;
  re: number;
  qb3: [number, number] | null;
  bb4: number | null;
}[];
const PARITY = JSON.parse(readFileSync(new URL("../../engine/test/fixtures/winisd-parity.json", import.meta.url), "utf8"));

/** The example driver at 250 W, as the app's picker sets it (the same state the page's worked example uses). */
async function example(power = 250): Promise<AppState> {
  const { driverState, loadDb } = await import("../../../site/drivers.ts");
  const rec = loadDb().drivers.find((d) => d.id === "dayton-audio/rss315hf-4")!;
  return { ...driverState(rec.data), drive: "watts", power };
}

const near = (got: number, want: number, rel: number, what: string) => assert.ok(Math.abs(got - want) <= Math.max(rel * want, 0.006), `${what}: ${got.toFixed(3)} vs ${want}`);
const by = (picks: Pick[]) => Object.fromEntries(picks.map((p) => [p.key, p])) as Record<Pick["key"], Pick>;

test("ported picks are the app's presets: BB4, QB3 and 1.5 × QB3 tuned low", async () => {
  const s = await example();
  const a = alignOf(s)!;
  const qb3 = ventedAlignmentFor(a, 1)!;
  const bb4 = moreVentedFor(a, 1).find((x) => x.name === "BB4" || x.name === "SBB4")!;
  const { picks } = subwooferPicks(s, "ported");
  const p = by(picks);
  // The app rounds a preset to 0.1 L and 0.1 Hz when it applies it.
  assert.equal(p.balanced.vb_l, Math.round(qb3.vb_l * 10) / 10);
  assert.equal((p.balanced.design as VentedDesign).targetFb, Math.round(qb3.fb * 10) / 10);
  assert.equal(p.compact.vb_l, Math.round(bb4.vb_l * 10) / 10);
  assert.equal((p.compact.design as VentedDesign).targetFb, Math.round(bb4.fb * 10) / 10);
  assert.equal(p.deep.vb_l, Math.round(qb3.vb_l * DEEP_SIZE * 10) / 10);
  assert.equal(p.balanced.design!.preset, "QB3");
  assert.equal(p.compact.design!.preset, bb4.name);
  // Every pick has a port and numbers.
  for (const k of ["compact", "balanced", "deep"] as const) {
    assert.ok(p[k].port && p[k].air! > 0 && p[k].f3! > 0 && Number.isFinite(p[k].spl30!), k);
  }
});

test("the example driver's boxes are the approved ones (58.1 L BB4, 75.6 L QB3, 113.4 L near 21 Hz)", async () => {
  const p = by(subwooferPicks(await example(), "ported").picks);
  near(p.compact.vb_l!, 58.1, 0.005, "Compact Vb");
  assert.equal(p.compact.fb, 24.2);
  near(p.compact.f3!, 27.6, 0.004, "Compact F3");
  near(p.balanced.vb_l!, 75.6, 0.005, "Balanced Vb");
  assert.equal(p.balanced.fb, 24.4);
  near(p.balanced.f3!, 24.2, 0.004, "Balanced F3");
  near(p.deep.vb_l!, 113.4, 0.005, "Deep Vb");
  assert.ok(Math.abs(p.deep.fb! - 21) <= 0.5, `Deep Fb ${p.deep.fb}`);
  assert.ok(Math.abs(p.deep.f3! - 20.3) <= 0.2, `Deep F3 ${p.deep.f3}`);
});

test("the deep tuning is the lowest F3 with no peak over 0.5 dB, and a bit lower tuning is worse", async () => {
  const s = await example();
  const deep = by(subwooferPicks(s, "ported").picks).deep;
  const vb = deep.vb_l!;
  const at = (fb: number) => {
    const d = { ...(deep.design as VentedDesign), targetFb: fb };
    // The same port as the pick, lengthened for the tuning by the app's own rule is not needed: the response follows targetFb.
    const [r] = runDesigns({ ...s, designs: [d] }, solve(s));
    return r!;
  };
  const here = at(deep.fb!);
  assert.ok(peakDb(here) <= DEEP_PEAK_DB, `peak ${peakDb(here)}`);
  assert.ok(here.result.summary.f3! <= at(deep.fb! + 1).result.summary.f3! + 1e-9, "higher tuning doesn't reach lower");
  assert.ok(here.result.summary.f3! <= at(deep.fb! - 2).result.summary.f3!, "tuning two hertz lower doesn't reach lower");
  assert.equal(deepTuning(s, vb, ventedAlignmentFor(alignOf(s)!, 1)!.fb), deep.fb);
});

test("card colours are the chart's colours, one shade per design of a kind", async () => {
  const s = await example();
  for (const kind of ["ported", "sealed"] as const) {
    const { picks, state } = subwooferPicks(s, kind);
    const colours = picks.map((p) => p.color);
    assert.equal(new Set(colours).size, 3, kind);
    picks.forEach((p) => assert.equal(p.color, colorOf(state, p.design!.id)));
    assert.deepEqual(picks.map((p) => p.design!.name), ["Compact", "Balanced", "Deep"]);
  }
});

test("WinISD's wizard: the compact (BB4) and balanced (QB3) boxes match its Vb and Fb for 19 drivers", () => {
  assert.equal(WINISD.length, 19);
  let compared = 0;
  for (const c of WINISD) {
    const s: AppState = { ...DEFAULT_STATE, ts: { fs: c.fs, qms: c.qms, qes: c.qes, vas_l: c.vas_l, re: c.re, sd_cm2: 400 } };
    const a = alignOf(s)!;
    const plans = ventedPlans(s, a);
    const [compact, balanced] = plans;
    if (c.bb4 !== null) {
      assert.ok(compact && "box" in compact, `${c.driver} BB4`);
      near(compact.box.vb_l, c.bb4, 0.005, `${c.driver} BB4 Vb`);
      assert.ok(Math.abs(compact.box.fb! - c.fs) <= 0.1, `${c.driver} BB4 Fb ${compact.box.fb} vs Fs ${c.fs}`);
      compared++;
    }
    if (balanced && "why" in balanced) assert.ok(winisdQts(c) > 0.62, `${c.driver}: no QB3 only where WinISD's turns over`);
    else if (c.qb3) {
      assert.ok(balanced && "box" in balanced, `${c.driver} QB3`);
      near(balanced.box.vb_l, c.qb3[0], 0.005, `${c.driver} QB3 Vb`);
      assert.ok(Math.abs(balanced.box.fb! - c.qb3[1]) <= 0.1, `${c.driver} QB3 Fb ${balanced.box.fb} vs ${c.qb3[1]}`);
      compared++;
    }
  }
  assert.ok(compared >= 30, `${compared} values compared`);
});

test("WinISD's closed-box wizard: the balanced (Qtc 0.707) and deep (Qtc 0.577) sealed boxes", () => {
  const cases = PARITY.sealed.cases as { qts: number; qtc: number; vb: number }[];
  let compared = 0;
  for (const c of cases.filter((x) => x.qts === 0.4)) {
    const s: AppState = { ...DEFAULT_STATE, ts: { fs: 30, qms: 5, qes: 1 / (1 / c.qts - 1 / 5), vas_l: 50, re: 6, sd_cm2: 220 } };
    const [, balanced, deep] = sealedPlans(alignOf(s)!);
    const plan = c.qtc === 0.707 ? balanced : c.qtc === 0.577 ? deep : null;
    if (!plan) continue;
    assert.ok("box" in plan, `Qtc ${c.qtc}`);
    near(plan.box.vb_l, c.vb, 0.0005, `Qtc ${c.qtc} Vb`);
    compared++;
  }
  assert.equal(compared, 2);
});

test("sealed picks: Qtc 0.9, the app's sealed preset, and Qtc 0.577, each capped at 2 × Vas", async () => {
  const s = await example();
  const a = alignOf(s)!;
  const { picks } = subwooferPicks(s, "sealed");
  const p = by(picks);
  assert.equal(p.balanced.vb_l, Math.round(sealedPreset(a, 1)!.vb_l * 10) / 10);
  assert.equal(p.balanced.tuning, "Qtc 0.707");
  assert.equal(p.compact.tuning, "Qtc 0.9");
  assert.equal(p.deep.tuning, "Qtc 0.577");
  assert.ok(p.compact.vb_l! < p.balanced.vb_l! && p.balanced.vb_l! < p.deep.vb_l!);
  assert.ok(p.compact.f3! > 0 && p.deep.spl30! > p.balanced.spl30!);
  // Sealed cards have no port.
  assert.ok(!p.balanced.port && p.balanced.air === null);

  // A driver whose Qts is near 0.577 would need a huge box: the deep one stops at 2 × Vas and says its Qtc.
  const hi: AppState = { ...DEFAULT_STATE, ts: { fs: 30, qms: 6, qes: 0.62, vas_l: 100, re: 6, sd_cm2: 330 } };
  const plans = sealedPlans(alignOf(hi)!);
  const deep = plans[2]!;
  assert.ok("box" in deep ? deep.box.vb_l <= SEALED_MAX_VAS * 100 : /Qtc|big/.test(deep.why));
  // Qts over 0.9: nothing sealed gets to a Qtc of 0.9, and the cards say why.
  const worse: AppState = { ...DEFAULT_STATE, ts: { fs: 30, qms: 6, qes: 1.2, vas_l: 100, re: 6, sd_cm2: 330 } };
  const w = sealedPlans(alignOf(worse)!);
  assert.ok(w.every((x) => "why" in x), "no sealed pick for a Qts of 1.0");
  assert.match((w[0] as { why: string }).why, /Qts/);
});

test("a Qts too high for QB3: the balanced and deep cards say why, the response doesn't need them", () => {
  const s: AppState = { ...DEFAULT_STATE, ts: { fs: 30, qms: 6, qes: 0.9, vas_l: 100, re: 6, sd_cm2: 330 } };
  const { picks, state } = subwooferPicks(s, "ported");
  const p = by(picks);
  assert.ok(p.balanced.why && /QB3/.test(p.balanced.why), p.balanced.why);
  assert.ok(p.deep.why && /QB3/.test(p.deep.why));
  assert.equal(state.designs.length, picks.filter((x) => x.design).length);
});

test("an incomplete driver gives three cards that say what's missing, and no designs", () => {
  const s: AppState = { ...DEFAULT_STATE, ts: { fs: 30, qms: 6, vas_l: 100 } as never };
  const { picks, state } = subwooferPicks(s, "ported");
  assert.equal(picks.length, 3);
  assert.ok(picks.every((p) => /Enter Fs/.test(p.why ?? "")));
  assert.equal(state.designs.length, 0);
});

test("no Xmax: the cone is shown without a limit, nothing breaks", async () => {
  const s = { ...(await example()), xmax_mm: 0 };
  const p = by(subwooferPicks(s, "ported").picks);
  assert.equal(p.balanced.xmax, 0);
  assert.ok(p.balanced.x! > 0);
});

test("the box's size scales with the number of drivers", async () => {
  const one = by(subwooferPicks(await example(), "sealed").picks);
  const s2 = { ...(await example()), drivers: 2 };
  const two = by(subwooferPicks(s2, "sealed", 2).picks);
  assert.ok(Math.abs(two.balanced.vb_l! / one.balanced.vb_l! - 2) < 0.02);
});

test("the link keys are short and unique, and every field has its own element", () => {
  const keys = Object.keys(SUBWOOFER_QUERY);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.ok(k.length <= 4, k);
  const ids = Object.values(SUBWOOFER_QUERY).map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const k of ["u", "sz", "t", "d", "p", "fs", "qes", "qms", "vas", "re", "sd", "x", "pe"]) assert.ok(keys.includes(k), k);
  assert.deepEqual((SUBWOOFER_QUERY.sz as { choices: string[] }).choices, ["all", ...SIZES.map(String)]);
  assert.equal((SUBWOOFER_QUERY.u as { on: string }).on, "in");
});

test("lengths, volumes and ports read in the unit chosen, the other in brackets", () => {
  assert.equal(lengthText(6, false), "6 cm (2.4″)");
  assert.equal(lengthText(6, true), "2.4″ (6 cm)");
  assert.equal(volumeText(58.1, false), "58.1 L (2.05 ft³)");
  assert.equal(volumeText(58.1, true), "2.05 ft³ (58.1 L)");
  assert.equal(portText({ kind: "flared", diameter_cm: 6, flare_cm: 1.5, length_cm: 22.4, count: 1 }, false), "6 cm (2.4″) flared, 22.4 cm long");
  assert.equal(portText({ kind: "straight", diameter_cm: 10, flare_cm: 0, length_cm: 30, count: 2 }, false), "2 × 10 cm (3.9″), 30 cm long each");
  assert.equal(portText({ kind: "slot", slotWidth_cm: 30, slotHeight_cm: 5, length_cm: 40, count: 1 }, true), "30 × 5 cm slot, 15.7″ long");
});

test("the example's claims: every port chuffs at 250 W, Balanced is loudest at 30 Hz, Deep reaches lowest", async () => {
  const s = await example();
  const p = by(subwooferPicks(s, "ported").picks);
  for (const k of ["compact", "balanced", "deep"] as const) assert.ok(p[k].air! > 17, `${k}: ${p[k].air} m/s`);
  assert.ok(p.balanced.spl30! > p.compact.spl30! && p.balanced.spl30! > p.deep.spl30!);
  assert.ok(p.deep.f3! < p.balanced.f3! && p.balanced.f3! < p.compact.f3!);
  const sealed = by(subwooferPicks(s, "sealed").picks);
  assert.ok(sealed.deep.x! > s.xmax_mm, "the deep sealed box's cone passes Xmax at 250 W");
  assert.ok(sealed.balanced.x! < s.xmax_mm);
  assert.ok(sealed.balanced.f3! - p.balanced.f3! > 15);
  // The solved driver is the one the page shows.
  assert.equal(solveDriver(s).missing.length, 0);
  assert.ok(alignmentDriver(solveDriver(s), s));
});
