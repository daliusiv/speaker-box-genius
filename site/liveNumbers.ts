/**
 * Numbers and curve colours in a guide's text, worked out by the engine at site build from the
 * guide's example (site/examples.ts), so the text can't drift from the app:
 *
 *   {{num:car-example/1/f3}}        design 1's F3 (box), "42.5"
 *   {{num:car-example/2/spl@30}}    design 2's level at 30 Hz, "119.6"
 *   {{num:car-example/1/x:0}}       ":digits" overrides the rounding
 *   {{color:car-example/2}}         design 2's curve colour in words, "orange"
 *   {{color:coil-20+coil-120/2}}    the same on a chart of several examples (chart:coil-20+coil-120/…)
 *   {{fig:subs-difference/crossSealed:0}}  a value a figure works out (site/figures.ts)
 *
 * A value "at F" is interpolated to exactly F (log frequency), whatever the simulated frequency grid.
 *
 * Designs are numbered from 1 in the order the app runs them: each box, then (with a comparison
 * driver) each box again with the comparison driver, as the summary table lists them.
 * Metrics: f3, f6, f3car (the F3 with cabin or room gain), fb, fc and qtc (a sealed box's), spl@F,
 * max@F (max SPL), limit@F (what sets max SPL there), volts@F and amps@F (the amplifier's for max
 * SPL), x and xf (peak cone excursion 10–200 Hz and where), x@F (excursion at F), port (peak port
 * air speed), len (port length, cm), hump and humpf (the response's peak above its 80 Hz level,
 * 15–200 Hz, and where), ref (passband level), rise and risef (the response's peak above its passband,
 * 10–500 Hz, and where), xin (Xmax minus peak excursion), xmaxW (the power at which the cone first reaches Xmax, to 10 W), w@F (the
 * watts the box takes at F before its first limit), gd@F (group delay, ms), gdc@F (the same in cycles),
 * gdp and gdpf (peak group delay 15–200 Hz and where), prx (peak PR travel), x20 and prx20 (the same from 20 Hz up), fs (the driver's Fs), fsfb (Fs × Fb), zpp (a tuned box's two impedance peak
 * frequencies multiplied); vb (net volume, L); for lines linelen (cm), vol (L), portd (MLTL port, cm), and ripple and f3line
 * (as Compare types scores a line: no filter, peak-to-peak from 1.5 × F3 to 400 Hz); xr (peak excursion over Xmax), vset (the drive setting in
 * volts), vout@F (the amplifier's volts at F at that setting, after filters and EQ), pw@F (the real
 * watts into the speaker for max SPL), vw@F (the same as V²/Re, as amplifiers quote it), boost@F (a
 * Linkwitz Transform's low-frequency boost from the box's fc down to F, dB; boostx@F, the same as a
 * power ratio), v10@F (level at F with
 * 10 V in), zmin (lowest impedance 60–500 Hz), rel@F (level at F against the passband), zpk (a tuned
 * box's upper impedance peak, its tuning to 200 Hz; zpkf where), zlo and zlof (its lower peak, 10 Hz to
 * the tuning, and where).
 *
 *   {{diff:car-example/2/1/spl@30}}  design 2's value minus design 1's ("5.9")
 *   {{diff:a-example/1/b-example/1/f3}}  …or a design of another example
 *   {{lead:subs-example/1/3/max@30|15″|10s| dB}}  who's ahead, by how much: "15″ +2.5 dB", "10s +0.5 dB" or "same"
 */
import { EXAMPLES } from "./examples.ts";
import { driverInputOf, runDesigns, simOptionsOf, solveDriver, type Design } from "../packages/web/src/sim.ts";
import { scoreLine } from "../packages/web/src/lineopt.ts";
import { combineRuns, parseRunSpec } from "../packages/web/src/guideRuns.ts";
import { figure } from "./figures.ts";
import { KIND_COLORS, KIND_COLOR_NAMES } from "../packages/web/src/palette.ts";
import { valueAt } from "../packages/web/src/chartProps.ts";
import type { AppState } from "../packages/web/src/state.ts";

