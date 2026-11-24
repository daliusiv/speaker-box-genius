/**
 * Runs the charts' simulations (runDesigns) in a Web Worker, so typing a value or dragging the
 * drive slider never waits on them: the charts keep the last result until the new one lands.
 * Changes that add, remove or switch boxes on or off (or change whether there's a comparison
 * driver) run here at once, so the charts never show a box the page no longer has. Open-baffle
 * frames are left out of that run (their model takes a second or more to build); they follow
 * from the worker. Without a worker (tests, an old browser, data a worker can't take) everything
 * runs here.
 */
import { useEffect, useReducer, useRef } from "react";
import { runDesigns, solveDriver, type Design } from "./sim.ts";
import { compareView, type AppState } from "./state.ts";

type SolveResult = ReturnType<typeof solveDriver>;

export type DesignsRequest = { id: number; s: AppState; solved: SolveResult };
export type DesignsReply = { id: number; designs: Design[] } | { id: number; error: string };

/** The part of a worker the runner uses (a fake one in tests). */
export interface WorkerLike {
  postMessage(m: DesignsRequest): void;
  onmessage: ((e: { data: DesignsReply }) => void) | null;
  terminate(): void;
}

/** Which boxes the run will draw: when this changes the run goes on the page, not to the worker. */
export function designsShape(s: AppState, solved: SolveResult): string {
  if (solved.missing.length > 0) return "-";
  return `${s.designs.filter((d) => d.on).map((d) => d.id).join(",")}|${compareView(s) ? "cmp" : ""}`;
}

/** One request at a time: a newer one makes any reply to the older one be ignored. */
export class DesignsRunner {
  private worker: WorkerLike | null = null;
  private failed = false;
  private seq = 0;
  private handlers: { ok: (d: Design[]) => void; fail: () => void } | null = null;
  private readonly make: () => WorkerLike | null;

  constructor(make: () => WorkerLike | null) {
    this.make = make;
  }

  /** Whether runs can go to a worker: makes it on first ask; false once it couldn't be made or took a state it couldn't clone. */
  ready(): boolean {
    if (this.failed) return false;
    if (this.worker) return true;
    try {
      this.worker = this.make();
    } catch {
      this.worker = null;
    }
    if (!this.worker) {
      this.failed = true;
      return false;
    }
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.id !== this.seq || !this.handlers) return;
      const h = this.handlers;
      this.handlers = null;
      if ("designs" in m) h.ok(m.designs);
      else h.fail();
    };
    return true;
  }

  /** Sends the run to the worker; false when it can't go (run it here instead). */
  request(s: AppState, solved: SolveResult, ok: (d: Design[]) => void, fail: () => void): boolean {
    if (!this.ready()) return false;
    const id = ++this.seq;
    try {
      this.worker!.postMessage({ id, s, solved });
    } catch {
      // Something in the state a worker can't take (structuredClone): run here from now on.
      this.failed = true;
      this.handlers = null;
      return false;
    }
    this.handlers = { ok, fail };
    return true;
  }

  /** Drops the request in flight (its reply is ignored). */
  cancel(): void {
    this.seq++;
    this.handlers = null;
  }

  dispose(): void {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }
}

const browserWorker = (): WorkerLike | null =>
  typeof Worker === "undefined" ? null : (new Worker(new URL("./designsWorker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike);

type Ran = { s: AppState; solved: SolveResult; shape: string; designs: Design[]; partial?: boolean };

/** Whether a box is an open-baffle frame that's switched on (slow to build: left to the worker). */
const slowBox = (d: AppState["designs"][number]) => d.on && d.kind === "ob" && d.frame !== "flat";

/** The state with its open-baffle frames switched off, or null when it has none on. */
export function withoutSlowBoxes(s: AppState): AppState | null {
  return s.designs.some(slowBox) ? { ...s, designs: s.designs.map((d) => (slowBox(d) ? { ...d, on: false } : d)) } : null;
}

/**
 * The designs for the charts. Returns the last finished run while a newer one is in the worker;
 * runs on the page when the boxes drawn change or there is no worker.
 */
export function useDesigns(s: AppState, solved: SolveResult, make: () => WorkerLike | null = browserWorker): Design[] {
  const ran = useRef<Ran | null>(null);
  const runner = useRef<DesignsRunner | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  runner.current ??= new DesignsRunner(make);
  const shape = designsShape(s, solved);
  const prev = ran.current;
  const fresh = !!prev && prev.s === s && prev.solved === solved;
  // On the page: the first run, a change to which boxes are drawn, or no worker to send it to.
  // With a worker, any open-baffle frames are left out here and follow from it.
  if (!prev || (!fresh && (prev.shape !== shape || !runner.current.ready()))) {
    const quick = runner.current.ready() ? withoutSlowBoxes(s) : null;
    ran.current = quick ? { s, solved, shape, designs: runDesigns(quick, solved), partial: true } : { s, solved, shape, designs: runDesigns(s, solved) };
  }
  const stale = !!ran.current!.partial || ran.current!.s !== s || ran.current!.solved !== solved;

  useEffect(() => {
    const r = runner.current!;
    if (!stale) {
      r.cancel();
      return;
    }
    const here = () => {
      ran.current = { s, solved, shape, designs: runDesigns(s, solved) };
      bump();
    };
    const sent = r.request(
      s,
      solved,
      (designs) => {
        ran.current = { s, solved, shape, designs };
        bump();
      },
      here,
    );
    if (!sent) here();
  }, [s, solved, stale, shape]);

  useEffect(() => () => runner.current?.dispose(), []);
  return ran.current!.designs;
}
