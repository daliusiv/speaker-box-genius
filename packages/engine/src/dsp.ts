/**
 * The app's high-pass filter and EQ as digital biquads, for DSPs and PC equalisers.
 *
 * Each filter is an analog section (filters.ts), turned digital with the bilinear transform,
 * prewarped at the section's own frequency so that frequency lands exactly. Below about a tenth
 * of the sample rate the digital response matches the analog one to a few hundredths of a dB
 * (dsp.test.ts), which covers everything a bass filter does.
 */
import { highPassPrototype, type EqStage, type HighPass } from "./filters.ts";

/** An analog section (b2·s² + b1·s + b0) / (a2·s² + a1·s + a0), s in rad/s, prewarped at fWarp. */
export interface AnalogSection {
  b: [number, number, number];
  a: [number, number, number];
  fWarp: number;
}

/** A digital section, normalised so a0 = 1: H(z) = (b0 + b1·z⁻¹ + b2·z⁻²) / (1 + a1·z⁻¹ + a2·z⁻²). */
export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
  /** 1 for a first-order section (b2 = a2 = 0), else 2. */
  order: 1 | 2;
  /** What it is, for the file's comments ("High-pass 1/2", "Peak 45 Hz −3 dB Q 2"). */
  label: string;
}

/** The high-pass filter as analog sections (each a Butterworth prototype section moved to fc). */
export function highPassSections(hp: HighPass): AnalogSection[] {
  const proto = highPassPrototype(hp);
  const wc = 2 * Math.PI * hp.freq;
  // Low-pass prototype c0 + c1·p + c2·p² with p = ωc/s, as a high-pass in s:
  // second order s²/(c0·s² + c1·ωc·s + c2·ωc²); first order s/(c0·s + c1·ωc).
  return proto.map((c) =>
    c.length === 3
      ? { b: [1, 0, 0], a: [c[0]!, c[1]! * wc, c[2]! * wc * wc], fWarp: hp.freq }
      : { b: [0, 1, 0], a: [0, c[0]!, c[1]! * wc], fWarp: hp.freq },
  );
}

/** An EQ stage as an analog section (the same shapes eqStageResponse draws). */
export function eqSection(st: EqStage): AnalogSection {
  switch (st.type) {
    case "linkwitz": {
      const w0 = 2 * Math.PI * st.f0;
      const wp = 2 * Math.PI * st.fp;
      return { b: [1, w0 / st.q0, w0 * w0], a: [1, wp / st.qp, wp * wp], fWarp: Math.sqrt(st.f0 * st.fp) };
    }
    case "peak": {
      const w0 = 2 * Math.PI * st.freq;
      const A = 10 ** (st.gain_db / 40);
      return { b: [1, (A / st.q) * w0, w0 * w0], a: [1, w0 / (A * st.q), w0 * w0], fWarp: st.freq };
    }
    case "lowshelf": {
      const w0 = 2 * Math.PI * st.freq;
      const A = 10 ** (st.gain_db / 40);
      const k = (Math.sqrt(A) / st.q) * w0;
      return { b: [A, A * k, A * A * w0 * w0], a: [A, k, w0 * w0], fWarp: st.freq };
    }
    case "highshelf": {
      const w0 = 2 * Math.PI * st.freq;
      const A = 10 ** (st.gain_db / 40);
      const k = (Math.sqrt(A) / st.q) * w0;
      return { b: [A * A, A * k, A * w0 * w0], a: [1, k, A * w0 * w0], fWarp: st.freq };
    }
  }
}

