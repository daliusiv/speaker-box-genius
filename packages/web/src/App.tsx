import { useEffect, useMemo, useRef, useState } from "react";
import {
  impedanceMagnitude,
  parseWdr,
  parseWpr,
  resampleMagnitude,
  writeWdr,
  type HighPassType,
  type SimulationResult,
} from "@sbg/engine";
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
import { MeasurePanel, type Measurement } from "./Measure.tsx";
import { fmtQ, UnitsContext } from "./units.ts";
import { ProjectsMenu } from "./Projects.tsx";
import { submitDriverUrl } from "./submit.ts";

const LIMIT_RED = "#dc2626";

export function App() {
  const [state, setState] = useState<AppState>(() => decodeState(location.hash) ?? DEFAULT_STATE);
  const [db, setDb] = useState<DbIndex | null>(null);
  const [wdrMsg, setWdrMsg] = useState("");
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
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
      if (/^\[Box\]/im.test(text)) return importWpr(file.name, text);
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

  /** A WinISD project: driver, settings that affect the result, and the box as a new design. */
  const importWpr = (fileName: string, text: string) => {
    try {
      const p = parseWpr(text);
      const d = p.driver;
      const label = [d.brand, d.model].filter(Boolean).join(" ") || fileName.replace(/\.wpr$/i, "");
      setState((s) => {
        let design: DesignState | null = null;
        if (p.box.type === "vented" && p.port) {
          const v = newDesign("vented", s.designs);
          if (v.kind === "vented") {
            design = {
              ...v,
              name: `WinISD: ${fileName.replace(/\.wpr$/i, "")}`,
              vb_l: Number(p.box.vb_l.toFixed(3)),
              shape: "round",
              diameter_cm: Number(p.port.diameter_cm.toFixed(3)),
              length_cm: Number(p.port.length_cm.toFixed(3)),
              count: p.port.count,
              targetFb: Number((p.box.fb ?? v.targetFb).toFixed(2)),
            };
          }
        } else if (p.box.type === "passive-radiator" && p.pr) {
          const pd = newDesign("pr", s.designs);
          if (pd.kind === "pr") {
            const x = p.pr.params;
            design = {
              ...pd,
              name: `WinISD: ${fileName.replace(/\.wpr$/i, "")}`,
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
        } else if (p.box.vb_l > 0) {
          const sd = newDesign("sealed", s.designs);
          design = { ...sd, name: `WinISD: ${fileName.replace(/\.wpr$/i, "")}`, vb_l: Number(p.box.vb_l.toFixed(3)) };
        }
        const designs = design && s.designs.length < MAX_DESIGNS ? [...s.designs, design] : s.designs;
        return {
          ...s,
          driverName: label,
          driverBrand: d.brand,
          nominal_ohms: d.nominal_ohms ?? s.nominal_ohms,
          ts: d.ts,
          le_mh: d.le_mh ?? 0,
          xmax_mm: d.xmax_mm ?? s.xmax_mm,
          pe_w: d.pe_w ?? s.pe_w,
          power: Number(p.power.toFixed(2)),
          drivers: p.drivers,
          // WinISD's Rg is per driver; our setting is the shared amplifier output.
          settings: {
            ...s.settings,
            air: "winisd",
            rg: Number((p.rg / p.drivers).toPrecision(6)),
            inductance: p.simulateLe,
            losses: { ql: p.box.ql, qa: p.box.qa, qp: p.box.qp },
          },
          highPass: p.highPass ? { on: true, ...p.highPass } : { ...s.highPass, on: false },
          designs,
          volume: d.displacement_l !== undefined ? { ...s.volume, driverDisp_l: Math.round(d.displacement_l * 100) / 100 } : s.volume,
        };
      });
      const lossNote =
        p.box.ql !== 10 || p.box.qa !== 100 || p.box.qp !== 100
          ? ` Box losses set to the project's Ql ${p.box.ql}, Qa ${p.box.qa}, Qp ${p.box.qp}.`
          : "";
      const boxNote = p.box.type === "other" ? " This box type isn't supported yet, so only the driver was imported." : "";
      const driversNote =
        p.drivers > 1
          ? ` ${p.drivers} drivers in parallel; WinISD's Rg of ${p.rg} Ω per driver becomes ${Number((p.rg / p.drivers).toPrecision(6))} Ω shared. WinISD's impedance graph shows one driver, ours shows what the amplifier sees.`
          : "";
      const isoNote = p.isobaric ? " The project uses isobaric loading, which isn't supported yet; it was imported as standard." : "";
      const filterNote = p.highPass
        ? ` High-pass filter imported (Butterworth, order ${p.highPass.order}, ${p.highPass.freq} Hz).`
        : "";
      const unsupportedNote =
        p.unsupportedFilters > 0
          ? ` ${p.unsupportedFilters} filter${p.unsupportedFilters > 1 ? "s" : ""} in the project ${p.unsupportedFilters > 1 ? "were" : "was"} not imported; add ${p.unsupportedFilters > 1 ? "them" : "it"} by hand.`
          : "";
      setWdrMsg(`Imported WinISD project ${fileName} with its power, amplifier resistance and air settings.${filterNote}${unsupportedNote}${driversNote}${isoNote}${boxNote}${lossNote}`);
    } catch (e) {
      setWdrMsg(`Couldn't read ${fileName}: ${(e as Error).message}`);
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
          <ProjectsMenu state={state} onOpen={(s) => setState(s)} />
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
              Import WinISD .wdr / .wpr
            </button>
            <button className="secondary" onClick={exportWdr}>
              Export .wdr
            </button>
            <a
              className="button-link secondary"
              href={submitDriverUrl(state)}
              target="_blank"
              rel="noopener"
              title="Opens a pre-filled GitHub form; you add the datasheet link"
            >
              Submit to database
            </a>
            <input
              ref={wdrInput}
              type="file"
              accept=".wdr,.wpr,.txt"
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

        <MeasurePanel
          measurement={measurement}
          onMeasurement={setMeasurement}
          sd_cm2={solved.values.sd_cm2}
          onUse={(ts, le_mh) =>
            setState((s) => {
              // Keep Vas / Sd the user had, unless the measurement provides them; drop values it supersedes.
              const keep: typeof s.ts = {};
              if (s.ts.vas_l !== undefined && ts.mms_g === undefined) keep.vas_l = s.ts.vas_l;
              if (s.ts.mms_g !== undefined && s.ts.vas_l === undefined && ts.mms_g === undefined) keep.mms_g = s.ts.mms_g;
              return {
                ...s,
                driverName: s.driverName.endsWith("(measured)") ? s.driverName : `${s.driverName} (measured)`,
                ts: { ...keep, ...ts },
                le_mh,
              };
            })
          }
        />

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
            <Num
              label="Amp + cable"
              unit="Ω"
              value={state.settings.rg}
              min={0}
              onChange={(rg) => set("settings", { ...state.settings, rg })}
            />
            <Select<"yes" | "no">
              label="Include Le"
              value={state.settings.inductance ? "yes" : "no"}
              options={[
                { value: "yes", text: "Yes (more realistic above ~100 Hz)" },
                { value: "no", text: "No (WinISD's default)" },
              ]}
              onChange={(x) => set("settings", { ...state.settings, inductance: x === "yes" })}
            />
            <Num
              label="Leakage Ql"
              value={state.settings.losses.ql}
              min={1}
              onChange={(ql) => set("settings", { ...state.settings, losses: { ...state.settings.losses, ql } })}
            />
            <Num
              label="Absorption Qa"
              value={state.settings.losses.qa}
              min={1}
              onChange={(qa) => set("settings", { ...state.settings, losses: { ...state.settings.losses, qa } })}
            />
            <Num
              label="Port loss Qp"
              value={state.settings.losses.qp}
              min={1}
              onChange={(qp) => set("settings", { ...state.settings, losses: { ...state.settings.losses, qp } })}
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
            Box losses are Q values at the tuning frequency: lower means more loss. 10 / 100 / 100 matches WinISD's
            defaults. For like-for-like checks against WinISD,
            choose its air values, its amplifier resistance (Signal tab, Rg) and leave out Le, or simply import the
            WinISD project (.wpr). The {PORT_LIMIT} m/s chuffing line applies to
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
            {designs.some((d) => d.design.kind === "vented" || d.design.kind === "bandpass") && (
              <LogChart
                title={`Port air velocity (${state.settings.velocity === "rms" ? "RMS" : "peak"})`}
                unit="m/s"
                freq={freq}
                series={[
                  ...designs.map((d) => ({
                    label: d.design.kind === "bandpass" ? `${d.design.name} (front port)` : d.design.name,
                    color: d.color,
                    y: d.result.portVelocity,
                  })),
                  ...designs.map((d) => ({
                    label: `${d.design.name} (rear port)`,
                    color: d.color,
                    dash: "5 3",
                    y: d.result.rearPortVelocity,
                  })),
                ].filter((s) => s.y)}
                limits={[{ value: PORT_LIMIT, label: `Chuffing risk ${PORT_LIMIT} m/s`, color: LIMIT_RED }]}
                yMin={0}
              />
            )}
            <LogChart title="Maximum SPL (first limit reached)" unit="dB" freq={freq} series={series((r) => r.maxSpl)} />
            <LogChart
              title="Impedance"
              unit="Ω"
              freq={freq}
              series={[
                ...series((r) => r.impedanceOhm),
                ...(measurement
                  ? [
                      { label: "Measured (free air)", color: "#78716c", dash: "6 4", y: resampleMagnitude(measurement.data, freq) },
                      {
                        label: "Fit (free air)",
                        color: "#a8a29e",
                        dash: "2 3",
                        y: freq.map((f) => impedanceMagnitude(measurement.fit, f)),
                      },
                    ]
                  : []),
              ]}
              yMin={0}
            />
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
          Small-signal lumped model: no voice-coil or port compression, no Bl/Cms non-linearity. Box losses Ql{" "}
          {state.settings.losses.ql}, Qa {state.settings.losses.qa}, Qp {state.settings.losses.qp}. Free for non-commercial use · <a href={`${REPO}/blob/main/LICENSE`}>Licence</a>
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
  const peakOf = (a: Float64Array | null | undefined) => {
    if (!r || !a) return null;
    let m = 0;
    for (let i = 0; i < r.freq.length; i++) if (r.freq[i]! >= fMin && a[i]! > m) m = a[i]!;
    return m;
  };
  const peak = peakOf(r?.portVelocity);
  const rearPeak = peakOf(r?.rearPortVelocity);
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
  return { portVelocity: peak, rearPortVelocity: rearPeak, internalMax_cm };
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
            const vpFront = peak(r.portVelocity, r.freq, fMin);
            const vpRear = peak(r.rearPortVelocity, r.freq, fMin);
            const vp = vpFront === null ? vpRear : Math.max(vpFront, vpRear ?? 0);
            return (
              <tr key={d.id}>
                <th style={{ color }}>{d.name}</th>
                <td>
                  {fmtQ(vb_l, "vol", state.settings.units)}
                  {d.kind === "bandpass" && ` + ${fmtQ(d.frontVb_l, "vol", state.settings.units)}`}
                </td>
                <td>
                  {fmt(r.summary.f3)}
                  {r.summary.f3High !== undefined && `–${fmt(r.summary.f3High)}`} Hz
                </td>
                <td>
                  {d.kind === "bandpass"
                    ? `${fmt(r.summary.fbRear ?? r.summary.fc)} / ${fmt(r.summary.fb)}`
                    : fmt(r.summary.fb ?? r.summary.fc)}{" "}
                  Hz
                </td>
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
