/**
 * The open baffle calculator's board numbers and driver run, in a Web Worker when there is one (a
 * frame's model takes a second or so to build and would hold up the page), else here.
 */
import type { AppState } from "../state.ts";
import { boardNumbers, readOb, type ObForm, type ObResult } from "./obCalcMath.ts";

type Numbers = ReturnType<typeof boardNumbers>;
type Job = { kind: "numbers"; board: ObForm; sd_m2: number } | { kind: "read"; state: AppState; board: ObForm };
export type ObCalcRequest = Job & { id: number };
export type ObCalcReply = { id: number; numbers?: Numbers; result?: ObResult | null; error?: string };

let worker: Worker | null | undefined;
let seq = 0;
const waiting = new Map<number, (r: ObCalcReply) => void>();

function theWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = typeof Worker === "undefined" ? null : new Worker(new URL("./obCalcWorker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  if (worker) worker.onmessage = (e: MessageEvent<ObCalcReply>) => {
    const done = waiting.get(e.data.id);
    waiting.delete(e.data.id);
    done?.(e.data);
  };
  return worker;
}

function ask(m: Job): Promise<ObCalcReply> | null {
  const w = theWorker();
  if (!w) return null;
  const id = ++seq;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    try {
      w.postMessage({ ...m, id });
    } catch {
      waiting.delete(id);
      resolve({ id, error: "worker" });
    }
  });
}

/** Path D, peak, null and quarter-wave of a board or frame (a frame in the worker). */
export async function obNumbers(board: ObForm, sd_m2: number): Promise<Numbers> {
  if (board.frame !== "flat") {
    const r = await ask({ kind: "numbers", board, sd_m2 });
    if (r?.numbers) return r.numbers;
  }
  return boardNumbers(board, sd_m2);
}

/** The board or frame with the driver: chart, EQ, excursion (a frame in the worker). */
export async function obRead(state: AppState, board: ObForm): Promise<ObResult | null> {
  if (board.frame !== "flat") {
    const r = await ask({ kind: "read", state, board });
    if (r && !r.error) return r.result ?? null;
  }
  return readOb(state, board);
}
