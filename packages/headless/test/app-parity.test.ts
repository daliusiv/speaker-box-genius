import { test } from "node:test";
import assert from "node:assert/strict";
import { runDesigns, solveDriver } from "../../web/src/sim.ts";
import { decodeStateAny, encodeStateShort, type AppState } from "../../web/src/state.ts";
import { EXAMPLES } from "../../../site/examples.ts";
import { hornrespBoxState, winisdCaseState } from "../../../site/validationLinks.ts";
import { WINISD_CASES } from "../../engine/validation/winisd.ts";
import { buildState, fromState, RequestError, simulateRequest, simulateState, stateFromLink, validateRequest, type SimRequest } from "../src/index.ts";
import { repoDatabase } from "./helpers.ts";
import results from "../../../docs/validation/results.json" with { type: "json" };

const db = repoDatabase();

/** Every array and summary of the app's own run, for comparing two states exactly. */
function runOf(s: AppState) {
  return runDesigns(s, solveDriver(s)).map((d) => ({
    label: d.label,
    vb: d.vb_l,
    summary: d.result.summary,
    spl: [...d.result.spl],
    x: [...d.result.excursionMm],
    vp: d.result.portVelocity ? [...d.result.portVelocity] : null,
    xpr: d.result.prExcursionMm ? [...d.result.prExcursionMm] : null,
    max: [...d.result.maxSpl],
    z: [...d.result.impedanceOhm],
  }));
}

/** The request path: state → SimRequest → state, as a caller would round-trip a share link. */
async function viaRequest(s: AppState): Promise<AppState> {
  const req = fromState(s);
  assert.deepEqual(validateRequest(JSON.parse(JSON.stringify(req))), [], "fromState gives a valid request");
  return (await buildState(JSON.parse(JSON.stringify(req)) as SimRequest, { db })).state;
}

test("validation names the field and suggests the right key", () => {
  const errs = validateRequest({ driver: { fs: 30 }, designs: [{ kind: "ported" }, { kind: "vented", vb: 30, port: { diam: 5 } }], output: { curves: ["spll"] } });
  assert.ok(errs.includes("driver: without an id it needs at least fs, vas_l, re and two of qts, qes, qms"));
  assert.ok(errs.some((e) => e.startsWith("designs[0].kind: one of sealed, vented, pr")));
  assert.ok(errs.includes("designs[1]: unknown key `vb`, did you mean `vb_l`?"));
  assert.ok(errs.includes("designs[1].port: unknown key `diam`, did you mean `diameter_cm`?"));
  assert.ok(errs.includes("output.curves: unknown curve `spll`, did you mean `spl`?"));
  assert.deepEqual(validateRequest({ driver: { id: "dayton-audio/rss315hf-4" }, designs: [{ kind: "sealed", vb_l: 40 }] }), []);
  assert.ok(validateRequest({ driver: { id: "x/y" }, designs: Array(9).fill({ kind: "sealed" }) }).some((e) => e.startsWith("designs: at most 8")));
  assert.ok(validateRequest({ driver: { id: "x/y" }, designs: [{ kind: "sealed", fb_hz: 30 }] }).includes("designs[0].fb_hz: only for vented and pr boxes"));
});

/** What the app shows when it opens this state's share link (a few examples set names the app's own UI never makes, and the link tidies them). */
async function opened(s: AppState): Promise<AppState> {
  return (await decodeStateAny(await encodeStateShort(s)))!;
}

test("site examples: the request path gives the app's numbers exactly", async () => {
  for (const [name, make] of Object.entries(EXAMPLES)) {
    const s = await opened(make());
    assert.deepEqual(runOf(await viaRequest(s)), runOf(s), name);
  }
});

test("WinISD and Hornresp reference cases: the request path gives the app's numbers exactly", async () => {
  let n = 0;
  for (const c of WINISD_CASES) {
    const s = winisdCaseState(c.id);
    if (!s) continue;
    assert.deepEqual(runOf(await viaRequest(s)), runOf(s), c.id);
    n++;
  }
  for (const b of results.hornresp.boxes.cases) {
    const s = hornrespBoxState(b.id);
    if (!s) continue;
    assert.deepEqual(runOf(await viaRequest(s)), runOf(s), b.id);
    n++;
  }
  assert.ok(n >= 15, `${n} cases`);
});

test("WinISD's tunings come out of simulate within the published tolerance", async () => {
  for (const c of results.winisd.cases) {
    const fb = c.checks.find((x) => x.what === "fb");
    const s = winisdCaseState(c.id);
    if (!fb || !s) continue;
    const r = await simulateState(await viaRequest(s));
    const got = r.designs[0]!.fb_hz!;
    assert.ok(Math.abs(got - fb.winisd) / fb.winisd <= fb.tol + 1e-4, `${c.id}: ${got} vs WinISD ${fb.winisd}`);
  }
});

