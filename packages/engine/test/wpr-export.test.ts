import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseWpr, writeWpr, type WprExport } from "../src/wdr.ts";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

/** The export for a project WinISD saved, built from what parseWpr read out of it. */
function fromWinisd(file: string): { exported: WprExport; read: ReturnType<typeof parseWpr> } {
  const r = parseWpr(fixture(file));
  const d = r.driver;
  const base = {
    driver: { brand: d.brand ?? "", model: d.model ?? "", ts: d.ts, le_mh: d.le_mh, xmax_mm: d.xmax_mm, pe_w: d.pe_w, nominal_ohms: d.nominal_ohms, displacement_l: d.displacement_l, comment: d.comment },
    losses: { ql: r.box.ql, qa: r.box.qa, qp: r.box.qp },
    rg: r.rg,
    drivers: r.drivers,
    isobaric: r.isobaric,
    power: r.power,
    simulateLe: r.simulateLe,
    air: { ...r.air!, temp_C: 20, pressure_hPa: 1013.25, humidity_pct: 30 },
    highPass: r.highPass ? { order: r.highPass.order, freq: r.highPass.freq } : undefined,
  };
  let box: WprExport["box"];
  if (r.box.type === "vented") box = { type: "vented", vb_l: r.box.vb_l, port: { ...r.port!, fb: r.box.fb! } };
  else if (r.box.type === "passive-radiator") box = { type: "passive-radiator", vb_l: r.box.vb_l, fb: r.box.fb!, count: r.pr!.count, addedMass_g: r.pr!.addedMass_g, pr: r.pr!.params };
  else if (r.box.type === "bandpass") {
    const b = r.bandpass!;
    box = {
      type: "bandpass",
      order: b.order,
      rear: { vb_l: b.rear.vb_l, port: b.rear.port ? { ...b.rear.port, fb: b.rear.fb ?? 0 } : undefined },
      front: { vb_l: b.front.vb_l, port: { ...b.front.port, fb: b.front.fb }, losses: { ql: b.front.ql, qa: b.front.qa, qp: b.front.qp } },
      qicl: b.qicl,
    };
  } else box = { type: "sealed", vb_l: r.box.vb_l };
  return { exported: { ...base, box }, read: r };
}

for (const f of ["dsa215.wpr", "dsa215-closed.wpr", "dsa215-dsa270pr-50l.wpr", "dsa215-bp4.wpr", "dsa215-bp6.wpr", "dsa215-hpf.wpr", "dsa215-iso-ported.wpr"]) {
  test(`a WinISD project written back reads the same: ${f}`, () => {
    const { exported, read } = fromWinisd(f);
    const again = parseWpr(writeWpr(exported));
    const close = (a: unknown, b: unknown, path: string): void => {
      if (typeof a === "number" && typeof b === "number") assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${path}: ${a} vs ${b}`);
      else if (a && b && typeof a === "object") for (const k of Object.keys(b as object)) close((a as never)[k], (b as never)[k], `${path}.${k}`);
      else assert.deepEqual(a, b, path);
    };
    const { raw: _r1, ...d1 } = again.driver;
    const { raw: _r2, ...d2 } = read.driver;
    close(d1, d2, "driver");
    for (const k of ["box", "port", "pr", "bandpass", "rg", "drivers", "isobaric", "power", "simulateLe", "air", "highPass", "unsupportedFilters"] as const) close(again[k], read[k], k);
  });
}

test("the written file has every section WinISD writes, in its order", () => {
  const text = writeWpr(fromWinisd("dsa215.wpr").exported);
  const sections = [...text.matchAll(/^\[(\w+)\]/gm)].map((m) => m[1]);
  assert.deepEqual(sections, ["ProjectInfo", "Driver", "Box", "VentFront", "VentRear", "VentIntra", "PlotSettings", "SignalSource", "Filters", "SimulatorOptions"]);
  assert.match(text, /\r\n/);
});
