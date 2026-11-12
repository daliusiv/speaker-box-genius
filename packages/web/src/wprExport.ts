import { passiveRadiatorModel, portLengthForFb, prFb, ventedFb, writeWpr, type WprExport, type WprPortOut } from "@sbg/engine";
import { airOf, builtVbOf, colorOf, dvcFactors, endCorrectionOf, lossesFor, solveDriver, switchDrive } from "./sim.ts";
import type { AppState, DesignState, PortFields } from "./state.ts";
import { stuffFactor } from "./stuffing.ts";

/**
 * Which designs WinISD can open: sealed, ported and PR boxes, and bandpass boxes with ports.
 * WinISD's only 6th-order bandpass has both chambers ported to the room: it opens a series one
 * (rear chamber ported into the front) as that, so those aren't written.
 */
export function wprExportable(d: DesignState): boolean {
  if (d.kind === "sealed" || d.kind === "vented" || d.kind === "pr") return true;
  if (d.kind === "bandpass") return d.frontOpening === "port" && (d.order === "4" || (d.order === "6p" && d.rearOpening === "port"));
  return false;
}

/**
 * One design as a WinISD project (.wpr), with the driver and the settings that change its
 * results, and plain-words notes on what WinISD can't hold (filters other than a Butterworth
 * high-pass, EQ, passive parts, baffle step, room gain, flared ports, series wiring).
 * The volume written is the one simulated (stuffing's extra volume included), so WinISD shows
 * the same response.
 */
