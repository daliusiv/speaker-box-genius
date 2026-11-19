import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDriver, validatePassiveRadiator } from "../../schema/src/index.ts";
import { buildRecord, checkRecord, cleanCredit, cleanText, type SubmissionFields } from "../src/submission.ts";

const today = "2026-11-18";
const web = (credit?: string) => ({ kind: "web" as const, today, credit });

/** The first real submission (public #214), as the website form would send it. */
const EDGE: SubmissionFields = {
  kind: "driver",
  brand: "edge",
  model: "eds15d2-e3",
  type: "subwoofer",
  nominal_ohms: 2,
  voice_coils: 2,
  ts_wiring: "series",
  size_in: 15,
  ts: { fs: 36, qms: 4.122, qes: 0.612, qts: 0.533, vas_l: 8.187, re: 3.6, le_mh: 2.4, bl: 19.6, mms_g: 283, sd_cm2: 295, xmax_mm: 28.5, pe_w: 1850 },
  source_url: "https://edgecaraudio.com/products/edge-street-series-eds15d2-e3-subwoofer",
};

const fields = (r: { errors: { field: string }[] }) => r.errors.map((e) => e.field);

test("a web driver submission becomes a valid record with a web source note", () => {
  const b = buildRecord(EDGE, web("Theo"));
  assert.equal(b.brandSlug, "edge");
  assert.equal(b.modelSlug, "eds15d2-e3");
  assert.equal(b.record.brand, "Edge");
  assert.equal(b.record.model, "EDS15D2-E3");
  assert.equal(b.record.status, "community");
  assert.deepEqual(validateDriver(b.record), []);
  const src = (b.record.sources as Record<string, string>[])[0]!;
  assert.equal(src.note, "Submitted on the website form by Theo.");
  assert.equal(src.retrieved, today);
  assert.deepEqual(checkRecord(b), { errors: [], warnings: [] });
});

test("anonymous submissions get a plain note", () => {
  const src = (buildRecord(EDGE, web("  ")).record.sources as Record<string, string>[])[0]!;
  assert.equal(src.note, "Submitted on the website form.");
});

test("an existing brand keeps its database spelling", () => {
  const b = buildRecord({ ...EDGE, brand: "DAYTON AUDIO" }, web(), new Map([["dayton-audio", "Dayton Audio"]]));
  assert.equal(b.record.brand, "Dayton Audio");
  assert.equal(b.brandSlug, "dayton-audio");
});

test("only whitelisted fields reach the record; status can't be set", () => {
  const sneaky = { ...EDGE, status: "verified", plausibility_note: "trust me", ts: { ...EDGE.ts, foo: 1 } } as unknown as SubmissionFields;
  const r = buildRecord(sneaky, web()).record;
  assert.equal(r.status, "community");
  assert.equal(r.plausibility_note, undefined);
  assert.equal((r.ts as Record<string, unknown>).foo, undefined);
});

test("every problem comes back at once, each with its field", () => {
  const bad: SubmissionFields = { ...EDGE, nominal_ohms: undefined, source_url: "", ts: { ...EDGE.ts, fs: undefined, re: 300 } };
  const r = checkRecord(buildRecord(bad, web()));
  assert.deepEqual(fields(r).sort(), ["nominal_ohms", "source_url", "ts.fs", "ts.re"].sort());
});

test("a link that isn't http(s) is a source_url error", () => {
  const r = checkRecord(buildRecord({ ...EDGE, source_url: "ftp://example.com/x.pdf" }, web()));
  assert.deepEqual(fields(r), ["source_url"]);
});

test("inconsistent values are errors on their field; an explanation turns them into warnings", () => {
  // Re typed as one coil's 2 Ω instead of the datasheet's 3.6 (what happened in #214).
  const typo: SubmissionFields = { ...EDGE, ts: { ...EDGE.ts, re: 2 } };
  const r = checkRecord(buildRecord(typo, web()));
  assert.deepEqual(fields(r), ["ts.bl"]);
  const ok = checkRecord(buildRecord({ ...typo, inconsistency_reason: "The datasheet gives Bl 19.6 and Re 2." }, web()));
  assert.equal(ok.errors.length, 0);
  assert.ok(ok.warnings.some((w) => w.field === "ts.bl"));
});

test("a displacement equal to Vd is an error on physical.displacement_l", () => {
  const vd = (295 * 28.5) / 10000;
  const r = checkRecord(buildRecord({ ...EDGE, physical: { displacement_l: vd } }, web()));
  assert.deepEqual(fields(r), ["physical.displacement_l"]);
});

test("duplicates are reported on the model field", () => {
  const r = checkRecord(buildRecord(EDGE, web()), { exists: (k, b, m) => k === "driver" && b === "edge" && m === "eds15d2-e3" });
  assert.deepEqual(fields(r), ["model"]);
});

test("hints and plausibility flags are warnings, not errors", () => {
  const sibling = checkRecord(buildRecord({ ...EDGE, source_url: "https://edgecaraudio.com/products/eds15d2-e0" }, web()));
  assert.equal(sibling.errors.length, 0);
  assert.deepEqual(sibling.warnings.map((w) => w.field), ["source_url"]);
  const p2p = checkRecord(buildRecord({ ...EDGE, ts: { ...EDGE.ts, xmax_mm: 57 } }, web()));
  assert.ok(p2p.warnings.some((w) => w.field === "ts.xmax_mm"));
  const db = checkRecord(buildRecord({ ...EDGE, source_url: "https://www.loudspeakerdatabase.com/Edge/EDS15D2-E3" }, web()));
  assert.ok(db.warnings.some((w) => /another database/.test(w.message)));
});

test("a passive radiator submission", () => {
  const b = buildRecord(
    { kind: "passive-radiator", brand: "Dayton Audio", model: "DSA270-PR", size_in: 10, params: { fs: 18, mms_g: 165, sd_cm2: 330, xmax_mm: 15, max_added_mass_g: 0 }, source_url: "https://www.daytonaudio.com/x.pdf" },
    web(),
  );
  assert.equal(b.kind, "passive-radiator");
  assert.equal(b.record.type, "passive-radiator");
  assert.deepEqual(validatePassiveRadiator(b.record), []);
  assert.equal((b.record.params as Record<string, number>).max_added_mass_g, 0);
  assert.deepEqual(checkRecord(b).errors, []);
  const missing = checkRecord(buildRecord({ kind: "passive-radiator", brand: "X", model: "PR1", params: { mms_g: 50, sd_cm2: 100 }, source_url: "https://x.com/a" }, web()));
  assert.deepEqual(fields(missing), ["params", "params"]);
});

test("credit and reason cleaning", () => {
  assert.equal(cleanCredit("@theo [x](http://evil) <b>"), "theo xhttpevil b");
  assert.equal(cleanCredit("Jürgen O'Neil-Smith"), "Jürgen O'Neil-Smith");
  assert.equal(cleanCredit("a".repeat(60)).length, 40);
  assert.equal(cleanText("line1\nline2<script>", 300), "line1 line2 script");
});

test("brand or model without letters or digits", () => {
  const r = checkRecord(buildRecord({ ...EDGE, brand: "!!!", model: "" }, web()));
  assert.deepEqual(fields(r).slice(0, 2), ["brand", "model"]);
});
