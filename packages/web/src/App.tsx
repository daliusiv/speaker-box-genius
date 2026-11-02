import { useEffect, useMemo, useState, type ReactNode } from "react";
import { simulate, type DriverInput, type EnclosureInput, type SimulationResult } from "@sbg/engine";
import { LogChart, type Series } from "./LogChart.tsx";
import { DEFAULT_STATE, decodeState, encodeState, type AppState } from "./state.ts";
import { loadDriver, loadIndex, loadPassiveRadiator, type DbIndex } from "./library.ts";

const REPO = "https://github.com/daliusiv/speaker-box-genius";
const COLORS = { sealed: "#3b82f6", vented: "#f97316", pr: "#22c55e" } as const;
const LIMIT_RED = "#dc2626";
const PORT_LIMIT = 17;

interface Design {
  key: keyof typeof COLORS;
  label: string;
  result: SimulationResult;
}

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

  const designs = useMemo(() => runDesigns(state), [state]);
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

  const d = state.driver;
  const pr = state.pr;

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
              loadDriver(id, state.driver).then(
                ({ name, driver }) => setState((s) => ({ ...s, driverName: name, driver })),
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
          <div className="fields">
            <Num label="Fs" unit="Hz" value={d.fs} onChange={(v) => set("driver", { ...d, fs: v })} />
            <Num label="Qms" value={d.qms} onChange={(v) => set("driver", { ...d, qms: v })} />
            <Num label="Qes" value={d.qes} onChange={(v) => set("driver", { ...d, qes: v })} />
            <Num label="Vas" unit="L" value={d.vas_l} onChange={(v) => set("driver", { ...d, vas_l: v })} />
            <Num label="Re" unit="Ω" value={d.re} onChange={(v) => set("driver", { ...d, re: v })} />
            <Num label="Le" unit="mH" value={d.le_mh} min={0} onChange={(v) => set("driver", { ...d, le_mh: v })} />
            <Num label="Sd" unit="cm²" value={d.sd_cm2} onChange={(v) => set("driver", { ...d, sd_cm2: v })} />
            <Num label="Xmax" unit="mm" value={d.xmax_mm} onChange={(v) => set("driver", { ...d, xmax_mm: v })} />
            <Num label="Pe" unit="W" value={d.pe_w} onChange={(v) => set("driver", { ...d, pe_w: v })} />
            <Num label="Qty" value={state.drivers} step={1} onChange={(v) => set("drivers", Math.max(1, Math.round(v)))} />
          </div>
          <p className="hint">Multiple drivers are wired in parallel and share each box.</p>
        </Card>

        <Card title="Sealed" color={COLORS.sealed} on={state.sealed.on} onToggle={(on) => set("sealed", { ...state.sealed, on })}>
          <div className="fields">
            <Num label="Vb" unit="L" value={state.sealed.vb_l} onChange={(v) => set("sealed", { ...state.sealed, vb_l: v })} />
          </div>
        </Card>

        <Card title="Ported" color={COLORS.vented} on={state.vented.on} onToggle={(on) => set("vented", { ...state.vented, on })}>
          <div className="fields">
            <Num label="Vb" unit="L" value={state.vented.vb_l} onChange={(v) => set("vented", { ...state.vented, vb_l: v })} />
            <Num label="Port Ø" unit="cm" value={state.vented.diameter_cm} onChange={(v) => set("vented", { ...state.vented, diameter_cm: v })} />
            <Num label="Length" unit="cm" value={state.vented.length_cm} min={0} onChange={(v) => set("vented", { ...state.vented, length_cm: v })} />
            <Num label="Ports" value={state.vented.count} step={1} onChange={(v) => set("vented", { ...state.vented, count: Math.max(1, Math.round(v)) })} />
          </div>
        </Card>

        <Card title="Passive radiators" color={COLORS.pr} on={pr.on} onToggle={(on) => set("pr", { ...pr, on })}>
          <LibraryPicker
            label="Load a passive radiator from the database"
            items={db?.passiveRadiators.map((x) => ({ id: x.id, text: `${x.brand} ${x.model} (${x.size_in ?? "?"}")` }))}
            onPick={(id) =>
              loadPassiveRadiator(id).then(
                ({ name, params }) => setState((s) => ({ ...s, pr: { ...s.pr, name, params } })),
                () => alert("Couldn't load that passive radiator."),
              )
            }
          />
          <p className="pr-name">{pr.name}</p>
          <div className="fields">
            <Num label="Vb" unit="L" value={pr.vb_l} onChange={(v) => set("pr", { ...pr, vb_l: v })} />
            <Num label="PRs" value={pr.count} step={1} onChange={(v) => set("pr", { ...pr, count: Math.max(1, Math.round(v)) })} />
            <Num label="Added mass" unit="g" value={pr.addedMass_g} min={0} onChange={(v) => set("pr", { ...pr, addedMass_g: v })} />
            <Num label="PR Mms" unit="g" value={pr.params.mms_g} onChange={(v) => set("pr", { ...pr, params: { ...pr.params, mms_g: v } })} />
            <Num label="PR Vas" unit="L" value={pr.params.vas_l} onChange={(v) => set("pr", { ...pr, params: { ...pr.params, vas_l: v } })} />
            <Num label="PR Qms" value={pr.params.qms} onChange={(v) => set("pr", { ...pr, params: { ...pr.params, qms: v } })} />
            <Num label="PR Sd" unit="cm²" value={pr.params.sd_cm2} onChange={(v) => set("pr", { ...pr, params: { ...pr.params, sd_cm2: v } })} />
            <Num label="PR Xmax" unit="mm" value={pr.params.xmax_mm} onChange={(v) => set("pr", { ...pr, params: { ...pr.params, xmax_mm: v } })} />
          </div>
        </Card>
      </aside>

      <main className="charts">
        <Summary designs={designs} state={state} />

        <LogChart title={`SPL at ${state.power} W, 1 m, half space`} unit="dB" freq={freq} series={series((r) => r.spl)} />
        <LogChart
          title="Cone excursion (peak, one way)"
          unit="mm"
          freq={freq}
          series={series((r) => r.excursionMm)}
          limits={[{ value: d.xmax_mm, label: `Xmax ${d.xmax_mm} mm`, color: LIMIT_RED }]}
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

        <footer className="muted">
          Small-signal lumped model: no voice-coil or port compression, no Bl/Cms non-linearity. Losses Ql 10, Qa 100,
          Qp 100. Free for non-commercial use · <a href={`${REPO}/blob/main/LICENSE`}>Licence</a>
        </footer>
      </main>
    </div>
  );
}

