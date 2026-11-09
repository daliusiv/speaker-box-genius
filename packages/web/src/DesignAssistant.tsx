import { useEffect, useMemo, useRef, useState } from "react";
import { Num, Select } from "./components.tsx";
import {
  CURVE_FREQS,
  PRIORITIES,
  USES,
  BANDPASS_USES,
  LINE_USES,
  evaluateDriver,
  encodeShared,
  encodeSharedShort,
  goalFor,
  spaceGross_l,
  type SharedResults,
  type SpaceGoal,
  bandpassShortlist,
  cyclesText,
  lineShortlist,
  prShortlist,
  type PrCandidateWithParams,
  prefilter,
  rankResults,
  type AssistantBox,
  type AssistantGoal,
  type AssistantPort,
  type AssistantPriority,
  type AssistantResult,
  type AssistantUse,
  type IndexRow,
  prCautionNote,
} from "./assistant.ts";
import { loadDriver, type DbIndex, type LoadedDriver } from "./library.ts";
import type { WorkerJob, WorkerReply } from "./assistantWorker.ts";
import { loadCandidates as loadPrCandidates } from "./PrFinder.tsx";
import type { AppState } from "./state.ts";
import { useUnits } from "./units.ts";
import { KIND_COLORS, portLimitOf } from "./sim.ts";
import { Logo, UseIcon } from "./Logo.tsx";

const KEY = "sbg.assistant";
/** The wizard's steps and the step number each shows (2, once "Priority", is now the results' sort bar). */
const STEPS = [
  ["Goal", 0],
  ["Limits", 1],
  ["Results", 3],
] as const;
const SIZES = [4, 5, 5.25, 6.5, 8, 10, 12, 15, 18, 21];
const BOX_LABEL: Record<AssistantBox, string> = { sealed: "Sealed", vented: "Ported", pr: "PR", line: "Line", bandpass: "Bandpass" };
/** Uses in a word or two, for the results' summary line. */
const SHORT_USE: Record<AssistantUse, string> = { car: "Car sub", home: "Home sub", hifi: "Bookshelf", tower: "Tower", other: "Custom" };
/** Whether a box type is offered for a use. */
const offered = (b: AssistantBox, use: AssistantGoal["use"]) => (b === "line" ? LINE_USES.includes(use) : b === "bandpass" ? BANDPASS_USES.includes(use) : true);
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
  amp: "your amplifier's voltage or current",
  none: "—",
};

/** "2 drivers in series, coils in parallel: 4 Ω." or just "4 Ω." */
function wiringText(r: AssistantResult, drivers: number): string {
  const parts = [drivers > 1 ? `2 drivers in ${r.wiring}` : "", r.dvcWired ? `coils in ${r.dvcWired}` : ""].filter(Boolean);
  const text = parts.length ? `${parts.join(", ")}: ${r.load_ohm} Ω. ` : `${r.load_ohm} Ω load. `;
  return text[0]!.toUpperCase() + text.slice(1);
}

