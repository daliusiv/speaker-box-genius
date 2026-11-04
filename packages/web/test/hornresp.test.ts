import { test } from "node:test";
import assert from "node:assert/strict";
import { fromHornresp, mechanicalFromTs, toHornresp, tsFromMechanical } from "../src/hornresp.ts";
import { DEFAULT_STATE, newDesign, type LineDesign } from "../src/state.ts";
import { driverInputOf, lineLength, solveDriver } from "../src/sim.ts";

const s = DEFAULT_STATE;
const driver = driverInputOf(s, solveDriver(s));
const base = newDesign("line", s.designs) as LineDesign;
const close = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test("driver: T/S → Hornresp's mechanical parameters → T/S", () => {
  const back = tsFromMechanical(mechanicalFromTs(driver));
  for (const k of ["fs", "qms", "qes", "vas_l", "re", "sd_cm2"] as const) assert.ok(close(back[k]!, driver[k], 0.001), `${k}: ${back[k]} vs ${driver[k]}`);
});

function roundTrip(d: LineDesign) {
  const out = toHornresp(d, driver, { eg: 2.83, drivers: 1, name: d.name });
  assert.ok(typeof out !== "string", out as string);
  const back = fromHornresp(out.text, base);
  assert.ok(typeof back !== "string", back as string);
  return { out, back };
}

test("offset-driver line: exported and read back", () => {
  const d: LineDesign = {
    ...base,
    closedArea_cm2: 300,
    driverAt_cm: 40,
    sections: [
      { length_cm: 100, endArea_cm2: 220, taper: "linear", fill_kgm3: 8 },
      { length_cm: 80, endArea_cm2: 150, taper: "conical", fill_kgm3: 0 },
    ],
  };
  const { out, back } = roundTrip(d);
  assert.match(out.text, /^ID = /);
  assert.match(out.text, /OD = 1/);
  assert.match(out.text, /\|HORN PARAMETER VALUES:/);
  assert.equal(back.design.end, "open");
  assert.equal(back.design.driverAt_cm, 40);
  assert.ok(close(back.design.closedArea_cm2!, 300));
  // The driver splits section 1: three sections, same total length and mouth.
  assert.equal(back.design.sections!.length, 3);
  assert.ok(close(lineLength({ ...base, ...back.design } as LineDesign), 180));
  assert.ok(close(back.design.sections!.at(-1)!.endArea_cm2, 150));
  assert.equal(back.design.sections![2]!.taper, "conical");
  assert.ok(close(back.design.sections![0]!.fill_kgm3, 8, 0.02), `${back.design.sections![0]!.fill_kgm3}`);
  assert.ok(back.driver && close(back.driver.ts.fs!, driver.fs, 0.01));
});

test("TL with the driver at the closed end: Hornresp's 0.01 cm first segment", () => {
  const { out, back } = roundTrip({ ...base, driverAt_cm: 0 });
  assert.match(out.text, /Par = 0\.01/);
  assert.equal(back.design.driverAt_cm, 0);
  assert.equal(back.design.sections!.length, 2);
  assert.ok(close(back.design.closedArea_cm2!, base.closedArea_cm2));
});

test("MLTL: the port is a step and a narrow segment, read back as a port", () => {
  const d: LineDesign = {
    ...base,
    end: "port",
    closedArea_cm2: 200,
    driverAt_cm: 30,
    sections: [
      { length_cm: 30, endArea_cm2: 200, taper: "linear", fill_kgm3: 8 },
      { length_cm: 90, endArea_cm2: 200, taper: "linear", fill_kgm3: 0 },
    ],
    portDiameter_cm: 6,
    portLength_cm: 12,
    portFlare_cm: 0,
  };
  const { back } = roundTrip(d);
  assert.equal(back.design.end, "port");
  assert.ok(close(back.design.portDiameter_cm!, 6, 0.02));
  assert.ok(close(back.design.portLength_cm!, 12, 0.02));
  assert.equal(back.design.sections!.length, 2);
});

