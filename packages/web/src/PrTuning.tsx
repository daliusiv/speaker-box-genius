import { useEffect, useRef, useState } from "react";
import { BUMP_LIMIT, bestPrTuning, evaluateTuning, type Fix, type PrTuningResult, type TuningGoal, type TuningPoint } from "@sbg/engine";
import type { FinderContext } from "./PrFinder.tsx";
import type { PrDesign } from "./state.ts";

const f1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : v.toFixed(1));

const GOALS: { id: TuningGoal; label: string; hint: string }[] = [
  { id: "flat", label: "Flattest", hint: `Lowest F3 with no bump (at most ${BUMP_LIMIT.flat} dB above the passband)` },
  { id: "deep", label: "Deepest", hint: `Lowest F3 allowing up to ${BUMP_LIMIT.deep} dB of bump` },
  { id: "smallest", label: "Smallest box", hint: `Smallest box that reaches your F3 (up to ${BUMP_LIMIT.smallest} dB of bump)` },
];

/**
 * "Best tuning": for the PR already chosen in a design, the added mass (and, for
 * "smallest", the box) that gives the flattest response, the deepest bass, or the smallest
 * box for a target F3, with the PRs kept within their travel. See bestPrTuning.
 */
export function PrTuning(props: {
  ctx: FinderContext;
  design: PrDesign;
  /** The design's box volume as simulated (the calculator's when linked). */
  vb_l: number;
  linked: boolean;
  /** Apply as one undo step. `summary` is for the confirmation toast. */
  onApply: (patch: Partial<PrDesign>, summary: string) => void;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [goal, setGoal] = useState<TuningGoal>("flat");
  const [targetF3, setTargetF3] = useState<number | null>(null);
  const [now, setNow] = useState<TuningPoint | null>(null);
  const [result, setResult] = useState<PrTuningResult | null>(null);
  const [error, setError] = useState("");
  const { ctx, design } = props;
  const mixed = design.extra.length > 0;
  const usable = ctx.driver !== null && !mixed;

  const opts = {
    vb_l: props.vb_l,
    pr: design.params,
    count: design.count,
    losses: ctx.losses,
    sim: ctx.sim,
    fMin: ctx.fMin,
  };
  const key = JSON.stringify([opts, design.addedMass_g, goal, targetF3]);

  // The design as it is now, and the default target for "smallest": a bit deeper than now.
  useEffect(() => {
    if (!isOpen || !ctx.driver || mixed) return;
    try {
      const p = evaluateTuning(ctx.driver, opts, props.vb_l, design.addedMass_g);
      setNow(p);
      if (targetF3 === null && p.f3 !== null) setTargetF3(Math.max(10, Math.round(p.f3) - 3));
    } catch {
      setNow(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, key]);

  // The search simulates a few hundred tunings: run it after the window has painted.
  useEffect(() => {
    setResult(null);
    setError("");
    if (!isOpen || !ctx.driver || mixed) return;
    if (goal === "smallest" && !(targetF3! > 0)) return;
    const driver = ctx.driver;
    const t = setTimeout(() => {
      try {
        setResult(bestPrTuning(driver, { ...opts, goal, targetF3: targetF3 ?? undefined }));
      } catch (e) {
        setError((e as Error).message);
      }
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, key]);

  const open = () => {
    setIsOpen(true);
    if (props.linked && goal === "smallest") setGoal("flat");
    dlg.current?.showModal();
  };
  const close = () => dlg.current?.close();

  const apply = (b: TuningPoint) => {
    const mass = Math.round(b.addedMass_g);
    const patch: Partial<PrDesign> = {
      addedMass_g: mass,
      targetFb: Math.round(b.fb * 10) / 10,
      ...(goal === "smallest" ? { vb_l: b.vb_l } : {}),
    };
    const each = design.count > 1 ? " each" : "";
    props.onApply(patch, goal === "smallest" ? `a ${b.vb_l} L box with ${mass} g added${each}` : `${mass} g added${each}, tuned to ${f1(b.fb)} Hz`);
    close();
  };

  const applyFix = (f: Fix) => {
    if (Object.keys(f.patch).length === 0) {
      setGoal("deep");
      return;
    }
    if (f.patch.vb_l !== undefined && props.linked) return;
    // Change the design and keep the window open: the search reruns for the new setup.
    props.onApply(
      { ...(f.patch.count !== undefined ? { count: f.patch.count } : {}), ...(f.patch.vb_l !== undefined ? { vb_l: f.patch.vb_l } : {}) },
      f.patch.count !== undefined ? `${f.patch.count} PRs` : `a ${f.patch.vb_l} L box`,
    );
  };

  const b = result?.best ?? null;
  const prName = design.prName || "this PR";

  return (
    <>
      <button
        type="button"
        className="secondary"
        onClick={open}
        disabled={!usable}
        title={
          mixed
            ? "Works with one kind of PR (remove the other groups)"
            : ctx.driver
              ? "The added mass (or box) that gives the flattest response, the deepest bass, or the smallest box"
              : "Enter the driver's parameters first"
        }
      >
        Best tuning…
      </button>
      <dialog
        ref={dlg}
        className="library finder tuning"
        aria-label="Best tuning for this passive radiator"
        onClose={() => setIsOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="lib-inner">
          <header>
            <h2>Best tuning</h2>
            <button type="button" className="icon" onClick={close} aria-label="Close">
              ×
            </button>
          </header>
          <p className="hint finder-target">
            {design.count} × {prName} in {props.linked ? "the calculator's" : "your"} {f1(props.vb_l)} L box.
          </p>
          <div className="unit-switch finder-mode" role="group" aria-label="Goal">
            {GOALS.map((g) => (
              <button
                key={g.id}
                aria-pressed={goal === g.id}
                onClick={() => setGoal(g.id)}
                title={g.id === "smallest" && props.linked ? "This design's volume comes from the volume calculator" : g.hint}
                disabled={g.id === "smallest" && props.linked}
              >
                {g.label}
              </button>
            ))}
          </div>
          <p className="hint tuning-goal">{GOALS.find((g) => g.id === goal)!.hint}.</p>
          {goal === "smallest" && (
            <label className="tuning-target" data-help="The lowest −3 dB point the smallest box must still reach.">
              <span>Reach F3 of</span>
              <input
                type="number"
                inputMode="decimal"
                min={5}
                step={1}
                value={targetF3 ?? ""}
                onChange={(e) => setTargetF3(e.currentTarget.value === "" ? null : Number(e.currentTarget.value))}
              />
              <span className="unit">Hz</span>
            </label>
          )}

          {error && <p className="warn">{error}</p>}
          {!result && !error && <p className="hint">Trying tunings…</p>}

          {b && (
            <div className="tuning-card">
              <div className="tuning-facts">
                {goal === "smallest" && (
                  <Fact label="Box" value={`${f1(b.vb_l)} L`} was={`${f1(props.vb_l)} L`} />
                )}
                <Fact label={design.count > 1 ? "Added mass, each" : "Added mass"} value={`${Math.round(b.addedMass_g)} g`} was={`${Math.round(design.addedMass_g)} g`} />
                <Fact label="Fb" value={`${f1(b.fb)} Hz`} was={now ? `${f1(now.fb)} Hz` : undefined} />
                <Fact label="F3" value={`${f1(b.f3)} Hz`} was={now ? `${f1(now.f3)} Hz` : undefined} />
                <Fact label="Bump" value={`${b.bump_db.toFixed(1)} dB`} was={now ? `${now.bump_db.toFixed(1)} dB` : undefined} />
              </div>
              {Number.isFinite(b.prUse) && (
                <span className="finder-use" title="PR travel used when the driver reaches its own Xmax">
                  <span className="meter" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, b.prUse * 100)}%` }} />
                  </span>
                  PRs use {Math.round(b.prUse * 100)} % of their travel at the driver's Xmax
                </span>
              )}
              {result!.notes.map((n) => (
                <p key={n} className="hint">
                  {n}
                </p>
              ))}
              <button type="button" onClick={() => apply(b)}>
                Use this tuning
              </button>
            </div>
          )}

          {result && !b && (
            <div className="tuning-card">
              <p className="warn">No tuning works: {result.reason}.</p>
              {result.fixes.length > 0 && <p className="hint">What would:</p>}
              {result.fixes.map((f) => (
                <div key={f.text} className="tuning-fix">
                  <span>{f.text}</span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => applyFix(f)}
                    disabled={f.patch.vb_l !== undefined && props.linked}
                    title={f.patch.vb_l !== undefined && props.linked ? "This design's volume comes from the volume calculator" : undefined}
                  >
                    {Object.keys(f.patch).length === 0 ? "Show" : "Apply"}
                  </button>
                </div>
              ))}
              {result.notes.map((n) => (
                <p key={n} className="hint">
                  {n}
                </p>
              ))}
            </div>
          )}

          <p className="hint finder-note">
            The added mass sets the tuning; the PR, how many and the driver stay as they are. Judged by simulation: F3 and
            bump against the passband (the 0 dB line of the relative SPL chart, without room gain), and the PRs must stay
            within their Xmax up to the drive where the driver reaches its own (above {ctx.fMin} Hz). Added mass is limited
            to 3× the PR's own moving mass.
          </p>
        </div>
      </dialog>
    </>
  );
}

function Fact(props: { label: string; value: string; was?: string }) {
  return (
    <div className="tuning-fact">
      <span className="tuning-label">{props.label}</span>
      <b>{props.value}</b>
      {props.was !== undefined && props.was !== props.value && <span className="tuning-was">now {props.was}</span>}
    </div>
  );
}
