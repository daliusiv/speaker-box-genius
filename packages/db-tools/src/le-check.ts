/**
 * Compare voice-coil models on real impedance measurements: for each .zma file
 * given, fit the plain-Le model (around the resonance, like WinISD) and the L2R2
 * model (whole sweep), and report how far each strays from the measurement.
 *
 *   node … le-check.ts file1.zma file2.zma …
 *
 * Used to check the L2R2 model against Dayton Audio's published measurements;
 * the files themselves aren't kept in the repo.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fitImpedance, impedanceFitError, parseImpedance } from "../../engine/src/impedance.ts";

const bands: [string, number, number][] = [
  ["fs/2–200 Hz", 0, 200],
  ["200 Hz–1 kHz", 200, 1000],
  ["1–5 kHz", 1000, 5000],
  ["5–20 kHz", 5000, 20000],
];
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const rows: string[] = [];
rows.push(`| File | Model | ${bands.map((b) => b[0]).join(" | ")} | Le / L2 / R2 |`);
rows.push(`|---|---|${bands.map(() => "---").join("|")}|---|`);
for (const file of process.argv.slice(2)) {
  let d;
  try {
    d = parseImpedance(readFileSync(file, "latin1"));
  } catch (e) {
    rows.push(`| ${basename(file)} | unreadable: ${(e as Error).message} |`);
    continue;
  }
  const plain = fitImpedance(d);
  const lr2 = fitImpedance(d, undefined, { inductance: "lr2" });
  const held = fitImpedance(d, undefined, { inductance: "lr2", holdTs: true });
  const top = d.freq[d.freq.length - 1]!;
  for (const [name, p] of [["Le", plain], ["L2R2", lr2], ["L2R2 held", held]] as const) {
    const errs = bands.map(([, lo, hi]) => {
      const a = Math.max(lo || plain.fs / 2, d.freq[0]!);
      const b = Math.min(hi, top);
      return b > a * 1.2 ? pct(impedanceFitError(d, p, a, b)) : "–";
    });
    const ind = name === "Le" ? `${p.le_mh.toFixed(2)} mH` : `${p.le_mh.toFixed(2)} mH / ${p.l2_mh!.toFixed(2)} mH / ${p.r2_ohm!.toFixed(2)} Ω`;
    const ts = `fs ${p.fs.toFixed(1)} Qms ${p.qms.toFixed(2)} Qes ${p.qes.toFixed(3)}`;
    rows.push(`| ${name === "Le" ? basename(file) : ""} | ${name} | ${errs.join(" | ")} | ${ind}; ${ts} |`);
  }
}
console.log(rows.join("\n"));
