import { DEFAULT_END_CORRECTION, portLengthForFb, type OpenisdBox, type OpenisdDriver, type OpenisdPort, type OpenisdProject } from "@sbg/engine";
import { airOf } from "./sim.ts";
import { MAX_DESIGNS, newDesign, newId, type AppState, type DesignState, type EqItem, type PortFields } from "./state.ts";

const r = (x: number, d = 3) => Number(x.toFixed(d));

/** An OpenISD driver into the driver fields (the rest of the project stays as it is). */
export function withOpenisdDriver(s: AppState, d: OpenisdDriver, fallbackName: string): AppState {
  return {
    ...s,
    driverName: [d.brand, d.model].filter(Boolean).join(" ") || fallbackName,
    driverBrand: d.brand,
    nominal_ohms: d.nominal_ohms ?? s.nominal_ohms,
    ts: d.ts,
    le_mh: d.le_mh ?? 0,
    l2_mh: 0,
    r2_ohm: 0,
    semi: undefined,
    fdd: undefined,
    xmax_mm: d.xmax_mm ?? s.xmax_mm,
    pe_w: d.pe_w ?? s.pe_w,
    dvc: { ...s.dvc, on: false },
    volume: { ...s.volume, driverCutout_mm: 0, driverDepth_mm: 0 },
  };
}

/** A port's fields; with no stored length, the length that tunes it to fb in this chamber. */
function portFields(p: OpenisdPort, vb_l: number, fb: number | undefined, base: PortFields, s: AppState): PortFields {
  const air = airOf(s);
  const shape = { shape: p.shape, diameter_cm: r(p.diameter_cm), slotWidth_cm: r(p.width_cm || base.slotWidth_cm), slotHeight_cm: r(p.height_cm || base.slotHeight_cm) };
  let length = p.length_cm;
  if (length === undefined && fb !== undefined && vb_l > 0) {
    const input =
      p.shape === "round"
        ? { shape: "round" as const, diameter_cm: p.diameter_cm, length_cm: 0 }
        : { shape: "slot" as const, width_cm: p.width_cm, height_cm: p.height_cm, length_cm: 0 };
    length = portLengthForFb(vb_l, input, fb, p.count, DEFAULT_END_CORRECTION, air);
  }
  return {
    ...base,
    ...shape,
    length_cm: r(Math.max(0.5, length ?? base.length_cm)),
    count: p.count,
    targetFb: r(fb ?? base.targetFb, 2),
    flare_cm: 0,
  };
}

function designFor(box: OpenisdBox, s: AppState, name: string): DesignState | null {
  if (box.type === "sealed") {
    const d = newDesign("sealed", s.designs);
    return { ...d, name, vb_l: r(box.vb_l) };
  }
  if (box.type === "vented") {
    const d = newDesign("vented", s.designs);
    if (d.kind !== "vented") return null;
    const p = portFields(box.port, box.vb_l, box.fb, d, s);
    return { ...d, ...p, name, vb_l: r(box.vb_l), flare_cm: 0 };
  }
  if (box.type === "passive-radiator") {
    const d = newDesign("pr", s.designs);
    if (d.kind !== "pr") return null;
    const x = box.pr;
    return {
      ...d,
      name,
      vb_l: r(box.vb_l),
      prName: x.name || "From OpenISD project",
      count: box.count,
      addedMass_g: r(box.addedMass_g, 2),
      targetFb: r(box.fb ?? d.targetFb, 2),
      params: { mms_g: r(x.mms_g), sd_cm2: r(x.sd_cm2, 2), vas_l: r(x.vas_l), qms: x.qms, xmax_mm: r(x.xmax_mm, 2) },
      extra: [],
    };
  }
  const d = newDesign("bandpass", s.designs);
  if (d.kind !== "bandpass") return null;
  const rear = box.order === "4" || !box.rear.port ? d.rear : portFields(box.rear.port, box.rear.vb_l, box.rear.fb, d.rear, s);
  const same = (a: typeof box.front.losses, b: typeof box.rear.losses) => a.ql === b.ql && a.qa === b.qa && a.qp === b.qp;
  return {
    ...d,
    name,
    order: box.order,
    vb_l: r(box.rear.vb_l),
    frontVb_l: r(box.front.vb_l),
    front: portFields(box.front.port, box.front.vb_l, box.front.fb, d.front, s),
    rear,
    frontOpening: "port",
    rearOpening: "port",
    losses:
      same(box.front.losses, box.rear.losses) && box.qicl === 100
        ? null
        : { front: { ...box.front.losses }, rear: { ...box.rear.losses }, qicl: box.qicl },
  };
}

