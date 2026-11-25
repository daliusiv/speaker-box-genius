import { compareWith, compareMessage } from "./compareDriver.ts";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  impedanceMagnitude,
  insideLongest_cm,
  lowestMode_hz,
  parseOwdr,
  parseOwpr,
  parseWdr,
  parseWpr,
  resampleMagnitude,
  type HighPassType,
  type SimulationResult,
  TS_PARAMS,
  type Assumed,
  type SimDelta,
} from "@sbg/engine";
import { Icon } from "./Icon.tsx";
import { ChartEmphasis, ChartTitleMenu, CrosshairProvider, LogChart, shortName, type ChartHandle, type Series } from "./LogChart.tsx";
import { TimeChart } from "./TimeChart.tsx";
import { addFilterAt, applyFit, changeFilterType, combineLanes, draggableEq, eqOnlyDb, eqQ, excursionLane, fitToLimits, moveEq, moveHighPass, retune, tunable, worstLimit, type AddType, type Fit, type SealedRef } from "./chartEdit.ts";
import { useUndoable } from "./useUndoable.ts";
import { setContext, track, trackOnce } from "./telemetry.ts";
import { bestVentedPort, sizeAllForDriver, sizeBandpassDesign } from "./presets.ts";
import { loadCandidates, type FinderContext } from "./PrFinder.tsx";
import { sizeForNewDriver } from "./quickStart.ts";
import { initialPanel, PanelTabs, rememberPanel, TabRow, type PanelId } from "./PanelTabs.tsx";
import {
  DEFAULT_STATE,
  decodeStateAny,
  encodeState,
  encodeStateShort,
  MAX_DESIGNS,
  newDesign,
  newId,
  swapCompare,
  type AppState,
  type BandpassDesign,
  type DesignKind,
  type DesignState,
  type EqItem,
  type Settings,
  qText,
  MAX_MEASURED,
} from "./state.ts";
import { applyOwpr, withOpenisdDriver } from "./owprImport.ts";
import { applyWpr } from "./wprImport.ts";
import { flagText, loadDriver, loadIndex, type DbIndex, type LoadedDriver } from "./library.ts";
import { changedText, modification, resetDriver, sourceFor, type LoadedDrivers } from "./driverOrigin.ts";
import { Card, DriveValue, KitFields, Num, REPO, Select, useNarrow } from "./components.tsx";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { ProgramControl } from "./ProgramControl.tsx";
import { fmtCrest, signalLabel, simStateOf } from "./programSignal.ts";
import { DriverBrowser } from "./Library.tsx";
import { PwaStatus, usePwa } from "./Pwa.tsx";
import { GettingStarted, LinkNote, useWelcome } from "./Welcome.tsx";
import { TsEditor } from "./TsEditor.tsx";
import { DriverCard } from "./DriverCard.tsx";
import { Button, Card as KitCard, Menu, Notice, Segmented, type MenuItem } from "./ui/index.ts";
import { CHART_GROUPS, defaultSlots, parseSlots, pickSlot, resolveSlots, SLOT_COUNT, slotPlace, type ChartKey } from "./chartSlots.ts";

/** What Size all does: its button's tooltip and help. */
const SIZE_ALL_HELP =
  "Sizes every box for this driver: sealed Qtc 0.707 (for a Qts near 0.707, where that box runs away, twice Vas and a higher Qtc); ported and PR the flat vented preset (QB3); both sized like WinISD unless Settings says textbook; ported with the simplest port that fits and stays quiet at the driver's rating; bandpass the lowest flat band in its volume. Undo takes it back.";
import { VolumePanel } from "./VolumePanel.tsx";
import { BuildSheet } from "./BuildSheet.tsx";
import { DriveSheet } from "./DriveSheet.tsx";
import { OB_FRAME,
  airOf,
  shapeOf,
  endCorrectionOf,
  amplifierLoad,
  baffleDbFor,
  lowDrive,
  ratedPowerOf,
  alignmentDriver,
  colorOf,
  dvcFactors,
  prGroupLabels,
  prXmaxes,
  dimensionsFor,
  coilLabel, driveLabel,
  driverInputOf,
  simOptionsOf,
  roomGainOf,
  lowEdge,
  minus3Points,
  transientsOf,
  compareShort,
  solveDriver,
  vbOf,
  switchDrive,
  builtVbOf,
  backDepthOf,
  limitsOf,
  checkFromHz,
  portLimitOf,
  presetPreview,
  airLimitOf,
  AIR_COMPRESSION_CAUTION,
  driveAt,
  deepSplitOf,
  DEEP_ALLOW,
  DEEP_FLOOR_HZ,
  type Limits,
  LIMIT_CHART,
  LIMIT_NAME,
  type Design,
  type LimitKind,
  onlyOpenBaffles,
} from "./sim.ts";
import { useDesigns } from "./designRunner.ts";
import { PowerChart, POWER_VIEWS, type PowerView } from "./PowerChart.tsx";
import { eta0Of } from "./sim.ts";
import { candidateInput, similarBoxes, similarJob, targetInput } from "./similarApp.ts";
import { startSearch } from "./search.ts";
import { RoomGainSection } from "./RoomGain.tsx";
import { dipoleEq } from "./dipoleEq.ts";
import { BaffleSection } from "./BafflePanel.tsx";
import { BaffleFrdSheet, loadFrd } from "./BaffleFrd.tsx";
import type { FrdFile } from "./baffleFrd.ts";
import { HighPassSection } from "./HighPass.tsx";
import { AirChart } from "./AirChart.tsx";
import { AddBoxMenu, DesignCard } from "./Designs.tsx";
import { useFolded } from "./fold.ts";
import { usePanelFit } from "./panelFit.ts";
import { addMeasured, MeasuredCard, measuredSeries } from "./Measured.tsx";
import { reportUrl, ShareButton } from "./Share.tsx";
import { DspExportPanel } from "./DspExport.tsx";
import { EqSection } from "./Eq.tsx";
import { PassiveSection } from "./Passive.tsx";
import { measurementOf, MeasurePanel, type Measurement } from "./Measure.tsx";
import { fmtQ, UnitsContext } from "./units.ts";
import { AppMenu } from "./AppMenu.tsx";
import { ExportWindow } from "./ExportWindow.tsx";
import { OpenWindow } from "./OpenWindow.tsx";
import { importKind, type ImportUse } from "./formats/imports.ts";
import { applyHornresp } from "./hornrespBox.ts";
import { readProjectFile } from "./formats/project.ts";
import { driverExtras, type ImportReport } from "./importReport.ts";
import { ImportNotice } from "./ImportNotice.tsx";
import { openResults, withDriver } from "./assistant.ts";
import type { SharedResults } from "./assistant.ts";
import { ASSISTANT_HASH, SHARED_LINK, SHARED_RESULTS, START_IN_ASSISTANT, untouched } from "./start.ts";
import { DesignAssistant } from "./DesignAssistant.tsx";
import { Logo, Sparkle } from "./Logo.tsx";
import { SUBMIT_ENDPOINT, submitDriverUrl, TURNSTILE_SITE_KEY } from "./submit.ts";
import { dbLookup, prSubmitFields, sendSubmission, submitFields } from "./submitForm.ts";
import { SubmitDialog, SubmitPrContext, type SubmitStatus } from "./SubmitDialog.tsx";
import type { SubmissionFields } from "../../db-tools/src/submission.ts";
import { fromDatabase, nameAfterTsEdit, nameKind } from "./driverName.ts";
import { measuredTs } from "./measuredTs.ts";
import { EQ_HANDLE, GUIDE, GUIDE_DIM, LIMIT } from "./palette.ts";
import { designProgram, headroomCell, sideLimitText } from "./chartProps.ts";
import { delayChart, excursionChart, impedanceChart, maxSplChart, MAX_MODES, MAX_MODE_INFO, type MaxMode, portChart, prChart, pressureChart, relRefOf, responseChart, valueAt, zaChart, type ChartInput, excursionText, XVIEWS, XVIEW_ORDER, xviewUnit, type XView } from "./chartProps.ts";

const LIMIT_RED = LIMIT.xmax;

