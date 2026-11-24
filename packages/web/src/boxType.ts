/**
 * Which box a driver suits, from its datasheet: the two rules of thumb builders use before
 * simulating. EBP (efficiency bandwidth product, Fs/Qes, from Small): under about 50 leans
 * sealed, over about 100 ported, either in between (Dickason, Loudspeaker Design Cookbook).
 * Qts: over about 0.6 sealed (no flat vented alignment exists), under about 0.4 ported (it
 * needs a big sealed box), either in between. Where the two disagree the answer is "either":
 * the simulation decides.
 */
export type BoxLean = "sealed" | "ported" | "either";

export function ebpOf(fs: number, qes: number): number {
  return fs / qes;
}

export function boxSuits(fs: number, qes: number, qms: number): { ebp: number; qts: number; byEbp: BoxLean; byQts: BoxLean; suits: BoxLean; text: string } | null {
  if (!(fs > 0 && qes > 0 && qms > 0)) return null;
  const ebp = ebpOf(fs, qes);
  const qts = (qes * qms) / (qes + qms);
  const byEbp: BoxLean = ebp < 50 ? "sealed" : ebp > 100 ? "ported" : "either";
  const byQts: BoxLean = qts > 0.6 ? "sealed" : qts < 0.4 ? "ported" : "either";
  const suits: BoxLean = byEbp === byQts ? byEbp : byEbp === "either" ? byQts : byQts === "either" ? byEbp : "either";
  const leans = byEbp !== byQts && suits !== "either";
  const text =
    suits === "either"
      ? "suits sealed or ported"
      : `${leans ? "leans" : "suits"} ${suits}${leans ? `, ${suits === "sealed" ? "ported" : "sealed"} can work too` : ""}`;
  return { ebp, qts, byEbp, byQts, suits, text };
}

/**
 * A driver's own level at `f` (dB against its passband) with nothing loading its back: a
 * second-order high-pass at Fs with Q = Qts, (f/Fs)² / √((1 − (f/Fs)²)² + (f/(Fs·Qts))²). On an
 * open baffle the dipole's loss comes on top of it, the same for every driver on that board.
 */
export function driverLevelDb(f: number, fs: number, qts: number): number {
  const x = f / fs;
  return 20 * Math.log10((x * x) / Math.sqrt((1 - x * x) ** 2 + (x / qts) ** 2));
}
/** Passive open baffle: the driver's own level at OB_PASSIVE_HZ must be at least OB_PASSIVE_DB. */
export const OB_PASSIVE_HZ = 40;
export const OB_PASSIVE_DB = -2;

/**
 * Open baffle (a dipole loses bass below its peak, 6 dB/oct). Passive: the driver's own bass
 * hump must fill some of it in where the bass is, so it's judged on Fs and Qts together: its own
 * level at 40 Hz −2 dB or better (Qts alone says little: Qts 0.70 with Fs 43 Hz is −3.8 dB there,
 * below a Qts 0.43, Fs 19.5 Hz DSP woofer's −2.7 dB). With DSP EQ (Boxes → Open baffle → Dipole EQ):
 * Qts ≥ 0.35, enough travel for the boost (Xmax ≥ 8 mm) and a low resonance (Fs ≤ 45 Hz).
 */
export const suitsOpenBaffle = (r: { qts?: number; fs?: number }) =>
  r.qts !== undefined && r.qts > 0 && r.fs !== undefined && r.fs > 0 && driverLevelDb(OB_PASSIVE_HZ, r.fs, r.qts) >= OB_PASSIVE_DB;
export const suitsOpenBaffleDsp = (r: { qts?: number; xmax_mm?: number; fs?: number }) =>
  (r.qts ?? 0) >= 0.35 && (r.xmax_mm ?? 0) >= 8 && r.fs !== undefined && r.fs <= 45;
