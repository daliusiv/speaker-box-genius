import { test } from "node:test";
import assert from "node:assert/strict";
import { guardDomForTranslation } from "../src/domGuard.ts";

/** A tiny stand-in for DOM nodes: children in order, a parent pointer, the real methods' errors. */
class FakeNode {
  parentNode: FakeNode | null = null;
  children: FakeNode[] = [];
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  appendChild(n: FakeNode) {
    n.parentNode?.children.splice(n.parentNode.children.indexOf(n), 1);
    this.children.push(n);
    n.parentNode = this;
    return n;
  }
  insertBefore(n: FakeNode, ref: FakeNode | null) {
    if (!ref) return this.appendChild(n);
    const i = this.children.indexOf(ref);
    if (i < 0) throw new Error("NotFoundError: insertBefore");
    this.children.splice(i, 0, n);
    n.parentNode = this;
    return n;
  }
  removeChild(n: FakeNode) {
    const i = this.children.indexOf(n);
    if (i < 0) throw new Error("NotFoundError: removeChild");
    this.children.splice(i, 1);
    n.parentNode = null;
    return n;
  }
}
guardDomForTranslation(FakeNode.prototype as unknown as Node);
const names = (n: FakeNode) => n.children.map((c) => c.name).join(",");

test("domGuard: normal inserts and removals are unchanged", () => {
  const p = new FakeNode("p");
  const a = p.appendChild(new FakeNode("a"));
  p.insertBefore(new FakeNode("b"), a);
  assert.equal(names(p), "b,a");
  p.removeChild(a);
  assert.equal(names(p), "b");
});

test("domGuard: a reference node a translator moved out → append, no throw (#406)", () => {
  const p = new FakeNode("p");
  const text = p.appendChild(new FakeNode("text"));
  const font = new FakeNode("font"); // the translator's replacement
  p.removeChild(text);
  p.appendChild(font);
  assert.doesNotThrow(() => p.insertBefore(new FakeNode("new"), text));
  assert.equal(names(p), "font,new");
});

test("domGuard: removing a node that is already gone is skipped, no throw", () => {
  const p = new FakeNode("p");
  const gone = new FakeNode("gone");
  assert.equal(p.removeChild(gone), gone);
  assert.equal(names(p), "");
});

test("domGuard: patching twice wraps once", () => {
  const before = FakeNode.prototype.insertBefore;
  guardDomForTranslation(FakeNode.prototype as unknown as Node);
  assert.equal(FakeNode.prototype.insertBefore, before);
});
