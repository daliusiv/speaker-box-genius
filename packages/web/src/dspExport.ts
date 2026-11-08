import { biquadCsv, camillaDsp, dspBiquads, equalizerApo, miniDsp, type EqStage, type HighPass } from "@sbg/engine";
import type { AppState } from "./state.ts";

export type DspFormat = "apo" | "camilla" | "minidsp" | "csv";

export const DSP_FORMATS: { value: DspFormat; text: string; ext: string; help: string }[] = [
  { value: "apo", text: "Equalizer APO (Windows)", ext: "txt", help: "Save it in Equalizer APO's config folder and Include it from config.txt (or paste the lines in)." },
  { value: "camilla", text: "CamillaDSP 3", ext: "yml", help: "Merge the filters and the pipeline step into your CamillaDSP config. Written for CamillaDSP 3: for version 2, change the step's \"channels: [0, 1]\" to one step per channel with \"channel: 0\" and \"channel: 1\"." },
  { value: "minidsp", text: "miniDSP (advanced biquads)", ext: "txt", help: "Paste into a PEQ block's Advanced mode, or Import it. a1 and a2 are written with their signs inverted, as miniDSP's plug-ins expect. If your plug-in wants every biquad in the block filled, add pass-through ones (b0=1, the rest 0). Use your processor's sample rate (48, 96 or 192 kHz)." },
  { value: "csv", text: "Coefficients (CSV)", ext: "csv", help: "b0, b1, b2, a1, a2 per section (a0 = 1), for any other DSP." },
];

export const DSP_RATES = [44100, 48000, 96000, 192000];

/** The filters the app applies to one design: the high-pass (when on) and the EQ that's on and aimed at it or at all designs. */
export function dspFiltersFor(s: AppState, designId: string): { hp: HighPass | null; eq: EqStage[] } {
  const hp = s.highPass.on ? { type: s.highPass.type, order: s.highPass.order, freq: s.highPass.freq } : null;
  const eq = s.eq
    .filter((e) => e.on && (e.target === "all" || e.target === designId))
    .map(({ id: _id, on: _on, target: _t, ...stage }) => stage as EqStage);
  return { hp, eq };
}

/** The file for one design, or why there isn't one. */
export function dspFileFor(s: AppState, designId: string, format: DspFormat, fs: number): { text: string; name: string } | string {
  const d = s.designs.find((x) => x.id === designId);
  if (!d) return "No such design";
  const { hp, eq } = dspFiltersFor(s, designId);
  if (!hp && eq.length === 0) return "No high-pass or EQ is on for this design";
  let bq;
  try {
    bq = dspBiquads(hp, eq, fs);
  } catch (e) {
    return (e as Error).message;
  }
  const title = `${s.driverName || "Speaker"}: ${d.name}`;
  const text =
    format === "apo" ? equalizerApo(bq, fs, title) : format === "camilla" ? camillaDsp(bq, fs, title) : format === "minidsp" ? miniDsp(bq) : biquadCsv(bq, fs);
  const ext = DSP_FORMATS.find((f) => f.value === format)!.ext;
  const base = `${s.driverName} ${d.name} ${format === "csv" ? "biquads" : format === "apo" ? "EqualizerAPO" : format === "camilla" ? "CamillaDSP" : "miniDSP"} ${fs / 1000}k`;
  return { text, name: `${base.replace(/[^\w.-]+/g, " ").trim()}.${ext}` };
}
