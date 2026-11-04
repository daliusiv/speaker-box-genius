import { useEffect, useState } from "react";
import type { AlignmentDriver, DriverInput, SimulationOptions } from "@sbg/engine";
import { Fixed, Num, Select } from "./components.tsx";
import { lineFoldOf, lineLength, lineVolume, PORT_LIMIT } from "./sim.ts";
import { bestLine, compareOne, frontHorn, makePreset, PRESETS, presetFor, rankLines, tuneLine, type LineBest, type LineCompare, type LineGoal, type PresetId } from "./lineopt.ts";
import type { LineDesign, LineSection } from "./state.ts";
import { foldShapes } from "./foldShapes.ts";
import { fromHornresp, toHornresp, type HornrespImport } from "./hornresp.ts";

export type ImportedDriver = NonNullable<HornrespImport["driver"]>;

/** Export the design as a Hornresp record, or read one in. */
function HornrespPanel(p: {
  d: LineDesign;
  driver: DriverInput | null;
  sim: SimulationOptions;
  drivers: number;
  onDesign: (patch: Partial<LineDesign>) => void;
  onImportDriver?: (x: ImportedDriver) => void;
}) {
  const [mode, setMode] = useState<"export" | "import">("export");
  const [text, setText] = useState("");
  const [useDriver, setUseDriver] = useState(true);
  const [result, setResult] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const power = p.sim.power ?? 1;
  const eg = p.driver ? (p.sim.convention === "volts" ? power : Math.sqrt(power * p.driver.re)) : 2.83;
  const out = p.driver ? toHornresp(p.d, p.driver, { eg, drivers: p.drivers, name: p.d.name, pmax: p.driver.pe_w, xmax_mm: p.driver.xmax_mm }) : "Enter the driver's parameters first.";
  const download = () => {
    if (typeof out === "string") return;
    const url = URL.createObjectURL(new Blob([out.text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.d.name.replace(/[^\w\- ]+/g, "").trim() || "line"}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const read = (raw: string) => {
    const r = fromHornresp(raw, p.d);
    if (typeof r === "string") return setResult({ ok: false, lines: [r] });
    p.onDesign(r.design);
    const used = !!(r.driver && useDriver && p.onImportDriver);
    if (used) p.onImportDriver!(r.driver!);
    setResult({
      ok: true,
      lines: [
        `Read ${r.design.sections?.length ?? 0} section${r.design.sections?.length === 1 ? "" : "s"} (${r.design.end === "horn" ? "front-loaded horn" : r.design.end === "tapped" ? "tapped horn" : r.design.end === "port" ? "line with a port" : "line"})${used ? " and the driver" : ""}.`,
        ...r.warnings,
      ],
    });
  };
  return (
    <details className="line-fold line-hornresp">
      <summary>Hornresp</summary>
      <div className="unit-switch" role="group" aria-label="Hornresp">
        <button aria-pressed={mode === "export"} onClick={() => setMode("export")}>
          Export
        </button>
        <button aria-pressed={mode === "import"} onClick={() => setMode("import")}>
          Import
        </button>
      </div>
      {mode === "export" ? (
        typeof out === "string" ? (
          <p className="warn">{out}</p>
        ) : (
          <>
            <p className="hint">
              A Hornresp record of this design and driver at {eg.toFixed(2)} V. In Hornresp: File → Import. If your version won't take it, every value is listed below to
              type in.
            </p>
            <div className="row">
              <button type="button" onClick={download}>
                Download .txt
              </button>
              <button type="button" className="secondary" onClick={() => void navigator.clipboard?.writeText(out.text)}>
                Copy
              </button>
            </div>
            {out.warnings.map((w) => (
              <p key={w} className="hint">
                {w}
              </p>
            ))}
            <details>
              <summary className="hint">Values to type in</summary>
              <table className="cut-table">
                <tbody>
                  {out.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.key}</td>
                      <td className="num">{r.value}</td>
                      <td className="hint">{r.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )
      ) : (
        <>
          <p className="hint">Paste a Hornresp record (from File → Export, or from a forum post), or open its .txt file. It replaces this design.</p>
          <textarea className="hornresp-text" rows={6} value={text} placeholder="ID = …" onChange={(e) => setText(e.currentTarget.value)} />
          {p.onImportDriver && (
            <label className="check">
              <input type="checkbox" checked={useDriver} onChange={(e) => setUseDriver(e.currentTarget.checked)} /> Use the record's driver too
            </label>
          )}
          <div className="row">
            <button type="button" disabled={!text.trim()} onClick={() => read(text)}>
              Read record
            </button>
            <label className="secondary file-button">
              Open .txt…
              <input
                type="file"
                accept=".txt,text/plain"
                hidden
                onChange={async (e) => {
                  const f = e.currentTarget.files?.[0];
                  if (!f) return;
                  const t = new TextDecoder("latin1").decode(await f.arrayBuffer());
                  setText(t);
                  read(t);
                }}
              />
            </label>
          </div>
          {result?.lines.map((l, i) => (
            <p key={i} className={result.ok && i === 0 ? "hint" : "warn"}>
              {l}
            </p>
          ))}
        </>
      )}
    </details>
  );
}

const f1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : v.toFixed(1));
const C = 343;
const r1 = (x: number) => Math.round(x * 10) / 10;
const MAX_SECTIONS = 4;

/** The unfolded line, closed end on the left: height follows the area, stuffing hatched. */
function LineDrawing({ d }: { d: LineDesign }) {
  const W = 400;
  const H = 124;
  const mid = 70;
  const x0 = 16;
  const span = W - 2 * x0 - (d.end === "port" ? 30 : 0);
  const L = Math.max(lineLength(d), 1);
  const areas = [d.closedArea_cm2, ...d.sections.map((x) => x.endArea_cm2)];
  const maxA = Math.max(...areas, 1);
  const half = (a: number) => (Math.sqrt(Math.max(a, 0)) / Math.sqrt(maxA)) * 42;
  // Sample each section along its taper.
  const pts: { x: number; a: number; fill: number }[] = [];
  let pos = 0;
  let start = d.closedArea_cm2;
  for (const s of d.sections) {
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const a = s.taper === "conical" ? (Math.sqrt(start) + (Math.sqrt(s.endArea_cm2) - Math.sqrt(start)) * t) ** 2 : s.taper === "exponential" ? start * (s.endArea_cm2 / start) ** t : start + (s.endArea_cm2 - start) * t;
      pts.push({ x: x0 + ((pos + t * s.length_cm) / L) * span, a, fill: s.fill_kgm3 });
    }
    pos += s.length_cm;
    start = s.endArea_cm2;
  }
  const top = pts.map((p) => `${p.x},${mid - half(p.a)}`).join(" ");
  const bottom = [...pts].reverse().map((p) => `${p.x},${mid + half(p.a)}`).join(" ");
  // Stuffed sections as their own hatched polygons.
  const stuffed: string[] = [];
  for (let s = 0; s < d.sections.length; s++) {
    if (!(d.sections[s]!.fill_kgm3 > 0)) continue;
    const part = pts.slice(s * 13, s * 13 + 13);
    stuffed.push(`${part.map((p) => `${p.x},${mid - half(p.a)}`).join(" ")} ${[...part].reverse().map((p) => `${p.x},${mid + half(p.a)}`).join(" ")}`);
  }
  const at = (cm: number) => {
    const x = x0 + (Math.min(cm, L) / L) * span;
    let j = 0;
    while (j < pts.length - 1 && pts[j]!.x < x) j++;
    return { x, y: mid - half(pts[j]!.a) };
  };
  const rear = at(d.driverAt_cm);
  const tap = d.end === "tapped" ? at(d.tapAt_cm) : null;
  const portH = d.end === "port" ? Math.min(half(areas.at(-1)!), Math.max(3, half(Math.PI * (d.portDiameter_cm / 2) ** 2))) : 0;
  return (
    <svg className="line-drawing" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The line, unfolded: closed end on the left, mouth on the right">
      <defs>
        <pattern id="line-fill" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" className="line-hatch" />
        </pattern>
      </defs>
      <polygon points={`${top} ${bottom}`} className="line-body" />
      {stuffed.map((p, k) => (
        <polygon key={k} points={p} fill="url(#line-fill)" />
      ))}
      <line x1={x0} y1={mid - half(d.closedArea_cm2)} x2={x0} y2={mid + half(d.closedArea_cm2)} className="line-closed" />
      {d.end === "port" && <rect x={x0 + span} y={mid - portH} width={30} height={2 * portH} className="line-port" />}
      <rect x={rear.x - 8} y={rear.y - 7} width={16} height={7} className="line-driver" />
      <text x={Math.max(rear.x, x0 + 28)} y={rear.y - 10} textAnchor="middle" className="line-label">
        {tap ? "driver rear" : d.end === "horn" ? "driver + chambers" : "driver"}
      </text>
      {tap && (
        <>
          <rect x={tap.x - 8} y={tap.y - 7} width={16} height={7} className="line-driver tap" />
          <text x={Math.min(Math.max(tap.x, x0 + 28), W - 30)} y={tap.y - 10} textAnchor="middle" className="line-label">
            front tap
          </text>
        </>
      )}
      <text x={x0} y={H - 2} className="line-label">
        {d.end === "horn" ? "throat" : "closed"}
      </text>
      <text x={W - x0} y={H - 2} textAnchor="end" className="line-label">
        {d.end === "port" ? "port" : "mouth"}
      </text>
    </svg>
  );
}

/** Side view of the folded box: runs front (left) to back, dividers, driver and mouth. */
export function FoldDrawing({ d, wall_mm, driverCutout }: { d: LineDesign; wall_mm: number; driverCutout?: number }) {
  let f;
  try {
    f = lineFoldOf(d, wall_mm, driverCutout);
  } catch {
    return null;
  }
  if (!(f.outside.height > 0 && f.outside.depth > 0)) return null;
  const shapes = foldShapes(f, wall_mm);
  const m = 30;
  return (
    <svg className="fold-drawing" viewBox={`${-m} ${-m} ${f.outside.depth + 2 * m} ${f.outside.height + 2 * m}`} role="img" aria-label="Side view of the folded line: front on the left">
      {shapes.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={Math.max(r.w, 1)} height={Math.max(r.h, 1)} className={r.kind === "driver" ? "line-driver" : `fold-${r.kind}`} />
      ))}
    </svg>
  );
}