export function wprFor(s: AppState, d: DesignState): { text: string; notes: string[] } | string {
  const solved = solveDriver(s);
  if (solved.missing.length > 0) return "Enter enough driver parameters to simulate first.";
  if (!wprExportable(d))
    return `WinISD can't open a ${d.kind === "line" ? "transmission line" : d.kind === "bandpass" && d.order === "6s" && d.frontOpening === "port" && d.rearOpening === "port" ? "6th-order bandpass box with the rear chamber ported into the front (it only has the kind ported to the room)" : "bandpass box with passive radiators"}.`;
  const notes: string[] = [];
  const air = airOf(s);
  const t = solved.values;
  // WinISD keeps a dual-coil driver with its coils already wired: write the wired values.
  const k = dvcFactors(s);
  const name = s.driverName.trim();
  const brand = s.driverBrand && name.startsWith(s.driverBrand) ? s.driverBrand : "";
  const vb = builtVbOf(s, d) * (d.kind === "line" ? 1 : stuffFactor(d));
  if (d.kind !== "line" && stuffFactor(d) !== 1) notes.push("stuffing is written as the extra volume it acts as (WinISD has no stuffing)");
  const ec = endCorrectionOf(s);
  const portOut = (p: PortFields & { flare_cm?: number }, v: number): WprPortOut => {
    if (p.shape === "slot") {
      // WinISD's rectangular vent (it tunes it as a round vent of the same area, as the app does).
      const slot = { width_cm: p.slotWidth_cm, height_cm: p.slotHeight_cm };
      const port = { shape: "slot" as const, ...slot, length_cm: p.length_cm };
      const diameter_cm = 2 * Math.sqrt((slot.width_cm * slot.height_cm) / Math.PI);
      return { count: p.count, diameter_cm, slot, length_cm: p.length_cm, endCorrection: ec, fb: ventedFb(v, port, p.count, ec, air) };
    }
    const diameter_cm = p.diameter_cm;
    const port = { shape: "round" as const, diameter_cm, length_cm: p.length_cm };
    if (p.flare_cm && p.flare_cm > 0) {
      // WinISD's port has no round-overs: a straight port of the same tuning (flares add effective length).
      const fb = ventedFb(v, { ...port, flare_cm: p.flare_cm }, p.count, ec, air);
      const length_cm = portLengthForFb(v, port, fb, p.count, ec, air);
      notes.push(`a flared port is written as a ${length_cm.toFixed(1)} cm straight port with the same tuning (WinISD's ports have no round-overs; its port speed will read higher)`);
      return { count: p.count, diameter_cm, length_cm, endCorrection: ec, fb };
    }
    return { count: p.count, diameter_cm, length_cm: p.length_cm, endCorrection: ec, fb: ventedFb(v, port, p.count, ec, air) };
  };
  let box: WprExport["box"];
  const losses = lossesFor(s, d);
  if (d.kind === "vented") box = { type: "vented", vb_l: vb, port: portOut(d, vb) };
  else if (d.kind === "pr") {
    if (d.extra.length > 0) notes.push("only the first group of passive radiators is written (WinISD has one)");
    // WinISD takes a PR's compliance from its Vas: write the Vas of the compliance the app uses (a
    // datasheet's Cms and Vas often disagree a little, and the app prefers Cms), and the tuning
    // that gives, which WinISD shows until it recalculates.
    const m = passiveRadiatorModel(d.params, 0, air);
    const vas_l = m.cmp * air.rho * air.c * air.c * m.sd * m.sd * 1000;
    const fb = prFb(vb, d.params, d.count, d.addedMass_g, air);
    box = { type: "passive-radiator", vb_l: vb, fb, count: d.count, addedMass_g: d.addedMass_g, pr: { ...d.params, vas_l } };
  } else if (d.kind === "bandpass") {
    const bl = d.losses;
    const front = { vb_l: d.frontVb_l, port: portOut(d.front, d.frontVb_l), losses: bl ? bl.front : losses };
    box = {
      type: "bandpass",
      order: d.order,
      rear: { vb_l: vb, port: d.order === "4" ? undefined : portOut(d.rear, vb) },
      front,
      qicl: bl?.qicl ?? 100,
    };
  } else box = { type: "sealed", vb_l: vb };
  if (s.wiring === "series" && s.drivers > 1) notes.push(`WinISD wires drivers in parallel: its SPL at the same power matches, but the amplifier load differs`);
  if (s.highPass.on && s.highPass.type !== "butterworth") notes.push("only a Butterworth high-pass is written; set yours in WinISD's filters");
  if (s.settings.driveModel !== "winisd" && s.settings.rg > 0)
    notes.push("WinISD's watts go into the coil and the amp + cable resistance together: set Settings → Watts to “Into coil + cable” for the same numbers in both");
  if (s.eq.some((e) => e.on)) notes.push("EQ isn't written");
  if (s.passive.on) notes.push("passive parts aren't written");
  if (s.baffle.on) notes.push("baffle step isn't written");
  if (s.roomGain.mode !== "off") notes.push("room gain isn't written");
  // WinISD's input power: watts as they are; a voltage as the watts it gives into Re.
  const power = s.drive === "watts" ? s.power : switchDrive(s, "watts").power;
  const ac = s.settings.air === "custom" ? s.settings.airConditions : { temp_C: 20, humidity_pct: s.settings.air === "winisd" ? 30 : 0, pressure_hPa: 1013.25 };
  const text = writeWpr({
    driver: {
      brand,
      model: name.slice(brand.length).trim() || name,
      nominal_ohms: s.nominal_ohms,
      ts: { ...t, re: t.re! * k.re, qes: t.qes! * k.qes },
      le_mh: s.le_mh * k.re,
      xmax_mm: s.xmax_mm,
      pe_w: s.pe_w,
      displacement_l: s.volume.driverDisp_l,
    },
    losses: d.kind === "bandpass" && d.losses ? d.losses.rear : losses,
    box,
    // WinISD's Rg is per driver (each isobaric pair has two coils in series).
    rg: (s.settings.rg * s.drivers) / (s.isobaric ? 2 : 1),
    drivers: s.drivers,
    isobaric: s.isobaric,
    // WinISD drives an isobaric pair from one driver's Re, as the WinISD drive model does; from the
    // cold Re of the pair (the circuit model) the same volts need twice WinISD's watts.
    power: s.isobaric && s.settings.driveModel === "circuit" ? power * 2 : power,
    simulateLe: s.settings.inductance,
    air: { ...air, ...ac },
    highPass: s.highPass.on && s.highPass.type === "butterworth" ? { order: s.highPass.order, freq: s.highPass.freq } : undefined,
    color: colorOf(s, d.id),
  });
  return { text, notes };
}
