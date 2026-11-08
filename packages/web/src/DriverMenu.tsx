import { useEffect, useRef, useState } from "react";
import { Sparkle } from "./Logo.tsx";

/**
 * One drop-down for the driver card's less frequent actions: paste from a datasheet,
 * clear, WinISD import/export and submitting the driver to the database.
 */
export function DriverMenu(props: {
  onMeasure: () => void;
  pasting: boolean;
  onPaste: () => void;
  onClear: () => void;
  onImport: () => void;
  onExport: () => void;
  submitUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    // Escape closes the menu and puts focus back on its button.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    addEventListener("mousedown", close);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("mousedown", close);
      removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="share" ref={ref}>
      <button className="secondary" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        Driver tools ▾
      </button>
      {open && (
        <div className="share-menu menu-left" role="menu">
          <button role="menuitem" onClick={pick(props.onPaste)}>
            {props.pasting ? "Cancel paste" : "Paste from datasheet…"}
          </button>
          <button role="menuitem" onClick={pick(props.onMeasure)}>
            <Sparkle />
            Measure from an impedance sweep…
          </button>
          <button role="menuitem" onClick={pick(props.onClear)}>
            Clear all T/S values
          </button>
          <hr />
          <button role="menuitem" onClick={pick(props.onImport)}>
            Import WinISD or OpenISD file…
          </button>
          <button role="menuitem" onClick={pick(props.onExport)}>
            Export WinISD .wdr
          </button>
          <hr />
          <a
            className="menu-link"
            role="menuitem"
            href={props.submitUrl}
            target="_blank"
            rel="noopener"
            onClick={() => setOpen(false)}
          >
            Submit to database ↗
          </a>
          <p className="hint">Opens a pre-filled GitHub form; you add the datasheet link.</p>
        </div>
      )}
    </div>
  );
}