/** Bilinear transform of one analog section at sample rate fs, prewarped at its fWarp. */
export function bilinear(sec: AnalogSection, fs: number, label: string): Biquad {
  if (!(sec.fWarp > 0 && sec.fWarp < fs / 2)) throw new RangeError(`${label}: ${sec.fWarp} Hz isn't below half the sample rate`);
  const ww = 2 * Math.PI * sec.fWarp;
  const K = ww / Math.tan(ww / (2 * fs));
  const [b2, b1, b0] = sec.b;
  const [a2, a1, a0] = sec.a;
  if (b2 === 0 && a2 === 0) {
    // First order: (b1·s + b0)/(a1·s + a0) with s = K(1 − z⁻¹)/(1 + z⁻¹).
    const A0 = a1 * K + a0;
    return { b0: (b1 * K + b0) / A0, b1: (b0 - b1 * K) / A0, b2: 0, a1: (a0 - a1 * K) / A0, a2: 0, order: 1, label };
  }
  const K2 = K * K;
  const A0 = a2 * K2 + a1 * K + a0;
  return {
    b0: (b2 * K2 + b1 * K + b0) / A0,
    b1: (2 * (b0 - b2 * K2)) / A0,
    b2: (b2 * K2 - b1 * K + b0) / A0,
    a1: (2 * (a0 - a2 * K2)) / A0,
    a2: (a2 * K2 - a1 * K + a0) / A0,
    order: 2,
    label,
  };
}

const fmt = (x: number) => Number(x.toPrecision(4)).toString();

/** A stage's label for the file. */
export function eqLabel(st: EqStage): string {
  switch (st.type) {
    case "linkwitz":
      return `Linkwitz transform ${fmt(st.f0)} Hz Q ${fmt(st.q0)} to ${fmt(st.fp)} Hz Q ${fmt(st.qp)}`;
    case "peak":
      return `Peak ${fmt(st.freq)} Hz ${st.gain_db >= 0 ? "+" : ""}${fmt(st.gain_db)} dB Q ${fmt(st.q)}`;
    case "lowshelf":
      return `Low shelf ${fmt(st.freq)} Hz ${st.gain_db >= 0 ? "+" : ""}${fmt(st.gain_db)} dB Q ${fmt(st.q)}`;
    case "highshelf":
      return `High shelf ${fmt(st.freq)} Hz ${st.gain_db >= 0 ? "+" : ""}${fmt(st.gain_db)} dB Q ${fmt(st.q)}`;
  }
}

/** The high-pass (if any) and EQ stages as digital sections, in order. */
export function dspBiquads(hp: HighPass | null, eq: EqStage[], fs: number): Biquad[] {
  const out: Biquad[] = [];
  if (hp) {
    const name = `${hp.type === "butterworth" ? "Butterworth" : "Linkwitz-Riley"} high-pass ${hp.order * 6} dB/oct ${fmt(hp.freq)} Hz`;
    const secs = highPassSections(hp);
    secs.forEach((s, i) => out.push(bilinear(s, fs, secs.length > 1 ? `${name} (${i + 1}/${secs.length})` : name)));
  }
  for (const st of eq) out.push(bilinear(eqSection(st), fs, eqLabel(st)));
  return out;
}

