import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * One help strip for every field: when a field with `data-help` gets focus (a tap on a phone,
 * a click or Tab on a computer), or its label is hovered with a mouse, a strip says what it is
 * and what it does. No icons beside the fields and nothing in the layout moves.
 *
 * Placement: at the bottom of what's visible (above the phone tab bar, or above the on-screen
 * keyboard), unless that would cover the field itself, which is where the browser scrolls a
 * field when the keyboard opens; then at the top of what's visible.
 */
export function HelpDock() {
  const [help, setHelp] = useState<{ title: string; text: string } | null>(null);
  const focused = useRef<Element | null>(null);
  const hovered = useRef<Element | null>(null);
  const dock = useRef<HTMLDivElement>(null);

  /** Puts the strip where it doesn't cover the field in use. */
  const place = () => {
    const el = dock.current;
    if (!el) return;
    const vv = window.visualViewport;
    const visTop = vv ? vv.offsetTop : 0;
    const visH = vv ? vv.height : window.innerHeight;
    const keyboard = window.innerHeight - visH > 120;
    // The phone tab bar is hidden behind the keyboard while it's open.
    const nav = document.querySelector(".phone-nav");
    const navH = !keyboard && nav && getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect().height : 0;
    const gap = 8;
    const h = el.offsetHeight;
    const atBottom = visTop + visH - navH - gap - h;
    const atTop = visTop + gap;
    let top = atBottom;
    const field = (focused.current ?? hovered.current)?.getBoundingClientRect();
    if (field) {
      const covers = (t: number) => Math.max(0, Math.min(t + h, field.bottom) - Math.max(t, field.top));
      if (covers(atBottom) > 0 && covers(atTop) < covers(atBottom)) top = atTop;
    }
    el.style.top = `${Math.round(top)}px`;
  };

  useEffect(() => {
    const read = (el: Element | null) => {
      const host = el?.closest("[data-help]");
      if (!host) return null;
      const text = host.getAttribute("data-help") ?? "";
      if (!text) return null;
      const title = host.getAttribute("data-help-title") ?? host.querySelector(":scope > span")?.textContent ?? "";
      return { title: title.trim(), text };
    };
    const show = () => setHelp(read(focused.current) ?? read(hovered.current));
    const onFocusIn = (e: FocusEvent) => {
      focused.current = e.target as Element;
      show();
      // The keyboard is about to slide up: follow it until it has settled.
      settle();
    };
    const onFocusOut = () => {
      focused.current = null;
      // Focus moving to the next field fires focusin straight after: let it land first.
      setTimeout(show, 0);
    };
    const canHover = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false;
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const host = (e.target as Element).closest?.("[data-help]") ?? null;
      if (host === hovered.current) return;
      hovered.current = host;
      show();
    };
    // The keyboard opening, the browser scrolling the field into view, the user scrolling.
    const onMove = () => settle();
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    if (canHover) document.addEventListener("pointerover", onOver);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onMove);
    vv?.addEventListener("scroll", onMove);
    window.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerover", onOver);
      vv?.removeEventListener("resize", onMove);
      vv?.removeEventListener("scroll", onMove);
      window.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
    };
  }, []);

  /**
   * Re-place every frame until the visible area has stopped changing. The keyboard slides in
   * over a few hundred milliseconds, and the first time it opens the browser may report its
   * final size only after the last resize event (the strip then stayed under the keyboard).
   */
  const settling = useRef(0);
  const settle = () => {
    cancelAnimationFrame(settling.current);
    const start = performance.now();
    let last = -1;
    let still = 0;
    const tick = () => {
      place();
      const vv = window.visualViewport;
      const now = vv ? vv.height + vv.offsetTop * 1e-3 : window.innerHeight;
      still = now === last ? still + 1 : 0;
      last = now;
      // Stop once nothing has moved for ~20 frames (a third of a second: the keyboard can start
      // sliding a moment after focus), or after 1.5 s whatever happens.
      if (still < 20 && performance.now() - start < 1500) settling.current = requestAnimationFrame(tick);
    };
    settling.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(settling.current), []);

  useLayoutEffect(place, [help]);

  if (!help) return null;
  return (
    <div ref={dock} className="help-dock" role="status" aria-live="polite">
      {help.title && <b>{help.title}</b>} {help.text}
    </div>
  );
}
