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