test("tapped horn and front-loaded horn", () => {
  const th = roundTrip({ ...base, end: "tapped", driverAt_cm: 0, tapAt_cm: 90 });
  assert.match(th.out.text, /TH = 1/);
  assert.equal(th.back.design.end, "tapped");
  assert.equal(th.back.design.driverAt_cm, 0);
  assert.ok(close(th.back.design.tapAt_cm!, 90));
  const horn = roundTrip({
    ...base,
    end: "horn",
    closedArea_cm2: 150,
    sections: [{ length_cm: 250, endArea_cm2: 6000, taper: "exponential", fill_kgm3: 0 }],
    rearChamber_l: 30,
    throatChamber_l: 3,
  });
  assert.match(horn.out.text, /Nd = 1/);
  assert.match(horn.out.text, /Exp = 250\.00/);
  assert.equal(horn.back.design.end, "horn");
  assert.equal(horn.back.design.rearChamber_l, 30);
  assert.equal(horn.back.design.throatChamber_l, 3);
  assert.equal(horn.back.design.sections![0]!.taper, "exponential");
});

test("too many segments for Hornresp: says so", () => {
  const d: LineDesign = {
    ...base,
    driverAt_cm: 25,
    sections: [
      { length_cm: 50, endArea_cm2: 200, taper: "linear", fill_kgm3: 8 },
      { length_cm: 50, endArea_cm2: 180, taper: "linear", fill_kgm3: 4 },
      { length_cm: 50, endArea_cm2: 160, taper: "linear", fill_kgm3: 0 },
      { length_cm: 50, endArea_cm2: 140, taper: "linear", fill_kgm3: 0 },
    ],
  };
  const out = toHornresp(d, driver, { eg: 2.83, drivers: 1, name: "x" });
  assert.equal(typeof out, "string");
  assert.match(out as string, /at most 4 segments/);
});

test("a record pasted on one line from a forum post (comma decimals)", () => {
  const forum =
    "Record imported: ID=BOXPLAN Ang=2.0 x Pi Eg=15 Rg=0,1 Fta=0 S1=626,9 S2=526,9 Par=44,9 F12=0 S2=526,9 S3=460,7 Par=29,9 F23=0 S3=460,7 S4=352 Par=49,1 F34=0 S4=352 S5=352 Par=32,3 F45=0 Sd=550 Bl=25,15 Cms=0,000151 Rms=4,96 Mmd=59,68 Le=0,75 Re=5,1 OD=1 Vrc=0 Lrc=0 Ap1=0 Lp=0 Vtc=0 Atc=0 Pmax=700 Xmax=7,5";
  const r = fromHornresp(forum, base);
  assert.ok(typeof r !== "string", r as string);
  assert.equal(r.design.driverAt_cm, 44.9);
  assert.equal(r.design.closedArea_cm2, 626.9);
  // Its uniform 352 cm² tail stays a section (no step down to it): the same simulation.
  assert.equal(r.design.end, "open");
  assert.equal(r.design.sections!.length, 4);
  assert.ok(close(r.design.sections!.at(-1)!.length_cm, 32.3));
  assert.ok(r.driver);
  assert.ok(r.driver.ts.fs! > 20 && r.driver.ts.fs! < 60, `fs ${r.driver.ts.fs}`);
  assert.equal(r.driver.xmax_mm, 7.5);
});

test("the INI-style form: L12 = 40.90, PAR", () => {
  const rec = "[Alignment]\nType=OD\nS1=210.00\nS2=210.00\nL12=40.90, PAR\nS3=150.00\nL23=120.00, CON\nSd=130 ; cone\n";
  const r = fromHornresp(rec, base);
  assert.ok(typeof r !== "string", r as string);
  assert.equal(r.design.end, "open");
  assert.equal(r.design.driverAt_cm, 40.9);
  assert.equal(r.design.sections!.length, 2);
  assert.equal(r.design.sections![1]!.taper, "conical");
});
