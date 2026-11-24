import { test } from "node:test";
import assert from "node:assert/strict";
import { efficiency0, fitCheck, paramDistance, poolOf, rankSimilar, sensitivity1W, sizeStep, tierOf, type SimilarInput } from "../src/similar.ts";
import { C } from "../src/constants.ts";

// A 12-inch woofer.
const T: SimilarInput = { id: "a/t", brand: "A", type: "woofer", size_in: 12, sd_cm2: 500, fs: 28, qts: 0.38, qes: 0.42, vas_l: 120, xmax_mm: 10, pe_w: 400, cutout_mm: 282, depth_mm: 150, ohms: 8 };
const cand = (id: string, o: Partial<SimilarInput> = {}): SimilarInput => ({ ...T, id, brand: "B", ...o });

test("self = 0, every parameter used", () => {
  const r = paramDistance(T, T);
  assert.equal(r.distance, 0);
  assert.deepEqual(r.missing, []);
});

test("symmetric when neither is better (Qts, Fs, Vas)", () => {
  const c = cand("b/c", { qts: 0.45, fs: 24, vas_l: 150, qes: 0.42 * (0.45 / 0.38) });
  // Same Xmax / Pe; sensitivity moves with Fs, Vas, Qes, so compare a pure Qts/Fs/Vas change with qes left out.
  const a = { ...T, qes: undefined };
  const b = { ...c, qes: undefined };
  assert.ok(Math.abs(paramDistance(a, b).distance - paramDistance(b, a).distance) < 1e-12);
});

test("a log2 step in Qts alone is weighted 3 of the 10 left (no Qes, so no sensitivity)", () => {
  const c = cand("b/c", { qts: T.qts * 2, qes: undefined });
  const r = paramDistance({ ...T, qes: undefined }, c);
  assert.deepEqual(r.missing, ["sensitivity"]);
  assert.ok(Math.abs(r.distance - 3 / (3 + 2.5 + 2 + 1.5 + 1)) < 1e-12);
});

test("more Xmax / Pe than the target counts a quarter; less counts fully", () => {
  const more = paramDistance(T, cand("b/m", { xmax_mm: 20, pe_w: 800 })).distance;
  const less = paramDistance(T, cand("b/l", { xmax_mm: 5, pe_w: 200 })).distance;
  assert.ok(Math.abs(more - less / 4) < 1e-12);
  assert.ok(Math.abs(less - (1.5 + 1) / 11) < 1e-12);
});

test("sensitivity from T/S: η0 and 112.1 + 10·log10 η0; |ΔdB| / 6 in the score", () => {
  assert.ok(Math.abs(efficiency0(28, 120, 0.42) - (4 * Math.PI ** 2 * 28 ** 3 * 0.12) / (C ** 3 * 0.42)) < 1e-15);
  const s = sensitivity1W(T)!;
  assert.ok(s > 85 && s < 95, `${s}`);
  assert.equal(sensitivity1W({ fs: 28, vas_l: 120 }), null);
  // Qes × 2 → η0 / 2 → −3.01 dB; less sensitive counts fully: 3.01/6 at weight 1.
  const r = paramDistance(T, cand("b/q", { qes: T.qes! * 2 }));
  assert.ok(Math.abs(r.distance - (10 * Math.log10(2)) / 6 / 11) < 1e-12);
});

test("missing or doubtful Xmax: left out, renormalised, tier at best usable", () => {
  for (const c of [cand("b/x", { xmax_mm: undefined }), cand("b/d", { xmax_doubtful: true, xmax_mm: 40 })]) {
    const r = paramDistance(T, c);
    assert.deepEqual(r.missing, ["xmax"]);
    assert.equal(r.distance, 0);
    assert.equal(tierOf(r.distance, r.missing), "usable");
  }
  // A doubtful target Xmax counts as missing too.
  assert.deepEqual(paramDistance({ ...T, xmax_doubtful: true }, cand("b/c")).missing, ["xmax"]);
});

test("tiers: close ≤ 0.15 < usable ≤ 0.4 < risky", () => {
  assert.equal(tierOf(0), "close");
  assert.equal(tierOf(0.15), "close");
  assert.equal(tierOf(0.1500001), "usable");
  assert.equal(tierOf(0.4), "usable");
  assert.equal(tierOf(0.41), "risky");
  assert.equal(tierOf(0.5, ["xmax"]), "risky");
});

