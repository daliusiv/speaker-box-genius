import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { collectHelp, HelpButton, type HelpEntry } from "./Help.tsx";

/** Whether the card has explained fields outside its collapsible rows (they get the card's ⓘ). */
const hasLooseHelp = (card: HTMLElement) => collectHelp(card, { skipRows: true }).length > 0;

/**
 * A panel with a small uppercase title and actions on the right of the title row. When fields
 * sit outside its rows, an ⓘ at the end of the title row explains them (each row explains its own).
 */
export function Card(props: { title?: string; actions?: ReactNode; children: ReactNode; flush?: boolean; help?: readonly HelpEntry[] }) {
  const ref = useRef<HTMLElement>(null);
  const [loose, setLoose] = useState(false);
  useLayoutEffect(() => {
    const now = ref.current ? hasLooseHelp(ref.current) || (props.help?.length ?? 0) > 0 : false;
    if (now !== loose) setLoose(now);
  });
  return (
    <section className="ui-card" ref={ref}>
      {(props.title || props.actions) && (
        <div className="ui-card-head">
          {props.title && <h2 className="ui-card-title">{props.title}</h2>}
          {props.actions}
          {loose && props.title && (
            <HelpButton className="ui-card-help" title={props.title} collect={() => collectHelp(ref.current, { skipRows: true })} extra={props.help} />
          )}
        </div>
      )}
      {props.flush ? props.children : <div className="ui-card-body">{props.children}</div>}
    </section>
  );
}
