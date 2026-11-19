import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRecord, checkRecord } from "../../db-tools/src/submission.ts";
import { DEFAULT_STATE, type AppState } from "../src/state.ts";
import { dbLookup, prSubmitFields, sendSubmission, submitFields } from "../src/submitForm.ts";

const web = { kind: "web" as const, today: "2026-11-18" };

const edge: AppState = {
  ...DEFAULT_STATE,
  driverName: "Edge EDS15D2-E3",
  driverBrand: "Edge",
  nominal_ohms: 4,
  dvc: { on: true, entered: "series", wired: "series" },
  ts: { fs: 36, qms: 4.122, qes: 0.612, vas_l: 8.187, re: 3.6, bl: 19.6, mms_g: 283, sd_cm2: 295 },
  le_mh: 2.4,
  xmax_mm: 28.5,
  pe_w: 1850,
};

test("the form starts from the driver card's entered values; DVC impedance per coil", () => {
  const f = submitFields(edge);
  assert.equal(f.brand, "Edge");
  assert.equal(f.model, "EDS15D2-E3");
  assert.equal(f.voice_coils, 2);
  assert.equal(f.ts_wiring, "series");
  assert.equal(f.nominal_ohms, 2, "4 Ω wired in series = 2 Ω per coil");
  assert.equal(f.ts?.xmax_mm, 28.5);
  assert.equal(f.ts?.qts, undefined, "never a calculated value");
  const r = buildRecord({ ...f, source_url: "https://edgecaraudio.com/eds15d2-e3" }, web);
  assert.equal(r.record.nominal_ohms, 4);
  assert.deepEqual(checkRecord(r).errors, []);
});

test("a single-coil driver keeps its impedance; Le/Xmax/Pe of 0 are left out", () => {
  const f = submitFields({ ...edge, dvc: { on: false, entered: "parallel", wired: "parallel" }, le_mh: 0, xmax_mm: 0, pe_w: 0 });
  assert.equal(f.voice_coils, 1);
  assert.equal(f.nominal_ohms, 4);
  assert.equal(f.ts?.le_mh, undefined);
  assert.equal(f.ts?.xmax_mm, undefined);
});

test("brand spellings and duplicates come from the database index", () => {
  const db = {
    drivers: [{ id: "dayton-audio/rss265hf-4", brand: "Dayton Audio", model: "RSS265HF-4", type: "woofer", ohms: 4 }],
    passiveRadiators: [{ id: "dayton-audio/dsa270-pr", brand: "Dayton Audio", model: "DSA270-PR" }],
  };
  const { brands, exists } = dbLookup(db);
  assert.equal(brands.get("dayton-audio"), "Dayton Audio");
  assert.ok(exists("driver", "dayton-audio", "rss265hf-4"));
  assert.ok(exists("passive-radiator", "dayton-audio", "dsa270-pr"));
  assert.ok(!exists("driver", "dayton-audio", "dsa270-pr"));
  assert.equal(dbLookup(null).brands.size, 0);
});

test("a passive radiator: brand split off its name, Xmech kept apart", () => {
  const brands = new Map([["dayton-audio", "Dayton Audio"], ["dayton", "Dayton"]]);
  const f = prSubmitFields("Dayton Audio DSA270-PR", { mms_g: 165, sd_cm2: 330, xmax_mm: 15, qms: 5, vas_l: 60 }, brands);
  assert.equal(f.brand, "Dayton Audio", "the longest matching brand");
  assert.equal(f.model, "DSA270-PR");
  assert.equal(f.params?.xmax_mm, 15);
  const m = prSubmitFields("Unknown PR10", { mms_g: 80, sd_cm2: 200, xmax_mm: 9, qms: 5, vas_l: 30, xmech: true }, brands);
  assert.equal(m.brand, "");
  assert.equal(m.model, "Unknown PR10");
  assert.equal(m.params?.xmech_mm, 9);
  assert.equal(m.params?.xmax_mm, undefined);
});

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("sending: the payload, and every answer as one sentence", async () => {
  let sent: Record<string, unknown> = {};
  let url = "";
  const capture = (async (u: string, init: RequestInit) => {
    url = u;
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ ok: true, pr_url: "https://github.com/o/r/pull/9", pr_number: 9 }), { status: 201 });
  }) as unknown as typeof fetch;
  const f = submitFields(edge);
  assert.deepEqual(await sendSubmission("https://submit.example/", f, "Theo", "tok", capture), { ok: true, prUrl: "https://github.com/o/r/pull/9", prNumber: 9 });
  assert.equal(url, "https://submit.example/v1/submit");
  assert.equal(sent.consent, true);
  assert.equal(sent.turnstile, "tok");
  assert.equal(sent.credit, "Theo");
  assert.equal(sent.website, "");
  assert.equal(sent.kind, "driver");

  assert.deepEqual(await sendSubmission("x", f, "", "t", reply(200, { ok: true, dry_run: true, path: "drivers/edge/eds15d2-e3.json" })), { ok: true, prUrl: "", prNumber: 0, dryRun: true });
  assert.deepEqual(await sendSubmission("x", f, "", "t", reply(409, {})), { ok: false, message: "This driver is already waiting for review." });
  assert.deepEqual(await sendSubmission("x", f, "", "t", reply(503, { errors: [{ field: "", message: "The review queue is full right now." }] })), { ok: false, message: "The review queue is full right now." });
  assert.deepEqual(await sendSubmission("x", f, "", "t", reply(500, "not json")), { ok: false, message: "The submission wasn't accepted (500)." });
  const down = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  assert.deepEqual(await sendSubmission("x", f, "", "t", down), { ok: false, message: "Couldn't reach the submission service." });
});
