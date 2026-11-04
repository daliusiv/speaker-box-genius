import { test } from "node:test";
import assert from "node:assert/strict";
import { braceVolume, cutList, layoutSheets, piecesOf } from "../src/cutlist.ts";
import { grossVolume } from "../src/volume.ts";

const BOX = { width: 400, height: 500, depth: 450, wall: 18 };

test("panels rebuild the outside size and the inside volume exactly", () => {
  const c = cutList(BOX);
  const byName = Object.fromEntries(c.panels.map((p) => [p.name, p]));
  assert.deepEqual([byName["Front (baffle)"]!.a, byName["Front (baffle)"]!.b], [500, 400]);
  assert.deepEqual([byName["Top and bottom"]!.a, byName["Top and bottom"]!.b], [414, 400]);
  assert.deepEqual([byName["Sides"]!.a, byName["Sides"]!.b], [464, 414]);
  assert.deepEqual(c.inside, { width: 364, height: 464, depth: 414 });
  // Inside volume from the cut list equals the calculator's gross volume.
  const litres = (c.inside.width * c.inside.height * c.inside.depth) / 1e6;
  assert.ok(Math.abs(litres - grossVolume({ kind: "box", width_cm: 40, height_cm: 50, depth_cm: 45 }, 18)) < 1e-9);
  // Wood: 2 × (W·H) + 2 × (W·Di) + 2 × (Hi·Di)
  assert.ok(Math.abs(c.area_m2 - (2 * 0.4 * 0.5 + 2 * 0.4 * 0.414 + 2 * 0.464 * 0.414 + c.braces.reduce((s, b) => s + (b.qty * b.a * b.b) / 1e6, 0))) < 1e-9);
});

test("a driver that fits stays quiet; one that doesn't is flagged", () => {
  assert.deepEqual(cutList({ ...BOX, drivers: { count: 1, cutout: 282 } }).warnings, []);
  const w = cutList({ ...BOX, drivers: { count: 1, cutout: 380 } }).warnings;
  assert.ok(w.some((x) => /wider than the baffle/.test(x)));
});

test("PRs that don't fit on the baffle move to the back", () => {
  const c = cutList({ ...BOX, drivers: { count: 1, cutout: 282 }, prs: { count: 2, cutout: 282 } });
  const pr = c.holes.find((h) => h.name.startsWith("Passive"))!;
  assert.equal(pr.where, "Back or sides");
  const one = cutList({ ...BOX, height: 800, drivers: { count: 1, cutout: 230 }, prs: { count: 1, cutout: 230 } });
  assert.equal(one.holes.find((h) => h.name.startsWith("Passive"))!.where, "Front");
});

test("a port longer than the box is deep is flagged", () => {
  assert.ok(cutList({ ...BOX, ports: { count: 1, length: 500, holeDiameter: 106 } }).warnings.some((x) => /port/.test(x)));
  assert.deepEqual(cutList({ ...BOX, ports: { count: 1, length: 250, holeDiameter: 106 } }).warnings, []);
});

test("braces: none for a small box, one across a long one; their volume is the frame only", () => {
  assert.equal(cutList({ width: 300, height: 300, depth: 300, wall: 18 }).braces.length, 0);
  const c = cutList({ width: 400, height: 900, depth: 450, wall: 18 });
  assert.equal(c.braces.length, 1);
  assert.equal(c.braces[0]!.qty, 2); // 864 mm inside over a 360 mm limit
  assert.deepEqual([c.braces[0]!.a, c.braces[0]!.b], [414, 364]);
  const v = braceVolume(c.braces, 18);
  const frame = c.braces[0]!.frame;
  assert.ok(Math.abs(v - (2 * (414 * 364 - (414 - 2 * frame) * (364 - 2 * frame)) * 18) / 1e6) < 1e-9);
});

test("sheet layout: every piece placed once, inside the sheet, without overlaps", () => {
  const c = cutList({ width: 400, height: 900, depth: 450, wall: 18 });
  const pieces = piecesOf(c);
  const l = layoutSheets(pieces, 2440, 1220, 3);
  assert.equal(l.tooBig.length, 0);
  assert.equal(l.sheets.flat().length, pieces.length);
  for (const s of l.sheets) {
    for (const p of s) assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= 2440 && p.y + p.h <= 1220, p.name);
    for (let i = 0; i < s.length; i++)
      for (let j = i + 1; j < s.length; j++) {
        const a = s[i]!, b = s[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!overlap, `${a.name} overlaps ${b.name}`);
      }
  }
  assert.equal(l.sheets.length, 1);
  assert.deepEqual(layoutSheets([{ name: "huge", a: 3000, b: 100 }], 2440, 1220, 3).tooBig, ["huge"]);
});
