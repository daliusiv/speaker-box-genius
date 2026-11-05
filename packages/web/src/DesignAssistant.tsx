import { useEffect, useMemo, useRef, useState } from "react";
import { Num, Select } from "./components.tsx";
import {
  CURVE_FREQS,
  PRIORITIES,
  USES,
  evaluateDriver,
  goalFor,
  prefilter,
  rankResults,
  type AssistantBox,
  type AssistantGoal,
  type AssistantPriority,
  type AssistantResult,
  type AssistantUse,
} from "./assistant.ts";
import { loadDriver, type DbIndex, type LoadedDriver } from "./library.ts";
import type { AppState } from "./state.ts";
import { useUnits } from "./units.ts";
import { Logo, UseIcon } from "./Logo.tsx";

const KEY = "sbg.assistant";
const STEPS = ["What for", "Limits", "Priority", "Results"] as const;
const SIZES = [4, 5, 5.25, 6.5, 8, 10, 12, 15, 18, 21];
const PAGE = 20;

function readGoal(): AssistantGoal | null {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return g && g.use in USES ? { ...goalFor(g.use), ...g } : null;
  } catch {
    return null;
  }
}

function saveGoal(g: AssistantGoal) {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    // not remembered
  }
}

const LIMIT_TEXT: Record<AssistantResult["limitedBy"], string> = {
  power: "your amplifier's power",
  thermal: "the driver's power rating",
  xmax: "cone travel (Xmax)",
  port: "port air speed",
  "pr-xmax": "PR travel",
  none: "—",
};

/** "2 drivers in series, coils in parallel: 4 Ω." or just "4 Ω." */
function wiringText(r: AssistantResult, drivers: number): string {
  const parts = [drivers > 1 ? `2 drivers in ${r.wiring}` : "", r.dvcWired ? `coils in ${r.dvcWired}` : ""].filter(Boolean);
  const text = parts.length ? `${parts.join(", ")}: ${r.load_ohm} Ω. ` : `${r.load_ohm} Ω load. `;
  return text[0]!.toUpperCase() + text.slice(1);
}

/** A small sketch of the relative response, 10–300 Hz, with the −3 dB line. */
function Sketch({ curve }: { curve: number[] }) {
  const W = 120;
  const H = 40;
  const lo = -24;
  const hi = 6;
  const y = (v: number) => (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * H;
  const x = (i: number) => (i / (CURVE_FREQS.length - 1)) * W;
  const d = curve.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="assist-sketch" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <line x1="0" x2={W} y1={y(-3)} y2={y(-3)} className="assist-sketch-ref" />
      <path d={d} />
    </svg>
  );
}

/**
 * The design assistant: what it's for → the limits → what matters most → a ranked list of
 * drivers and boxes from the database. Every step can jump straight to the results (with the
 * defaults for the rest); on the results, the chips at the top go back to a step, and the
 * priority can be switched there directly. Results come in as they're worked out, in short
 * slices between paints, with a Stop.
 */
