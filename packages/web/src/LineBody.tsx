import { useState } from "react";
import { simulate, type AlignmentDriver, type DriverInput, type SimulationOptions } from "@sbg/engine";
import { Fixed, Num, Select } from "./components.tsx";
import { lineInputOf, lineVolume, PORT_LIMIT } from "./sim.ts";
import { ventedAlignmentFor } from "./presets.ts";
import type { LineDesign } from "./state.ts";

const f1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : v.toFixed(1));
const C = 343;

/** Tuning of a line design, by simulation (impedance minimum between the first two peaks). */
export function lineTuning(driver: DriverInput, d: LineDesign, sim: SimulationOptions): number | null {
  try {
    const r = simulate(driver, lineInputOf(d), { ...sim, fMin: 8, fMax: 400, points: 260, highPass: null, eq: [] });
    return r.summary.fb ?? null;
  } catch {
    return null;
  }
}

/**
 * Change one setting until the line tunes to `target`: the whole line's length (driver
 * position and stuffing scale with it) for an open line, the port length for a
 * mass-loaded one. Bisection on the simulated tuning.
 */
export function tuneLine(driver: DriverInput, d: LineDesign, target: number, sim: SimulationOptions): LineDesign | string {
  const withScale = (k: number): LineDesign =>
    d.port
      ? { ...d, portLength_cm: k }
      : { ...d, length_cm: d.length_cm * k, driverAt_cm: d.driverAt_cm * k, fillLength_cm: d.fillLength_cm * k };
  const fbAt = (k: number) => lineTuning(driver, withScale(k), sim);
  // Start from where the line is now and step outward until the target is bracketed
  // (longer = lower in both cases); far from home the first impedance dip can jump to a
  // higher-order resonance, so stay local.
  const k0 = d.port ? Math.max(d.portLength_cm, 1) : 1;
  const f0 = fbAt(k0);
  if (f0 === null) return "The tuning can't be found for this line: check its sizes.";
  const step = 1.25;
  let lo = k0; // tunes above target (too short)
  let hi = k0; // tunes below target (too long)
  if (f0 > target) {
    for (let i = 0; ; i++) {
      hi = hi * step;
      const f = fbAt(hi);
      if (f !== null && f <= target) break;
      if (i > 12 || f === null) return d.port ? `No port length up to ${Math.round(hi)} cm tunes down to ${target} Hz: use a narrower port or a bigger line.` : `${target} Hz needs a much longer line; check the driver and the areas.`;
      lo = hi;
    }
  } else {
    for (let i = 0; ; i++) {
      lo = lo / step;
      const f = fbAt(lo);
      if (f !== null && f >= target) break;
      if (i > 12 || f === null || (d.port && lo < 0.3)) return d.port ? `Even a very short port tunes below ${target} Hz: use a wider port or a smaller line.` : `${target} Hz needs a much shorter line; check the driver and the areas.`;
      hi = lo;
    }
  }
  for (let i = 0; i < 24; i++) {
    const mid = Math.sqrt(lo * hi);
    const f = fbAt(mid);
    if (f === null) break;
    if (f > target) lo = mid;
    else hi = mid;
  }
  return withScale(Math.sqrt(lo * hi));
}

type PresetId = "tl" | "tqwt" | "otl" | "mltl";

const PRESETS: { id: PresetId; label: string; title: string }[] = [
  { id: "tl", label: "Classic TL", title: "Tapered line, driver at the closed end, stuffed for two thirds; tuned to Fs" },
  { id: "tqwt", label: "TQWT", title: "Tapered quarter-wave tube (Voigt pipe): narrow closed end opening to a wide mouth, driver a third along, lightly stuffed" },
  { id: "otl", label: "Offset TL", title: "Straight line with the driver a fifth of the way along (suppresses the 5th harmonic), stuffed behind the driver" },
  { id: "mltl", label: "MLTL", title: "Mass-loaded line: straight, driver about a quarter along, port at the mouth; tuned like a vented box" },
];

