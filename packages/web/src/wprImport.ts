import { DEFAULT_END_CORRECTION, parseWpr } from "@sbg/engine";
import { MAX_DESIGNS, newDesign, type AppState, type DesignState } from "./state.ts";

type WprProject = ReturnType<typeof parseWpr>;
type WprChamberLosses = { ql: number; qa: number; qp: number };
type WprPort = NonNullable<WprProject["port"]>;
const lossesOf = (c: WprChamberLosses) => ({ ql: c.ql, qa: c.qa, qp: c.qp });

/** Does a bandpass project keep losses of its own (chambers differ, or the leak between them isn't WinISD's default)? */
export function bandpassOwnLosses(b: { front: WprChamberLosses; rear: WprChamberLosses; qicl: number }): boolean {
  return b.front.ql !== b.rear.ql || b.front.qa !== b.rear.qa || b.front.qp !== b.rear.qp || b.qicl !== 100;
}

/**
 * A WinISD project (.wpr) as our state: the driver, the settings that change its results (power,
 * amplifier resistance, WinISD's air and loss models, high-pass filter) and the box as a new
 * design. Used by the app's import and by the validation page's "Open in app" links, so both
 * open the same thing. Returns the state and the message the app shows.
 */
/** A WinISD vent's shape as the app's port fields: round, or a slot with its width and height. */
function portShape(w: WprPort, base: { slotWidth_cm: number; slotHeight_cm: number; diameter_cm: number }) {
  return w.slot
    ? { shape: "slot" as const, slotWidth_cm: Number(w.slot.width_cm.toFixed(3)), slotHeight_cm: Number(w.slot.height_cm.toFixed(3)), diameter_cm: base.diameter_cm }
    : { shape: "round" as const, diameter_cm: Number(w.diameter_cm.toFixed(3)) };
}

