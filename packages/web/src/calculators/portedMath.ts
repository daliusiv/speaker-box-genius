/**
 * The ported box calculator's maths (/calculators/ported-box/), without the page: the vented
 * alignments that suit a driver (as the app's preset chips offer them), the box one of them or
 * your own numbers makes, the port that fits it (as "Size all boxes" picks it), and what the
 * simulator says about that box at the power given. The page's script (portedBox.ts) and the
 * site's worked example (site/calculators.ts) both use it, so they can't disagree.
 */
import type { ShapedAlignment } from "@sbg/engine";
import { alignmentHelp, bestVentedPort, flatPresetHelp, moreVentedFor, ventedAlignmentFor, withPreset } from "../presets.ts";
import { alignmentDriver, limitsOf, PORT_LIMIT, runDesigns, solveDriver, type Design } from "../sim.ts";
import { portSpeedFor } from "../ports.ts";
import { newDesign, type AppState, type VentedDesign } from "../state.ts";
import { driverQuery } from "./driverInput.ts";
import type { QuerySpec } from "./query.ts";

/** The alignment families the chips can name (the link's `a`, besides "other"). */
export const ALIGN_KEYS = ["qb3", "sc4", "c4", "sbb4", "bb4", "other"] as const;
export type AlignKey = (typeof ALIGN_KEYS)[number];

/** One alignment chip: the box and tuning it gives, with the app's tooltip for it. */
export interface AlignChip {
  value: AlignKey;
  label: string;
  vb_l: number;
  fb: number;
  /** Ripple or peak above the roll-off, dB (0 when flat). */
  db: number;
  shape: "flat" | "ripple" | "peak";
  help: string;
}

/**
 * The inputs kept in the page address (see query.ts): `a` is the alignment (qb3, c4, bb4 … or
 * other, which uses `vb` and `fb`), `nd` the number of drivers; the driver's keys are
 * driverInput.ts's.
 */
export const PORTED_QUERY: QuerySpec = {
  u: { id: "vc-imperial", kind: "check", on: "in" },
  ...driverQuery("vc"),
  nd: { id: "vc-n", kind: "int" },
  a: { id: "vc-align", kind: "choice", choices: ALIGN_KEYS },
  vb: { id: "vc-vb", kind: "num" },
  fb: { id: "vc-fb", kind: "num" },
};


const r1 = (v: number) => Math.round(v * 10) / 10;

const keyOf = (name: string): AlignKey | null => {
  const k = name.toLowerCase();
  return (ALIGN_KEYS as readonly string[]).includes(k) && k !== "other" ? (k as AlignKey) : null;
};

/**
 * The alignments the app's Ported card offers this driver: the flat vented preset first (QB3,
 * WinISD's wizard style unless Settings say textbook), then C4 and BB4 (or their flat "sub"
 * versions) as WinISD sizes them. Empty while the T/S is incomplete or Qts is too high for any.
 * Volumes and tunings are rounded to 0.1 as the app applies them.
 */
export function alignmentChips(s: AppState): AlignChip[] {
  const a = alignmentDriver(solveDriver(s), s);
  if (!a) return [];
  const flat = ventedAlignmentFor(a, s.drivers);
  const all: { name: string; vb_l: number; fb: number; shape: AlignChip["shape"]; db: number; help: string }[] = [];
  if (flat) all.push({ name: flat.name, vb_l: flat.vb_l, fb: flat.fb, shape: "flat", db: 0, help: `${flatPresetHelp(a, false)}. ${flat.vb_l.toFixed(1)} L tuned to ${flat.fb.toFixed(1)} Hz.` });
  for (const m of moreVentedFor(a, s.drivers)) all.push({ name: m.name, vb_l: m.vb_l, fb: m.fb, shape: m.shape, db: m.db, help: alignmentHelp(m as ShapedAlignment) });
  const out: AlignChip[] = [];
  for (const x of all) {
    const value = keyOf(x.name);
    // Textbook presets (Settings) may name families the link doesn't carry (Keele, B4): the first is QB3's place.
    const v = value ?? (out.length === 0 ? "qb3" : null);
    if (!v || out.some((c) => c.value === v)) continue;
    out.push({ value: v, label: x.name, vb_l: r1(x.vb_l), fb: r1(x.fb), db: x.db, shape: x.shape, help: x.help });
  }
  return out;
}

