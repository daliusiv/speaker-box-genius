import { useEffect, useMemo, useRef, useState } from "react";
import { parseWdr, writeWdr, type HighPassType, type SimulationResult } from "@sbg/engine";
import { LogChart, type Series } from "./LogChart.tsx";
import {
  DEFAULT_STATE,
  decodeState,
  encodeState,
  MAX_DESIGNS,
  newDesign,
  newId,
  type AppState,
  type DesignState,
} from "./state.ts";
import { loadDriver, loadIndex, type DbIndex } from "./library.ts";
import { Card, LibraryPicker, Num, REPO, Select } from "./components.tsx";
import { TsEditor } from "./TsEditor.tsx";
import { VolumePanel } from "./VolumePanel.tsx";
import { airOf, alignmentDriver, colorOf, PORT_LIMIT, runDesigns, solveDriver, vbOf, type Design } from "./sim.ts";
import { AddDesign, DesignCard } from "./Designs.tsx";
import { ShareMenu } from "./Share.tsx";
import { EqPanel } from "./Eq.tsx";
import { fmtQ, UnitsContext } from "./units.ts";

const LIMIT_RED = "#dc2626";

export function App() {
  const [state, setState] = useState<AppState>(() => decodeState(location.hash) ?? DEFAULT_STATE);
  const [db, setDb] = useState<DbIndex | null>(null);
  const [wdrMsg, setWdrMsg] = useState("");
  const wdrInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadIndex().then(setDb, () => setDb(null));
  }, []);

  // Keep the URL in sync so the address bar is always a shareable link.
  useEffect(() => {
    const id = setTimeout(() => history.replaceState(null, "", "#" + encodeState(state)), 150);
    return () => clearTimeout(id);
  }, [state]);

  useEffect(() => {
    const onHash = () => {
      const s = decodeState(location.hash);
      if (s) setState(s);
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const solved = useMemo(() => solveDriver(state), [state.ts, state.settings.air]); // eslint-disable-line react-hooks/exhaustive-deps
  const designs = useMemo(() => runDesigns(state, solved), [state, solved]);
  const freq = designs[0]?.result.freq ?? new Float64Array();

  const set = <K extends keyof AppState>(k: K, v: AppState[K]) => setState((s) => ({ ...s, [k]: v }));
  const series = (pick: (r: SimulationResult) => Float64Array | null): Series[] =>
    designs.map((d) => ({ label: d.design.name, color: d.color, y: pick(d.result) }));

  const shareUrl = () => location.origin + location.pathname + "#" + encodeState(state);

  const importWdr = async (file: File) => {
    try {
      // WinISD saves in the Windows code page; latin1 keeps most names intact.
      const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
      const d = parseWdr(text);
      setState((s) => ({
        ...s,
        driverName: [d.brand, d.model].filter(Boolean).join(" ") || file.name.replace(/\.wdr$/i, ""),
        driverBrand: d.brand,
        nominal_ohms: d.nominal_ohms ?? s.nominal_ohms,
        ts: d.ts,
        le_mh: d.le_mh ?? 0,
        xmax_mm: d.xmax_mm ?? s.xmax_mm,
        pe_w: d.pe_w ?? s.pe_w,
        volume: d.displacement_l !== undefined ? { ...s.volume, driverDisp_l: Math.round(d.displacement_l * 100) / 100 } : s.volume,
      }));
      setWdrMsg(`Imported ${file.name}.`);
    } catch (e) {
      setWdrMsg(`Couldn't read ${file.name}: ${(e as Error).message}`);
    }
  };

  const exportWdr = () => {
    if (solved.missing.length > 0) {
      setWdrMsg("Enter enough parameters to simulate before exporting.");
      return;
    }
    const name = state.driverName.trim();
    const brand = state.driverBrand && name.startsWith(state.driverBrand) ? state.driverBrand : "";
    const text = writeWdr({
      brand,
      model: name.slice(brand.length).trim() || name,
      nominal_ohms: state.nominal_ohms,
      ts: solved.values,
      le_mh: state.le_mh,
      xmax_mm: state.xmax_mm,
      pe_w: state.pe_w,
      displacement_l: state.volume.driverDisp_l,
    });
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.driverName.replace(/[^\w.-]+/g, " ").trim() || "driver"}.wdr`;
    a.click();
    URL.revokeObjectURL(url);
    setWdrMsg("Exported a WinISD driver file.");
  };

  const hp = state.highPass;

  const updateDesign = (d: DesignState) =>
    setState((s) => ({ ...s, designs: s.designs.map((x) => (x.id === d.id ? d : x)) }));
  const addDesign = (kind: DesignState["kind"]) =>
    setState((s) => (s.designs.length >= MAX_DESIGNS ? s : { ...s, designs: [...s.designs, newDesign(kind, s.designs)] }));
  const duplicateDesign = (d: DesignState) =>
    setState((s) => {
      if (s.designs.length >= MAX_DESIGNS) return s;
      const copy = { ...structuredClone(d), id: newId(s.designs), name: `${d.name} (copy)` };
      const i = s.designs.findIndex((x) => x.id === d.id);
      return { ...s, designs: [...s.designs.slice(0, i + 1), copy, ...s.designs.slice(i + 1)] };
    });
  const deleteDesign = (d: DesignState) =>
    setState((s) => ({
      ...s,
      eq: s.eq.map((e) => (e.target === d.id ? { ...e, target: "all", on: false } : e)),
      designs: s.designs.filter((x) => x.id !== d.id),
      volume: s.volume.link === d.id ? { ...s.volume, link: "none" } : s.volume,
    }));

  const prDesigns = designs.filter((d) => d.design.kind === "pr");
  const prLimits = [...new Set(prDesigns.map((d) => (d.design.kind === "pr" ? d.design.params.xmax_mm : 0)))].map((x) => ({
    value: x,
    label: `PR Xmax ${x} mm`,
    color: LIMIT_RED,
  }));

  return (
    <UnitsContext.Provider value={state.settings.units}>
    <div className="layout">
      <header className="top">
        <div>
          <h1>Speaker Box Genius</h1>
          <p className="muted">
            Early preview · <a href={REPO}>GitHub</a> · <a href={`${REPO}/blob/main/docs/build-plan.md`}>Roadmap</a>
          </p>
        </div>
        <div className="top-actions">
          <label className="power">
            <span>Power</span>
            <input
              type="range"
              min={0}
              max={4}
              step={0.01}
              value={Math.log10(state.power)}
              onChange={(e) => set("power", Math.round(10 ** e.currentTarget.valueAsNumber * 10) / 10)}
            />
            <b>{state.power} W</b>
          </label>
          <ShareMenu state={state} designs={designs} shareUrl={shareUrl} />
        </div>
      </header>

      <aside className="panel">
        <Card title="Driver">
          <LibraryPicker
            label="Load a driver from the database"
            items={db?.drivers.map((x) => ({ id: x.id, text: `${x.brand} ${x.model} (${x.size_in ?? "?"}", ${x.ohms} Ω)` }))}
            onPick={(id) =>
              loadDriver(id).then(
                (d) =>
                  setState((s) => ({
                    ...s,
                    driverName: d.name,
                    driverBrand: d.brand,
                    nominal_ohms: d.nominal_ohms ?? s.nominal_ohms,
                    ts: d.ts,
                    le_mh: d.le_mh ?? 0,
                    xmax_mm: d.xmax_mm ?? s.xmax_mm,
                    pe_w: d.pe_w ?? s.pe_w,
                    volume: d.displacement_l !== undefined ? { ...s.volume, driverDisp_l: d.displacement_l } : s.volume,
                  })),
                () => alert("Couldn't load that driver."),
              )
            }
          />
          <input
            className="name"
            value={state.driverName}
            onChange={(e) => set("driverName", e.currentTarget.value)}
            aria-label="Driver name"
          />
          <TsEditor
            entered={state.ts}
            solved={solved}
            onChange={(ts) => set("ts", ts)}
            onPaste={(ts, x) =>
              setState((s) => ({
                ...s,
                driverName: "Pasted driver",
                driverBrand: "",
                ts,
                le_mh: x.le_mh ?? s.le_mh,
                xmax_mm: x.xmax_mm ?? s.xmax_mm,
                pe_w: x.pe_w ?? s.pe_w,
              }))
            }
          />
          <div className="row">
            <button className="secondary" onClick={() => wdrInput.current?.click()}>
              Import WinISD .wdr
            </button>
            <button className="secondary" onClick={exportWdr}>
              Export .wdr
            </button>
            <input
              ref={wdrInput}
              type="file"
              accept=".wdr,.txt"
              hidden
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) importWdr(f);
                e.currentTarget.value = "";
              }}
            />
          </div>
          {wdrMsg && <p className="hint">{wdrMsg}</p>}
          <h3>Large signal and system</h3>
          <div className="fields">
            <Num label="Znom" unit="Ω" value={state.nominal_ohms} onChange={(v) => set("nominal_ohms", v)} />
            <Num label="Le" unit="mH" value={state.le_mh} min={0} onChange={(v) => set("le_mh", v)} />
            <Num label="Xmax" unit="mm" value={state.xmax_mm} onChange={(v) => set("xmax_mm", v)} />
            <Num label="Pe" unit="W" value={state.pe_w} onChange={(v) => set("pe_w", v)} />
            <Num label="Drivers" value={state.drivers} onChange={(v) => set("drivers", Math.max(1, Math.round(v)))} />
          </div>
          <p className="hint">Multiple drivers are wired in parallel and share each box.</p>
        </Card>

        <Card title="High-pass filter" on={hp.on} onToggle={(on) => set("highPass", { ...hp, on })}>
          <div className="fields">
            <Select<HighPassType>
              label="Type"
              value={hp.type}
              options={[
                { value: "butterworth", text: "Butterworth" },
                { value: "linkwitz-riley", text: "Linkwitz-Riley" },
              ]}
              onChange={(type) =>
                set("highPass", { ...hp, type, order: type === "linkwitz-riley" && hp.order % 2 ? hp.order + 1 : hp.order })
              }
            />
            <Select<number>
              label="Slope"
              value={hp.order}
              options={(hp.type === "butterworth" ? [1, 2, 3, 4] : [2, 4]).map((o) => ({
                value: o,
                text: `${o * 6} dB/oct`,
              }))}
              onChange={(order) => set("highPass", { ...hp, order })}
            />
            <Num label="Freq" unit="Hz" value={hp.freq} onChange={(freq) => set("highPass", { ...hp, freq })} />
          </div>
          <p className="hint">A subsonic filter protects ported and PR boxes from over-excursion below tuning.</p>
        </Card>

        <EqPanel state={state} designs={designs} onChange={(eq) => set("eq", eq)} />

        {state.designs.map((d) => (
          <DesignCard
            key={d.id}
            design={d}
            color={colorOf(state, d.id)}
            vb_l={vbOf(state, d)}
            linked={state.volume.link === d.id}
            canDelete={state.designs.length > 1}
            db={db}
            air={airOf(state)}
            align={alignmentDriver(solved)}
            drivers={state.drivers}
            portCtx={portContext(state, designs, d.id)}
            onChange={updateDesign}
            onDuplicate={() => duplicateDesign(d)}
            onDelete={() => deleteDesign(d)}
            onPrDisplacement={(l) => setState((s) => ({ ...s, volume: { ...s.volume, prDisp_l: l } }))}
          />
        ))}
        <AddDesign disabled={state.designs.length >= MAX_DESIGNS} onAdd={addDesign} />

        <VolumePanel state={state} onChange={(v) => set("volume", v)} />

        <Card title="Settings">
          <div className="fields">
            <Select<"metric" | "imperial">
              label="Units"
              value={state.settings.units}
              options={[
                { value: "metric", text: "Metric (L, cm)" },
                { value: "imperial", text: "Imperial (ft³, in)" },
              ]}
              onChange={(units) => set("settings", { ...state.settings, units })}
            />
            <Select<"standard" | "winisd">
              label="Air"
              value={state.settings.air}
              options={[
                { value: "standard", text: "Standard (20 °C, ρ 1.204, c 343.2)" },
                { value: "winisd", text: "WinISD defaults (ρ 1.201, c 343.7)" },
              ]}
              onChange={(air) => set("settings", { ...state.settings, air })}
            />
            <Select<"peak" | "rms">
              label="Port speed"
              value={state.settings.velocity}
              options={[
                { value: "peak", text: "Peak" },
                { value: "rms", text: "RMS" },
              ]}
              onChange={(velocity) => set("settings", { ...state.settings, velocity })}
            />
          </div>
          <p className="hint">
            For like-for-like checks against WinISD, choose its air values. The {PORT_LIMIT} m/s chuffing line applies to
            whichever port-speed convention you pick.
          </p>
        </Card>
      </aside>

      <main className="charts">
        <Summary designs={designs} state={state} missing={solved.missing.length > 0} />

        {designs.length > 0 && (
          <>
            <LogChart
              title={`SPL at ${state.power} W, 1 m, half space${hp.on ? `, with ${hp.order * 6} dB/oct high-pass at ${hp.freq} Hz` : ""}`}
              unit="dB"
              freq={freq}
              series={series((r) => r.spl)}
            />
            <LogChart
              title="Cone excursion (peak, one way)"
              unit="mm"
              freq={freq}
              series={series((r) => r.excursionMm)}
              limits={[{ value: state.xmax_mm, label: `Xmax ${state.xmax_mm} mm`, color: LIMIT_RED }]}
              yMin={0}
            />
            {prDesigns.length > 0 && (
              <LogChart
                title="Passive radiator excursion (peak, one way)"
                unit="mm"
                freq={freq}
                series={series((r) => r.prExcursionMm).filter((s) => s.y)}
                limits={prLimits}
                yMin={0}
              />
            )}
            {designs.some((d) => d.design.kind === "vented") && (
              <LogChart
                title={`Port air velocity (${state.settings.velocity === "rms" ? "RMS" : "peak"})`}
                unit="m/s"
                freq={freq}
                series={series((r) => r.portVelocity).filter((s) => s.y)}
                limits={[{ value: PORT_LIMIT, label: `Chuffing risk ${PORT_LIMIT} m/s`, color: LIMIT_RED }]}
                yMin={0}
              />
            )}
            <LogChart title="Maximum SPL (first limit reached)" unit="dB" freq={freq} series={series((r) => r.maxSpl)} />
            <LogChart title="Impedance" unit="Ω" freq={freq} series={series((r) => r.impedanceOhm)} yMin={0} />
            <LogChart
              title="Group delay"
              unit="ms"
              freq={freq}
              series={series((r) => r.groupDelayMs)}
              yMin={-20}
              yMax={100}
            />
          </>
        )}

        <footer className="muted">
          Small-signal lumped model: no voice-coil or port compression, no Bl/Cms non-linearity. Losses Ql 10, Qa 100,
          Qp 100. Free for non-commercial use · <a href={`${REPO}/blob/main/LICENSE`}>Licence</a>
        </footer>
      </main>
    </div>
    </UnitsContext.Provider>
  );
}