/** What the excursion charts' other views mean (their ⓘ). None for excursion itself. */
function motionInfo(view: XView, what: "cone" | "pr", excursion: AppState["settings"]["excursion"]): ReactNode {
  if (view === "x") return undefined;
  const mass = what === "cone" ? "Mms, air load included" : "Mmp, with any added mass";
  const one = what === "cone" ? "per driver" : "per passive radiator";
  const kind = excursion === "pp" ? "peak-to-peak" : excursion === "rms" ? "RMS" : "peak";
  return (
    <>
      <p>
        {view === "pct"
          ? `Excursion as a share of Xmax (one way peak against one way peak, whatever Settings shows excursion as): 100 % is Xmax, so drivers and PRs with different Xmax read on one scale.`
          : view === "vol"
            ? `The air it moves (${kind}, ${one}): Sd × excursion. Compare a cone with its PRs: together they must move the air the port would.`
            : view === "v"
              ? `How fast it moves (${kind}, ${one}): 2πf × excursion.`
              : view === "a"
                ? `Its acceleration (${kind}, ${one}) in g (9.81 m/s²): (2πf)² × excursion.`
                : `Moving mass × acceleration (${kind}, ${one}; ${mass}), the force it pushes into the box, as VituixCAD's peak force. How several add up on the cabinet depends on which way they face.`}
      </p>
      <p>Red still marks excursion past Xmax: the dashed line or curve is Xmax in this unit, so a curve crossing it reaches Xmax. Past Xmax the model is linear and a real driver moves less than shown.</p>
    </>
  );
}
/** Runs `fn` each time `open` turns true by the user's hand (not for how the app started). */
function useOpened(open: boolean, fn: () => void) {
  const was = useRef(open);
  useEffect(() => {
    if (open && !was.current) fn();
    was.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

export type ChartId = "excursion" | "pr" | "port" | "maxspl" | "power" | "impedance" | "za" | "delay" | "transient" | "pressure" | "air";

/** The picker's two-part label: the model bold, then brand · nominal Ω · size from the database row. */
function chosenOf(
  s: AppState,
  source: { name: string; id?: string } | null,
  db: DbIndex | null | undefined,
): { model: string; meta?: string } {
  const row = source && fromDatabase(s.driverName, source) && source.id ? db?.drivers.find((r) => r.id === source.id) : undefined;
  if (!row) return { model: s.driverName.trim() || "Unnamed driver", meta: `${s.nominal_ohms} Ω` };
  const ohms = row.coil_ohms ? `${row.coil_ohms}+${row.coil_ohms} Ω` : `${row.ohms} Ω`;
  return { model: row.model, meta: [row.brand, ohms, row.size_in ? `${row.size_in}″` : null].filter(Boolean).join(" · ") };
}

export function App(props: { initial: AppState | null }) {
  const { state, setState, undo, redo, canUndo, canRedo } = useUndoable<AppState>(() => props.initial ?? DEFAULT_STATE);
  /** A discrete action (load, import, delete…): its own undo step, never merged with typing around it. */
  const setStep = (v: AppState | ((s: AppState) => AppState)) => setState(v, { step: true });
  // A short message with an Undo button after changes that replace or remove work.
  const [toast, setToast] = useState<{ text: string; id: number; action?: { label: string; run: () => void } } | null>(null);
  const notify = (text: string, action?: { label: string; run: () => void }) => setToast({ text, id: Date.now(), action });
  // Handlers that run later (a toast's button) read the state as it is then.
  const latest = useRef(state);
  const panelRef = useRef<HTMLElement>(null);
  usePanelFit(panelRef);
  latest.current = state;
  // Resize every box for the current driver with its card's preset (sealed Qtc 0.707, ported/PR QB3).
  const [sizeReport, setSizeReport] = useState<{ changed: string[]; skipped: string[] } | null>(null);
  /** One bandpass design re-sized for the driver within its present volume (undoable). */
  const sizeOneBandpass = (d: BandpassDesign) => {
    const r = sizeBandpassDesign(latest.current, d);
    if (typeof r === "string") return notify(`Couldn't size “${d.name}”: ${r}.`);
    setStep((s) => ({ ...s, designs: s.designs.map((x) => (x.id === d.id ? r.design : x)) }));
    notify(`Sized “${d.name}”: ${r.text}.`);
  };
  const sizeBoxes = () => {
    const r = sizeAllForDriver(latest.current);
    if (r.changed.length > 0) setStep(r.state);
    setSizeReport({ changed: r.changed, skipped: r.skipped });
    notify(r.changed.length > 0 ? `Sized ${r.changed.length} box${r.changed.length > 1 ? "es" : ""} for this driver.` : "No box could take its preset with this driver.");
  };
  /**
   * Open the volume calculator for a design. Linking starts from dimensions that give the
   * design's current volume (same proportions), so the simulation doesn't jump.
   */
  const openDimensions = (d: DesignState) => {
    if (state.volume.link !== d.id) {
      const dims = dimensionsFor(state, d, d.vb_l, "keep");
      setStep((s) => ({ ...s, volume: { ...(dims ?? s.volume), link: d.id } }));
      notify(
        dims
          ? `“${d.name}” now takes its volume from the calculator, sized for its ${d.vb_l} L.`
          : `“${d.name}” now takes its volume from the calculator.`,
      );
    }
    choosePanel("build");
    setPhoneView("panel");
    window.scrollTo({ top: 0 });
  };

  /** After a new driver arrives: offer to size the boxes for it. */
  const offerSizing = (name: string) => notify(`Loaded “${name}”.`, { label: "Size boxes for it", run: sizeBoxes });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  // Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z or Ctrl+Y redoes. The paste box keeps the browser's own text undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      if (e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      // Let a number box being edited commit its text first, so undo takes back the whole edit.
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (k === "y" || e.shiftKey) redo();
      else undo();
      setToast(null);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [undo, redo]);
  // The short link for the current state, once compressed (compression is asynchronous).
  const link = useRef<{ state: AppState; hash: string } | null>(null);
  const [db, setDb] = useState<DbIndex | null>(null);
  // The website form (Submit to database…): what it opened with, and where sending got to.
  const [submit, setSubmit] = useState<{ init: SubmissionFields; github: string } | null>(null);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>({ kind: "edit" });
  const openSubmit = (init: SubmissionFields, github: string) => {
    setSubmitStatus({ kind: "edit" });
    setSubmit({ init, github });
  };
  const [assistant, setAssistant] = useState(START_IN_ASSISTANT);
  /** A shared list of assistant results: undefined while the link is still being read. */
  const [shared, setShared] = useState<SharedResults | null | undefined>(SHARED_LINK ? undefined : null);
  useEffect(() => {
    if (SHARED_LINK) void SHARED_RESULTS.then(setShared);
  }, []);
  /**
   * The assistant starts projects: in this tab while it's still the untouched example, else in
   * a new tab with a fresh project (so the one in use stays as it is).
   */
  const launchAssistant = () => {
    if (untouched(latest.current)) setAssistant(true);
    else window.open(`${location.pathname}${ASSISTANT_HASH}`, "_blank", "noopener");
  };
  /**
   * Database drivers in this project (main and comparison), fetched by their stored id: their
   * published values, specs link and name. A reload or an opened link fetches them again.
   */
  const [dbDrivers, setDbDrivers] = useState<LoadedDrivers>({});
  const rememberDriver = (d: LoadedDriver) => {
    if (d.id) setDbDrivers((m) => ({ ...m, [d.id!]: d }));
  };
  useEffect(() => {
    for (const id of [state.driverOrigin, state.compare?.driverOrigin]) {
      if (!id || id in dbDrivers) continue;
      setDbDrivers((m) => (id in m ? m : { ...m, [id]: null }));
      // Offline, or no longer in the database: the driver just reads as your own.
      loadDriver(id).then(rememberDriver, () => undefined);
    }
  }, [state.driverOrigin, state.compare?.driverOrigin]);
  /** The main driver's database origin (credit line, published values); it counts while its name is unchanged or "(edited)". */
  const driverSource = sourceFor(state.driverOrigin, dbDrivers);
  const mainChange = modification(state, dbDrivers);
  // The comparison driver keeps a borrowed Xmax / Pe (it has no fields for them).
  const compareChange = state.compare ? modification(state.compare, dbDrivers, true) : null;
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const report = (text: string, assumed: Assumed[] = [], error = false) => setImportReport({ text, assumed, ...(error ? { error } : {}) });
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const wdrInput = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  // Driver card: Edit T/S and which setting rows are open (for the session).
  const [tsOpen, setTsOpen] = useState<boolean | null>(null);
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(() => new Set());
  /** Save & Export window: null closed, "" the last format, else the format to show. */
  const [exportFor, setExportFor] = useState<string | null>(null);
  /** Open / Import window, and a measurement file waiting for "use as…". */
  const [openWin, setOpenWin] = useState(false);
  /** A file Open / Import couldn't read: shown in the window (a toast would be behind it). */
  const [openError, setOpenError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dropping, setDropping] = useState(false);
  // SPL chart scale: relative to each design's passband (default) or absolute dB SPL. A view
  // preference of this browser, not part of the design.
  const [splMode, setSplMode] = useState<"relative" | "absolute">(() => {
    try {
      return localStorage.getItem("sbg.spl") === "absolute" ? "absolute" : "relative";
    } catch {
      return "relative";
    }
  });
  // Watts counted WinISD's way (Settings → Watts): said beside the Max SPL chart and the amplifier fields.
  const winisdWatts = state.settings.driveModel === "winisd" && state.drive === "watts";
  // Excursion charts (cone and PR): excursion, or the velocity, acceleration or force that goes with it. One choice for both, kept per browser.
  const [xView, setXView] = useState<XView>(() => {
    try {
      const v = localStorage.getItem("sbg.xview");
      return (XVIEW_ORDER as readonly string[]).includes(v ?? "") ? (v as XView) : "x";
    } catch {
      return "x";
    }
  });
  const chooseXView = (v: XView) => {
    setXView(v);
    try {
      localStorage.setItem("sbg.xview", v);
    } catch {
      // not remembered
    }
  };
  // Max SPL chart: the SPL itself, or the amplifier voltage, current or power it takes to get there.
  const [maxMode, setMaxMode] = useState<MaxMode>(() => {
    try {
      const v = localStorage.getItem("sbg.max");
      return MAX_MODES.find((m) => m === v) ?? "spl";
    } catch {
      return "spl";
    }
  });
  // Impedance chart: magnitude or phase.
  const [zMode, setZMode] = useState<"ohms" | "phase">(() => {
    try {
      return localStorage.getItem("sbg.z") === "phase" ? "phase" : "ohms";
    } catch {
      return "ohms";
    }
  });
  const chooseZMode = (m: "ohms" | "phase") => {
    setZMode(m);
    try {
      localStorage.setItem("sbg.z", m);
    } catch {
      // not remembered
    }
  };
  // Air distortion chart: % or dB below the fundamental, at the drive set or at max SPL.
  const [airView, setAirView] = useState<{ unit: "pct" | "dbc"; at: "now" | "max" }>(() => {
    try {
      const v = localStorage.getItem("sbg.air") ?? "";
      return { unit: v.includes("dbc") ? "dbc" : "pct", at: v.includes("max") ? "max" : "now" };
    } catch {
      return { unit: "pct", at: "now" };
    }
  });
  const [powerView, setPowerView] = useState<PowerView>(() => {
    try {
      const v = localStorage.getItem("sbg.power") as PowerView | null;
      return v && POWER_VIEWS.includes(v) ? v : "eff";
    } catch {
      return "eff";
    }
  });
  const choosePowerView = (v: PowerView) => {
    setPowerView(v);
    try {
      localStorage.setItem("sbg.power", v);
    } catch {
      // not remembered
    }
  };
  const [powerPick, setPowerPick] = useState<string | null>(null);
  const chooseAirView = (v: Partial<typeof airView>) => {
    const next = { ...airView, ...v };
    setAirView(next);
    try {
      localStorage.setItem("sbg.air", `${next.unit} ${next.at}`);
    } catch {
      // not remembered
    }
  };
  const chooseMaxMode = (m: MaxMode) => {
    setMaxMode(m);
    try {
      localStorage.setItem("sbg.max", m);
    } catch {
      // not remembered
    }
  };
  // Transmission lines: show the cone and the mouth on their own as well as the sum.
  const [showParts, setShowParts] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sbg.parts") === "on";
    } catch {
      return false;
    }
  });
  const toggleParts = () => {
    setShowParts(!showParts);
    try {
      localStorage.setItem("sbg.parts", showParts ? "off" : "on");
    } catch {
      // not remembered
    }
  };
  // Edit mode on the response chart: drag a box's tuning or an EQ point (relative view only).
  const [editing, setEditingRaw] = useState(false);
  // What the boxes and EQ were when the editor opened (Cancel puts them back), and the picked handle.
  const [editFrom, setEditFrom] = useState<{ designs: AppState["designs"]; eq: AppState["eq"]; highPass: AppState["highPass"] } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // Where the user tapped on the plot: the frequency a new filter goes at.
  const [editAt, setEditAt] = useState<number | null>(null);
  const openEditor = () => {
    setEditFrom({ designs: latest.current.designs, eq: latest.current.eq, highPass: latest.current.highPass });
    setPicked(null);
    setEditingRaw(true);
  };
  // Editing works on the relative view: the scale it was on comes back when the editor closes.
  const modeBeforeEdit = useRef<"relative" | "absolute" | null>(null);
  const closeEditor = () => {
    if (modeBeforeEdit.current) setSplMode(modeBeforeEdit.current);
    modeBeforeEdit.current = null;
    setEditingRaw(false);
    setEditFrom(null);
    setPicked(null);
    setEditAt(null);
    setAddOpen(false);
  };
  const chooseSplMode = (m: "relative" | "absolute") => {
    if (m === "absolute") closeEditor();
    setSplMode(m);
    try {
      localStorage.setItem("sbg.spl", m);
    } catch {
      // not remembered
    }
  };
  // Phones show one chart under the response at a time (excursion is one of them).
  const narrow = useNarrow();
  // Phones (< 768 px): the drive bar is one row, the value opens a sheet with W / V and the quick choices.
  const phone = useNarrow("(max-width: 767px)");
  const [driveSheet, setDriveSheet] = useState(false);
  const [transientView, setTransientView] = useState<"impulse" | "step">("impulse");
  const [chartPick, setChartPick] = useState<ChartId>(() => {
    const first: ChartId = window.matchMedia?.("(max-width: 860px)").matches ? "excursion" : "maxspl";
    try {
      return (localStorage.getItem("sbg.chart") as ChartId | null) ?? first;
    } catch {
      return first;
    }
  });
  const chooseChart = (c: ChartId) => {
    setChartPick(c);
    track("chart_viewed", { chart: c });
    try {
      localStorage.setItem("sbg.chart", c);
    } catch {
      // not remembered
    }
  };
  // Desktop: each chart slot shows the chart picked in its title's menu (two rows of two on a
  // wide screen; one per row shows the first three). The old single pick seeds the third slot.
  const [slots, setSlots] = useState<ChartKey[]>(() => {
    try {
      return parseSlots(localStorage.getItem("sbg.chartSlots")) ?? defaultSlots(localStorage.getItem("sbg.chart"));
    } catch {
      return defaultSlots();
    }
  });
  // A measured response or impedance, picked from a chart's menu.
  const measuredInput = useRef<HTMLInputElement>(null);
  const measuredUse = useRef<"overlay-response" | "overlay-impedance">("overlay-response");
  // What the slots show this render (for jumps to a chart from the summary and notes).
  const shownRef = useRef<ChartKey[]>([]);
  const saveSlots = (next: ChartKey[]) => {
    setSlots(next);
    try {
      localStorage.setItem("sbg.chartSlots", JSON.stringify(next));
    } catch {
      // not remembered
    }
  };
  // Two charts a row only fit when the charts column is at least 1280 px (a window about 1700 px wide).
  const twoFit = useNarrow("(min-width: 1700px)");
  const [perRowPick, setPerRowPick] = useState<1 | 2>(() => {
    try {
      return localStorage.getItem("sbg.chartsPerRow") === "1" ? 1 : 2;
    } catch {
      return 2;
    }
  });
  const choosePerRow = (n: 1 | 2) => {
    setPerRowPick(n);
    track("setting_changed", { key: "charts_per_row" });
    try {
      localStorage.setItem("sbg.chartsPerRow", String(n));
    } catch {
      // not remembered
    }
  };
  const perRow: 1 | 2 = twoFit ? perRowPick : 1;
  // Which group of controls the left column shows.
  const [panel, setPanel] = useState<PanelId>(initialPanel);
  const choosePanel = (p: PanelId) => {
    if (p !== panel) track("tab_viewed", { tab: p });
    setPanel(p);
    rememberPanel(p);
  };
  // What crash reports say is open: box types, tab, chart and where the driver came from (never the design).
  const boxTypes = [...new Set(state.designs.map((d) => d.kind))].sort().join();
  const driverFrom = fromDatabase(state.driverName, driverSource) ? "database" : "custom";
  useEffect(() => {
    setContext({ box_types: boxTypes ? (boxTypes.split(",") as DesignKind[]) : [], design_count: state.designs.length, driver_source: driverFrom, panel, chart: chartPick });
  }, [boxTypes, state.designs.length, driverFrom, panel, chartPick]);
  // Phones show one screen at a time: the charts, or one panel of controls (bottom tab bar).
  const [phoneView, setPhoneView] = useState<"charts" | "panel">("charts");
  /** Set by the launcher's "I have a speaker driver": the driver picked next is shown on the charts. */
  const pickToCharts = useRef(false);
  const showOnPhone = (v: "charts" | "panel", p?: PanelId) => {
    // Moving on by hand ends the launcher's errand.
    pickToCharts.current = false;
    if (p) choosePanel(p);
    setPhoneView(v);
    window.scrollTo({ top: 0 });
  };
  /**
   * Shows the chart for a limit (cone, PR or port), scrolls to it and flashes it, with the
   * boxes in `ids` picked out; no limit means the response chart.
   */
  const jumpTo = (kind: LimitKind | null, ids: string[]) => showChart(kind ? LIMIT_CHART[kind] : "response", ids);
  /** Bring a chart into view (switching to it, and to the charts on phones), flashing it with these designs emphasised. */
  const showChart = (chart: ChartId | "response", ids: string[]) => {
    if (narrow) {
      if (chart !== "response") chooseChart(chart);
    } else if (!shownRef.current.includes(chart)) {
      // Not on screen: it takes the third slot (the first two hold response and excursion by default).
      saveSlots(pickSlot(slots, shownRef.current, 2, chart));
      track("chart_viewed", { chart });
    }
    setPhoneView("charts");
    setFocusIds(ids.length ? ids : null);
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`figure[data-chart="${chart}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("flash");
      void el.offsetWidth; // restart the animation
      el.classList.add("flash");
    }, 60);
  };
  /** Bring the .zma panel (at the top of the Driver tab) into view after it opens, clear of the sticky box strip. */
  const showMeasurePanel = () =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.getElementById("measure-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })),
    );
  const welcome = useWelcome();
  const folds = useFolded();
  const pwa = usePwa();

  useEffect(() => {
    loadIndex().then(setDb, () => setDb(null));
  }, []);

  // Keep the URL in sync so the address bar is always a shareable (short) link.
  useEffect(() => {
    let live = true;
    const id = setTimeout(() => {
      encodeStateShort(state).then((hash) => {
        if (!live) return;
        link.current = { state, hash };
        history.replaceState(null, "", "#" + hash);
      });
    }, 150);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [state]);

  useEffect(() => {
    const onHash = () => {
      // Our own replaceState doesn't fire hashchange; this is a pasted or edited link.
      decodeStateAny(location.hash).then((s) => {
        if (s) {
          setStep(s);
          notify("Opened the design from the link.");
        }
      });
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const solved = useMemo(() => solveDriver(state), [state.ts, state.settings.air]); // eslint-disable-line react-hooks/exhaustive-deps
  // A change to the program signal alone needs no new simulation (Max SPL on a program comes from the stored ceilings).
  const simRef = useRef<AppState | null>(null);
  const simState = simStateOf(simRef.current, state);
  simRef.current = simState;
  // In a worker: the charts keep the last run until the new one lands (designRunner.ts).
  const designs = useDesigns(simState, solved);
  const freq = designs[0]?.result.freq ?? new Float64Array();

  const set = <K extends keyof AppState>(k: K, v: AppState[K]) => setState((s) => ({ ...s, [k]: v }));
  // The Driver curve window (Signal → Baffle step, Save & Export, Open / Import): its curve stays for the session, never in links.
  const [frdOpen, setFrdOpen] = useState(false);
  const [frdFile, setFrdFile] = useState<FrdFile | null>(null);
  const [frdError, setFrdError] = useState<string | null>(null);
  const openFrdWith = async (f: File) => {
    const r = await loadFrd(f);
    if (r.file) setFrdFile(r.file);
    setFrdError(r.error);
    setFrdOpen(true);
  };

  // Comparison driver: its curves faint (and dashed) behind the main ones.
  const fadedLabels = useMemo(() => designs.filter((d) => d.compare).map((d) => d.label), [designs]);
  // After a jump to a limit, the boxes over it stand out for a few seconds (the rest fade).
  const [focusIds, setFocusIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (!focusIds) return;
    const t = setTimeout(() => setFocusIds(null), 3500);
    return () => clearTimeout(t);
  }, [focusIds]);
  const emphasis = useMemo(
    () => (focusIds ? designs.filter((d) => d.compare || !focusIds.includes(d.design.id)).map((d) => d.label) : fadedLabels),
    [focusIds, designs, fadedLabels],
  );
  const mainDesigns = useMemo(() => designs.filter((d) => !d.compare), [designs]);
  // Anonymous usage stats (telemetry.ts): which tools get opened, and which limits people run into.
  useOpened(assistant, () => track("tool_opened", { tool: "assistant" }));
  useOpened(measureOpen, () => track("tool_opened", { tool: "measure" }));
  useOpened(frdOpen, () => track("tool_opened", { tool: "baffle_frd" }));
  useOpened(openWin, () => track("tool_opened", { tool: "open_window" }));
  useOpened(exportFor !== null, () => track("tool_opened", { tool: "export_window" }));
  useOpened(submit !== null, () => submit && track("submit_opened", { kind: submit.init.kind }));
  useEffect(() => {
    for (const d of mainDesigns) {
      const l = limitsOf(d.result, state.xmax_mm, state.highPass.on, portLimitOf(state), airLimitOf(state));
      for (const k of l.over) trackOnce(`warn:${d.design.id}:${k}`, "warning_shown", { warning: k, box_type: d.design.kind });
      if (l.deep) trackOnce(`warn:${d.design.id}:deep`, "warning_shown", { warning: "xmax_deep", box_type: d.design.kind });
    }
  }, [mainDesigns, state]);
  const series = (pick: (r: SimulationResult) => Float64Array | null): Series[] =>
    designs.map((d) => ({ label: d.label, color: d.color, dash: d.dash, y: pick(d.result) }));

  const useRatedPower = () => setStep((s) => ({ ...s, drive: "watts", power: ratedPowerOf(s) }));

  // The short link once it's ready for this exact state; until then (150 ms after an edit) the long form, which is always correct.
  const shareUrl = () =>
    location.origin + location.pathname + "#" + (link.current?.state === state ? link.current.hash : encodeState(state));

  const importWdr = async (file: File) => {
    try {
      // WinISD saves in the Windows code page; latin1 keeps most names intact.
      const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
      if (/^\[Box\]/im.test(text)) return importWpr(file.name, text);
      if (/^\s*\{/.test(text)) return importOpenisd(file.name, new TextDecoder("utf-8").decode(await file.arrayBuffer()));
      const d = parseWdr(text);
      const x = driverExtras(d);
      offerSizing([d.brand, d.model].filter(Boolean).join(" ") || file.name);
      setStep((s) => ({
        ...s,
        driverName: [d.brand, d.model].filter(Boolean).join(" ") || file.name.replace(/\.wdr$/i, ""),
        driverBrand: d.brand,
        driverOrigin: undefined,
        nominal_ohms: x.nominal_ohms,
        ts: d.ts,
        le_mh: x.le_mh,
        l2_mh: 0,
        r2_ohm: 0,
        semi: undefined,
        fdd: undefined,
        xmax_mm: x.xmax_mm,
        pe_w: x.pe_w,
        rth_k_w: 0,
        tmax_C: 200,
        dvc:
          (d.voiceCoils ?? 1) > 1
            ? { on: true, entered: d.raw.vccon === "2" ? "series" : "parallel", wired: d.raw.vccon === "2" ? "series" : "parallel" }
            : { ...s.dvc, on: false },
        volume: {
          ...s.volume,
          ...(d.displacement_l !== undefined ? { driverDisp_l: Math.round(d.displacement_l * 100) / 100 } : {}),
          driverCutout_mm: 0,
          driverDepth_mm: 0,
        },
      }));
      report(`Imported ${file.name}.`, x.assumed);
      track("import_done", { kind: "winisd" });
      track("driver_set", { source: "import", slot: "main" });
    } catch (e) {
      track("import_failed", { kind: "winisd", reason: "unreadable" });
      report(`Couldn't read ${file.name}: ${(e as Error).message}`, [], true);
    }
  };

  /** An OpenISD project (.owpr) or driver (.owdr): both are JSON. */
  const importOpenisd = (fileName: string, text: string) => {
    try {
      const raw = JSON.parse(text);
      if (raw && typeof raw === "object" && "specs" in raw) {
        const d = parseOwdr(text);
        const name = [d.brand, d.model].filter(Boolean).join(" ") || fileName.replace(/\.owdr$/i, "");
        offerSizing(name);
        setStep((s) => withOpenisdDriver(s, d, name));
        report(`Imported OpenISD driver ${fileName}.`, driverExtras(d).assumed);
        track("import_done", { kind: "winisd" });
        track("driver_set", { source: "import", slot: "main" });
        return;
      }
      const p = parseOwpr(text);
      // The notes don't depend on the rest of the state, so take them from the current one.
      const { notes, assumed } = applyOwpr(state, p, fileName);
      notify(`Imported ${fileName}.`);
      setStep((s) => applyOwpr(s, p, fileName).state);
      report(`Imported OpenISD project ${fileName} with its drive, amplifier resistance and box losses. ${notes.join(" ")}`.trim(), assumed);
      track("import_done", { kind: "winisd" });
    } catch (e) {
      track("import_failed", { kind: "winisd", reason: "unreadable" });
      report(`Couldn't read ${fileName}: ${(e as Error).message}`, [], true);
    }
  };

  /** A WinISD project: driver, settings that affect the result, and the box as a new design (wprImport.ts). */
  const importWpr = (fileName: string, text: string) => {
    try {
      const p = parseWpr(text);
      // The message doesn't depend on the rest of the state, so take it from the current one.
      const { message, assumed } = applyWpr(state, p, fileName);
      notify(`Imported ${fileName}.`);
      setStep((s) => applyWpr(s, p, fileName).state);
      report(message, assumed);
      track("import_done", { kind: "winisd" });
    } catch (e) {
      track("import_failed", { kind: "winisd", reason: "unreadable" });
      report(`Couldn't read ${fileName}: ${(e as Error).message}`, [], true);
    }
  };

  /** Any file from the Open window or dropped on the page: open it, or ask how to use a measurement. */
  const importFile = async (f: File) => {
    const head = new TextDecoder("latin1").decode(await f.slice(0, 4096).arrayBuffer());
    const kind = importKind(f.name, head);
    if (kind === null) {
      track("import_failed", { reason: "unknown_type" });
      const message = `${f.name}: not a file Speaker Box Genius reads.`;
      // In Open / Import the window would hide a toast: say it there, under Choose a file.
      return openWin ? setOpenError(message) : notify(message);
    }
    setOpenError(null);
    if (kind === "measurement") {
      setPendingFile(f);
      setOpenWin(true);
      return;
    }
    setOpenWin(false);
    setPendingFile(null);
    if (kind === "project") {
      const opened = readProjectFile(await f.text());
      if (!opened) {
        track("import_failed", { kind: "project", reason: "not_project" });
        return notify(`${f.name} isn't a Speaker Box Genius project file.`);
      }
      track("import_done", { kind: "project" });
      setStep(opened.state);
      if (opened.dropped > 0) {
        const n = opened.dropped;
        report(`Opened “${opened.state.driverName}”. ${n} box${n > 1 ? "es" : ""} of a type this version doesn't know ${n > 1 ? "weren't" : "wasn't"} opened.`);
        return notify(`Opened “${opened.state.driverName}” without ${n} box${n > 1 ? "es" : ""}.`, { label: "Details", run: () => showOnPhone("panel", "driver") });
      }
      return notify(`Opened “${opened.state.driverName}”.`);
    }
    if (kind === "hornresp") {
      const r = applyHornresp(state, await f.text(), f.name);
      if (typeof r === "string") {
        track("import_failed", { kind: "hornresp", reason: "unreadable" });
        return notify(`${f.name}: ${r}`);
      }
      track("import_done", { kind: "hornresp" });
      setStep(() => r.state);
      showOnPhone("panel", "boxes");
      report(r.message, r.assumed);
      const n = r.assumed.length;
      return notify(
        n > 0 ? `Opened ${f.name}: ${n} value${n > 1 ? "s" : ""} assumed.` : r.message,
        n > 0 ? { label: "See what was assumed", run: () => showOnPhone("panel", "driver") } : undefined,
      );
    }
    // WinISD / OpenISD: the result (and any notes) shows on the driver card.
    showOnPhone("panel", "driver");
    await importWdr(f);
  };

  const applyImport = async (f: File, use: ImportUse) => {
    setPendingFile(null);
    setOpenWin(false);
    try {
      track("import_done", { kind: "measurement", use });
      if (use === "driver-on-baffle") {
        await openFrdWith(f);
        return;
      }
      if (use === "measure-driver") {
        setMeasurement(await measurementOf(f));
        setMeasureOpen(true);
        showOnPhone("panel", "driver");
        showMeasurePanel();
        return;
      }
      const r = await addMeasured(f, use === "overlay-response" ? "spl" : "impedance", state.measured, mainDesigns);
      setStep((s) => ({ ...s, measured: r.list }));
      notify(r.message);
    } catch (e) {
      track("import_failed", { kind: "measurement", use, reason: "unreadable" });
      notify(`${f.name}: ${(e as Error).message}.`);
    }
  };

  // Ctrl/⌘+S: Save & Export, at "Save in this browser" (Enter saves). Ctrl/⌘+O: Open / Import.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        setExportFor("browser");
      } else if (k === "o") {
        e.preventDefault();
        setOpenWin(true);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // Drop a file anywhere on the page to open it.
  const importRef = useRef(importFile);
  importRef.current = importFile;

  // The installed app (desktop Chrome/Edge) opens .sbgenius files double-clicked in the file manager.
  useEffect(() => {
    const queue = (window as { launchQueue?: LaunchQueue }).launchQueue;
    queue?.setConsumer(async (params) => {
      const handle = params.files?.[0];
      if (handle) void importRef.current(await handle.getFile());
    });
  }, []);
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDropping(true);
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDropping(false);
    };
    const drop = (e: DragEvent) => {
      setDropping(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      const f = e.dataTransfer?.files[0];
      if (f) void importRef.current(f);
    };
    addEventListener("dragover", over);
    addEventListener("dragleave", leave);
    addEventListener("drop", drop);
    return () => {
      removeEventListener("dragover", over);
      removeEventListener("dragleave", leave);
      removeEventListener("drop", drop);
    };
  }, []);

  const hp = state.highPass;

  const updateDesign = (d: DesignState) =>
    setState((s) => ({ ...s, designs: s.designs.map((x) => (x.id === d.id ? d : x)) }));
  // A box just added from the menu: scrolled to (and flashed) once it's on the page.
  const scrollToNew = useRef<string | null>(null);
  const addDesign = (kind: DesignState["kind"]) => {
    if (state.designs.length >= MAX_DESIGNS) return;
    const d = newDesign(kind, state.designs);
    track("design_added", { box_type: kind });
    scrollToNew.current = d.id;
    setStep((s) => (s.designs.length >= MAX_DESIGNS ? s : { ...s, designs: [...s.designs, d] }));
  };
  useEffect(() => {
    const id = scrollToNew.current;
    if (!id) return;
    scrollToNew.current = null;
    const el = document.querySelector<HTMLElement>(`[data-design="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  }, [state.designs]);
  const duplicateDesign = (d: DesignState) =>
    setStep((s) => {
      if (s.designs.length >= MAX_DESIGNS) return s;
      const copy = { ...structuredClone(d), id: newId(s.designs), name: `${d.name} (copy)` };
      const i = s.designs.findIndex((x) => x.id === d.id);
      return { ...s, designs: [...s.designs.slice(0, i + 1), copy, ...s.designs.slice(i + 1)] };
    });
  const deleteDesign = (d: DesignState) => {
    setStep((s) => ({
      ...s,
      eq: s.eq.map((e) => (e.target === d.id ? { ...e, target: "all", on: false } : e)),
      designs: s.designs.filter((x) => x.id !== d.id),
      volume: s.volume.link === d.id ? { ...s.volume, link: "none" } : s.volume,
    }));
    notify(`Deleted “${d.name}”.`);
  };

  // Every design with passive radiators (PR boxes, and bandpass chambers that use them).
  const prDesigns = designs.filter((d) => d.result.prGroups);

  const zaDesigns = mainDesigns.filter((d) => d.result.acousticImpedance);

  // The charts under the tab row: one at a time, the choice remembered; unavailable ones are left out.
  const hasPr = prDesigns.length > 0;
  const hasPort = designs.some((d) => d.result.portVelocity || d.result.rearPortVelocity);
  const hasBoxPressure = designs.some((d) => d.result.boxPressurePa && !(d.design.kind === "ib" && d.design.rear === "open") && d.design.kind !== "ob");
  const hasAir = designs.some((d) => d.result.airHd2);
  const hasPower = designs.some((d) => d.result.power);
  // A dot on the charts where a box is over its limit at this drive (as in the summary).
  const overCharts = new Set(
    designs.filter((d) => !d.compare).flatMap((d) => limitsOf(d.result, state.xmax_mm, state.highPass.on, portLimitOf(state), airLimitOf(state)).over.map((k) => LIMIT_CHART[k])),
  );
  const chartTabs: { id: ChartId; label: string; alert?: string }[] = [
    ...(narrow ? [{ id: "excursion" as const, label: "Excursion", alert: overCharts.has("excursion") ? "A box is past Xmax" : undefined }] : []),
    ...(hasPr ? [{ id: "pr" as const, label: "PR excursion", alert: overCharts.has("pr") ? "A passive radiator is past its Xmax" : undefined }] : []),
    ...(hasPort ? [{ id: "port" as const, label: "Port speed", alert: overCharts.has("port") ? "A port is over the chuffing line" : undefined }] : []),
    { id: "maxspl", label: "Max SPL" },
    ...(hasPower ? [{ id: "power" as const, label: "Power" }] : []),
    { id: "impedance", label: "Impedance" },
    ...(hasBoxPressure ? [{ id: "pressure" as const, label: "Box pressure" }] : []),
    ...(hasAir ? [{ id: "air" as const, label: "Air distortion", alert: overCharts.has("air") ? "A design's air distortion is over the limit" : undefined }] : []),
    ...(zaDesigns.length > 0 ? [{ id: "za" as const, label: "Line load (Za)" }] : []),
    { id: "delay", label: "Group delay" },
    { id: "transient", label: "Impulse / step" },
  ];
  const chartTab: ChartId = chartTabs.some((t) => t.id === chartPick) ? chartPick : chartTabs[0]!.id;
  // Desktop slots: what this project has to show, and what each slot shows.
  const availableCharts = new Set<ChartKey>(["response", "excursion", "maxspl", "impedance", "delay", "transient"]);
  if (hasPr) availableCharts.add("pr");
  if (hasPort) availableCharts.add("port");
  if (hasBoxPressure) availableCharts.add("pressure");
  if (hasAir) availableCharts.add("air");
  if (hasPower) availableCharts.add("power");
  if (zaDesigns.length > 0) availableCharts.add("za");
  const shown = resolveSlots(slots, availableCharts).slice(0, perRow === 2 ? SLOT_COUNT : 3);
  shownRef.current = shown;
  /** Whether a chart (with its notes) is on screen: phones by tab, desktops by slot. */
  const onScreen = (k: ChartKey) => (narrow ? k === "response" || k === chartTab : shown.includes(k));
  /** A desktop chart's place in the grid (its slot); phones keep the page order. */
  const cellStyle = (k: ChartKey) => (narrow ? undefined : { order: shown.indexOf(k) });
  const chooseSlot = (i: number, k: ChartKey) => {
    saveSlots(pickSlot(slots, shown, i, k));
    track("chart_viewed", { chart: k });
  };
  /** Desktop chart titles: a menu of every chart this project has; picking one shown elsewhere swaps the two. */
  const titleMenu = (chartId: string, name: string) => {
    const i = shown.indexOf(chartId as ChartKey);
    if (i < 0) return <span className="chart-title">{name}</span>;
    const items: MenuItem[] = CHART_GROUPS.flatMap((g) => {
      const charts = g.charts.filter((c) => availableCharts.has(c.key));
      if (charts.length === 0) return [];
      return [
        { kind: "heading" as const, label: g.heading },
        ...charts.map((c) => {
          const j = shown.indexOf(c.key);
          return {
            label: c.name,
            detail: c.unit || undefined,
            checked: j === i,
            description: j >= 0 && j !== i ? `Shown ${slotPlace(j, perRow)}: picking it swaps` : undefined,
            onSelect: () => chooseSlot(i, c.key),
          };
        }),
      ];
    });
    // The charts a measurement is drawn on offer to add one (up to the limit).
    const overlay = chartId === "response" ? "overlay-response" : chartId === "impedance" ? "overlay-impedance" : null;
    if (overlay && state.measured.length < MAX_MEASURED) {
      items.push(
        { kind: "separator" },
        {
          label: overlay === "overlay-response" ? "Add a measured response (.frd)…" : "Add a measured impedance (.zma)…",
          description: "Your finished box, over the simulation",
          onSelect: () => {
            const input = measuredInput.current;
            if (!input) return;
            measuredUse.current = overlay;
            input.accept = overlay === "overlay-response" ? ".frd,.txt,.csv" : ".zma,.txt,.csv,.dat";
            input.click();
          },
        },
      );
    }
    // The menu's own name for the chart, whatever view it's on (SPL, velocity, amp volts): the view
    // shows in its switch and the note in the plot's corner, so the title matches its menu item.
    const label = CHART_GROUPS.flatMap((g) => g.charts).find((c) => c.key === chartId)?.name ?? name;
    return <Menu label={label} ariaLabel={`Chart: ${label}`} variant="ghost" className="chart-pick" items={items} />;
  };
  // Impulse and step: worked out only while that chart is showing (a few thousand frequencies per box).
  const transients = useMemo(
    () => (onScreen("transient") ? transientsOf(state, solved, mainDesigns) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onScreen("transient"), state, solved, mainDesigns],
  );

  // Edit mode's handles: each ported or PR box's tuning (on its curve), and each EQ point.
  const units = state.settings.units;
  const chartHandles: ChartHandle[] = !editing
    ? []
    : [
        ...mainDesigns
          .filter((d) => tunable(d.design) && d.result.summary.fb !== undefined)
          .map((d): ChartHandle => {
            const fb = d.result.summary.fb!;
            const x = d.design;
            return {
              id: `fb-${x.id}`,
              f: fb,
              y: valueAt(d.result.freq, d.result.spl, fb) - relRefOf(d.result),
              color: d.color,
              shape: "diamond",
              axes: "x",
              label: `${x.name}: tuning`,
              text:
                `Fb ${fb.toFixed(1)} Hz · ` +
                (x.kind === "vented" ? `port ${fmtQ(x.length_cm, "len", units)}` : x.kind === "pr" ? `${x.addedMass_g} g added` : ""),
              onDrag: (f, _y, start) => setState((s) => retune(s, x.id, f), start ? { start: true } : { hold: true }),
            };
          }),
        ...state.eq.filter(draggableEq).map(
          (e, i): ChartHandle => ({
            id: `eq-${e.id}`,
            f: e.freq,
            y: e.gain_db,
            // White, so an EQ point never looks like one of the boxes' curves.
            color: EQ_HANDLE,
            shape: "dot",
            axes: "xy",
            label: `EQ ${i + 1} (${e.type === "peak" ? "peaking" : e.type === "highshelf" ? "high shelf" : "low shelf"})`,
            text: `${e.freq} Hz · ${e.gain_db > 0 ? "+" : ""}${e.gain_db} dB · Q ${e.q}`,
            onDrag: (f, g, start) => setState((s) => moveEq(s, e.id, f, g), start ? { start: true } : { hold: true }),
            onWheel: (up) => setState((s) => eqQ(s, e.id, up)),
            onRemove: () => removeEq(e.id),
          }),
        ),
        ...(state.highPass.on
          ? [
              {
                id: "hp",
                f: state.highPass.freq,
                y: state.highPass.type === "linkwitz-riley" ? -6 : -3,
                color: EQ_HANDLE,
                shape: "triangle",
                axes: "x",
                label: "High-pass",
                text: `${state.highPass.freq} Hz · ${state.highPass.order * 6} dB/oct`,
                onDrag: (f: number, _y: number, start?: boolean) => setState((s) => moveHighPass(s, f), start ? { start: true } : { hold: true }),
                onRemove: () => {
                  setStep((s) => ({ ...s, highPass: { ...s.highPass, on: false } }));
                  setPicked(null);
                },
              } as ChartHandle,
            ]
          : []),
      ];
  // Adds a filter at the tapped frequency (40 Hz without a tap) as one undo step.
  // A sealed main design a Linkwitz Transform can correct.
  const sealedRef = useMemo(() => {
    const sd = mainDesigns.find((d) => (d.design.kind === "sealed" || d.design.kind === "ib") && d.result.summary.fc !== undefined && d.result.summary.qtc !== undefined);
    return sd ? { id: sd.design.id, fc: sd.result.summary.fc!, qtc: sd.result.summary.qtc! } : null;
  }, [mainDesigns]);
  // The sealed box a filter with this target can become a Linkwitz Transform for: its own box when
  // sealed, or for "all" the only sealed box (with two, which one would be a guess).
  const sealedOf = (target: string | null): SealedRef | null => {
    const ds = mainDesigns.filter(
      (d) => (target === null || target === "all" || d.design.id === target) && (d.design.kind === "sealed" || d.design.kind === "ib") && d.result.summary.fc !== undefined && d.result.summary.qtc !== undefined,
    );
    const sd = ds.length === 1 ? ds[0]! : null;
    return sd ? { id: sd.design.id, fc: sd.result.summary.fc!, qtc: sd.result.summary.qtc! } : null;
  };
  const addAt = (type: AddType) => {
    const { state: next, picked: pk } = addFilterAt(latest.current, type, editAt ?? 40, sealedRef);
    if (next !== latest.current) setStep(() => next);
    setPicked(pk);
    setEditAt(null);
    setAddOpen(false);
  };
  const atLabel = editAt === null ? "" : `${editAt < 100 ? editAt.toFixed(1) : Math.round(editAt)} Hz`;
  const removeEq = (id: string) => {
    setStep((s) => ({ ...s, eq: s.eq.filter((x) => x.id !== id) }));
    setPicked(null);
  };
  // Cancel: the boxes and EQ as they were when the editor opened (one undo step), then close.
  const editChanged = editFrom !== null && (editFrom.designs !== state.designs || editFrom.eq !== state.eq || editFrom.highPass !== state.highPass);
  const cancelEdit = () => {
    if (editFrom && editChanged) {
      const from = editFrom;
      setStep((s) => ({ ...s, designs: from.designs, eq: from.eq, highPass: from.highPass }));
      notify("Chart edits cancelled.");
    }
    closeEditor();
  };
  // Any picked EQ item (chips can pick Linkwitz and items that are off, which have no chart handle).
  const pickedItem = picked?.startsWith("eq-") ? state.eq.find((e) => `eq-${e.id}` === picked) : undefined;
  // "+ Add" opens the filter types inline; it closes on any pick, add, Done or Cancel.
  const [addOpen, setAddOpen] = useState(false);
  // A field edit on an EQ item: typing a number in quick keystrokes merges into one undo step.
  const patchEq = (id: string, patch: Record<string, number>) =>
    setState((s) => ({ ...s, eq: s.eq.map((x) => (x.id === id ? ({ ...x, ...patch } as EqItem) : x)) }));
  // The EQ and high-pass as they were when a filter was picked: the cross puts them back, even
  // after a type change (which can touch both). Retyping keeps the snapshot it started from.
  const pickSnap = useRef<{ eq: AppState["eq"]; highPass: AppState["highPass"] } | null>(null);
  const retyped = useRef(false);
  useEffect(() => {
    if (retyped.current) {
      retyped.current = false;
      return;
    }
    pickSnap.current = picked ? { eq: latest.current.eq, highPass: latest.current.highPass } : null;
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tick: keep the filter exactly as it is and close the panel.
  const keepPicked = () => setPicked(null);
  // "Cut to …": apply the offered fix (one step); the panel stays open.
  const fixPicked = () => {
    if (!pickedItem || !pickedFix) return;
    const id = pickedItem.id;
    const fit = pickedFix.fit;
    setStep((s) => applyFit(s, id, fit));
  };
  // Cross: back to how the EQ and high-pass were when picked, in one step, and close.
  const revertPicked = () => {
    const snap = pickSnap.current;
    if (snap) setStep((s) => ({ ...s, eq: snap.eq, highPass: snap.highPass }));
    setPicked(null);
  };
  const deletePicked = () => {
    if (pickedItem) removeEq(pickedItem.id);
    else {
      setStep((s) => ({ ...s, highPass: { ...s.highPass, on: false } }));
      setPicked(null);
    }
  };
  // The type menu: change the picked filter in place, as one step.
  const changeType = (to: AddType) => {
    if (!picked) return;
    const { state: next, picked: pk } = changeFilterType(latest.current, picked, to, sealedOf(pickedTarget));
    if (next === latest.current) return;
    setStep(() => next);
    if (pk !== picked) retyped.current = true;
    setPicked(pk);
  };
  const pickChip = (id: string) => {
    setPicked(id);
    setEditAt(null);
    setAddOpen(false);
  };

  // Passive radiator finder and the other box tools: the main driver and drive as the charts use them.
  const finderCtx = useMemo<FinderContext>(
    () => ({
      driver: solved.missing.length > 0 ? null : driverInputOf(state, solved),
      sim: simOptionsOf(state, true),
      losses: { ql: state.settings.losses.ql, qa: state.settings.losses.qa },
      fMin: checkFromHz(state.highPass.on),
      align: alignmentDriver(solved, state),
      drivers: state.drivers,
    }),
    [state, solved],
  );
  // The impedance chart's extra curves: measured impedance, and the free-air measurement and its fit.
  const impedanceExtra: Series[] = [
    ...measuredSeries(state.measured, "impedance", freq, mainDesigns),
    ...(measurement
      ? [
          { label: "Measured (free air)", color: GUIDE_DIM, dash: "6 4", y: resampleMagnitude(measurement.data, freq) },
          { label: "Fit (free air)", color: GUIDE, dash: "2 3", y: freq.map((f) => impedanceMagnitude(measurement.fit, f)) },
        ]
      : []),
  ];
  // What the charts draw (shared with the guide pages).
  const chartInput: ChartInput = {
    state,
    designs,
    showParts,
    sd_cm2: finderCtx.driver?.sd_cm2,
    measured: (relative) => measuredSeries(state.measured, "spl", freq, mainDesigns, relative),
  };

  // Edit mode: new filters and the cursor go to one box, the picked EQ item's, else the first.
  const pickedTarget = pickedItem?.target ?? null;
  const editTarget = (pickedTarget && mainDesigns.some((d) => d.design.id === pickedTarget) ? pickedTarget : mainDesigns[0]?.design.id) ?? "";
  // The EQ on its own (dashed), so its gain shares the relative axis with the curves.
  const eqOnly = useMemo(
    () => (editing && (state.highPass.on || state.eq.some((e) => e.on)) ? eqOnlyDb(state.eq, state.highPass, freq, editTarget) : null),
    [editing, state.eq, state.highPass, freq, editTarget],
  );
  // Limit lane: where the boxes being edited are near or past a limit (all boxes when the pick targets "all").
  const limitLane = useMemo(() => {
    if (!editing) return null;
    const ds = !picked || pickedTarget === "all" || pickedTarget === null ? mainDesigns : mainDesigns.filter((d) => d.design.id === editTarget);
    return combineLanes(ds.map((d) => excursionLane(d.result, state.xmax_mm, state.highPass.on, portLimitOf(state), 0.8, airLimitOf(state))));
  }, [editing, picked, pickedTarget, mainDesigns, editTarget, state]);
  // The lane's label: the first box past a limit (and how many more), else near, else fine.
  const limitsText = useMemo(() => {
    if (!editing || !limitLane) return "";
    const ds = !picked || pickedTarget === "all" || pickedTarget === null ? mainDesigns : mainDesigns.filter((d) => d.design.id === editTarget);
    const over = ds
      .map((d) => ({ d, w: worstLimit(d.result, state.xmax_mm, state.highPass.on, portLimitOf(state), airLimitOf(state)) }))
      .filter((x): x is { d: Design; w: NonNullable<typeof x.w> } => x.w !== null && x.w.ratio > 1);
    if (over.length > 0) {
      const { d, w } = over[0]!;
      return `${d.label}: ${LIMIT_NAME[w.kind]} ${Math.round(w.ratio * 100)} % at ${w.f < 100 ? w.f.toFixed(1) : Math.round(w.f)} Hz${over.length > 1 ? ` · ${over.length - 1} more` : ""}`;
    }
    return limitLane.includes("near") ? "Near a limit (80 %+)" : "Within limits";
  }, [editing, limitLane, picked, pickedTarget, mainDesigns, editTarget, state]);
  // Fix for the picked filter: the most restrictive fit over the boxes it applies to, and the
  // worst limit it is past now (the reason shown beside the button).
  const pickedFix = useMemo(() => {
    const it = pickedItem;
    if (!editing || !it || !it.on || (it.type !== "peak" && it.type !== "lowshelf" && it.type !== "highshelf" && it.type !== "linkwitz")) return null;
    const ds = it.target === "all" ? mainDesigns : mainDesigns.filter((d) => d.design.id === it.target);
    const fits = ds.map((d) => fitToLimits(d.result, it, state.xmax_mm, state.highPass.on, portLimitOf(state), airLimitOf(state))).filter((f): f is Fit => f !== null);
    if (fits.length === 0) return null;
    const fit = fits.reduce((a, b) => ("gain_db" in a && "gain_db" in b ? (b.gain_db < a.gain_db ? b : a) : "fp" in a && "fp" in b ? (b.fp > a.fp ? b : a) : a));
    const worst = ds
      .map((d) => worstLimit(d.result, state.xmax_mm, state.highPass.on, portLimitOf(state), airLimitOf(state)))
      .reduce<ReturnType<typeof worstLimit>>((w, x) => (x && (!w || x.ratio > w.ratio) ? x : w), null);
    return { fit, worst };
  }, [editing, pickedItem, mainDesigns, state]);
  const responseProps = useMemo(() => {
    const rc = responseChart(chartInput, splMode);
    if (!editing) return rc;
    const target = mainDesigns.find((d) => d.design.id === editTarget);
    // With several boxes, the ones not being edited fade back (a box's own parts stay full).
    const fadeOthers = mainDesigns.length > 1 && target;
    const series: Series[] = rc.series.map((x) =>
      fadeOthers && x.label !== target.label && !x.label.startsWith(`${target.label} · `) ? { ...x, fade: true } : x,
    );
    if (eqOnly) series.push({ label: "EQ", color: EQ_HANDLE, dash: "6 4", y: eqOnly, noRank: true });
    const markers = editAt !== null ? [...(rc.markers ?? []), { f: editAt, label: atLabel, color: "var(--accent)" }] : rc.markers;
    return {
      ...rc,
      series,
      markers,
      ribbons: [{ label: "Limits", color: "var(--muted)", kinds: limitLane ?? [], showLabel: true }],
      ribbonKinds: { near: { label: "Near a limit", color: LIMIT.deepBass }, over: { label: "Past a limit", color: LIMIT_RED } },
      ribbonReserve: 1,
    };
  }, [chartInput, splMode, editing, mainDesigns, editTarget, eqOnly, editAt, atLabel, limitLane]); // eslint-disable-line react-hooks/exhaustive-deps

  // Settings → Voice coil → Heated by the drive: where each box's coil settled, under the response.
  const heatedNote = (() => {
    if (state.settings.coilMode !== "heated") return undefined;
    const hot = mainDesigns.filter((d) => d.coil);
    if (hot.length === 0)
      return <p className="hint">Coil heated by the drive: needs the driver&rsquo;s Pe or thermal resistance (Driver → Large signal), so the coil is cold for now.</p>;
    const one = (d: (typeof hot)[number]) => (d.coil!.runaway ? "can't settle" : `${Math.round(d.coil!.tempC)} °C, ${d.coil!.compressionDb.toFixed(1).replace("-", "−")} dB`);
    return (
      <p className="hint">
        Coil heated by the drive (pink noise {state.settings.heatBand[0]}–{state.settings.heatBand[1]} Hz at {driveLabel(state)}):{" "}
        {hot.length === 1 ? one(hot[0]!) : hot.map((d) => `${d.label} ${one(d)}`).join(" · ")}. Every chart shows the hot driver.
      </p>
    );
  })();

  const signalOn = (state.highPass.on ? 1 : 0) + (state.passive.on ? 1 : 0) + state.eq.filter((e) => e.on).length + (state.roomGain.mode !== "off" ? 1 : 0);
  const tabBadges: Partial<Record<PanelId, string>> = {
    boxes: String(state.designs.filter((d) => d.on).length),
    ...(signalOn > 0 ? { signal: String(signalOn) } : {}),
  };

  /* The drive for every chart. Desktop: sticky right above the charts, so it stays in reach while
     scrolling. Phones: in the flow between the response chart and the other charts, so it takes no
     screen height while reading them. */
  const driveBar = (
    <div
      className="power drive-bar"
      data-help-title={state.drive === "volts" ? "Voltage" : "Power"}
      data-help="The drive for every chart: amplifier power in watts (turned into volts with Re), or a voltage. Excursion, port speed and the limits all follow it."
      title="The drive for every chart: amplifier power in watts (turned into volts with Re), or a voltage. Excursion, port speed and the limits all follow it."
    >
      <span id="drive-label">{state.drive === "volts" ? "Voltage" : "Power"}</span>
      {state.drive === "volts" ? (
        <input
          type="range"
          aria-labelledby="drive-label"
          min={-1}
          max={2}
          step={0.005}
          value={Math.log10(state.volts)}
          onChange={(e) => set("volts", Number((10 ** e.currentTarget.valueAsNumber).toPrecision(3)))}
        />
      ) : (
        <input
          type="range"
          aria-labelledby="drive-label"
          min={0}
          max={4}
          step={0.01}
          value={Math.log10(state.power)}
          onChange={(e) => set("power", Math.round(10 ** e.currentTarget.valueAsNumber * 10) / 10)}
        />
      )}
      {phone ? (
        <button
          type="button"
          className="drive-chip"
          aria-haspopup="dialog"
          aria-label={`${driveLabel(state)}: change the drive`}
          onClick={() => setDriveSheet(true)}
        >
          {driveLabel(state)}
        </button>
      ) : (
        <>
          {state.drive === "volts" ? (
            <DriveValue value={state.volts} unit="V" min={0.1} max={100} onChange={(volts) => set("volts", Number(volts.toPrecision(3)))} />
          ) : (
            <DriveValue value={state.power} unit="W" min={1} max={10000} onChange={(power) => set("power", Math.round(power * 10) / 10)} />
          )}
          <div
            className="unit-switch"
            role="group"
            aria-label="Drive by"
            title="Watts: V = √(P·Re), like WinISD. Volts: a fixed voltage, like the 2.83 V datasheets quote."
          >
            <button aria-pressed={state.drive === "watts"} onClick={() => setStep((s) => ({ ...s, ...switchDrive(s, "watts") }))}>
              W
            </button>
            <button aria-pressed={state.drive === "volts"} onClick={() => setStep((s) => ({ ...s, ...switchDrive(s, "volts") }))}>
              V
            </button>
          </div>
          {/* One tap between WinISD's and Hornresp's 1 W (2.83 V into 8 Ω) and what the driver is rated for. */}
          <div className="drive-quick" role="group" aria-label="Quick drive">
            <button
              type="button"
              className="chip"
              aria-pressed={state.drive === "watts" && state.power === 1}
              title="1 W, as WinISD and Hornresp start: the response reads as the driver's sensitivity"
              onClick={() => setStep((s) => ({ ...s, drive: "watts", power: 1 }))}
            >
              1 W
            </button>
            {ratedPowerOf(state) > 0 && (
              <button
                type="button"
                className="chip"
                aria-pressed={state.drive === "watts" && state.power === ratedPowerOf(state)}
                title={`The power rating (Pe${state.drivers > 1 ? ` × ${state.drivers} drivers` : ""}): see where it runs out of excursion or the port chuffs`}
                onClick={() => setStep((s) => ({ ...s, drive: "watts", power: ratedPowerOf(s) }))}
              >
                Rated {ratedPowerOf(state)} W
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <UnitsContext.Provider value={state.settings.units}>
    <SubmitPrContext.Provider value={SUBMIT_ENDPOINT ? (name, params) => openSubmit(prSubmitFields(name, params, dbLookup(db).brands), `${REPO}/issues/new?template=new-passive-radiator.yml`) : null}>
    <div className={`layout phone-${phoneView}`}>
      <header className="top">
        <div className="title">
          <Logo />
          <div>
            <h1>Speaker Box Genius</h1>
            <PwaStatus pwa={pwa} />
          </div>
        </div>
        <div className="top-actions">
          <div className="undo-redo" role="group" aria-label="History">
            <button className="secondary icon" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
              ↶
            </button>
            <button className="secondary icon" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
              ↷
            </button>
          </div>
          <ShareButton state={state} designs={designs} shareUrl={shareUrl} notify={(m) => notify(m)} onExport={() => setExportFor("")} />
          <AppMenu
            install={pwa.install}
            showTips={welcome.showTips}
            onAssistant={launchAssistant}
            reportUrl={() => reportUrl(shareUrl())}
            onExport={() => setExportFor("")}
            onImport={() => setOpenWin(true)}
            online={pwa.online}
          />
          <OpenWindow
            open={openWin}
            onClose={() => {
              setOpenWin(false);
              setPendingFile(null);
              setOpenError(null);
            }}
            onOpen={(s, name) => {
              setOpenWin(false);
              setStep(s);
              notify(`Opened “${name}”.`);
            }}
            onFile={(f) => void importFile(f)}
            pending={pendingFile}
            onUse={(f, u) => void applyImport(f, u)}
            error={openError}
            setError={setOpenError}
            baffle={!onlyOpenBaffles(state)}
          />
          {dropping && (
            <div className="drop-overlay" aria-hidden="true">
              Drop to open
            </div>
          )}
          <ExportWindow
            open={exportFor !== null}
            format={exportFor || undefined}
            onClose={() => setExportFor(null)}
            state={state}
            designs={designs}
            shareUrl={shareUrl}
            notify={(m) => notify(m)}
            onPick={(_, f) => {
              setExportFor(null);
              void openFrdWith(f);
            }}
          />
          <BaffleFrdSheet
            open={frdOpen}
            onClose={() => setFrdOpen(false)}
            state={state}
            sd_cm2={finderCtx.driver?.sd_cm2}
            onBaffle={(patch) => setState((s) => ({ ...s, baffle: { ...s.baffle, ...patch } }))}
            file={frdFile}
            setFile={setFrdFile}
            error={frdError}
            setError={setFrdError}
          />
          {/* Always one tap away: start a new project (the launcher; a new tab once this one is in use). */}
          <button type="button" className="secondary new-btn" onClick={launchAssistant} title="Start a new project" aria-label="New project">
            <span aria-hidden="true">+</span>
            <span className="new-label">New</span>
          </button>
        </div>
      </header>

      <aside className="panel" ref={panelRef}>
        <PanelTabs value={panel} onChange={choosePanel} badges={tabBadges} className="desktop-tabs" />
        {narrow && solved.missing.length === 0 && <StatusStrip designs={designs} state={state} onJump={jumpTo} onPower={() => showOnPhone("charts")} />}
        {panel === "driver" && (
          <div className="tab-panel" role="tabpanel" id="panel-driver" aria-labelledby="tab-driver">
            {/* Measuring from a .zma: at the top of the tab, so opening it always lands in the same place
                (at the end of the tab, the page often couldn't scroll far enough to reach it). */}
            {(measureOpen || measurement) && (
              <div id="measure-panel">
              <MeasurePanel
                measurement={measurement}
                onMeasurement={setMeasurement}
                onClose={() => {
                  setMeasureOpen(false);
                  setMeasurement(null);
                }}
                sd_cm2={solved.values.sd_cm2}
                onUse={(ts, coil) => {
                  track("driver_set", { source: "measured", slot: "main" });
                  setStep((s) => {
                    // Keep the driver's moving mass (or, without a cone area, its Vas) unless the measurement gives it.
                    return {
                      ...s,
                      driverName: s.driverName.endsWith("(measured)") ? s.driverName : `${s.driverName} (measured)`,
                      ts: measuredTs(s.ts, solveDriver(s).values.mms_g, ts),
                      ...coil,
                      semi: undefined,
                      fdd: undefined,
                    };
                  });
                }}
              />
              </div>
            )}
            {(() => {
              const fromDb = fromDatabase(state.driverName, driverSource);
              // "Find similar drivers": the main driver as it is now (edits included) against the
              // database (similarApp.ts); the same-box check runs in the search worker.
              const dbRow = fromDb && driverSource!.id ? db?.drivers.find((r) => r.id === driverSource!.id) : undefined;
              const likeTarget = db ? targetInput(state, dbRow) : null;
              const similarSource = likeTarget
                ? {
                    name: chosenOf(state, driverSource, db).model,
                    fullName: state.driverName.trim() || "this driver",
                    target: likeTarget,
                    boxes: similarBoxes(state),
                    check: (ids: string[], box: ReturnType<typeof similarBoxes>[number], onDelta: (id: string, delta: SimDelta | null) => void) => {
                      let stop: (() => void) | null = null;
                      let stopped = false;
                      const s = latest.current;
                      Promise.all(ids.map((id) => loadDriver(id).then((d) => ({ id, driver: candidateInput(s, d, db?.drivers.find((r) => r.id === id)) }), () => null))).then((loaded) => {
                        const candidates = loaded.filter((x) => x !== null);
                        for (const id of ids) if (!candidates.some((c) => c.id === id)) onDelta(id, null);
                        if (stopped) return;
                        stop = startSearch({ kind: "similar", ...similarJob(s, box.box, candidates) }, { step: (st) => st.kind === "similar" && onDelta(st.id, st.delta), done: () => {}, error: () => {} });
                      });
                      return () => {
                        stopped = true;
                        stop?.();
                      };
                    },
                  }
                : undefined;
              // A database driver whose values look implausible (db-tools plausibility checks).
              const flag = fromDb && driverSource!.id ? flagText(db?.drivers.find((r) => r.id === driverSource!.id)) : undefined;
              const attention = pasting
                ? "Pasting from a datasheet."
                : solved.missing.length > 0
                  ? `Still needed to simulate: ${solved.missing.map((p) => TS_PARAMS[p].label).join(", ")}.`
                  : solved.conflicts.length > 0 && !fromDb
                    ? "Some T/S values disagree."
                    : undefined;
              const load = amplifierLoad(state, solved);
              let low: { z: number; f: number; name?: string } | undefined;
              if (load)
                for (const d of mainDesigns) {
                  const z = d.result.impedanceOhm;
                  for (let i = 0; i < z.length; i++) if (z[i]! > 0 && (!low || z[i]! < low.z)) low = { z: z[i]!, f: d.result.freq[i]!, name: mainDesigns.length > 1 ? d.design.name : undefined };
                }
              const openMeasure = () => {
                setTsOpen(false);
                setMeasureOpen(true);
                showMeasurePanel();
              };
              return (
                <>
                  <DriverCard
                    state={state}
                    set={set}
                    phone={phone}
                    specs={fromDb && driverSource!.url ? { url: driverSource!.url, title: driverSource!.via === "driver-base" ? "Datasheet: the manufacturer's specs (values via driver-base, CC BY 4.0)" : "Datasheet: the manufacturer's specs" } : undefined}
                    picker={
                  <DriverBrowser
                    rows={db?.drivers}
                    current={state.driverName.trim() || "Unnamed driver"}
                    chosen={chosenOf(state, driverSource, db)}
                    similar={similarSource}
                    onPick={(id) => {
                      // From the assistant's "I have a speaker driver": the project is still the untouched
                      // example, so every box is sized for the new driver (with a port and a PR to suit)
                      // in the same undo step. Picked any other time, sizing is only offered: the boxes may be yours.
                      // Only while the boxes are still the example's: a search left open and used later
                      // (after editing) is an ordinary pick.
                      track("driver_set", { source: "database", slot: "main" });
                      const fresh = pickToCharts.current && JSON.stringify(latest.current.designs) === JSON.stringify(DEFAULT_STATE.designs);
                      pickToCharts.current = false;
                      const prs = fresh && db ? loadCandidates(db).catch(() => null) : Promise.resolve(null);
                      return Promise.all([loadDriver(id), prs]).then(
                        ([d, cands]) => {
                          rememberDriver(d);
                          // An entry without Xmax or Pe leaves them unset (never the previous driver's): say so under the card.
                          const missing = driverExtras(d, { le: false }).assumed;
                          if (missing.length > 0) report(`Loaded “${d.name}”. Its database entry doesn't have every value.`, missing);
                          if (!fresh) {
                            offerSizing(d.name);
                            setStep((s) => withDriver(s, d));
                            return;
                          }
                          const r = sizeForNewDriver(withDriver(latest.current, d), cands);
                          setStep(r.state);
                          setSizeReport({ changed: r.changed, skipped: r.skipped });
                          notify(r.changed.length > 0 ? `Loaded “${d.name}” and sized the boxes for it.` : `Loaded “${d.name}”.`);
                          // Straight to what the driver does (the charts, on phones).
                          setPhoneView("charts");
                          window.scrollTo({ top: 0 });
                        },
                        () => alert("Couldn't load that driver."),
                      );
                    }}
                  />
                    }
                    notes={flag ? <Notice tone="warn">{flag}</Notice> : undefined}
                    modified={
                      mainChange && mainChange.changed.length > 0
                        ? {
                            text: changedText(mainChange.changed),
                            onReset: () => {
                              setStep((s) => resetDriver(s, mainChange.driver));
                              notify(`Reset “${mainChange.driver.name}” to the database's values.`);
                            },
                          }
                        : null
                    }
                    name={{ kind: driverSource ? nameKind(state.driverName, driverSource.name) : "own", onChange: (v) => set("driverName", v) }}
                    ts={{
                      editor: (
              <TsEditor
                entered={state.ts}
                solved={solved}
                air={airOf(state)}
                published={fromDb ? driverSource!.ts : undefined}
                onChange={(ts) => {
                  // A database driver's first hand edit renames it "… (edited)", in the same undo step.
                  const name = nameAfterTsEdit(state.driverName, driverSource, ts);
                  if (name === state.driverName) set("ts", ts);
                  else setStep((s) => ({ ...s, ts, driverName: name }));
                }}
                pasting={pasting}
                onPastingChange={setPasting}
                onPaste={(ts, x) => {
                  track("driver_set", { source: "paste", slot: "main" });
                  offerSizing("Pasted driver");
                  // A new driver: what the datasheet didn't have is unset or defaulted (never the previous driver's), and listed.
                  const extras = driverExtras(x);
                  if (extras.assumed.length > 0) report("Pasted driver values.", extras.assumed);
                  setStep((s) => ({
                    ...s,
                    driverName: "Pasted driver",
                    driverBrand: "",
                    driverOrigin: undefined,
                    volume: { ...s.volume, driverCutout_mm: 0, driverDepth_mm: 0 },
                    ts,
                    nominal_ohms: extras.nominal_ohms,
                    le_mh: extras.le_mh,
                    l2_mh: 0,
                    r2_ohm: 0,
                    semi: undefined,
                    fdd: undefined,
                    xmax_mm: extras.xmax_mm,
                    pe_w: extras.pe_w,
                    rth_k_w: 0,
                    tmax_C: 200,
                  }));
                }}
              />
                      ),
                      // Open by itself on wider screens for a driver you typed, or when something needs a look; your choice wins.
                      open: tsOpen ?? (!phone && (!fromDb || !!attention)),
                      onOpenChange: (o) => {
                        setTsOpen(o);
                        if (!o) setPasting(false);
                      },
                      attention,
                      fill: [
                        {
                          label: pasting ? "Cancel paste" : "Paste from datasheet…",
                          onSelect: () => {
                            setPasting(!pasting);
                            setTsOpen(true);
                          },
                        },
                        { label: "Measure from an impedance sweep (.zma)…", icon: <Sparkle />, onSelect: openMeasure },
                        { label: "WinISD or OpenISD file…", onSelect: () => wdrInput.current?.click() },
                      ],
                      submitUrl: submitDriverUrl(state),
                      onSubmit: SUBMIT_ENDPOINT ? () => openSubmit(submitFields(state), submitDriverUrl(state)) : undefined,
                      onClear: () => {
                        setStep((s) => ({ ...s, ts: {} }));
                        notify("Cleared the T/S values.");
                      },
                    }}
                    sections={{
                      open: openSections,
                      onToggle: (key, o) =>
                        setOpenSections((cur) => {
                          const next = new Set(cur);
                          if (o) next.add(key);
                          else next.delete(key);
                          return next;
                        }),
                    }}
                    compare={{
                      picker: (
                  <DriverBrowser
                    rows={db?.drivers}
                    button="Pick a driver to compare…"
                    noCount
                    current={state.compare?.driverName}
                    title="Compare with another driver"
                    onPick={(id) =>
                      loadDriver(id).then(
                        (d) => {
                          track("driver_set", { source: "database", slot: "compare" });
                          rememberDriver(d);
                          const { compare, borrowed } = compareWith(latest.current, d);
                          // A new comparison driver keeps the count the last one was given.
                          setStep((s) => ({ ...s, compare: { ...compare, ...(s.compare?.drivers !== undefined ? { drivers: s.compare.drivers, wiring: s.compare.wiring } : {}) } }));
                          notify(compareMessage(d.name, borrowed, flagText(db?.drivers.find((r) => r.id === id))));
                        },
                        () => alert("Couldn't load that driver."),
                      )
                    }
                  />
                      ),
                      onSwap: () => {
                        setStep((s) => swapCompare(s));
                        notify(`${state.compare!.driverName} is now the main driver; ${state.driverName} is the comparison.`);
                      },
                      onStop: () => setStep((s) => ({ ...s, compare: null })),
                      modified:
                        compareChange && compareChange.changed.length > 0
                          ? {
                              text: changedText(compareChange.changed),
                              onReset: () => {
                                setStep((s) => (s.compare ? { ...s, compare: resetDriver(s.compare, compareChange.driver, true) } : s));
                                notify(`Reset “${compareChange.driver.name}” to the database's values.`);
                              },
                            }
                          : null,
                    }}
                    amp={load ? { ...load, low } : null}
                    dvcNote={
                      state.dvc.on && solved.missing.length === 0
                        ? `As wired: Re ${(solved.values.re! * dvcFactors(state).re).toFixed(2)} Ω, Qes ${(solved.values.qes! * dvcFactors(state).qes).toFixed(3)}. Wiring only changes the impedance (and how much the cable resistance matters); the response at a given power stays the same.`
                        : undefined
                    }
                  />
                  <input
                    ref={wdrInput}
                    type="file"
                    accept=".wdr,.wpr,.owpr,.owdr,.txt,.json"
                    hidden
                    onChange={(e) => {
                      const f = e.currentTarget.files?.[0];
                      if (f) importWdr(f);
                      e.currentTarget.value = "";
                    }}
                  />
                  {importReport && <ImportNotice report={importReport} onClose={() => setImportReport(null)} />}
                </>
              );
            })()}

          </div>
        )}
        {panel === "boxes" && (
          <div className="tab-panel" role="tabpanel" id="panel-boxes" aria-labelledby="tab-boxes">
            {(() => {
              // + Box, Size all, and one button that folds or opens every box.
              const shown = state.designs.filter((d) => d.on).map((d) => d.id);
              const allFolded = shown.length > 0 && shown.every((id) => folds.isFolded(id));
              return (
                <div className="bx-top">
                  <AddBoxMenu designs={state.designs} max={MAX_DESIGNS} onAdd={addDesign} />
                  <Button
                    variant="ghost"
                    onClick={sizeBoxes}
                    disabled={solved.missing.length > 0}
                    data-help-title="Size all"
                    data-help={SIZE_ALL_HELP}
                    title={SIZE_ALL_HELP}
                  >
                    <Sparkle />
                    Size all
                  </Button>
                  {state.designs.length > 1 && (
                    <Button
                      variant="ghost"
                      className="bx-foldall"
                      icon={allFolded ? "openAll" : "foldAll"}
                      label={allFolded ? "Open all boxes" : "Fold all boxes"}
                      title={allFolded ? "Open all" : "Fold all"}
                      onClick={() => folds.foldAll(shown, !allFolded)}
                    />
                  )}
                </div>
              );
            })()}
            {sizeReport && (
              <div className="size-report ui-notice bx-report" data-tone="info">
                {sizeReport.changed.length > 0 && (
                  <ul>
                    {sizeReport.changed.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
                {sizeReport.skipped.length > 0 && (
                  <ul className="muted">
                    {sizeReport.skipped.map((c) => (
                      <li key={c}>Left as is: {c}</li>
                    ))}
                  </ul>
                )}
                <button className="link" onClick={() => setSizeReport(null)}>
                  Hide
                </button>
              </div>
            )}
            <div className="bx-list">
            {state.designs.map((d) => (
              <DesignCard
                key={d.id}
                folded={folds.isFolded(d.id)}
                onFold={(on) => folds.fold(d.id, on)}
                glance={(() => {
                  const r = designs.find((x) => x.design.id === d.id)?.result;
                  if (!r) return undefined;
                  return {
                    vb_l: builtVbOf(state, d),
                    fb: r.summary.fb,
                    fc: r.summary.fc,
                    qtc: r.summary.qtc,
                    f3: r.summary.f3,
                    over: limitsOf(r, state.xmax_mm, state.highPass.on, portLimitOf(state), airLimitOf(state)).over.length,
                    ob: r.summary.ob,
                  };
                })()}
                design={d}
                color={colorOf(state, d.id)}
                vb_l={vbOf(state, d)}
                built_l={builtVbOf(state, d)}
                linked={state.volume.link === d.id}
                backDepth_cm={backDepthOf(d, state.volume)}
                preview={(x) => presetPreview(state, solved, x)}
                onSizeBandpass={d.kind === "bandpass" ? () => sizeOneBandpass(d) : undefined}
                pickPort={d.kind === "vented" ? (x, vb, fb) => bestVentedPort(state, x, vb, fb) : undefined}
                lineFb={d.kind === "line" ? (designs.find((x) => x.design.id === d.id)?.result.summary.fb ?? null) : undefined}
                onDipoleEq={
                  d.kind === "ob"
                    ? () => {
                        const r = dipoleEq(state, solved, d.id);
                        if (!r) return notify("Dipole EQ needs the driver's T/S values and a board the driver fits on.");
                        setStep((s) => ({ ...s, eq: r.eq }));
                        notify(r.note);
                      }
                    : undefined
                }
                driverDisp_l={state.volume.driverDisp_l * state.drivers * (state.isobaric ? 2 : 1)}
                wall_mm={state.volume.wall_mm}
                canDelete={state.designs.length > 1}
                db={db}
                air={airOf(state)}
                ec={endCorrectionOf(state)}
                align={finderCtx.align}
                drivers={state.drivers}
                portCtx={portContext(state, designs, d.id)}
                losses={state.settings.losses}
                onDimensions={() => openDimensions(d)}
                finder={finderCtx}
                onFound={(d, patch, summary, physical) => {
                  // One undo step: the design, and the PR's displacement and cutout for the volume calculator and build sheet.
                  setStep((s) => ({
                    ...s,
                    designs: s.designs.map((x) => (x.id === d.id ? ({ ...x, ...patch } as DesignState) : x)),
                    volume: physical
                      ? {
                          ...s.volume,
                          ...(physical.displacement_l !== undefined ? { prDisp_l: physical.displacement_l } : {}),
                          prCutout_mm: physical.cutout_mm ?? 0,
                        }
                      : s.volume,
                  }));
                  notify(`“${d.name}” now uses ${summary}.`);
                }}
                onUnlink={() => {
                  const vb = Math.round(builtVbOf(state, d) * 10) / 10;
                  setStep((s) => ({
                    ...s,
                    designs: s.designs.map((x) => (x.id === d.id ? { ...x, vb_l: vb } : x)),
                    volume: { ...s.volume, link: "none" },
                  }));
                }}
                fit={{
                  state,
                  onMeasured: (measured) => setStep((s) => ({ ...s, measured })),
                  onShowImpedance: () => showChart("impedance", [d.id]),
                  onUndo: undo,
                  published: fromDatabase(state.driverName, driverSource) ? driverSource!.ts : undefined,
                }}
                onChange={updateDesign}
                onDuplicate={() => duplicateDesign(d)}
                onDelete={() => deleteDesign(d)}
                onImportDriver={(x) => {
                  // A Hornresp record's driver: never the previous driver's Xmax, Pe or Znom (listed under the driver card).
                  const extras = driverExtras({ le_mh: x.le_mh, xmax_mm: x.xmax_mm, pe_w: x.pe_w }, { le: false });
                  if (extras.assumed.length > 0) report(`Driver taken from the Hornresp record (${x.name}).`, extras.assumed);
                  setStep((s) => ({
                    ...s,
                    driverName: x.name,
                    driverBrand: "",
                    driverOrigin: undefined,
                    ts: x.ts,
                    le_mh: x.le_mh,
                    l2_mh: 0,
                    r2_ohm: 0,
                    semi: x.semi,
                    fdd: x.fdd,
                    xmax_mm: extras.xmax_mm,
                    pe_w: extras.pe_w,
                    rth_k_w: 0,
                    tmax_C: 200,
                    nominal_ohms: extras.nominal_ohms,
                    ...(x.drivers ? { drivers: x.drivers.count, wiring: x.drivers.wiring } : {}),
                    dvc: { ...s.dvc, on: false },
                  }));
                }}
                onPrPhysical={(x) =>
                  setState((s) => ({
                    ...s,
                    volume: {
                      ...s.volume,
                      ...(x.displacement_l !== undefined ? { prDisp_l: x.displacement_l } : {}),
                      prCutout_mm: x.cutout_mm ?? 0,
                    },
                  }))
                }
              />
            ))}
            </div>
          </div>
        )}
        {panel === "signal" && (
          <div className="tab-panel" role="tabpanel" id="panel-signal" aria-labelledby="tab-signal">
            <KitFields>
              <div className="sg-list">
                <KitCard title="Signal" flush>
                  <HighPassSection value={hp} onChange={(v) => set("highPass", v)} />
                  <EqSection
                    state={state}
                    designs={designs}
                    onChange={(eq) => set("eq", eq)}
                    onClear={() => {
                      setStep((s) => ({ ...s, eq: [] }));
                      notify("EQ cleared.");
                    }}
                  />
                  <PassiveSection value={state.passive} re={state.ts.re ?? 6} le_mh={state.le_mh} onChange={(p) => set("passive", p)} />
                </KitCard>
                <KitCard title="Listening space" flush>
                  <RoomGainSection value={state.roomGain} room={roomGainOf(state)} onChange={(r) => set("roomGain", r)} />
                  <BaffleSection
                    state={state}
                    sd_cm2={finderCtx.driver?.sd_cm2}
                    onChange={(b) => set("baffle", b)}
                    driverCurve={frdFile?.name ?? null}
                    onOpenDriverCurve={() => setFrdOpen(true)}
                    onAddEq={(item) => {
                      setStep((st) => ({ ...st, eq: [...st.eq, item] }));
                      notify(`Added a +${"gain_db" in item ? item.gain_db : 0} dB low shelf at ${"freq" in item ? item.freq : ""} Hz (EQ, all designs).`);
                    }}
                  />
                </KitCard>
                <DspExportPanel state={state} notify={notify} />
              </div>
            </KitFields>
          </div>
        )}
        {panel === "build" && (
          <div className="tab-panel" role="tabpanel" id="panel-build" aria-labelledby="tab-build">
            <KitFields>
              <div className="bd-list">
                <VolumePanel state={state} onChange={(v) => set("volume", v)} />
                <BuildSheet
                  state={state}
                  designs={designs}
                  driverName={state.driverName}
                  driverSd_cm2={finderCtx.driver?.sd_cm2}
                  onChange={(v) => set("volume", v)}
                />
              </div>
            </KitFields>
          </div>
        )}
        {panel === "settings" && (
          <div className="tab-panel" role="tabpanel" id="panel-settings" aria-labelledby="tab-settings">
            <KitFields>
              <SettingsPanel
                state={state}
                onChange={(v) => set("settings", v)}
                re={solved.values.re !== undefined ? solved.values.re * dvcFactors(state).re : undefined}
                winisdWatts={winisdWatts}
                ampLoad={amplifierLoad(state, solved)}
                heated={designs.find((d) => !d.compare && d.coil)?.coil ?? null}
                hasThermal={state.pe_w > 0 || state.rth_k_w > 0}
              />
            </KitFields>
          </div>
        )}
      </aside>

      <main className="charts">
        {!phone && driveBar}
        {phone && (
          <DriveSheet
            open={driveSheet}
            onClose={() => setDriveSheet(false)}
            drive={state.drive}
            power={state.power}
            volts={state.volts}
            rated={ratedPowerOf(state)}
            onUnit={(to) => setStep((s) => ({ ...s, ...switchDrive(s, to) }))}
            onValue={(drive, v) => setStep((s) => (drive === "volts" ? { ...s, volts: v } : { ...s, power: v }))}
            onQuick={(watts) => setStep((s) => ({ ...s, drive: "watts", power: watts }))}
          />
        )}
        {welcome.linkNote && <LinkNote onDismiss={welcome.dismissLinkNote} onTips={welcome.showTips} />}
        {welcome.tips && <GettingStarted onDismiss={welcome.dismissTips} onAssistant={launchAssistant} drivers={db?.drivers.length} />}
        <Summary designs={designs} state={state} missing={solved.missing.length > 0} narrow={narrow} onJump={jumpTo} onMaxSpl={(ids) => showChart("maxspl", ids)} />

        {designs.length > 0 && (
          <ChartEmphasis.Provider value={emphasis}>
          <CrosshairProvider>
          <ChartTitleMenu.Provider value={narrow ? null : titleMenu}>
            {twoFit && !narrow && (
              <div className="charts-per-row">
                <span className="muted">Charts per row</span>
                <div className="unit-switch" role="group" aria-label="Charts per row">
                  <button aria-pressed={perRow === 1} onClick={() => choosePerRow(1)} aria-label="One chart per row" title="One chart per row">
                    <Icon name="rows1" size={18} />
                  </button>
                  <button aria-pressed={perRow === 2} onClick={() => choosePerRow(2)} aria-label="Two charts per row" title="Two charts per row">
                    <Icon name="rows2" size={18} />
                  </button>
                </div>
              </div>
            )}
            <input
              ref={measuredInput}
              type="file"
              hidden
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (f) void applyImport(f, measuredUse.current);
              }}
            />
            <div className={`chart-grid${perRow === 2 && !narrow ? " two" : ""}`}>
            <div className="chart-cell" hidden={!onScreen("response")} style={cellStyle("response")}>
            <LogChart
              forum
              {...responseProps}
              hidden={!onScreen("response")}
              handles={chartHandles}
              onSelect={(id) => {
                if (id !== null) {
                  setEditAt(null);
                  setAddOpen(false);
                }
                setPicked(id);
              }}
              onPlotTap={editing ? (f) => setEditAt(f) : undefined}
              selected={picked}
              zone={editing}
              after={
                editing ? (
                  <>
                    <p className="edit-limits" role="status">
                      {limitsText}
                    </p>
                    <div className="edit-bar">
                      <div className="edit-chips" role="group" aria-label="Filters">
                        {[
                          ...(state.highPass.on ? [{ key: "hp", id: "hp", text: `HP ${state.highPass.freq} Hz`, target: "all", off: false }] : []),
                          ...state.eq.map((e) => ({
                            key: e.id,
                            id: `eq-${e.id}`,
                            text: `${e.type === "peak" ? "PEQ" : e.type === "lowshelf" ? "LS" : e.type === "lowshelf1" ? "LS6" : e.type === "highshelf" ? "HS" : "LT"} ${e.type === "linkwitz" ? e.fp : e.freq} Hz`,
                            target: e.target,
                            off: !e.on,
                          })),
                        ].map((c) => (
                          <button
                            key={c.key}
                            type="button"
                            className={`edit-chip${c.off ? " off" : ""}`}
                            aria-pressed={picked === c.id}
                            onClick={() => pickChip(c.id)}
                          >
                            <span className="dot" style={{ background: mainDesigns.find((d) => d.design.id === c.target)?.color ?? "var(--muted)" }} aria-hidden="true" />
                            {c.text}
                          </button>
                        ))}
                        <button type="button" className="edit-chip add" aria-expanded={addOpen} onClick={() => setAddOpen((o) => !o)}>
                          {editAt !== null ? `+ Add at ${atLabel}` : "+ Add"}
                        </button>
                      </div>
                      {addOpen && (
                        <div className="edit-add" role="group" aria-label="Add a filter">
                          <b>{editAt !== null ? `Add at ${atLabel}` : "Add at 40 Hz (tap the chart to choose)"}</b>
                          {(
                            [
                              ["peak", "Parametric EQ", "Boost or cut around a frequency"],
                              ["lowshelf", "Low shelf", "Raise or lower everything below"],
                              ["highshelf", "High shelf", "Raise or lower everything above"],
                              ["highpass", state.highPass.on ? "Move the high-pass here" : "High-pass", "Protect the cone below the cut-off"],
                              ...(mainDesigns.some((d) => (d.design.kind === "sealed" || d.design.kind === "ib") && d.result.summary.fc !== undefined && d.result.summary.qtc !== undefined)
                                ? [["linkwitz", "Linkwitz Transform", "Retune a sealed box or infinite baffle"]]
                                : []),
                            ] as [AddType, string, string][]
                          ).map(([type, title, text]) => (
                            <button key={type} type="button" className="secondary" onClick={() => addAt(type)}>
                              <span>{title}</span>
                              <span className="muted">{text}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <span className="edit-actions">
                        <button type="button" className="secondary" onClick={cancelEdit} disabled={!editChanged} title="Put the boxes and EQ back as they were when you opened the editor">
                          Cancel
                        </button>
                        <button type="button" onClick={closeEditor}>
                          Done
                        </button>
                      </span>
                      {(pickedItem || (picked === "hp" && state.highPass.on)) && (
                        <div className="edit-point" role="group" aria-label="Filter settings">
                          <div className="edit-point-head">
                            <span className="hd-left">
                              <button type="button" className="ib" aria-label="Delete filter" title="Delete this filter" onClick={deletePicked}>
                                <Icon name="trash" size={20} />
                              </button>
                              <select
                                aria-label="Filter type"
                                value={pickedItem ? pickedItem.type : "highpass"}
                                onChange={(e) => changeType(e.currentTarget.value as AddType)}
                              >
                                <option value="peak">Parametric EQ</option>
                                <option value="lowshelf">Low shelf</option>
                                <option value="highshelf">High shelf</option>
                                <option value="highpass" disabled={!!pickedItem && state.highPass.on}>
                                  {pickedItem && state.highPass.on ? "High-pass (already on)" : "High-pass"}
                                </option>
                                <option value="linkwitz" disabled={pickedItem?.type !== "linkwitz" && !sealedOf(pickedTarget)}>
                                  Linkwitz Transform
                                </option>
                              </select>
                            </span>
                            <span className="hd-right">
                              <button type="button" className="ib ok" aria-label="Keep changes" title="Keep changes" onClick={keepPicked}>
                                <Icon name="check" size={20} />
                              </button>
                              <button type="button" className="ib" aria-label="Cancel changes" title="Cancel changes" onClick={revertPicked}>
                                <Icon name="close" size={20} />
                              </button>
                            </span>
                          </div>
                          <div className="edit-fields">
                            {pickedItem && pickedItem.type === "linkwitz" ? (
                              <>
                                <Num help="Linkwitz Transform: the resonance you want instead. Lower extends the bass (and needs more excursion and power)." label="fp" unit="Hz" value={pickedItem.fp} onChange={(fp) => patchEq(pickedItem.id, { fp: Math.round(Math.min(pickedItem.f0, Math.max(5, fp)) * 10) / 10 })} />
                                <Num help="Linkwitz Transform: the Q you want. 0.707 is flat (Butterworth); 0.5 is tighter, more gradual." label="Qp" value={pickedItem.qp} onChange={(qp) => patchEq(pickedItem.id, { qp })} />
                              </>
                            ) : pickedItem ? (
                              <>
                                <Num help="Centre (or corner) frequency of this EQ band." label="Freq" unit="Hz" value={pickedItem.freq} onChange={(freq) => patchEq(pickedItem.id, { freq: Math.min(500, Math.max(10, freq)) })} />
                                <Num help="Boost (+) or cut (−) in dB. Every +6 dB needs four times the power and doubles the excursion." label="Gain" unit="dB" value={pickedItem.gain_db} min={-24} onChange={(gain_db) => patchEq(pickedItem.id, { gain_db: Math.min(24, gain_db) })} />
                                {pickedItem.type !== "lowshelf1" && <Num help="Width of the band: higher Q is narrower. About 0.7 for broad shaping, 2–5 to fix a peak." label="Q" value={pickedItem.q} onChange={(q) => patchEq(pickedItem.id, { q })} />}
                              </>
                            ) : (
                              <>
                                <Num help="Corner frequency of the high-pass (subsonic) filter. A few Hz below a ported box's tuning keeps the cone from flapping below it." label="Freq" unit="Hz" value={hp.freq} onChange={(freq) => setState((s) => moveHighPass(s, freq))} />
                                <Select<number>
                                  help="How steeply the filter cuts below its frequency: 12 dB/oct is gentle, 24 dB/oct protects a ported box much better."
                                  label="Slope"
                                  value={hp.order}
                                  options={(hp.type === "butterworth" ? [1, 2, 3, 4] : [2, 4]).map((o) => ({ value: o, text: `${o * 6} dB/oct` }))}
                                  onChange={(order) => setStep((s) => ({ ...s, highPass: { ...s.highPass, order } }))}
                                />
                              </>
                            )}
                          </div>
                          <p className="hint edit-hint">Drag its handle on the chart to move it. Delete removes it.</p>
                          {pickedItem && pickedFix && (
                            <div className="edit-fit" role="alert">
                              <span>
                                {pickedFix.worst && pickedFix.worst.ratio > 1
                                  ? `Over ${pickedFix.worst.kind === "xmax" || pickedFix.worst.kind === "pr" ? LIMIT_NAME[pickedFix.worst.kind] : LIMIT_NAME[pickedFix.worst.kind].toLowerCase()} (${Math.round(pickedFix.worst.ratio * 100)} %) at ${pickedFix.worst.f < 100 ? pickedFix.worst.f.toFixed(1) : Math.round(pickedFix.worst.f)} Hz with this ${pickedItem.type === "linkwitz" ? "filter" : pickedItem.gain_db > 0 ? "boost" : "setting"}.`
                                  : "Past a limit with this filter."}
                              </span>
                              <button type="button" className="secondary edit-fix" onClick={fixPicked}>
                                {"gain_db" in pickedFix.fit ? `Cut to ${pickedFix.fit.gain_db > 0 ? "+" : ""}${pickedFix.fit.gain_db.toFixed(1)} dB` : `Raise fp to ${pickedFix.fit.fp.toFixed(1)} Hz`}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : undefined
              }
              actions={
                <>
                {designs.some((d) => d.result.parts) && (
                  <button
                    className={`chip${showParts ? " on" : ""}`}
                    aria-pressed={showParts}
                    onClick={toggleParts}
                    title="Transmission lines: the cone (dashed) and the mouth (dotted) on their own, as well as the sum"
                  >
                    Cone + mouth
                  </button>
                )}
                <button
                  type="button"
                  className="chart-edit"
                  aria-pressed={editing}
                  onClick={() => {
                    if (editing) return closeEditor();
                    // Not chooseSplMode: the remembered scale stays as it was, and Done puts it back.
                    modeBeforeEdit.current = splMode;
                    setSplMode("relative");
                    openEditor();
                  }}
                  title="Drag on the chart: a box's tuning, or an EQ point"
                >
                  <Icon name="pencil" size={14} />
                  Edit
                </button>
                {/* Editing works on the relative view, so the scale switch steps aside until Done. */}
                {!editing && (
                  <div className="unit-switch" role="group" aria-label="SPL scale">
                    <button aria-pressed={splMode === "relative"} onClick={() => chooseSplMode("relative")} title="Each design's passband at 0 dB, with −3 and −6 dB lines">
                      Relative
                    </button>
                    <button aria-pressed={splMode === "absolute"} onClick={() => chooseSplMode("absolute")} title="Sound pressure level in dB SPL">
                      dB SPL
                    </button>
                  </div>
                )}
                </>
              }
              foot={heatedNote}
            />
            </div>
            {phone && driveBar}
            {narrow && (
              <TabRow<ChartId>
                tabs={chartTabs}
                selected={chartTab}
                onSelect={chooseChart}
                ariaLabel="Charts"
                className="chart-tabs"
              />
            )}
            <div className="chart-cell" hidden={!onScreen("excursion")} style={cellStyle("excursion")}>
            <LogChart
              forum
              {...excursionChart(chartInput, xView)}
              hidden={!onScreen("excursion")}
              info={motionInfo(xView, "cone", state.settings.excursion)}
              foot={<LowDriveNote state={state} chart="excursion" hidden={false} onRated={useRatedPower} />}
              actions={
                narrow ? (
                  <Menu
                    label={xviewUnit(xView, state.settings.units)}
                    ariaLabel={`Show: ${XVIEWS[xView].name}`}
                    variant="ghost"
                    align="end"
                    items={XVIEW_ORDER.map((k) => ({
                      label: XVIEWS[k].name,
                      detail: xviewUnit(k, state.settings.units),
                      checked: k === xView,
                      onSelect: () => chooseXView(k),
                    }))}
                  />
                ) : (
                  <Segmented<XView>
                    label="Show"
                    value={xView}
                    options={XVIEW_ORDER.map((k) => ({ value: k, label: xviewUnit(k, state.settings.units), title: XVIEWS[k].hint }))}
                    onChange={chooseXView}
                  />
                )
              }
            />
            </div>
            {hasPr && (
              <div className="chart-cell" hidden={!onScreen("pr")} style={cellStyle("pr")}>
                <LogChart forum {...prChart(chartInput, xView)} hidden={!onScreen("pr")} info={motionInfo(xView, "pr", state.settings.excursion)} />
              </div>
            )}
            {hasPort && (
              <div className="chart-cell" hidden={!onScreen("port")} style={cellStyle("port")}>
                <LogChart
                  forum
                  {...portChart(chartInput)}
                  hidden={!onScreen("port")}
                  foot={<LowDriveNote state={state} chart="port" hidden={false} onRated={useRatedPower} />}
                />
              </div>
            )}
            {hasBoxPressure && (
              <div className="chart-cell" hidden={!onScreen("pressure")} style={cellStyle("pressure")}>
                <LogChart forum {...pressureChart(chartInput)} hidden={!onScreen("pressure")} />
              </div>
            )}
            {hasAir && (
              <div className="chart-cell" hidden={!onScreen("air")} style={cellStyle("air")}>
              <AirChart
                designs={designs}
                freq={freq}
                hidden={!onScreen("air")}
                limit_pct={airLimitOf(state)}
                highPassOn={state.highPass.on}
                view={airView}
                onView={chooseAirView}
              />
              </div>
            )}
            <div className="chart-cell" hidden={!onScreen("maxspl")} style={cellStyle("maxspl")}>
            <LogChart
              {...maxSplChart(chartInput, maxMode)}
              hidden={!onScreen("maxspl")}
              foot={
                state.settings.signal.program ? (
                  <p className="hint">
                {signalLabel(state.settings.signal)}
                {state.settings.signal.target_dB !== null ? `, target ${fmtCrest(state.settings.signal.target_dB)} dB` : ""}: each curve is the loudest that box plays on
                this signal (average SPL); turn Program off for the sine curve. Headroom: plain = 3 dB or more spare, amber = under 3 dB, red = short.
                  </p>
                ) : undefined
              }
              info={
                winisdWatts ? (
                  <p>
                    Watts as WinISD counts them (Settings → Watts): into the coil and the amp + cable together, with a hot coil's Re. The amplifier volts, amps and watts are real.
                  </p>
                ) : undefined
              }
              actions={
                <>
                  {narrow ? (
                    <Menu
                      label={MAX_MODE_INFO[maxMode].label}
                      ariaLabel={`Show: ${MAX_MODE_INFO[maxMode].name}`}
                      variant="ghost"
                      align="end"
                      items={MAX_MODES.map((m) => ({
                        label: MAX_MODE_INFO[m].name,
                        detail: MAX_MODE_INFO[m].unit,
                        checked: m === maxMode,
                        onSelect: () => chooseMaxMode(m),
                      }))}
                    />
                  ) : (
                    <Segmented<MaxMode>
                      label="Show"
                      value={maxMode}
                      options={MAX_MODES.map((m) => ({ value: m, label: MAX_MODE_INFO[m].label, title: MAX_MODE_INFO[m].hint }))}
                      onChange={chooseMaxMode}
                    />
                  )}
                  <ProgramControl signal={state.settings.signal} narrow={narrow} onChange={(signal) => setState((st) => ({ ...st, settings: { ...st.settings, signal } }))} />
                </>
              }
            />
            </div>
            {hasPower && (
              <div className="chart-cell" hidden={!onScreen("power")} style={cellStyle("power")}>
                <PowerChart
                  designs={designs}
                  hidden={!onScreen("power")}
                  view={powerView}
                  onView={choosePowerView}
                  pick={powerPick}
                  onPick={setPowerPick}
                  eta0={eta0Of(solved.values, airOf(state).c)}
                  heatBand={state.settings.heatBand}
                  narrow={narrow}
                />
              </div>
            )}
            <div className="chart-cell" hidden={!onScreen("impedance")} style={cellStyle("impedance")}>
            <LogChart
              hidden={!onScreen("impedance")}
              {...impedanceChart(chartInput, zMode, impedanceExtra)}
              actions={
                <div className="unit-switch" role="group" aria-label="Show">
                  <button aria-pressed={zMode === "ohms"} onClick={() => chooseZMode("ohms")} title="How many ohms the amplifier sees at each frequency">
                    Ω
                  </button>
                  <button
                    aria-pressed={zMode === "phase"}
                    onClick={() => chooseZMode("phase")}
                    title="The phase angle between voltage and current: positive is inductive, negative capacitive. Near ±45° the amplifier's output stage works hardest for the power it delivers."
                  >
                    Phase
                  </button>
                </div>
              }
            />
            </div>
            {zaDesigns.length > 0 && (
              <div className="chart-cell" hidden={!onScreen("za")} style={cellStyle("za")}>
              <LogChart
                {...zaChart(chartInput)}
                hidden={!onScreen("za")}
                foot={
              <p className="hint">
                Solid: resistance, dashed: reactance. The air load the line puts on the cone, as Hornresp&rsquo;s Za chart shows it: taken at the driver (at the
                horn&rsquo;s throat for a front-loaded horn, without its chambers), divided by ρc/S there. Peaks are the
                line&rsquo;s resonances; resistance near 1 over a wide band means the horn is loading the cone well, and
                stuffing shows as the ripples shrinking towards 1.
              </p>
                }
              />
              </div>
            )}
            {onScreen("transient") && (
              <div className="chart-cell" style={cellStyle("transient")}>
                <TimeChart
                  title={transientView === "impulse" ? "Impulse response" : "Step response"}
                  curves={transients}
                  view={transientView}
                  from_ms={-5}
                  to_ms={transientView === "impulse" ? 60 : 120}
                  actions={
                    <TabRow<"impulse" | "step">
                      tabs={[
                        { id: "impulse", label: "Impulse" },
                        { id: "step", label: "Step" },
                      ]}
                      selected={transientView}
                      onSelect={setTransientView}
                      ariaLabel="Impulse or step response"
                      className="chart-tabs"
                    />
                  }
                  foot={
                <p className="hint">
                  What each box puts out for a click (impulse) and for the voltage switched on and held (step), at 1 m, with
                  EQ and the high-pass filter, as Hornresp shows it (the response up to 20&nbsp;kHz, from radiated power).
                  The box alone: no baffle step or room gain. A positive start means the cone moves out. A sealed box&rsquo;s
                  step falls back quickly; a ported box&rsquo;s or a line&rsquo;s rings on as the port or line keeps sounding.
                </p>
                  }
                />
              </div>
            )}
            <div className="chart-cell" hidden={!onScreen("delay")} style={cellStyle("delay")}>
              <LogChart {...delayChart(chartInput)} hidden={!onScreen("delay")} />
            </div>
            </div>
          </ChartTitleMenu.Provider>
          </CrosshairProvider>
          </ChartEmphasis.Provider>
        )}
        {/* Only once there's a measurement: adding one is in the Response and Impedance chart menus (and Open). */}
        {mainDesigns.length > 0 && state.measured.length > 0 && <MeasuredCard measured={state.measured} designs={mainDesigns} onChange={(measured) => setStep((s) => ({ ...s, measured }))} />}

        <footer className="site-footer muted">
          <p className="footer-about">
            Speaker Box Genius is a free speaker box simulator for sealed, ported, passive radiator, bandpass and transmission line boxes, checked
            against WinISD and Hornresp. New to box design? Start with{" "}
            <a href="/guides/sealed-vs-ported/">sealed, ported or passive radiator</a>,{" "}
            <a href="/guides/passive-radiator-box/">designing a passive radiator box</a>,{" "}
            <a href="/guides/port-chuffing/">how big a port should be</a> or{" "}
            <a href="/guides/car-subwoofer/">car subwoofer boxes</a>. Coming from WinISD? See <a href="/winisd-alternative/">what's the same and what's new</a>.
          </p>
          <nav className="footer-nav" aria-label="Site">
            <div>
              <h3>Learn</h3>
              <ul>
                <li><a href="/guides/">Guides</a></li>
                <li><a href="/drivers/">Drivers</a></li>
                <li><a href="/calculators/">Calculators</a></li>
                <li><a href="/validation/">Validation</a></li>
              </ul>
            </div>
            <div>
              <h3>Project</h3>
              <ul>
                <li><a href="/about/">About</a></li>
                <li>
                  <a href="/changelog/">
                    Changelog{import.meta.env.VITE_APP_VERSION ? ` · v${import.meta.env.VITE_APP_VERSION}` : ""}
                  </a>
                </li>
                <li><a href={REPO}>GitHub</a></li>
                <li><a href={`${REPO}/blob/main/LICENSE`}>Licence</a></li>
                <li><a href="/privacy/">Privacy</a></li>
              </ul>
            </div>
            <div>
              <h3>Help</h3>
              <ul>
                {!welcome.tips && (
                  <li>
                    <button type="button" className="link" onClick={welcome.showTips}>
                      Getting started tips
                    </button>
                  </li>
                )}
                <li>
                  <a href={reportUrl(shareUrl())} target="_blank" rel="noopener">
                    Report a problem
                  </a>
                </li>
                <li><a href={`${REPO}/blob/main/docs/data-sources.md`}>Driver data credits</a></li>
              </ul>
            </div>
          </nav>
          <p className="footer-fine">
            Small-signal lumped model: no Bl/Cms non-linearity (port compression and a hot voice coil are in Settings). Box losses Ql{" "}
            {qText(state.settings.losses.ql)}, Qa {qText(state.settings.losses.qa)}, Qp {qText(state.settings.losses.qp)}. Free for non-commercial use.
          </p>
        </footer>
      </main>
      <DesignAssistant
        open={assistant}
        onClose={() => setAssistant(false)}
        onHaveDriver={() => {
          setAssistant(false);
          choosePanel("driver");
          setPhoneView("panel");
          window.scrollTo({ top: 0 });
          pickToCharts.current = true;
          // Straight into the driver database's search, as soon as its list has loaded (a few seconds at most).
          const started = Date.now();
          const openSearch = () => {
            const b = document.querySelector<HTMLButtonElement>("#panel-driver .dv-body .browse:not(:disabled)");
            if (b) b.click();
            else if (Date.now() - started < 5000) setTimeout(openSearch, 150);
          };
          setTimeout(openSearch, 60);
        }}
        onDemo={() => {
          setAssistant(false);
          // The example's boxes: the Boxes panel on wide screens, the charts on phones.
          choosePanel("boxes");
          setPhoneView("charts");
        }}
        db={db}
        base={state}
        onPortLimit={(portLimit_ms) => set("settings", { ...state.settings, portLimit_ms })}
        shared={shared}
        onOpen={(d, rs, goal) => {
          const next = openResults(state, d, rs, goal);
          setStep(() => next);
          // The new boxes: their volumes and tuning first (the charts on phones).
          choosePanel("boxes");
          setPhoneView("charts");
          rememberDriver(d);
          setAssistant(false);
          const boxes = rs
            .map((r) =>
              r.box === "line"
                ? `${r.vb_l} L ${r.line?.label ?? "line"}`
                : r.box === "bandpass"
                  ? `${r.vb_l} L ${r.bandpass?.order === "4" ? "4th" : "6th"}-order bandpass box`
                  : r.box === "pr"
                  ? `${r.vb_l} L box with ${r.pr && r.pr.count > 1 ? `${r.pr.count} × ` : "a "}${r.pr?.name ?? "passive radiator"}`
                  : `${r.vb_l} L ${r.box === "sealed" ? "sealed" : "ported"} box`,
            )
            .join(" and ");
          notify(`Started with the ${d.name} in a ${boxes}, at ${goal.power_w} W${goal.use === "car" ? " with cabin gain" : ""}.`);
          showChart("response", []);
        }}
      />
      <nav className="phone-nav" aria-label="Screens" data-bottom-bar>
        <PanelTabs
          value={panel}
          onChange={(p) => showOnPhone("panel", p)}
          badges={tabBadges}
          lead={{ id: "charts", label: "Charts", selected: phoneView === "charts", onSelect: () => showOnPhone("charts") }}
          className="phone-tabs"
          idPrefix="ptab-"
        />
      </nav>
      {submit && (
        <SubmitDialog
          open
          onClose={() => setSubmit(null)}
          initial={submit.init}
          {...dbLookup(db)}
          githubUrl={submit.github}
          onFix={() => {
            setSubmit(null);
            if (submit.init.kind === "driver") {
              choosePanel("driver");
              setPhoneView("panel");
              setTsOpen(true);
            }
          }}
          status={submitStatus}
          siteKey={TURNSTILE_SITE_KEY}
          onSubmit={(fields, credit, token) => {
            track("submit_sent", { kind: submit.init.kind });
            setSubmitStatus({ kind: "sending" });
            sendSubmission(SUBMIT_ENDPOINT, fields, credit, token).then((r) =>
              setSubmitStatus(r.ok ? { kind: "done", prUrl: r.prUrl, prNumber: r.prNumber, dryRun: r.dryRun } : { kind: "failed", message: r.message }),
            );
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className="link"
              onClick={() => {
                const run = toast.action!.run;
                setToast(null);
                run();
              }}
            >
              <Sparkle />
              {toast.action.label}
            </button>
          )}
          {canUndo && (
            <button
              className="link"
              onClick={() => {
                undo();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
          <button className="link toast-close" onClick={() => setToast(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </div>
    </SubmitPrContext.Provider>
    </UnitsContext.Provider>
  );
}

/** What the port checks need to know about a design: its simulated peak port speed and the box it sits in. */
function portContext(state: AppState, designs: Design[], id: string) {
  const r = designs.find((x) => x.design.id === id)?.result;
  const fMin = checkFromHz(state.highPass.on, r?.summary.f3);
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
  let boxMode_hz: number | null = null;
  if (v.link === id) {
    internalMax_cm = insideLongest_cm(shapeOf(v), v.wall_mm);
    boxMode_hz = lowestMode_hz(shapeOf(v), v.wall_mm, airOf(state).c);
  }
  return {
    portVelocity: peak,
    rearPortVelocity: rearPeak,
    internalMax_cm,
    boxMode_hz,
    portVelocityAt: r?.summary.portVelocityAt ?? "throat",
    portCompression: r?.summary.portCompression ?? null,
    portLimit: portLimitOf(state),
    rms: state.settings.velocity === "rms",
    drive: driveLabel(state),
  };
}

/** A deep-bass note, in words: where, and the drive that keeps it within Xmax. */
function deepText(deep: NonNullable<Limits["deep"]>, state: AppState): string {
  return `Past Xmax only below ${deep.below_hz.toFixed(0)} Hz (0.7 × the tuning), within it up to ${driveAt(state, deep.scale)}: fine for most music, which has little energy that low. A subsonic filter removes it.`;
}

/**
 * Phones, on the control screens: one line per box with its F3 and whether it's over a limit,
 * kept at the top while you scroll, so changing a box shows its effect without going to the
 * charts. Tapping a box goes to the chart for its limit (or the response).
 */
function StatusStrip({
  designs,
  state,
  onJump,
  onPower,
}: {
  designs: Design[];
  state: AppState;
  onJump: (kind: LimitKind | null, ids: string[]) => void;
  onPower: () => void;
}) {
  const mains = designs.filter((d) => !d.compare);
  if (mains.length === 0) return null;
  const drive = state.drive === "volts" ? `${Number(state.volts.toPrecision(3))} V` : `${Number(state.power.toPrecision(3))} W`;
  return (
    <div className="status-strip" role="group" aria-label="Boxes at a glance">
      {/* The drive the limits are checked at: set on the charts, so it's shown (not edited) here. */}
      <button type="button" className="strip-box strip-power" onClick={onPower} title="The power the limits are checked at. Change it on the charts." aria-label={`Drive ${drive}: change it on the charts`}>
        <span aria-hidden="true">⚡</span>
        {drive}
      </button>
      {mains.map((d) => {
        const l = limitsOf(d.result, state.xmax_mm, state.highPass.on, portLimitOf(state), airLimitOf(state));
        const f3 = d.result.summary.f3;
        const first = l.over[0] ?? null;
        const jump = first ?? (l.deep ? "xmax" : null);
        return (
          <button
            key={d.design.id}
            type="button"
            className={`strip-box${first ? " is-over" : ""}`}
            onClick={() => onJump(jump, [d.design.id])}
            title={first ? `Show the ${LIMIT_NAME[first]} chart` : l.deep ? deepText(l.deep, state) : "Show the response"}
          >
            <span className="dot" style={{ background: d.color }} aria-hidden="true" />
            <span className="strip-name">{shortName(d.label)}</span>
            <span className="strip-f3">{f3 === null ? "–" : `F3 ${f3.toFixed(0)}`}</span>
            <span className={first ? "over" : l.deep ? "deep" : "ok"}>
              {first ? `⚠ ${LIMIT_NAME[first]}${l.over.length > 1 ? ` +${l.over.length - 1}` : ""}` : l.deep ? `Xmax <${l.deep.below_hz.toFixed(0)} Hz` : "OK"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A summary value: plain, or (over its limit) a link to the chart that shows it. */
function OverValue({ over, text, onJump }: { over: boolean; text: string; onJump: () => void }) {
  if (!over) return <>{text}</>;
  return (
    <button type="button" className="over-link" onClick={onJump} title="Show it on its chart">
      {text}
    </button>
  );
}

function Summary({
  designs,
  state,
  missing,
  narrow,
  onJump,
  onMaxSpl,
}: {
  designs: Design[];
  state: AppState;
  missing: boolean;
  narrow?: boolean;
  onJump?: (kind: LimitKind | null, ids: string[]) => void;
  /** Show the Max SPL chart with these designs picked out (a headroom cell). */
  onMaxSpl?: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [folded, setFolded] = useState(true);
  const fmt = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "–" : v.toFixed(digits));
  if (missing) return <p className="warn summary">Enter the driver's parameters to see the simulation.</p>;
  if (designs.length === 0) return <p className="muted summary">Turn on at least one enclosure.</p>;
  // Each box, then the comparison driver in that box.
  designs = designs.filter((d) => !d.compare).flatMap((d) => [d, ...designs.filter((c) => c.compare && c.design.id === d.design.id)]);
  // Without a high-pass filter, a tuned box's deep bass is graded, not failed (limitsOf).
  const fMin = checkFromHz(state.highPass.on);
  const hasAir = designs.some((d) => d.result.airHd2);
  if (narrow) {
    // Phones: folded to one line by default, so the charts start near the top of the screen.
    // Open: name, volume, F3 and what (if anything) is over its limit; the rest one tap away.
    const mains = designs.filter((d) => !d.compare);
    const lims = mains.map((d) => ({ id: d.design.id, l: limitsOf(d.result, state.xmax_mm, state.highPass.on, portLimitOf(state), airLimitOf(state)) }));
    const overs = lims.map((x) => ({ id: x.id, over: x.l.over })).filter((x) => x.over.length > 0);
    const overCount = overs.length;
    const deeps = lims.filter((x) => x.l.over.length === 0 && x.l.deep);
    // The jump goes to the first limit crossed (cone, then PR, then port), picking out every box over it.
    const firstKind = (["xmax", "pr", "port"] as const).find((k) => overs.some((x) => x.over.includes(k))) ?? null;
    const f3s = mains.map((d) => d.result.summary.f3).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return (
      <div className={`summary${folded ? " folded" : ""}`}>
        {/* Which driver, so the charts never lose their context: its own line, cut short only if very long. */}
        {state.driverName.trim() && <div className="summary-driver">{state.driverName.trim()}</div>}
        <div className="summary-line">
          <button type="button" className="summary-fold" aria-expanded={!folded} onClick={() => setFolded(!folded)}>
            <span className="summary-dots" aria-hidden="true">
              {mains.map((d) => (
                <span key={d.design.id} className="dot" style={{ background: d.color }} />
              ))}
            </span>
            <span className="summary-count">
              {mains.length} {mains.length === 1 ? "box" : "boxes"}
              {f3s.length > 0 && ` · F3 ${fmt(Math.min(...f3s), 0)}${f3s.length > 1 ? `–${fmt(Math.max(...f3s), 0)}` : ""} Hz`}
            </span>
            {!overCount && !deeps.length && <span className="muted">all OK</span>}
            <span className="caret muted" aria-hidden="true">
              {folded ? "▾" : "▴"}
            </span>
          </button>
          {overCount > 0 && firstKind && (
            <button
              type="button"
              className="summary-jump"
              onClick={() => onJump?.(firstKind, overs.filter((x) => x.over.includes(firstKind)).map((x) => x.id))}
              title={`Show the ${LIMIT_NAME[firstKind]} chart`}
              aria-label={`${overCount} ${overCount === 1 ? "box" : "boxes"} over a limit: show the ${LIMIT_NAME[firstKind]} chart`}
            >
              ⚠ {overCount} over ›
            </button>
          )}
          {!overCount && deeps.length > 0 && (
            <button
              type="button"
              className="summary-jump deep"
              onClick={() => onJump?.("xmax", deeps.map((x) => x.id))}
              title={deepText(deeps[0]!.l.deep!, state)}
            >
              Deep-bass Xmax ›
            </button>
          )}
        </div>
        {!folded && (
        <>
        <table className="summary-compact">
          <thead>
            <tr>
              <th />
              <th>Vb</th>
              <th>F3</th>
              <th>Limits</th>
            </tr>
          </thead>
          <tbody>
            {designs.map(({ design: d, label, compare, color, vb_l, acting_l, f3Room, result: r }) => {
              const xmax = compare && state.compare ? state.compare.xmax_mm : state.xmax_mm;
              const lim = limitsOf(r, xmax, state.highPass.on, portLimitOf(state), airLimitOf(state));
              const { x, xpr, vp, deep, hd2 } = lim;
              const over = lim.over.map((k) => LIMIT_NAME[k]);
              if (compare) {
                // The compare driver in the same box: one dimmed line under the box's own row.
                return (
                  <tr key={`${d.id}-vs`} className="summary-vs">
                    <th>
                      <span className="dot dot-vs" style={{ borderColor: color }} aria-hidden="true" />
                      <span title={label}>vs {state.compare ? compareShort(state.compare.driverName, state.compare.driverBrand) : ""}</span>
                    </th>
                    <td />
                    <td>
                      {fmt(r.summary.f3)}
                      {r.summary.f3High !== undefined && `–${fmt(r.summary.f3High)}`} Hz
                    </td>
                    <td className={over.length ? "over" : deep ? "deep" : "muted"}>{over.length ? `⚠ ${over[0]}` : deep ? `Xmax <${deep.below_hz.toFixed(0)} Hz` : "OK"}</td>
                  </tr>
                );
              }
              const isOpen = open === d.id;
              return [
                <tr key={d.id} className="summary-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : d.id)}>
                  <th>
                    <span className="dot" style={{ background: color }} aria-hidden="true" />
                    <span>{shortName(d.name)}</span>
                  </th>
                  <td>{(d.kind === "ib" && d.rear === "open" ? "Open" : d.kind === "ob" ? OB_FRAME[d.frame] : volCell(vb_l, acting_l, state.settings.units))}</td>
                  <td>
                    {fmt(r.summary.f3)}
                    {r.summary.f3High !== undefined && `–${fmt(r.summary.f3High)}`} Hz
                    {f3Room !== undefined && <RoomF3 f3={f3Room} car={state.roomGain.mode === "car"} peak={state.settings.f3From === "peak"} />}
                  </td>
                  <td className={over.length ? "over" : deep ? "deep" : "muted"}>
                    {over.length ? (
                      <button
                        type="button"
                        className="over-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          const k = lim.over[0];
                          if (k) onJump?.(k, [d.id]);
                        }}
                      >
                        ⚠ {over[0]} ›
                      </button>
                    ) : deep ? (
                      <button
                        type="button"
                        className="over-link deep"
                        title={deepText(deep, state)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onJump?.("xmax", [d.id]);
                        }}
                      >
                        Xmax &lt;{deep.below_hz.toFixed(0)} Hz ›
                      </button>
                    ) : (
                      "OK"
                    )}
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${d.id}-more`} className="summary-more">
                    <td colSpan={4}>
                      {d.kind === "bandpass"
                        ? `Fb ${fmt(r.summary.fbRear ?? r.summary.fc)} / ${fmt(r.summary.fb)} Hz`
                        : r.summary.fb !== undefined
                          ? `Fb ${fmt(r.summary.fb)} Hz`
                          : `Fc ${fmt(r.summary.fc)} Hz`}
                      {r.summary.qtc !== undefined && r.summary.qtc !== null ? ` · Qtc ${fmt(r.summary.qtc, 2)}` : ""}
                      {` · F6 ${fmt(r.summary.f6)} · F10 ${fmt(r.summary.f10)} Hz`}
                      {state.settings.f3From === "peak" ? " (from peak)" : ""}
                      {` · cone ${fmt(x)} mm`}
                      {xpr ? ` · PR ${fmt(xpr.mm)} mm` : ""}
                      {vp !== null ? ` · port ${fmt(vp)} m/s` : ""}
                      {hd2 !== null ? ` · air HD2 ${fmt(hd2)} %` : ""}
                      {over.length ? ` · over: ${over.join(", ")} (within up to ${driveAt(state, lim.safeScale)})` : ""}
                      {deep ? ` · ${deepText(deep, state)}` : ""}
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
        <p className="hint">
          Tap a row for its details. Peaks above {fMin} Hz{state.highPass.on ? "" : " (or a box's F3, if lower)"}{state.highPass.on ? "" : "; a ported or PR box's deep bass (below 0.7 × its tuning) is graded, not failed"}.
          {state.settings.f3From === "peak" ? " F3 measured from each box's bass peak (Settings → F3 from)." : ""}
        </p>
        </>
        )}
      </div>
    );
  }
  const signal = state.settings.signal;
  const headroomCol = (d: Design, side: "peak" | "avg") => {
    const h = designProgram(d, signal)[side];
    if (!h) return <td>–</td>;
    const cell = headroomCell(h)!;
    return (
      <td data-tone={cell.tone}>
        <button
          type="button"
          className="headroom-link"
          title={`${cell.at} · ${sideLimitText(h.kind, side)}: show Max SPL`}
          onClick={() => onMaxSpl?.([d.design.id])}
        >
          {cell.main}
        </button>
      </td>
    );
  };
  return (
    <div className="summary">
      <div className="summary-scroll">
      <table>
        <thead>
          {signal.program && (
            <tr className="headroom-groups">
              <th colSpan={hasAir ? 9 : 8} />
              <th colSpan={2} className="headroom-group">
                Headroom vs {signal.target_dB !== null ? `${fmtCrest(signal.target_dB)} dB` : "drive"}
              </th>
            </tr>
          )}
          <tr>
            <th />
            <th>Vb</th>
            <th>F3</th>
            <th>Fb / Fc</th>
            <th>Qtc</th>
            <th>Peak cone</th>
            <th>Peak PR</th>
            <th>Peak port</th>
            {hasAir && <th title="Peak 2nd harmonic from the air (HD2: in the box, or along a line), above the same floor as the other peaks">Peak air</th>}
            {signal.program && (
              <>
                <th title="Xmax, port speed, air, amp volts and current: limited on the signal's peaks">On peaks</th>
                <th title="Driver power (Pe), amp watts: limited on the signal's average">On average</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {designs.map((dz) => {
            const { design: d, label, compare, color, vb_l, acting_l, f3Room, result: r } = dz;
            const xmax = compare && state.compare ? state.compare.xmax_mm : state.xmax_mm;
            const lim = limitsOf(r, xmax, state.highPass.on, portLimitOf(state), airLimitOf(state));
            const { x, xpr, vp, deep, hd2 } = lim;
            const xOver = lim.over.includes("xmax");
            return (
              <tr key={compare ? `${d.id}-vs` : d.id} className={compare ? "summary-vs" : undefined}>
                <th>
                  <span className={compare ? "swatch swatch-vs" : "swatch"} style={compare ? { borderColor: color } : { background: color }} aria-hidden="true" />
                  <span title={label}>{shortName(label)}</span>
                </th>
                <td>
                  {(d.kind === "ib" && d.rear === "open" ? "Open" : d.kind === "ob" ? OB_FRAME[d.frame] : volCell(vb_l, acting_l, state.settings.units))}
                  {d.kind === "bandpass" && ` + ${fmtQ(d.frontVb_l, "vol", state.settings.units)}`}
                </td>
                <td>
                  {fmt(r.summary.f3)}
                  {r.summary.f3High !== undefined && `–${fmt(r.summary.f3High)}`} Hz
                  {f3Room !== undefined && <RoomF3 f3={f3Room} car={state.roomGain.mode === "car"} peak={state.settings.f3From === "peak"} />}
                </td>
                <td>
                  {d.kind === "bandpass"
                    ? `${fmt(r.summary.fbRear ?? r.summary.fc)} / ${fmt(r.summary.fb)}`
                    : fmt(r.summary.fb ?? r.summary.fc)}{" "}
                  Hz
                </td>
                <td>{fmt(r.summary.qtc, 2)}</td>
                <td className={xOver ? "over" : ""}>
                  <OverValue over={xOver} text={excursionText(x, state)} onJump={() => onJump?.("xmax", [d.id])} />
                  {deep && (
                    <span className="deep-note" title={deepText(deep, state)}>
                      {" "}
                      · {excursionText(deep.x_mm, state)} &lt;{deep.below_hz.toFixed(0)} Hz
                    </span>
                  )}
                </td>
                <td
                  className={xpr?.over ? "over" : ""}
                  title={(r.prGroups?.length ?? 0) > 1 ? "The PR group closest to (or furthest past) its own Xmax" : undefined}
                >
                  {xpr === null ? "–" : <OverValue over={xpr.over} text={excursionText(xpr.mm, state)} onJump={() => onJump?.("pr", [d.id])} />}
                </td>
                <td className={vp !== null && vp > portLimitOf(state) ? "over" : ""}>
                  {vp === null ? "–" : <OverValue over={vp > portLimitOf(state)} text={`${fmt(vp)} m/s`} onJump={() => onJump?.("port", [d.id])} />}
                </td>
                {hasAir && (
                  <td className={lim.over.includes("air") ? "over" : ""}>
                    {hd2 === null ? "–" : <OverValue over={lim.over.includes("air")} text={`${fmt(hd2)} %`} onJump={() => onJump?.("air", [d.id])} />}
                  </td>
                )}
                {signal.program && headroomCol(dz, "peak")}
                {signal.program && headroomCol(dz, "avg")}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <p className="hint swipe-hint">Swipe the table sideways for peak excursion, port speed and air distortion.</p>
      <p className="hint">
        {state.highPass.on ? (
          <>Peaks are taken above {fMin} Hz. </>
        ) : (
          <>
            Peaks are taken above {fMin} Hz for every box (or above its F3, if that's lower), since music has little energy below that. A ported or PR box's deep bass (below 0.7 × its tuning)
            may also reach 2 × Xmax, shown in amber, before it counts as over. Turn on the high-pass filter to model a subsonic filter and check down to 10 Hz.{" "}
          </>
        )}
        Red means over the limit: click it to see the chart.
        {state.settings.f3From === "peak" ? " F3 from bass peak." : ""}
      </p>
    </div>
  );
}

/** The F3 with room or cabin gain, under the box's own F3 in the summary. */
function RoomF3({ f3, car, peak }: { f3: number | null; car: boolean; peak: boolean }) {
  const where = car ? "in the car" : "in the room";
  return (
    <span className="room-f3" title={`F3 with the ${car ? "cabin" : "room"} gain (Signal tab), marked by the response chart's F3 dots. The F3 before it is the box's own, ${peak ? "from its bass peak (as VituixCAD gives it)" : "from the passband (as WinISD gives it)"}.`}>
      {f3 === null ? ` · flat to 10 Hz ${where}` : ` · ${f3 < 100 ? f3.toFixed(1) : f3.toFixed(0)} Hz ${where}`}
    </span>
  );
}



/** A design's volume for the summary tables: "40.0 L", or "40.0 → 48.0 L" when stuffing makes it act bigger. */
function volCell(built: number, acting: number | undefined, units: "metric" | "imperial") {
  if (acting === undefined) return fmtQ(built, "vol", units);
  return (
    <span title={`Built ${fmtQ(built, "vol", units)}; its stuffing makes it act as ${fmtQ(acting, "vol", units)}`}>
      {fmtQ(built, "vol", units).split(" ")[0]} → {fmtQ(acting, "vol", units)}
    </span>
  );
}

/**
 * Under the excursion and port-speed charts at about 1 W (WinISD's and Hornresp's starting
 * point): those charts sit far below their red lines there, which can read as "this box is fine".
 */
function LowDriveNote(p: { state: AppState; chart: "excursion" | "port"; hidden: boolean; onRated: () => void }) {
  const low = lowDrive(p.state);
  if (!low || p.hidden) return null;
  const at = p.state.drive === "watts" ? `${Number(p.state.power.toPrecision(3))} W` : `${p.state.volts} V (about ${Number(low.watts.toPrecision(2))} W)`;
  const what = p.chart === "excursion" ? "the cone barely moves, so no box comes near Xmax" : "the port air is slow, so no port comes near the chuffing line";
  return (
    <p className="hint low-drive" role="note">
      At {at}, {what}.{" "}
      {low.rated > 0 ? (
        <button type="button" className="link" onClick={p.onRated}>
          Show at the rated {low.rated} W
        </button>
      ) : (
        "Raise the power above the charts to see the limits."
      )}
    </p>
  );
}

/** File Handling API (installed app); not in TypeScript's DOM types yet. */
interface LaunchQueue {
  setConsumer(consumer: (params: { files?: readonly FileSystemFileHandle[] }) => void): void;
}
