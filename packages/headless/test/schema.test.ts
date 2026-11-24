import { test } from "node:test";
import assert from "node:assert/strict";
import { designFields, simRequestSchema, validateRequest, DESIGN_KINDS } from "../src/index.ts";

test("the schema's top-level keys are the ones validateRequest takes", () => {
  const keys = Object.keys(simRequestSchema.properties);
  const probe = Object.fromEntries(keys.map((k) => [k, undefined]));
  assert.deepEqual(validateRequest({ ...probe, driver: { id: "a/b" }, designs: [{ kind: "sealed" }], nope: 1 }).filter((e) => e.startsWith("request:")), ["request: unknown key `nope`"]);
});

test("the schema's design fields are real fields (friendly or the app's)", () => {
  const named = Object.keys(simRequestSchema.properties.designs.items.properties);
  const friendly = ["kind", "name", "vb_l", "size", "fb_hz", "port", "pr"];
  const app = new Set(DESIGN_KINDS.flatMap((k) => designFields(k)));
  for (const k of named) assert.ok(friendly.includes(k) || app.has(k), k);
});
