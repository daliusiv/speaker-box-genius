import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A small panel under its trigger, right-aligned, for a few live settings (changes apply as you
 * make them, so it has no footer button). Escape or a click outside closes it and puts focus back
 * on the trigger. Controlled: the caller owns `open` and renders the trigger in `trigger`.
 */
export function Popover(props: {
  open: boolean;
  onClose: () => void;
  /** The button that opens it; gets aria-expanded / aria-controls from the caller via `id`. */
  trigger: (id: string) => ReactNode;
  /** The panel's accessible name. */
  label: string;
  align?: "start" | "end";
  className?: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();
  const { open, onClose } = props;
  useEffect(() => {
    if (!open) return;
    const back = () => root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose();
    };
    // Escape closes it only from inside (focus in the panel or on its button), never another open menu's Escape.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !root.current?.contains(document.activeElement)) return;
      e.preventDefault();
      onClose();
      back();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open, onClose]);
  return (
    <span className={["ui-popover", props.className].filter(Boolean).join(" ")} ref={root} data-align={props.align ?? "end"}>
      {props.trigger(id)}
      {open && (
        <div className="ui-popover-panel" id={id} role="dialog" aria-label={props.label}>
          {props.children}
        </div>
      )}
    </span>
  );
}
