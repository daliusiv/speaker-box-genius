/**
 * The slower searches (passive radiator finder, best line, compare line types) as jobs that run
 * in a Web Worker, so the page keeps scrolling and the progress bar moves on slow phones. Each
 * job is a generator: one step of work per yield. The worker runs it straight through; where a
 * worker can't start (an old browser, offline before the file was fetched, or data it can't
 * take) the same steps run here in short slices between paints, as before.
 */
import { evaluatePrCandidates, type AlignmentDriver, type DriverInput, type PrCandidate, type PrFinderOptions, type PrFinderResult, type SimulationOptions } from "@sbg/engine";
import { bestLine, compareOne, type LineBest, type LineCompare, type LineGoal, type PresetId } from "./lineopt.ts";
import type { LineDesign } from "./state.ts";

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
    };

export type SearchStep =
  | { kind: "pr"; done: number; results: PrFinderResult[] }
  | { kind: "bestLine"; result: LineBest | null }
  | { kind: "compare"; row: LineCompare };

/** The job's work, one step per yield. */
export function* searchSteps(job: SearchJob): Generator<SearchStep> {
  if (job.kind === "pr") {
    let done = 0;
    for (const results of evaluatePrCandidates(job.driver, job.candidates, job.options)) yield { kind: "pr", done: ++done, results };
  } else if (job.kind === "bestLine") {
    yield { kind: "bestLine", result: bestLine(job.driver, job.design, job.sim, job.goal, job.wall_mm) };
  } else {
    for (const id of job.presets) yield { kind: "compare", row: compareOne(id, job.driver, job.design, job.sim, job.align, job.drivers, job.wall_mm) };
  }
}

export type WorkerMessage = { type: "step"; step: SearchStep } | { type: "done" } | { type: "error"; message: string };

export interface SearchHandlers {
  step: (s: SearchStep) => void;
  done: () => void;
  error: (message: string) => void;
}

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
 * a stop.
 */
export function startSearch(job: SearchJob, h: SearchHandlers, opts: { worker?: boolean } = {}): () => void {
  let over = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let worker: Worker | null = null;
  const end = (f: () => void) => {
    if (over) return;
    over = true;
    worker?.terminate();
    worker = null;
    f();
  };
  const inSlices = () => {
    const steps = searchSteps(job);
    const slice = () => {
      if (over) return;
      const t0 = performance.now();
      try {
        while (performance.now() - t0 < 30) {
          const n = steps.next();
          if (n.done) return end(h.done);
          h.step(n.value);
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
    if (m.type === "step") h.step(m.step);
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
