import { useEffect, useRef, useState } from "react";
import {
  evaluatePrCandidates,
  largestPrFor,
  rankPrResults,
  type AlignmentDriver,
  type DriverInput,
  type Losses,
  type PrCandidate,
  type PrFinderResult,
  type SimulationOptions,
} from "@sbg/engine";
import { DRIVER_AS_PR, loadDriverAsPassiveRadiator, loadPassiveRadiator, type DbIndex } from "./library.ts";
import { ventedAlignmentFor } from "./presets.ts";
import type { PrDesign, PrParams } from "./state.ts";

/** What the finder needs from the app: the driver and how the boxes are driven. */
export interface FinderContext {
  driver: DriverInput | null;
  sim: SimulationOptions;
  losses: Losses;
  /** Peaks are judged above this frequency (lower with a subsonic filter). */
  fMin: number;
  align: AlignmentDriver | null;
  drivers: number;
}

type Loaded = PrCandidate & { params: PrParams; displacement_l?: number; cutout_mm?: number };

// Every PR in the database, loaded once (the brand files are cached anyway).
let candidatesPromise: Promise<Loaded[]> | null = null;
function loadCandidates(db: DbIndex): Promise<Loaded[]> {
  candidatesPromise ??= Promise.all(
    db.passiveRadiators.map((r) =>
      loadPassiveRadiator(r.id).then((x) => ({
        id: r.id,
        name: x.name,
        pr: x.params,
        params: x.params,
        displacement_l: x.displacement_l,
        cutout_mm: x.cutout_mm,
        // The frame is a little wider than the cutout.
        od_cm: x.cutout_mm !== undefined ? x.cutout_mm / 10 + 2.5 : undefined,
      })),
    ),
  );
  return candidatesPromise;
}

// Drivers that could stand in as PRs, loaded on request (one by one: failures are skipped).
const driverCache = new Map<string, Promise<Loaded | null>>();
function loadDriverCandidates(rows: DbIndex["drivers"], onProgress?: (done: number) => void): Promise<Loaded[]> {
  let done = 0;
  const tick = <T,>(p: Promise<T>) =>
    p.then((x) => {
      onProgress?.(++done);
      return x;
    });
  return Promise.all(
    rows.map((r) => {
      let p = driverCache.get(r.id);
      if (!p) {
        p = loadDriverAsPassiveRadiator(r.id).then(
          (x) => ({
            id: DRIVER_AS_PR + r.id,
            name: x.name,
            pr: x.params,
            params: x.params,
            displacement_l: x.displacement_l,
            cutout_mm: x.cutout_mm,
            od_cm: x.cutout_mm !== undefined ? x.cutout_mm / 10 + 2.5 : undefined,
            counts: [1, 2],
            // Rank a driver below an equally good real PR: heavier, dearer, and its magnet takes room.
            penalty: 0.5,
          }),
          () => null,
        );
        driverCache.set(r.id, p);
      }
      return tick(p);
    }),
  ).then((xs) => xs.filter((x): x is Loaded => x !== null));
}

const f1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : v.toFixed(1));

/**
 * "Find a PR": every passive radiator in the database, in groups of 1, 2 and 4, tuned with
 * added mass to the target and judged by simulation (see findPassiveRadiators).
 */
