/**
 * Arrow-key nudging for number fields: ↑/↓ step the value by a tenth of its size (50 → 1,
 * 2.83 → 0.1, 0.38 → 0.01), Shift for ten times that, Alt/Option for a tenth. The result snaps
 * to the step's grid (32.47 ↑ 33), and stepping down from a round decade uses the finer step
 * (10 ↓ 9.9, 9.9 ↑ 10), so up then down always lands back where it started.
 */

export type NudgeMod = { coarse?: boolean; fine?: boolean };

/** Decimal places that a step needs (0.01 → 2). */
const places = (step: number) => Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));

/** The step for `v` moving in `dir` (+1 up, −1 down); `zeroStep` when `v` is 0. */
export function nudgeSize(v: number, dir: 1 | -1, mod: NudgeMod = {}, zeroStep = 1): number {
  const a = Math.abs(v);
  let step: number;
  if (a === 0 || !Number.isFinite(a)) step = zeroStep;
  else {
    let e = Math.floor(Math.log10(a) + 1e-12);
    // Moving toward zero from an exact decade (10, 1, 0.1): use the finer step below it.
    const towardZero = (dir < 0) === (v > 0);
    if (towardZero && Math.abs(a / 10 ** e - 1) < 1e-9) e -= 1;
    step = 10 ** (e - 1);
  }
  if (mod.coarse) step *= 10;
  if (mod.fine) step /= 10;
  return Number(step.toPrecision(1));
}

/** `v` moved one step in `dir`, snapped to the step's grid and free of float noise. */
export function nudge(v: number, dir: 1 | -1, mod: NudgeMod = {}, zeroStep = 1): number {
  const step = nudgeSize(v, dir, mod, zeroStep);
  let r = v / step;
  if (Math.abs(r - Math.round(r)) < 1e-6) r = Math.round(r);
  const n = (dir > 0 ? Math.floor(r) + 1 : Math.ceil(r) - 1) * step;
  return Number(n.toFixed(places(step)));
}

/**
 * The value an ↑/↓ key press asks for, or null when the key isn't a nudge (another key, or
 * with Ctrl/⌘, which the browser and the app's shortcuts keep). Clamped to `min`/`max`.
 */
export function nudgeKey(e: { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }, v: number, opts: { min?: number; max?: number; zeroStep?: number } = {}): number | null {
  if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || e.ctrlKey || e.metaKey) return null;
  let n = nudge(v, e.key === "ArrowUp" ? 1 : -1, { coarse: e.shiftKey, fine: e.altKey }, opts.zeroStep);
  if (opts.min !== undefined && n < opts.min) n = opts.min;
  if (opts.max !== undefined && n > opts.max) n = opts.max;
  return n;
}

/** For the inputs' aria-keyshortcuts. */
export const NUDGE_KEYS = "ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown";
