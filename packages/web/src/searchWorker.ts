/** Runs one search job (search.ts) off the main thread: a message per tick, then "done". */
import { searchTicks, type SearchJob, type WorkerMessage } from "./search.ts";

const post = (m: WorkerMessage) => (self as unknown as { postMessage: (m: WorkerMessage) => void }).postMessage(m);

self.onmessage = (e: MessageEvent<SearchJob>) => {
  try {
    for (const tick of searchTicks(e.data)) post({ type: "tick", tick });
    post({ type: "done" });
  } catch (err) {
    post({ type: "error", message: (err as Error).message });
  }
};