/** |H| in dB of digital sections at frequency f (sample rate fs). */
export function biquadsDb(bq: Biquad[], f: number, fs: number): number {
  const w = (2 * Math.PI * f) / fs;
  let db = 0;
  for (const q of bq) {
    // H(e^jw): numerator and denominator in z⁻¹ = e^(−jw).
    const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = q.b0 + q.b1 * c1 + q.b2 * c2, ni = -(q.b1 * s1 + q.b2 * s2);
    const dr = 1 + q.a1 * c1 + q.a2 * c2, di = -(q.a1 * s1 + q.a2 * s2);
    db += 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  return db;
}

/** The largest boost of the sections from 10 Hz to 20 kHz (or to just below fs/2), in dB: a preamp cut to avoid clipping. */
export function maxBoostDb(bq: Biquad[], fs: number): number {
  let max = -Infinity;
  const top = Math.min(20000, fs * 0.49);
  for (let i = 0; i <= 600; i++) max = Math.max(max, biquadsDb(bq, 10 * (top / 10) ** (i / 600), fs));
  return max;
}

/** A coefficient to 15 significant figures, plain decimal (no exponent, no trailing zeros), for parsers that want that. */
export function num(x: number): string {
  if (x === 0) return "0";
  let t = x.toPrecision(15);
  if (t.includes("e")) t = x.toFixed(Math.min(100, 15 - Math.floor(Math.log10(Math.abs(x)))));
  return t.includes(".") ? t.replace(/0+$/, "").replace(/\.$/, "") : t;
}

/** Equalizer APO config: a preamp to keep boosts from clipping, then one IIR line per section. */
export function equalizerApo(bq: Biquad[], fs: number, title: string): string {
  const boost = maxBoostDb(bq, fs);
  const lines = [
    `# ${title}`,
    `# Speaker Box Genius filters as biquads for a ${fs} Hz sample rate (Equalizer APO).`,
    `# Use this sample rate in Windows' sound settings, or export again for yours.`,
    `Preamp: ${boost > 0 ? (-Math.ceil(boost * 10) / 10).toFixed(1) : "0"} dB`,
  ];
  for (const q of bq) {
    lines.push(`# ${q.label}`);
    // First-order sections too, as order 2 with b2 = a2 = 0, which every version reads.
    lines.push(`Filter: ON IIR Order 2 Coefficients ${num(q.b0)} ${num(q.b1)} ${num(q.b2)} 1 ${num(q.a1)} ${num(q.a2)}`);
  }
  return lines.join("\r\n") + "\r\n";
}

/** CamillaDSP config fragment: Free biquads and a Filter step on the chosen channels, after a gain to keep boosts from clipping. */
export function camillaDsp(bq: Biquad[], fs: number, title: string, channels = [0, 1]): string {
  const boost = maxBoostDb(bq, fs);
  const names: string[] = [];
  const lines = [`# ${title}`, `# Speaker Box Genius filters as biquads for samplerate ${fs} (CamillaDSP 3). Add to your config.`, "# CamillaDSP 2: replace \"channels: [...]\" with one Filter step per channel, each with \"channel: N\".", "filters:"];
  if (boost > 0) {
    names.push("sbg_preamp");
    lines.push("  sbg_preamp:", "    type: Gain", "    parameters:", `      gain: ${(-Math.ceil(boost * 10) / 10).toFixed(1)}`);
  }
  bq.forEach((q, i) => {
    const name = `sbg_${i + 1}`;
    names.push(name);
    lines.push(
      `  ${name}:`,
      `    description: "${q.label}"`,
      "    type: Biquad",
      "    parameters:",
      "      type: Free",
      `      a1: ${num(q.a1)}`,
      `      a2: ${num(q.a2)}`,
      `      b0: ${num(q.b0)}`,
      `      b1: ${num(q.b1)}`,
      `      b2: ${num(q.b2)}`,
    );
  });
  lines.push("pipeline:", "  - type: Filter", `    channels: [${channels.join(", ")}]`, "    names:", ...names.map((n) => `      - ${n}`));
  return lines.join("\n") + "\n";
}

/** miniDSP "advanced" biquads (a1 and a2 sign-inverted, as miniDSP's plug-ins want), padded with pass-through ones to `slots`. */
export function miniDsp(bq: Biquad[], slots = 0): string {
  const out: string[] = [];
  const all = [...bq.map((q) => ({ b0: q.b0, b1: q.b1, b2: q.b2, a1: -q.a1, a2: -q.a2 }))];
  while (all.length < slots) all.push({ b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 });
  all.forEach((q, i) => {
    out.push(`biquad${i + 1},`, `b0=${num(q.b0)},`, `b1=${num(q.b1)},`, `b2=${num(q.b2)},`, `a1=${num(q.a1)},`, `a2=${num(q.a2)}${i < all.length - 1 ? "," : ""}`);
  });
  return out.join("\n") + "\n";
}

/** Plain CSV of the sections (a0 = 1), for anything else. */
export function biquadCsv(bq: Biquad[], fs: number): string {
  return [`# sample rate ${fs} Hz; H(z) = (b0 + b1 z^-1 + b2 z^-2) / (1 + a1 z^-1 + a2 z^-2)`, "filter,b0,b1,b2,a1,a2", ...bq.map((q) => `"${q.label}",${num(q.b0)},${num(q.b1)},${num(q.b2)},${num(q.a1)},${num(q.a2)}`)].join("\n") + "\n";
}
