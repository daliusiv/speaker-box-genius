import { coilLabel, driveLabel, prGroupLabels, type Design } from "../sim.ts";
import type { AppState } from "../state.ts";
import { safeName, type ExportFormat } from "./types.ts";

/** One line on how the designs are driven and filtered (the forum posts and the CSV header). */
export function subtitle(state: AppState): string {
  const parts = [driveLabel(state) + coilLabel(state)];
  if (state.isobaric) parts.push(`${state.drivers} isobaric pair${state.drivers > 1 ? "s" : ""}`);
  else if (state.drivers > 1) parts.push(`${state.drivers} drivers (${state.wiring})`);
  if (state.highPass.on) parts.push(`${state.highPass.order * 6} dB/oct high-pass at ${state.highPass.freq} Hz`);
  if (state.passive.on && state.passive.branches.some((b) => (b.r ?? 0) > 0 || (b.l_mH ?? 0) > 0 || (b.c_uF ?? 0) > 0)) parts.push("passive parts");
  if (state.roomGain.mode === "curve") parts.push(`room curve "${state.roomGain.curve?.name ?? ""}" added`);
  else if (state.roomGain.mode !== "off") parts.push(`${state.roomGain.mode === "car" ? "cabin" : "room"} gain from ${(34320 / (2 * state.roomGain.length_cm)).toFixed(0)} Hz`);
  parts.push(`Xmax ${state.xmax_mm} mm`);
  if (state.compare) parts.push(`compared with ${state.compare.driverName} (dashed)`);
  return parts.join(" · ");
}

/** Every curve of every design, one row per frequency. Opens in Excel / Sheets / LibreOffice. */
export function curvesCsv(state: AppState, designs: Design[]): string {
  if (designs.length === 0) return "";
  const vel = state.settings.velocity === "rms" ? "RMS" : "peak";
  const cols: { head: string; data: Float64Array }[] = [];
  for (const { design: d, label, result: r } of designs) {
    const add = (what: string, data: Float64Array | null) => data && cols.push({ head: `${label}: ${what}`, data });
    add("SPL (dB)", r.spl);
    add("Cone excursion (mm peak)", r.excursionMm);
    if (r.prGroups && (r.prGroups.length > 1 || d.kind === "bandpass")) {
      const names = prGroupLabels(d);
      r.prGroups.forEach((g, k) => add(`PR excursion, ${names[k] ?? `group ${k + 1}`} (mm peak)`, g.excursionMm));
    } else add("PR excursion (mm peak)", r.prExcursionMm);
    add(d.kind === "bandpass" ? `Front port velocity (m/s ${vel})` : `Port velocity (m/s ${vel})`, r.portVelocity);
    add(`Rear port velocity (m/s ${vel})`, r.rearPortVelocity);
    add("Impedance (ohm)", r.impedanceOhm);
    add("Impedance phase (deg)", r.impedancePhaseDeg);
    add("Group delay (ms)", r.groupDelayMs);
    add("Max SPL (dB)", r.maxSpl);
    add("Max drive power (W, before filter and EQ)", r.maxPowerW);
    add("Amp volts at max SPL (V RMS)", r.ampAtMax.volts);
    add("Amp current at max SPL (A RMS)", r.ampAtMax.amps);
    add("Amp power at max SPL (W)", r.ampAtMax.watts);
    if (r.airHd2) {
      add("Air distortion HD2 (%)", r.airHd2);
      add("Air distortion HD2 (dBc)", r.airHd2.map((v) => 20 * Math.log10(v / 100)));
      add("Air distortion HD2 at max SPL (%)", r.airHd2AtMax);
      if (r.airModel === "spring") add("Box air compression dV/Vb (%)", r.airCompression && r.airCompression.map((v) => v * 100));
    }
  }
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const freq = designs[0]!.result.freq;
  const lines = [
    `# ${state.driverName}, ${subtitle(state)}, 1 m half space, air: ${state.settings.air === "custom" ? `${state.settings.airConditions.temp_C} °C, ${state.settings.airConditions.humidity_pct} % RH, ${state.settings.airConditions.pressure_hPa} hPa` : state.settings.air}`,
    ["Frequency (Hz)", ...cols.map((c) => c.head)].map(q).join(","),
  ];
  for (let i = 0; i < freq.length; i++) {
    lines.push([freq[i]!.toFixed(3), ...cols.map((c) => (Number.isFinite(c.data[i]!) ? c.data[i]!.toPrecision(6) : ""))].join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export const csvFormat: ExportFormat = {
  id: "csv",
  group: "sim",
  label: "Spreadsheet",
  ext: ".csv",
  icon: "table",
  help: "Every curve of the chosen boxes, one row per frequency. Opens in Excel, Google Sheets or LibreOffice.",
  scope: "designs",
  run({ state, designs }, ids) {
    const picked = designs.filter((d) => ids.includes(d.design.id));
    const csv = curvesCsv(state, picked);
    if (!csv) return "Pick at least one box.";
    return { files: [{ name: `${safeName(state.driverName)}.csv`, data: csv, type: "text/csv" }] };
  },
};
