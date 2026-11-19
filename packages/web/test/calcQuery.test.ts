import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanValue, decodeQuery, encodeQuery, type QuerySpec } from "../src/calculators/query.ts";
import { PORT_QUERY } from "../src/calculators/portLength.ts";
import { PR_QUERY } from "../src/calculators/passiveRadiator.ts";

const SPEC: QuerySpec = {
  u: { id: "u", kind: "check", on: "in" },
  vb: { id: "vb", kind: "num" },
  n: { id: "n", kind: "int" },
  s: { id: "s", kind: "choice", choices: ["round", "slot"] },
  sub: { id: "sub", kind: "check" },
  d: { id: "d", kind: "text" },
};
const DEFAULTS = { u: "", vb: "75", n: "1", s: "round", sub: "", d: "" };

test("calculator links: only changed values, round trip back to the same values", () => {
  assert.equal(encodeQuery(DEFAULTS, DEFAULTS, SPEC), "", "nothing changed: a clean address");
  const values = { u: "in", vb: "2.65", n: "2", s: "slot", sub: "1", d: "dayton-audio/rss315hf-4" };
  const q = encodeQuery(values, DEFAULTS, SPEC);
  assert.equal(q, "?u=in&vb=2.65&n=2&s=slot&sub=1&d=dayton-audio/rss315hf-4");
  assert.deepEqual(decodeQuery(q, SPEC), values);
});

test("calculator links: a check that's on by default can be turned off by the link", () => {
  const on = { ...DEFAULTS, sub: "1" };
  const q = encodeQuery({ ...on, sub: "" }, on, SPEC);
  assert.equal(q, "?sub=0");
  assert.deepEqual(decodeQuery(q, SPEC), { sub: "" });
});

test("calculator links: bad or unknown values are dropped, so the field keeps its default", () => {
  assert.deepEqual(decodeQuery("?vb=abc&n=0&s=horn&u=yes&d=<script>&x=1", SPEC), {});
  assert.deepEqual(decodeQuery("?vb=-3&n=2.5", SPEC), {});
  assert.deepEqual(decodeQuery("?vb=1e9", SPEC), {});
  assert.deepEqual(decodeQuery("?vb=12,5&n=3", SPEC), { vb: "12.5", n: "3" }, "a decimal comma is read");
  assert.deepEqual(decodeQuery("?vb=", SPEC), { vb: "" }, "an optional number left blank");
  assert.equal(cleanValue({ id: "d", kind: "text" }, "a".repeat(200)), null);
});

test("calculator links: every key of the port and PR pages is unique and names a field", () => {
  for (const spec of [PORT_QUERY, PR_QUERY]) {
    const ids = Object.values(spec).map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const k of Object.keys(spec)) assert.match(k, /^[a-z]{1,3}$/, `short key: ${k}`);
  }
});
