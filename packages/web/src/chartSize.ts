import { useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

/** The width charts are designed at; narrower boxes shrink this drawing (phones) and scale the text up. */
export const BASE_W = 640;
/** Height of the 640-unit drawing (still images, phones keep their own tall shape). */
export const BASE_H = 260;

/**
 * Units across for a chart whose box is `width` px wide: its real width, so text and lines keep
 * their size on a wide screen, and never under 640 (narrower boxes shrink the 640 drawing).
 */
export const drawWidth = (width: number) => (width > BASE_W ? Math.round(width) : BASE_W);

/**
 * Plot height for a drawing `w` units wide in a window `viewH` px tall: about 42 % of the window,
 * between 1.8 and 3 times narrower than it is wide, and 260 to 480.
 */
export function plotHeight(w: number, viewH: number): number {
  const h = Math.max(w / 3, Math.min(0.42 * viewH, w / 1.8));
  return Math.round(Math.min(480, Math.max(BASE_H, h)));
}

/**
 * Frequencies to label (and to draw grid lines at) on a log axis, by the room a decade gets:
 * decades always; 2 and 5 from 70 px; 2, 3 and 5 from 120 px; 1.5, 4 and 7 as well from 250 px,
 * where every whole step (1…9) also gets a faint grid line.
 */
export function freqTicks(fMin: number, fMax: number, pxPerDecade: number): { labels: number[]; minor: number[] } {
  const steps =
    pxPerDecade >= 250 ? [1, 1.5, 2, 3, 4, 5, 7] : pxPerDecade >= 120 ? [1, 2, 3, 5] : pxPerDecade >= 70 ? [1, 2, 5] : [1];
  const labels: number[] = [];
  const minor: number[] = [];
  const near = (a: number, b: number) => Math.abs(a / b - 1) < 1e-6;
  for (let d = 10 ** Math.floor(Math.log10(fMin)); d <= fMax * 1.000001; d *= 10) {
    for (const s of steps) {
      const f = Number((d * s).toPrecision(6));
      if (f >= fMin * 0.999999 && f <= fMax * 1.000001) labels.push(f);
    }
    if (pxPerDecade >= 250) {
      for (let s = 1; s <= 9; s++) {
        const f = Number((d * s).toPrecision(6));
        if (f >= fMin && f <= fMax && !labels.some((l) => near(l, f))) minor.push(f);
      }
    }
  }
  return { labels, minor };
}

/** The window's inner height, kept up to date. */
export function useViewHeight(): number {
  const [h, setH] = useState(() => (typeof window === "undefined" ? 900 : window.innerHeight));
  useEffect(() => {
    if (typeof window === "undefined") return;
    let frame = 0;
    const on = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setH(window.innerHeight));
    };
    window.addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", on);
    };
  }, []);
  return h;
}

// While the forum image is made, every chart draws at one fixed width, so the picture looks the
// same from any screen. Set, read and cleared in one go: the screen never paints it.
let exportWidth: number | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const setExportWidth = (w: number | null) => {
  exportWidth = w;
  for (const l of listeners) l();
};

/** The fixed drawing width while the forum image is being made, else null. */
export const useExportWidth = () => useSyncExternalStore(subscribe, () => exportWidth, () => null);

/** Runs `read` with every chart redrawn `w` units wide (and at the 640 chart's shape), then puts them back. */
export function withExportWidth<T>(w: number, read: () => T): T {
  flushSync(() => setExportWidth(w));
  try {
    return read();
  } finally {
    flushSync(() => setExportWidth(null));
  }
}
