import { buildNetlist, type SpiceCase } from "@sbg/engine/spice";
import type { EqStage } from "@sbg/engine";
import { airOf, driverInputOf, enclosureOf, enclosureOptsOf, lossesFor, simOptionsOf, solveDriver, vbOf, ventDistanceOf } from "./sim.ts";
import type { AppState, DesignState } from "./state.ts";

/** Lines and horns aren't lumped boxes: Hornresp opens those. */
export const spiceExportable = (d: DesignState): boolean => d.kind !== "line";

/** The sweep written into the netlist's .ac line. */
export const SPICE_SWEEP = { perDecade: 100, fMin: 10, fMax: 1000 } as const;

/**
 * One design as an LTspice netlist: the same circuit the validation tests check the app against
 * (docs/validation.md, "Independent circuit check"), built from the numbers this design is
 * simulated with, and a header that says what to plot. Settings the circuit doesn't model are
 * left out and named in `notes` (and in the header).
 */
export function spiceFor(s: AppState, d: DesignState, shareUrl: string, date = new Date()): { text: string; notes: string[] } | string {
  const solved = solveDriver(s);
  if (solved.missing.length > 0) return "Enter enough driver parameters to simulate first.";
  if (!spiceExportable(d)) return "SPICE netlists cover boxes (sealed, ported, passive radiator and bandpass), not transmission lines or horns: open those in Hornresp.";
  const notes: string[] = [];
  const { semi, fdd, xmax_mm: _x, pe_w: _p, ...driver } = driverInputOf(s, solved);
  if (semi) notes.push("the semi-inductance voice-coil model (the coil is written with its plain Le)");
  if (fdd) notes.push("frequency-dependent damping");
  const o = simOptionsOf(s, true);
  if (o.coneLoad === "piston") notes.push("the cone's piston air load (Settings → Cone air load; the datasheet's moving mass is used)");
  if (o.portModel === "pipe") notes.push("ports as pipes (Settings → Ports; written as lumped masses)");
  if (o.portCompression) notes.push("port compression");
  if (o.leakage === "absorbed") notes.push("leakage that's absorbed (the leak's air is heard, as in WinISD)");
  if (ventDistanceOf(d, s.volume) > 0 && s.settings.lineSpl === "power")
    notes.push("the port's position from radiated power (Settings → SPL; the netlist delays the port's sound on axis instead)");
  if (s.baffle.on) notes.push("the baffle step");
  if (s.roomGain.mode !== "off") notes.push(s.roomGain.mode === "car" ? "cabin gain" : "room gain");
  const eq = s.eq
    .filter((e) => e.on && (e.target === "all" || e.target === d.id))
    .map(({ id: _id, on: _on, target: _t, ...stage }) => stage as EqStage);
  const vb = vbOf(s, d);
  const dist = ventDistanceOf(d, s.volume);
  const air = airOf(s);
  const c: SpiceCase = {
    id: "export",
    title: d.name,
    driver,
    box: enclosureOf(d, vb, lossesFor(s, d), s.volume.wall_mm, s.volume, enclosureOptsOf(s)) as SpiceCase["box"],
    opts: {
      power: o.power,
      ...(o.convention ? { convention: o.convention } : {}),
      rg: o.rg,
      ...(o.coilTemp_C ? { coilTemp_C: o.coilTemp_C } : {}),
      ...(o.driveModel ? { driveModel: o.driveModel } : {}),
      endCorrection: o.endCorrection,
      drivers: o.drivers,
      wiring: o.wiring,
      isobaric: o.isobaric,
      highPass: o.highPass,
      eq,
      passive: o.passive,
    },
    air: { rho: air.rho, c: air.c },
    sweep: SPICE_SWEEP,
  };
  let net;
  try {
    net = buildNetlist(c, { dialect: "ltspice" });
  } catch (e) {
    return `This design can't be written as a netlist: ${(e as Error).message.replace(/^SPICE builder: /, "")}.`;
  }
  const p = net.probes;
  const volts = /^V1 \S+ 0 AC (\S+)/m.exec(net.text)?.[1];
  const chain = c.opts.highPass || eq.length > 0;
  const driverName = s.driverName.trim() || "custom driver";
  const count = s.drivers > 1 ? `${s.drivers} × ` : "";
  const header = [
    `Speaker Box Genius: ${d.name}, ${count}${driverName}${s.isobaric ? " (isobaric pairs)" : ""}`,
    `Exported ${date.toISOString().slice(0, 10)} from speakerboxgenius.com. Open the design: ${shareUrl}`,
    "For LTspice: File > Open this file, then Run. The .ac line at the end sets the sweep.",
    "",
    "Units: SI. Electrical side in volts, amps and ohms. Past the motor (a gyrator of Bl/Sd) the",
    "acoustic side: pressure in pascals as volts, volume velocity in m^3/s as amps.",
    `Drive: V1, ${volts ?? "?"} V RMS${chain ? ", ahead of the filters and EQ (the E sources)" : " at the amplifier"}.`,
    "",
    "What to plot (RMS values; x 1.414 for peak):",
    `  SPL at 1 m:      V(${p.pressure}), sound pressure in Pa. LTspice shows it in dB re 1 V: add 93.98 for dB SPL.`,
    ...(dist > 0
      ? [`  Port position:   the ${d.kind === "bandpass" ? "rear chamber's opening" : d.kind === "pr" ? "PRs" : "port"} ${dist} cm away: V(prc) without it, V(pvd) its sound delayed ${((dist / 100 / air.c) * 1000).toFixed(3)} ms by the line Tpos.`]
      : []),
    `  Impedance:       V(${p.terminals})/I(${p.coilSense}), what the amplifier sees past the amp + cable resistance.`,
    `  Cone excursion:  V(${p.excursion}), in metres (x 1414 for mm peak).`,
    ...(p.portSpeed ? [`  Port air speed:  V(${p.portSpeed}), m/s${p.rearPortSpeed ? " (the front chamber's port)" : ""}.`] : []),
    ...(p.rearPortSpeed ? [`  Rear port speed: V(${p.rearPortSpeed}), m/s.`] : []),
    ...(p.boxPressure ? [`  Box pressure:    V(${p.boxPressure}), Pa${p.frontPressure ? " (the rear chamber)" : ""}.`] : []),
    ...(p.frontPressure ? [`  Front chamber:   V(${p.frontPressure}), Pa.`] : []),
    ...p.prExcursion.map((n, k) => `  PR excursion${p.prExcursion.length > 1 ? ` (group ${k + 1})` : ""}: V(${n}), metres, one radiator.`),
    "",
    ...(notes.length > 0 ? [`Not in this netlist (the app's curves include them): ${notes.join("; ")}.`, ""] : []),
    "Scope: the lumped Thiele/Small model the app uses for boxes, with its box losses. The app is",
    "tested against this circuit on every change: speakerboxgenius.com/validation/#spice",
    "",
  ];
  return { text: buildNetlist(c, { dialect: "ltspice", header }).text, notes };
}
