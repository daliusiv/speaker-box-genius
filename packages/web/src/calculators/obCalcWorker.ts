/** Runs the open baffle calculator's slow work (a frame's model takes a second or so) off the page. */
import { boardNumbers, readOb } from "./obCalcMath.ts";
import type { ObCalcReply, ObCalcRequest } from "./obCalcRun.ts";

const post = (m: ObCalcReply) => (self as unknown as { postMessage: (m: ObCalcReply) => void }).postMessage(m);

self.onmessage = (e: MessageEvent<ObCalcRequest>) => {
  const m = e.data;
  try {
    if (m.kind === "numbers") post({ id: m.id, numbers: boardNumbers(m.board, m.sd_m2) });
    else post({ id: m.id, result: readOb(m.state, m.board) });
  } catch (err) {
    post({ id: m.id, error: (err as Error).message });
  }
};