/** A preset sized for the driver, before tuning. */
function presetFor(id: PresetId, d: LineDesign, driver: DriverInput, align: AlignmentDriver | null, drivers: number): LineDesign | string {
  const sd = driver.sd_cm2 * drivers;
  const lq = (C / (4 * driver.fs)) * 100; // quarter wave at Fs, cm
  const r = (x: number) => Math.round(x * 10) / 10;
  switch (id) {
    case "tl":
      return { ...d, port: false, taper: "linear", closedArea_cm2: r(1.25 * sd), mouthArea_cm2: r(0.8 * sd), length_cm: r(lq), driverAt_cm: 0, fill_kgm3: 8, fillLength_cm: r((lq * 2) / 3), targetFb: r(driver.fs) };
    case "tqwt":
      return { ...d, port: false, taper: "linear", closedArea_cm2: r(0.3 * sd), mouthArea_cm2: r(3 * sd), length_cm: r(lq), driverAt_cm: r(lq / 3), fill_kgm3: 4, fillLength_cm: r(lq / 3), targetFb: r(driver.fs * 0.9) };
    case "otl":
      return { ...d, port: false, taper: "linear", closedArea_cm2: r(1.5 * sd), mouthArea_cm2: r(1.5 * sd), length_cm: r(lq), driverAt_cm: r(lq / 5), fill_kgm3: 6, fillLength_cm: r(lq / 3), targetFb: r(driver.fs) };
    case "mltl": {
      const a = align ? ventedAlignmentFor(align, drivers) : null;
      if (!a) return "This driver's Qts is above 0.6: a mass-loaded line (like a ported box) doesn't suit it. Try a classic TL or TQWT.";
      // Long and slim, as MLTLs are built: about 0.4 of a quarter wave at the tuning, holding
      // about 1.5 × the matching ported box's volume (the line's own losses need more room).
      const L = 0.4 * (C / (4 * a.fb)) * 100;
      const area = (1.5 * a.vb_l * 1000) / L;
      // Port area about a fifth of the cone area for a start.
      const portD = 2 * Math.sqrt((0.2 * sd) / Math.PI);
      return { ...d, port: true, taper: "linear", closedArea_cm2: r(area), mouthArea_cm2: r(area), length_cm: r(L), driverAt_cm: r(L / 4), fill_kgm3: 4, fillLength_cm: r(L / 2), portDiameter_cm: r(portD), portLength_cm: 10, targetFb: r(a.fb) };
    }
  }
}

/** The unfolded line, closed end on the left: height follows the area, stuffing hatched. */
function LineDrawing({ d }: { d: LineDesign }) {
  const W = 400;
  const H = 124;
  const mid = 70;
  const x0 = 16;
  const span = W - 2 * x0 - (d.port ? 30 : 0);
  const maxA = Math.max(d.closedArea_cm2, d.mouthArea_cm2, 1);
  const half = (a: number) => (Math.sqrt(Math.max(a, 0)) / Math.sqrt(maxA)) * 42;
  const areaAt = (t: number) =>
    d.taper === "conical"
      ? (Math.sqrt(d.closedArea_cm2) + (Math.sqrt(d.mouthArea_cm2) - Math.sqrt(d.closedArea_cm2)) * t) ** 2
      : d.taper === "exponential"
        ? d.closedArea_cm2 * (d.mouthArea_cm2 / d.closedArea_cm2) ** t
        : d.closedArea_cm2 + (d.mouthArea_cm2 - d.closedArea_cm2) * t;
  const pts = Array.from({ length: 41 }, (_, i) => i / 40);
  const top = pts.map((t) => `${x0 + t * span},${mid - half(areaAt(t))}`).join(" ");
  const bottom = [...pts].reverse().map((t) => `${x0 + t * span},${mid + half(areaAt(t))}`).join(" ");
  const L = Math.max(d.length_cm, 1);
  const fillT = d.fill_kgm3 > 0 ? Math.min(1, d.fillLength_cm / L) : 0;
  const fillPts = pts.filter((t) => t <= fillT).concat(fillT > 0 ? [fillT] : []);
  const fillTop = fillPts.map((t) => `${x0 + t * span},${mid - half(areaAt(t))}`).join(" ");
  const fillBottom = [...fillPts].reverse().map((t) => `${x0 + t * span},${mid + half(areaAt(t))}`).join(" ");
  const xd = x0 + Math.min(1, d.driverAt_cm / L) * span;
  const yTop = mid - half(areaAt(Math.min(1, d.driverAt_cm / L)));
  const portH = d.port ? Math.min(half(areaAt(1)), Math.max(3, half((d.portDiameter_cm / 2) ** 2 * Math.PI))) : 0;
  return (
    <svg className="line-drawing" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The line, unfolded: closed end on the left, mouth on the right">
      <defs>
        <pattern id="line-fill" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" className="line-hatch" />
        </pattern>
      </defs>
      <polygon points={`${top} ${bottom}`} className="line-body" />
      {fillT > 0 && <polygon points={`${fillTop} ${fillBottom}`} fill="url(#line-fill)" />}
      <line x1={x0} y1={mid - half(d.closedArea_cm2)} x2={x0} y2={mid + half(d.closedArea_cm2)} className="line-closed" />
      {d.port && <rect x={x0 + span} y={mid - portH} width={30} height={2 * portH} className="line-port" />}
      <rect x={xd - 8} y={yTop - 7} width={16} height={7} className="line-driver" />
      <text x={xd} y={yTop - 10} textAnchor="middle" className="line-label">
        driver
      </text>
      <text x={x0} y={H - 2} className="line-label">
        closed
      </text>
      <text x={W - x0} y={H - 2} textAnchor="end" className="line-label">
        {d.port ? "port" : "mouth"}
      </text>
    </svg>
  );
}

