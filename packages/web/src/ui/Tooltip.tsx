import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button.tsx";

/** An (i) button with a short note: opens on tap or click, closes on Escape or a tap outside. */
export function Tooltip(props: { label: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span className="ui-tooltip" ref={ref}>
      <Button variant="ghost" size="sm" icon="info" label={`About: ${props.label}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} />
      {open && (
        <span className="ui-tooltip-pop" id={id} role="note">
          {props.children}
        </span>
      )}
    </span>
  );
}
