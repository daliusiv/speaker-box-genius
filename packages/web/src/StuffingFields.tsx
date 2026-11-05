import { useState } from "react";
import { ventedFb, type Air } from "@sbg/engine";
import { Fixed, Num, Select } from "./components.tsx";
import { readMeasured } from "./Measured.tsx";
import { fitStuffing, type StuffingFit } from "./stuffingFit.ts";
import { prTuning } from "./presets.ts";
import { portOf } from "./sim.ts";
import { MAX_MEASURED, type AppState, type DesignState, type MeasuredCurve } from "./state.ts";
import {
  BEST_MAX_GL,
  fillGrams,
  roundGrams,
  stuffingEffect,
  suggestedGl,
  type StuffableKind,
  type Stuffing,
  type StuffingMode,
} from "./stuffing.ts";
import { useUnits } from "./units.ts";

const GUIDE = "/guides/box-stuffing/";

/** What fitting to a measurement needs from the app: the whole state, and a way to add a sweep and show it. */
export interface StuffingFitContext {
  state: AppState;
  onMeasured: (m: MeasuredCurve[]) => void;
  onShowImpedance: () => void;
  /** Undo the last change (the app's undo). */
  onUndo: () => void;
}

const MODES: { value: StuffingMode; text: string }[] = [
  { value: "none", text: "None (empty box)" },
  { value: "lined", text: "Lined walls" },
  { value: "fill", text: "Filled with fibre" },
  { value: "custom", text: "Custom (measured)" },
];

/**
 * A design's stuffing: none, lined walls, a fibre fill by weight, or the user's own volume
 * gain and Qa. Shows what it does (the volume it acts as, its Qa, the tuning shift for a
 * vented or PR box) and how much fibre to weigh out.
 */