/** What sets the max SPL, as the guides word it. */
const LIMIT_WORDS: Record<string, string> = { xmax: "Xmax", "pr-xmax": "PR Xmax", port: "port speed", thermal: "power", amp: "amp", air: "air distortion" };

const runs = new Map<string, { state: AppState; designs: Design[] }>();
function run(name: string, file: string) {
  let r = runs.get(name);
  if (!r) {
    const make = EXAMPLES[name];
    if (!make) throw new Error(`${file}: no example called "${name}" (see site/examples.ts)`);
    const state = make();
    r = { state, designs: runDesigns(state, solveDriver(state)) };
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
const nearest = (freq: Float64Array, f: number) => {
  let i = 0;
  for (let j = 1; j < freq.length; j++) if (Math.abs(Math.log(freq[j]! / f)) < Math.abs(Math.log(freq[i]! / f))) i = j;
  return i;
};

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
    case "f6":
      return [summary.f6 ?? NaN, hz(summary.f6 ?? 0)];
    case "fc":
      return [summary.fc ?? NaN, hz(summary.fc ?? 0)];
    case "qtc":
      return [summary.qtc ?? NaN, 2];
    case "volts":
      return [valueAt(freq, d.result.ampAtMax.volts, need()), 1];
    case "amps":
      return [valueAt(freq, d.result.ampAtMax.amps, need()), 1];
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
      const i = nearest(freq, need());
      return [LIMIT_WORDS[limitedBy[i]!] ?? limitedBy[i]!, 0];
    }
    case "x":
      return [arg === undefined ? peak(freq, excursionMm, 10, 200)[0] : valueAt(freq, excursionMm, arg), 1];
    case "x20":
      // As the design assistant grades a box with no filter: from 20 Hz up.
      return [peak(freq, excursionMm, 20, 200)[0], 1];
    case "prx20": {
      const y = d.result.prExcursionMm;
      if (!y) throw new Error("this design has no passive radiators");
      return [peak(freq, y, 20, 200)[0], 1];
    }
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
    case "w": {
      const f = need();
      return [r.state.power * 10 ** ((valueAt(freq, maxSpl, f) - valueAt(freq, spl, f)) / 10), 0];
    }
    case "gd":
      return [valueAt(freq, d.result.groupDelayMs, need()), 1];
    case "gdc": {
      const f = need();
      return [(valueAt(freq, d.result.groupDelayMs, f) * f) / 1000, 2];
    }
    case "gdp":
      return [peak(freq, d.result.groupDelayMs, 15, 200)[0], 1];
    case "gdpf": {
      const f = peak(freq, d.result.groupDelayMs, 15, 200)[1];
      return [f, hz(f)];
    }
    case "prx": {
      const y = d.result.prExcursionMm;
      if (!y) throw new Error("this design has no passive radiators");
      return [peak(freq, y, 10, 200)[0], 1];
    }
    case "ref":
      return [summary.referenceSpl, 1];
    case "rise":
      return [peak(freq, spl, 10, 500)[0] - summary.referenceSpl, 1];
    case "risef":
      return [peak(freq, spl, 10, 500)[1], 0];
    case "xr": {
      const xmax = d.compare && r.state.compare ? r.state.compare.xmax_mm : r.state.xmax_mm;
      return [peak(freq, excursionMm, 10, 200)[0] / xmax, 1];
    }
    case "xin": {
      const xmax = d.compare && r.state.compare ? r.state.compare.xmax_mm : r.state.xmax_mm;
      return [xmax - peak(freq, excursionMm, 10, 200)[0], 1];
    }
    case "hump":
      return [peak(freq, spl, 15, 200)[0] - valueAt(freq, spl, 80), 1];
    case "humpf":
      return [peak(freq, spl, 15, 200)[1], 0];
    case "xmaxW": {
      if (r.state.drive !== "watts") throw new Error("xmaxW needs the drive in watts");
      const xmax = d.compare && r.state.compare ? r.state.compare.xmax_mm : r.state.xmax_mm;
      const w = r.state.power * (xmax / peak(freq, excursionMm, 10, 200)[0]) ** 2;
      return [Math.round(w / 10) * 10, 0];
    }
    case "vb":
      return [d.vb_l, 1];
    case "linelen":
    case "vol":
    case "portd":
    case "ripple":
    case "f3line": {
      const L = d.design;
      if (L.kind !== "line") throw new Error(`${name} needs a line`);
      if (name === "linelen") return [L.sections.reduce((a, x) => a + x.length_cm, 0), 0];
      if (name === "vol") return [L.vb_l, 0];
      if (name === "portd") return [L.portDiameter_cm, 1];
      // As the app's Compare types and Best line score a line: no filter or EQ, to 400 Hz.
      const sc = scoreLine(driverInputOf(r.state, solveDriver(r.state)), L, simOptionsOf(r.state));
      if (!sc) throw new Error("the line has no F3");
      return name === "ripple" ? [sc.ripple, 1] : [sc.f3, hz(sc.f3)];
    }
    case "fsfb":
      return [(r.state.ts.fs ?? NaN) * (summary.fb ?? NaN), 0];
    case "zpp": {
      // Small's check: the two impedance peaks' frequencies multiplied (≈ Fs × Fb).
      const fb = summary.fb;
      if (!fb) throw new Error("zpp needs a tuned box");
      return [peak(freq, d.result.impedanceOhm, 10, fb)[1] * peak(freq, d.result.impedanceOhm, fb, 200)[1], 0];
    }
    case "fs":
      return [r.state.ts.fs ?? NaN, 1];
    case "vset":
      return [summary.volts, 1];
    case "vout": {
      const f = need();
      return [valueAt(freq, d.result.ampAtMax.volts, f) * Math.sqrt(r.state.power / valueAt(freq, d.result.maxPowerW, f)), 0];
    }
    case "pw":
      return [valueAt(freq, d.result.ampAtMax.watts, need()), 0];
    case "vw":
      // The drive's own V²/Re: the setting in watts over the setting in volts squared.
      return [(valueAt(freq, d.result.ampAtMax.volts, need()) ** 2 * r.state.power) / summary.volts ** 2, 0];
    case "boost":
      return [40 * Math.log10((summary.fc ?? NaN) / need()), 1];
    case "boostx":
      return [10 ** ((40 * Math.log10((summary.fc ?? NaN) / need())) / 10), 0];
    case "v10":
      return [valueAt(freq, spl, need()) + 20 * Math.log10(10 / summary.volts), 1];
    case "rel":
      return [valueAt(freq, spl, need()) - summary.referenceSpl, 1];
    case "zpk": {
      // The upper impedance peak of a tuned box: the highest above its tuning (to 200 Hz).
      const fb = summary.fb;
      if (!fb) throw new Error("zpk needs a tuned box");
      return [peak(freq, d.result.impedanceOhm, fb, 200)[0], 1];
    }
    case "zpkf":
      return [peak(freq, d.result.impedanceOhm, summary.fb ?? NaN, 200)[1], 0];
    case "zlo":
    case "zlof": {
      // The lower impedance peak of a tuned box: the highest below its tuning (from 10 Hz).
      const fb = summary.fb;
      if (!fb) throw new Error(`${name} needs a tuned box`);
      const [z, f] = peak(freq, d.result.impedanceOhm, 10, fb);
      return name === "zlo" ? [z, 1] : [f, 0];
    }
    case "zmin": {
      let m = Infinity;
      freq.forEach((q, i) => {
        if (q >= 60 && q <= 500) m = Math.min(m, d.result.impedanceOhm[i]!);
      });
      return [m, 1];
    }
    default:
      throw new Error(`unknown metric "${name}"`);
  }
}

