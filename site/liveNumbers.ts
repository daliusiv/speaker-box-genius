/**
 * Numbers and curve colours in a guide's text, worked out by the engine at site build from the
 * guide's example (site/examples.ts), so the text can't drift from the app:
 *
 *   {{num:car-example/1/f3}}        design 1's F3 (box), "42.5"
 *   {{num:car-example/2/spl@30}}    design 2's level at 30 Hz, "119.6"
 *   {{num:car-example/1/x:0}}       ":digits" overrides the rounding
 *   {{color:car-example/2}}         design 2's curve colour in words, "orange"
 *
 * Designs are numbered from 1 in the example's order (the comparison driver's runs are left out).
 * Metrics: f3, f3car (the F3 with cabin or room gain), fb, spl@F, max@F (max SPL), limit@F (what
 * sets max SPL there), x and xf (peak cone excursion 10–200 Hz and where), port (peak port air
 * speed), len (port length, cm), hump and humpf (the response's peak above its 80 Hz level, 15–200 Hz,
 * and where), xmaxW (the power at which the cone first reaches Xmax, to 10 W).
 */
import { EXAMPLES } from "./examples.ts";
import { colorOf, runDesigns, solveDriver, type Design } from "../packages/web/src/sim.ts";
import { KIND_COLORS, KIND_COLOR_NAMES } from "../packages/web/src/palette.ts";
import { valueAt } from "../packages/web/src/chartProps.ts";
import type { AppState } from "../packages/web/src/state.ts";

/** What sets the max SPL, as the guides word it. */
const LIMIT_WORDS: Record<string, string> = { xmax: "Xmax", "pr-xmax": "PR Xmax", port: "port speed", thermal: "power", amp: "amplifier", air: "air distortion" };

const runs = new Map<string, { state: AppState; designs: Design[] }>();
function run(name: string, file: string) {
  let r = runs.get(name);
  if (!r) {
    const make = EXAMPLES[name];
    if (!make) throw new Error(`${file}: no example called "${name}" (see site/examples.ts)`);
    const state = make();
    r = { state, designs: runDesigns(state, solveDriver(state)).filter((d) => !d.compare) };
    runs.set(name, r);
  }
  return r;
}

const peak = (f: Float64Array, y: ArrayLike<number>, lo: number, hi: number) => {
  let m = -Infinity;
  let mf = NaN;
  f.forEach((q, i) => {
    if (q >= lo && q <= hi && y[i]! > m) {
      m = y[i]!;
      mf = q;
    }
  });
  return [m, mf] as const;
};
const hz = (f: number) => (f < 100 ? 1 : 0);

/** One value and its default number of decimals. */
function metric(r: { state: AppState; designs: Design[] }, d: Design, name: string, arg: number | undefined): [number | string, number] {
  const { freq, spl, maxSpl, excursionMm, portVelocity, summary, limitedBy } = d.result;
  const need = () => {
    if (arg === undefined || !Number.isFinite(arg)) throw new Error(`"${name}" needs a frequency: ${name}@30`);
    return arg;
  };
  switch (name) {
    case "f3":
      return [summary.f3 ?? NaN, hz(summary.f3 ?? 0)];
    case "f3car":
      if (d.f3Room === undefined || d.f3Room === null) throw new Error("no F3 with cabin or room gain (is it switched on?)");
      return [d.f3Room, hz(d.f3Room)];
    case "fb":
      return [summary.fb ?? NaN, hz(summary.fb ?? 0)];
    case "spl":
      return [valueAt(freq, spl, need()), 1];
    case "max":
      return [valueAt(freq, maxSpl, need()), 1];
    case "limit": {
      const f = need();
      let i = 0;
      for (let j = 1; j < freq.length; j++) if (Math.abs(Math.log(freq[j]! / f)) < Math.abs(Math.log(freq[i]! / f))) i = j;
      return [LIMIT_WORDS[limitedBy[i]!] ?? limitedBy[i]!, 0];
    }
    case "x":
      return [peak(freq, excursionMm, 10, 200)[0], 1];
    case "xf":
      return [peak(freq, excursionMm, 10, 200)[1], 0];
    case "port":
      if (!portVelocity) throw new Error("this design has no port");
      return [peak(freq, portVelocity, 10, 200)[0], 1];
    case "len": {
      const len = (d.design as { length_cm?: number }).length_cm;
      if (len === undefined) throw new Error("this design has no port length");
      return [len, 1];
    }
    case "hump":
      return [peak(freq, spl, 15, 200)[0] - valueAt(freq, spl, 80), 1];
    case "humpf":
      return [peak(freq, spl, 15, 200)[1], 0];
    case "xmaxW": {
      if (r.state.drive !== "watts") throw new Error("xmaxW needs the drive in watts");
      const w = r.state.power * (r.state.xmax_mm / peak(freq, excursionMm, 10, 200)[0]) ** 2;
      return [Math.round(w / 10) * 10, 0];
    }
    default:
      throw new Error(`unknown metric "${name}"`);
  }
}

/** Fills a guide's {{num:…}} and {{color:…}} placeholders; throws (naming the file) on a bad one. */
export function fillLive(body: string, file = "page"): string {
  return body
    .replace(/\{\{num:([\w-]+)\/(\d+)\/(\w+)(?:@([\d.]+))?(?::(\d))?\}\}/g, (all, ex: string, n: string, name: string, at?: string, digits?: string) => {
      const r = run(ex, file);
      const d = r.designs[Number(n) - 1];
      if (!d) throw new Error(`${file}: ${all}: "${ex}" has ${r.designs.length} designs`);
      try {
        const [v, dflt] = metric(r, d, name, at === undefined ? undefined : Number(at));
        if (typeof v === "string") return v;
        if (!Number.isFinite(v)) throw new Error("no value");
        return v.toFixed(digits === undefined ? dflt : Number(digits));
      } catch (e) {
        throw new Error(`${file}: ${all}: ${(e as Error).message}`);
      }
    })
    .replace(/\{\{color:([\w-]+)\/(\d+)\}\}/g, (all, ex: string, n: string) => {
      const r = run(ex, file);
      const d = r.designs[Number(n) - 1];
      if (!d) throw new Error(`${file}: ${all}: "${ex}" has ${r.designs.length} designs`);
      const kind = d.design.kind;
      const shade = KIND_COLORS[kind].indexOf(colorOf(r.state, d.design.id));
      return KIND_COLOR_NAMES[kind][shade] ?? KIND_COLOR_NAMES[kind][0]!;
    });
}