/** A small sketch of the relative response, 10–300 Hz, with the −3 dB line. */
function Sketch({ curve, color }: { curve: number[]; color: string }) {
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
      <path d={d} style={{ stroke: color }} />
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
/** A bandpass box in words: its chambers, ports and band. */
function bandpassText(b: NonNullable<AssistantResult["bandpass"]>, fmt: (v: number, q: "len") => string, vol: (l: number) => string): string {
  const front = `a ${vol(b.front_l)} front chamber tuned to ${b.frontFb} Hz with ${portText(b.frontPort, fmt)}`;
  const rear = b.order === "4" ? `A ${vol(b.rear_l)} sealed rear chamber, ${front}` : `A ${vol(b.rear_l)} rear chamber tuned to ${b.rearFb} Hz with ${b.rearPort ? portText(b.rearPort, fmt) : "a port"}, ${front}`;
  const gain = Math.abs(b.gain_db) >= 0.5 ? `, ${b.gain_db > 0 ? "+" : "−"}${Math.abs(b.gain_db).toFixed(1)} dB on a plain cone` : "";
  return `${rear}. Band up to ${b.f3High.toFixed(0)} Hz${gain}; the sound leaves through the port${b.order === "4" ? "" : "s"}.`;
}

/** A space in words: "45 × 40 × 40 cm". */
function spaceText(sp: SpaceGoal, fmt: (v: number, q: "len") => string): string {
  const [w, h, d] = [sp.width_cm, sp.height_cm, sp.depth_cm].map((x) => fmt(x, "len"));
  const unit = w!.replace(/^[\d.,]+\s*/, "");
  const n = (x: string) => x.replace(/\s*[^\d.,]+$/, "").replace(/[.,]0$/, "");
  return `${n(w!)} × ${n(h!)} × ${n(d!)} ${unit}`;
}

/** A suggested port in words: "a 7.5 cm port 14 cm long", "a 6 cm flared port …", "a 27 × 3 cm slot …". */
function portText(p: AssistantPort, fmt: (v: number, q: "len") => string): string {
  const long = `${fmt(p.length_cm, "len")} long`;
  if (p.kind === "slot") return `a ${fmt(p.slotWidth_cm, "len")} × ${fmt(p.slotHeight_cm, "len")} slot along a wall, ${long}`;
  const n = p.count > 1 ? `${p.count} × ` : "a ";
  return p.kind === "flared"
    ? `${n}${fmt(p.diameter_cm, "len")} flared port (${fmt(p.flare_cm, "len")} round-overs at both ends), ${long}`
    : `${n}${fmt(p.diameter_cm, "len")} port ${long}`;
}

export function DesignAssistant(props: {
  open: boolean;
  onClose: () => void;
  db: DbIndex | null;
  base: AppState;
  /** Starting a project from one result, or the same driver's sealed and ported results. */
  onOpen: (d: LoadedDriver, rs: AssistantResult[], goal: AssistantGoal) => void;
  /** The chuffing line is the app's own setting (Settings → Ports): changed here, it changes there. */
  onPortLimit: (ms: number) => void;
  /** A shared list of results to show (from a "#assistant=…" link), the first time the dialog opens; undefined while the link is still being read. */
  shared?: SharedResults | null;
  /** The launcher's "I have a speaker driver": close, and go to picking or entering one. */
  onHaveDriver: () => void;
  /** The launcher's "Explore live demo project" (and closing the launcher): close, keeping the example. */
  onDemo: () => void;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [goal, setGoalRaw] = useState<AssistantGoal>(() => readGoal() ?? goalFor("car"));
  const [step, setStep] = useState(0);
  /** The launcher ("Start a new project"), shown before the wizard each time the dialog opens. */
  const [launch, setLaunch] = useState(true);
  const sharedUsed = useRef(false);
  /** The box type a shared link showed, applied once its results are in. */
  const sharedOnly = useRef<AssistantBox | "all">("all");
  const [shareMsg, setShareMsg] = useState("");
  /** What the shared link changed or can't promise, shown over its results. */
  const [sharedNote, setSharedNote] = useState<{ pl?: number; db?: string } | null>(null);
  // The database loads after the link is read: compared as it renders.
  const dbChanged = !!(sharedNote?.db && props.db?.generated && sharedNote.db !== props.db.generated);
  const shareResults = async () => {
    const x = { goal, portLimit_ms: portLimitOf(props.base), only, ...(props.db?.generated ? { db: props.db.generated } : {}) };
    const url = `${location.origin}${location.pathname}#assistant=${await encodeSharedShort(x).catch(() => encodeShared(x))}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "Speaker Box Genius: design assistant results", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied ✓");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      prompt("Copy the link:", url);
    }
    setTimeout(() => setShareMsg(""), 2500);
  };
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
      // A new project starts at the launcher, then "Goal", with the last limits remembered (a shared link: below).
      setStep(0);
      setLaunch(true);
    }
    if (!props.open && d.open) d.close();
  }, [props.open]);
  useEffect(() => {
    const sh = props.shared;
    if (!props.open || !sh || sharedUsed.current) return;
    // A shared link: its goal (and chuffing line), straight to its results.
    sharedUsed.current = true;
    setGoalRaw(sh.goal);
    saveGoal(sh.goal);
    sharedOnly.current = sh.only ?? "all";
    const pl = sh.portLimit_ms && sh.portLimit_ms !== portLimitOf(props.base) ? sh.portLimit_ms : undefined;
    if (pl) props.onPortLimit(pl);
    setSharedNote({ ...(pl ? { pl } : {}), ...(sh.db ? { db: sh.db } : {}) });
    setLaunch(false);
    setStep(3);
  }, [props.open, props.shared]);

  // ---- results: load the candidates' records, then evaluate them in slices ----
  const [results, setResults] = useState<AssistantResult[] | null>(null);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(PAGE);
  /** Show one kind of box (e.g. only the lines), or all. */
  const [only, setOnly] = useState<AssistantBox | "all">("all");
  const loadedRef = useRef(new Map<string, LoadedDriver>());
  const stopRef = useRef<(() => void) | null>(null);
  /** Second pass: show the designs found so far now (re-ranks the list). */
  const mergeRef = useRef<(() => void) | null>(null);
  const [pending, setPending] = useState(0);
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
    setOnly(sharedOnly.current);
    sharedOnly.current = "all";
    setPending(0);
    const cands = prefilter(props.db.drivers, goal);
    const out: AssistantResult[] = [];
    // Lines and bandpass boxes found in the second pass: held back (the list doesn't jump
    // under your finger) until it ends, or until you ask to see them.
    const extra: AssistantResult[] = [];
    let worker: Worker | null = null;
    const finish = (wasStopped = false) => {
      live = false;
      clearTimeout(timer);
      worker?.terminate();
      worker = null;
      stopRef.current = null;
      mergeRef.current = null;
      out.push(...extra.splice(0));
      setPending(0);
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
        if (i >= cands.length) return wantLines || wantBandpass || wantPr ? void startLines() : finish();
        setProgress({ label: "Trying each driver", done: i, total: cands.length });
        // Show the best so far while the rest are worked out (about twice a second).
        if (performance.now() - rankedAt > 500) {
          rankedAt = performance.now();
          setResults(rankResults(out, goal));
        }
        timer = setTimeout(slice, 0);
      };
      // Transmission lines and bandpass boxes, after the boxes: the best few drivers (each a
      // slower search), the list re-ranked as they come in.
      const wantLines = goal.boxes.includes("line") && LINE_USES.includes(goal.use);
      const wantBandpass = goal.boxes.includes("bandpass") && BANDPASS_USES.includes(goal.use);
      const wantPr = goal.boxes.includes("pr") && !!props.db && props.db.passiveRadiators.length > 0;
      const startLines = async () => {
        const ranked = rankResults(out, goal);
        setResults(ranked);
        // The database's passive radiators (one brand file each, cached), for the PR boxes.
        let prs: PrCandidateWithParams[] = [];
        if (wantPr) {
          setProgress({ label: "Loading the passive radiators", done: 0, total: 1 });
          prs = await loadPrCandidates(props.db!).catch(() => []);
          if (!live) return;
        }
        const picked: { row: IndexRow; stage: "lines" | "bandpass" | "pr" }[] = [
          ...(prs.length ? prShortlist(ranked, cands).map((row) => ({ row, stage: "pr" as const })) : []),
          ...(wantBandpass ? bandpassShortlist(ranked, cands).map((row) => ({ row, stage: "bandpass" as const })) : []),
          ...(wantLines ? lineShortlist(ranked, cands).map((row) => ({ row, stage: "lines" as const })) : []),
        ];
        const tasks = picked.flatMap((t) => {
          const driver = loadedRef.current.get(t.row.id);
          return driver ? [{ ...t, driver }] : [];
        });
        const kinds = [prs.length ? "passive radiators" : "", wantBandpass ? "bandpass boxes" : "", wantLines ? "transmission lines" : ""].filter(Boolean);
        const label = kinds.length === 1 ? kinds[0]![0]!.toUpperCase() + kinds[0]!.slice(1) : "More box types";
        const report = (done: number) => {
          if (!live) return;
          setProgress({ label, done, total: tasks.length });
          setPending(extra.length);
        };
        mergeRef.current = () => {
          out.push(...extra.splice(0));
          setPending(0);
          setResults(rankResults(out, goal));
        };
        report(0);
        // In a worker when the browser can (no jank); else here, in slices between paints.
        const inSlices = () => {
          let j = 0;
          const slice = () => {
            if (!live) return;
            if (j >= tasks.length) return finish();
            const t0 = performance.now();
            while (j < tasks.length && performance.now() - t0 < 30) {
              const { row, driver, stage } = tasks[j++]!;
              try {
                extra.push(...evaluateDriver(props.base, row, driver, goal, stage, prs));
              } catch {
                // One that won't simulate is left out; the rest carry on.
              }
              if (stage === "lines") break;
            }
            report(j);
            timer = setTimeout(slice, 0);
          };
          timer = setTimeout(slice, 30);
        };
        try {
          worker = new Worker(new URL("./assistantWorker.ts", import.meta.url), { type: "module" });
        } catch {
          worker = null;
        }
        if (!worker) return inSlices();
        let heard = false;
        worker.onmessage = (e: MessageEvent<WorkerReply>) => {
          heard = true;
          if (!live) return;
          if (e.data.type === "result") {
            extra.push(...e.data.results);
            report(e.data.done);
          } else finish();
        };
        worker.onerror = (e) => {
          e.preventDefault();
          worker?.terminate();
          worker = null;
          if (!live) return;
          // It never started (couldn't load): do the work here instead; else keep what came in.
          if (!heard) inSlices();
          else finish();
        };
        worker.postMessage({ base: props.base, goal, tasks, prs } satisfies WorkerJob);
      };
      stopRef.current = () => finish(true);
      setProgress({ label: "Trying each driver", done: 0, total: cands.length });
      timer = setTimeout(slice, 0);
    })().catch(() => live && setError("Couldn't load the driver database."));
    return () => {
      live = false;
      clearTimeout(timer);
      worker?.terminate();
      stopRef.current = null;
      mergeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, step, props.db, goalKey, settingsKey]);

  const brands = useMemo(() => [...new Set((props.db?.drivers ?? []).map((d) => d.brand))].sort(), [props.db]);
  // Closing the launcher keeps the example project, as "Explore live demo project" does.
  const close = () => (launch ? props.onDemo() : props.onClose());
  const toggleBox = (b: AssistantBox) => setGoal({ boxes: goal.boxes.includes(b) ? goal.boxes.filter((x) => x !== b) : [...goal.boxes, b] });

  // Goal: back to the launcher (a goal tile moves on by itself). Limits: back, and on to the results.
  const nav = launch ? null : step === 0 ? (
    <div className="assist-nav">
      <button type="button" className="secondary" onClick={() => setLaunch(true)}>
        ‹ Back
      </button>
    </div>
  ) : step === 1 ? (
    <div className="assist-nav">
      <button type="button" className="secondary" onClick={() => setStep(0)}>
        ‹ Back
      </button>
      <button type="button" onClick={() => setStep(3)} disabled={goal.boxes.length === 0}>
        Show matching drivers
      </button>
    </div>
  ) : null;
  const driverCount = props.db?.drivers.length ?? 0;

  const kinds = (["sealed", "vented", "pr", "bandpass", "line"] as const).filter((k) => (results ?? []).some((r) => r.box === k));
  const listed = (results ?? []).filter((r) => only === "all" || r.box === only);
  const vol = (l: number) => fmt(l, "vol", unit("vol").unit === "L" ? (l < 10 ? 1 : 0) : 2);
  const chips: { label: string; step: number }[] = [
    { label: SHORT_USE[goal.use], step: 0 },
    { label: goal.space ? `Fits ${spaceText(goal.space, fmt)}` : `≤ ${vol(goal.maxVolume_l)}`, step: 1 },
    { label: `${goal.power_w} W${goal.minLoad_ohm ? ` (≥ ${goal.minLoad_ohm} Ω)` : ""}`, step: 1 },
    { label: `${goal.drivers} × ${goal.sizeMin_in}–${goal.sizeMax_in}″`, step: 1 },
    { label: goal.boxes.filter((b) => offered(b, goal.use)).map((b) => BOX_LABEL[b]).join(" + ") || "No box types", step: 1 },
    ...(goal.brands.length ? [{ label: goal.brands.length === 1 ? goal.brands[0]! : `${goal.brands.length} brands`, step: 1 }] : []),
  ];

  return (
    <dialog
      ref={dlg}
      className="library finder assistant"
      aria-label={launch ? "Start a new project" : "Design assistant"}
      // The native close event also follows our own closing (props.open false): only Escape counts here.
      onClose={() => {
        if (props.open) close();
      }}
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
              <h2>{launch ? "Start a new project" : "Design assistant"}</h2>
            </div>
          </div>
          <button type="button" className="icon" onClick={close} aria-label="Close">
            ×
          </button>
        </header>
        {!launch && (
          <ol className="assist-steps" aria-label="Steps">
            {STEPS.map(([s, n], i) => (
              <li key={s}>
                <button type="button" className="link" aria-current={n === step ? "step" : undefined} onClick={() => setStep(n)}>
                  {i + 1}. {s}
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="assist-body">
          {launch && (
            <div className="assist-launch">
              <button type="button" className="assist-tile" onClick={props.onHaveDriver}>
                <UseIcon use="driver" />
                <span className="assist-tile-text">
                  <b>I have a speaker driver</b>
                  <span>
                    Search {driverCount > 100 ? `${(Math.floor(driverCount / 100) * 100).toLocaleString("en")}+` : "the"} drivers or enter its T/S specs, and design the box
                    around it.
                  </span>
                </span>
              </button>
              <button type="button" className="assist-tile" onClick={() => setLaunch(false)}>
                <UseIcon use="search" />
                <span className="assist-tile-text">
                  <b>Find the best driver for my box or space</b>
                  <span>Set your box size, amp power and goal: the assistant simulates every driver to find the matches.</span>
                </span>
              </button>
              <button type="button" className="assist-tile assist-demo" onClick={props.onDemo}>
                <UseIcon use="demo" />
                <span className="assist-tile-text">
                  <b>Explore the live demo project</b>
                  <span>Compare sealed, ported and passive radiator boxes for a woofer that's already loaded.</span>
                </span>
              </button>
            </div>
          )}
          {!launch && step === 0 && (
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
                        const g = { ...goalFor(u, goal.priority), brands: goal.brands, ...(goal.space ? { space: goal.space } : {}) };
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
            </>
          )}

          {!launch && step === 1 && (
            <>
              <p className="hint">Your limits: the largest box (its net inside volume, all the drivers together), or the space it has to fit.</p>
              <div className="unit-switch assist-only" role="group" aria-label="Box size">
                <button aria-pressed={!goal.space} onClick={() => setGoal({ space: undefined })}>
                  Volume
                </button>
                <button aria-pressed={!!goal.space} onClick={() => setGoal({ space: goal.space ?? { width_cm: 45, height_cm: 40, depth_cm: 40, wall_mm: props.base.volume.wall_mm } })}>
                  My space
                </button>
              </div>
              {goal.space && (
                <>
                  <div className="fields">
                    {(["width_cm", "height_cm", "depth_cm"] as const).map((k) => (
                      <Num
                        key={k}
                        label={k === "width_cm" ? "Width" : k === "height_cm" ? "Height" : "Depth"}
                        q="len"
                        value={goal.space![k]}
                        min={5}
                        help="The box's outside size: the space it has to fit (a car boot, a shelf, a corner)."
                        onChange={(v) => setGoal({ space: { ...goal.space!, [k]: v } })}
                      />
                    ))}
                    <Num label="Walls" unit="mm" value={goal.space.wall_mm} min={3} help="Panel thickness." onChange={(wall_mm) => setGoal({ space: { ...goal.space!, wall_mm } })} />
                  </div>
                  <p className="hint">
                    About {vol(spaceGross_l(props.base, goal.space))} inside after the walls and bracing. Each result takes off its own driver, ports and passive radiators, as the
                    volume calculator does, and opens with the calculator set to this space.
                  </p>
                </>
              )}
              <div className="assist-limits">
                {!goal.space && (
                  <Num label="Max box" q="vol" value={goal.maxVolume_l} min={1} help="The largest box that fits (net inside volume, all drivers)." onChange={(maxVolume_l) => setGoal({ maxVolume_l })} />
                )}
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
                <label className="check" title="The ported box's size and tuning with the database's passive radiators instead of a port: no port noise, and a small box can tune low. The app's PR finder picks them for the best few drivers after the boxes.">
                  <input type="checkbox" checked={goal.boxes.includes("pr")} onChange={() => toggleBox("pr")} /> Passive radiator
                </label>
                {LINE_USES.includes(goal.use) && (
                  <label className="check" title="Mass-loaded (MLTL) and classic transmission lines, folded into a tall cabinet. Worked out for the best few drivers after the boxes, so they take a few seconds more.">
                    <input type="checkbox" checked={goal.boxes.includes("line")} onChange={() => toggleBox("line")} /> Transmission line
                  </label>
                )}
                {BANDPASS_USES.includes(goal.use) && (
                  <label className="check" title="4th order (sealed rear, ported front) and 6th order (both chambers ported): more output in a band, but all of it leaves through the ports. Worked out for the best few drivers after the boxes.">
                    <input type="checkbox" checked={goal.boxes.includes("bandpass")} onChange={() => toggleBox("bandpass")} /> Bandpass (4th / 6th order)
                  </label>
                )}
              </div>
              {goal.boxes.length === 0 && <p className="warn">Choose at least one box type.</p>}
              {/* Rarely changed: folded away, with what's set shown on the summary line. */}
              <details className="more assist-advanced">
                <summary>
                  Advanced & brand filters{" "}
                  <span className="assist-pill">
                    {goal.boxes.some((b) => b !== "sealed") ? `${portLimitOf(props.base)} m/s · ` : ""}
                    {goal.brands.length ? (goal.brands.length === 1 ? goal.brands[0] : `${goal.brands.length} brands`) : "All brands"}
                  </span>
                </summary>
                {goal.boxes.some((b) => b !== "sealed") && (
                  <div className="fields">
                    <Num
                      label="Chuffing line"
                      unit="m/s"
                      value={portLimitOf(props.base)}
                      min={5}
                      help="Port air speed above this counts as chuffing. 17 m/s keeps a hi-fi port quiet; car SPL builds often accept 25–30. The same setting as Settings → Ports."
                      onChange={(v) => props.onPortLimit(v > 0 ? v : 17)}
                    />
                  </div>
                )}
                <p className="assist-sub">Brands</p>
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

          {!launch && step === 3 && (
            <>
              {/* What these results are for, on one line, and a way back to change it. */}
              <div className="assist-summary">
                <span>{chips.map((c) => c.label).join(" · ")}</span>
                <button type="button" className="link" onClick={() => setStep(1)}>
                  Edit limits
                </button>
              </div>
              <div className="unit-switch assist-priority" role="group" aria-label="Sort by">
                {(Object.keys(PRIORITIES) as AssistantPriority[]).map((p) => (
                  <button key={p} aria-pressed={goal.priority === p} onClick={() => setGoal({ priority: p })} title={PRIORITIES[p].hint}>
                    {PRIORITIES[p].label}
                  </button>
                ))}
              </div>
              {/* Sorting by output or by size needs its frequency: asked for here, where it's used. */}
              {goal.priority === "loud" && (
                <div className="assist-sort-field">
                  <Num label="Loudest at" unit="Hz" value={goal.loudAt_hz} min={10} help="The frequency output is compared at: what “Loudest” ranks on, and the dB each result shows." onChange={(loudAt_hz) => setGoal({ loudAt_hz })} />
                </div>
              )}
              {goal.priority === "small" && (
                <div className="assist-sort-field">
                  <Num label="Target F3" unit="Hz" value={goal.targetF3_hz} min={10} help="“Smallest box”: each box is shrunk until its F3 just reaches this." onChange={(targetF3_hz) => setGoal({ targetF3_hz })} />
                </div>
              )}
              {sharedNote && (sharedNote.pl || dbChanged) && (
                <p className="hint assist-shared-note" role="note">
                  {sharedNote.pl ? `This list uses the link's ${sharedNote.pl} m/s chuffing line (now yours too: Settings → Ports). ` : ""}
                  {dbChanged ? "The driver database has been updated since this was shared, so the list may differ a little." : ""}
                </p>
              )}
              {/* The box-type filter, and the list's share link on the same row. */}
              <div className="assist-filter-row">
              {kinds.length > 1 && (
                <div className="unit-switch assist-only" role="group" aria-label="Show">
                  {(["all", ...kinds] as const).map((k) => (
                    <button
                      key={k}
                      aria-pressed={only === k}
                      onClick={() => {
                        setOnly(k);
                        setShown(PAGE);
                      }}
                    >
                      {k === "all" ? "All" : k === "line" ? "Lines" : BOX_LABEL[k]}
                    </button>
                  ))}
                </div>
              )}
                <button
                  type="button"
                  className="secondary assist-share-btn"
                  onClick={() => void shareResults()}
                  disabled={!results?.length}
                  title="A link that opens this list (worked out again from the same limits)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="share-icon">
                    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  {shareMsg || "Share list"}
                </button>
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
                  {pending > 0 && (
                    <button type="button" className="link assist-pending" onClick={() => mergeRef.current?.()}>
                      {pending} new {pending === 1 ? "design" : "designs"}: show {pending === 1 ? "it" : "them"} now
                    </button>
                  )}
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
                {listed.slice(0, shown).map((r) => (
                  <div key={r.key} className="assist-card">
                    <div className="assist-card-head">
                      <b>{r.name}</b>
                      <span className="preset-tag">
                        <i className="kind-dot" style={{ background: KIND_COLORS[r.box][0] }} aria-hidden="true" />
                        {r.box === "line" && r.line
                          ? r.line.label
                          : r.bandpass
                            ? `Bandpass ${r.bandpass.order === "4" ? "4th" : "6th"} order`
                            : r.pr
                              ? `Passive radiator${r.pr.count > 1 ? ` ×${r.pr.count}` : ""}`
                              : BOX_LABEL[r.box]}
                      </span>
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
                      <Sketch curve={r.curve} color={KIND_COLORS[r.box][0]!} />
                    </div>
                    <p className="assist-facts">
                      {r.bandpass && (
                        <>
                          <span className="assist-spec">{bandpassText(r.bandpass, fmt, vol)}</span>{" "}
                        </>
                      )}
                      {r.pr && (
                        <>
                          <span className="assist-spec">
                            Tuned to {r.fb} Hz with {r.pr.count > 1 ? `${r.pr.count} × ` : "a "}
                            {r.pr.name}, {r.pr.addedMass_g} g added to {r.pr.count > 1 ? "each" : "it"}
                          </span>
                          {`; ${r.pr.count > 1 ? "they use" : "it uses"} ${Math.round(r.pr.prUse * 100)} % of ${r.pr.count > 1 ? "their" : "its"} travel when the driver reaches its Xmax${prCautionNote(r.pr.prUse, props.base.settings.prCaution_pct)}. `}
                        </>
                      )}
                      {r.box === "line" && r.line
                        ? `A line ${fmt(r.line.length_cm, "len")} long, tuned to ${r.fb} Hz${r.line.design.end === "port" ? `, with a ${fmt(r.line.design.portDiameter_cm, "len")} port at the end` : ", open at the end"}, ${
                            r.line.fold.runs === 1 ? "standing straight up (no folds) in a cabinet" : `folded in ${r.line.fold.runs} runs into a cabinet`
                          } ${fmt(r.line.fold.height_cm, "len")} tall, ${fmt(r.line.fold.width_cm, "len")} wide and ${fmt(r.line.fold.depth_cm, "len")} deep (outside)${
                            r.line.fold.bentPort ? "; the port is longer than the cabinet is tall, so bend it" : ""
                          }. `
                        : ""}
                      {r.box === "vented" && r.port && (
                        <>
                          <span className="assist-spec">
                            Tuned to {r.fb} Hz, {portText(r.port, fmt)}
                          </span>
                          {". "}
                        </>
                      )}
                      {wiringText(r, goal.drivers)}
                      Output at {goal.loudAt_hz} Hz is set by {LIMIT_TEXT[r.limitedBy]}.
                      {r.peak_db > 1.5 ? (r.bandpass ? ` ${r.peak_db.toFixed(1)} dB of ripple across the band.` : ` A ${r.peak_db.toFixed(1)} dB hump above F3.`) : ""}
                    </p>
                    {r.over.length > 0 ? (
                      <p className="warn assist-over">
                        ⚠ At {goal.power_w} W it goes past {r.over.map((o) => (o === "xmax" ? "the cone's Xmax" : o === "port" ? "the port's chuffing limit" : "the PR's Xmax")).join(" and ")}
                        {r.safe_w !== undefined ? `; it's within its limits up to about ${r.safe_w} W` : ""}.
                      </p>
                    ) : r.deep ? (
                      <p className="assist-deep">
                        Deep bass: below {r.deep.below_hz} Hz the cone goes past Xmax at {goal.power_w} W (within it up to {r.deep.safe_w} W). Fine for most music, which has little
                        energy that low; an amp with a subsonic filter removes it.
                      </p>
                    ) : (
                      <p className="assist-safe">
                        {r.subsonic
                          ? `✓ Within its limits at ${goal.power_w} W from ${r.subsonic.below_hz} Hz up. Below that the ${r.box === "pr" ? "cone or PRs go" : "cone goes"} past Xmax (within it up to ${r.subsonic.safe_w} W): use a subsonic filter if your music or films go that low.`
                          : `✓ Within its limits at ${goal.power_w} W, down to 10 Hz.`}
                      </p>
                    )}
                    {r.space && (
                      <p className="hint assist-note">
                        {r.space.fills
                          ? `Fills your space: ${vol(r.vb_l)} net, after the driver${r.port ? " and port" : r.pr ? " and passive radiators" : r.bandpass ? ", the divider and ports" : ""}.`
                          : `Uses ${vol(r.vb_l)} of the ${vol(r.space.holds_l)} your space holds for it.`}
                        {r.space.portUsesSpace ? " Its port is longer than a cube-shaped box would take: it runs along your space's longest side." : ""}
                      </p>
                    )}
                    {r.gd && (
                      <p className="assist-note">
                        Slow bass: group delay reaches {r.gd.ms} ms at {r.gd.hz} Hz, {cyclesText(r.gd.cycles)} cycles of the note (above about one, the bass starts to sound late
                        or boomy).
                      </p>
                    )}
                    {r.notes.map((n) => (
                      <p key={n} className="hint assist-note">
                        {n}
                      </p>
                    ))}
                    <div className="assist-card-actions">
                      {(() => {
                        // Sealed ↔ ported, or a line with the same driver's ported box.
                        // Sealed ↔ ported; a line or a bandpass box with the same driver's ported box.
                        const sibling = results!.find(
                          (x) =>
                            x.driverId === r.driverId &&
                            x.box !== r.box &&
                            (r.box === "line" || r.box === "bandpass" || r.box === "pr" ? x.box === "vented" : x.box === "sealed" || x.box === "vented"),
                        );
                        const open = (rs: AssistantResult[]) => {
                          const d = loadedRef.current.get(r.driverId);
                          if (d) props.onOpen(d, rs, goal);
                        };
                        return (
                          <>
                            {sibling && (
                              <button type="button" className="secondary" title="Start with this driver in both boxes, to compare them" onClick={() => open(r.box === "sealed" ? [r, sibling] : [sibling, r])}>
                                {r.box === "line" || r.box === "bandpass" || r.box === "pr" ? "Open with ported too" : "Open with sealed + ported"}
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
                {listed.length > shown && (
                  <button type="button" className="link" onClick={() => setShown(shown + PAGE)}>
                    Show {Math.min(PAGE, listed.length - shown)} more (of {listed.length})
                  </button>
                )}
              </div>
              <p className="hint finder-note">
                Each driver in the database that fits your limits, in the box the app's presets would give it (sealed Qtc 0.707, ported QB3, as WinISD sizes it unless Settings says textbook), no
                bigger than {goal.space ? "your space holds for it (after its driver, ports and passive radiators)" : "your maximum"}, with ports judged against your {portLimitOf(props.base)} m/s chuffing line{goal.boxes.includes("line") && LINE_USES.includes(goal.use) ? "; transmission lines (MLTL and classic TL from the app's line presets, narrowed to fit) for the best few drivers" : ""}, simulated at {goal.power_w} W{goal.use === "car" ? ` with ${props.base.roomGain.mode === "car" && props.base.roomGain.length_cm > 0 ? `your ${props.base.roomGain.length_cm} cm cabin's gain from the Signal tab` : props.base.roomGain.mode === "curve" && props.base.roomGain.curve ? "your cabin gain curve from the Signal tab" : "a typical 2.5 m car cabin's gain"} (output includes it; F3 is the box's own, before cabin gain, as in the summary table)` : ""}. Opening a result starts the project
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
