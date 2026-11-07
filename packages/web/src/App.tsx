import { useEffect, useMemo, useRef, useState } from "react";
import {
  coilHeatFactor,
  impedanceMagnitude,
  parseWdr,
  parseWpr,
  resampleMagnitude,
  roomGainDb,
  writeWdr,
  type HighPassType,
  type SimulationResult,
  type TsValues,
} from "@sbg/engine";
import { ChartEmphasis, CrosshairProvider, LogChart, shortName, type ChartHandle, type Series } from "./LogChart.tsx";
import { TimeChart } from "./TimeChart.tsx";
import { draggableEq, eqQ, moveEq, retune, tunable } from "./chartEdit.ts";
import { useUndoable } from "./useUndoable.ts";
import { sizeAllForDriver, sizeBandpassDesign } from "./presets.ts";
import type { FinderContext } from "./PrFinder.tsx";
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
  type DesignState,
} from "./state.ts";
import { flagText, loadDriver, loadIndex, type DbIndex } from "./library.ts";
import { Card, DriveValue, Num, REPO, Select, useNarrow } from "./components.tsx";
import { DriverBrowser } from "./Library.tsx";
import { PwaStatus, usePwa } from "./Pwa.tsx";
import { GettingStarted, LinkNote, useWelcome } from "./Welcome.tsx";
import { TsEditor } from "./TsEditor.tsx";
import { DriverMenu } from "./DriverMenu.tsx";
import { VolumePanel } from "./VolumePanel.tsx";
import { BuildSheet } from "./BuildSheet.tsx";
import {
  airOf,
  baffleDbFor,
  alignmentDriver,
  colorOf,
  dvcFactors,
  PORT_LIMIT,
  prGroupLabels,
  prXmaxes,
  dimensionsFor,
  coilLabel, driveLabel,
  driverInputOf,
  simOptionsOf,
  roomGainOf,
  lowEdge,
  minus3Points,
  runDesigns,
  transientsOf,
  compareShort,
  solveDriver,
  vbOf,
  switchDrive,
  builtVbOf,
  limitsOf,
  portLimitOf,
  driveAt,
  deepSplitOf,
  DEEP_ALLOW,
  DEEP_FLOOR_HZ,
  type Limits,
  LIMIT_CHART,
  LIMIT_NAME,
  type Design,
  type LimitKind,
} from "./sim.ts";
import { RoomGainPanel } from "./RoomGain.tsx";
import { BafflePanel } from "./BafflePanel.tsx";
import { AddDesign, DesignCard } from "./Designs.tsx";
import { MeasuredCard, measuredSeries } from "./Measured.tsx";
import { HelpDock } from "./HelpDock.tsx";
import { reportUrl, ShareMenu } from "./Share.tsx";
import { EqPanel } from "./Eq.tsx";
import { PassivePanel } from "./Passive.tsx";
import { MeasurePanel, type Measurement } from "./Measure.tsx";
import { fmtQ, UnitsContext } from "./units.ts";
import { AppMenu } from "./AppMenu.tsx";
import { openResults, withDriver } from "./assistant.ts";
import type { SharedResults } from "./assistant.ts";
import { ASSISTANT_HASH, SHARED_LINK, SHARED_RESULTS, START_IN_ASSISTANT, untouched } from "./start.ts";
import { DesignAssistant } from "./DesignAssistant.tsx";
import { Logo } from "./Logo.tsx";
import { submitDriverUrl } from "./submit.ts";

const LIMIT_RED = "#dc2626";

/** What sets the maximum SPL at each frequency, as shown in the strip under the Max SPL chart. */
const LIMIT_KINDS: Record<string, { label: string; short: string; color: string }> = {
  xmax: { label: "Cone Xmax", short: "cone Xmax", color: "#dc2626" },
  "pr-xmax": { label: "PR Xmax", short: "PR Xmax", color: "#9333ea" },
  port: { label: "Port speed", short: "port speed", color: "#d97706" },
  thermal: { label: "Power (Pe)", short: "power handling", color: "#6b7389" },
  amp: { label: "Amplifier", short: "amplifier limit", color: "#0891b2" },
};

type ChartId = "excursion" | "pr" | "port" | "maxspl" | "impedance" | "za" | "delay" | "transient" | "pressure";

/**
 * The level a design's relative response is drawn against: a plain cone's level, or for a
 * bandpass box its band's own peak (so its −3 dB points are its band edges, as in the summary).
 */