test("share link out opens in the app with the same numbers, and reads back", async () => {
  const r = await simulateRequest(
    { driver: { id: "dayton-audio/rss315hf-4" }, drive: { watts: 250 }, designs: [{ kind: "sealed", size: "auto" }, { kind: "vented", vb_l: 60, fb_hz: 25 }, { kind: "pr", vb_l: 50, pr: { id: "dayton-audio/rss315-pr", count: 2 }, fb_hz: 22 }, { kind: "ob", w_cm: 50, h_cm: 100 }] },
    { db },
  );
  assert.match(r.share_link, /^https:\/\/speakerboxgenius\.com\/#z=/);
  const s = await stateFromLink(r.share_link);
  assert.ok(s);
  const again = await simulateState(s);
  assert.deepEqual(
    again.designs.map(({ curves: _, ...d }) => d),
    r.designs.map(({ curves: _, ...d }) => d),
  );
  assert.equal(r.designs[1]!.fb_hz!.toFixed(0), "25");
  assert.equal(r.designs[2]!.fb_hz, 22);
  assert.ok(r.designs[3]!.open_baffle);
  assert.equal(r.designs[3]!.kind, "Open baffle");
});

test("size auto matches the app's Size all boxes (WinISD QB3 for the RSS315HF-4)", async () => {
  const r = await simulateRequest({ driver: { id: "dayton-audio/rss315hf-4" }, designs: [{ kind: "vented", size: "auto" }] }, { db });
  const v = r.designs[0]!;
  assert.equal(v.vb_l, 75.6);
  assert.ok(Math.abs(v.fb_hz! - 24.4) < 0.1);
  assert.ok(Math.abs(v.f3_hz! - 24.2) < 0.1);
});

test("a PR box sized auto without a PR gets one from the PR finder", async () => {
  const { loadDatabase } = await import("../../db-tools/src/load.ts");
  const { prCandidate } = await import("../../../site/drivers.ts");
  const cands = loadDatabase().passiveRadiators.map(prCandidate);
  const { state, notes } = await buildState({ driver: { id: "dayton-audio/rss315hf-4" }, designs: [{ kind: "pr", size: "auto" }] }, { db, prCandidates: async () => cands });
  const d = state.designs[0]!;
  assert.equal(d.kind, "pr");
  assert.ok(d.kind === "pr" && d.prId && d.prId !== undefined, notes.join("\n"));
});

test("custom T/S driver, volts drive and a slot port", async () => {
  const r = await simulateRequest(
    { driver: { name: "My 10", fs: 28, qts: 0.38, qms: 5, vas_l: 55, re: 3.3, sd_cm2: 330, xmax_mm: 12, pe_w: 300 }, drive: { volts: 2.83 }, designs: [{ kind: "vented", vb_l: 45, fb_hz: 30, port: { slot_w_cm: 20, slot_h_cm: 4 } }], output: { curves: ["spl", "port_velocity"], points_per_octave: 3 } },
    {},
  );
  assert.equal(r.driver.name, "My 10");
  assert.equal(r.drive, "2.8 V");
  assert.ok(Math.abs(r.designs[0]!.fb_hz! - 30) < 0.2);
  assert.equal(r.designs[0]!.curves.spl!.length, r.freq_hz.length);
  assert.ok(r.designs[0]!.curves.port_velocity);
});

test("ids that aren't in the database are reported together", async () => {
  await assert.rejects(
    buildState({ driver: { id: "nobody/nothing" }, designs: [{ kind: "pr", vb_l: 40, pr: { id: "nobody/pr" } }] }, { db }),
    (e: unknown) => e instanceof RequestError && e.missing.length === 2,
  );
});

test("a PR tuning out of reach says why", async () => {
  await assert.rejects(
    simulateRequest({ driver: { id: "dayton-audio/rss315hf-4" }, designs: [{ kind: "pr", vb_l: 20, pr: { id: "dayton-audio/rss315-pr" }, fb_hz: 80 }] }, { db }),
    /can't reach 80 Hz/,
  );
});

test("curves are capped for small replies", async () => {
  const r = await simulateRequest({ driver: { id: "dayton-audio/rss315hf-4" }, designs: [{ kind: "sealed", vb_l: 40 }], output: { from_hz: 10, to_hz: 1000, points_per_octave: 1000 } }, { db });
  assert.ok(r.freq_hz.length <= 400);
});