export function applyWpr(s: AppState, p: WprProject, fileName: string): { state: AppState; message: string } {
  const d = p.driver;
  const base = fileName.replace(/\.wpr$/i, "");
  const label = [d.brand, d.model].filter(Boolean).join(" ") || base;
  // WinISD keeps an end correction per port; the app has one (Settings → Ports), from the
  // project's port (a bandpass's front port, which sets its output).
  const ports = [p.port, p.bandpass?.front.port, p.bandpass?.rear.port].filter((x) => x !== undefined);
  const ec = ports[0]?.endCorrection ?? DEFAULT_END_CORRECTION;
  const state = ((): AppState => {
    let design: DesignState | null = null;
    if (p.box.type === "vented" && p.port) {
      const v = newDesign("vented", s.designs);
      if (v.kind === "vented") {
        design = {
          ...v,
          name: `WinISD: ${base}`,
          vb_l: Number(p.box.vb_l.toFixed(3)),
          ...portShape(p.port, v),
          length_cm: Number(p.port.length_cm.toFixed(3)),
          count: p.port.count,
          // WinISD's ports are straight (the new-box default is flared).
          flare_cm: 0,
          targetFb: Number((p.box.fb ?? v.targetFb).toFixed(2)),
        };
      }
    } else if (p.box.type === "passive-radiator" && p.pr) {
      const pd = newDesign("pr", s.designs);
      if (pd.kind === "pr") {
        const x = p.pr.params;
        design = {
          ...pd,
          name: `WinISD: ${base}`,
          vb_l: Number(p.box.vb_l.toFixed(3)),
          prName: "From WinISD project",
          count: p.pr.count,
          addedMass_g: Number(p.pr.addedMass_g.toFixed(2)),
          targetFb: Number((p.box.fb ?? pd.targetFb).toFixed(2)),
          params: {
            mms_g: Number(x.mms_g.toFixed(3)),
            sd_cm2: Number(x.sd_cm2.toFixed(2)),
            vas_l: Number(x.vas_l.toFixed(3)),
            qms: x.qms,
            xmax_mm: Number(x.xmax_mm.toFixed(2)),
          },
        };
      }
    } else if (p.box.type === "bandpass" && p.bandpass) {
      const bd = newDesign("bandpass", s.designs);
      if (bd.kind === "bandpass") {
        const b = p.bandpass;
        const portFrom = (w: WprPort, fb: number | undefined, base: typeof bd.front) => ({
          ...base,
          ...portShape(w, base),
          length_cm: Number(w.length_cm.toFixed(3)),
          count: w.count,
          targetFb: Number((fb ?? base.targetFb).toFixed(2)),
        });
        design = {
          ...bd,
          name: `WinISD: ${base}`,
          order: b.order,
          vb_l: Number(b.rear.vb_l.toFixed(3)),
          frontVb_l: Number(b.front.vb_l.toFixed(3)),
          front: portFrom(b.front.port, b.front.fb, bd.front),
          rear: b.rear.port ? portFrom(b.rear.port, b.rear.fb, bd.rear) : bd.rear,
          // Shared losses (Settings) take the front chamber's values; the design keeps its own
          // only when the chambers differ or the leak between them isn't WinISD's default.
          losses: bandpassOwnLosses(b) ? { front: lossesOf(b.front), rear: lossesOf(b.rear), qicl: b.qicl } : null,
        };
      }
    } else if (p.box.vb_l > 0) {
      const sd = newDesign("sealed", s.designs);
      design = { ...sd, name: `WinISD: ${base}`, vb_l: Number(p.box.vb_l.toFixed(3)) };
    }
    const designs = design && s.designs.length < MAX_DESIGNS ? [...s.designs, design] : s.designs;
    return {
      ...s,
      driverName: label,
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
      // With the WinISD drive model (set below) the watts mean the same as WinISD's, isobaric pairs included.
      power: Number(p.power.toFixed(2)),
      drive: "watts",
      drivers: p.drivers,
      wiring: "parallel",
      isobaric: p.isobaric,
      isoCoils: "series",
      // WinISD stores a DVC driver with its coils already wired (VCCon 1 = parallel, 2 = series).
      dvc:
        (d.voiceCoils ?? 1) > 1
          ? { on: true, entered: d.raw.vccon === "2" ? "series" : "parallel", wired: d.raw.vccon === "2" ? "series" : "parallel" }
          : { ...s.dvc, on: false },
      // WinISD's Rg is per driver; our setting is the shared amplifier output.
      settings: {
        ...s.settings,
        air: "winisd",
        // WinISD's models: leaked air is heard, the cone's air is a fixed mass.
        leakage: "radiates",
        driveModel: "winisd",
        coneLoad: "mass",
        endCorrection: ec,
        // Isobaric pairs have two coils in series, each with WinISD's Rg.
        rg: Number(((p.rg * (p.isobaric ? 2 : 1)) / p.drivers).toPrecision(6)),
        inductance: p.simulateLe,
        losses: p.bandpass
          ? { ql: p.bandpass.front.ql, qa: p.bandpass.front.qa, qp: p.bandpass.front.qp }
          : { ql: p.box.ql, qa: p.box.qa, qp: p.box.qp },
      },
      highPass: p.highPass ? { on: true, ...p.highPass } : { ...s.highPass, on: false },
      designs,
      volume: {
      ...s.volume,
      ...(d.displacement_l !== undefined ? { driverDisp_l: Math.round(d.displacement_l * 100) / 100 } : {}),
      driverCutout_mm: 0,
      driverDepth_mm: 0,
    },
    };
  })();
  const lossSrc = p.bandpass?.front ?? p.box;
  const lossNote =
    p.bandpass && bandpassOwnLosses(p.bandpass)
      ? ` The bandpass keeps the project's own losses for each chamber (Front Ql ${p.bandpass.front.ql}, Qa ${p.bandpass.front.qa}, Qp ${p.bandpass.front.qp}; Rear Ql ${p.bandpass.rear.ql}, Qa ${p.bandpass.rear.qa}, Qp ${p.bandpass.rear.qp}; baffle leak ${p.bandpass.qicl}).`
      : lossSrc.ql !== 10 || lossSrc.qa !== 100 || lossSrc.qp !== 100
        ? ` Box losses set to the project's Ql ${lossSrc.ql}, Qa ${lossSrc.qa}, Qp ${lossSrc.qp}.`
        : "";
  const boxNote = p.box.type === "other" ? " This box type isn't supported yet, so only the driver was imported." : "";
  const driversNote =
    p.drivers > 1 && !p.isobaric
      ? ` ${p.drivers} drivers in parallel; WinISD's Rg of ${p.rg} Ω per driver becomes ${Number((p.rg / p.drivers).toPrecision(6))} Ω shared. WinISD's impedance graph shows one driver, ours shows what the amplifier sees.`
      : "";
  const isoNote = p.isobaric
    ? ` Isobaric: ${p.drivers} pair${p.drivers > 1 ? "s" : ""} with series-wired coils, driven like WinISD (its watts set the volts from one driver's Re, so the coils take about half of them).`
    : "";
  const filterNote = p.highPass
    ? ` High-pass filter imported (Butterworth, order ${p.highPass.order}, ${p.highPass.freq} Hz).`
    : "";
  const unsupportedNote =
    p.unsupportedFilters > 0
      ? ` ${p.unsupportedFilters} filter${p.unsupportedFilters > 1 ? "s" : ""} in the project ${p.unsupportedFilters > 1 ? "were" : "was"} not imported; add ${p.unsupportedFilters > 1 ? "them" : "it"} by hand.`
      : "";
  const ecNote =
    ec !== DEFAULT_END_CORRECTION
      ? ` Port end correction set to the project's ${ec} (Settings → Ports).${ports.some((x) => x.endCorrection !== ec) ? ` The project's ports use different end corrections; the app uses one for all, ${ec}.` : ""}`
      : ports.some((x) => x.endCorrection !== ec)
        ? ` The project's ports use different end corrections; the app uses one for all, ${ec}.`
        : "";
  const message = `Imported WinISD project ${fileName} with its power, amplifier resistance and air settings.${filterNote}${unsupportedNote}${driversNote}${isoNote}${boxNote}${lossNote}${ecNote}`;
  return { state, message };
}
