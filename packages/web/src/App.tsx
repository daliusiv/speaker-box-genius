import { useEffect, useMemo, useRef, useState } from "react";
import {
  impedanceMagnitude,
  parseWdr,
  parseWpr,
  resampleMagnitude,
  writeWdr,
  type HighPassType,
  type SimulationResult,
} from "@sbg/engine";
import { CrosshairProvider, LogChart, shortName, type Series } from "./LogChart.tsx";
import { useUndoable } from "./useUndoable.ts";
import { sizeAllForDriver } from "./presets.ts";
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
  alignmentDriver,
  colorOf,
  dvcFactors,
  PORT_LIMIT,
  prGroupLabels,
  prPeak,
  prXmaxes,
  dimensionsFor,
  driveLabel,
  driverInputOf,
  simOptionsOf,
  roomGainOf,
  runDesigns,
  solveDriver,
  vbOf,
  type Design,
} from "./sim.ts";
import { RoomGainPanel } from "./RoomGain.tsx";
import { AddDesign, DesignCard } from "./Designs.tsx";
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

type ChartId = "pr" | "port" | "maxspl" | "impedance" | "delay";

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
  const series = (pick: (r: SimulationResult) => Float64Array | null): Series[] =>
    designs.map((d) => ({ label: d.design.name, color: d.color, y: pick(d.result) }));

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
      label: d.design.kind === "pr" && k === 0 ? d.design.name : `${d.design.name}: ${names[k] ?? `group ${k + 1}`}`,
      color: d.color,
      dash: k === 0 ? undefined : k === 1 ? "6 3" : "2 3",
      y: g.excursionMm,
      over: g.xmax_mm ?? undefined,
    }));
  });

  // The charts under the tab row: one at a time, the choice remembered; unavailable ones are left out.
  const hasPr = prDesigns.length > 0;
  const hasPort = designs.some((d) => d.result.portVelocity || d.result.rearPortVelocity);
  const chartTabs: { id: ChartId; label: string }[] = [
    ...(hasPr ? [{ id: "pr" as const, label: "PR excursion" }] : []),
    ...(hasPort ? [{ id: "port" as const, label: "Port speed" }] : []),
    { id: "maxspl", label: "Max SPL" },
    { id: "impedance", label: "Impedance" },
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
    return [{ f, label: `${d.design.name}: notch ${f < 100 ? f.toFixed(1) : f.toFixed(0)} Hz`, color: d.color }];
  });

  // Passive radiator finder: the driver and drive as the charts use them.
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
          <div className="power">
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
            <Card title="Driver">
              <DriverBrowser
                rows={db?.drivers}
                onPick={(id) =>
                  loadDriver(id).then(
                    (d) => {
                      offerSizing(d.name);
                      setDriverSource(d.source ? { name: d.name, ...d.source } : null);
                      setStep((s) => ({
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
                value={state.driverName}
                onChange={(e) => set("driverName", e.currentTarget.value)}
                aria-label="Driver name"
              />
              {driverSource && driverSource.name === state.driverName && (
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
                entered={state.ts}
                solved={solved}
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
                <Num label="Znom" unit="Ω" value={state.nominal_ohms} onChange={(v) => set("nominal_ohms", v)} />
                <Num label="Le" unit="mH" value={state.le_mh} min={0} onChange={(v) => set("le_mh", v)} />
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
                <Num label="Xmax" unit="mm" value={state.xmax_mm} onChange={(v) => set("xmax_mm", v)} />
                <Num label="Pe" unit="W" value={state.pe_w} onChange={(v) => set("pe_w", v)} />
                <Num
                  label={state.isobaric ? "Pairs" : "Drivers"}
                  value={state.drivers}
                  onChange={(v) => set("drivers", Math.max(1, Math.round(v)))}
                />
                <Select<"standard" | "isobaric">
                  label="Loading"
                  value={state.isobaric ? "isobaric" : "standard"}
                  options={[
                    { value: "standard", text: "Standard" },
                    { value: "isobaric", text: "Isobaric pairs" },
                  ]}
                  onChange={(x) => set("isobaric", x === "isobaric")}
                />
                {state.isobaric && (
                  <Select<"series" | "parallel">
                    label="Pair coils"
                    value={state.isoCoils}
                    options={[
                      { value: "parallel", text: "Parallel (half the impedance)" },
                      { value: "series", text: "Series (double the impedance)" },
                    ]}
                    onChange={(x) => set("isoCoils", x)}
                  />
                )}
                <Select<"single" | "dual">
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
                    <Select<"one" | "parallel" | "series">
                      label="Values are for"
                      value={state.dvc.entered}
                      options={[
                        { value: "parallel", text: "Both coils in parallel" },
                        { value: "series", text: "Both coils in series" },
                        { value: "one", text: "One coil" },
                      ]}
                      onChange={(entered) => set("dvc", { ...state.dvc, entered })}
                    />
                    <Select<"parallel" | "series">
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
                  <Select<"parallel" | "series">
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
                canDelete={state.designs.length > 1}
                db={db}
                air={airOf(state)}
                align={alignmentDriver(solved, state)}
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
                <Num label="Freq" unit="Hz" value={hp.freq} onChange={(freq) => set("highPass", { ...hp, freq })} />
              </div>
              <p className="hint">A subsonic filter protects ported and PR boxes from over-excursion below tuning.</p>
            </Card>

            <EqPanel state={state} designs={designs} onChange={(eq) => set("eq", eq)} />

            <RoomGainPanel value={state.roomGain} room={roomGainOf(state)} onChange={(r) => set("roomGain", r)} />
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
                <Select<"metric" | "imperial">
                  label="Units"
                  value={state.settings.units}
                  options={[
                    { value: "metric", text: "Metric (L, cm)" },
                    { value: "imperial", text: "Imperial (ft³, in)" },
                  ]}
                  onChange={(units) => set("settings", { ...state.settings, units })}
                />
                <Select<"standard" | "winisd">
                  label="Air"
                  value={state.settings.air}
                  options={[
                    { value: "standard", text: "Standard (20 °C, ρ 1.204, c 343.2)" },
                    { value: "winisd", text: "WinISD defaults (ρ 1.201, c 343.7)" },
                  ]}
                  onChange={(air) => set("settings", { ...state.settings, air })}
                />
                <Num
                  label="Amp + cable"
                  unit="Ω"
                  value={state.settings.rg}
                  min={0}
                  onChange={(rg) => set("settings", { ...state.settings, rg })}
                />
                <Select<"yes" | "no">
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
                <Num
                  label="Leak Ql"
                  value={state.settings.losses.ql}
                  min={1}
                  onChange={(ql) => set("settings", { ...state.settings, losses: { ...state.settings.losses, ql } })}
                />
                <Num
                  label="Absorb Qa"
                  value={state.settings.losses.qa}
                  min={1}
                  onChange={(qa) => set("settings", { ...state.settings, losses: { ...state.settings.losses, qa } })}
                />
                <Num
                  label="Port Qp"
                  value={state.settings.losses.qp}
                  min={1}
                  onChange={(qp) => set("settings", { ...state.settings, losses: { ...state.settings.losses, qp } })}
                />
                <Select<"off" | "on">
                  label="Port compression"
                  value={state.settings.portCompression ? "on" : "off"}
                  options={[
                    { value: "off", text: "Off (like WinISD)" },
                    { value: "on", text: "On (approximate, at this power)" },
                  ]}
                  onChange={(x) => set("settings", { ...state.settings, portCompression: x === "on" })}
                />
                <Select<"peak" | "rms">
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
            </Card>
          </div>
        )}
      </aside>

      <main className="charts">
        {welcome.linkNote && <LinkNote onDismiss={welcome.dismissLinkNote} onTips={welcome.showTips} />}
        {welcome.tips && <GettingStarted onDismiss={welcome.dismissTips} />}
        <Summary designs={designs} state={state} missing={solved.missing.length > 0} />

        {designs.length > 0 && (
          <CrosshairProvider>
            <LogChart
              forum
              title={`${splMode === "relative" ? "Relative response" : "SPL"} at ${driveLabel(state)}, 1 m, ${state.roomGain.mode === "car" ? "in the car (cabin gain added)" : state.roomGain.mode === "room" ? "in the room (room gain added)" : "half space"}${hp.on ? `, with ${hp.order * 6} dB/oct high-pass at ${hp.freq} Hz` : ""}`}
              unit="dB"
              freq={freq}
              actions={
                <div className="unit-switch" role="group" aria-label="SPL scale">
                  <button aria-pressed={splMode === "relative"} onClick={() => chooseSplMode("relative")} title="Each design's passband at 0 dB, with −3 and −6 dB lines">
                    Relative
                  </button>
                  <button aria-pressed={splMode === "absolute"} onClick={() => chooseSplMode("absolute")} title="Sound pressure level in dB SPL">
                    dB SPL
                  </button>
                </div>
              }
              {...(splMode === "relative"
                ? {
                    series: designs.map((d) => {
                      const ref = d.result.summary.referenceSpl;
                      return {
                        label: d.design.name,
                        color: d.color,
                        y: d.result.spl.map((v) => v - ref),
                        notes: Array.from(d.result.spl, (v) => `${v.toFixed(1)} dB SPL`),
                      };
                    }),
                    limits: [
                      { value: -3, label: "−3 dB", color: "var(--muted)" },
                      { value: -6, label: "−6 dB", color: "var(--muted)" },
                    ],
                    limitStyle: "guide" as const,
                    yStep: 6,
                    yMin: -30,
                    points: designs.flatMap((d) => {
                      const ref = d.result.summary.referenceSpl;
                      return minus3Points(d.result.freq, d.result.spl.map((v) => v - ref), d.design.kind === "bandpass").map((f) => ({
                        f,
                        y: -3,
                        color: d.color,
                        label: `F3 ${f < 100 ? f.toFixed(1) : f.toFixed(0)}`,
                      }));
                    }),
                  }
                : { series: series((r) => r.spl) })}
            />
            <LogChart
              forum
              title="Cone excursion (peak, one way)"
              unit="mm"
              freq={freq}
              series={series((r) => r.excursionMm).map((x) => ({ ...x, over: state.xmax_mm }))}
              limits={[{ value: state.xmax_mm, label: `Xmax ${state.xmax_mm} mm`, color: LIMIT_RED }]}
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
                    label: d.design.kind === "bandpass" ? `${d.design.name} (front port)` : d.design.name,
                    color: d.color,
                    y: d.result.portVelocity,
                    over: PORT_LIMIT,
                  })),
                  ...designs.map((d) => ({
                    label: `${d.design.name} (rear port)`,
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
                label: d.design.name,
                color: d.color,
                y: d.result.maxSpl,
                notes: d.result.limitedBy.map((l) => LIMIT_KINDS[l]?.short ?? ""),
              }))}
              ribbons={designs.map((d) => ({ label: d.design.name, color: d.color, kinds: d.result.limitedBy }))}
              ribbonKinds={LIMIT_KINDS}
            />
            <LogChart
              hidden={chartTab !== "impedance"}
              title="Impedance"
              unit="Ω"
              freq={freq}
              series={[
                ...series((r) => r.impedanceOhm),
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
        )}

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
          {designs.map(({ design: d, color, vb_l, result: r }) => {
            const x = peak(r.excursionMm, r.freq, fMin);
            const xpr = prPeak(r, fMin);
            const vpFront = peak(r.portVelocity, r.freq, fMin);
            const vpRear = peak(r.rearPortVelocity, r.freq, fMin);
            const vp = vpFront === null ? vpRear : Math.max(vpFront, vpRear ?? 0);
            return (
              <tr key={d.id}>
                <th>
                  <span className="swatch" style={{ background: color }} aria-hidden="true" />
                  <span title={d.name}>{shortName(d.name)}</span>
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
                <td className={x !== null && x > state.xmax_mm ? "over" : ""}>{fmt(x)} mm</td>
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
