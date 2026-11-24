import { useMemo } from "react";
import { programEquilibrium, sineEquilibrium } from "@sbg/engine";
import { LogChart, type Series } from "./LogChart.tsx";
import { GUIDE, LIMIT } from "./palette.ts";
import type { Design } from "./sim.ts";
import { Menu, Segmented } from "./ui/index.ts";

/** What the Power chart shows. */
export type PowerView = "eff" | "split" | "coil" | "comp";
export const POWER_VIEWS: readonly PowerView[] = ["eff", "split", "coil", "comp"];
export const POWER_VIEW_INFO: Record<PowerView, { label: string; name: string; unit: string; hint: string }> = {
  eff: { label: "Efficiency", name: "Efficiency", unit: "%", hint: "How much of the power into the drivers comes out as sound (%)" },
  split: { label: "Where it goes", name: "Where the power goes", unit: "Split", hint: "One box: the power into the drivers split into coil heat, other coil losses, suspension and box losses, and sound (% of it)" },
  coil: { label: "Coil °C", name: "Coil temperature", unit: "°C", hint: "Where the coil settles playing a steady note at each frequency at this drive" },
  comp: { label: "Compression", name: "Power compression", unit: "dB", hint: "Output lost to the hot coil at this drive, against a cold coil (dB), on the heating signal (pink noise)" },
};

/** Parts of the power split (one design), drawn in this order. */
const SPLIT = [
  { key: "coil", label: "Coil (heat)", color: "#ef4444" },
  { key: "eddy", label: "Other coil losses", color: "#f59e0b" },
  { key: "loss", label: "Suspension & box", color: "#8b5cf6" },
  { key: "sound", label: "Sound", color: "#10b981" },
] as const;

const fmtW = (w: number) => (!Number.isFinite(w) ? "–" : w >= 100 ? `${w.toFixed(0)} W` : w >= 1 ? `${w.toFixed(1)} W` : w >= 0.001 ? `${(w * 1000).toFixed(w >= 0.01 ? 0 : 1)} mW` : `${(w * 1e6).toFixed(0)} µW`);
const fmtPct = (p: number) => (!Number.isFinite(p) ? "–" : p >= 10 ? `${p.toFixed(0)} %` : p >= 1 ? `${p.toFixed(1)} %` : `${p.toFixed(2)} %`);
const minus = (s: string) => s.replace("-", "−");

/**
 * Power and heat: efficiency per box (with the driver's reference efficiency η0), where one box's
 * power goes, how hot the coil gets on a steady note at each frequency, and the output lost to a
 * hot coil on the heating signal. All at the drive set above (the hot coil's when Settings heats it).
 */
