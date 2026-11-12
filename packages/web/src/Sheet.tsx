import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon.tsx";

/**
 * A task window: centred on wide screens, full screen on phones (CSS, < 640 px).
 * A native modal <dialog>: focus stays inside, Esc closes, focus goes back where it was.
 * A click on the backdrop closes it.
 * The body is only rendered while open, so a closed window costs nothing.
 */
export function Sheet(props: { open: boolean; onClose: () => void; title: string; className?: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);

  return (
    <dialog
      ref={ref}
      className={`sheet${props.className ? ` ${props.className}` : ""}`}
      aria-labelledby={titleId}
      onClose={props.onClose}
      onClick={(e) => {
        // Only the dialog itself (the backdrop area) is the target outside the inner box.
        if (e.target === ref.current) props.onClose();
      }}
    >
      {props.open && (
        <div className="sheet-inner">
          <header className="sheet-head">
            <h2 id={titleId}>{props.title}</h2>
            <button type="button" className="icon" aria-label="Close" onClick={props.onClose}>
              <Icon name="close" />
            </button>
          </header>
          <div className="sheet-body">{props.children}</div>
          {props.footer && <footer className="sheet-foot">{props.footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
