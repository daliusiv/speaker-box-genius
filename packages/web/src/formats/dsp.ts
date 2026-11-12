import { DSP_FORMATS, DSP_RATES, dspFileFor, dspFiltersFor, type DspFormat } from "../dspExport.ts";
import type { ExportFormat, OutFile } from "./types.ts";

export const dspFormat: ExportFormat = {
  id: "dsp",
  group: "dsp",
  label: "DSP filters",
  ext: "biquads",
  icon: "sliders",
  help: "The high-pass and EQ as biquads, one file per box. Not in it: passive parts, room gain and baffle step.",
  scope: "designs",
  supports: (d, s) => {
    const { hp, eq } = dspFiltersFor(s, d.id);
    return hp || eq.length > 0 ? true : "No high-pass or EQ on";
  },
  options: [
    { key: "format", label: "Format", kind: "select", choices: DSP_FORMATS.map((f) => ({ value: f.value, text: f.text })), help: (v) => DSP_FORMATS.find((f) => f.value === v)?.help ?? "" },
    { key: "fs", label: "Sample rate", kind: "select", choices: DSP_RATES.map((r) => ({ value: String(r), text: `${r / 1000} kHz` })), help: () => "Use your DSP's: the coefficients only fit the rate they were made for." },
  ],
  defaults: () => ({ format: "apo", fs: "48000" }),
  run({ state }, ids, o) {
    const files: OutFile[] = [];
    for (const id of ids) {
      const out = dspFileFor(state, id, (o.format ?? "apo") as DspFormat, Number(o.fs ?? 48000));
      if (typeof out === "string") return out;
      files.push({ name: out.name, data: out.text, type: "text/plain" });
    }
    return files.length ? { files } : "Pick at least one box.";
  },
};
