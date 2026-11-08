import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePrCandidates } from "@sbg/engine";
import { DEFAULT_STATE, newDesign, type LineDesign, type PrDesign } from "../src/state.ts";
import { alignmentDriver, driverInputOf, simOptionsOf, solveDriver } from "../src/sim.ts";
import { SHOWN_PRESETS } from "../src/lineopt.ts";
import { searchSteps, startSearch, type SearchJob, type SearchStep } from "../src/search.ts";
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
  const steps = [...searchSteps(job)] as Extract<SearchStep, { kind: "pr" }>[];
  assert.equal(steps.length, candidates.length);
  assert.deepEqual(steps.flatMap((x) => x.results), [...evaluatePrCandidates(driver, candidates, options)].flat());
  assert.equal(steps.at(-1)!.done, candidates.length);

  const compare: SearchJob = { kind: "compare", presets: SHOWN_PRESETS.map((x) => x.id), driver, design: line, sim, align: alignmentDriver(solved, s), drivers: 1, wall_mm: 18 };
  assert.deepEqual(structuredClone(compare), compare);
  const rows = [...searchSteps(compare)];
  assert.equal(rows.length, SHOWN_PRESETS.length);
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
  let called = false;
  const stop = startSearch(job, { step: () => (called = true), done: () => (called = true), error: () => (called = true) });
  stop();
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(called, false);
});