export function LineBody(p: {
  design: LineDesign;
  onChange: (d: LineDesign) => void;
  driver: DriverInput | null;
  sim: SimulationOptions;
  align: AlignmentDriver | null;
  drivers: number;
  /** Simulated tuning and peak velocity at the mouth or port, from the charts' run. */
  fb: number | null;
  exitVelocity: number | null;
}) {
  const d = p.design;
  const [msg, setMsg] = useState("");
  const set = (patch: Partial<LineDesign>) => {
    const next = { ...d, ...patch };
    p.onChange({ ...next, vb_l: Math.round(lineVolume(next) * 10) / 10 });
  };
  const volume = lineVolume(d);

  const tune = (base: LineDesign = d, target = base.targetFb) => {
    if (!p.driver) return setMsg("Enter the driver's parameters first.");
    const r = tuneLine(p.driver, base, target, p.sim);
    if (typeof r === "string") {
      setMsg(r);
      if (base !== d) set(base); // keep the preset, untuned
      return;
    }
    setMsg("");
    const round = (x: number) => Math.round(x * 10) / 10;
    set({
      ...r,
      targetFb: target,
      length_cm: round(r.length_cm),
      driverAt_cm: round(r.driverAt_cm),
      fillLength_cm: round(r.fillLength_cm),
      portLength_cm: round(r.portLength_cm),
    });
  };

  const preset = (id: PresetId) => {
    if (!p.driver) return setMsg("Enter the driver's parameters first.");
    const base = presetFor(id, d, p.driver, p.align, p.drivers);
    if (typeof base === "string") return setMsg(base);
    tune({ ...base, name: d.name }, base.targetFb);
  };

  // Checks
  const notes: { warn: boolean; text: string }[] = [];
  const sd = (p.driver?.sd_cm2 ?? 0) * p.drivers;
  const areaAtDriver =
    d.closedArea_cm2 + (d.mouthArea_cm2 - d.closedArea_cm2) * Math.min(1, d.driverAt_cm / Math.max(1, d.length_cm));
  if (sd > 0 && areaAtDriver < 0.6 * sd) {
    notes.push({ warn: true, text: `The line is narrower where the driver sits (${Math.round(areaAtDriver)} cm²) than the cone (${Math.round(sd)} cm²): the cone needs room behind it.` });
  }
  if (d.driverAt_cm > d.length_cm) notes.push({ warn: true, text: "The driver is past the mouth: move it along the line." });
  if (p.exitVelocity !== null && p.exitVelocity > PORT_LIMIT) {
    notes.push({ warn: true, text: `Air speed at the ${d.port ? "port" : "mouth"} reaches ${p.exitVelocity.toFixed(1)} m/s (over ${PORT_LIMIT}): ${d.port ? "use a wider port" : "a wider mouth"} or less power.` });
  }
  if (p.fb === null && p.driver) notes.push({ warn: false, text: "The tuning isn't in the charts' range (no clear impedance dip)." });

  return (
    <>
      <LineDrawing d={d} />
      <div className="fields">
        <Select<"open" | "port">
          label="End"
          value={d.port ? "port" : "open"}
          options={[
            { value: "open", text: "Open mouth (TL, TQWT)" },
            { value: "port", text: "Port at the mouth (MLTL)" },
          ]}
          onChange={(x) => set({ port: x === "port" })}
        />
        <Select<LineDesign["taper"]>
          label="Taper"
          value={d.taper}
          options={[
            { value: "linear", text: "Linear (one side slopes)" },
            { value: "conical", text: "Conical" },
            { value: "exponential", text: "Exponential" },
          ]}
          onChange={(taper) => set({ taper })}
        />
        <Num label="Length" q="len" value={d.length_cm} min={1} onChange={(length_cm) => set({ length_cm })} />
        <Num label="Driver at" q="len" value={d.driverAt_cm} min={0} title="Driver centre, measured from the closed end" onChange={(driverAt_cm) => set({ driverAt_cm })} />
        <Num label="Closed end" unit="cm²" value={d.closedArea_cm2} min={1} title="Cross-section at the closed end" onChange={(closedArea_cm2) => set({ closedArea_cm2 })} />
        <Num label="Mouth" unit="cm²" value={d.mouthArea_cm2} min={1} title="Cross-section at the mouth" onChange={(mouthArea_cm2) => set({ mouthArea_cm2 })} />
        <Num label="Stuffing" unit="kg/m³" value={d.fill_kgm3} min={0} title="Polyester fibre density; 0 = empty. 4–10 is typical." onChange={(fill_kgm3) => set({ fill_kgm3 })} />
        <Num label="Stuffed to" q="len" value={d.fillLength_cm} min={0} title="Stuffing runs from the closed end this far along the line" onChange={(fillLength_cm) => set({ fillLength_cm })} />
        {d.port && (
          <>
            <Num label="Port Ø" q="len" value={d.portDiameter_cm} min={0.5} onChange={(portDiameter_cm) => set({ portDiameter_cm })} />
            <Num label="Port length" q="len" value={d.portLength_cm} min={0} onChange={(portLength_cm) => set({ portLength_cm })} />
          </>
        )}
        <Fixed label="Volume" unit="L" value={f1(volume)} title="Inside volume of the line (port excluded)" />
        <Fixed label="Fb" unit="Hz" value={f1(p.fb)} title="Tuning: the impedance dip between the first two peaks" />
      </div>
      <div className="tune">
        <Num label="Tune to" unit="Hz" value={d.targetFb} min={5} onChange={(targetFb) => set({ targetFb })} />
        <button className="secondary" onClick={() => tune()} disabled={!p.driver} title={d.port ? "Find the port length for this tuning" : "Scale the line's length (driver position and stuffing follow) for this tuning"}>
          {d.port ? "Set port length" : "Set line length"}
        </button>
      </div>
      <div className="presets">
        <span>Presets:</span>
        {PRESETS.map((x) => (
          <button key={x.id} className="chip" disabled={!p.driver} title={x.title} onClick={() => preset(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      {msg && <p className="warn">{msg}</p>}
      {notes.map((n) => (
        <p key={n.text} className={n.warn ? "warn" : "hint"}>
          {n.warn ? "⚠ " : ""}
          {n.text}
        </p>
      ))}
      <p className="hint">
        Simulated as a one-dimensional duct, like Hornresp: lengths along the centre of the line, folds not modelled. Stuffing is the
        least certain part of any line simulation; treat its effect as a guide. Beta: being checked against Hornresp. A plain quarter
        wave of this length would be {(C / (4 * Math.max(d.length_cm, 1) / 100)).toFixed(0)} Hz.
      </p>
    </>
  );
}