function runDesigns(s: AppState): Design[] {
  const driver: DriverInput = { ...s.driver };
  const opts = { power: s.power, drivers: s.drivers, fMin: 10, fMax: 500, points: 300 };
  const boxes: [Design["key"], string, boolean, EnclosureInput][] = [
    ["sealed", "Sealed", s.sealed.on, { kind: "sealed", vb_l: s.sealed.vb_l }],
    [
      "vented",
      "Ported",
      s.vented.on,
      {
        kind: "vented",
        vb_l: s.vented.vb_l,
        port: { shape: "round", diameter_cm: s.vented.diameter_cm, length_cm: s.vented.length_cm },
        portCount: s.vented.count,
      },
    ],
    [
      "pr",
      "PR",
      s.pr.on,
      { kind: "passive-radiator", vb_l: s.pr.vb_l, pr: s.pr.params, prCount: s.pr.count, addedMass_g: s.pr.addedMass_g },
    ],
  ];
  const out: Design[] = [];
  for (const [key, label, on, box] of boxes) {
    if (!on) continue;
    try {
      out.push({ key, label, result: simulate(driver, box, opts) });
    } catch {
      // Invalid input mid-edit: skip this design until the numbers make sense again.
    }
  }
  return out;
}

function Summary({ designs, state }: { designs: Design[]; state: AppState }) {
  const fmt = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "–" : v.toFixed(digits));
  const peak = (a: Float64Array | null, fMin = 0, freq?: Float64Array) => {
    if (!a) return null;
    let m = 0;
    for (let i = 0; i < a.length; i++) if ((!freq || freq[i]! >= fMin) && a[i]! > m) m = a[i]!;
    return m;
  };
  if (designs.length === 0) return <p className="muted">Turn on at least one enclosure.</p>;
  return (
    <div className="summary">
      <table>
        <thead>
          <tr>
            <th />
            <th>F3</th>
            <th>Fb / Fc</th>
            <th>Qtc</th>
            <th>Peak cone</th>
            <th>Peak PR</th>
            <th>Peak port</th>
          </tr>
        </thead>
        <tbody>
          {designs.map(({ key, label, result: r }) => {
            const x = peak(r.excursionMm, 15, r.freq);
            const xpr = peak(r.prExcursionMm, 15, r.freq);
            const vp = peak(r.portVelocity, 15, r.freq);
            return (
              <tr key={key}>
                <th style={{ color: COLORS[key] }}>{label}</th>
                <td>{fmt(r.summary.f3)} Hz</td>
                <td>{fmt(r.summary.fb ?? r.summary.fc)} Hz</td>
                <td>{fmt(r.summary.qtc, 2)}</td>
                <td className={x !== null && x > state.driver.xmax_mm ? "over" : ""}>{fmt(x)} mm</td>
                <td className={xpr !== null && xpr > state.pr.params.xmax_mm ? "over" : ""}>
                  {xpr === null ? "–" : `${fmt(xpr)} mm`}
                </td>
                <td className={vp !== null && vp > PORT_LIMIT ? "over" : ""}>{vp === null ? "–" : `${fmt(vp)} m/s`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">Peaks are taken above 15 Hz (assumes a subsonic filter). Red means over the limit.</p>
    </div>
  );
}

function LibraryPicker(props: { label: string; items: { id: string; text: string }[] | undefined; onPick: (id: string) => void }) {
  if (!props.items || props.items.length === 0) return null;
  return (
    <div className="picker">
      <select
        aria-label={props.label}
        value=""
        onChange={(e) => {
          const id = e.currentTarget.value;
          if (id) props.onPick(id);
        }}
      >
        <option value="">{props.label}…</option>
        {props.items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.text}
          </option>
        ))}
      </select>
      <a href={`${REPO}/blob/main/CONTRIBUTING.md`} title="Add a driver or passive radiator to the database">
        Missing one?
      </a>
    </div>
  );
}

function Card(props: {
  title: string;
  color?: string;
  on?: boolean;
  onToggle?: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className={`card${props.on === false ? " off" : ""}`}>
      <h2>
        {props.color && <span className="swatch" style={{ background: props.color }} />}
        {props.title}
        {props.onToggle && (
          <input
            type="checkbox"
            checked={props.on}
            onChange={(e) => props.onToggle!(e.currentTarget.checked)}
            aria-label={`Show ${props.title}`}
          />
        )}
      </h2>
      {props.on !== false && props.children}
    </section>
  );
}

/** Number input that lets you type freely and only commits valid positive values. */
function Num(props: {
  label: string;
  unit?: string;
  value: number;
  step?: number;
  min?: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(props.value));
  useEffect(() => {
    if (Number(text) !== props.value) setText(String(props.value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);
  const min = props.min ?? Number.MIN_VALUE;
  return (
    <label>
      <span>{props.label}</span>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const t = e.currentTarget.value;
          setText(t);
          const v = Number(t.replace(",", "."));
          if (t.trim() !== "" && Number.isFinite(v) && v >= min) props.onChange(v);
        }}
      />
      {props.unit && <span className="unit">{props.unit}</span>}
    </label>
  );
}