export function PrFinder(props: {
  ctx: FinderContext;
  design: PrDesign;
  /** The design's box volume as simulated (the calculator's when linked). */
  vb_l: number;
  linked: boolean;
  db: DbIndex | null;
  onUse: (patch: Partial<PrDesign>, summary: string, physical?: { displacement_l?: number; cutout_mm?: number }) => void;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [cands, setCands] = useState<Loaded[] | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"box" | "align">("box");
  // Only work while the window is open (it simulates every candidate).
  const [isOpen, setIsOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [why, setWhy] = useState(false);
  const [withDrivers, setWithDrivers] = useState(false);
  const [driverCands, setDriverCands] = useState<Loaded[] | null>(null);
  // Progress: loading the drivers' files, then simulating every candidate (both can be stopped).
  const [loading, setLoading] = useState<{ done: number; total: number } | null>(null);
  const [simming, setSimming] = useState<{ done: number; total: number } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [rerun, setRerun] = useState(0);
  const { ctx } = props;

  const alignment = ctx.align ? ventedAlignmentFor(ctx.align, ctx.drivers) : null;
  const useAlign = mode === "align" && alignment !== null && !props.linked;
  const target = useAlign
    ? { vb_l: alignment.vb_l, fb: alignment.fb, label: `${alignment.vb_l.toFixed(1)} L tuned to ${alignment.fb.toFixed(1)} Hz (${alignment.name})` }
    : { vb_l: props.vb_l, fb: props.design.targetFb, label: `your ${props.vb_l.toFixed(1)} L box tuned to ${props.design.targetFb} Hz` };

  // Drivers worth trying as PRs here: enough cone area to keep up, and a frame that fits the box.
  const driverRows = (props.db?.drivers ?? []).filter((d) => {
    if (d.sd_cm2 === undefined || !(d.xmax_mm! > 0) || !ctx.driver) return false;
    const od = 1.3 * 2 * Math.sqrt(d.sd_cm2 / Math.PI);
    return d.sd_cm2 >= 0.5 * ctx.driver.sd_cm2 && od <= largestPrFor(target.vb_l);
  });
  const driverKey = withDrivers ? driverRows.map((d) => d.id).join() : "";

  useEffect(() => {
    if (!isOpen || !withDrivers || !props.db) return;
    let live = true;
    setDriverCands(null);
    const total = driverRows.length;
    setLoading({ done: 0, total });
    loadDriverCandidates(driverRows, (done) => live && setLoading({ done, total })).then(
      (x) => {
        if (!live) return;
        setLoading(null);
        setDriverCands(x);
      },
      () => {
        if (!live) return;
        setLoading(null);
        setError("Couldn't load the drivers.");
      },
    );
    return () => {
      live = false;
      setLoading(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, driverKey]);

  // Simulating every candidate takes a while (seconds with drivers as PRs), so it runs in short
  // slices between paints: the progress bar moves, the window stays usable, and it can be stopped
  // (keeping the results so far).
  const [found, setFound] = useState<{ results: PrFinderResult[] | null; error: string; stopped?: { done: number; total: number } }>({
    results: null,
    error: "",
  });
  useEffect(() => {
    setFound({ results: null, error: "" });
    setSimming(null);
    if (!isOpen || !cands || !ctx.driver || (withDrivers && !driverCands)) return;
    const all = withDrivers ? [...cands, ...driverCands!] : cands;
    const steps = evaluatePrCandidates(ctx.driver, all, {
      vb_l: target.vb_l,
      targetFb: target.fb,
      losses: ctx.losses,
      sim: ctx.sim,
      fMin: ctx.fMin,
    });
    const out: PrFinderResult[] = [];
    let done = 0;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (stopped?: { done: number; total: number }) => {
      live = false;
      clearTimeout(timer);
      stopRef.current = null;
      setSimming(null);
      setFound({ results: rankPrResults(out), error: "", stopped });
    };
    const slice = () => {
      if (!live) return;
      const t0 = performance.now();
      try {
        while (performance.now() - t0 < 30) {
          const n = steps.next();
          if (n.done) return finish();
          out.push(...n.value);
          done++;
        }
      } catch (e) {
        live = false;
        stopRef.current = null;
        setSimming(null);
        setFound({ results: null, error: (e as Error).message });
        return;
      }
      setSimming({ done, total: all.length });
      timer = setTimeout(slice, 0);
    };
    stopRef.current = () => finish({ done, total: all.length });
    setSimming({ done: 0, total: all.length });
    timer = setTimeout(slice, 30);
    return () => {
      live = false;
      clearTimeout(timer);
      stopRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cands, driverCands, withDrivers, ctx.driver, ctx.sim, ctx.losses, ctx.fMin, target.vb_l, target.fb, rerun]);
  const stop = () => {
    if (loading) {
      // Still fetching the drivers: stop by leaving them out.
      setWithDrivers(false);
      return;
    }
    stopRef.current?.();
  };
  const progress = loading
    ? { label: "Loading drivers", ...loading }
    : simming
      ? { label: withDrivers ? "Trying PRs and drivers" : "Trying every PR", ...simming }
      : null;
  const results = found.results;
  const shownError = error || found.error;

  const open = () => {
    setError("");
    setMore(false);
    setWhy(false);
    setIsOpen(true);
    dlg.current?.showModal();
    if (!cands && props.db) loadCandidates(props.db).then(setCands, () => setError("Couldn't load the passive radiators."));
  };
  const close = () => dlg.current?.close();

  const use = (r: PrFinderResult) => {
    const c = [...cands!, ...(driverCands ?? [])].find((x) => x.id === r.id)!;
    const patch: Partial<PrDesign> = {
      prName: c.name,
      params: c.params,
      count: r.count,
      addedMass_g: Math.round(r.addedMass_g),
      targetFb: Math.round(target.fb * 10) / 10,
      extra: [],
      ...(useAlign ? { vb_l: Math.round(target.vb_l * 10) / 10 } : {}),
    };
    props.onUse(patch, `${r.count} × ${c.name}, ${Math.round(r.addedMass_g)} g added`, { displacement_l: c.displacement_l, cutout_mm: c.cutout_mm });
    close();
  };

  const ok = results?.filter((r) => r.ok) ?? [];
  const bad = results?.filter((r) => !r.ok) ?? [];
  const shown = more ? ok : ok.slice(0, 5);

  return (
    <>
      <button
        type="button"
        className="secondary"
        onClick={open}
        disabled={!ctx.driver || !props.db}
        title={ctx.driver ? "Try every passive radiator in the database for this driver and box" : "Enter the driver's parameters and Xmax first"}
      >
        Find a PR for this driver…
      </button>
      <dialog
        ref={dlg}
        className="library finder"
        aria-label="Find a passive radiator"
        onClose={() => setIsOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="lib-inner">
          <header>
            <h2>Find a passive radiator</h2>
            <button type="button" className="icon" onClick={close} aria-label="Close">
              ×
            </button>
          </header>
          <div className="unit-switch finder-mode" role="group" aria-label="Box to fit">
            <button aria-pressed={!useAlign} onClick={() => setMode("box")}>
              Your box
            </button>
            <button
              aria-pressed={useAlign}
              onClick={() => setMode("align")}
              disabled={!alignment || props.linked}
              title={
                props.linked
                  ? "This design's volume comes from the volume calculator"
                  : alignment
                    ? `${alignment.name}: ${alignment.vb_l.toFixed(1)} L at ${alignment.fb.toFixed(1)} Hz`
                    : "No flat vented alignment for this driver (Qts above 0.6)"
              }
            >
              Flat alignment
            </button>
          </div>
          <p className="hint finder-target">
            1, 2 or 4 of each PR in the database ({props.db?.passiveRadiators.length ?? 0}){withDrivers ? `, and 1 or 2 of ${driverRows.length} drivers used as PRs,` : ""}{" "}
            tuned with added mass to {target.label}.
          </p>
          <label className="check finder-drivers" title="An unpowered woofer works as a passive radiator (terminals left unconnected)">
            <input type="checkbox" checked={withDrivers} onChange={(e) => setWithDrivers(e.currentTarget.checked)} /> Include drivers as PRs
            (unpowered woofers)
          </label>
          {shownError && <p className="warn">{shownError}</p>}
          <div className="finder-results">
            {!results && !progress && !shownError && <p className="hint">Loading the passive radiators…</p>}
            {progress && !shownError && (
              <div className="finder-progress" role="status">
                <div className="finder-progress-text">
                  <span>{progress.label}…</span>
                  <span className="muted">
                    {progress.done} / {progress.total}
                  </span>
                </div>
                <progress value={progress.done} max={Math.max(1, progress.total)} />
                <button type="button" className="icon" onClick={stop} aria-label="Stop" title="Stop (keeps the results so far)">
                  ✕
                </button>
              </div>
            )}
            {found.stopped && (
              <p className="hint">
                Stopped after {found.stopped.done} of {found.stopped.total}: the best of those tried so far.{" "}
                <button type="button" className="link" onClick={() => setRerun((n) => n + 1)}>
                  Try them all
                </button>
              </p>
            )}
            {results && ok.length === 0 && (
              <p className="warn">
                None of the passive radiators in the database keeps up in this box. See why below; a bigger box, a lower
                tuning or a smaller driver excursion usually helps.
              </p>
            )}
            {shown.map((r, i) => (
              <div key={`${r.id}-${r.count}`} className="finder-row">
                <div className="finder-main">
                  <b>
                    {r.count} × {r.name}
                  </b>
                  {i === 0 && <span className="finder-best">Best match</span>}
                  <span className="finder-facts">
                    {Math.round(r.addedMass_g)} g added{r.count > 1 ? " each" : ""} · F3 {f1(r.f3)} Hz · Fb {f1(r.fb)} Hz
                    {r.massRatio > 1.5 ? " · heavy added mass" : ""}
                  </span>
                  <span className="finder-use" title="PR travel used when the driver reaches its own Xmax">
                    <span className="meter" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, r.prUse * 100)}%` }} />
                    </span>
                    uses {Math.round(r.prUse * 100)} % of its travel at the driver's Xmax
                  </span>
                </div>
                <button type="button" onClick={() => use(r)}>
                  Use
                </button>
              </div>
            ))}
            {ok.length > 5 && !more && (
              <button type="button" className="link" onClick={() => setMore(true)}>
                Show {ok.length - 5} more that work
              </button>
            )}
            {bad.length > 0 && (
              <details open={why} onToggle={(e) => setWhy(e.currentTarget.open)} className="finder-why">
                <summary>Why not the others ({bad.length})</summary>
                <ul>
                  {bad.slice(0, 40).map((r) => (
                    <li key={`${r.id}-${r.count}`}>
                      <b>
                        {r.count} × {r.name}
                      </b>
                      : {r.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <p className="hint finder-note">
            Judged by simulation at the drive where the driver reaches its Xmax above {ctx.fMin} Hz: a PR that runs out of
            travel first becomes the limit. Frame sizes are estimates; added mass over 1.5× a PR's own moving mass is
            flagged, over 3× ruled out (the database has no maximum for these PRs).
          </p>
        </div>
      </dialog>
    </>
  );
}