test("fit labels: cutout, depth, load (incl. dual coils)", () => {
  assert.deepEqual(fitCheck(T, cand("b/c")), { cutout: "drop-in", depth: "ok", load: "same" });
  assert.equal(fitCheck(T, cand("b/c", { cutout_mm: 285 })).cutout, "drop-in");
  assert.equal(fitCheck(T, cand("b/c", { cutout_mm: 290 })).cutout, "enlarge");
  assert.equal(fitCheck(T, cand("b/c", { cutout_mm: 270 })).cutout, "ring");
  assert.equal(fitCheck(T, cand("b/c", { cutout_mm: undefined })).cutout, "unknown");
  assert.equal(fitCheck(T, cand("b/c", { depth_mm: 155 })).depth, "ok");
  assert.equal(fitCheck(T, cand("b/c", { depth_mm: 156 })).depth, "deeper");
  assert.equal(fitCheck({ ...T, depth_mm: undefined }, cand("b/c")).depth, "unknown");
  assert.equal(fitCheck(T, cand("b/c", { ohms: 4 })).load, "differs");
  // Dual 4 Ω coils: 8 Ω in series.
  assert.equal(fitCheck(T, cand("b/c", { ohms: 2, voice_coils: 2, coil_ohms: 4 })).load, "dvc");
  // Dual 16 Ω coils: 8 Ω in parallel.
  assert.equal(fitCheck(T, cand("b/c", { ohms: 32, voice_coils: 2, coil_ohms: 16 })).load, "dvc");
  assert.equal(fitCheck(T, cand("b/c", { ohms: 2, voice_coils: 2, coil_ohms: 1 })).load, "differs");
});

test("pools: bass and mid; other is never scored nor a candidate", () => {
  assert.equal(poolOf("car-audio"), "bass");
  assert.equal(poolOf("midbass"), "bass");
  assert.equal(poolOf("full-range"), "mid");
  assert.equal(poolOf("other"), null);
  const all = [cand("b/1", { type: "other" }), cand("b/2", { type: "midrange" }), cand("b/3", { type: "subwoofer" }), cand("b/4", { type: "midbass" })];
  assert.deepEqual(rankSimilar({ ...T, type: "other" }, all), []);
  assert.deepEqual(rankSimilar(T, all, { k: 10 }).map((r) => r.id).sort(), ["b/3", "b/4"]);
});

test("never itself or a version of itself (same variant family)", () => {
  const all = [T, cand("a/t-4", { brand: "A", family: "fam", ohms: 4 }), cand("b/1")];
  const ids = rankSimilar({ ...T, family: "fam" }, all).map((r) => r.id);
  assert.deepEqual(ids, ["b/1"]);
});

test("size: exact; widened by one standard step below 5, labelled", () => {
  assert.deepEqual(sizeStep(12), [10, 15]);
  assert.deepEqual(sizeStep(9.5), [8, 10]);
  assert.deepEqual(sizeStep(13.5), [12, 15]);
  const same = [1, 2, 3, 4, 5].map((i) => cand(`b/s${i}`, { qts: 0.38 + i / 100 }));
  const others = [cand("b/10", { size_in: 10 }), cand("b/15", { size_in: 15 }), cand("b/18", { size_in: 18 })];
  const five = rankSimilar(T, [...same, ...others]);
  assert.deepEqual(five.map((r) => r.id).sort(), same.map((c) => c.id));
  assert.ok(five.every((r) => !r.differentSize));
  const four = rankSimilar(T, [...same.slice(0, 4), ...others]);
  assert.deepEqual(four.map((r) => r.id).sort(), ["b/10", "b/15", "b/s1", "b/s2", "b/s3", "b/s4"]);
  assert.deepEqual(four.filter((r) => r.differentSize).map((r) => r.id).sort(), ["b/10", "b/15"]);
  // Without a published size: Sd diameter within ±15 %.
  const noSize = rankSimilar({ ...T, size_in: undefined }, [cand("b/near", { sd_cm2: 600 }), cand("b/far", { sd_cm2: 800 })]);
  assert.deepEqual(noSize.map((r) => r.id), ["b/near"]);
});

test("sorted by distance (ties by id), k and at most 3 from the target's brand", () => {
  const own = [1, 2, 3, 4, 5].map((i) => cand(`a/o${i}`, { brand: "A", qts: 0.38 + i / 1000 }));
  const rest = Array.from({ length: 12 }, (_, i) => cand(`c/r${String(i).padStart(2, "0")}`, { brand: "C", qts: 0.4 + i / 100 }));
  const r = rankSimilar(T, [...rest, ...own]);
  assert.equal(r.length, 10);
  assert.deepEqual(r.slice(0, 3).map((x) => x.id), ["a/o1", "a/o2", "a/o3"]);
  assert.equal(r.filter((x) => x.id.startsWith("a/")).length, 3);
  for (let i = 1; i < r.length; i++) assert.ok(r[i]!.distance >= r[i - 1]!.distance);
  assert.deepEqual(rankSimilar(T, [...rest, ...own], { k: 4, maxSameBrand: 1 }).map((x) => x.id), ["a/o1", "c/r00", "c/r01", "c/r02"]);
  // Deterministic: same input order-independent.
  assert.deepEqual(rankSimilar(T, [...own, ...rest].reverse()), r);
  // Same part under another brand (rebadge) is its own row.
  const rebadge = rankSimilar(T, [cand("b/x"), cand("m/x", { brand: "M" })]);
  assert.deepEqual(rebadge.map((x) => x.id), ["b/x", "m/x"]);
  assert.ok(rebadge.every((x) => x.tier === "close"));
});