/** What the port checks need to know about a design: its simulated peak port speed and the box it sits in. */
function portContext(state: AppState, designs: Design[], id: string) {
  const r = designs.find((x) => x.design.id === id)?.result;
  const fMin = state.highPass.on ? 10 : 15;
  let peak: number | null = null;
  if (r?.portVelocity) {
    peak = 0;
    for (let i = 0; i < r.freq.length; i++) if (r.freq[i]! >= fMin && r.portVelocity[i]! > peak) peak = r.portVelocity[i]!;
  }
  const v = state.volume;
  let internalMax_cm: number | null = null;
  if (v.link === id) {
    const t = v.wall_mm / 5; // both walls, in cm
    internalMax_cm =
      v.shape === "box" || v.shape === "frustum"
        ? Math.max(v.width_cm, v.height_cm, v.depth_cm) - t
        : v.shape === "cylinder"
          ? Math.max(v.diameter_cm, v.height_cm) - t
          : v.diameter_cm - t;
  }
  return { portVelocity: peak, internalMax_cm };
}

function Summary({ designs, state, missing }: { designs: Design[]; state: AppState; missing: boolean }) {
  const fmt = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "–" : v.toFixed(digits));
  const peak = (a: Float64Array | null, freq: Float64Array, fMin: number) => {
    if (!a) return null;
    let m = 0;
    for (let i = 0; i < a.length; i++) if (freq[i]! >= fMin && a[i]! > m) m = a[i]!;
    return m;
  };
  if (missing) return <p className="warn summary">Enter the driver's parameters to see the simulation.</p>;
  if (designs.length === 0) return <p className="muted summary">Turn on at least one enclosure.</p>;
  // Without a high-pass filter, ignore the subsonic region where excursion runs away.
  const fMin = state.highPass.on ? 10 : 15;
  return (
    <div className="summary">
      <table>
        <thead>
          <tr>
            <th />
            <th>Vb</th>
            <th>F3</th>
            <th>Fb / Fc</th>
            <th>Qtc</th>
            <th>Peak cone</th>
            <th>Peak PR</th>
            <th>Peak port</th>
          </tr>
        </thead>
        <tbody>
          {designs.map(({ design: d, color, vb_l, result: r }) => {
            const x = peak(r.excursionMm, r.freq, fMin);
            const xpr = peak(r.prExcursionMm, r.freq, fMin);
            const vp = peak(r.portVelocity, r.freq, fMin);
            return (
              <tr key={d.id}>
                <th style={{ color }}>{d.name}</th>
                <td>{fmtQ(vb_l, "vol", state.settings.units)}</td>
                <td>{fmt(r.summary.f3)} Hz</td>
                <td>{fmt(r.summary.fb ?? r.summary.fc)} Hz</td>
                <td>{fmt(r.summary.qtc, 2)}</td>
                <td className={x !== null && x > state.xmax_mm ? "over" : ""}>{fmt(x)} mm</td>
                <td className={xpr !== null && d.kind === "pr" && xpr > d.params.xmax_mm ? "over" : ""}>
                  {xpr === null ? "–" : `${fmt(xpr)} mm`}
                </td>
                <td className={vp !== null && vp > PORT_LIMIT ? "over" : ""}>{vp === null ? "–" : `${fmt(vp)} m/s`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">
        Peaks are taken above {fMin} Hz{state.highPass.on ? "" : " (turn on the high-pass filter to model a subsonic filter)"}.
        Red means over the limit.
      </p>
    </div>
  );
}