/** What the simulator says about one ported box at the power set. */
export interface PortedResult {
  vb_l: number;
  fb: number;
  /** The design the app is given: the box with its port. */
  design: VentedDesign;
  /** Whether the port stays under the chuffing line at this power. */
  quiet: boolean;
  /** Peak port air speed (m/s, as the app counts it: flared ports judged at their throat), from 20 Hz up. */
  vp: number | null;
  /** Peak cone excursion (mm, one way) and the driver's Xmax (0 when unknown). */
  x: number | null;
  xmax_mm: number;
  f3: number | null;
  /** Output at 30 Hz (dB SPL at 1 m) at the power set. */
  spl30: number | null;
  run: Design;
}

/** The value of `y` at `f`, interpolated on a log-frequency axis (null outside the curve). */
export function atFrequency(freq: ArrayLike<number>, y: ArrayLike<number>, f: number): number | null {
  const n = freq.length;
  if (n < 2 || f < freq[0]! || f > freq[n - 1]!) return null;
  let i = 1;
  while (i < n - 1 && freq[i]! < f) i++;
  const f0 = freq[i - 1]!;
  const f1 = freq[i]!;
  const t = f1 > f0 ? Math.log(f / f0) / Math.log(f1 / f0) : 0;
  return y[i - 1]! + t * (y[i]! - y[i - 1]!);
}

/**
 * The box `vb_l` (net, acting) tuned to `fb`, with the port that fits it, simulated at the
 * state's drive. The port is picked for that drive, not the driver's rating (so a quiet small
 * port at 1 W, a larger one as the power rises): the state's rating is left out of the pick.
 * `name` and `preset` label the design (the alignment chip's name). Null if no simple port fits.
 */
export function portedBox(s: AppState, vb_l: number, fb: number, preset?: string): PortedResult | null {
  if (!(vb_l > 0 && fb > 0)) return null;
  const base = newDesign("vented", []) as VentedDesign;
  const pick = bestVentedPort({ ...s, pe_w: 0 }, base, vb_l, fb);
  if (!pick) return null;
  const design: VentedDesign = { ...base, ...(preset ? withPreset("Ported", preset) : { name: "Ported" }), vb_l, targetFb: fb, ...(pick.fields as Partial<VentedDesign>) };
  const state: AppState = { ...s, designs: [design] };
  const [run] = runDesigns(state, solveDriver(state));
  if (!run) return null;
  const lim = limitsOf(run.result, state.xmax_mm, false, PORT_LIMIT);
  const flared = design.shape === "round" && design.flare_cm > 0;
  const vp =
    lim.vp === null ? null : flared ? portSpeedFor({ kind: "flared", diameter_cm: design.diameter_cm, flare_cm: design.flare_cm, length_cm: design.length_cm, count: design.count }, lim.vp) : lim.vp;
  return {
    vb_l,
    fb,
    design,
    quiet: vp === null || vp <= PORT_LIMIT,
    vp,
    x: lim.x,
    xmax_mm: state.xmax_mm,
    f3: run.result.summary.f3 ?? null,
    spl30: atFrequency(run.result.freq, run.result.spl, 30),
    run,
  };
}

/** The port of a result as a sentence part with inches: "10 cm (3.9″) round port, 41.2 cm (16.2″) long". */
export function portWords(d: VentedDesign): string {
  const cm = (v: number) => `${v.toFixed(1).replace(/\.0$/, "")} cm (${(v / 2.54).toFixed(1)}″)`;
  const n = d.count > 1 ? `${d.count} × ` : "";
  const size = d.shape === "slot" ? `${cm(d.slotWidth_cm)} × ${cm(d.slotHeight_cm)} slot` : `${cm(d.diameter_cm)} ${d.flare_cm > 0 ? "flared " : ""}round port`;
  return `${n}${size}, ${cm(d.length_cm)} long${d.count > 1 ? " each" : ""}`;
}

/** The port-length page's link for this box (/calculators/port-length/?vb=…): keys vb, fb, d, p, and the port's s, dia, fl, w, h, n. */
export function fineTuneLink(r: PortedResult, driverId: string, power: number): string {
  const d = r.design;
  const q = new URLSearchParams();
  q.set("vb", String(Math.round(r.vb_l * 100) / 100));
  q.set("fb", String(r.fb));
  if (d.shape === "slot") {
    q.set("s", "slot");
    q.set("w", String(d.slotWidth_cm));
    q.set("h", String(d.slotHeight_cm));
  } else {
    q.set("dia", String(d.diameter_cm));
    if (d.flare_cm > 0) q.set("fl", String(d.flare_cm));
  }
  if (d.count > 1) q.set("n", String(d.count));
  if (driverId) q.set("d", driverId);
  if (power > 0) q.set("p", String(power));
  return `/calculators/port-length/?${q.toString().replace(/%2F/g, "/")}`;
}