export function DesignAssistant(props: {
  open: boolean;
  onClose: () => void;
  db: DbIndex | null;
  base: AppState;
  /** Starting a project from one result, or the same driver's sealed and ported results. */
  onOpen: (d: LoadedDriver, rs: AssistantResult[], goal: AssistantGoal) => void;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [goal, setGoalRaw] = useState<AssistantGoal>(() => readGoal() ?? goalFor("car"));
  const [step, setStep] = useState(0);
  const setGoal = (patch: Partial<AssistantGoal>) =>
    setGoalRaw((g) => {
      const next = { ...g, ...patch };
      saveGoal(next);
      return next;
    });
  const { fmt, unit } = useUnits();

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (props.open && !d.open) {
      d.showModal();
      // A new project starts at "What for", with the last limits remembered.
      setStep(0);
    }
    if (!props.open && d.open) d.close();
  }, [props.open]);

  // ---- results: load the candidates' records, then evaluate them in slices ----
  const [results, setResults] = useState<AssistantResult[] | null>(null);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(PAGE);
  const loadedRef = useRef(new Map<string, LoadedDriver>());
  const stopRef = useRef<(() => void) | null>(null);
  const settingsKey = JSON.stringify([props.base.settings]);
  const goalKey = JSON.stringify(goal);

  useEffect(() => {
    if (!props.open || step !== 3 || !props.db) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setResults(null);
    setError("");
    setStopped(false);
    setShown(PAGE);
    const cands = prefilter(props.db.drivers, goal);
    const out: AssistantResult[] = [];
    const finish = (wasStopped = false) => {
      live = false;
      clearTimeout(timer);
      stopRef.current = null;
      setProgress(null);
      setStopped(wasStopped);
      setResults(rankResults(out, goal));
    };
    (async () => {
      // Every brand file the candidates need (cached after the first time, and offline).
      const need = cands.filter((r) => !loadedRef.current.has(r.id));
      let done = 0;
      let shownAt = 0;
      const tellLoaded = () => {
        // A progress update per driver would re-render hundreds of times: a few per second is plenty.
        if (!live || performance.now() - shownAt < 150) return;
        shownAt = performance.now();
        setProgress({ label: "Loading the drivers", done, total: need.length });
      };
      setProgress({ label: "Loading the drivers", done: 0, total: need.length });
      await Promise.all(
        need.map((r) =>
          loadDriver(r.id).then(
            (d) => {
              loadedRef.current.set(r.id, d);
              done++;
              tellLoaded();
            },
            () => {
              done++;
            },
          ),
        ),
      );
      if (!live) return;
      let i = 0;
      let rankedAt = performance.now();
      const slice = () => {
        if (!live) return;
        const t0 = performance.now();
        try {
          while (performance.now() - t0 < 30 && i < cands.length) {
            const row = cands[i++]!;
            const d = loadedRef.current.get(row.id);
            if (d) out.push(...evaluateDriver(props.base, row, d, goal));
          }
        } catch (e) {
          live = false;
          setProgress(null);
          setError((e as Error).message);
          return;
        }
        if (i >= cands.length) return finish();
        setProgress({ label: "Trying each driver", done: i, total: cands.length });
        // Show the best so far while the rest are worked out (about twice a second).
        if (performance.now() - rankedAt > 500) {
          rankedAt = performance.now();
          setResults(rankResults(out, goal));
        }
        timer = setTimeout(slice, 0);
      };
      stopRef.current = () => finish(true);
      setProgress({ label: "Trying each driver", done: 0, total: cands.length });
      timer = setTimeout(slice, 0);
    })().catch(() => live && setError("Couldn't load the driver database."));
    return () => {
      live = false;
      clearTimeout(timer);
      stopRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, step, props.db, goalKey, settingsKey]);

  const brands = useMemo(() => [...new Set((props.db?.drivers ?? []).map((d) => d.brand))].sort(), [props.db]);
  const close = () => props.onClose();
  const next = () => setStep((s) => Math.min(3, s + 1));
  const toggleBox = (b: AssistantBox) => setGoal({ boxes: goal.boxes.includes(b) ? goal.boxes.filter((x) => x !== b) : [...goal.boxes, b] });

  // Back (after the first step) and one main button: Next, then "Show results" on the last step.
  const nav =
    step < 3 ? (
      <div className="assist-nav">
        {step > 0 && (
          <button type="button" className="secondary" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < 2 ? (
          <button type="button" onClick={next}>
            Next
          </button>
        ) : (
          <button type="button" onClick={() => setStep(3)} disabled={goal.boxes.length === 0}>
            Show results
          </button>
        )}
      </div>
    ) : null;

  const vol = (l: number) => fmt(l, "vol", unit("vol").unit === "L" ? (l < 10 ? 1 : 0) : 2);
  const chips: { label: string; step: number }[] = [
    { label: USES[goal.use].label, step: 0 },
    { label: `≤ ${vol(goal.maxVolume_l)}`, step: 1 },
    { label: `${goal.power_w} W${goal.minLoad_ohm ? ` · ≥ ${goal.minLoad_ohm} Ω` : ""}`, step: 1 },
    { label: `${goal.drivers} × ${goal.sizeMin_in}–${goal.sizeMax_in}″`, step: 1 },
    { label: goal.boxes.map((b) => (b === "sealed" ? "Sealed" : "Ported")).join(" + ") || "No box types", step: 1 },
    ...(goal.brands.length ? [{ label: goal.brands.length === 1 ? goal.brands[0]! : `${goal.brands.length} brands`, step: 1 }] : []),
  ];

  return (
    <dialog
      ref={dlg}
      className="library finder assistant"
      aria-label="Design assistant"
      onClose={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* Focus lands on the dialog itself, not its close button (which then looked selected). */}
      <div className="lib-inner" tabIndex={-1} autoFocus>
        <header className="assist-head">
          {/* The first screen many people see: the app's name and logo, as in its header. */}
          <div className="assist-brand">
            <Logo className="logo" />
            <div>
              <b>Speaker Box Genius</b>
              <h2>Design assistant</h2>
            </div>
          </div>
          <button type="button" className="icon" onClick={close} aria-label="Close">
            ×
          </button>
        </header>
        <ol className="assist-steps" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" className="link" aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}>
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>

        <div className="assist-body">
          {step === 0 && (
            <>
              <p className="hint">
                What are you building? The assistant tries every suitable driver in the database and starts your project with the one you pick. This
                sets sensible starting limits; you can change any of them next.
              </p>
              <div className="assist-tiles">
                {(Object.keys(USES) as AssistantUse[]).map((u) => (
                  <button
                    type="button"
                    key={u}
                    className={`assist-tile${goal.use === u ? " on" : ""}`}
                    aria-pressed={goal.use === u}
                    onClick={() => {
                      setGoalRaw(() => {
                        const g = { ...goalFor(u, goal.priority), brands: goal.brands };
                        saveGoal(g);
                        return g;
                      });
                      setStep(1);
                    }}
                  >
                    <UseIcon use={u} />
                    <span className="assist-tile-text">
                      <b>{USES[u].label}</b>
                      <span>{USES[u].hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              <button type="button" className="link assist-skip" onClick={close}>
                I already have a driver: skip the assistant
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <p className="hint">Your limits. The box size is the net inside volume for all the drivers together.</p>
              <div className="fields">
                <Num label="Max box" q="vol" value={goal.maxVolume_l} min={1} help="The largest box that fits (net inside volume, all drivers)." onChange={(maxVolume_l) => setGoal({ maxVolume_l })} />
                <Num label="Amp power" unit="W" value={goal.power_w} min={1} help="What your amplifier gives into the load below." onChange={(power_w) => setGoal({ power_w })} />
                <Select<number>
                  label="Amp min load"
                  value={goal.minLoad_ohm}
                  help="The lowest impedance your amplifier is stable into: drivers (and dual voice coils) are wired to stay at or above it."
                  options={[1, 2, 4, 8].map((o) => ({ value: o, text: `${o} Ω` }))}
                  onChange={(minLoad_ohm) => setGoal({ minLoad_ohm })}
                />
                <Select<number>
                  label="Drivers"
                  value={goal.drivers}
                  help="How many drivers share the box."
                  options={[
                    { value: 1, text: "1" },
                    { value: 2, text: "2" },
                  ]}
                  onChange={(drivers) => setGoal({ drivers: drivers === 2 ? 2 : 1 })}
                />
                <Select<number>
                  label="Size from"
                  value={goal.sizeMin_in}
                  help="Smallest driver size to try (nominal, inches)."
                  options={SIZES.map((s) => ({ value: s, text: `${s}″` }))}
                  onChange={(sizeMin_in) => setGoal({ sizeMin_in, sizeMax_in: Math.max(sizeMin_in, goal.sizeMax_in) })}
                />
                <Select<number>
                  label="Size to"
                  value={goal.sizeMax_in}
                  help="Largest driver size to try (nominal, inches)."
                  options={SIZES.map((s) => ({ value: s, text: `${s}″` }))}
                  onChange={(sizeMax_in) => setGoal({ sizeMax_in, sizeMin_in: Math.min(sizeMax_in, goal.sizeMin_in) })}
                />
              </div>
              <div className="assist-checks" role="group" aria-label="Box types">
                <span>Box types</span>
                <label className="check">
                  <input type="checkbox" checked={goal.boxes.includes("sealed")} onChange={() => toggleBox("sealed")} /> Sealed
                </label>
                <label className="check">
                  <input type="checkbox" checked={goal.boxes.includes("vented")} onChange={() => toggleBox("vented")} /> Ported
                </label>
              </div>
              {goal.boxes.length === 0 && <p className="warn">Choose at least one box type.</p>}
              <details className="more assist-brands">
                <summary>Brands: {goal.brands.length ? goal.brands.join(", ") : "all"}</summary>
                <div className="assist-brand-list">
                  {brands.map((b) => (
                    <label key={b} className="check">
                      <input
                        type="checkbox"
                        checked={goal.brands.includes(b)}
                        onChange={() => setGoal({ brands: goal.brands.includes(b) ? goal.brands.filter((x) => x !== b) : [...goal.brands, b] })}
                      />{" "}
                      {b}
                    </label>
                  ))}
                </div>
                {goal.brands.length > 0 && (
                  <button type="button" className="link" onClick={() => setGoal({ brands: [] })}>
                    All brands
                  </button>
                )}
              </details>
            </>
          )}

          {step === 2 && (
            <>
              <p className="hint">What matters most? The list is sorted by it.</p>
              <div className="assist-tiles">
                {(Object.keys(PRIORITIES) as AssistantPriority[]).map((p) => (
                  <button type="button" key={p} className={`assist-tile${goal.priority === p ? " on" : ""}`} aria-pressed={goal.priority === p} onClick={() => setGoal({ priority: p })}>
                    <b>{PRIORITIES[p].label}</b>
                    <span>{PRIORITIES[p].hint}</span>
                  </button>
                ))}
              </div>
              <div className="fields">
                <Num label="Output at" unit="Hz" value={goal.loudAt_hz} min={10} help="The frequency output is compared at (shown for every result, and what “Loudest” ranks on)." onChange={(loudAt_hz) => setGoal({ loudAt_hz })} />
                {goal.priority === "small" && (
                  <Num label="Target F3" unit="Hz" value={goal.targetF3_hz} min={10} help="“Smallest box”: each box is shrunk until its F3 just reaches this." onChange={(targetF3_hz) => setGoal({ targetF3_hz })} />
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="assist-chips">
                {chips.map((c) => (
                  <button type="button" key={c.label} className="chip" onClick={() => setStep(c.step)} title="Change">
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="unit-switch assist-priority" role="group" aria-label="Sort by">
                {(Object.keys(PRIORITIES) as AssistantPriority[]).map((p) => (
                  <button key={p} aria-pressed={goal.priority === p} onClick={() => setGoal({ priority: p })} title={PRIORITIES[p].hint}>
                    {PRIORITIES[p].label}
                  </button>
                ))}
              </div>
              {progress && (
                <div className="finder-progress" role="status">
                  <div className="finder-progress-text">
                    <span>{progress.label}…</span>
                    <span className="muted">
                      {progress.done} / {progress.total}
                    </span>
                  </div>
                  <progress value={progress.done} max={Math.max(1, progress.total)} />
                  {stopRef.current && (
                    <button type="button" className="icon" onClick={() => stopRef.current?.()} aria-label="Stop" title="Stop (keeps the results so far)">
                      ✕
                    </button>
                  )}
                </div>
              )}
              {error && <p className="warn">{error}</p>}
              {stopped && <p className="hint">Stopped: the best of the drivers tried so far.</p>}
              {results && !progress && results.length === 0 && (
                <p className="warn">
                  Nothing in the database fits these limits{goal.priority === "small" ? ` and reaches ${goal.targetF3_hz} Hz` : ""}. Try a bigger box, another driver size
                  {goal.priority === "small" ? ", a higher target F3" : ""} or a lower minimum load.
                </p>
              )}
              <div className="finder-results assist-results">
                {(results ?? []).slice(0, shown).map((r) => (
                  <div key={r.key} className="assist-card">
                    <div className="assist-card-head">
                      <b>{r.name}</b>
                      <span className="preset-tag">{r.box === "sealed" ? "Sealed" : "Ported"}</span>
                      {r.badges?.map((b) => (
                        <span key={b} className="finder-best">
                          {b}
                        </span>
                      ))}
                    </div>
                    <div className="assist-card-body">
                      <div className="assist-nums">
                        <span>
                          <b>{r.f3.toFixed(0)} Hz</b> F3
                        </span>
                        <span>
                          <b>{r.loud_db.toFixed(0)} dB</b> at {goal.loudAt_hz} Hz
                        </span>
                        <span>
                          <b>{vol(r.vb_l)}</b> box
                        </span>
                      </div>
                      <Sketch curve={r.curve} />
                    </div>
                    <p className="assist-facts">
                      {r.box === "vented" && r.port
                        ? `Tuned to ${r.fb} Hz, ${r.port.count > 1 ? `${r.port.count} × ` : ""}${fmt(r.port.diameter_cm, "len")} port ${fmt(r.port.length_cm, "len")} long. `
                        : ""}
                      {wiringText(r, goal.drivers)}
                      Output at {goal.loudAt_hz} Hz is set by {LIMIT_TEXT[r.limitedBy]}.
                      {r.peak_db > 1.5 ? ` A ${r.peak_db.toFixed(1)} dB hump above F3.` : ""}
                    </p>
                    {r.over.length > 0 && (
                      <p className="warn assist-over">
                        At {goal.power_w} W it goes past {r.over.map((o) => (o === "xmax" ? "the cone's Xmax" : o === "port" ? "the port's chuffing limit" : "the PR's Xmax")).join(" and ")}
                        {r.box === "vented" ? " (above the tuning; a subsonic filter takes care of below)" : ""}: use less power there.
                      </p>
                    )}
                    {r.notes.map((n) => (
                      <p key={n} className="hint assist-note">
                        {n}
                      </p>
                    ))}
                    <div className="assist-card-actions">
                      {(() => {
                        const sibling = results!.find((x) => x.driverId === r.driverId && x.box !== r.box);
                        const open = (rs: AssistantResult[]) => {
                          const d = loadedRef.current.get(r.driverId);
                          if (d) props.onOpen(d, rs, goal);
                        };
                        return (
                          <>
                            {sibling && (
                              <button type="button" className="secondary" title="Start with this driver in both boxes, to compare them" onClick={() => open(r.box === "sealed" ? [r, sibling] : [sibling, r])}>
                                Open with sealed + ported
                              </button>
                            )}
                            <button type="button" title="Start your project with this driver and box" onClick={() => open([r])}>
                              Open
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}
                {results && results.length > shown && (
                  <button type="button" className="link" onClick={() => setShown(shown + PAGE)}>
                    Show {Math.min(PAGE, results.length - shown)} more (of {results.length})
                  </button>
                )}
              </div>
              <p className="hint finder-note">
                Each driver in the database that fits your limits, in the box the app's presets would give it (sealed Qtc 0.707, ported QB3/B4 or Keele), no
                bigger than your maximum, simulated at {goal.power_w} W{goal.use === "car" ? " with the car's cabin gain (output includes it; F3 is the box's own, before cabin gain, as in the summary table)" : ""}. Opening a result starts the project
                with its driver and box. Database values are the manufacturers' published figures: check the datasheet before you buy.
              </p>
            </>
          )}
        </div>
        {nav}
      </div>
    </dialog>
  );
}