export function StuffingFields(props: {
  design: DesignState & { kind: StuffableKind };
  /** Net volume as built (the calculator's when linked). */
  built_l: number;
  air: Air;
  fit?: StuffingFitContext;
  onChange: (d: DesignState) => void;
}) {
  const d = props.design;
  const st: Stuffing = d.stuffing ?? { mode: "none", gL: suggestedGl(d.kind, props.built_l), gain_pct: 20, qa: 30 };
  const set = (patch: Partial<Stuffing>) => props.onChange({ ...d, stuffing: { ...st, ...patch } } as DesignState);
  const setMode = (mode: StuffingMode) => {
    if (mode === "none") {
      const { stuffing: _drop, ...rest } = d;
      return props.onChange(rest as DesignState);
    }
    // Custom starts from what the current choice does, so switching to it changes nothing yet.
    const now = stuffingEffect(st, d.kind);
    set(mode === "custom" ? { mode, gain_pct: now.gain_pct, qa: now.qa ?? st.qa } : { mode });
  };
  const e = stuffingEffect(st, d.kind);
  const acting = props.built_l * (1 + e.gain_pct / 100);
  const grams = fillGrams(st, props.built_l);
  const ported = d.kind !== "sealed";

  // Tuning with and without the stuffing, for boxes that have one.
  let fbEmpty: number | null = null;
  let fbStuffed: number | null = null;
  try {
    if (d.kind === "vented") {
      fbEmpty = ventedFb(props.built_l, portOf(d), d.count, undefined, props.air);
      fbStuffed = ventedFb(acting, portOf(d), d.count, undefined, props.air);
    } else if (d.kind === "pr") {
      fbEmpty = prTuning(d, props.built_l, props.air).fb;
      fbStuffed = prTuning(d, acting, props.air).fb;
    }
  } catch {
    fbEmpty = fbStuffed = null;
  }
  const shift = fbEmpty !== null && fbStuffed !== null && Number.isFinite(fbEmpty) && Number.isFinite(fbStuffed) ? fbEmpty - fbStuffed : 0;

  return (
    <div className="stuffing">
      <div className="fields">
        <Select
          help="Fibre fill or lining in the box. A filled box acts bigger and adds absorption loss (a lower Qa); this design's Qa replaces the one in Settings."
          label="Stuffing"
          value={st.mode === "none" || !d.stuffing ? "none" : st.mode}
          options={MODES}
          onChange={setMode}
        />
        {d.stuffing && st.mode === "fill" && (
          <>
            <Num
              help={`Polyester fibre per litre of net volume (1 lb/ft³ = 16 g/L). Sealed: 16–24 g/L up to about 85 L, 8–16 g/L in bigger boxes. Past about ${BEST_MAX_GL} g/L the gain falls again.`}
              label="Amount"
              q="density"
              value={st.gL}
              min={0}
              onChange={(gL) => set({ gL })}
            />
            <Fixed label="Weigh out" num={grams === null ? undefined : roundGrams(grams)} q="mass" help="Fibre for this box's net volume: weigh it, then fluff it in loosely." />
          </>
        )}
        {d.stuffing && st.mode === "custom" && (
          <>
            <Num help="How much bigger the box acts than its net volume, as you measured it (negative if overstuffed). Physics caps it at +40%." label="Acts bigger" unit="%" value={st.gain_pct} onChange={(gain_pct) => set({ gain_pct: Math.min(40, Math.max(-50, gain_pct)) })} />
            <Num help="Absorption loss as a Q at the tuning: lower means more loss. Fit it to a measured impedance peak." label="Qa" value={st.qa} min={1} onChange={(qa) => set({ qa })} />
          </>
        )}
        {d.stuffing && st.mode !== "custom" && <Fixed label="Qa" value={String(e.qa ?? "–")} help="Absorption loss this stuffing gives, as a Q at the tuning (Settings' Qa is used without stuffing)." />}
        {d.stuffing && e.gain_pct !== 0 && <Fixed label="Acts as" num={acting} q="vol" help="The volume the simulation uses: the net volume made bigger (or smaller) by the stuffing." />}
      </div>
      {d.stuffing && (
        <>
          {st.mode === "fill" && st.gL > BEST_MAX_GL && (
            <p className="warn">
              Past about {BEST_MAX_GL} g/L the fibres pack together and stop working: the gain shrinks, and around 40–50 g/L a box acts smaller than empty.
            </p>
          )}
          {ported && st.mode === "fill" && (
            <p className="warn">
              Filling a {d.kind === "pr" ? "passive radiator" : "ported"} box lowers its tuning{shift > 0.05 ? ` (${fbEmpty!.toFixed(1)} → ${fbStuffed!.toFixed(1)} Hz here)` : ""} and
              softens the {d.kind === "pr" ? "radiators'" : "port's"} output. Lining the walls is the usual choice; if you fill it, measure the tuning and{" "}
              {d.kind === "pr" ? "adjust the added mass" : "recut the port"}.
            </p>
          )}
          {ported && st.mode !== "fill" && shift > 0.05 && (
            <p className="hint">
              Tuning with the stuffing: {fbStuffed!.toFixed(1)} Hz ({fbEmpty!.toFixed(1)} Hz empty).
            </p>
          )}
          <p className="hint">
            {st.mode === "lined"
              ? `Line the walls with 1–2.5 cm of fibre or mineral wool${ported ? ", keeping the " + (d.kind === "pr" ? "passive radiators" : "port and its air path") + " clear" : ""}. `
              : st.mode === "fill"
                ? "Weigh it, then pull it apart into loose tufts: fluffed, not packed. "
                : ""}
            {st.mode === "custom"
              ? "Your own values, e.g. from a measured impedance peak. "
              : "Typical values from published measurements: real stuffing varies, so measure your box to be sure. "}
            <a href={GUIDE} target="_blank" rel="noopener">
              Box stuffing guide
            </a>
          </p>
        </>
      )}
      {props.fit && <FitFromMeasurement design={d} ctx={props.fit} onUse={(f) => props.onChange({ ...d, stuffing: { ...st, mode: "custom", gain_pct: f.gain_pct, qa: f.qa } } as DesignState)} />}
    </div>
  );
}

/**
 * "Fit to a measured impedance sweep": pick (or load) a .zma of the finished box, find the
 * volume it acts as and its Qa, and offer them as Custom stuffing.
 */
