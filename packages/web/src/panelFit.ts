import { useEffect, type RefObject } from "react";

/**
 * Keeps the sticky desktop side panel inside the window. Its fixed max-height (window − 2rem)
 * only fits once the page has scrolled past the header; before that the panel starts lower, so
 * its last box sat below the window until the main page was scrolled. This sets --panel-max to
 * the room actually left under the panel's top edge.
 */
export function usePanelFit(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let frame = 0;
    const fit = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const top = Math.max(el.getBoundingClientRect().top, 16);
      el.style.setProperty("--panel-max", `${Math.max(240, innerHeight - top - 16)}px`);
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };
    fit();
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue);
    return () => {
      removeEventListener("scroll", queue);
      removeEventListener("resize", queue);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}