/** Fills a guide's {{num:…}} and {{color:…}} placeholders; throws (naming the file) on a bad one. */
/** One placeholder's value as a number (or a word, for limit@F) and its default decimals. */
function value(ex: string, n: string, name: string, at: string | undefined, all: string, file: string): [number | string, number] {
  const r = run(ex, file);
  const d = r.designs[Number(n) - 1];
  if (!d) throw new Error(`${file}: ${all}: "${ex}" has ${r.designs.length} designs`);
  try {
    return metric(r, d, name, at === undefined ? undefined : Number(at));
  } catch (e) {
    throw new Error(`${file}: ${all}: ${(e as Error).message}`);
  }
}

/** A typographic minus, as the guides write it ("−9.6", not "-9.6"); "-0.0" is "0.0". */
const minus = (t: string) => (/^-0(\.0*)?$/.test(t) ? t.slice(1) : t.replace(/^-/, "−"));

export function fillLive(body: string, file = "page"): string {
  return body
    .replace(/\{\{lead:([\w-]+)\/(\d+)\/(\d+)\/(\w+)(?:@([\d.]+))?\|([^|}]+)\|([^|}]+)(?:\|([^|}]*))?\}\}/g, (all, ex: string, a: string, b: string, name: string, at: string | undefined, la: string, lb: string, unit = "") => {
      const [va, da] = value(ex, a, name, at, all, file);
      const [vb] = value(ex, b, name, at, all, file);
      if (typeof va !== "number" || typeof vb !== "number" || !Number.isFinite(va - vb)) throw new Error(`${file}: ${all}: no value`);
      const gap = Math.abs(va - vb).toFixed(da);
      return Number(gap) === 0 ? "same" : `${va > vb ? la : lb} +${gap}${unit}`;
    })
    .replace(/\{\{diff:([\w-]+)\/(\d+)\/(?:([\w-]+)\/)?(\d+)\/(\w+)(?:@([\d.]+))?(?::(\d))?\}\}/g, (all, ex: string, a: string, ex2: string | undefined, b: string, name: string, at?: string, digits?: string) => {
      const [va, da] = value(ex, a, name, at, all, file);
      const [vb] = value(ex2 ?? ex, b, name, at, all, file);
      if (typeof va !== "number" || typeof vb !== "number" || !Number.isFinite(va - vb)) throw new Error(`${file}: ${all}: no value`);
      return minus((va - vb).toFixed(digits === undefined ? da : Number(digits)));
    })
    .replace(/\{\{num:([\w-]+)\/(\d+)\/(\w+)(?:@([\d.]+))?(?::(\d))?\}\}/g, (all, ex: string, n: string, name: string, at?: string, digits?: string) => {
      const r = run(ex, file);
      const d = r.designs[Number(n) - 1];
      if (!d) throw new Error(`${file}: ${all}: "${ex}" has ${r.designs.length} designs`);
      try {
        const [v, dflt] = metric(r, d, name, at === undefined ? undefined : Number(at));
        if (typeof v === "string") return v;
        if (!Number.isFinite(v)) throw new Error("no value");
        return minus(v.toFixed(digits === undefined ? dflt : Number(digits)));
      } catch (e) {
        throw new Error(`${file}: ${all}: ${(e as Error).message}`);
      }
    })
    .replace(/\{\{fig:([\w-]+)\/(\w+)(?::(\d))?\}\}/g, (all, name: string, key: string, digits?: string) => {
      // A value a figure works out (site/figures.ts): a number, or a colour word.
      let v: number | string | undefined;
      try {
        v = figure(name).values[key];
      } catch (e) {
        throw new Error(`${file}: ${all}: ${(e as Error).message}`);
      }
      if (v === undefined) throw new Error(`${file}: ${all}: figure "${name}" has no value "${key}"`);
      if (typeof v === "string") return v;
      if (!Number.isFinite(v)) throw new Error(`${file}: ${all}: no value`);
      return minus(v.toFixed(digits === undefined ? 1 : Number(digits)));
    })
    .replace(/\{\{color:([\w:,+-]+)\/(\d+)\}\}/g, (all, spec: string, n: string) => {
      // As the chart with the same examples draws it: chart:a+b/kind → {{color:a+b/2}}.
      let r: { designs: Design[] };
      try {
        r = combineRuns(parseRunSpec(spec).map((x) => ({ run: run(x.example, file), ...(x.pick ? { pick: x.pick } : {}) })));
      } catch (e) {
        throw new Error(`${file}: ${all}: ${(e as Error).message}`);
      }
      const d = r.designs[Number(n) - 1];
      if (!d) throw new Error(`${file}: ${all}: "${spec}" has ${r.designs.length} designs`);
      const kind = d.design.kind;
      const shade = KIND_COLORS[kind].indexOf(d.color);
      return KIND_COLOR_NAMES[kind][shade] ?? KIND_COLOR_NAMES[kind][0]!;
    });
}