function relRefOf(r: SimulationResult): number {
  return r.summary.bandPeakSpl ?? r.summary.referenceSpl;
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
  /** Credit line for the driver loaded from the database; shown while its name is unchanged. */
  const [driverSource, setDriverSource] = useState<{ name: string; url?: string; via?: "driver-base"; ts?: TsValues; id?: string } | null>(null);
  const [wdrMsg, setWdrMsg] = useState("");
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const wdrInput = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  // SPL chart scale: relative to each design's passband (default) or absolute dB SPL. A view
  // preference of this browser, not part of the design.
  const [splMode, setSplMode] = useState<"relative" | "absolute">(() => {
    try {
      return localStorage.getItem("sbg.spl") === "absolute" ? "absolute" : "relative";
    } catch {
      return "relative";
    }
  });
  // Max SPL chart: the SPL itself, or the amplifier voltage or current it takes to get there.
  const [maxMode, setMaxMode] = useState<"spl" | "volts" | "amps">(() => {
    try {
      const v = localStorage.getItem("sbg.max");
      return v === "volts" || v === "amps" ? v : "spl";
    } catch {
      return "spl";
    }
  });
  const chooseMaxMode = (m: "spl" | "volts" | "amps") => {
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
  const [editFrom, setEditFrom] = useState<{ designs: AppState["designs"]; eq: AppState["eq"] } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const openEditor = () => {
    setEditFrom({ designs: latest.current.designs, eq: latest.current.eq });
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
    try {
      localStorage.setItem("sbg.chart", c);
    } catch {
      // not remembered
    }
  };
  // Which group of controls the left column shows.
  const [panel, setPanel] = useState<PanelId>(initialPanel);
  const choosePanel = (p: PanelId) => {
    setPanel(p);
    rememberPanel(p);
  };
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
    if (chart !== "response" && (chart !== "excursion" || narrow)) chooseChart(chart);
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
  const welcome = useWelcome();
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
  const designs = useMemo(() => runDesigns(state, solved), [state, solved]);
  const freq = designs[0]?.result.freq ?? new Float64Array();

  const set = <K extends keyof AppState>(k: K, v: AppState[K]) => setState((s) => ({ ...s, [k]: v }));

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
  // A line's cone and mouth curves, when switched on.
  const partsOf = (d: Design, map: (y: Float64Array) => Float64Array): Series[] =>
    showParts && d.result.parts && !d.compare
      ? [
          { label: `${d.label} · cone`, color: d.color, y: map(d.result.parts.cone), dash: "6 4", thin: true },
          { label: `${d.label} · mouth`, color: d.color, y: map(d.result.parts.mouth), dash: "1.5 3", thin: true },
        ]
      : [];
  const series = (pick: (r: SimulationResult) => Float64Array | null): Series[] =>
    designs.map((d) => ({ label: d.label, color: d.color, dash: d.dash, y: pick(d.result) }));

  // The short link once it's ready for this exact state; until then (150 ms after an edit) the long form, which is always correct.
  const shareUrl = () =>
    location.origin + location.pathname + "#" + (link.current?.state === state ? link.current.hash : encodeState(state));

  const importWdr = async (file: File) => {
    try {
      // WinISD saves in the Windows code page; latin1 keeps most names intact.
      const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
      if (/^\[Box\]/im.test(text)) return importWpr(file.name, text);
      const d = parseWdr(text);
      offerSizing([d.brand, d.model].filter(Boolean).join(" ") || file.name);
      setStep((s) => ({
        ...s,
        driverName: [d.brand, d.model].filter(Boolean).join(" ") || file.name.replace(/\.wdr$/i, ""),
        driverBrand: d.brand,
        nominal_ohms: d.nominal_ohms ?? s.nominal_ohms,
        ts: d.ts,
        le_mh: d.le_mh ?? 0,
        l2_mh: 0,
        r2_ohm: 0,
        semi: undefined,
        fdd: undefined,
        xmax_mm: d.xmax_mm ?? s.xmax_mm,
        pe_w: d.pe_w ?? s.pe_w,
        dvc:
          (d.voiceCoils ?? 1) > 1
            ? { on: true, entered: d.raw.vccon === "2" ? "series" : "parallel", wired: d.raw.vccon === "2" ? "series" : "parallel" }
            : { ...s.dvc, on: false },
        volume: {
          ...s.volume,
          ...(d.displacement_l !== undefined ? { driverDisp_l: Math.round(d.displacement_l * 100) / 100 } : {}),
          driverCutout_mm: 0,
        },
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
      notify(`Imported ${fileName}.`);
      setStep((s) => {
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
        } else if (p.box.type === "bandpass" && p.bandpass) {
          const bd = newDesign("bandpass", s.designs);
          if (bd.kind === "bandpass") {
            const b = p.bandpass;
            const portFrom = (w: { count: number; diameter_cm: number; length_cm: number }, fb: number | undefined, base: typeof bd.front) => ({
              ...base,
              shape: "round" as const,
              diameter_cm: Number(w.diameter_cm.toFixed(3)),
              length_cm: Number(w.length_cm.toFixed(3)),
              count: w.count,
              targetFb: Number((fb ?? base.targetFb).toFixed(2)),
            });
            design = {
              ...bd,
              name: `WinISD: ${fileName.replace(/\.wpr$/i, "")}`,
              order: b.order,
              vb_l: Number(b.rear.vb_l.toFixed(3)),
              frontVb_l: Number(b.front.vb_l.toFixed(3)),
              front: portFrom(b.front.port, b.front.fb, bd.front),
              rear: b.rear.port ? portFrom(b.rear.port, b.rear.fb, bd.rear) : bd.rear,
              // Shared losses (Settings) take the front chamber's values; the design keeps its own
              // only when the chambers differ or the leak between them isn't WinISD's default.
              losses: bandpassOwnLosses(b) ? { front: lossesOf(b.front), rear: lossesOf(b.rear), qicl: b.qicl } : null,
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
          l2_mh: 0,
          r2_ohm: 0,
          semi: undefined,
          fdd: undefined,
          xmax_mm: d.xmax_mm ?? s.xmax_mm,
          pe_w: d.pe_w ?? s.pe_w,
          // WinISD drives isobaric pairs at V = √(P·Re/N), which is only half of P in the coils.
          power: Number((p.isobaric ? p.power / 2 : p.power).toFixed(2)),
          drive: "watts",
          drivers: p.drivers,
          wiring: "parallel",
          isobaric: p.isobaric,
          isoCoils: "series",
          // WinISD stores a DVC driver with its coils already wired (VCCon 1 = parallel, 2 = series).
          dvc:
            (d.voiceCoils ?? 1) > 1
              ? { on: true, entered: d.raw.vccon === "2" ? "series" : "parallel", wired: d.raw.vccon === "2" ? "series" : "parallel" }
              : { ...s.dvc, on: false },
          // WinISD's Rg is per driver; our setting is the shared amplifier output.
          settings: {
            ...s.settings,
            air: "winisd",
            // WinISD's models: leaked air is heard, the cone's air is a fixed mass.
            leakage: "radiates",
            coneLoad: "mass",
            // Isobaric pairs have two coils in series, each with WinISD's Rg.
            rg: Number(((p.rg * (p.isobaric ? 2 : 1)) / p.drivers).toPrecision(6)),
            inductance: p.simulateLe,
            losses: p.bandpass
              ? { ql: p.bandpass.front.ql, qa: p.bandpass.front.qa, qp: p.bandpass.front.qp }
              : { ql: p.box.ql, qa: p.box.qa, qp: p.box.qp },
          },
          highPass: p.highPass ? { on: true, ...p.highPass } : { ...s.highPass, on: false },
          designs,
          volume: {
          ...s.volume,
          ...(d.displacement_l !== undefined ? { driverDisp_l: Math.round(d.displacement_l * 100) / 100 } : {}),
          driverCutout_mm: 0,
        },
        };
      });
      const lossSrc = p.bandpass?.front ?? p.box;
      const lossNote =
        p.bandpass && bandpassOwnLosses(p.bandpass)
          ? ` The bandpass keeps the project's own losses for each chamber (Front Ql ${p.bandpass.front.ql}, Qa ${p.bandpass.front.qa}, Qp ${p.bandpass.front.qp}; Rear Ql ${p.bandpass.rear.ql}, Qa ${p.bandpass.rear.qa}, Qp ${p.bandpass.rear.qp}; baffle leak ${p.bandpass.qicl}).`
          : lossSrc.ql !== 10 || lossSrc.qa !== 100 || lossSrc.qp !== 100
            ? ` Box losses set to the project's Ql ${lossSrc.ql}, Qa ${lossSrc.qa}, Qp ${lossSrc.qp}.`
            : "";
      const boxNote = p.box.type === "other" ? " This box type isn't supported yet, so only the driver was imported." : "";
      const driversNote =
        p.drivers > 1 && !p.isobaric
          ? ` ${p.drivers} drivers in parallel; WinISD's Rg of ${p.rg} Ω per driver becomes ${Number((p.rg / p.drivers).toPrecision(6))} Ω shared. WinISD's impedance graph shows one driver, ours shows what the amplifier sees.`
          : "";
      const isoNote = p.isobaric
        ? ` Isobaric: ${p.drivers} pair${p.drivers > 1 ? "s" : ""} with series-wired coils, like WinISD. WinISD's ${Number(p.power.toFixed(2))} W only puts half that into the coils, so the power here is ${Number((p.power / 2).toFixed(2))} W for the same results.`
        : "";
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
    setStep((s) => (s.designs.length >= MAX_DESIGNS ? s : { ...s, designs: [...s.designs, newDesign(kind, s.designs)] }));
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
  const prLimits = [...new Set(prDesigns.flatMap((d) => prXmaxes(d.design)))].map((x) => ({
    value: x,
    label: `PR Xmax ${x} mm`,
    color: LIMIT_RED,
  }));
  // One curve per PR group; groups after the first are dashed and named after their PR.
  const prSeries: Series[] = prDesigns.flatMap((d) => {
    const names = prGroupLabels(d.design);
    return (d.result.prGroups ?? []).map((g, k) => ({
      label: d.design.kind === "pr" && k === 0 ? d.label : `${d.label}: ${names[k] ?? `group ${k + 1}`}`,
      color: d.color,
      dash: d.dash ?? (k === 0 ? undefined : k === 1 ? "6 3" : "2 3"),
      y: g.excursionMm,
      over: g.xmax_mm ?? undefined,
    }));
  });

  // Lines and horns: the line's acoustic impedance (Hornresp's Za), resistance solid, reactance dashed.
  const zaDesigns = mainDesigns.filter((d) => d.result.acousticImpedance);
  const zaSeries: Series[] = zaDesigns.flatMap((d) => {
    const za = d.result.acousticImpedance!;
    return [
      { label: `${d.label}: resistance`, color: d.color, y: za.resistance },
      { label: `${d.label}: reactance`, color: d.color, dash: "5 3", y: za.reactance },
    ];
  });
  // Empty lines resonate sharply (Za runs into the hundreds): keep the scale on the useful part.
  const zaRange = (() => {
    let lo = 0;
    let hi = 1;
    for (const s of zaSeries) for (const v of s.y!) if (Number.isFinite(v)) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
    return { yMin: Math.max(-4, Math.floor(lo)), yMax: Math.min(6, Math.ceil(hi)) };
  })();

  // The charts under the tab row: one at a time, the choice remembered; unavailable ones are left out.
  const hasPr = prDesigns.length > 0;
  const hasPort = designs.some((d) => d.result.portVelocity || d.result.rearPortVelocity);
  const hasBoxPressure = designs.some((d) => d.result.boxPressurePa);
  const chartTabs: { id: ChartId; label: string }[] = [
    ...(narrow ? [{ id: "excursion" as const, label: "Excursion" }] : []),
    ...(hasPr ? [{ id: "pr" as const, label: "PR excursion" }] : []),
    ...(hasPort ? [{ id: "port" as const, label: "Port speed" }] : []),
    { id: "maxspl", label: "Max SPL" },
    { id: "impedance", label: "Impedance" },
    ...(hasBoxPressure ? [{ id: "pressure" as const, label: "Box pressure" }] : []),
    ...(zaDesigns.length > 0 ? [{ id: "za" as const, label: "Line load (Za)" }] : []),
    { id: "delay", label: "Group delay" },
    { id: "transient", label: "Impulse / step" },
  ];
  const chartTab: ChartId = chartTabs.some((t) => t.id === chartPick) ? chartPick : chartTabs[0]!.id;
  // Impulse and step: worked out only while that chart is showing (a few thousand frequencies per box).
  const transients = useMemo(
    () => (chartTab === "transient" ? transientsOf(state, solved, mainDesigns) : []),
    [chartTab, state, solved, mainDesigns],
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
            color: "#e8ebf2",
            shape: "dot",
            axes: "xy",
            label: `EQ ${i + 1} (${e.type === "peak" ? "peaking" : e.type === "highshelf" ? "high shelf" : "low shelf"})`,
            text: `${e.freq} Hz · ${e.gain_db > 0 ? "+" : ""}${e.gain_db} dB · Q ${e.q}`,
            onDrag: (f, g, start) => setState((s) => moveEq(s, e.id, f, g), start ? { start: true } : { hold: true }),
            onWheel: (up) => setState((s) => eqQ(s, e.id, up)),
            onRemove: () => removeEq(e.id),
          }),
        ),
      ];
  const addEqPoint = () => {
    const id = newId(state.eq);
    setStep((s) => ({ ...s, eq: [...s.eq, { id, on: true, target: "all", type: "peak", freq: 40, gain_db: -3, q: 2 }] }));
    setPicked(`eq-${id}`);
  };
  const removeEq = (id: string) => {
    setStep((s) => ({ ...s, eq: s.eq.filter((x) => x.id !== id) }));
    setPicked(null);
  };
  // Cancel: the boxes and EQ as they were when the editor opened (one undo step), then close.
  const editChanged = editFrom !== null && (editFrom.designs !== state.designs || editFrom.eq !== state.eq);
  const cancelEdit = () => {
    if (editFrom && editChanged) {
      const from = editFrom;
      setStep((s) => ({ ...s, designs: from.designs, eq: from.eq }));
      notify("Chart edits cancelled.");
    }
    closeEditor();
  };
  const pickedEq = picked?.startsWith("eq-") ? state.eq.find((e) => `eq-${e.id}` === picked && draggableEq(e)) : undefined;

  // Passive radiators put a deep notch in the response at their own resonance, where the
  // group delay swings far negative; mark it instead of drawing a cliff off the chart.
  const notchMarkers = mainDesigns.flatMap((d) => {
    const gd = d.result.groupDelayMs;
    let i0 = -1;
    for (let i = 0; i < gd.length; i++) if (gd[i]! < -20 && (i0 < 0 || gd[i]! < gd[i0]!)) i0 = i;
    if (i0 < 0) return [];
    const f = d.result.freq[i0]!;
    return [{ f, label: `${d.label}: notch ${f < 100 ? f.toFixed(1) : f.toFixed(0)} Hz`, color: d.color }];
  });

  // Passive radiator finder and the other box tools: the main driver and drive as the charts use them.
  const finderCtx = useMemo<FinderContext>(
    () => ({
      driver: solved.missing.length > 0 ? null : driverInputOf(state, solved),
      sim: simOptionsOf(state),
      losses: { ql: state.settings.losses.ql, qa: state.settings.losses.qa },
      fMin: state.highPass.on ? 10 : 15,
      align: alignmentDriver(solved, state),
      drivers: state.drivers,
    }),
    [state, solved],
  );

  const signalOn = (state.highPass.on ? 1 : 0) + (state.passive.on ? 1 : 0) + state.eq.filter((e) => e.on).length + (state.roomGain.mode !== "off" ? 1 : 0);
  const tabBadges: Partial<Record<PanelId, string>> = {
    boxes: String(state.designs.filter((d) => d.on).length),
    ...(signalOn > 0 ? { signal: String(signalOn) } : {}),
  };

  return (
    <UnitsContext.Provider value={state.settings.units}>
    <div className={`layout phone-${phoneView}`}>
      <header className="top">
        <div className="title">
          <Logo />
          <div>
            <h1>Speaker Box Genius</h1>
            <p className="muted">Early preview</p>
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
          <ShareMenu state={state} designs={designs} shareUrl={shareUrl} />
          <AppMenu
            state={state}
            install={pwa.install}
            onOpen={(s) => {
              setStep(s);
              notify(`Opened “${s.driverName}”.`);
            }}
            notify={(m) => notify(m)}
            showTips={welcome.showTips}
            onAssistant={launchAssistant}
            reportUrl={() => reportUrl(shareUrl())}
          />
          <PwaStatus pwa={pwa} />
          {/* Always one tap away: start a new project (the launcher; a new tab once this one is in use). */}
          <button type="button" className="secondary new-btn" onClick={launchAssistant} title="Start a new project" aria-label="New project">
            <span aria-hidden="true">+</span>
            <span className="new-label">New</span>
          </button>
        </div>
      </header>

      <aside className="panel">
        <PanelTabs value={panel} onChange={choosePanel} badges={tabBadges} className="desktop-tabs" />
        {narrow && solved.missing.length === 0 && <StatusStrip designs={designs} state={state} onJump={jumpTo} />}
        {panel === "driver" && (
          <div className="tab-panel" role="tabpanel" id="panel-driver" aria-labelledby="tab-driver">
            <Card title="Driver">
              {/* Two dropdown-like pickers: the main driver, and an optional one to compare with. */}
              <div className="driver-pickers">
                <div
                  className="dp-row"
                  data-help-title="Driver"
                  data-help="The driver every box is simulated with. Tap to pick another from the database (or rename this one). Its parameters are below."
                >
                  <span className="dp-label">Main</span>
                  <DriverBrowser
                    rows={db?.drivers}
                    current={state.driverName.trim() || "Unnamed driver"}
                    extra={
                      <label className="lib-rename">
                        <span>Name of the current driver</span>
                        <input
                          className="name"
                          value={state.driverName}
                          onChange={(e) => set("driverName", e.currentTarget.value)}
                          aria-label="Driver name"
                        />
                      </label>
                    }
                    onPick={(id) =>
                      loadDriver(id).then(
                        (d) => {
                          offerSizing(d.name);
                          setDriverSource({ name: d.name, ...d.source, ts: d.ts, id });
                          setStep((s) => withDriver(s, d));
                          // From the launcher: straight to what the driver does (the charts, on phones).
                          if (pickToCharts.current) {
                            pickToCharts.current = false;
                            setPhoneView("charts");
                            window.scrollTo({ top: 0 });
                          }
                        },
                        () => alert("Couldn't load that driver."),
                      )
                    }
                  />
                  <span className="dp-icons">
                    {driverSource && driverSource.name === state.driverName && driverSource.url && (
                      <a
                        className="icon"
                        href={driverSource.url}
                        target="_blank"
                        rel="noopener"
                        title={driverSource.via === "driver-base" ? "Manufacturer's specs (values via driver-base, CC BY 4.0)" : "Manufacturer's specs"}
                        aria-label="Manufacturer's specs"
                      >
                        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                          <path d="M4 1.5h5.5L13 5v9.5H4z M9.5 1.5V5H13 M6 8h5 M6 10.5h5 M6 13h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                        </svg>
                      </a>
                    )}
                  </span>
                </div>
                <div
                  className="dp-row"
                  data-help-title="Compare with another driver"
                  data-help="Shows a second driver in every box as faint dashed curves, with the same number of drivers, wiring and settings. Swap makes it the main driver (to edit it or size boxes for it)."
                >
                  <span className="dp-label">
                    Compare
                    <svg className="dp-dash" viewBox="0 0 22 6" aria-hidden="true">
                      <line x1="1" y1="3" x2="21" y2="3" stroke="currentColor" strokeWidth="2.5" strokeDasharray="5 3" />
                    </svg>
                  </span>
                  <DriverBrowser
                    rows={db?.drivers}
                    button="Pick one…"
                    current={state.compare?.driverName}
                    title="Compare with another driver"
                    onPick={(id) =>
                      loadDriver(id).then(
                        (d) => {
                          setStep((s) => ({
                            ...s,
                            compare: {
                              driverName: d.name,
                              driverBrand: d.brand,
                              nominal_ohms: d.nominal_ohms ?? s.nominal_ohms,
                              ts: d.ts,
                              le_mh: d.le_mh ?? 0,
                              l2_mh: d.l2_mh ?? 0,
                              r2_ohm: d.r2_ohm ?? 0,
                              semi: undefined,
                              fdd: undefined,
                              xmax_mm: d.xmax_mm ?? s.xmax_mm,
                              pe_w: d.pe_w ?? s.pe_w,
                              dvc: d.dvcWiring ? { on: true, entered: d.dvcWiring, wired: d.dvcWiring } : { ...s.dvc, on: false },
                            },
                          }));
                          notify(`Comparing with ${d.name}: dashed curves in every box.`);
                        },
                        () => alert("Couldn't load that driver."),
                      )
                    }
                  />
                  <span className="dp-icons">
                    {state.compare && (
                      <>
                        <button
                          type="button"
                          className="icon"
                          title="Swap: make it the main driver"
                          aria-label="Swap with the main driver"
                          onClick={() => {
                            setStep((s) => swapCompare(s));
                            notify(`${state.compare!.driverName} is now the main driver; ${state.driverName} is the comparison.`);
                          }}
                        >
                          ⇅
                        </button>
                        <button type="button" className="icon" aria-label="Stop comparing" title="Stop comparing" onClick={() => setStep((s) => ({ ...s, compare: null }))}>
                          ✕
                        </button>
                      </>
                    )}
                  </span>
                </div>
              </div>
              {(() => {
                // A database driver whose values look implausible (db-tools plausibility checks).
                const id = driverSource && driverSource.name === state.driverName ? driverSource.id : undefined;
                const flag = id ? flagText(db?.drivers.find((r) => r.id === id)) : undefined;
                return flag ? <p className="warn driver-flag">⚠ {flag}</p> : null;
              })()}
              <TsEditor
                entered={state.ts}
                solved={solved}
                published={driverSource && driverSource.name === state.driverName ? driverSource.ts : undefined}
                onChange={(ts) => set("ts", ts)}
                pasting={pasting}
                onPastingChange={setPasting}
                onPaste={(ts, x) => {
                  offerSizing("Pasted driver");
                  setStep((s) => ({
                    ...s,
                    driverName: "Pasted driver",
                    driverBrand: "",
                    volume: { ...s.volume, driverCutout_mm: 0 },
                    ts,
                    le_mh: x.le_mh ?? s.le_mh,
                    l2_mh: 0,
                    r2_ohm: 0,
                    semi: undefined,
                    fdd: undefined,
                    xmax_mm: x.xmax_mm ?? s.xmax_mm,
                    pe_w: x.pe_w ?? s.pe_w,
                  }));
                }}
              />
              <div className="row">
                <DriverMenu
                  onMeasure={() => {
                    setMeasureOpen(true);
                    setTimeout(() => document.getElementById("measure-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                  }}
                  pasting={pasting}
                  onPaste={() => setPasting(!pasting)}
                  onClear={() => {
                    setStep((s) => ({ ...s, ts: {} }));
                    notify("Cleared the T/S values.");
                  }}
                  onImport={() => wdrInput.current?.click()}
                  onExport={exportWdr}
                  submitUrl={submitDriverUrl(state)}
                />
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
                <Num help="Nominal impedance printed on the driver (4, 8 Ω…). Only used when the drive is set as watts into the nominal impedance; the simulation itself uses Re." label="Znom" unit="Ω" value={state.nominal_ohms} onChange={(v) => set("nominal_ohms", v)} />
                <Num help="Voice-coil inductance from the datasheet. It makes the impedance rise with frequency and rolls off the top end; Settings can leave it out, like WinISD." label="Le" unit="mH" value={state.le_mh} min={0} onChange={(v) => set("le_mh", v)} />
                <Select<"le" | "semi"> help="How the voice coil's inductance is modelled. Le (with the optional L2 and R2) is the usual datasheet way. Semi-inductance is Hornresp's model (Thorborg and Futtrup): Re + Leb + (Le ∥ Rss ∥ Ke·√jω), which follows a real coil's impedance from a measured sweep more closely; its values come from fitting tools or forum posts."
                  label="Coil model"
                  value={state.semi ? "semi" : "le"}
                  options={[
                    { value: "le", text: "Le (+ L2/R2)" },
                    { value: "semi", text: "Semi-inductance (like Hornresp)" },
                  ]}
                  onChange={(m) => set("semi", m === "semi" ? (state.semi ?? { leb_mh: 0, le_mh: state.le_mh, ke: 0, rss_ohm: 0 }) : undefined)}
                />
                {state.semi ? (
                  <>
                    <Num
                      label="Re′"
                      unit="Ω"
                      value={state.semi.re_ohm ?? 0}
                      min={0}
                      title="Semi-inductance model: the coil's resistance in this model (Hornresp's Re′), when fitted apart from Re. 0 = Re. Bl stays as the T/S give it."
                      onChange={(v) => set("semi", { ...state.semi!, re_ohm: Math.max(0, v) })}
                    />
                    <Num
                      label="Leb"
                      unit="mH"
                      value={state.semi.leb_mh}
                      min={0}
                      title="Semi-inductance model: the coil's inductance outside the pole piece, in series with the rest."
                      onChange={(v) => set("semi", { ...state.semi!, leb_mh: Math.max(0, v) })}
                    />
                    <Num
                      label="Le (semi)"
                      unit="mH"
                      value={state.semi.le_mh}
                      min={0}
                      title="Semi-inductance model: the inductance in parallel with Rss and Ke. Not the datasheet Le, which this model replaces."
                      onChange={(v) => set("semi", { ...state.semi!, le_mh: Math.max(0, v) })}
                    />
                    <Num
                      label="Ke"
                      unit="sH"
                      value={state.semi.ke}
                      min={0}
                      title="Semi-inductance model: the semi-inductance (eddy currents in the pole piece), in semi-henries. 0 = none."
                      onChange={(v) => set("semi", { ...state.semi!, ke: Math.max(0, v) })}
                    />
                    <Num
                      label="Rss"
                      unit="Ω"
                      value={state.semi.rss_ohm}
                      min={0}
                      title="Semi-inductance model: losses from a shorting ring, in parallel with Le and Ke. 0 = none."
                      onChange={(v) => set("semi", { ...state.semi!, rss_ohm: Math.max(0, v) })}
                    />
                  </>
                ) : (
                  <>
                    <Num
                      label="L2"
                      unit="mH"
                      value={state.l2_mh}
                      min={0}
                      title="Optional: second, lossy inductance (L2R2 coil model). 0 = plain Le. Fill in from a measured sweep."
                      onChange={(v) => set("l2_mh", v)}
                    />
                    <Num
                      label="R2"
                      unit="Ω"
                      value={state.r2_ohm}
                      min={0}
                      title="Optional: resistance across L2 (eddy-current losses). Used only when L2 is also set."
                      onChange={(v) => set("r2_ohm", v)}
                    />
                  </>
                )}
                <Select<"qms" | "fdd"> help="How the suspension's losses are modelled. From Qms: one resistance (Rms), the usual T/S way. Frequency-dependent damping is Hornresp's FDD model: the suspension's compliance becomes complex (Cms − j·Ams), a loss that stays the same fraction of its stiffness at every frequency, as rubber and foam surrounds behave, plus its own Rms. It mostly changes the impedance peak and the response near Fs."
                  label="Suspension losses"
                  value={state.fdd ? "fdd" : "qms"}
                  options={[
                    { value: "qms", text: "From Qms" },
                    { value: "fdd", text: "Frequency-dependent (like Hornresp)" },
                  ]}
                  onChange={(m) => set("fdd", m === "fdd" ? (state.fdd ?? { rms: 0, ams_mm_per_n: 0 }) : undefined)}
                />
                {state.fdd && (
                  <>
                    <Num
                      label="Rms (FDD)"
                      unit="N·s/m"
                      value={state.fdd.rms}
                      min={0}
                      title="FDD model: the suspension's viscous resistance, in place of the Rms from Qms."
                      onChange={(v) => set("fdd", { ...state.fdd!, rms: Math.max(0, v) })}
                    />
                    <Num
                      label="Ams"
                      unit="mm/N"
                      value={state.fdd.ams_mm_per_n}
                      min={0}
                      title="FDD model: the lossy part of the compliance (Hornresp shows it in m/N: 3.00E-04 m/N is 0.3 mm/N). Ams ÷ Cms is the loss factor. 0 = off."
                      onChange={(v) => set("fdd", { ...state.fdd!, ams_mm_per_n: Math.max(0, v) })}
                    />
                  </>
                )}
                <Num help="Maximum one-way excursion the cone can make while staying linear (from the datasheet). The excursion chart turns red above it." label="Xmax" unit="mm" value={state.xmax_mm} onChange={(v) => set("xmax_mm", v)} />
                <Num help="Thermal power rating: how much power the voice coil can take continuously. Sets the thermal limit in the Max SPL chart." label="Pe" unit="W" value={state.pe_w} onChange={(v) => set("pe_w", v)} />
                <Num help="How many drivers (or isobaric pairs) share the box. More drivers move more air; the box volume is shared between them."
                  label={state.isobaric ? "Pairs" : "Drivers"}
                  value={state.drivers}
                  onChange={(v) => set("drivers", Math.max(1, Math.round(v)))}
                />
                <Select<"standard" | "isobaric"> help="Standard: each driver faces out. Isobaric: two drivers work as one (face to face or front to back), needing half the box for the same bass but 3 dB less efficiency."
                  label="Loading"
                  value={state.isobaric ? "isobaric" : "standard"}
                  options={[
                    { value: "standard", text: "Standard" },
                    { value: "isobaric", text: "Isobaric pairs" },
                  ]}
                  onChange={(x) => set("isobaric", x === "isobaric")}
                />
                {state.isobaric && (
                  <Select<"series" | "parallel"> help="How the two coils of each isobaric pair are wired together: parallel halves the impedance, series doubles it."
                    label="Pair coils"
                    value={state.isoCoils}
                    options={[
                      { value: "parallel", text: "Parallel (half the impedance)" },
                      { value: "series", text: "Series (double the impedance)" },
                    ]}
                    onChange={(x) => set("isoCoils", x)}
                  />
                )}
                <Select<"single" | "dual"> help="Dual voice coil (DVC) drivers have two coils you can wire in series or parallel. Choose Dual to get those options."
                  label="Voice coils"
                  value={state.dvc.on ? "dual" : "single"}
                  options={[
                    { value: "single", text: "Single" },
                    { value: "dual", text: "Dual (DVC)" },
                  ]}
                  onChange={(x) => set("dvc", { ...state.dvc, on: x === "dual" })}
                />
                {state.dvc.on && (
                  <>
                    <Select<"one" | "parallel" | "series"> help="Datasheets for DVC drivers give T/S values for one coil or for both coils wired a certain way. Say which, so the wiring below is calculated correctly."
                      label="Values are for"
                      value={state.dvc.entered}
                      options={[
                        { value: "parallel", text: "Both coils in parallel" },
                        { value: "series", text: "Both coils in series" },
                        { value: "one", text: "One coil" },
                      ]}
                      onChange={(entered) => set("dvc", { ...state.dvc, entered })}
                    />
                    <Select<"parallel" | "series"> help="How you will wire the two voice coils: series doubles the impedance, parallel halves it. It changes the load on the amplifier, not the bass shape."
                      label="Coils wired"
                      value={state.dvc.wired}
                      options={[
                        { value: "parallel", text: "In parallel" },
                        { value: "series", text: "In series" },
                      ]}
                      onChange={(wired) => set("dvc", { ...state.dvc, wired })}
                    />
                  </>
                )}
                {state.drivers > 1 && (
                  <Select<"parallel" | "series"> help="How several drivers (or pairs) are wired to the amplifier: parallel lowers the impedance, series raises it."
                    label="Wiring"
                    value={state.wiring}
                    options={[
                      { value: "parallel", text: `${state.isobaric ? "Pairs" : "Drivers"} in parallel` },
                      { value: "series", text: `${state.isobaric ? "Pairs" : "Drivers"} in series` },
                    ]}
                    onChange={(x) => set("wiring", x)}
                  />
                )}
              </div>
              {state.dvc.on && solved.missing.length === 0 && (
                <p className="hint">
                  As wired: Re {(solved.values.re! * dvcFactors(state).re).toFixed(2)} Ω, Qes{" "}
                  {(solved.values.qes! * dvcFactors(state).qes).toFixed(3)}. Wiring only changes the impedance (and how much the
                  cable resistance matters); the response at a given power stays the same.
                </p>
              )}
              <p className="hint">
                {state.isobaric
                  ? `Each pair is two drivers working as one (face to face or one behind the other): same Fs and Qts, half the Vas, so about half the box. ${state.drivers * 2} drivers in total. `
                  : "Multiple drivers share each box. "}
                Wiring changes the impedance the amplifier sees and the voltage each driver gets; power is what the amplifier
                delivers into the whole set.
              </p>
            </Card>

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
                onUse={(ts, coil) =>
                  setStep((s) => {
                    // Keep Vas / Sd the user had, unless the measurement provides them; drop values it supersedes.
                    const keep: typeof s.ts = {};
                    if (s.ts.vas_l !== undefined && ts.mms_g === undefined) keep.vas_l = s.ts.vas_l;
                    if (s.ts.mms_g !== undefined && s.ts.vas_l === undefined && ts.mms_g === undefined) keep.mms_g = s.ts.mms_g;
                    return {
                      ...s,
                      driverName: s.driverName.endsWith("(measured)") ? s.driverName : `${s.driverName} (measured)`,
                      ts: { ...keep, ...ts },
                      ...coil,
                      semi: undefined,
                      fdd: undefined,
                    };
                  })
                }
              />
              </div>
            )}
          </div>
        )}
        {panel === "boxes" && (
          <div className="tab-panel" role="tabpanel" id="panel-boxes" aria-labelledby="tab-boxes">
            <div className="size-all">
              <button className="secondary" onClick={sizeBoxes} disabled={solved.missing.length > 0}>
                Size all boxes for this driver
              </button>
              <span className="hint">Sealed Qtc 0.707; ported and PR a flat alignment (QB3, or Keele for higher Qts); bandpass the lowest flat band in its volume. Undo takes it back.</span>
            </div>
            {sizeReport && (
              <div className="size-report">
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
            {state.designs.map((d) => (
              <DesignCard
                key={d.id}
                design={d}
                color={colorOf(state, d.id)}
                vb_l={vbOf(state, d)}
                built_l={builtVbOf(state, d)}
                linked={state.volume.link === d.id}
                onSizeBandpass={d.kind === "bandpass" ? () => sizeOneBandpass(d) : undefined}
                lineFb={d.kind === "line" ? (designs.find((x) => x.design.id === d.id)?.result.summary.fb ?? null) : undefined}
                driverDisp_l={state.volume.driverDisp_l * state.drivers * (state.isobaric ? 2 : 1)}
                wall_mm={state.volume.wall_mm}
                canDelete={state.designs.length > 1}
                db={db}
                air={airOf(state)}
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
                }}
                onChange={updateDesign}
                onDuplicate={() => duplicateDesign(d)}
                onDelete={() => deleteDesign(d)}
                onImportDriver={(x) =>
                  setStep((s) => ({
                    ...s,
                    driverName: x.name,
                    driverBrand: "",
                    ts: x.ts,
                    le_mh: x.le_mh,
                    l2_mh: 0,
                    r2_ohm: 0,
                    semi: x.semi,
                    fdd: x.fdd,
                    ...(x.xmax_mm !== undefined ? { xmax_mm: x.xmax_mm } : {}),
                    ...(x.drivers ? { drivers: x.drivers.count, wiring: x.drivers.wiring } : {}),
                    dvc: { ...s.dvc, on: false },
                  }))
                }
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
            <AddDesign disabled={state.designs.length >= MAX_DESIGNS} onAdd={addDesign} />
          </div>
        )}
        {panel === "signal" && (
          <div className="tab-panel" role="tabpanel" id="panel-signal" aria-labelledby="tab-signal">
            <Card title="High-pass filter">
              <div className="fields">
                <Select<HighPassType | "off"> help="A high-pass (subsonic) filter in front of the amplifier. Butterworth is maximally flat; Linkwitz-Riley is the usual crossover shape (−6 dB at the corner)."
                  label="Filter"
                  value={hp.on ? hp.type : "off"}
                  options={[
                    { value: "off", text: "Off" },
                    { value: "butterworth", text: "Butterworth" },
                    { value: "linkwitz-riley", text: "Linkwitz-Riley" },
                  ]}
                  onChange={(type) =>
                    set(
                      "highPass",
                      type === "off"
                        ? { ...hp, on: false }
                        : { ...hp, on: true, type, order: type === "linkwitz-riley" && hp.order % 2 ? hp.order + 1 : hp.order },
                    )
                  }
                />
                {hp.on && (
                  <>
                    <Select<number> help="How steeply the filter cuts below its frequency: 12 dB/oct is gentle, 24 dB/oct protects a ported box much better."
                      label="Slope"
                      value={hp.order}
                      options={(hp.type === "butterworth" ? [1, 2, 3, 4] : [2, 4]).map((o) => ({
                        value: o,
                        text: `${o * 6} dB/oct`,
                      }))}
                      onChange={(order) => set("highPass", { ...hp, order })}
                    />
                    <Num help="Corner frequency of the high-pass (subsonic) filter. A few Hz below a ported box's tuning keeps the cone from flapping below it." label="Freq" unit="Hz" value={hp.freq} onChange={(freq) => set("highPass", { ...hp, freq })} />
                  </>
                )}
              </div>
              <p className="hint">
                {hp.on
                  ? `${hp.order * 6} dB/oct ${hp.type === "butterworth" ? "Butterworth" : "Linkwitz-Riley"} at ${hp.freq} Hz, on every design.`
                  : "A subsonic filter protects ported and PR boxes from over-excursion below tuning."}
              </p>
            </Card>

            <PassivePanel value={state.passive} re={state.ts.re ?? 6} le_mh={state.le_mh} onChange={(p) => set("passive", p)} />

            <EqPanel
              state={state}
              designs={designs}
              onChange={(eq) => set("eq", eq)}
              onClear={() => {
                setStep((s) => ({ ...s, eq: [] }));
                notify("EQ cleared.");
              }}
            />

            <RoomGainPanel value={state.roomGain} room={roomGainOf(state)} onChange={(r) => set("roomGain", r)} />

            <BafflePanel
              state={state}
              sd_cm2={finderCtx.driver?.sd_cm2}
              onChange={(b) => set("baffle", b)}
              onAddEq={(item) => {
                setStep((st) => ({ ...st, eq: [...st.eq, item] }));
                notify(`Added a +${"gain_db" in item ? item.gain_db : 0} dB low shelf at ${"freq" in item ? item.freq : ""} Hz (EQ, all designs).`);
              }}
            />
          </div>
        )}
        {panel === "build" && (
          <div className="tab-panel" role="tabpanel" id="panel-build" aria-labelledby="tab-build">
            <VolumePanel state={state} onChange={(v) => set("volume", v)} />
            <BuildSheet
              state={state}
              designs={designs}
              driverName={state.driverName}
              driverSd_cm2={finderCtx.driver?.sd_cm2}
              onChange={(v) => set("volume", v)}
            />
          </div>
        )}
        {panel === "settings" && (
          <div className="tab-panel" role="tabpanel" id="panel-settings" aria-labelledby="tab-settings">
            <Card title="Settings">
              <div className="fields">
                <Select<"metric" | "imperial"> help="Show lengths and volumes in metric (cm, L) or imperial (inches, ft³). Values are kept the same, only the display changes."
                  label="Units"
                  value={state.settings.units}
                  options={[
                    { value: "metric", text: "Metric (L, cm)" },
                    { value: "imperial", text: "Imperial (ft³, in)" },
                  ]}
                  onChange={(units) => set("settings", { ...state.settings, units })}
                />
                <Select<"standard" | "winisd" | "hornresp"> help="Air density and speed of sound. Standard is 20 °C; pick WinISD's or Hornresp's values to compare results like for like."
                  label="Air"
                  value={state.settings.air}
                  options={[
                    { value: "standard", text: "Standard (20 °C, ρ 1.204, c 343.2)" },
                    { value: "winisd", text: "WinISD defaults (ρ 1.201, c 343.7)" },
                    { value: "hornresp", text: "Hornresp defaults (ρ 1.205, c 344)" },
                  ]}
                  onChange={(air) => set("settings", { ...state.settings, air })}
                />
                <Num help="Resistance of the amplifier output plus the speaker cable. It adds to Re: a little less output and a slightly higher Q."
                  label="Amp + cable"
                  unit="Ω"
                  value={state.settings.rg}
                  min={0}
                  onChange={(rg) => set("settings", { ...state.settings, rg })}
                />
                <Select<"nominal" | "real"> help="What the driver's power rating (Pe) is held against on the Max SPL chart. V²/Re is WinISD's way. Real power counts what the driver actually takes, which is less wherever its impedance rises above Re (around resonance and up high), so it allows more voltage there, as Hornresp does."
                  label="Power rating vs"
                  value={state.settings.thermalLimit}
                  options={[
                    { value: "nominal", text: "V²/Re (like WinISD)" },
                    { value: "real", text: "Real power (like Hornresp)" },
                  ]}
                  onChange={(thermalLimit) => set("settings", { ...state.settings, thermalLimit })}
                />
                <Num help="The amplifier's maximum output voltage (RMS), as a limit on the Max SPL chart. 0 = no limit."
                  label="Amp max volts"
                  unit="V"
                  value={state.settings.ampVolts}
                  min={0}
                  onChange={(ampVolts) => set("settings", { ...state.settings, ampVolts: Math.max(0, ampVolts) })}
                />
                <Num help="The amplifier's maximum output current (RMS), as a limit on the Max SPL chart. 0 = no limit."
                  label="Amp max current"
                  unit="A"
                  value={state.settings.ampAmps}
                  min={0}
                  onChange={(ampAmps) => set("settings", { ...state.settings, ampAmps: Math.max(0, ampAmps) })}
                />
                <Select<"yes" | "no"> help="Whether the simulation includes the voice-coil inductance (Le, and L2/R2 when given). WinISD leaves it out by default."
                  label="Coil inductance"
                  value={state.settings.inductance ? "yes" : "no"}
                  options={[
                    {
                      value: "yes",
                      text: state.semi ? "Semi-inductance (most realistic)" : state.l2_mh > 0 && state.r2_ohm > 0 ? "Le + L2/R2 (most realistic)" : "Le (more realistic above ~100 Hz)",
                    },
                    { value: "no", text: "Off (WinISD's default)" },
                  ]}
                  onChange={(x) => set("settings", { ...state.settings, inductance: x === "yes" })}
                />
              </div>

              <h3 className="set-head">Box losses</h3>
              <div className="fields">
                <Num help="Box leakage loss as a Q at the tuning frequency: lower means a leakier box. 10 is WinISD's default (a typical well-built box)."
                  label="Leak Ql"
                  value={state.settings.losses.ql}
                  min={1}
                  onChange={(ql) => set("settings", { ...state.settings, losses: { ...state.settings.losses, ql } })}
                />
                <Select<"radiates" | "absorbed"> help="Where the air that leaks out goes. Heard (like WinISD): it radiates as sound, as through a real gap. Lost (like Hornresp): a pure loss. It matters mostly for bandpass boxes away from their passband, where the leak's sound can be as loud as the port's."
                  label="Leaked air"
                  value={state.settings.leakage}
                  options={[
                    { value: "radiates", text: "Heard (like WinISD)" },
                    { value: "absorbed", text: "Lost (like Hornresp)" },
                  ]}
                  onChange={(leakage) => set("settings", { ...state.settings, leakage })}
                />
                <Select<"mass" | "piston"> help="The air in front of the cone. Fixed mass (like WinISD): part of Mms at every frequency. Piston (like Hornresp): a baffled piston's radiation load, the same in the deep bass but lighter and lossier higher up, and with two or more drivers side by side (or identical boxes side by side: double the volume and the drivers) they push one bigger piston together, which adds a little air to each. Sealed, ported and passive radiator boxes."
                  label="Cone air load"
                  value={state.settings.coneLoad}
                  options={[
                    { value: "mass", text: "Fixed mass (like WinISD)" },
                    { value: "piston", text: "Piston, like Hornresp" },
                  ]}
                  onChange={(coneLoad) => set("settings", { ...state.settings, coneLoad })}
                />
                <Num help="Absorption loss (stuffing, wall flex) as a Q: lower means more loss. 100 is WinISD's default (little stuffing). A design with its own Stuffing setting uses that setting's Qa instead."
                  label="Absorb Qa"
                  value={state.settings.losses.qa}
                  min={1}
                  onChange={(qa) => set("settings", { ...state.settings, losses: { ...state.settings.losses, qa } })}
                />
                <Num help="Port friction loss as a Q: lower means a lossier port. 100 is WinISD's default."
                  label="Port Qp"
                  value={state.settings.losses.qp}
                  min={1}
                  onChange={(qp) => set("settings", { ...state.settings, losses: { ...state.settings.losses, qp } })}
                />
              </div>
              <details className="more">
                <summary>About box losses</summary>
                <p className="hint">
                  Box losses are Q values at the tuning frequency: lower means more loss. 10 / 100 / 100 matches WinISD&rsquo;s
                  defaults. A bandpass can also set its own losses for each chamber, and a sealed, ported or passive radiator design with Stuffing set uses that stuffing&rsquo;s Qa. For like-for-like checks against WinISD,
                  choose its air values, its amplifier resistance (Amp + cable) and leave out Le, or simply import the WinISD
                  project (.wpr).
                </p>
              </details>

              <h3 className="set-head">Voice coil</h3>
              <div className="fields">
                <Num
                  label="Voice coil"
                  unit="°C"
                  value={state.settings.coilTemp_C}
                  min={20}
                  title="Voice-coil temperature: 20 °C = the datasheet's cold values (like WinISD). A hot coil has a higher Re: less output, higher Q."
                  onChange={(t) => set("settings", { ...state.settings, coilTemp_C: Math.min(250, Math.max(20, t)) })}
                />
              </div>
              {state.settings.coilTemp_C > 20 && (
                <p className="hint">
                  At {state.settings.coilTemp_C} °C the coil&rsquo;s resistance is {Math.round((coilHeatFactor(state.settings.coilTemp_C) - 1) * 100)}% higher
                  {solved.values.re !== undefined ? ` (Re ${(solved.values.re * dvcFactors(state).re).toFixed(2)} → ${(solved.values.re * dvcFactors(state).re * coilHeatFactor(state.settings.coilTemp_C)).toFixed(2)} Ω)` : ""}, so the
                  same amplifier voltage gives about {(20 * Math.log10(coilHeatFactor(state.settings.coilTemp_C))).toFixed(1)}&nbsp;dB less above the bass,
                  and Qes (so the box&rsquo;s Q) rises by the same ratio, propping up the response near resonance.
                </p>
              )}
              <details className="more">
                <summary>About a hot voice coil</summary>
                <p className="hint">
                  20 °C uses the datasheet&rsquo;s cold values. Coils heat with sustained power, only a little at moderate levels
                  but to 150&nbsp;°C or more near their rated power. Copper and aluminium both rise about 0.4&nbsp;% per °C. This is
                  power compression: the dB SPL view shows the lost output, the Relative view the change in shape (and F3).
                </p>
              </details>

              <h3 className="set-head">Ports</h3>
              <div className="fields">
                <Select<"lumped" | "pipe"> help="Air mass (like WinISD) treats a port as a slug of air. Pipe (like Hornresp) also shows the port's own pipe resonances higher up (vented and bandpass boxes)."
                  label="Ports"
                  value={state.settings.portModel}
                  options={[
                    { value: "lumped", text: "Air mass (like WinISD)" },
                    { value: "pipe", text: "Pipe, like Hornresp" },
                  ]}
                  onChange={(portModel) => set("settings", { ...state.settings, portModel })}
                />
                <Select<"off" | "on"> help="Port compression: at high air speed a port loses output to turbulence. On estimates that loss at the current power (approximate)."
                  label="Port compression"
                  value={state.settings.portCompression ? "on" : "off"}
                  options={[
                    { value: "off", text: "Off (like WinISD)" },
                    { value: "on", text: "On (approximate, at this power)" },
                  ]}
                  onChange={(x) => set("settings", { ...state.settings, portCompression: x === "on" })}
                />
                <Select<"peak" | "rms"> help="Port air speed shown as the peak value or as RMS (peak ÷ 1.41). The chuffing line moves with it."
                  label="Port speed"
                  value={state.settings.velocity}
                  options={[
                    { value: "peak", text: "Peak" },
                    { value: "rms", text: "RMS" },
                  ]}
                  onChange={(velocity) => set("settings", { ...state.settings, velocity })}
                />
                <Num
                  help="Port air speed above this counts as chuffing (the red line on the Port speed chart, the ⚠ in the summary, and the design assistant's checks). 17 m/s is the usual guide for a quiet hi-fi port; car SPL builds often accept 25–30."
                  label="Chuffing line"
                  unit="m/s"
                  value={portLimitOf(state)}
                  min={5}
                  onChange={(v) => set("settings", { ...state.settings, portLimit_ms: v > 0 ? v : PORT_LIMIT })}
                />
              </div>
              <details className="more">
                <summary>About ports as pipes and port speed</summary>
                <p className="hint">
                  A port is also a pipe open at both ends, resonating at about c&nbsp;/&nbsp;2L (a 40&nbsp;cm port near 380&nbsp;Hz) and
                  letting midrange out as a narrow peak. &ldquo;Pipe&rdquo; draws those resonances (charts then run to 1&nbsp;kHz); in the
                  bass it matches the air-mass model within a few tenths of a dB. Vented boxes only; the box&rsquo;s own standing
                  waves, which drive the port hardest when they coincide, aren&rsquo;t simulated. The chuffing line (17&nbsp;m/s by default) applies to whichever port-speed convention you pick.
                  17&nbsp;m/s peak keeps a hi-fi port quiet; flared ports tolerate more, and car SPL builds often accept 25&ndash;30&nbsp;m/s
                  for a little port noise at full power.
                </p>
              </details>

              <h3 className="set-head">Lines and horns</h3>
              <div className="fields">
                <Select<"on-axis" | "power"> help="How SPL is worked out for lines and horns: in front of the box, or from the power each opening radiates as Hornresp does."
                  label="Line/horn SPL"
                  value={state.settings.lineSpl}
                  options={[
                    { value: "on-axis", text: "In front of the box" },
                    { value: "power", text: "From radiated power (like Hornresp)" },
                  ]}
                  onChange={(lineSpl) => set("settings", { ...state.settings, lineSpl })}
                />
              </div>
              <details className="more">
                <summary>About line and horn SPL</summary>
                <p className="hint">
                  Hornresp works SPL out from the power each opening radiates. That matches the in-front-of-the-box SPL in the
                  bass and reads lower once a mouth is large next to the wavelength (about 1.5 dB at 500 Hz for an 850 cm²
                  mouth). For like-for-like checks against Hornresp, pick its air and &ldquo;From radiated power&rdquo;, and set the
                  drive to 2.83 V.
                </p>
              </details>
            </Card>
          </div>
        )}
      </aside>

      <main className="charts">
        {/* The drive for every chart, right above them: sticky, so it stays in reach while scrolling. */}
        <div
          className="power drive-bar"
          data-help-title={state.drive === "volts" ? "Voltage" : "Power"}
          data-help="The drive for every chart: amplifier power in watts (turned into volts with Re), or a voltage. Excursion, port speed and the limits all follow it."
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
        </div>
        {welcome.linkNote && <LinkNote onDismiss={welcome.dismissLinkNote} onTips={welcome.showTips} />}
        {welcome.tips && <GettingStarted onDismiss={welcome.dismissTips} onAssistant={launchAssistant} />}
        <Summary designs={designs} state={state} missing={solved.missing.length > 0} narrow={narrow} onJump={jumpTo} />

        {designs.length > 0 && (
          <ChartEmphasis.Provider value={emphasis}>
          <CrosshairProvider>
            <LogChart
              forum
              chartId="response"
              best="high"
              handles={chartHandles}
              onSelect={setPicked}
              selected={picked}
              below={
                editing ? (
                  <div className="edit-bar">
                    <span>
                      {chartHandles.length > 0
                        ? `Drag ◆ to retune a ported or PR box, ● to move an EQ point${narrow ? " (tap it for Q and Remove)" : " (click it for Q and Remove, or scroll on it for Q)"}.`
                        : "Add a ported or passive radiator box, or an EQ point, to drag it here."}
                    </span>
                    <span className="edit-actions">
                      <button type="button" className="secondary" onClick={addEqPoint}>
                        + EQ point
                      </button>
                      <button type="button" className="secondary" onClick={cancelEdit} disabled={!editChanged} title="Put the boxes and EQ back as they were when you opened the editor">
                        Cancel
                      </button>
                      <button type="button" onClick={closeEditor}>
                        Done
                      </button>
                    </span>
                    {pickedEq && draggableEq(pickedEq) && (
                      <div className="edit-point" role="group" aria-label="EQ point">
                        <b>
                          EQ {state.eq.filter(draggableEq).indexOf(pickedEq) + 1}
                        </b>
                        <span className="muted">
                          {pickedEq.freq} Hz · {pickedEq.gain_db > 0 ? "+" : ""}
                          {pickedEq.gain_db} dB
                        </span>
                        <span className="muted">Q</span>
                        <button type="button" className="icon" aria-label="Wider (lower Q)" onClick={() => setState((s) => eqQ(s, pickedEq.id, false))}>
                          −
                        </button>
                        <span className="q">{pickedEq.q}</span>
                        <button type="button" className="icon" aria-label="Narrower (higher Q)" onClick={() => setState((s) => eqQ(s, pickedEq.id, true))}>
                          +
                        </button>
                        <button type="button" className="secondary remove" aria-label="Remove this EQ point" title="Remove this EQ point (Delete)" onClick={() => removeEq(pickedEq.id)}>
                          ✕<span className="wide-only"> Remove</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : undefined
              }
              shortTitle={`${splMode === "relative" ? "Response" : "SPL"} · ${driveLabel(state)}${hp.on ? " · high-pass" : ""}`}
              title={`${splMode === "relative" ? "Relative response" : "SPL"} at ${driveLabel(state)}${coilLabel(state)}, 1 m, ${state.roomGain.mode === "car" ? "in the car (cabin gain added)" : state.roomGain.mode === "room" ? "in the room (room gain added)" : state.roomGain.mode === "curve" ? "with your room curve added" : state.baffle.on ? "free-standing (baffle step)" : "half space"}${hp.on ? `, with ${hp.order * 6} dB/oct high-pass at ${hp.freq} Hz` : ""}`}
              unit="dB"
              freq={freq}
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
                  className={`chip${editing ? " on" : ""}`}
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
                  ✎ Edit
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
              {...(splMode === "relative"
                ? {
                    series: designs.flatMap((d) => {
                      const ref = relRefOf(d.result);
                      return [
                        {
                          label: d.label,
                          color: d.color,
                          dash: d.dash,
                          y: d.result.spl.map((v) => v - ref),
                          notes: Array.from(d.result.spl, (v) => `${v.toFixed(1)} dB SPL`),
                        },
                        ...partsOf(d, (y) => y.map((v) => v - ref)),
                      ];
                    }).concat(measuredSeries(state.measured, "spl", freq, mainDesigns, true)),
                    limits: [
                      { value: -3, label: "−3 dB", color: "var(--muted)" },
                      { value: -6, label: "−6 dB", color: "var(--muted)" },
                    ],
                    limitStyle: "guide" as const,
                    yStep: 6,
                    yMin: -30,
                    // F3 dots for the main driver only; the comparison's F3 is in the summary.
                    points: mainDesigns.flatMap((d) => {
                      const ref = relRefOf(d.result);
                      const rel = d.result.spl.map((v) => v - ref);
                      // F3 is the box's own, as in the summary: without the baffle step or room/cabin
                      // gain (not box properties), drawn on the curve as shown.
                      const step = baffleDbFor(state, d.result.freq, finderCtx.driver?.sd_cm2);
                      const room = roomGainOf(state);
                      const lift = room ? Array.from(d.result.freq, (f: number) => roomGainDb(f, room)) : null;
                      const own = step || lift ? rel.map((v, i) => v - (step ? step[i]! : 0) - (lift ? lift[i]! : 0)) : rel;
                      const pts =
                        d.design.kind === "line"
                          ? lowEdge(d.result.freq, own)
                          : minus3Points(d.result.freq, own, d.design.kind === "bandpass");
                      return pts.map((f) => ({
                        f,
                        y: step || lift ? valueAt(d.result.freq, rel, f) : -3,
                        color: d.color,
                        // With room gain the dot sits on the curve above −3 dB: say whose F3 it is.
                        label: `${lift ? "Box F3" : "F3"} ${f < 100 ? f.toFixed(1) : f.toFixed(0)}`,
                        of: d.label,
                      }));
                    }),
                  }
                : {
                    series: designs
                      .flatMap((d) => [{ label: d.label, color: d.color, dash: d.dash, y: d.result.spl }, ...partsOf(d, (y) => y)])
                      .concat(measuredSeries(state.measured, "spl", freq, mainDesigns)),
                  })}
            />
            {narrow && (
              <TabRow<ChartId>
                tabs={chartTabs}
                selected={chartTab}
                onSelect={chooseChart}
                ariaLabel="Charts"
                className="chart-tabs"
              />
            )}
            <LogChart
              forum
              chartId="excursion"
              hidden={narrow && chartTab !== "excursion"}
              best="low"
              shortTitle="Cone excursion"
              title="Cone excursion (peak, one way)"
              unit="mm"
              freq={freq}
              series={designs.map((d) => ({
                label: d.label,
                color: d.color,
                dash: d.dash,
                y: d.result.excursionMm,
                over: d.compare && state.compare ? state.compare.xmax_mm : state.xmax_mm,
                ...(() => {
                  const split = deepSplitOf(d.result, state.highPass.on);
                  const xmax = d.compare && state.compare ? state.compare.xmax_mm : state.xmax_mm;
                  return split ? { deepBelow: split, deepOver: DEEP_ALLOW * xmax, deepFloor: DEEP_FLOOR_HZ } : {};
                })(),
              }))}
              zones={(() => {
                // Deep bass of the tuned boxes (no high-pass filter): graded up to 2 × Xmax, not failed.
                const splits = designs.filter((d) => !d.compare).map((d) => deepSplitOf(d.result, state.highPass.on)).filter((v): v is number => v !== null);
                return splits.length
                  ? [{ below: Math.max(...splits), value: DEEP_ALLOW * state.xmax_mm, label: `Deep bass: ${DEEP_ALLOW} × Xmax`, color: "#fbbf24" }]
                  : [];
              })()}
              limits={[
                {
                  value: state.xmax_mm,
                  label:
                    state.compare && fadedLabels.length > 0 && state.compare.xmax_mm !== state.xmax_mm
                      ? `Xmax ${state.xmax_mm} · vs ${state.compare.xmax_mm} mm`
                      : `Xmax ${state.xmax_mm} mm`,
                  color: LIMIT_RED,
                },
                ...(state.compare && fadedLabels.length > 0 && state.compare.xmax_mm !== state.xmax_mm
                  ? [{ value: state.compare.xmax_mm, label: "", color: LIMIT_RED }]
                  : []),
              ]}
              yMin={0}
            />
            {!narrow && (
              <TabRow<ChartId>
                tabs={chartTabs}
                selected={chartTab}
                onSelect={chooseChart}
                ariaLabel="More charts"
                className="chart-tabs"
              />
            )}
            {hasPr && (
              <LogChart
                forum
                chartId="pr"
                hidden={chartTab !== "pr"}
                best="low"
              shortTitle="PR excursion"
              title="Passive radiator excursion (peak, one way)"
                unit="mm"
                freq={freq}
                series={prSeries}
                limits={prLimits}
                yMin={0}
              />
            )}
            {hasPort && (
              <LogChart
                forum
                chartId="port"
                hidden={chartTab !== "port"}
                best="low"
              shortTitle="Port speed"
              title={`Port air velocity (${state.settings.velocity === "rms" ? "RMS" : "peak"})`}
                unit="m/s"
                freq={freq}
                series={[
                  ...designs.map((d) => ({
                    label: d.design.kind === "bandpass" ? `${d.label} (front port)` : d.label,
                    color: d.color,
                    dash: d.dash,
                    y: d.result.portVelocity,
                    over: portLimitOf(state),
                  })),
                  ...designs.map((d) => ({
                    label: `${d.label} (rear port)`,
                    color: d.color,
                    dash: "5 3",
                    y: d.result.rearPortVelocity,
                    over: portLimitOf(state),
                  })),
                ].filter((s) => s.y)}
                limits={[{ value: portLimitOf(state), label: `Chuffing risk ${portLimitOf(state)} m/s`, color: LIMIT_RED }]}
                yMin={0}
              />
            )}
            {hasBoxPressure && (
              <LogChart
                forum
                chartId="pressure"
                hidden={chartTab !== "pressure"}
                best="low"
                shortTitle="Box pressure"
                title="Sound pressure inside the box (peak): the load on the cone and the walls"
                unit="Pa"
                freq={freq}
                series={[
                  ...designs.map((d) => ({
                    label: d.design.kind === "bandpass" ? `${d.label} (rear chamber)` : d.label,
                    color: d.color,
                    dash: d.dash,
                    y: d.result.boxPressurePa,
                  })),
                  ...designs.map((d) => ({
                    label: `${d.label} (front chamber)`,
                    color: d.color,
                    dash: "5 3",
                    y: d.result.frontChamberPressurePa,
                  })),
                ].filter((s) => s.y)}
                yMin={0}
              />
            )}
            <LogChart
              chartId="maxspl"
              hidden={chartTab !== "maxspl"}
              best={maxMode === "spl" ? "high" : "low"}
              shortTitle={maxMode === "spl" ? "Max SPL" : maxMode === "volts" ? "Amp volts for max SPL" : "Amp current for max SPL"}
              title={
                maxMode === "spl"
                  ? "Maximum SPL (first limit reached)"
                  : maxMode === "volts"
                    ? "Amplifier voltage needed for maximum SPL (RMS, at the amplifier's terminals)"
                    : "Amplifier current needed for maximum SPL (RMS)"
              }
              unit={maxMode === "spl" ? "dB" : maxMode === "volts" ? "V" : "A"}
              freq={freq}
              yMin={maxMode === "spl" ? undefined : 0}
              actions={
                <div className="unit-switch" role="group" aria-label="Show">
                  <button aria-pressed={maxMode === "spl"} onClick={() => chooseMaxMode("spl")} title="The loudest each design can play, and what limits it">
                    SPL
                  </button>
                  <button
                    aria-pressed={maxMode === "volts"}
                    onClick={() => chooseMaxMode("volts")}
                    title="The amplifier's output voltage (RMS) needed to reach that maximum SPL, after the high-pass filter and EQ"
                  >
                    Volts
                  </button>
                  <button
                    aria-pressed={maxMode === "amps"}
                    onClick={() => chooseMaxMode("amps")}
                    title="The current (RMS) the amplifier must deliver into the speaker's impedance to reach that maximum SPL"
                  >
                    Amps
                  </button>
                </div>
              }
              series={designs.map((d) => {
                const a = d.result.ampAtMax;
                const limit = (i: number) => LIMIT_KINDS[d.result.limitedBy[i]!]?.short ?? "";
                const n1 = (v: number) => (Number.isFinite(v) ? (v < 10 ? v.toFixed(1) : v.toFixed(0)) : "–");
                return {
                  label: d.label,
                  color: d.color,
                  dash: d.dash,
                  y: maxMode === "spl" ? d.result.maxSpl : maxMode === "volts" ? a.volts : a.amps,
                  notes: Array.from(d.result.maxSpl, (_, i) =>
                    maxMode === "spl"
                      ? `${limit(i)} · amp ${n1(a.volts[i]!)} V, ${n1(a.amps[i]!)} A`
                      : maxMode === "volts"
                        ? `${n1(a.amps[i]!)} A, ${n1(a.watts[i]!)} W · ${limit(i)}`
                        : `${n1(a.volts[i]!)} V, ${n1(a.watts[i]!)} W · ${limit(i)}`,
                  ),
                };
              })}
              ribbons={mainDesigns.map((d) => ({ label: d.label, color: d.color, kinds: d.result.limitedBy }))}
              ribbonKinds={LIMIT_KINDS}
            />
            <LogChart
              chartId="impedance"
              hidden={chartTab !== "impedance"}
              title="Impedance"
              unit="Ω"
              freq={freq}
              series={[
                ...series((r) => r.impedanceOhm),
                ...measuredSeries(state.measured, "impedance", freq, mainDesigns),
                ...(measurement
                  ? [
                      { label: "Measured (free air)", color: "#6b7389", dash: "6 4", y: resampleMagnitude(measurement.data, freq) },
                      {
                        label: "Fit (free air)",
                        color: "#8e96aa",
                        dash: "2 3",
                        y: freq.map((f) => impedanceMagnitude(measurement.fit, f)),
                      },
                    ]
                  : []),
              ]}
              yMin={0}
            />
            {zaDesigns.length > 0 && (
              <LogChart
                chartId="za"
              hidden={chartTab !== "za"}
                title="Line load Za"
                unit="× ρc/S"
                freq={freq}
                series={zaSeries}
                limits={[{ value: 1, label: "1 = the duct's own impedance", color: "#8e96aa" }]}
                limitStyle="guide"
                digits={2}
                {...zaRange}
              />
            )}
            {zaDesigns.length > 0 && chartTab === "za" && (
              <p className="hint">
                Solid: resistance, dashed: reactance. The air load the line puts on the cone, as Hornresp&rsquo;s Za chart shows it: taken at the driver (at the
                horn&rsquo;s throat for a front-loaded horn, without its chambers), divided by ρc/S there. Peaks are the
                line&rsquo;s resonances; resistance near 1 over a wide band means the horn is loading the cone well, and
                stuffing shows as the ripples shrinking towards 1.
              </p>
            )}
            {chartTab === "transient" && (
              <>
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
                />
                <p className="hint">
                  What each box puts out for a click (impulse) and for the voltage switched on and held (step), at 1 m, with
                  EQ and the high-pass filter, as Hornresp shows it (the response up to 20&nbsp;kHz, from radiated power).
                  The box alone: no baffle step or room gain. A positive start means the cone moves out. A sealed box&rsquo;s
                  step falls back quickly; a ported box&rsquo;s or a line&rsquo;s rings on as the port or line keeps sounding.
                </p>
              </>
            )}
            <LogChart
              chartId="delay"
              hidden={chartTab !== "delay"}
              best="zero"
              title="Group delay"
              unit="ms"
              freq={freq}
              series={series((r) => r.groupDelayMs)}
              markers={notchMarkers}
              yMin={-20}
              yMax={100}
            />
          </CrosshairProvider>
          </ChartEmphasis.Provider>
        )}
        {mainDesigns.length > 0 && <MeasuredCard measured={state.measured} designs={mainDesigns} onChange={(measured) => setStep((s) => ({ ...s, measured }))} />}

        <footer className="muted">
          <p>
            Small-signal lumped model: no Bl/Cms non-linearity (port compression and a hot voice coil are in Settings). Box losses Ql{" "}
            {state.settings.losses.ql}, Qa {state.settings.losses.qa}, Qp {state.settings.losses.qp}. Free for non-commercial use.
          </p>
          <ul className="footer-links">
            <li><a href="/drivers/">Drivers</a></li>
            <li><a href="/guides/">Guides</a></li>
            <li><a href="/validation/">Validation</a></li>
            <li><a href={`${REPO}/blob/main/LICENSE`}>Licence</a></li>
            <li><a href={`${REPO}/blob/main/docs/data-sources.md`}>Driver data: credits, corrections</a></li>
            <li><a href={REPO}>GitHub</a></li>
            <li>
              <a href={reportUrl(shareUrl())} target="_blank" rel="noopener">
                Report a problem
              </a>
            </li>
            {!welcome.tips && (
              <li>
                <button type="button" className="link" onClick={welcome.showTips}>
                  Getting started tips
                </button>
              </li>
            )}
          </ul>
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
            const b = document.querySelector<HTMLButtonElement>("#panel-driver .dp-row .browse:not(:disabled)");
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
          setDriverSource({ name: d.name, ...d.source, ts: d.ts, id: rs[0]?.driverId });
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
      <nav className="phone-nav" aria-label="Screens">
        <PanelTabs
          value={panel}
          onChange={(p) => showOnPhone("panel", p)}
          badges={tabBadges}
          lead={{ id: "charts", label: "Charts", selected: phoneView === "charts", onSelect: () => showOnPhone("charts") }}
          className="phone-tabs"
          idPrefix="ptab-"
        />
      </nav>
      <HelpDock />
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
  return {
    portVelocity: peak,
    rearPortVelocity: rearPeak,
    internalMax_cm,
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
function StatusStrip({ designs, state, onJump }: { designs: Design[]; state: AppState; onJump: (kind: LimitKind | null, ids: string[]) => void }) {
  const mains = designs.filter((d) => !d.compare);
  if (mains.length === 0) return null;
  return (
    <div className="status-strip" role="group" aria-label="Boxes at a glance">
      {mains.map((d) => {
        const l = limitsOf(d.result, state.xmax_mm, state.highPass.on, portLimitOf(state));
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
}: {
  designs: Design[];
  state: AppState;
  missing: boolean;
  narrow?: boolean;
  onJump?: (kind: LimitKind | null, ids: string[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [folded, setFolded] = useState(true);
  const fmt = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "–" : v.toFixed(digits));
  if (missing) return <p className="warn summary">Enter the driver's parameters to see the simulation.</p>;
  if (designs.length === 0) return <p className="muted summary">Turn on at least one enclosure.</p>;
  // Each box, then the comparison driver in that box.
  designs = designs.filter((d) => !d.compare).flatMap((d) => [d, ...designs.filter((c) => c.compare && c.design.id === d.design.id)]);
  // Without a high-pass filter, a tuned box's deep bass is graded, not failed (limitsOf).
  const fMin = state.highPass.on ? 10 : 15;
  if (narrow) {
    // Phones: folded to one line by default, so the charts start near the top of the screen.
    // Open: name, volume, F3 and what (if anything) is over its limit; the rest one tap away.
    const mains = designs.filter((d) => !d.compare);
    const lims = mains.map((d) => ({ id: d.design.id, l: limitsOf(d.result, state.xmax_mm, state.highPass.on, portLimitOf(state)) }));
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
            >
              ⚠ {overCount} over a limit ›
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
              const lim = limitsOf(r, xmax, state.highPass.on, portLimitOf(state));
              const { x, xpr, vp, deep } = lim;
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
                  <td>{volCell(vb_l, acting_l, state.settings.units)}</td>
                  <td>
                    {fmt(r.summary.f3)}
                    {r.summary.f3High !== undefined && `–${fmt(r.summary.f3High)}`} Hz
                    {f3Room !== undefined && <RoomF3 f3={f3Room} car={state.roomGain.mode === "car"} />}
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
                      {` · cone ${fmt(x)} mm`}
                      {xpr ? ` · PR ${fmt(xpr.mm)} mm` : ""}
                      {vp !== null ? ` · port ${fmt(vp)} m/s` : ""}
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
          Tap a row for its details. Peaks above {fMin} Hz{state.highPass.on ? "" : "; a ported or PR box's deep bass (below 0.7 × its tuning) is graded, not failed"}.
        </p>
        </>
        )}
      </div>
    );
  }
  return (
    <div className="summary">
      <div className="summary-scroll">
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
          {designs.map(({ design: d, label, compare, color, vb_l, acting_l, f3Room, result: r }) => {
            const xmax = compare && state.compare ? state.compare.xmax_mm : state.xmax_mm;
            const lim = limitsOf(r, xmax, state.highPass.on, portLimitOf(state));
            const { x, xpr, vp, deep } = lim;
            const xOver = lim.over.includes("xmax");
            return (
              <tr key={compare ? `${d.id}-vs` : d.id} className={compare ? "summary-vs" : undefined}>
                <th>
                  <span className={compare ? "swatch swatch-vs" : "swatch"} style={compare ? { borderColor: color } : { background: color }} aria-hidden="true" />
                  <span title={label}>{shortName(label)}</span>
                </th>
                <td>
                  {volCell(vb_l, acting_l, state.settings.units)}
                  {d.kind === "bandpass" && ` + ${fmtQ(d.frontVb_l, "vol", state.settings.units)}`}
                </td>
                <td>
                  {fmt(r.summary.f3)}
                  {r.summary.f3High !== undefined && `–${fmt(r.summary.f3High)}`} Hz
                  {f3Room !== undefined && <RoomF3 f3={f3Room} car={state.roomGain.mode === "car"} />}
                </td>
                <td>
                  {d.kind === "bandpass"
                    ? `${fmt(r.summary.fbRear ?? r.summary.fc)} / ${fmt(r.summary.fb)}`
                    : fmt(r.summary.fb ?? r.summary.fc)}{" "}
                  Hz
                </td>
                <td>{fmt(r.summary.qtc, 2)}</td>
                <td className={xOver ? "over" : ""}>
                  <OverValue over={xOver} text={`${fmt(x)} mm`} onJump={() => onJump?.("xmax", [d.id])} />
                  {deep && (
                    <span className="deep-note" title={deepText(deep, state)}>
                      {" "}
                      · {fmt(deep.x_mm)} &lt;{deep.below_hz.toFixed(0)} Hz
                    </span>
                  )}
                </td>
                <td
                  className={xpr?.over ? "over" : ""}
                  title={(r.prGroups?.length ?? 0) > 1 ? "The PR group closest to (or furthest past) its own Xmax" : undefined}
                >
                  {xpr === null ? "–" : <OverValue over={xpr.over} text={`${fmt(xpr.mm)} mm`} onJump={() => onJump?.("pr", [d.id])} />}
                </td>
                <td className={vp !== null && vp > portLimitOf(state) ? "over" : ""}>
                  {vp === null ? "–" : <OverValue over={vp > portLimitOf(state)} text={`${fmt(vp)} m/s`} onJump={() => onJump?.("port", [d.id])} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <p className="hint swipe-hint">Swipe the table sideways for peak excursion and port speed.</p>
      <p className="hint">
        {state.highPass.on ? (
          <>Peaks are taken above {fMin} Hz. </>
        ) : (
          <>
            Peaks are taken above {fMin} Hz, except a ported or PR box's deep bass: below 0.7 × its tuning (down to 20 Hz) the cone may reach 2 × Xmax, shown in
            amber, before it counts as over, since music has little energy there. Turn on the high-pass filter to model a subsonic filter.{" "}
          </>
        )}
        Red means over the limit: click it to see the chart.
      </p>
    </div>
  );
}

type WprChamberLosses = { ql: number; qa: number; qp: number };
const lossesOf = (c: WprChamberLosses) => ({ ql: c.ql, qa: c.qa, qp: c.qp });
/** Does a WinISD bandpass need per-chamber losses (chambers differ, or a non-default leak between them)? */
function bandpassOwnLosses(b: { front: WprChamberLosses; rear: WprChamberLosses; qicl: number }): boolean {
  return b.front.ql !== b.rear.ql || b.front.qa !== b.rear.qa || b.front.qp !== b.rear.qp || b.qicl !== 100;
}

/** The F3 with room or cabin gain, under the box's own F3 in the summary. */
function RoomF3({ f3, car }: { f3: number | null; car: boolean }) {
  const where = car ? "in the car" : "in the room";
  return (
    <span className="room-f3" title={`F3 with the ${car ? "cabin" : "room"} gain (Signal tab). The F3 before it is the box's own, as WinISD gives it, and so are the chart's F3 dots.`}>
      {f3 === null ? ` · flat to 10 Hz ${where}` : ` · ${f3 < 100 ? f3.toFixed(1) : f3.toFixed(0)} Hz ${where}`}
    </span>
  );
}

/** Value of a curve at frequency f (log-frequency interpolation). */
function valueAt(freq: Float64Array, ys: ArrayLike<number>, f: number): number {
  let i = 1;
  while (i < freq.length - 1 && freq[i]! < f) i++;
  const t = Math.log(f / freq[i - 1]!) / Math.log(freq[i]! / freq[i - 1]!);
  return ys[i - 1]! + t * (ys[i]! - ys[i - 1]!);
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
