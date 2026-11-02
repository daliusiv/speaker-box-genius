import { useEffect, useMemo, useState } from "react";
import type { HighPassType, SimulationResult } from "@sbg/engine";
import { LogChart, type Series } from "./LogChart.tsx";
import { DEFAULT_STATE, decodeState, encodeState, type AppState, type DesignKey } from "./state.ts";
import { loadDriver, loadIndex, loadPassiveRadiator, type DbIndex } from "./library.ts";
import { Card, Fixed, LibraryPicker, Num, REPO, Select } from "./components.tsx";
import { TsEditor } from "./TsEditor.tsx";
import { VolumePanel } from "./VolumePanel.tsx";
import { COLORS, runDesigns, solveDriver, vbOf, type Design } from "./sim.ts";

const LIMIT_RED = "#dc2626";
const PORT_LIMIT = 17;

export function App() {
  const [state, setState] = useState<AppState>(() => decodeState(location.hash) ?? DEFAULT_STATE);
  const [copied, setCopied] = useState(false);
  const [db, setDb] = useState<DbIndex | null>(null);

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

  const solved = useMemo(() => solveDriver(state), [state.ts]); // eslint-disable-line react-hooks/exhaustive-deps
  const designs = useMemo(() => runDesigns(state, solved), [state, solved]);
  const freq = designs[0]?.result.freq ?? new Float64Array();

  const set = <K extends keyof AppState>(k: K, v: AppState[K]) => setState((s) => ({ ...s, [k]: v }));
  const series = (pick: (r: SimulationResult) => Float64Array | null): Series[] =>
    designs.map((d) => ({ label: d.label, color: COLORS[d.key], y: pick(d.result) }));

  const share = async () => {
    const url = location.origin + location.pathname + "#" + encodeState(state);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy this link:", url);
    }
  };

  const pr = state.pr;
  const hp = state.highPass;
  const linked = (k: DesignKey) => state.volume.link === k;
  const vbField = (k: DesignKey, value: number, onChange: (v: number) => void) =>
    linked(k) ? (
      <Fixed label="Vb" unit="L" value={vbOf(state, k).toFixed(1)} title="From the volume calculator" />
    ) : (
      <Num label="Vb" unit="L" value={value} onChange={onChange} />
    );

  return (
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
          <button onClick={share}>{copied ? "Link copied ✓" : "Copy share link"}</button>
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
                ts,
                le_mh: x.le_mh ?? s.le_mh,
                xmax_mm: x.xmax_mm ?? s.xmax_mm,
                pe_w: x.pe_w ?? s.pe_w,
              }))
            }
          />
          <h3>Large signal and system</h3>
          <div className="fields">
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
            <Num label="Frequency" unit="Hz" value={hp.freq} onChange={(freq) => set("highPass", { ...hp, freq })} />
          </div>
          <p className="hint">A subsonic filter protects ported and PR boxes from over-excursion below tuning.</p>
        </Card>

        <Card title="Sealed" color={COLORS.sealed} on={state.sealed.on} onToggle={(on) => set("sealed", { ...state.sealed, on })}>
          <div className="fields">{vbField("sealed", state.sealed.vb_l, (v) => set("sealed", { ...state.sealed, vb_l: v }))}</div>
        </Card>

        <Card title="Ported" color={COLORS.vented} on={state.vented.on} onToggle={(on) => set("vented", { ...state.vented, on })}>
          <div className="fields">
            {vbField("vented", state.vented.vb_l, (v) => set("vented", { ...state.vented, vb_l: v }))}
            <Num label="Port Ø" unit="cm" value={state.vented.diameter_cm} onChange={(v) => set("vented", { ...state.vented, diameter_cm: v })} />
            <Num label="Length" unit="cm" value={state.vented.length_cm} min={0} onChange={(v) => set("vented", { ...state.vented, length_cm: v })} />
            <Num label="Ports" value={state.vented.count} onChange={(v) => set("vented", { ...state.vented, count: Math.max(1, Math.round(v)) })} />
          </div>
        </Card>

        <Card title="Passive radiators" color={COLORS.pr} on={pr.on} onToggle={(on) => set("pr", { ...pr, on })}>
          <LibraryPicker
            label="Load a passive radiator from the database"
            items={db?.passiveRadiators.map((x) => ({ id: x.id, text: `${x.brand} ${x.model} (${x.size_in ?? "?"}")` }))}
            onPick={(id) =>
              loadPassiveRadiator(id).then(
                ({ name, params, displacement_l }) =>
                  setState((s) => ({
                    ...s,
                    pr: { ...s.pr, name, params },
                    volume: displacement_l !== undefined ? { ...s.volume, prDisp_l: displacement_l } : s.volume,
                  })),
                () => alert("Couldn't load that passive radiator."),
              )
            }
          />
          <p className="pr-name">{pr.name}</p>
          <div className="fields">
            {vbField("pr", pr.vb_l, (v) => set("pr", { ...pr, vb_l: v }))}
            <Num label="PRs" value={pr.count} onChange={(v) => set("pr", { ...pr, count: Math.max(1, Math.round(v)) })} />
            <Num label="Added mass" unit="g" value={pr.addedMass_g} min={0} onChange={(v) => set("pr", { ...pr, addedMass_g: v })} />
            <Num label="PR Mms" unit="g" value={pr.params.mms_g} onChange={(v) => set("pr", { ...pr, params: { ...pr.params, mms_g: v } })} />
            <Num label="PR Vas" unit="L" value={pr.params.vas_l} onChange={(v) => set("pr", { ...pr, params: { ...pr.params, vas_l: v } })} />
            <Num label="PR Qms" value={pr.params.qms} onChange={(v) => set("pr", { ...pr, params: { ...pr.params, qms: v } })} />
            <Num label="PR Sd" unit="cm²" value={pr.params.sd_cm2} onChange={(v) => set("pr", { ...pr, params: { ...pr.params, sd_cm2: v } })} />
            <Num label="PR Xmax" unit="mm" value={pr.params.xmax_mm} onChange={(v) => set("pr", { ...pr, params: { ...pr.params, xmax_mm: v } })} />
          </div>
        </Card>

        <VolumePanel state={state} onChange={(v) => set("volume", v)} />
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
            {pr.on && (
              <LogChart
                title="Passive radiator excursion (peak, one way)"
                unit="mm"
                freq={freq}
                series={series((r) => r.prExcursionMm)}
                limits={[{ value: pr.params.xmax_mm, label: `PR Xmax ${pr.params.xmax_mm} mm`, color: LIMIT_RED }]}
                yMin={0}
              />
            )}
            {state.vented.on && (
              <LogChart
                title="Port air velocity (peak)"
                unit="m/s"
                freq={freq}
                series={series((r) => r.portVelocity)}
                limits={[{ value: PORT_LIMIT, label: `Chuffing risk ${PORT_LIMIT} m/s`, color: LIMIT_RED }]}
                yMin={0}
              />
            )}
            <LogChart title="Maximum SPL (first limit reached)" unit="dB" freq={freq} series={series((r) => r.maxSpl)} />
            <LogChart title="Impedance" unit="Ω" freq={freq} series={series((r) => r.impedanceOhm)} yMin={0} />
            <LogChart title="Group delay" unit="ms" freq={freq} series={series((r) => r.groupDelayMs)} />
          </>
        )}

        <footer className="muted">
          Small-signal lumped model: no voice-coil or port compression, no Bl/Cms non-linearity. Losses Ql 10, Qa 100,
          Qp 100. Free for non-commercial use · <a href={`${REPO}/blob/main/LICENSE`}>Licence</a>
        </footer>
      </main>
    </div>
  );
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
          {designs.map(({ key, label, vb_l, result: r }) => {
            const x = peak(r.excursionMm, r.freq, fMin);
            const xpr = peak(r.prExcursionMm, r.freq, fMin);
            const vp = peak(r.portVelocity, r.freq, fMin);
            return (
              <tr key={key}>
                <th style={{ color: COLORS[key] }}>{label}</th>
                <td>{fmt(vb_l)} L</td>
                <td>{fmt(r.summary.f3)} Hz</td>
                <td>{fmt(r.summary.fb ?? r.summary.fc)} Hz</td>
                <td>{fmt(r.summary.qtc, 2)}</td>
                <td className={x !== null && x > state.xmax_mm ? "over" : ""}>{fmt(x)} mm</td>
                <td className={xpr !== null && xpr > state.pr.params.xmax_mm ? "over" : ""}>
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