function FitFromMeasurement(props: { design: DesignState & { kind: StuffableKind }; ctx: StuffingFitContext; onUse: (f: StuffingFit) => void }) {
  const { fmt } = useUnits();
  const { state, onMeasured } = props.ctx;
  const sweeps = state.measured.filter((m) => m.kind === "impedance");
  const [pick, setPick] = useState("");
  const chosen = sweeps.find((m) => m.id === pick) ?? sweeps[0];
  const [result, setResult] = useState<{ key: string; fit: StuffingFit | string } | null>(null);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState("");
  // A result belongs to one sweep and one version of the design and driver: drop it when they change.
  const key = JSON.stringify([chosen?.id, props.design, state.ts, state.drivers, state.wiring, state.isobaric, state.dvc, state.settings.losses, state.settings.air]);
  const shown = result?.key === key ? result.fit : null;

  const run = (m: MeasuredCurve | undefined, s: AppState) => {
    if (!m) return;
    setMsg("");
    setDone("");
    setResult({ key: JSON.stringify([m.id, props.design, s.ts, s.drivers, s.wiring, s.isobaric, s.dvc, s.settings.losses, s.settings.air]), fit: fitStuffing(s, props.design, m) });
  };

  const use = (f: StuffingFit) => {
    props.onUse(f);
    setDone(`Stuffing set to Custom: ${f.gain_pct >= 0 ? "+" : ""}${f.gain_pct}%, Qa ${f.qa}. The impedance chart shows the simulation over your sweep.`);
    props.ctx.onShowImpedance();
  };

  const load = async (file: File) => {
    try {
      const m = await readMeasured(file, "impedance", state.measured);
      onMeasured([...state.measured, m]);
      setPick(m.id);
      run(m, { ...state, measured: [...state.measured, m] });
    } catch (e) {
      setMsg(`${file.name}: ${(e as Error).message}.`);
    }
  };

  return (
    <details className="more stuffing-fit">
      <summary>Fit to a measured impedance sweep</summary>
      <p className="hint">
        Measure the finished box's impedance with its stuffing in (DATS, REW, ARTA…): the fit finds the volume the box acts as and its Qa, so the simulation matches
        your box. It's only as good as the driver's own T/S parameters, so measure those first.
      </p>
      <div className="row">
        {sweeps.length > 0 && (
          <Select
            label="Sweep"
            value={chosen?.id ?? ""}
            options={sweeps.map((m) => ({ value: m.id, text: m.name }))}
            onChange={(id) => setPick(id)}
          />
        )}
        {chosen && (
          <button
            type="button"
            className="icon"
            aria-label={`Remove ${chosen.name}`}
            title="Remove this sweep (from the charts too)"
            onClick={() => {
              onMeasured(state.measured.filter((m) => m.id !== chosen.id));
              setPick("");
              setResult(null);
              setDone("");
            }}
          >
            ×
          </button>
        )}
        <label className={`file-button${state.measured.length >= MAX_MEASURED ? " disabled" : ""}`}>
          + Load a sweep (.zma)
          <input
            type="file"
            accept=".zma,.txt,.csv,.dat"
            hidden
            disabled={state.measured.length >= MAX_MEASURED}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (f) void load(f);
            }}
          />
        </label>
        {sweeps.length > 0 && (
          <button type="button" className="secondary" onClick={() => run(chosen, state)}>
            Fit
          </button>
        )}
      </div>
      {msg && <p className="warn">{msg}</p>}
      {done && !shown && (
        <p className="hint">
          {done}{" "}
          <button
            type="button"
            className="link"
            onClick={() => {
              props.ctx.onUndo();
              setDone("");
            }}
          >
            Undo
          </button>
        </p>
      )}
      {typeof shown === "string" && <p className="warn">{shown}</p>}
      {shown && typeof shown === "object" && (
        <>
          <div className="fields">
            <Fixed label="Acts as" num={shown.acting_l} q="vol" help="The volume the box behaves as, from the measurement." />
            <Fixed label="Bigger by" unit="%" value={`${shown.gain_pct >= 0 ? "+" : ""}${shown.gain_pct}`} help="How much bigger than its net volume the box acts (negative: smaller)." />
            <Fixed label="Qa" value={String(shown.qa)} help="Absorption loss that matches the measured peaks." />
            <Fixed label="Match" unit="%" value={`±${shown.error_pct}`} help={`RMS difference between the fitted simulation and the measurement, ${Math.round(shown.band[0])}–${Math.round(shown.band[1])} Hz.`} />
          </div>
          {shown.warnings.map((w) => (
            <p key={w} className="warn">
              {w}
            </p>
          ))}
          <p className="hint">
            Net volume {fmt(shown.built_l, "vol")}, compared {Math.round(shown.band[0])}–{Math.round(shown.band[1])} Hz.
          </p>
          {shown.usable ? (
            <div className="row">
              <button type="button" className="secondary" onClick={() => use(shown)}>
                Use these values
              </button>
            </div>
          ) : (
            <p className="warn">
              Stuffing doesn't explain this measurement, so these values aren't applied: fix what's above first (or check it's a sweep of this box).{" "}
              <button type="button" className="link" onClick={() => use(shown)}>
                Use them anyway
              </button>
            </p>
          )}
        </>
      )}
    </details>
  );
}
