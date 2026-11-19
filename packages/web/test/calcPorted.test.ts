import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { winisdQts } from "../../engine/src/winisdAlignments.ts";
import { DEFAULT_STATE, type AppState, type VentedDesign } from "../src/state.ts";
import { bestVentedPort } from "../src/presets.ts";
import { alignmentDriver, limitsOf, PORT_LIMIT, runDesigns, solveDriver } from "../src/sim.ts";
import { alignmentChips, atFrequency, fineTuneLink, PORTED_QUERY, portedBox, portWords } from "../src/calculators/portedMath.ts";
import { decodeQuery } from "../src/calculators/query.ts";
import { PORT_QUERY } from "../src/calculators/portLength.ts";
import { driverQuery } from "../src/calculators/driverInput.ts";

/** WinISD's own boxes (wizard, Rg 0.1 Ω) for 19 drivers: packages/engine/test/fixtures/winisd-alignments.json. */
interface Case {
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
const CASES: Case[] = JSON.parse(readFileSync(new URL("../../engine/test/fixtures/winisd-alignments.json", import.meta.url), "utf8")).cases;

const stateOf = (c: { fs: number; qms: number; qes: number; vas_l: number; re: number }, over: Partial<AppState> = {}): AppState => ({
  ...DEFAULT_STATE,
  drive: "watts",
  power: 250,
  ts: { fs: c.fs, qms: c.qms, qes: c.qes, vas_l: c.vas_l, re: c.re, sd_cm2: 500 },
  xmax_mm: 14.3,
  pe_w: 0,
  ...over,
});

// WinISD shows two decimals and the app applies a preset at 0.1 L and 0.1 Hz: allow that rounding on top of the 0.5 % / 0.1 Hz targets.
const volOk = (got: number, want: number) => Math.abs(got - want) <= 0.005 * want + 0.05;
const fbOk = (got: number, want: number) => Math.abs(got - want) <= 0.1;

test("the chips are WinISD's QB3, C4 and BB4 boxes for each of its 19 recorded drivers (Vb within 0.5 %, Fb within 0.1 Hz)", () => {
  assert.equal(CASES.length, 19);
  let compared = 0;
  for (const c of CASES) {
    const chips = alignmentChips(stateOf(c));
    const by = (...v: string[]) => chips.find((x) => v.includes(x.value));
    // As WinISD's wizard: no QB3 once its Qts (with the 0.1 Ω amplifier) passes 0.62.
    if (winisdQts(c) > 0.62) assert.equal(by("qb3"), undefined, `${c.driver}: no QB3`);
    else if (c.qb3) {
      const q = by("qb3")!;
      assert.ok(q, `${c.driver}: QB3 offered`);
      assert.ok(volOk(q.vb_l, c.qb3[0]) && fbOk(q.fb, c.qb3[1]), `${c.driver} QB3 ${q.vb_l} L ${q.fb} Hz vs WinISD ${c.qb3}`);
      compared++;
    }
    if (c.c4) {
      const q = by("c4", "sc4")!;
      assert.ok(q, `${c.driver}: C4 offered`);
      assert.ok(volOk(q.vb_l, c.c4[0]) && fbOk(q.fb, c.c4[1]), `${c.driver} C4 ${q.vb_l} L ${q.fb} Hz vs WinISD ${c.c4}`);
      compared++;
    }
    if (c.bb4 !== null) {
      const q = by("bb4", "sbb4")!;
      assert.ok(q, `${c.driver}: BB4 offered`);
      assert.ok(volOk(q.vb_l, c.bb4) && fbOk(q.fb, c.fs), `${c.driver} BB4 ${q.vb_l} L ${q.fb} Hz vs WinISD ${c.bb4} L at Fs ${c.fs}`);
      compared++;
    }
  }
  assert.ok(compared >= 40, `${compared} boxes compared`);
});

test("chips are the app's own presets, in the app's order, with its tooltips", () => {
  const s = stateOf({ fs: 24.2, qms: 2.83, qes: 0.45, vas_l: 84.1, re: 3.1 });
  const chips = alignmentChips(s);
  assert.deepEqual(chips.map((c) => c.value), ["qb3", "c4", "bb4"]);
  const a = alignmentDriver(solveDriver(s), s)!;
  assert.ok(a);
  assert.match(chips[0]!.help, /WinISD's wizard/);
  assert.match(chips[1]!.help, /Chebyshev: trades a [\d.]+ dB ripple/);
  assert.match(chips[2]!.help, /Boom box: tuned to Fs/);
  assert.equal(chips[0]!.shape, "flat");
  assert.ok(chips[1]!.db > 0 && chips[2]!.db > 0);
});

test("a driver whose Qts is too high for a vented box gets no chips; incomplete T/S gets none either", () => {
  const hi = stateOf({ fs: 30, qms: 4, qes: 1.2, vas_l: 50, re: 6 });
  assert.deepEqual(alignmentChips(hi), []);
  assert.deepEqual(alignmentChips({ ...hi, ts: { fs: 30 } }), []);
});

test("the example: QB3 75.6 L at 24.4 Hz for the RSS315HF-4, and the port that fits chuffs at 250 W", () => {
  const s = stateOf({ fs: 24.2, qms: 2.83, qes: 0.45, vas_l: 84.1, re: 3.1 });
  const q = alignmentChips(s)[0]!;
  assert.equal(q.vb_l, 75.6);
  assert.equal(q.fb, 24.4);
  const r = portedBox(s, q.vb_l, q.fb, q.label)!;
  assert.ok(r);
  assert.equal(r.design.preset, "QB3");
  assert.equal(r.design.vb_l, 75.6);
  assert.equal(r.design.targetFb, 24.4);
  assert.ok(r.vp! > PORT_LIMIT && !r.quiet, `${r.vp} m/s`);
  assert.ok(r.x! > 0 && r.x! < r.xmax_mm);
  // At 1 W the same box's port is quiet.
  const low = portedBox({ ...s, power: 1 }, q.vb_l, q.fb)!;
  assert.ok(low.quiet && low.vp! < PORT_LIMIT / 2);
});

test("the numbers are the app's: the port is bestVentedPort's, the limits are limitsOf on the simulation of that design", () => {
  const s = stateOf({ fs: 30, qms: 5, qes: 0.5, vas_l: 80, re: 4 });
  const base = DEFAULT_STATE.designs.find((d) => d.kind === "vented") as VentedDesign;
  const r = portedBox(s, 60, 32)!;
  const pick = bestVentedPort({ ...s, pe_w: 0 }, base, 60, 32)!;
  for (const [k, v] of Object.entries(pick.fields)) assert.deepEqual((r.design as unknown as Record<string, unknown>)[k], v, k);
  const [run] = runDesigns({ ...s, designs: [r.design] }, solveDriver(s));
  const lim = limitsOf(run!.result, s.xmax_mm, false, PORT_LIMIT);
  assert.equal(r.x, lim.x);
  assert.equal(r.f3, run!.result.summary.f3 ?? null);
  if (r.design.flare_cm === 0) assert.equal(r.vp, lim.vp);
});

test("the port is picked for the power set: more power, a port at least as wide or more of them", () => {
  const s = stateOf({ fs: 24.2, qms: 2.83, qes: 0.45, vas_l: 84.1, re: 3.1 });
  const area = (d: VentedDesign) => d.count * (d.shape === "slot" ? d.slotWidth_cm * d.slotHeight_cm : Math.PI * (d.diameter_cm / 2) ** 2);
  const a1 = area(portedBox({ ...s, power: 1 }, 75.6, 24.4)!.design);
  const a250 = area(portedBox(s, 75.6, 24.4)!.design);
  assert.ok(a250 >= a1 * 0.5, `${a1} → ${a250}`);
});

test("two drivers want twice the box; a driver with no Xmax still works out", () => {
  const c = { fs: 30, qms: 5, qes: 0.4, vas_l: 60, re: 4 };
  const one = alignmentChips(stateOf(c))[0]!;
  const two = alignmentChips(stateOf(c, { drivers: 2 }))[0]!;
  assert.ok(Math.abs(two.vb_l - 2 * one.vb_l) <= 0.15);
  assert.equal(two.fb, one.fb);
  const r = portedBox(stateOf(c, { xmax_mm: 0 }), one.vb_l, one.fb)!;
  assert.ok(r && r.xmax_mm === 0 && r.x! > 0);
});

test("no simple port fits a tiny box tuned very low; nonsense input gives nothing", () => {
  const s = stateOf({ fs: 30, qms: 5, qes: 0.4, vas_l: 60, re: 4 });
  assert.equal(portedBox(s, 0, 30), null);
  assert.equal(portedBox(s, 40, 0), null);
  assert.equal(portedBox(s, 2, 15), null);
});

test("output at 30 Hz is read off the curve on a log axis", () => {
  const f = new Float64Array([10, 100, 1000]);
  const y = new Float64Array([0, 10, 20]);
  assert.equal(atFrequency(f, y, 10), 0);
  assert.ok(Math.abs(atFrequency(f, y, Math.sqrt(10 * 100))! - 5) < 1e-9);
  assert.equal(atFrequency(f, y, 5), null);
  assert.equal(atFrequency(f, y, 2000), null);
});

test("Fine-tune link: every key is one the port length page reads, and the values come back unchanged", () => {
  const s = stateOf({ fs: 24.2, qms: 2.83, qes: 0.45, vas_l: 84.1, re: 3.1 });
  const r = portedBox(s, 75.6, 24.4, "QB3")!;
  const url = fineTuneLink(r, "dayton-audio/rss315hf-4", 250);
  assert.ok(url.startsWith("/calculators/port-length/?"));
  const search = url.slice(url.indexOf("?"));
  const keys = [...new URLSearchParams(search).keys()];
  const got = decodeQuery(search, PORT_QUERY);
  assert.deepEqual(Object.keys(got).sort(), [...keys].sort(), "nothing dropped");
  assert.equal(got.vb, "75.6");
  assert.equal(got.fb, "24.4");
  assert.equal(got.d, "dayton-audio/rss315hf-4");
  assert.equal(got.p, "250");
  assert.equal(Number(got.dia), r.design.diameter_cm);
  if (r.design.flare_cm > 0) assert.equal(Number(got.fl), r.design.flare_cm);
  // A slot and two tubes carry their own keys.
  const slot = { ...r, design: { ...r.design, shape: "slot" as const, slotWidth_cm: 30, slotHeight_cm: 4, count: 2 } };
  const g2 = decodeQuery(fineTuneLink(slot, "", 0).slice(fineTuneLink(slot, "", 0).indexOf("?")), PORT_QUERY);
  assert.deepEqual([g2.s, g2.w, g2.h, g2.n, g2.d, g2.p], ["slot", "30", "4", "2", undefined, undefined]);
});

test("port wording gives both units", () => {
  const s = stateOf({ fs: 24.2, qms: 2.83, qes: 0.45, vas_l: 84.1, re: 3.1 });
  const r = portedBox(s, 75.6, 24.4)!;
  assert.match(portWords(r.design), /^\d.* cm \(\d+\.\d″\).* long$/);
});

test("link keys: short, unique, each field once; the driver's keys are the shared ones", () => {
  const keys = Object.keys(PORTED_QUERY);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.ok(k.length <= 3, k);
  const ids = Object.values(PORTED_QUERY).map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const [k, f] of Object.entries(driverQuery("vc"))) assert.deepEqual(PORTED_QUERY[k], f, k);
  for (const k of ["u", "nd", "a", "vb", "fb"]) assert.ok(PORTED_QUERY[k], k);
  // The alignment is one of the chips' words; anything else is dropped.
  assert.deepEqual(decodeQuery("?a=c4&nd=2&vb=60&fb=30&u=in", PORTED_QUERY), { a: "c4", nd: "2", vb: "60", fb: "30", u: "in" });
  assert.deepEqual(decodeQuery("?a=horn", PORTED_QUERY), {});
});
