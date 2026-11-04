import { useState } from "react";
import { levelMatch, parseCurve, resampleCurve, thinCurve, type CurveKind } from "@sbg/engine";
import { Card, Num, Select } from "./components.tsx";
import type { Series } from "./LogChart.tsx";
import type { Design } from "./sim.ts";
import { MAX_MEASURED, type MeasuredCurve } from "./state.ts";

/** Colours for measured curves: apart from the design palette, drawn dashed. */
export const MEASURED_COLORS = ["#0ea5e9", "#eab308", "#ec4899", "#84cc16"];
const DASH = "7 3";

export const measuredColor = (all: MeasuredCurve[], id: string) => MEASURED_COLORS[Math.max(0, all.findIndex((m) => m.id === id)) % MEASURED_COLORS.length]!;

/** Band where a design is usually flat, for matching levels: 1.5–6 × F3, within 40–400 Hz. */
function matchBand(d: Design): [number, number] {
  const f3 = d.result.summary.f3 ?? 40;
  return [Math.max(40, 1.5 * f3), Math.min(400, Math.max(80, 6 * f3))];
}

/**
 * Chart series for the measured curves of one kind, on the charts' frequency grid.
 * Relative SPL view: each response shares the 0 dB of the design it was matched to (or
 * the first design's).
 */
export function measuredSeries(all: MeasuredCurve[], kind: CurveKind, freq: Float64Array, designs: Design[], relative = false): Series[] {
  return all
    .filter((m) => m.on && m.kind === kind)
    .map((m) => {
      const y = resampleCurve(m, freq);
      if (kind === "spl") {
        const ref = relative ? ((designs.find((d) => d.design.id === m.matchTo) ?? designs[0])?.result.summary.referenceSpl ?? 0) : 0;
        for (let i = 0; i < y.length; i++) y[i] = y[i]! + m.offset_db - ref;
      }
      return { label: `${m.name} (measured)`, color: measuredColor(all, m.id), dash: DASH, y };
    });
}

export function MeasuredCard(p: { measured: MeasuredCurve[]; designs: Design[]; onChange: (m: MeasuredCurve[]) => void }) {
  const [msg, setMsg] = useState("");
  const all = p.measured;
  const set = (id: string, patch: Partial<MeasuredCurve>) => p.onChange(all.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const match = (m: MeasuredCurve, designId: string): MeasuredCurve | string => {
    const d = p.designs.find((x) => x.design.id === designId);
    if (!d) return m;
    const [lo, hi] = matchBand(d);
    const off = levelMatch(m, d.result.freq, d.result.spl, lo, hi);
    if (off === null) return `${m.name} doesn't cover ${Math.round(lo)}–${Math.round(hi)} Hz, where ${d.design.name} is matched: set the level by hand.`;
    return { ...m, offset_db: off, matchTo: designId };
  };

  const add = async (file: File, kind: CurveKind) => {
    try {
      if (all.length >= MAX_MEASURED) throw new Error(`at most ${MAX_MEASURED} measurements`);
      const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
      const c = thinCurve(parseCurve(text, kind), 24, 5, 2000);
      if (c.f.length < 2) throw new Error("no points between 5 Hz and 2 kHz");
      const used = new Set(all.map((m) => m.id));
      let n = 1;
      while (used.has(`m${n}`)) n++;
      let m: MeasuredCurve = { id: `m${n}`, name: file.name.replace(/\.[^.]+$/, "").slice(0, 40), kind, on: true, f: c.f, v: c.v, offset_db: 0, matchTo: "" };
      let note = "";
      if (kind === "spl" && p.designs[0]) {
        // Measurements are rarely calibrated: start level-matched to the first design.
        const r = match(m, p.designs[0].design.id);
        if (typeof r === "string") note = ` ${r}`;
        else m = r;
      }
      p.onChange([...all, m]);
      setMsg(`Added ${file.name}.${note}`);
    } catch (e) {
      setMsg(`${file.name}: ${(e as Error).message}.`);
    }
  };

  const picker = (kind: CurveKind, label: string, accept: string) => (
    <label className={`file-button${all.length >= MAX_MEASURED ? " disabled" : ""}`}>
      {label}
      <input
        type="file"
        accept={accept}
        hidden
        disabled={all.length >= MAX_MEASURED}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (f) void add(f, kind);
        }}
      />
    </label>
  );

  return (
    <Card title="Measured">
      <p className="hint">
        Overlay a measurement of your finished box on the charts: a frequency response (.frd) or an impedance sweep (.zma) from REW, ARTA, DATS, VituixCAD… Measured
        curves travel with the share link (thinned to 1/24 octave, up to 2 kHz).
      </p>
      <div className="row">
        {picker("spl", "+ Response (.frd)", ".frd,.txt,.csv")}
        {picker("impedance", "+ Impedance (.zma)", ".zma,.txt,.csv,.dat")}
      </div>
      {msg && <p className="hint">{msg}</p>}
      {all.map((m) => (
        <div key={m.id} className="measured-row">
          <div className="measured-head">
            <input type="checkbox" checked={m.on} aria-label={`Show ${m.name}`} onChange={(e) => set(m.id, { on: e.currentTarget.checked })} />
            <span className="swatch dashed" style={{ borderColor: measuredColor(all, m.id) }} aria-hidden="true" />
            <input className="measured-name" value={m.name} aria-label="Name" maxLength={40} onChange={(e) => set(m.id, { name: e.currentTarget.value })} />
            <span className="hint">{m.kind === "spl" ? "response" : "impedance"}</span>
            <button type="button" className="icon" aria-label={`Remove ${m.name}`} onClick={() => p.onChange(all.filter((x) => x.id !== m.id))}>
              ×
            </button>
          </div>
          {m.kind === "spl" && (
            <div className="fields">
              <Num label="Level" unit="dB" value={m.offset_db} title="Added to the measurement (uncalibrated measurements need this)" onChange={(offset_db) => set(m.id, { offset_db })} />
              {p.designs.length > 0 && (
                <Select<string>
                  label="Match to"
                  value={p.designs.some((d) => d.design.id === m.matchTo) ? m.matchTo : ""}
                  options={[{ value: "", text: "—" }, ...p.designs.map((d) => ({ value: d.design.id, text: d.design.name }))]}
                  onChange={(id) => {
                    if (!id) return set(m.id, { matchTo: "" });
                    const r = match(m, id);
                    if (typeof r === "string") setMsg(r);
                    else {
                      setMsg("");
                      p.onChange(all.map((x) => (x.id === m.id ? r : x)));
                    }
                  }}
                />
              )}
            </div>
          )}
        </div>
      ))}
      {all.some((m) => m.kind === "spl") && (
        <p className="hint">
          Matching sets the level so the measurement averages the same as the design where it's usually flat (1.5–6 × its F3). Ground-plane or far-field measurements
          compare directly; near-field cone and port measurements must be summed first (REW, VituixCAD), and in-room ones include the room.
        </p>
      )}
    </Card>
  );
}
