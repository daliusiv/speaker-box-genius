/**
 * The slower searches (passive radiator finder and best tuning, best line, compare line types, the
 * design assistant's lines, bandpass and PR boxes, the stuffing fit) as jobs that run in a Web Worker, so the page keeps
 * scrolling and the progress bar moves on slow phones. Each job is a generator of ticks: how far
 * it has got ({ done, total }, starting at 0 of total) and, now and then, a step of results. The
 * worker runs it straight through; where a worker can't start (an old browser, offline before
 * the file was fetched, or data it can't take) the same ticks run here in short slices between
 * paints. Either way the caller sees the same events.
 */
import {
  bestPrTuning,
  evaluatePrCandidates,
  type AlignmentDriver,
  type DriverInput,
  type PrCandidate,
  type PrFinderOptions,
  type PrFinderResult,
  type PrTuningOptions,
  type PrTuningResult,
  type SimDelta,
  type SimulationOptions,
} from "@sbg/engine";
import { evaluateDriver, type AssistantGoal, type AssistantResult, type AssistantStage, type IndexRow, type PrCandidateWithParams } from "./assistant.ts";
import { bestLineSteps, compareOne, type LineBest, type LineCompare, type LineGoal, type PresetId } from "./lineopt.ts";
import type { LoadedDriver } from "./library.ts";
import type { AppState, DesignState, LineDesign } from "./state.ts";
import type { StuffableKind } from "./stuffing.ts";
import { fitStuffing, type FitSource, type StuffingFit } from "./stuffingFit.ts";
import { similarDelta, type SimilarJob } from "./similarApp.ts";

/** One driver for the design assistant's second pass. */
export interface AssistantTask {
  row: IndexRow;
  driver: LoadedDriver;
  stage: AssistantStage;
}

export type SearchJob =
  | { kind: "pr"; driver: DriverInput; candidates: PrCandidate[]; options: PrFinderOptions }
  | { kind: "bestLine"; driver: DriverInput; design: LineDesign; sim: SimulationOptions; goal: LineGoal; wall_mm: number }
  | {
      kind: "compare";
      presets: PresetId[];
      driver: DriverInput;
      design: LineDesign;
      sim: SimulationOptions;
      align: AlignmentDriver | null;
      drivers: number;
      wall_mm: number;
    }
  | { kind: "assistant"; base: AppState; goal: AssistantGoal; tasks: AssistantTask[]; prs?: PrCandidateWithParams[] }
  | { kind: "prTuning"; driver: DriverInput; options: PrTuningOptions }
  | { kind: "stuffingFit"; state: AppState; design: DesignState & { kind: StuffableKind }; measured: { f: number[]; v: number[] }; source: FitSource }
  | ({ kind: "similar" } & SimilarJob);

export type SearchStep =
  | { kind: "pr"; results: PrFinderResult[] }
  | { kind: "bestLine"; result: LineBest | null }
  | { kind: "compare"; row: LineCompare }
  | { kind: "assistant"; results: AssistantResult[] }
  | { kind: "prTuning"; result: PrTuningResult }
  | { kind: "stuffingFit"; fit: StuffingFit | string }
  | { kind: "similar"; id: string; delta: SimDelta | null };

/** How far a job has got, with the results that came with this tick (if any). */
export interface Tick {
  done: number;
  total: number;
  step?: SearchStep;
}

