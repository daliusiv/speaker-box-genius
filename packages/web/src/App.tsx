import { useEffect, useMemo, useRef, useState } from "react";
import {
  coilHeatFactor,
  impedanceMagnitude,
  parseWdr,
  parseWpr,
  resampleMagnitude,
  writeWdr,
  type HighPassType,
  type SimulationResult,
} from "@sbg/engine";
import { ChartEmphasis, CrosshairProvider, LogChart, shortName, type Series } from "./LogChart.tsx";
import { useUndoable } from "./useUndoable.ts";
import { sizeAllForDriver } from "./presets.ts";
import type { FinderContext } from "./PrFinder.tsx";
import { initialPanel, PanelTabs, rememberPanel, TabRow, type PanelId } from "./PanelTabs.tsx";
import {
  DEFAULT_STATE,
  decodeStateAny,
  encodeState,
  encodeStateShort,
  addDriver,
  driverList,
  MAX_DESIGNS,
  MAX_DRIVERS,
  newDesign,
  newId,
  removeDriver,
  routeDriverEdit,
  viewFor,
  viewOfDesign,
  type AppState,
  type DesignState,
} from "./state.ts";
import { loadDriver, loadIndex, type DbIndex } from "./library.ts";
import { Card, Num, REPO, Select } from "./components.tsx";
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
  prPeak,
  prXmaxes,
  dimensionsFor,
  coilLabel, driveLabel,
  driverInputOf,
  simOptionsOf,
  roomGainOf,
  runDesigns,
  solveDriver,
  solvedDrivers,
  vbOf,
  type Design,
} from "./sim.ts";
import { RoomGainPanel } from "./RoomGain.tsx";
import { BafflePanel } from "./BafflePanel.tsx";
import { AddDesign, DesignCard } from "./Designs.tsx";
import { MeasuredCard, measuredSeries } from "./Measured.tsx";
import { HelpDock } from "./HelpDock.tsx";
import { reportUrl, ShareMenu } from "./Share.tsx";
import { EqPanel } from "./Eq.tsx";
import { MeasurePanel, type Measurement } from "./Measure.tsx";
import { fmtQ, UnitsContext } from "./units.ts";
import { ProjectsMenu } from "./Projects.tsx";
import { submitDriverUrl } from "./submit.ts";

const LIMIT_RED = "#dc2626";

/** What sets the maximum SPL at each frequency, as shown in the strip under the Max SPL chart. */
const LIMIT_KINDS: Record<string, { label: string; short: string; color: string }> = {
  xmax: { label: "Cone Xmax", short: "cone Xmax", color: "#dc2626" },
  "pr-xmax": { label: "PR Xmax", short: "PR Xmax", color: "#9333ea" },
  port: { label: "Port speed", short: "port speed", color: "#d97706" },
  thermal: { label: "Power (Pe)", short: "power handling", color: "#78716c" },
};

