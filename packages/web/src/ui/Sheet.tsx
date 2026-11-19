import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "../Icon.tsx";
import { Button } from "./Button.tsx";

/**
 * A modal native <dialog>: full screen on phones, a centred panel on wider screens. Focus stays
 * inside, Escape closes, focus returns to what opened it. One primary action at most, in `footer`.
 * `bottom`: on phones a sheet that rises from the bottom and only takes the height it needs, so
 * what it changes (a chart) stays in view above it; on wider screens it is the usual dialog.
 */
export function Sheet(props: { open: boolean; onClose: () => void; title: string; icon?: IconName; className?: string; actions?: ReactNode; children: ReactNode; footer?: ReactNode; bottom?: boolean }) {
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
      className={["ui-sheet", props.className].filter(Boolean).join(" ")}
      data-bottom={props.bottom || undefined}
      aria-labelledby={titleId}
      onClose={props.onClose}
      onClick={(e) => {
        if (e.target === ref.current) props.onClose();
      }}
    >
      {props.open && (
        <>
          <header className="ui-sheet-head">
            <h2 id={titleId}>
              {props.icon && <Icon name={props.icon} />}
              {props.title}
            </h2>
            <span className="ui-sheet-actions">
              {props.actions}
              <Button variant="ghost" icon="close" label="Close" onClick={props.onClose} />
            </span>
          </header>
          <div className="ui-sheet-body">{props.children}</div>
          {props.footer && <footer className="ui-sheet-foot">{props.footer}</footer>}
        </>
      )}
    </dialog>
  );
}