/**
 * An OpenISD project (.owpr) as our state: driver, air, drive, amplifier resistance, the box as a
 * new design and the filters we have. Returns the state and plain-words notes on what changed or
 * couldn't come across.
 */
export function applyOwpr(s0: AppState, p: OpenisdProject, fileName: string): { state: AppState; notes: string[] } {
  const notes: string[] = [];
  const base = fileName.replace(/\.owpr$/i, "");
  let s = withOpenisdDriver(s0, p.driver, p.name || base);
  const conditions = p.air
    ? {
        temp_C: Math.min(60, Math.max(-40, r(p.air.temp_C, 1))),
        humidity_pct: Math.min(100, Math.max(0, r(p.air.humidity_pct, 1))),
        pressure_hPa: Math.min(1100, Math.max(500, r(p.air.pressure_hPa, 1))),
      }
    : s.settings.airConditions;
  if (p.air) notes.push(`Air set to the project's ${conditions.temp_C} °C, ${conditions.humidity_pct}% humidity, ${conditions.pressure_hPa} hPa.`);
  const losses = p.box ? (p.box.type === "bandpass" ? p.box.front.losses : p.box.losses) : s.settings.losses;
  s = {
    ...s,
    drivers: Math.max(1, Math.round(p.drivers)),
    wiring: p.wiring,
    isobaric: false,
    ...(p.drive && "volts" in p.drive
      ? { drive: "volts" as const, volts: r(p.drive.volts, 3) }
      : p.drive
        ? { drive: "watts" as const, power: r(p.drive.watts, 3) }
        : {}),
    settings: {
      ...s.settings,
      air: p.air ? "custom" : s.settings.air,
      airConditions: conditions,
      rg: r(p.rs_ohm, 4),
      losses: { ...losses },
    },
  };
  const hp = p.filters.find((f) => f.type === "highpass");
  const eq: EqItem[] = [];
  for (const f of p.filters) {
    if (f.type === "highpass") continue;
    const id = newId(eq);
    eq.push({ id, on: true, target: "all", ...f });
  }
  const extraHp = p.filters.filter((f) => f.type === "highpass").length - 1;
  s = {
    ...s,
    highPass: hp ? { on: true, type: hp.family, order: hp.order, freq: r(hp.freq, 2) } : { ...s.highPass, on: false },
    eq: eq.slice(0, 12),
  };
  if (hp) notes.push(`High-pass filter imported (${hp.family === "butterworth" ? "Butterworth" : "Linkwitz-Riley"}, order ${hp.order}, ${r(hp.freq, 2)} Hz).`);
  if (eq.length > 0) notes.push(`${eq.length} EQ stage${eq.length > 1 ? "s" : ""} imported.`);
  const skipped = p.unsupportedFilters + Math.max(0, extraHp);
  if (skipped > 0) notes.push(`${skipped} filter${skipped > 1 ? "s" : ""} couldn't be brought across; add ${skipped > 1 ? "them" : "it"} by hand.`);
  if (p.box) {
    const design = designFor(p.box, s, `OpenISD: ${p.name || base}`);
    if (design && s.designs.length < MAX_DESIGNS) s = { ...s, designs: [...s.designs, design] };
    else if (design) notes.push(`There are already ${MAX_DESIGNS} boxes, so the project's box wasn't added.`);
  } else notes.push("The project's box type isn't supported yet, so only the driver was imported.");
  if (p.drivers > 1) notes.push(`${p.drivers} drivers wired in ${p.wiring}.`);
  return { state: s, notes };
}
