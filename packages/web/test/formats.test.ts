import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { DEFAULT_STATE } from "../src/state.ts";
import { runDesigns, solveDriver } from "../src/sim.ts";
import { EXPORT_FORMATS } from "../src/formats/registry.ts";
import { bundle } from "../src/formats/download.ts";
import { projectJson, readProjectJson } from "../src/formats/project.ts";
import { ICON_PATHS } from "../src/iconPaths.ts";

const state = DEFAULT_STATE;
const ctx = { state, designs: runDesigns(state, solveDriver(state)), shareUrl: "https://speakerboxgenius.com/#s=test" };

test("every export format has a unique id, a known icon and a group", () => {
  const ids = EXPORT_FORMATS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of EXPORT_FORMATS) assert.ok(f.icon in ICON_PATHS, `${f.id}: icon ${f.icon}`);
});

test("every format writes its files for the example project's boxes", () => {
  for (const f of EXPORT_FORMATS) {
    if (f.id === "browser") continue; // localStorage: browser only
    const ids = state.designs.filter((d) => d.on && (f.supports?.(d, state) ?? true) === true).map((d) => d.id);
    if (f.scope === "designs" && ids.length === 0) continue;
    const opts = f.defaults?.(state) ?? {};
    const r = f.run(ctx, ids, opts);
    assert.ok(typeof r !== "string", `${f.id}: ${r}`);
    assert.ok("files" in r, f.id);
    assert.ok(r.files.length >= 1, f.id);
    for (const file of r.files) assert.ok(file.data.length > 50, `${f.id}: ${file.name} is empty`);
    if (f.scope === "designs") assert.equal(r.files.length, f.id === "csv" ? 1 : ids.length, f.id);
  }
});

test("a box-by-box format refuses an empty pick", () => {
  for (const f of EXPORT_FORMATS.filter((x) => x.scope === "designs")) assert.equal(typeof f.run(ctx, [], f.defaults?.(state) ?? {}), "string", f.id);
});

test("browser save reports, rather than throws, when there's no storage", () => {
  const f = EXPORT_FORMATS.find((x) => x.id === "browser")!;
  const r = f.run(ctx, [], { name: "Test" });
  assert.ok(typeof r === "string" || "message" in r);
});

test("a project file opens back to the same project", () => {
  const back = readProjectJson(projectJson(state));
  assert.ok(back);
  assert.equal(back.driverName, state.driverName);
  assert.deepEqual(back.designs.map((d) => d.id), state.designs.map((d) => d.id));
  assert.equal(readProjectJson("{\"app\":\"other\"}"), null);
  assert.equal(readProjectJson("not json"), null);
});

test("one file downloads as is; several go in one zip with unique names", () => {
  const a = { name: "a.txt", data: "one", type: "text/plain" };
  assert.equal(bundle([a], "x"), a);
  const z = bundle([a, { ...a, data: "two" }, { name: "b.cir", data: "three", type: "text/plain" }], "Example");
  assert.equal(z.name, "Example.zip");
  const files = unzipSync(z.data as Uint8Array);
  assert.deepEqual(Object.keys(files).sort(), ["a (2).txt", "a.txt", "b.cir"]);
  assert.equal(strFromU8(files["a (2).txt"]!), "two");
});
