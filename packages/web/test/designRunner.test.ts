import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, newDesign, type AppState, type ObDesign } from "../src/state.ts";
import { runDesigns, solveDriver } from "../src/sim.ts";
import { DesignsRunner, designsShape, withoutSlowBoxes, type DesignsReply, type DesignsRequest, type WorkerLike } from "../src/designRunner.ts";

/** A worker that answers when told to, with structuredClone both ways as postMessage does. */
class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: DesignsReply }) => void) | null = null;
  inbox: DesignsRequest[] = [];
  terminated = false;
  postMessage(m: DesignsRequest) {
    this.inbox.push(structuredClone(m));
  }
  answer(k = this.inbox.length - 1) {
    const m = this.inbox[k]!;
    this.onmessage?.({ data: structuredClone({ id: m.id, designs: runDesigns(m.s, m.solved) }) });
  }
  fail(k = this.inbox.length - 1) {
    this.onmessage?.({ data: { id: this.inbox[k]!.id, error: "boom" } });
  }
  terminate() {
    this.terminated = true;
  }
}

const S = DEFAULT_STATE;
const solved = solveDriver(S);
const louder: AppState = { ...S, power: S.power * 2 };

test("designs in a worker: the same as on the page, after structuredClone both ways", () => {
  const w = new FakeWorker();
  const r = new DesignsRunner(() => w);
  let got: ReturnType<typeof runDesigns> | null = null;
  assert.equal(r.request(S, solved, (d) => (got = d), () => assert.fail("failed")), true);
  w.answer();
  const here = runDesigns(S, solved);
  assert.ok(got);
  assert.equal(got!.length, here.length);
  got!.forEach((d, i) => {
    assert.equal(d.label, here[i]!.label);
    assert.deepEqual(d.result.spl, here[i]!.result.spl);
    assert.deepEqual(d.result.maxSpl, here[i]!.result.maxSpl);
    assert.deepEqual(d.result.ceilings, here[i]!.result.ceilings);
    assert.deepEqual(d.design, here[i]!.design);
  });
});

test("designs in a worker: only the newest request's reply is used; cancel drops the one in flight", () => {
  const w = new FakeWorker();
  const r = new DesignsRunner(() => w);
  const seen: string[] = [];
  r.request(S, solved, () => seen.push("old"), () => seen.push("old failed"));
  r.request(louder, solved, () => seen.push("new"), () => seen.push("new failed"));
  w.answer(0); // late reply to the first: ignored
  assert.deepEqual(seen, []);
  w.answer(1);
  assert.deepEqual(seen, ["new"]);
  w.answer(1); // a reply is used once
  assert.deepEqual(seen, ["new"]);
  r.request(S, solved, () => seen.push("cancelled"), () => seen.push("cancelled failed"));
  r.cancel();
  w.answer();
  assert.deepEqual(seen, ["new"]);
  r.request(S, solved, () => seen.push("x"), () => seen.push("error"));
  w.fail();
  assert.deepEqual(seen, ["new", "error"]);
  r.dispose();
  assert.ok(w.terminated);
});

test("designs in a worker: no worker, or a state it can't take, runs on the page", () => {
  assert.equal(new DesignsRunner(() => null).request(S, solved, () => {}, () => {}), false);
  assert.equal(
    new DesignsRunner(() => {
      throw new Error("no workers here");
    }).request(S, solved, () => {}, () => {}),
    false,
  );
  const w = new FakeWorker();
  const r = new DesignsRunner(() => w);
  const bad = { ...S, oops: () => 1 } as unknown as AppState;
  assert.equal(r.request(bad, solved, () => {}, () => {}), false);
  // Once a state couldn't go, stay on the page (no flip-flopping).
  assert.equal(r.request(S, solved, () => {}, () => {}), false);
});

test("designs in a worker: the boxes drawn decide what runs at once", () => {
  const base = designsShape(S, solved);
  // Drive, volumes, settings: same boxes, so the worker can take it.
  assert.equal(designsShape(louder, solved), base);
  assert.equal(designsShape({ ...S, settings: { ...S.settings, rg: 0.5 } }, solved), base);
  const d0 = S.designs[0]!;
  assert.equal(designsShape({ ...S, designs: S.designs.map((d) => (d.id === d0.id ? { ...d, vb_l: 99 } : d)) as AppState["designs"] }, solved), base);
  // A box switched off, removed or added: on the page.
  assert.notEqual(designsShape({ ...S, designs: S.designs.map((d) => (d.id === d0.id ? { ...d, on: !d.on } : d)) as AppState["designs"] }, solved), base);
  assert.notEqual(designsShape({ ...S, designs: S.designs.filter((d) => d.id !== d0.id) }, solved), base);
  assert.notEqual(designsShape({ ...S, designs: [...S.designs, { ...d0, id: "new-box", on: true }] as AppState["designs"] }, solved), base);
  // No driver: no boxes at all.
  assert.equal(designsShape(S, { ...solved, missing: ["fs"] } as typeof solved), "-");
});

test("designs in a worker: open-baffle frames are left out of the page's quick run (the worker brings them)", () => {
  const frame = { ...(newDesign("ob", S.designs) as ObDesign), id: "f1", frame: "u" as const };
  const flat = { ...(newDesign("ob", S.designs) as ObDesign), id: "f2" };
  const s: AppState = { ...S, designs: [...S.designs, frame, flat] };
  const quick = withoutSlowBoxes(s)!;
  assert.ok(quick, "a state with a frame on has a quicker version");
  assert.equal(quick.designs.find((d) => d.id === "f1")!.on, false, "the frame is left out");
  assert.equal(quick.designs.find((d) => d.id === "f2")!.on, true, "a flat board stays (its model is quick)");
  assert.deepEqual(
    quick.designs.filter((d) => d.id !== "f1"),
    s.designs.filter((d) => d.id !== "f1"),
    "everything else as it was",
  );
  assert.equal(withoutSlowBoxes(S), null, "nothing to leave out without a frame");
  assert.equal(withoutSlowBoxes({ ...s, designs: s.designs.map((d) => (d.id === "f1" ? { ...d, on: false } : d)) }), null, "a frame switched off doesn't count");
});