type ChartId = "pr" | "port" | "maxspl" | "impedance" | "za" | "delay";

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
  /** Credit line for the driver loaded from the database; shown while its name is unchanged. */
  const [driverSource, setDriverSource] = useState<{ name: string; url?: string; via?: "driver-base" } | null>(null);
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
  const chooseSplMode = (m: "relative" | "absolute") => {
    setSplMode(m);
    try {
      localStorage.setItem("sbg.spl", m);
    } catch {
      // not remembered
    }
  };
  const [chartPick, setChartPick] = useState<ChartId>(() => {
    try {
      return (localStorage.getItem("sbg.chart") as ChartId | null) ?? "maxspl";
    } catch {
      return "maxspl";
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
  const showOnPhone = (v: "charts" | "panel", p?: PanelId) => {
    if (p) choosePanel(p);
    setPhoneView(v);
    window.scrollTo({ top: 0 });
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

  // Several drivers: the Driver tab edits one of them (A = the state's own fields, B–D in extraDrivers).
  const [drvPick, setDrvPick] = useState("A");
  const drvSel = drvPick === "A" || state.extraDrivers.some((e) => e.id === drvPick) ? drvPick : "A";
  const ed = useMemo(() => viewFor(state, drvSel === "A" ? undefined : drvSel), [state, drvSel]);
  const solvedBy = useMemo(() => solvedDrivers(state, solved), [state, solved]);
  const solvedEd = solvedBy.get(drvSel) ?? solved;
  /** An edit made on the selected driver's view, written back to that driver. */
  const setStepDrv = (fn: (s: AppState) => AppState) =>
    setStep((s) => routeDriverEdit(s, drvSel, fn(viewFor(s, drvSel === "A" ? undefined : drvSel))));
  // Comparing drivers: the selected driver's curves bold, the others faint.
  const fadedLabels = useMemo(
    () => (state.extraDrivers.length > 0 ? designs.filter((d) => (d.design.driverId ?? "A") !== drvSel).map((d) => d.label) : []),
    [designs, drvSel, state.extraDrivers.length],
  );
  /** Copies of driver A's boxes for driver `id` (as many as there's room for). */
  const withCopiesFor = (s: AppState, id: string): { state: AppState; copied: number; of: number } => {
    const src = s.designs.filter((d) => d.driverId === undefined);
    const designs = [...s.designs];
    for (const d of src.slice(0, Math.max(0, MAX_DESIGNS - s.designs.length))) {
      const { driverId: _a, ...rest } = structuredClone(d);
      designs.push({ ...rest, id: newId(designs), driverId: id, vb_l: Math.round(vbOf(s, d) * 10) / 10 } as DesignState);
    }
    return { state: { ...s, designs }, copied: designs.length - s.designs.length, of: src.length };
  };
  const setD = <K extends keyof AppState>(k: K, v: AppState[K]) =>
    setState((s) => routeDriverEdit(s, drvSel, { ...viewFor(s, drvSel === "A" ? undefined : drvSel), [k]: v }));
  // A line's cone and mouth curves, when switched on.
  const partsOf = (d: Design, map: (y: Float64Array) => Float64Array): Series[] =>
    showParts && d.result.parts
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
      setStepDrv((s) => ({
        ...s,
        driverName: [d.brand, d.model].filter(Boolean).join(" ") || file.name.replace(/\.wdr$/i, ""),
        driverBrand: d.brand,
        nominal_ohms: d.nominal_ohms ?? s.nominal_ohms,
        ts: d.ts,
        le_mh: d.le_mh ?? 0,
        l2_mh: 0,
        r2_ohm: 0,
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
      setStepDrv((s) => {
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
    if (solvedEd.missing.length > 0) {
      setWdrMsg("Enter enough parameters to simulate before exporting.");
      return;
    }
    const name = ed.driverName.trim();
    const brand = ed.driverBrand && name.startsWith(ed.driverBrand) ? ed.driverBrand : "";
    const text = writeWdr({
      brand,
      model: name.slice(brand.length).trim() || name,
      nominal_ohms: ed.nominal_ohms,
      ts: solvedEd.values,
      le_mh: ed.le_mh,
      xmax_mm: ed.xmax_mm,
      pe_w: ed.pe_w,
      displacement_l: ed.volume.driverDisp_l,
    });
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ed.driverName.replace(/[^\w.-]+/g, " ").trim() || "driver"}.wdr`;
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
      dash: k === 0 ? undefined : k === 1 ? "6 3" : "2 3",
      y: g.excursionMm,
      over: g.xmax_mm ?? undefined,
    }));
  });

  // Lines and horns: the line's acoustic impedance (Hornresp's Za), resistance solid, reactance dashed.
  const zaDesigns = designs.filter((d) => d.result.acousticImpedance);
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
  const chartTabs: { id: ChartId; label: string }[] = [
    ...(hasPr ? [{ id: "pr" as const, label: "PR excursion" }] : []),
    ...(hasPort ? [{ id: "port" as const, label: "Port speed" }] : []),
    { id: "maxspl", label: "Max SPL" },
    { id: "impedance", label: "Impedance" },
    ...(zaDesigns.length > 0 ? [{ id: "za" as const, label: "Line load (Za)" }] : []),
    { id: "delay", label: "Group delay" },
  ];
  const chartTab: ChartId = chartTabs.some((t) => t.id === chartPick) ? chartPick : chartTabs[0]!.id;

  // Passive radiators put a deep notch in the response at their own resonance, where the
  // group delay swings far negative; mark it instead of drawing a cliff off the chart.
  const notchMarkers = designs.flatMap((d) => {
    const gd = d.result.groupDelayMs;
    let i0 = -1;
    for (let i = 0; i < gd.length; i++) if (gd[i]! < -20 && (i0 < 0 || gd[i]! < gd[i0]!)) i0 = i;
    if (i0 < 0) return [];
    const f = d.result.freq[i0]!;
    return [{ f, label: `${d.label}: notch ${f < 100 ? f.toFixed(1) : f.toFixed(0)} Hz`, color: d.color }];
  });

  // Passive radiator finder: the driver and drive as the charts use them.
  // Passive radiator finder and the other box tools, per driver (A–D).
  const finders = useMemo(() => {
    const m = new Map<string, FinderContext>();
    for (const { id } of driverList(state)) {
      const view = viewFor(state, id === "A" ? undefined : id);
      const sv = solvedBy.get(id) ?? solved;
      m.set(id, {
        driver: sv.missing.length > 0 ? null : driverInputOf(view, sv),
        sim: simOptionsOf(view),
        losses: { ql: state.settings.losses.ql, qa: state.settings.losses.qa },
        fMin: state.highPass.on ? 10 : 15,
        align: alignmentDriver(sv, view),
        drivers: view.drivers,
      });
    }
    return m;
  }, [state, solved, solvedBy]);
  const finderCtx = finders.get("A")!;
  const finderOf = (d: { driverId?: string }) => finders.get(d.driverId ?? "A") ?? finderCtx;

  const signalOn = (state.highPass.on ? 1 : 0) + state.eq.filter((e) => e.on).length + (state.roomGain.mode !== "off" ? 1 : 0);
  const tabBadges: Partial<Record<PanelId, string>> = {
    boxes: String(state.designs.filter((d) => d.on).length),
    ...(signalOn > 0 ? { signal: String(signalOn) } : {}),
  };

  return (
    <UnitsContext.Provider value={state.settings.units}>
    <div className={`layout phone-${phoneView}`}>
      <header className="top">
        <div>
          <h1>Speaker Box Genius</h1>
          <p className="muted">
            Early preview · <a href={REPO}>GitHub</a> · <a href={`${REPO}/blob/main/docs/build-plan.md`}>Roadmap</a>
          </p>
        </div>
        <div className="top-actions">
          <div
            className="power"
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
            <b>{driveLabel(state)}</b>
            <div
              className="unit-switch"
              role="group"
              aria-label="Drive by"
              title="Watts: V = √(P·Re), like WinISD. Volts: a fixed voltage, like the 2.83 V datasheets quote."
            >
              <button aria-pressed={state.drive === "watts"} onClick={() => setStep((s) => ({ ...s, drive: "watts" }))}>
                W
              </button>
              <button aria-pressed={state.drive === "volts"} onClick={() => setStep((s) => ({ ...s, drive: "volts" }))}>
                V
              </button>
            </div>
          </div>
          <div className="undo-redo" role="group" aria-label="History">
            <button className="secondary icon" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
              ↶
            </button>
            <button className="secondary icon" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
              ↷
            </button>
          </div>
          <ProjectsMenu
            install={pwa.install}
            state={state}
            onOpen={(s) => {
              setStep(s);
              notify(`Opened “${s.driverName}”.`);
            }}
          />
          <ShareMenu state={state} designs={designs} shareUrl={shareUrl} />
          <PwaStatus pwa={pwa} />
        </div>
      </header>

      <aside className="panel">
        <PanelTabs value={panel} onChange={choosePanel} badges={tabBadges} className="desktop-tabs" />
        {panel === "driver" && (
          <div className="tab-panel" role="tabpanel" id="panel-driver" aria-labelledby="tab-driver">
            <Card title={state.extraDrivers.length > 0 ? `Driver ${drvSel}` : "Driver"}>
              <div className="driver-chips" role="group" aria-label="Drivers" data-help-title="Drivers" data-help="Up to four drivers to compare. Tap one to edit it; each box design picks its driver (Boxes tab). Add a driver, then load or type its values.">
                {driverList(state).map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className={`chip${x.id === drvSel ? " on" : ""}`}
                    aria-pressed={x.id === drvSel}
                    onClick={() => setDrvPick(x.id)}
                    title={x.name}
                  >
                    <b>{x.id}</b> {x.name.length > 22 ? `${x.name.slice(0, 21)}…` : x.name}
                  </button>
                ))}
                {state.extraDrivers.length < MAX_DRIVERS - 1 && (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      const r = addDriver(state, undefined);
                      if (!r) return;
                      // The new driver gets its own copies of driver A's boxes, so the charts compare them straight away.
                      const c = withCopiesFor(r.state, r.id);
                      const copied = c.copied;
                      const src = { length: c.of };
                      setStep(c.state);
                      setDrvPick(r.id);
                      notify(
                        `Added driver ${r.id} (a copy of A for now)${copied > 0 ? ` with ${copied === src.length ? "copies of your boxes" : `copies of ${copied} of your boxes (the most there's room for)`}, shown as “· ${r.id}” on the charts` : ""}. Now load or type driver ${r.id}'s values.`,
                      );
                    }}
                  >
                    + Add driver
                  </button>
                )}
              </div>
              {drvSel === "A" && state.extraDrivers.length > 0 && (
                <p className="hint">
                  Editing driver A. Its curves are bold on the charts and the other drivers&rsquo; faint (dashed for B, dotted for C); tap a
                  driver to bring its curves forward.
                </p>
              )}
              {drvSel !== "A" && (
                <p className="hint">
                  Editing driver {drvSel}.{" "}
                  {state.designs.filter((d) => d.driverId === drvSel).length === 0 ? (
                    <>
                      No box uses it yet.{" "}
                      <button
                        type="button"
                        className="link"
                        disabled={state.designs.length >= MAX_DESIGNS}
                        onClick={() => {
                          const c = withCopiesFor(state, drvSel);
                          setStep(c.state);
                          notify(c.copied > 0 ? `Copied ${c.copied} box${c.copied > 1 ? "es" : ""} for driver ${drvSel} (“· ${drvSel}” on the charts).` : "No room for more boxes (8 at most).");
                        }}
                      >
                        Copy your boxes for driver {drvSel}
                      </button>
                    </>
                  ) : (
                    `Its curves are bold on the charts; the other drivers' are faint. Used by ${state.designs
                      .filter((d) => d.driverId === drvSel)
                      .map((d) => d.name)
                      .join(", ")}.`
                  )}{" "}
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setStep((s) => removeDriver(s, drvSel));
                      setDrvPick("A");
                      notify(`Removed driver ${drvSel}; its designs use driver A.`);
                    }}
                  >
                    Remove driver {drvSel}
                  </button>
                </p>
              )}
              <DriverBrowser
                rows={db?.drivers}
                onPick={(id) =>
                  loadDriver(id).then(
                    (d) => {
                      offerSizing(d.name);
                      setDriverSource(d.source ? { name: d.name, ...d.source } : null);
                      setStepDrv((s) => ({
                        ...s,
                        driverName: d.name,
                        driverBrand: d.brand,
                        nominal_ohms: d.nominal_ohms ?? s.nominal_ohms,
                        ts: d.ts,
                        le_mh: d.le_mh ?? 0,
                        l2_mh: d.l2_mh ?? 0,
                        r2_ohm: d.r2_ohm ?? 0,
                        xmax_mm: d.xmax_mm ?? s.xmax_mm,
                        pe_w: d.pe_w ?? s.pe_w,
                        volume: {
                          ...s.volume,
                          ...(d.displacement_l !== undefined ? { driverDisp_l: d.displacement_l } : {}),
                          driverCutout_mm: d.cutout_mm ?? 0,
                        },
                        // DVC drivers start wired the way their published values were measured.
                        dvc: d.dvcWiring
                          ? { on: true, entered: d.dvcWiring, wired: d.dvcWiring }
                          : { ...s.dvc, on: false },
                      }));
                    },
                    () => alert("Couldn't load that driver."),
                  )
                }
              />
              <input
                className="name"
                data-help-title="Driver name"
                data-help="A name for this driver, used in shared links, forum posts and exports. Load a driver from the database to fill everything in."
                value={ed.driverName}
                onChange={(e) => setD("driverName", e.currentTarget.value)}
                aria-label="Driver name"
              />
              {driverSource && driverSource.name === ed.driverName && (
                <p className="driver-source muted">
                  {driverSource.url ? (
                    <a href={driverSource.url} target="_blank" rel="noopener">
                      Manufacturer's specs
                    </a>
                  ) : (
                    "Manufacturer's specs"
                  )}
                  {driverSource.via === "driver-base" && (
                    <>
                      {" · values via "}
                      <a href="https://github.com/JonathanDCohen/driver-base" target="_blank" rel="noopener">
                        driver-base
                      </a>{" "}
                      (
                      <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">
                        CC BY 4.0
                      </a>
                      )
                    </>
                  )}
                </p>
              )}
              <TsEditor
                entered={ed.ts}
                solved={solvedEd}
                onChange={(ts) => setD("ts", ts)}
                pasting={pasting}
                onPastingChange={setPasting}
                onPaste={(ts, x) => {
                  offerSizing("Pasted driver");
                  setStepDrv((s) => ({
                    ...s,
                    driverName: "Pasted driver",
                    driverBrand: "",
                    volume: { ...s.volume, driverCutout_mm: 0 },
                    ts,
                    le_mh: x.le_mh ?? s.le_mh,
                    l2_mh: 0,
                    r2_ohm: 0,
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
                    setStepDrv((s) => ({ ...s, ts: {} }));
                    notify("Cleared the T/S values.");
                  }}
                  onImport={() => wdrInput.current?.click()}
                  onExport={exportWdr}
                  submitUrl={submitDriverUrl(ed)}
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
                <Num help="Nominal impedance printed on the driver (4, 8 Ω…). Only used when the drive is set as watts into the nominal impedance; the simulation itself uses Re." label="Znom" unit="Ω" value={ed.nominal_ohms} onChange={(v) => setD("nominal_ohms", v)} />
                <Num help="Voice-coil inductance from the datasheet. It makes the impedance rise with frequency and rolls off the top end; Settings can leave it out, like WinISD." label="Le" unit="mH" value={ed.le_mh} min={0} onChange={(v) => setD("le_mh", v)} />
                <Num
                  label="L2"
                  unit="mH"
                  value={ed.l2_mh}
                  min={0}
                  title="Optional: second, lossy inductance (L2R2 coil model). 0 = plain Le. Fill in from a measured sweep."
                  onChange={(v) => setD("l2_mh", v)}
                />
                <Num
                  label="R2"
                  unit="Ω"
                  value={ed.r2_ohm}
                  min={0}
                  title="Optional: resistance across L2 (eddy-current losses). Used only when L2 is also set."
                  onChange={(v) => setD("r2_ohm", v)}
                />
                <Num help="Maximum one-way excursion the cone can make while staying linear (from the datasheet). The excursion chart turns red above it." label="Xmax" unit="mm" value={ed.xmax_mm} onChange={(v) => setD("xmax_mm", v)} />
                <Num help="Thermal power rating: how much power the voice coil can take continuously. Sets the thermal limit in the Max SPL chart." label="Pe" unit="W" value={ed.pe_w} onChange={(v) => setD("pe_w", v)} />
                <Num help="How many drivers (or isobaric pairs) share the box. More drivers move more air; the box volume is shared between them."
                  label={ed.isobaric ? "Pairs" : "Drivers"}
                  value={ed.drivers}
                  onChange={(v) => setD("drivers", Math.max(1, Math.round(v)))}
                />
                <Select<"standard" | "isobaric"> help="Standard: each driver faces out. Isobaric: two drivers work as one (face to face or front to back), needing half the box for the same bass but 3 dB less efficiency."
                  label="Loading"
                  value={ed.isobaric ? "isobaric" : "standard"}
                  options={[
                    { value: "standard", text: "Standard" },
                    { value: "isobaric", text: "Isobaric pairs" },
                  ]}
                  onChange={(x) => setD("isobaric", x === "isobaric")}
                />
                {ed.isobaric && (
                  <Select<"series" | "parallel"> help="How the two coils of each isobaric pair are wired together: parallel halves the impedance, series doubles it."
                    label="Pair coils"
                    value={ed.isoCoils}
                    options={[
                      { value: "parallel", text: "Parallel (half the impedance)" },
                      { value: "series", text: "Series (double the impedance)" },
                    ]}
                    onChange={(x) => setD("isoCoils", x)}
                  />
                )}
                <Select<"single" | "dual"> help="Dual voice coil (DVC) drivers have two coils you can wire in series or parallel. Choose Dual to get those options."
                  label="Voice coils"
                  value={ed.dvc.on ? "dual" : "single"}
                  options={[
                    { value: "single", text: "Single" },
                    { value: "dual", text: "Dual (DVC)" },
                  ]}
                  onChange={(x) => setD("dvc", { ...state.dvc, on: x === "dual" })}
                />
                {ed.dvc.on && (
                  <>
                    <Select<"one" | "parallel" | "series"> help="Datasheets for DVC drivers give T/S values for one coil or for both coils wired a certain way. Say which, so the wiring below is calculated correctly."
                      label="Values are for"
                      value={ed.dvc.entered}
                      options={[
                        { value: "parallel", text: "Both coils in parallel" },
                        { value: "series", text: "Both coils in series" },
                        { value: "one", text: "One coil" },
                      ]}
                      onChange={(entered) => setD("dvc", { ...state.dvc, entered })}
                    />
                    <Select<"parallel" | "series"> help="How you will wire the two voice coils: series doubles the impedance, parallel halves it. It changes the load on the amplifier, not the bass shape."
                      label="Coils wired"
                      value={ed.dvc.wired}
                      options={[
                        { value: "parallel", text: "In parallel" },
                        { value: "series", text: "In series" },
                      ]}
                      onChange={(wired) => setD("dvc", { ...state.dvc, wired })}
                    />
                  </>
                )}
                {ed.drivers > 1 && (
                  <Select<"parallel" | "series"> help="How several drivers (or pairs) are wired to the amplifier: parallel lowers the impedance, series raises it."
                    label="Wiring"
                    value={ed.wiring}
                    options={[
                      { value: "parallel", text: `${ed.isobaric ? "Pairs" : "Drivers"} in parallel` },
                      { value: "series", text: `${ed.isobaric ? "Pairs" : "Drivers"} in series` },
                    ]}
                    onChange={(x) => setD("wiring", x)}
                  />
                )}
              </div>
              {ed.dvc.on && solvedEd.missing.length === 0 && (
                <p className="hint">
                  As wired: Re {(solvedEd.values.re! * dvcFactors(ed).re).toFixed(2)} Ω, Qes{" "}
                  {(solvedEd.values.qes! * dvcFactors(ed).qes).toFixed(3)}. Wiring only changes the impedance (and how much the
                  cable resistance matters); the response at a given power stays the same.
                </p>
              )}
              <p className="hint">
                {ed.isobaric
                  ? `Each pair is two drivers working as one (face to face or one behind the other): same Fs and Qts, half the Vas, so about half the box. ${ed.drivers * 2} drivers in total. `
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
                sd_cm2={solvedEd.values.sd_cm2}
                onUse={(ts, coil) =>
                  setStepDrv((s) => {
                    // Keep Vas / Sd the user had, unless the measurement provides them; drop values it supersedes.
                    const keep: typeof s.ts = {};
                    if (s.ts.vas_l !== undefined && ts.mms_g === undefined) keep.vas_l = s.ts.vas_l;
                    if (s.ts.mms_g !== undefined && s.ts.vas_l === undefined && ts.mms_g === undefined) keep.mms_g = s.ts.mms_g;
                    return {
                      ...s,
                      driverName: s.driverName.endsWith("(measured)") ? s.driverName : `${s.driverName} (measured)`,
                      ts: { ...keep, ...ts },
                      ...coil,
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
              <span className="hint">Sealed Qtc 0.707; ported and PR a flat alignment (QB3, or Keele for higher Qts). Undo takes it back.</span>
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
                linked={state.volume.link === d.id}
                lineFb={d.kind === "line" ? (designs.find((x) => x.design.id === d.id)?.result.summary.fb ?? null) : undefined}
                driverDisp_l={state.volume.driverDisp_l * viewOfDesign(state, d).drivers * (viewOfDesign(state, d).isobaric ? 2 : 1)}
                wall_mm={state.volume.wall_mm}
                canDelete={state.designs.length > 1}
                db={db}
                air={airOf(state)}
                align={finderOf(d).align}
                drivers={finderOf(d).drivers}
                driverChoice={
                  state.extraDrivers.length > 0
                    ? { value: d.driverId ?? "A", options: driverList(state), onChange: (id: string) =>
                          setStep((s) => ({
                            ...s,
                            designs: s.designs.map((x) => {
                              if (x.id !== d.id) return x;
                              const { driverId: _old, ...rest } = x;
                              return (id === "A" ? rest : { ...rest, driverId: id }) as DesignState;
                            }),
                          })) }
                    : undefined
                }
                portCtx={portContext(state, designs, d.id)}
                losses={state.settings.losses}
                onDimensions={() => openDimensions(d)}
                finder={finderOf(d)}
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
                  const vb = Math.round(vbOf(state, d) * 10) / 10;
                  setStep((s) => ({
                    ...s,
                    designs: s.designs.map((x) => (x.id === d.id ? { ...x, vb_l: vb } : x)),
                    volume: { ...s.volume, link: "none" },
                  }));
                }}
                onChange={updateDesign}
                onDuplicate={() => duplicateDesign(d)}
                onDelete={() => deleteDesign(d)}
                onImportDriver={(x) =>
                  setStep((s0) => routeDriverEdit(s0, d.driverId ?? "A", ((s: AppState) => ({
                    ...s,
                    driverName: x.name,
                    driverBrand: "",
                    ts: x.ts,
                    le_mh: x.le_mh,
                    l2_mh: 0,
                    r2_ohm: 0,
                    ...(x.xmax_mm !== undefined ? { xmax_mm: x.xmax_mm } : {}),
                    dvc: { ...s.dvc, on: false },
                  }))(viewOfDesign(s0, d))))
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
            <Card title="High-pass filter" on={hp.on} onToggle={(on) => set("highPass", { ...hp, on })}>
              <div className="fields">
                <Select<HighPassType> help="Filter shape. Butterworth is maximally flat; Linkwitz-Riley is the usual crossover shape (−6 dB at the corner)."
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
              </div>
              <p className="hint">A subsonic filter protects ported and PR boxes from over-excursion below tuning.</p>
            </Card>

            <EqPanel state={state} designs={designs} onChange={(eq) => set("eq", eq)} />

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
              driverName={viewOfDesign(state, state.designs.find((x) => x.id === state.volume.link) ?? {}).driverName}
              driverSd_cm2={finderOf(state.designs.find((x) => x.id === state.volume.link) ?? {}).driver?.sd_cm2}
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
                <Select<"yes" | "no"> help="Whether the simulation includes the voice-coil inductance (Le, and L2/R2 when given). WinISD leaves it out by default."
                  label="Coil inductance"
                  value={state.settings.inductance ? "yes" : "no"}
                  options={[
                    {
                      value: "yes",
                      text: state.l2_mh > 0 && state.r2_ohm > 0 ? "Le + L2/R2 (most realistic)" : "Le (more realistic above ~100 Hz)",
                    },
                    { value: "no", text: "Off (WinISD's default)" },
                  ]}
                  onChange={(x) => set("settings", { ...state.settings, inductance: x === "yes" })}
                />
                <Num help="Box leakage loss as a Q at the tuning frequency: lower means a leakier box. 10 is WinISD's default (a typical well-built box)."
                  label="Leak Ql"
                  value={state.settings.losses.ql}
                  min={1}
                  onChange={(ql) => set("settings", { ...state.settings, losses: { ...state.settings.losses, ql } })}
                />
                <Num help="Absorption loss (stuffing, wall flex) as a Q: lower means more loss. 100 is WinISD's default (little stuffing)."
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
                <Select<"off" | "on"> help="Port compression: at high air speed a port loses output to turbulence. On estimates that loss at the current power (approximate)."
                  label="Port compression"
                  value={state.settings.portCompression ? "on" : "off"}
                  options={[
                    { value: "off", text: "Off (like WinISD)" },
                    { value: "on", text: "On (approximate, at this power)" },
                  ]}
                  onChange={(x) => set("settings", { ...state.settings, portCompression: x === "on" })}
                />
                <Num
                  label="Voice coil"
                  unit="°C"
                  value={state.settings.coilTemp_C}
                  min={20}
                  title="Voice-coil temperature: 20 °C = the datasheet's cold values (like WinISD). A hot coil has a higher Re: less output, higher Q."
                  onChange={(t) => set("settings", { ...state.settings, coilTemp_C: Math.min(250, Math.max(20, t)) })}
                />
                <Select<"lumped" | "pipe"> help="Air mass (like WinISD) treats a port as a slug of air. Pipe also shows the port's own pipe resonances higher up (vented boxes)."
                  label="Ports"
                  value={state.settings.portModel}
                  options={[
                    { value: "lumped", text: "Air mass (like WinISD)" },
                    { value: "pipe", text: "Pipe, with its resonances" },
                  ]}
                  onChange={(portModel) => set("settings", { ...state.settings, portModel })}
                />
                <Select<"on-axis" | "power"> help="How SPL is worked out for lines and horns: in front of the box, or from the power each opening radiates as Hornresp does."
                  label="Line/horn SPL"
                  value={state.settings.lineSpl}
                  options={[
                    { value: "on-axis", text: "In front of the box" },
                    { value: "power", text: "From radiated power (like Hornresp)" },
                  ]}
                  onChange={(lineSpl) => set("settings", { ...state.settings, lineSpl })}
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
              </div>
              <p className="hint">
                Box losses are Q values at the tuning frequency: lower means more loss. 10 / 100 / 100 matches WinISD's
                defaults. A bandpass can also set its own losses for each chamber. For like-for-like checks against WinISD,
                choose its air values, its amplifier resistance (Signal tab, Rg) and leave out Le, or simply import the
                WinISD project (.wpr). The {PORT_LIMIT} m/s chuffing line applies to
                whichever port-speed convention you pick.
              </p>
              <p className="hint">
                Voice coil: {state.settings.coilTemp_C > 20 ? (
                  <>
                    at {state.settings.coilTemp_C} °C the coil&rsquo;s resistance is {Math.round((coilHeatFactor(state.settings.coilTemp_C) - 1) * 100)}% higher
                    {solved.values.re !== undefined ? ` (Re ${(solved.values.re * dvcFactors(state).re).toFixed(2)} → ${(solved.values.re * dvcFactors(state).re * coilHeatFactor(state.settings.coilTemp_C)).toFixed(2)} Ω)` : ""}, so the
                    same amplifier voltage gives about {(20 * Math.log10(coilHeatFactor(state.settings.coilTemp_C))).toFixed(1)}&nbsp;dB less above the bass,
                    and Qes (so the box&rsquo;s Q) rises by the same ratio, propping up the response near resonance. This is power
                    compression: the dB SPL view shows the lost output, the Relative view the change in shape (and F3).
                  </>
                ) : (
                  <>20 °C uses the datasheet&rsquo;s cold values. </>
                )}{" "}
                Coils heat with sustained power, only a little at moderate levels but to 150&nbsp;°C or more near their rated power.
                Copper and aluminium both rise about 0.4&nbsp;% per °C.
              </p>
              <p className="hint">
                Ports as pipes: a port is also a pipe open at both ends, resonating at about c&nbsp;/&nbsp;2L (a 40&nbsp;cm port near
                380&nbsp;Hz) and letting midrange out as a narrow peak. &ldquo;Pipe&rdquo; draws those resonances (charts then run to
                1&nbsp;kHz); in the bass it matches the air-mass model within a few tenths of a dB. Vented boxes only; the box&rsquo;s own
                standing waves, which drive the port hardest when they coincide, aren&rsquo;t simulated.
              </p>
              <p className="hint">
                Lines and horns: Hornresp works SPL out from the power each opening radiates. That matches the
                in-front-of-the-box SPL in the bass and reads lower once a mouth is large next to the wavelength (about
                1.5 dB at 500 Hz for an 850 cm² mouth). For like-for-like checks against Hornresp, pick its air and
                &ldquo;From radiated power&rdquo;, and set the drive to 2.83 V.
              </p>
            </Card>
          </div>
        )}
      </aside>

      <main className="charts">
        {welcome.linkNote && <LinkNote onDismiss={welcome.dismissLinkNote} onTips={welcome.showTips} />}
        {welcome.tips && <GettingStarted onDismiss={welcome.dismissTips} />}
        <Summary designs={designs} state={state} missing={solved.missing.length > 0} />

        {designs.length > 0 && (
          <ChartEmphasis.Provider value={fadedLabels}>
          <CrosshairProvider>
            <LogChart
              forum
              title={`${splMode === "relative" ? "Relative response" : "SPL"} at ${driveLabel(state)}${coilLabel(state)}, 1 m, ${state.roomGain.mode === "car" ? "in the car (cabin gain added)" : state.roomGain.mode === "room" ? "in the room (room gain added)" : state.baffle.on ? "free-standing (baffle step)" : "half space"}${hp.on ? `, with ${hp.order * 6} dB/oct high-pass at ${hp.freq} Hz` : ""}`}
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
                <div className="unit-switch" role="group" aria-label="SPL scale">
                  <button aria-pressed={splMode === "relative"} onClick={() => chooseSplMode("relative")} title="Each design's passband at 0 dB, with −3 and −6 dB lines">
                    Relative
                  </button>
                  <button aria-pressed={splMode === "absolute"} onClick={() => chooseSplMode("absolute")} title="Sound pressure level in dB SPL">
                    dB SPL
                  </button>
                </div>
                </>
              }
              {...(splMode === "relative"
                ? {
                    series: designs.flatMap((d) => {
                      const ref = d.result.summary.referenceSpl;
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
                    }).concat(measuredSeries(state.measured, "spl", freq, designs, true)),
                    limits: [
                      { value: -3, label: "−3 dB", color: "var(--muted)" },
                      { value: -6, label: "−6 dB", color: "var(--muted)" },
                    ],
                    limitStyle: "guide" as const,
                    yStep: 6,
                    yMin: -30,
                    points: designs.flatMap((d) => {
                      const ref = d.result.summary.referenceSpl;
                      const rel = d.result.spl.map((v) => v - ref);
                      // F3 is the box's own: without the baffle step (which isn't a box property), drawn on the curve as shown.
                      const step = baffleDbFor(state, d.result.freq, finderOf(d.design).driver?.sd_cm2);
                      const own = step ? rel.map((v, i) => v - step[i]!) : rel;
                      const pts =
                        d.design.kind === "line"
                          ? lowEdge(d.result.freq, own)
                          : minus3Points(d.result.freq, own, d.design.kind === "bandpass");
                      return pts.map((f) => ({
                        f,
                        y: step ? valueAt(d.result.freq, rel, f) : -3,
                        color: d.color,
                        label: `F3 ${f < 100 ? f.toFixed(1) : f.toFixed(0)}`,
                        of: d.label,
                      }));
                    }),
                  }
                : {
                    series: designs
                      .flatMap((d) => [{ label: d.label, color: d.color, dash: d.dash, y: d.result.spl }, ...partsOf(d, (y) => y)])
                      .concat(measuredSeries(state.measured, "spl", freq, designs)),
                  })}
            />
            <LogChart
              forum
              title="Cone excursion (peak, one way)"
              unit="mm"
              freq={freq}
              series={designs.map((d) => ({ label: d.label, color: d.color, dash: d.dash, y: d.result.excursionMm, over: viewOfDesign(state, d.design).xmax_mm }))}
              limits={designs
                .map((d) => viewOfDesign(state, d.design).xmax_mm)
                .filter((x, i, all) => all.indexOf(x) === i)
                .map((x) => ({
                value: x,
                label: state.extraDrivers.length > 0 ? `Xmax ${x} mm (${driverList(state).filter((k) => viewFor(state, k.id === "A" ? undefined : k.id).xmax_mm === x).map((k) => k.id).join(", ")})` : `Xmax ${x} mm`,
                color: LIMIT_RED,
              }))}
              yMin={0}
            />
            <TabRow<ChartId>
              tabs={chartTabs}
              selected={chartTab}
              onSelect={chooseChart}
              ariaLabel="More charts"
              className="chart-tabs"
            />
            {hasPr && (
              <LogChart
                forum
                hidden={chartTab !== "pr"}
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
                hidden={chartTab !== "port"}
                title={`Port air velocity (${state.settings.velocity === "rms" ? "RMS" : "peak"})`}
                unit="m/s"
                freq={freq}
                series={[
                  ...designs.map((d) => ({
                    label: d.design.kind === "bandpass" ? `${d.label} (front port)` : d.label,
                    color: d.color,
                    dash: d.dash,
                    y: d.result.portVelocity,
                    over: PORT_LIMIT,
                  })),
                  ...designs.map((d) => ({
                    label: `${d.label} (rear port)`,
                    color: d.color,
                    dash: "5 3",
                    y: d.result.rearPortVelocity,
                    over: PORT_LIMIT,
                  })),
                ].filter((s) => s.y)}
                limits={[{ value: PORT_LIMIT, label: `Chuffing risk ${PORT_LIMIT} m/s`, color: LIMIT_RED }]}
                yMin={0}
              />
            )}
            <LogChart
              hidden={chartTab !== "maxspl"}
              title="Maximum SPL (first limit reached)"
              unit="dB"
              freq={freq}
              series={designs.map((d) => ({
                label: d.label,
                color: d.color,
                dash: d.dash,
                y: d.result.maxSpl,
                notes: d.result.limitedBy.map((l) => LIMIT_KINDS[l]?.short ?? ""),
              }))}
              ribbons={designs.map((d) => ({ label: d.label, color: d.color, kinds: d.result.limitedBy }))}
              ribbonKinds={LIMIT_KINDS}
            />
            <LogChart
              hidden={chartTab !== "impedance"}
              title="Impedance"
              unit="Ω"
              freq={freq}
              series={[
                ...series((r) => r.impedanceOhm),
                ...measuredSeries(state.measured, "impedance", freq, designs),
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
            {zaDesigns.length > 0 && (
              <LogChart
                hidden={chartTab !== "za"}
                title="Line load Za"
                unit="× ρc/S"
                freq={freq}
                series={zaSeries}
                limits={[{ value: 1, label: "1 = the duct's own impedance", color: "#a8a29e" }]}
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
            <LogChart
              hidden={chartTab !== "delay"}
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
        {designs.length > 0 && <MeasuredCard measured={state.measured} designs={designs} onChange={(measured) => setStep((s) => ({ ...s, measured }))} />}

        <footer className="muted">
          Small-signal lumped model: no voice-coil or port compression, no Bl/Cms non-linearity. Box losses Ql{" "}
          {state.settings.losses.ql}, Qa {state.settings.losses.qa}, Qp {state.settings.losses.qp}. Free for non-commercial use · <a href={`${REPO}/blob/main/LICENSE`}>Licence</a> · <a href={`${REPO}/blob/main/docs/data-sources.md`}>Driver data: credits, corrections</a> · <a href={REPO}>GitHub</a>
          {" · "}
          <a href={reportUrl(shareUrl())} target="_blank" rel="noopener">
            Report a problem
          </a>
          {!welcome.tips && (
            <>
              {" · "}
              <button type="button" className="link" onClick={welcome.showTips}>
                Getting started tips
              </button>
            </>
          )}
        </footer>
      </main>
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
    drive: driveLabel(state),
  };
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
          {designs.map(({ design: d, label, color, vb_l, result: r }) => {
            const x = peak(r.excursionMm, r.freq, fMin);
            const xpr = prPeak(r, fMin);
            const vpFront = peak(r.portVelocity, r.freq, fMin);
            const vpRear = peak(r.rearPortVelocity, r.freq, fMin);
            const vp = vpFront === null ? vpRear : Math.max(vpFront, vpRear ?? 0);
            return (
              <tr key={d.id}>
                <th>
                  <span className="swatch" style={{ background: color }} aria-hidden="true" />
                  <span title={label}>{shortName(label)}</span>
                </th>
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
                <td className={x !== null && x > viewOfDesign(state, d).xmax_mm ? "over" : ""}>{fmt(x)} mm</td>
                <td
                  className={xpr?.over ? "over" : ""}
                  title={(r.prGroups?.length ?? 0) > 1 ? "The PR group closest to (or furthest past) its own Xmax" : undefined}
                >
                  {xpr === null ? "–" : `${fmt(xpr.mm)} mm`}
                </td>
                <td className={vp !== null && vp > PORT_LIMIT ? "over" : ""}>{vp === null ? "–" : `${fmt(vp)} m/s`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <p className="hint swipe-hint">Swipe the table sideways for peak excursion and port speed.</p>
      <p className="hint">
        Peaks are taken above {fMin} Hz{state.highPass.on ? "" : " (turn on the high-pass filter to model a subsonic filter)"}.
        Red means over the limit.
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

/**
 * Where a relative response (0 dB = passband) crosses −3 dB, read off the curve as shown:
 * below its peak, and for a bandpass above it too. Interpolated in log f.
 */
/** Transmission lines ripple above their tuning: their −3 dB point is the first one coming up from the bottom. */
function lowEdge(freq: Float64Array, rel: ArrayLike<number>): number[] {
  for (let i = 1; i < rel.length; i++) {
    if (rel[i]! >= -3 && rel[i - 1]! < -3) {
      const t = (-3 - rel[i - 1]!) / (rel[i]! - rel[i - 1]!);
      return [freq[i - 1]! * (freq[i]! / freq[i - 1]!) ** t];
    }
  }
  return [];
}

/** Value of a curve at frequency f (log-frequency interpolation). */
function valueAt(freq: Float64Array, ys: ArrayLike<number>, f: number): number {
  let i = 1;
  while (i < freq.length - 1 && freq[i]! < f) i++;
  const t = Math.log(f / freq[i - 1]!) / Math.log(freq[i]! / freq[i - 1]!);
  return ys[i - 1]! + t * (ys[i]! - ys[i - 1]!);
}

function minus3Points(freq: Float64Array, rel: ArrayLike<number>, bandLimited: boolean): number[] {
  let peak = 0;
  for (let i = 1; i < rel.length; i++) if (rel[i]! > rel[peak]!) peak = i;
  if (!(rel[peak]! >= -3)) return [];
  const at = (i: number, j: number) => {
    const t = (-3 - rel[i]!) / (rel[j]! - rel[i]!);
    return freq[i]! * (freq[j]! / freq[i]!) ** t;
  };
  const out: number[] = [];
  for (let i = peak; i > 0; i--) {
    if (rel[i - 1]! < -3) {
      out.push(at(i - 1, i));
      break;
    }
  }
  for (let i = peak; bandLimited && i + 1 < rel.length; i++) {
    if (rel[i + 1]! < -3) {
      out.push(at(i, i + 1));
      break;
    }
  }
  return out;
}