export function PowerChart(p: {
  designs: Design[];
  hidden: boolean;
  view: PowerView;
  onView: (v: PowerView) => void;
  /** The design shown in "Where it goes" (by id); the first box when it's gone. */
  pick: string | null;
  onPick: (id: string) => void;
  /** The driver's reference efficiency η0 (half space, fraction), or null when unknown. */
  eta0: number | null;
  heatBand: readonly [number, number];
  narrow: boolean;
}) {
  const withPower = p.designs.filter((d) => d.result.power && d.result.coilParts);
  const main = withPower.filter((d) => !d.compare);
  const chosen = main.find((d) => d.design.id === p.pick) ?? main[0] ?? null;
  const thermal = withPower.some((d) => d.result.coilParts!.thermal);
  const view: PowerView = !thermal && (p.view === "coil" || p.view === "comp") ? "eff" : p.view;
  const freq = withPower[0]?.result.freq ?? new Float64Array();
  // Thermal views solve the coil once per design and view.
  const heat = useMemo(() => {
    if (view !== "coil" && view !== "comp") return null;
    return withPower.map((d) => {
      const parts = d.result.coilParts!;
      if (!parts.thermal) return null;
      if (view === "coil") return { coil: sineEquilibrium(parts, parts.thermal), prog: null };
      return { coil: null, prog: programEquilibrium(parts, d.result.freq, parts.thermal, p.heatBand) };
    });
  }, [view, p.designs, p.heatBand]); // eslint-disable-line react-hooks/exhaustive-deps

  let series: Series[] = [];
  let limits: { value: number; label: string; color: string }[] = [];
  let unit = "%";
  let title = "";
  let detail = "";
  let yMin: number | undefined = 0;
  let yMax: number | undefined;
  let columns: string[] | undefined;
  let digits = 2;
  if (view === "eff") {
    title = "Efficiency (sound out ÷ power in)";
    detail = "at the drive set · sound power";
    series = withPower.map((d) => {
      const pw = d.result.power!;
      return {
        label: d.label,
        color: d.color,
        dash: d.dash,
        y: Float64Array.from(pw.efficiency, (e) => e * 100),
        notes: Array.from(pw.efficiency, (e, i) => `${fmtW(pw.inW[i]!)} in → ${fmtW(pw.acousticW[i]!)} sound (${minus((10 * Math.log10(e)).toFixed(1))} dB)`),
      };
    });
    if (p.eta0 !== null && p.eta0 > 0) limits = [{ value: p.eta0 * 100, label: `η0 ${fmtPct(p.eta0 * 100)} (reference)`, color: GUIDE }];
    digits = 2;
  } else if (view === "split") {
    title = `Where the power goes: ${chosen?.label ?? ""}`;
    detail = "% of the power into the drivers";
    yMax = 100;
    digits = 1;
    if (chosen) {
      const pw = chosen.result.power!;
      const parts = {
        coil: pw.coilW,
        eddy: pw.eddyW,
        loss: Float64Array.from(pw.mechW, (m, i) => m + pw.boxW[i]!),
        sound: pw.acousticW,
      };
      series = SPLIT.map((s) => ({
        label: s.label,
        color: s.color,
        noRank: true,
        y: Float64Array.from(parts[s.key], (w, i) => (pw.inW[i]! > 0 ? (100 * w) / pw.inW[i]! : NaN)),
        notes: Array.from(parts[s.key], (w, i) => `${fmtW(w)} of ${fmtW(pw.inW[i]!)}`),
      }));
    }
  } else if (view === "coil") {
    title = "Coil temperature on a steady note (at the drive set)";
    detail = "steady state · sine at each frequency";
    unit = "°C";
    digits = 0;
    yMin = undefined;
    const tmax = withPower.find((d) => d.result.coilParts!.thermal)?.result.coilParts!.thermal!.tmax_C;
    series = withPower.flatMap((d, k) => {
      const c = heat?.[k]?.coil;
      if (!c) return [];
      const parts = d.result.coilParts!;
      return [
        {
          label: d.label,
          color: d.color,
          dash: d.dash,
          y: Float64Array.from(c.tempC, (t, i) => (c.runaway[i] ? NaN : t)),
          over: parts.thermal!.tmax_C,
          notes: Array.from(c.tempC, (t, i) => (c.runaway[i] ? "can't settle" : `${fmtW(c.coilW[i]!)} into the coil, ${minus(c.compressionDb[i]!.toFixed(1))} dB`)),
        },
      ];
    });
    if (tmax) limits = [{ value: tmax, label: `Max ${tmax} °C`, color: LIMIT.xmax }];
  } else {
    title = `Power compression at the drive set (pink noise ${p.heatBand[0]}–${p.heatBand[1]} Hz)`;
    detail = "against a cold coil · same amplifier volts";
    unit = "dB";
    digits = 1;
    yMin = undefined;
    yMax = 0.5;
    columns = ["Coil"];
    series = withPower.flatMap((d, k) => {
      const e = heat?.[k]?.prog;
      if (!e) return [];
      const at = e.runaway ? "can't settle" : `${Math.round(e.tempC)} °C`;
      return [{ label: d.label, color: d.color, dash: d.dash, y: e.compressionDb, cols: [Array.from(e.compressionDb, () => at)] }];
    });
  }

  const actions = (
    <>
      {view === "split" && main.length > 1 && (
        <Menu
          label={chosen?.label ?? "Box"}
          ariaLabel="Box shown"
          variant="ghost"
          align="end"
          items={main.map((d) => ({ label: d.label, checked: d === chosen, onSelect: () => p.onPick(d.design.id) }))}
        />
      )}
      {p.narrow ? (
        <Menu
          label={POWER_VIEW_INFO[view].unit}
          ariaLabel={`Show: ${POWER_VIEW_INFO[view].name}`}
          variant="ghost"
          align="end"
          items={POWER_VIEWS.filter((v) => thermal || (v !== "coil" && v !== "comp")).map((v) => ({ label: POWER_VIEW_INFO[v].name, detail: POWER_VIEW_INFO[v].unit, checked: v === view, onSelect: () => p.onView(v) }))}
        />
      ) : (
        <Segmented<PowerView>
          label="Show"
          value={view}
          options={POWER_VIEWS.filter((v) => thermal || (v !== "coil" && v !== "comp")).map((v) => ({ value: v, label: POWER_VIEW_INFO[v].label, title: POWER_VIEW_INFO[v].hint }))}
          onChange={p.onView}
        />
      )}
    </>
  );

  return (
    <LogChart
      forum
      chartId="power"
      hidden={p.hidden}
      title={title}
      shortTitle={POWER_VIEW_INFO[view].name}
      detail={detail}
      unit={unit}
      digits={digits}
      freq={freq}
      series={series}
      limits={limits}
      yMin={yMin}
      yMax={yMax}
      columns={columns}
      best={view === "eff" ? "high" : view === "split" ? undefined : "low"}
      noteLabel={view === "eff" ? "Power" : view === "split" ? "Watts" : "Coil"}
      actions={actions}
      foot={
        !thermal ? (
          <p className="hint">Coil temperature and compression need the driver&rsquo;s Pe or thermal resistance (Driver → Large signal).</p>
        ) : undefined
      }
      info={
        <p>
          The power into the drivers (the amp + cable and any passive parts left out): the coil&rsquo;s resistance turns most of it into heat; the rest of the coil&rsquo;s losses
          come from its inductance; the suspensions (cones and passive radiators) and the box, ports and lines lose some; a fraction of a per cent is sound. η0 is the driver&rsquo;s
          reference efficiency from its T/S values. Coil temperatures are steady state (a long, loud passage), with one thermal resistance: from Pe, the power that holds the coil at
          its max temperature, unless you enter one on the driver card. Magnet heating, cooling from the cone&rsquo;s motion and Bl changes aren&rsquo;t modelled.
        </p>
      }
    />
  );
}
