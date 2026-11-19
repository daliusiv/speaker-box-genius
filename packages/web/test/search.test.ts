import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePrCandidates } from "@sbg/engine";
import { DEFAULT_STATE, newDesign, type LineDesign, type PrDesign } from "../src/state.ts";
import { alignmentDriver, driverInputOf, simOptionsOf, solveDriver } from "../src/sim.ts";
import { SHOWN_PRESETS, bestLine } from "../src/lineopt.ts";
import { PROGRESS_MS, searchTicks, startSearch, type SearchJob, type SearchStep } from "../src/search.ts";
import { checkTicks } from "./ticks.ts";
import { loadDatabase } from "../../db-tools/src/load.ts";

const s = DEFAULT_STATE;
const solved = solveDriver(s);
const driver = driverInputOf(s, solved);
const sim = simOptionsOf(s);
const line = newDesign("line", s.designs) as LineDesign;

test("search jobs carry only data a worker can take, and give what the old code computed", async () => {
  const { prCandidate } = await import("../../../site/drivers.ts");
  const candidates = loadDatabase().passiveRadiators.slice(0, 6).map(prCandidate);
  const pr = s.designs.find((d) => d.kind === "pr") as PrDesign;
  const options = { vb_l: pr.vb_l, targetFb: pr.targetFb, sim, losses: s.settings.losses };
  const job: SearchJob = { kind: "pr", driver, candidates, options };
  // A function or a class instance anywhere would make postMessage throw, and the worker never start.
  assert.deepEqual(structuredClone(job), job);
  const ticks = [...searchTicks(job)];
  checkTicks(ticks);
  const steps = ticks.flatMap((t) => (t.step ? [t.step] : [])) as Extract<SearchStep, { kind: "pr" }>[];
  assert.equal(steps.length, candidates.length);
  assert.deepEqual(steps.flatMap((x) => x.results), [...evaluatePrCandidates(driver, candidates, options)].flat());
  assert.equal(ticks.at(-1)!.total, candidates.length);

  const compare: SearchJob = { kind: "compare", presets: SHOWN_PRESETS.map((x) => x.id), driver, design: line, sim, align: alignmentDriver(solved, s), drivers: 1, wall_mm: 18 };
  assert.deepEqual(structuredClone(compare), compare);
  const cticks = [...searchTicks(compare)];
  checkTicks(cticks);
  const rows = cticks.filter((t) => t.step);
  assert.equal(rows.length, SHOWN_PRESETS.length);
  assert.equal(cticks.at(-1)!.total, SHOWN_PRESETS.length);
  assert.ok(!SHOWN_PRESETS.some((x) => x.id === "th"), "the tapped horn stays out of Compare types");
});

test("without a worker the job runs here in slices, and a stop ends it with no done", async () => {
  const job: SearchJob = { kind: "bestLine", driver, design: line, sim, goal: "deep", wall_mm: 18 };
  const got = await new Promise<SearchStep[]>((resolve, reject) => {
    const out: SearchStep[] = [];
    startSearch(job, { step: (x) => out.push(x), done: () => resolve(out), error: reject });
  });
  assert.equal(got.length, 1);
  assert.equal(got[0]!.kind, "bestLine");
  assert.deepEqual((got[0] as Extract<SearchStep, { kind: "bestLine" }>).result, bestLine(driver, line, sim, "deep", 18), "the same answer as before");
  let called = false;
  const stop = startSearch(job, { step: () => (called = true), done: () => (called = true), error: () => (called = true) });
  stop();
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(called, false);
});

test("best line ticks once per driver position and stuffing, then gives its answer", () => {
  const ticks = [...searchTicks({ kind: "bestLine", driver, design: line, sim, goal: "smooth", wall_mm: 18 })];
  checkTicks(ticks);
  assert.ok(ticks[0]!.total > 10, `${ticks[0]!.total} combinations`);
  assert.equal(ticks.length, ticks[0]!.total + 1);
  assert.ok(ticks.slice(0, -1).every((t) => !t.step), "only the last tick carries the answer");
  assert.deepEqual(ticks.at(-1)!.step, { kind: "bestLine", result: bestLine(driver, line, sim, "smooth", 18) });
});

test("here in slices: the same steps as the job gives, and progress at most every 50 ms plus the last", async () => {
  const job: SearchJob = { kind: "compare", presets: SHOWN_PRESETS.map((x) => x.id), driver, design: line, sim, align: alignmentDriver(solved, s), drivers: 1, wall_mm: 18 };
  const want = [...searchTicks(job)].flatMap((t) => (t.step ? [t.step] : []));
  // A clock that never moves: only the first and the last progress get through.
  const shown: [number, number][] = [];
  const steps: SearchStep[] = [];
  await new Promise<void>((resolve, reject) => startSearch(job, { step: (x) => steps.push(x), progress: (d, t) => shown.push([d, t]), done: resolve, error: reject }, { now: () => 0 }));
  assert.deepEqual(steps, want);
  const n = SHOWN_PRESETS.length;
  assert.deepEqual(shown, [
    [0, n],
    [n, n],
  ]);
  // A clock that jumps PROGRESS_MS a tick: every one shows.
  let t = 0;
  const all: number[] = [];
  await new Promise<void>((resolve, reject) => startSearch(job, { progress: (d) => all.push(d), done: resolve, error: reject }, { now: () => (t += PROGRESS_MS) }));
  assert.deepEqual(all, [...Array(n + 1).keys()]);
});

test("passive radiator best tuning as a job: 0 of 1, then bestPrTuning's own answer", async () => {
  const { bestPrTuning } = await import("@sbg/engine");
  const { prCandidate } = await import("../../../site/drivers.ts");
  const [c] = loadDatabase().passiveRadiators.slice(0, 1).map(prCandidate);
  const pr = s.designs.find((d) => d.kind === "pr") as PrDesign;
  for (const goal of ["flat", "smallest"] as const) {
    const options = { goal, vb_l: pr.vb_l, pr: c!.pr, count: 2, sim, losses: s.settings.losses, targetF3: 40 };
    const job: SearchJob = { kind: "prTuning", driver, options };
    assert.deepEqual(structuredClone(job), job);
    const ticks = [...searchTicks(job)];
    checkTicks(ticks);
    assert.deepEqual(ticks.at(-1)!.step, { kind: "prTuning", result: bestPrTuning(driver, options) });
  }
});
