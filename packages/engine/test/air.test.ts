import { test } from "node:test";
import assert from "node:assert/strict";
import { airAt, SEA_LEVEL_HPA, STANDARD_AIR } from "../src/constants.ts";

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("20 °C, dry, sea level is the standard air", () => {
  const a = airAt({ temp_C: 20, humidity_pct: 0, pressure_hPa: SEA_LEVEL_HPA });
  near(a.rho, STANDARD_AIR.rho, 0.001, "density");
  near(a.c, STANDARD_AIR.c, 0.1, "speed of sound");
});

test("textbook values: 0 °C dry 1.292 kg/m³ and 331.3 m/s; 30 °C dry 1.164 kg/m³ and 349.0 m/s", () => {
  const cold = airAt({ temp_C: 0, humidity_pct: 0, pressure_hPa: SEA_LEVEL_HPA });
  near(cold.rho, 1.2922, 0.001, "0 °C density");
  near(cold.c, 331.3, 0.2, "0 °C speed");
  const warm = airAt({ temp_C: 30, humidity_pct: 0, pressure_hPa: SEA_LEVEL_HPA });
  near(warm.rho, 1.1644, 0.001, "30 °C density");
  near(warm.c, 349.0, 0.3, "30 °C speed");
});

test("humidity: lighter air and slightly faster sound; altitude: thinner air, same speed", () => {
  const dry = airAt({ temp_C: 25, humidity_pct: 0, pressure_hPa: SEA_LEVEL_HPA });
  const humid = airAt({ temp_C: 25, humidity_pct: 100, pressure_hPa: SEA_LEVEL_HPA });
  assert.ok(humid.rho < dry.rho && dry.rho - humid.rho < 0.02, `${humid.rho} vs ${dry.rho}`);
  assert.ok(humid.c > dry.c && humid.c - dry.c < 2, `${humid.c} vs ${dry.c}`);
  // About 1,500 m up: roughly 850 hPa.
  const high = airAt({ temp_C: 25, humidity_pct: 0, pressure_hPa: 850 });
  near(high.rho / dry.rho, 850 / SEA_LEVEL_HPA, 1e-9, "density scales with pressure");
  near(high.c, dry.c, 1e-9, "speed of sound doesn't depend on pressure");
});
