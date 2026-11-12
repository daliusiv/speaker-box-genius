import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWedgePanels, cutList, grossVolume, pyNum, wedgeCutList } from "@sbg/engine";
import { DEFAULT_STATE } from "../src/state.ts";
import { freecadFor, macroFileName } from "../src/freecadExport.ts";
import { shapeOf, wedgeDimsOf } from "../src/sim.ts";

const vol = DEFAULT_STATE.volume;

test("FreeCAD export: every calculator shape, named after the design", () => {
  for (const shape of ["box", "wedge", "cylinder", "sphere", "frustum"] as const) {
    const v = { ...vol, shape };
    const m = freecadFor(v, null, "Sub: 12\" / ported");
    assert.notEqual(typeof m, "string", shape);
    const { text, fileName } = m as { text: string; fileName: string };
    assert.equal(fileName, "Sub 12 ported.FCMacro");
    assert.ok(text.includes('NAME = "Sub: 12\\" / ported"'), shape);
    // The app's inside volume (before deductions) is what the macro checks the cavity against.
    const inner = grossVolume(shapeOf(v), v.wall_mm) * 1e6;
    const lit = /EXPECTED_INNER = ([\d.]+)/.exec(text)![1]!;
    assert.ok(Math.abs(Number(lit) / inner - 1) < 1e-9, `${shape}: ${lit} vs ${inner}`);
  }
  assert.equal(macroFileName("  "), "speaker-box.FCMacro");
});

test("FreeCAD export: the cut list's baffle holes are cut, the rest named", () => {
  const v = { ...vol, shape: "wedge" as const, slope: "rear" as const, joinery: "miter" as const };
  const cut = wedgeCutList({ ...wedgeDimsOf(v), slope: v.slope, joinery: v.joinery, drivers: { count: 1, cutout: 230 }, ports: { count: 1, length: 200, slot: { width: 50, height: 200 } } });
  const m = freecadFor(v, cut, "W") as { text: string };
  assert.equal(m.text.split("Part.makeCylinder(").length - 1, 1);
  assert.match(m.text, /# 1 x slot port opening \(rectangular\): not cut in the model\./);
  assert.ok(m.text.includes(`EXPECTED_OUTER = ${pyNum(buildWedgePanels({ ...wedgeDimsOf(v), slope: "rear" }).outerVolume)}`));
  const box = { ...vol, shape: "box" as const };
  const c = cutList({ width: box.width_cm * 10, height: box.height_cm * 10, depth: box.depth_cm * 10, wall: box.wall_mm, drivers: { count: 2, cutout: 100 } });
  assert.equal((freecadFor(box, c, "B") as { text: string }).text.split("Part.makeCylinder(").length - 1, 2);
});

test("FreeCAD export: a shape with no inside gives a message", () => {
  assert.equal(typeof freecadFor({ ...vol, shape: "sphere", diameter_cm: 2, wall_mm: 18 }, null, "x"), "string");
  assert.match(freecadFor({ ...vol, shape: "box", width_cm: 3 }, null, "x") as string, /^Can't model this shape/);
});