const STUFFING: { value: string; text: string; density: number }[] = [
  { value: "0", text: "None", density: 0 },
  { value: "4", text: "Light (4 kg/m³)", density: 4 },
  { value: "8", text: "Medium (8 kg/m³)", density: 8 },
  { value: "12", text: "Heavy (12 kg/m³)", density: 12 },
  { value: "custom", text: "Custom…", density: NaN },
];

function SectionEditor(p: { s: LineSection; index: number; canRemove: boolean; onChange: (s: LineSection) => void; onRemove: () => void }) {
  const { s } = p;
  const level = STUFFING.find((x) => x.density === s.fill_kgm3)?.value ?? "custom";
  const [custom, setCustom] = useState(level === "custom");
  return (
    <div className="line-section">
      <div className="line-section-head">
        <b>Section {p.index + 1}</b>
        {p.canRemove && (
          <button type="button" className="icon" aria-label={`Remove section ${p.index + 1}`} onClick={p.onRemove}>
            ×
          </button>
        )}
      </div>
      <div className="fields">
        <Num label="Length" q="len" value={s.length_cm} min={1} onChange={(length_cm) => p.onChange({ ...s, length_cm })} />
        <Num label="End area" unit="cm²" value={s.endArea_cm2} min={1} title="Cross-section at the end of this section (it tapers from the previous one)" onChange={(endArea_cm2) => p.onChange({ ...s, endArea_cm2 })} />
        <Select<LineSection["taper"]>
          label="Taper"
          value={s.taper}
          options={[
            { value: "linear", text: "Linear (one side slopes)" },
            { value: "conical", text: "Conical" },
            { value: "exponential", text: "Exponential" },
          ]}
          onChange={(taper) => p.onChange({ ...s, taper })}
        />
        <Select
          label="Stuffing"
          value={custom ? "custom" : level}
          options={STUFFING.map(({ value, text }) => ({ value, text }))}
          onChange={(v) => {
            if (v === "custom") return setCustom(true);
            setCustom(false);
            p.onChange({ ...s, fill_kgm3: Number(v) });
          }}
        />
        {custom && <Num label="Density" unit="kg/m³" value={s.fill_kgm3} min={0} title="Polyester fibre" onChange={(fill_kgm3) => p.onChange({ ...s, fill_kgm3 })} />}
      </div>
    </div>
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
  /** Port compression in an MLTL's port, when switched on. */
  compression?: { db: number; f: number } | null;
  /** Displacement of all the drivers (litres), from the volume calculator. */
  driverDisp_l: number;
  wall_mm: number;
  onImportDriver?: (x: ImportedDriver) => void;
}) {
  const d = p.design;
  const [msg, setMsg] = useState("");
  const set = (patch: Partial<LineDesign>) => {
    const next = { ...d, ...patch };
    p.onChange({ ...next, vb_l: r1(lineVolume(next)) });
  };
  const L = lineLength(d);
  const volume = lineVolume(d);

  const tune = (base: LineDesign = d, target = base.targetFb) => {
    if (!p.driver) return setMsg("Enter the driver's parameters first.");
    const r = tuneLine(p.driver, base, target, p.sim, p.wall_mm);
    if (typeof r === "string") {
      setMsg(r);
      if (base !== d) set(base); // keep the preset, untuned
      return;
    }
    setMsg("");
    set({ ...r, targetFb: target });
  };

  const preset = (id: PresetId) => {
    if (!p.driver) return setMsg("Enter the driver's parameters first.");
    const made = makePreset(id, p.driver, d, p.sim, p.align, p.drivers, p.wall_mm);
    if (typeof made === "string") {
      // Keep the untuned preset so there's something to adjust.
      const base = presetFor(id, d, p.driver, p.align, p.drivers);
      if (typeof base !== "string") set({ ...base, name: d.name });
      return setMsg(made);
    }
    setMsg("");
    set({ ...made, name: d.name });
  };

  // "Best line": search driver position and stuffing, then retune the length.
  const [best, setBest] = useState<{ goal: LineGoal; result: LineBest | null; busy: boolean } | null>(null);
  useEffect(() => setBest(null), [d]);
  const findBest = (goal: LineGoal) => {
    if (!p.driver) return;
    const driver = p.driver;
    setBest({ goal, result: null, busy: true });
    setTimeout(() => {
      const r = bestLine(driver, d, p.sim, goal, p.wall_mm);
      setBest({ goal, result: r, busy: false });
    }, 30);
  };
  const useBest = (r: LineBest) => {
    if (!p.driver) return;
    const tuned = tuneLine(p.driver, r.design, d.targetFb, p.sim, p.wall_mm);
    setBest(null);
    if (typeof tuned === "string") {
      setMsg(`${r.summary} Couldn't retune afterwards: ${tuned}`);
      set(r.design);
      return;
    }
    setMsg("");
    set(tuned);
  };

  // "Which type suits this driver?": every preset made, tuned and simulated, one per tick.
  const [cmp, setCmp] = useState<{ rows: LineCompare[]; done: boolean } | null>(null);
  const cmpKey = JSON.stringify([p.driver, p.drivers, p.sim, p.wall_mm]);
  useEffect(() => setCmp(null), [cmpKey]);
  const compare = () => {
    if (!p.driver) return;
    const driver = p.driver;
    const rows: LineCompare[] = [];
    setCmp({ rows: [], done: false });
    const next = (k: number) => {
      if (k >= PRESETS.length) return setCmp({ rows: rankLines(rows, driver.xmax_mm), done: true });
      rows.push(compareOne(PRESETS[k]!.id, driver, d, p.sim, p.align, p.drivers, p.wall_mm));
      setCmp({ rows: [...rows], done: false });
      setTimeout(() => next(k + 1), 20);
    };
    setTimeout(() => next(0), 20);
  };
  const useRow = (r: LineCompare) => {
    if (!r.design) return;
    setMsg("");
    set({ ...r.design, name: d.name, id: d.id, on: d.on });
  };

  const setSection = (i: number, s: LineSection) => set({ sections: d.sections.map((x, k) => (k === i ? s : x)) });
  // A new section splits the last one in half, so the line keeps its length and shape.
  const addSection = () => {
    const last = d.sections.at(-1)!;
    const start = d.sections.length > 1 ? d.sections.at(-2)!.endArea_cm2 : d.closedArea_cm2;
    const half = r1(last.length_cm / 2);
    set({
      sections: [
        ...d.sections.slice(0, -1),
        { ...last, length_cm: half, endArea_cm2: r1((start + last.endArea_cm2) / 2) },
        { ...last, length_cm: r1(last.length_cm - half) },
      ],
    });
  };

  // Checks
  const notes: { warn: boolean; text: string }[] = [];
  const sd = (p.driver?.sd_cm2 ?? 0) * p.drivers;
  const areaAt = (x: number) => {
    let pos = 0;
    let start = d.closedArea_cm2;
    for (const s of d.sections) {
      if (x <= pos + s.length_cm) return start + (s.endArea_cm2 - start) * ((x - pos) / s.length_cm);
      pos += s.length_cm;
      start = s.endArea_cm2;
    }
    return start;
  };
  const horn = d.end === "horn";
  if (horn && sd > 0) {
    const cr = sd / d.closedArea_cm2;
    if (cr > 4) notes.push({ warn: true, text: `Compression ratio ${cr.toFixed(1)}:1 (cone area ÷ throat): above about 4:1 the air at the throat distorts at high levels. Widen the throat.` });
    // Mouth size: normalised circumference (half space) at the flare cutoff.
    const s1 = d.closedArea_cm2;
    const s2 = d.sections.at(-1)!.endArea_cm2;
    const exp = d.sections.length === 1 && d.sections[0]!.taper === "exponential";
    if (exp && s2 > s1) {
      const fc = (C * Math.log(s2 / s1)) / (4 * Math.PI * (L / 100));
      const cir = (2 * Math.PI * Math.sqrt((2 * s2) / 1e4 / Math.PI)) / (C / fc);
      notes.push({ warn: cir < 0.7, text: `Flare cutoff ${fc.toFixed(0)} Hz; the mouth's circumference is ${cir.toFixed(2)} × the wavelength there (half space)${cir < 0.7 ? ": the mouth is small for this cutoff, so the response ripples. A bigger mouth or a higher cutoff." : "."}` });
    }
  }
  if (!horn && sd > 0 && areaAt(d.driverAt_cm) < 0.6 * sd) {
    notes.push({ warn: true, text: `The line is narrower where the driver sits (${Math.round(areaAt(d.driverAt_cm))} cm²) than the cone (${Math.round(sd)} cm²): the cone needs room behind it.` });
  }
  if (d.driverAt_cm >= L) notes.push({ warn: true, text: "The driver is past the mouth: move it along the line." });
  if (d.end === "tapped" && !(d.tapAt_cm > d.driverAt_cm && d.tapAt_cm < L)) {
    notes.push({ warn: true, text: "The front tap must sit between the driver's rear and the mouth." });
  }
  if (p.exitVelocity !== null && p.exitVelocity > PORT_LIMIT) {
    notes.push({ warn: true, text: `Air speed at the ${d.end === "port" ? "port" : "mouth"} reaches ${p.exitVelocity.toFixed(1)} m/s (over ${PORT_LIMIT}): ${d.end === "port" ? "a wider or flared port" : "a wider mouth"}, or less power.` });
  }
  if (p.compression && p.compression.db >= 0.3) {
    notes.push({ warn: p.compression.db >= 1.5, text: `Port compression: about −${p.compression.db.toFixed(1)} dB around ${p.compression.f.toFixed(0)} Hz at this power (approximate).` });
  }
  if (p.fb === null && p.driver && !horn) notes.push({ warn: false, text: "The tuning isn't in the charts' range (no clear impedance dip)." });

  // Driver cutout for the fold's fit checks: about 1.12 × the cone diameter (the Build tab can override it).
  const cutout = p.driver ? Math.round(1.12 * 2 * Math.sqrt(p.driver.sd_cm2 / Math.PI) * 10) : undefined;
  const fold = (() => {
    try {
      return lineFoldOf(d, p.wall_mm, cutout);
    } catch {
      return null;
    }
  })();

  return (
    <>
      <LineDrawing d={d} />
      <div className="fields">
        <Select<LineDesign["end"]>
          label="Type"
          value={d.end}
          options={[
            { value: "open", text: "Open mouth (TL, TQWT)" },
            { value: "port", text: "Port at the mouth (MLTL)" },
            { value: "tapped", text: "Tapped horn" },
            { value: "horn", text: "Front-loaded horn" },
          ]}
          onChange={(end) =>
            set({
              end,
              ...(end === "tapped" && !(d.tapAt_cm > d.driverAt_cm && d.tapAt_cm < L) ? { tapAt_cm: r1((d.driverAt_cm + L) / 2) } : {}),
              ...(end === "horn" ? { driverAt_cm: 0, ...(d.mouth === "back" ? { mouth: "front" as const } : {}) } : {}),
            })
          }
        />
        <Num
          label={horn ? "Throat" : "Closed end"}
          unit="cm²"
          value={d.closedArea_cm2}
          min={1}
          title={horn ? "Throat area, where the throat chamber opens into the horn" : "Cross-section at the closed end"}
          onChange={(closedArea_cm2) => set({ closedArea_cm2 })}
        />
        {horn && (
          <>
            <Num label="Rear vol" unit="L" value={d.rearChamber_l} min={0.1} title="Sealed chamber behind the driver" onChange={(rearChamber_l) => set({ rearChamber_l })} />
            <Num label="Throat vol" unit="L" value={d.throatChamber_l} min={0} title="Air between the cone and the throat (0 = none); with the throat it sets the top-end roll-off" onChange={(throatChamber_l) => set({ throatChamber_l })} />
          </>
        )}
        {!horn && <Num label={d.end === "tapped" ? "Rear at" : "Driver at"} q="len" value={d.driverAt_cm} min={0} title={d.end === "tapped" ? "Where the driver's rear opens into the line, from the closed end" : "Driver centre, from the closed end"} onChange={(driverAt_cm) => set({ driverAt_cm })} />}
        {d.end === "tapped" && <Num label="Front tap" q="len" value={d.tapAt_cm} min={0} title="Where the driver's front opens into the line, from the closed end" onChange={(tapAt_cm) => set({ tapAt_cm })} />}
        {d.end === "port" && (
          <>
            <Num label="Port Ø" q="len" value={d.portDiameter_cm} min={0.5} onChange={(portDiameter_cm) => set({ portDiameter_cm })} />
            <Num label="Port length" q="len" value={d.portLength_cm} min={0} onChange={(portLength_cm) => set({ portLength_cm })} />
            <Num label="Flare r" q="len" value={d.portFlare_cm} min={0} title="Round-over radius at both ends of the port (0 = straight)" onChange={(portFlare_cm) => set({ portFlare_cm })} />
          </>
        )}
        <Select<LineDesign["mouth"]>
          label="Mouth"
          value={d.mouth}
          options={[
            { value: "front", text: "Next to the driver" },
            ...(horn ? [] : [{ value: "back" as const, text: `On the back${fold ? ` (${Math.round(fold.outside.depth / 10)} cm further)` : ""}` }]),
            { value: "custom", text: "Further away by…" },
          ]}
          onChange={(mouth) => set({ mouth })}
        />
        {d.mouth === "custom" && <Num label="Extra" q="len" value={d.mouthDistance_cm} min={0} title="How much further the mouth is from the listener than the driver" onChange={(mouthDistance_cm) => set({ mouthDistance_cm })} />}
      </div>

      {d.sections.map((s, i) => (
        <SectionEditor key={i} s={s} index={i} canRemove={d.sections.length > 1} onChange={(x) => setSection(i, x)} onRemove={() => set({ sections: d.sections.filter((_, k) => k !== i) })} />
      ))}
      {d.sections.length < MAX_SECTIONS && (
        <button type="button" className="secondary add-section" onClick={addSection}>
          + Split into another section
        </button>
      )}

      <div className="fields">
        <Fixed label="Length" unit="cm" value={f1(L)} title="Total length along the centre of the line" />
        <Fixed
          label="Volume"
          unit="L"
          value={f1(volume - p.driverDisp_l)}
          title={`Inside volume ${f1(volume)} L${horn ? " (horn and both chambers)" : ""}, less ${f1(p.driverDisp_l)} L for the driver${p.drivers > 1 ? "s" : ""} (port excluded)`}
        />
        {!horn && <Fixed label="Fb" unit="Hz" value={f1(p.fb)} title="Tuning: the impedance dip between the first two peaks" />}
      </div>
      {horn ? (
        <div className="tune">
          <Num label="Cutoff" unit="Hz" value={d.targetFb} min={5} title="Flare cutoff of the exponential horn" onChange={(targetFb) => set({ targetFb })} />
          <button
            className="secondary"
            disabled={!p.driver}
            title="Redesign the horn for this cutoff: throat ½ cone area, mouth and length for the cutoff, chambers from the driver"
            onClick={() => p.driver && set({ ...frontHorn(d, p.driver, p.drivers, d.targetFb), name: d.name })}
          >
            Size the horn
          </button>
        </div>
      ) : (
      <div className="tune">
        <Num label="Tune to" unit="Hz" value={d.targetFb} min={5} onChange={(targetFb) => set({ targetFb })} />
        <button className="secondary" onClick={() => tune()} disabled={!p.driver} title={d.end === "port" ? "Find the port length for this tuning" : "Scale the line's length (driver, tap and sections follow) for this tuning"}>
          {d.end === "port" ? "Set port length" : "Set line length"}
        </button>
      </div>
      )}
      <div className="presets">
        <span>Presets:</span>
        {PRESETS.map((x) => (
          <button key={x.id} className="chip" disabled={!p.driver} title={x.title} onClick={() => preset(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="row line-best">
        <span>Which type suits this driver?</span>
        <button className="secondary" disabled={!p.driver || (cmp !== null && !cmp.done)} onClick={compare} title="Make every preset for this driver, tune it and compare size, bass, smoothness, excursion and mouth speed at this power">
          Compare types
        </button>
      </div>
      {cmp && (
        <div className="line-compare">
          <table className="cut-table">
            <thead>
              <tr>
                <th>Type</th>
                <th className="num">F3</th>
                <th className="num">Size</th>
                <th className="num">Ripple</th>
                <th className="num" title="Peak cone excursion from 0.7 × F3 up, at this power">Cone</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cmp.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.label}
                    {r.tags.length > 0 && (
                      <span className="line-tags">
                        {r.tags.map((t) => (
                          <span key={t} className={`tag${t.startsWith("Over") || t.startsWith("Noisy") ? " bad" : ""}`}>
                            {t}
                          </span>
                        ))}
                      </span>
                    )}
                    {r.error && <span className="hint cut-sub">{r.error}</span>}
                  </td>
                  <td className="num">{r.f3 !== null ? `${r.f3.toFixed(0)} Hz` : "–"}</td>
                  <td className="num">{r.design ? `${Math.round(r.volume_l)} L` : "–"}</td>
                  <td className="num">{r.ripple !== null ? `${r.ripple.toFixed(0)} dB` : "–"}</td>
                  <td className="num">{r.excursion_mm !== null ? `${r.excursion_mm.toFixed(1)} mm` : "–"}</td>
                  <td>
                    {r.design && (
                      <button type="button" className="chip" onClick={() => useRow(r)}>
                        Use
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!cmp.done && (
                <tr>
                  <td colSpan={6} className="hint">
                    Sizing and tuning {PRESETS[cmp.rows.length]?.label}…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {cmp.done && (
            <p className="hint">
              Starting points from the presets, each tuned by simulation; ripple is the peak-to-peak wobble above F3. "Best line" can then smooth the one you pick. Over Xmax: use
              less power or a high-pass; noisy mouth: air over {PORT_LIMIT} m/s.
            </p>
          )}
        </div>
      )}
      {!horn && (
        <>
      <div className="row line-best">
        <span>Best line:</span>
        <button className="secondary" disabled={!p.driver || best?.busy} onClick={() => findBest("smooth")} title="Driver position and stuffing for the smoothest response (keeping the bass), then the length retuned">
          Smoothest
        </button>
        <button className="secondary" disabled={!p.driver || best?.busy} onClick={() => findBest("deep")} title="Driver position and stuffing for the deepest bass (keeping it fairly smooth), then the length retuned">
          Deepest
        </button>
      </div>
      {best?.busy && <p className="hint">Trying driver positions and stuffing…</p>}
      {best && !best.busy && !best.result && <p className="warn">No combination gave a usable response for this line.</p>}
      {best?.result && (
        <div className="tuning-card">
          <p>
            <b>{best.result.better ? best.result.summary : `Already about as ${best.goal === "smooth" ? "smooth" : "deep"} as these settings allow.`}</b>
            {!best.result.better && <span className="hint"> Closest: {best.result.summary}</span>}
          </p>
          <p className="hint">
            F3 {f1(best.result.score.f3)} Hz, ripple {f1(best.result.score.ripple)} dB
            {best.result.before ? ` (now F3 ${f1(best.result.before.f3)} Hz, ripple ${f1(best.result.before.ripple)} dB)` : ""} · {best.result.tried} tried. The length is
            retuned to {d.targetFb} Hz when used.
          </p>
          <button type="button" onClick={() => useBest(best.result!)}>
            Use it
          </button>
        </div>
      )}
        </>
      )}
      {msg && <p className="warn">{msg}</p>}
      {notes.map((n) => (
        <p key={n.text} className={n.warn ? "warn" : "hint"}>
          {n.warn ? "⚠ " : ""}
          {n.text}
        </p>
      ))}

      <details className="line-fold">
        <summary>Fold it into a box</summary>
        <div className="fold-row">
          <FoldDrawing d={d} wall_mm={p.wall_mm} driverCutout={cutout} />
          <div>
            <div className="fields">
              <Num label="Inside width" q="len" value={d.fold.width_cm} min={1} title="Width of the line inside (the box's inside width)" onChange={(width_cm) => set({ fold: { ...d.fold, width_cm } })} />
              <Num label="Folds" value={d.fold.folds} min={0} title="Number of dividers (runs − 1)" onChange={(folds) => set({ fold: { ...d.fold, folds: Math.max(0, Math.min(8, Math.round(folds))) } })} />
            </div>
            {fold && (
              <p className="hint">
                Outside {Math.round(fold.outside.width / 10)} × {Math.round(fold.outside.height / 10)} × {Math.round(fold.outside.depth / 10)} cm (W × H × D), {p.wall_mm} mm
                walls · {fold.runs.length} run{fold.runs.length === 1 ? "" : "s"} · mouth on the {fold.mouth.panel} at the {fold.mouth.at}
                {fold.horn
                  ? ` · driver section on top: rear chamber ${Math.round(fold.horn.rear / 10)} cm and throat chamber ${Math.round(fold.horn.throat / 10)} cm tall, the driver on a motor board between them firing down`
                  : ""}
                . Panels, dividers and holes: Build tab → Cut list.
              </p>
            )}
            {fold?.tapLinedUp_mm !== undefined && Math.abs(fold.tapLinedUp_mm / 10 - d.tapAt_cm) >= 1 && (
              <button type="button" className="secondary" onClick={() => set({ tapAt_cm: r1(fold.tapLinedUp_mm! / 10) })} title="Move the front tap so it's level with the rear across the divider the driver mounts on">
                Line up the tap ({r1(fold.tapLinedUp_mm / 10)} cm)
              </button>
            )}
            {fold?.warnings.map((w) => (
              <p key={w} className="warn">
                ⚠ {w}
              </p>
            ))}
          </div>
        </div>
      </details>

      <HornrespPanel d={d} driver={p.driver} sim={p.sim} drivers={p.drivers} onDesign={(patch) => set(patch)} onImportDriver={p.onImportDriver} />

      <p className="hint">
        Simulated as a one-dimensional duct, like Hornresp: lengths along the centre of the {horn ? "horn" : "line"}; bends are not modelled. Stuffing is the least certain part of any line
        simulation; treat its effect as a guide. Beta: being checked against Hornresp. {!horn && `A plain quarter wave of this length would be ${(C / ((4 * Math.max(L, 1)) / 100)).toFixed(0)} Hz.`}
      </p>
    </>
  );
}
