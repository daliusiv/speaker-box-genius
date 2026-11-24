/** Runs the charts' simulations (designRunner.ts) off the main thread: one reply per request. */
import { runDesigns } from "./sim.ts";
import type { DesignsReply, DesignsRequest } from "./designRunner.ts";

const post = (m: DesignsReply) => (self as unknown as { postMessage: (m: DesignsReply) => void }).postMessage(m);

self.onmessage = (e: MessageEvent<DesignsRequest>) => {
  const { id, s, solved } = e.data;
  try {
    post({ id, designs: runDesigns(s, solved) });
  } catch (err) {
    post({ id, error: (err as Error).message });
  }
};
