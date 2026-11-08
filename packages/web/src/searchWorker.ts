/** Runs one search job (search.ts) off the main thread: a message per step, then "done". */
import { searchSteps, type SearchJob, type WorkerMessage } from "./search.ts";

const post = (m: WorkerMessage) => (self as unknown as { postMessage: (m: WorkerMessage) => void }).postMessage(m);

self.onmessage = (e: MessageEvent<SearchJob>) => {
  try {
    for (const step of searchSteps(e.data)) post({ type: "step", step });
    post({ type: "done" });
  } catch (err) {
    post({ type: "error", message: (err as Error).message });
  }
};
