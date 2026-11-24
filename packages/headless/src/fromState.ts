/**
 * The app's state as a SimRequest, so a share link can be read, changed and simulated again.
 * Built from the link form itself (compactState: only what differs from the app's defaults),
 * so buildState(fromState(s)) gives back the same state, driver values and all.
 */
import { compactState, type AppState } from "../../web/src/state.ts";
import type { DesignSpec, DriverSpec, SimRequest } from "./request.ts";
import { TS_KEYS } from "./request.ts";

export function fromState(s: AppState): SimRequest {
  const c = compactState(s) as Record<string, unknown>;
  const driver: DriverSpec = { name: s.driverName };
  if (s.driverOrigin) driver.id = s.driverOrigin;
  for (const k of TS_KEYS) {
    const v = s.ts[k];
    if (typeof v === "number") (driver as Record<string, unknown>)[k] = v;
  }
  for (const k of ["nominal_ohms", "le_mh", "l2_mh", "r2_ohm", "xmax_mm", "pe_w", "rth_k_w", "tmax_C"] as const) driver[k] = s[k];
  if (s.semi) driver.semi = s.semi;
  if (s.fdd) driver.fdd = s.fdd;
  if (s.dvc.on) driver.dvc = s.dvc;

  const designs = ((c.designs as Record<string, unknown>[]) ?? []).map((d, i): DesignSpec => {
    const { id: _id, on: _on, ...rest } = d;
    return { ...rest, kind: s.designs[i]!.kind } as DesignSpec;
  });
  const req: SimRequest = {
    driver,
    count: s.drivers,
    wiring: s.wiring,
    isobaric: s.isobaric,
    ...(s.isobaric ? { isoCoils: s.isoCoils } : {}),
    drive: s.drive === "volts" ? { volts: s.volts } : { watts: s.power },
    designs,
  };
  for (const k of ["settings", "highPass", "roomGain", "baffle", "passive", "volume", "eq", "measured", "compare"] as const) {
    if (c[k] !== undefined) (req as unknown as Record<string, unknown>)[k] = c[k];
  }
  return req;
}