/** The job's work, one tick per yield; the first is 0 of total, the last total of total. */
export function* searchTicks(job: SearchJob): Generator<Tick> {
  if (job.kind === "pr") {
    const total = job.candidates.length;
    let done = 0;
    yield { done, total };
    for (const results of evaluatePrCandidates(job.driver, job.candidates, job.options)) yield { done: ++done, total, step: { kind: "pr", results } };
  } else if (job.kind === "bestLine") {
    const steps = bestLineSteps(job.driver, job.design, job.sim, job.goal, job.wall_mm);
    let last = { done: 0, total: 0 };
    for (;;) {
      const n = steps.next();
      if (n.done) {
        yield { ...last, step: { kind: "bestLine", result: n.value } };
        return;
      }
      last = n.value;
      if (last.done < last.total) yield last;
    }
  } else if (job.kind === "compare") {
    const total = job.presets.length;
    let done = 0;
    yield { done, total };
    for (const id of job.presets) {
      const row = compareOne(id, job.driver, job.design, job.sim, job.align, job.drivers, job.wall_mm);
      yield { done: ++done, total, step: { kind: "compare", row } };
    }
  } else if (job.kind === "similar") {
    // One same-box check per candidate (similarApp.ts), in the picker's order.
    const total = job.candidates.length;
    let done = 0;
    yield { done, total };
    for (const c of job.candidates) yield { done: ++done, total, step: { kind: "similar", id: c.id, delta: similarDelta(job, c.driver) } };
  } else if (job.kind === "prTuning" || job.kind === "stuffingFit") {
    // One search each, with nothing to count inside it: 0 of 1, then the answer.
    yield { done: 0, total: 1 };
    const step: SearchStep =
      job.kind === "prTuning"
        ? { kind: "prTuning", result: bestPrTuning(job.driver, job.options) }
        : { kind: "stuffingFit", fit: fitStuffing(job.state, job.design, job.measured, { source: job.source }) };
    yield { done: 1, total: 1, step };
  } else {
    const total = job.tasks.length;
    let done = 0;
    yield { done, total };
    for (const t of job.tasks) {
      let results: AssistantResult[] = [];
      try {
        results = evaluateDriver(job.base, t.row, t.driver, job.goal, t.stage, job.prs);
      } catch {
        // One that won't simulate is left out (still counted); the rest carry on.
      }
      yield { done: ++done, total, step: { kind: "assistant", results } };
    }
  }
}

export type WorkerMessage = { type: "tick"; tick: Tick } | { type: "done" } | { type: "error"; message: string };

export interface SearchHandlers {
  /** Every step of results, as it comes. */
  step?: (s: SearchStep) => void;
  /** How far it has got: at most every 50 ms, plus the first and the last. */
  progress?: (done: number, total: number) => void;
  done: () => void;
  error: (message: string) => void;
}

/** Shortest gap between two progress calls: a worker can send hundreds of ticks a second. */
export const PROGRESS_MS = 50;

/** Can the job's data go to a worker? (structuredClone throws where postMessage would.) */
const cloneable = (job: SearchJob) => {
  try {
    structuredClone(job);
    return true;
  } catch {
    return false;
  }
};

/**
 * Starts a job in a worker (or here, in slices). Returns a function that stops it; the steps
 * already handed over are kept by the caller. `done` and `error` are called once, and not after
 * a stop. `now` is for tests.
 */
export function startSearch(job: SearchJob, h: SearchHandlers, opts: { worker?: boolean; now?: () => number } = {}): () => void {
  const now = opts.now ?? (() => performance.now());
  let over = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let worker: Worker | null = null;
  let shownAt = -Infinity;
  let shown: number | null = null;
  let last: { done: number; total: number } | null = null;
  const tick = (t: Tick) => {
    if (t.step) h.step?.(t.step);
    last = { done: t.done, total: t.total };
    const at = now();
    if (shown === null || at - shownAt >= PROGRESS_MS) {
      shownAt = at;
      shown = t.done;
      h.progress?.(t.done, t.total);
    }
  };
  const end = (f: () => void) => {
    if (over) return;
    over = true;
    worker?.terminate();
    worker = null;
    // The last tick always shows, however soon after the one before it came.
    if (last && last.done !== shown) h.progress?.(last.done, last.total);
    f();
  };
  const inSlices = () => {
    const ticks = searchTicks(job);
    const slice = () => {
      if (over) return;
      const t0 = performance.now();
      try {
        while (performance.now() - t0 < 30) {
          const n = ticks.next();
          if (n.done) return end(h.done);
          tick(n.value);
        }
      } catch (e) {
        return end(() => h.error((e as Error).message));
      }
      timer = setTimeout(slice, 0);
    };
    timer = setTimeout(slice, 30);
  };
  const stop = () => {
    over = true;
    clearTimeout(timer);
    worker?.terminate();
    worker = null;
  };
  if (opts.worker === false || typeof Worker === "undefined" || !cloneable(job)) {
    inSlices();
    return stop;
  }
  try {
    worker = new Worker(new URL("./searchWorker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  if (!worker) {
    inSlices();
    return stop;
  }
  let heard = false;
  worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
    heard = true;
    if (over) return;
    const m = e.data;
    if (m.type === "tick") tick(m.tick);
    else if (m.type === "done") end(h.done);
    else end(() => h.error(m.message));
  };
  worker.onerror = (e) => {
    e.preventDefault();
    worker?.terminate();
    worker = null;
    if (over) return;
    // It never started (couldn't load): do the work here instead; else stop with what came in.
    if (!heard) inSlices();
    else end(() => h.error("The search stopped unexpectedly."));
  };
  worker.postMessage(job);
  return stop;
}
