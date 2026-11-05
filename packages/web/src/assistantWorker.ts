/**
 * The design assistant's slower searches (transmission lines, bandpass boxes) off the main
 * thread, so the dialog stays responsive. One message in (the job), one message per driver
 * out with its results, then "done". The dialog falls back to running them itself in slices
 * when a worker can't start (an old browser, or offline before this file was ever fetched).
 */
import { evaluateDriver, type AssistantGoal, type AssistantResult, type AssistantStage, type IndexRow } from "./assistant.ts";
import type { LoadedDriver } from "./library.ts";
import type { AppState } from "./state.ts";

export interface WorkerTask {
  row: IndexRow;
  driver: LoadedDriver;
  stage: AssistantStage;
}
export interface WorkerJob {
  base: AppState;
  goal: AssistantGoal;
  tasks: WorkerTask[];
}
export type WorkerReply = { type: "result"; done: number; results: AssistantResult[] } | { type: "done" };

const post = (m: WorkerReply) => (self as unknown as { postMessage: (m: WorkerReply) => void }).postMessage(m);

self.onmessage = (e: MessageEvent<WorkerJob>) => {
  const { base, goal, tasks } = e.data;
  let done = 0;
  for (const t of tasks) {
    let results: AssistantResult[] = [];
    try {
      results = evaluateDriver(base, t.row, t.driver, goal, t.stage);
    } catch {
      // One that won't simulate is left out; the rest carry on.
    }
    post({ type: "result", done: ++done, results });
  }
  post({ type: "done" });
};
