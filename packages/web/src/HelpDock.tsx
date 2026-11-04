import { useEffect, useRef, useState } from "react";

/**
 * One help strip for every field: when a field with `data-help` gets focus (a tap on a phone,
 * a click or Tab on a computer), or its label is hovered with a mouse, a strip at the bottom of
 * the screen says what it is and what it does. No icons beside the fields, nothing in the
 * layout moves, and on phones it sits above the on-screen keyboard.
 */
export function HelpDock() {
  const [help, setHelp] = useState<{ title: string; text: string } | null>(null);
  const [lift, setLift] = useState(0);
  const focused = useRef<Element | null>(null);
  const hovered = useRef<Element | null>(null);

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
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    if (canHover) document.addEventListener("pointerover", onOver);
    // Keep the strip above the on-screen keyboard (the visual viewport shrinks when it opens).
    const vv = window.visualViewport;
    const onViewport = () => {
      if (!vv) return;
      setLift(Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)));
    };
    vv?.addEventListener("resize", onViewport);
    vv?.addEventListener("scroll", onViewport);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerover", onOver);
      vv?.removeEventListener("resize", onViewport);
      vv?.removeEventListener("scroll", onViewport);
    };
  }, []);

  if (!help) return null;
  return (
    <div className={`help-dock${lift > 0 ? " over-keyboard" : ""}`} style={lift > 0 ? { bottom: lift } : undefined} role="status" aria-live="polite">
      {help.title && <b>{help.title}</b>} {help.text}
    </div>
  );
}
