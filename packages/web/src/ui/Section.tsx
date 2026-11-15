import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../Icon.tsx";
import { collectHelp, HelpButton, type HelpEntry } from "./Help.tsx";

/**
 * One collapsible row: icon · title · current value · chevron. The value says what's inside
 * while it's closed ("Xmax 12 mm · Pe 250 W"), so most people never need to open it. Open, an ⓘ
 * beside the chevron (when there's anything to explain) explains this row's fields (their `help`, plus `help` here for fields that
 * only appear after a choice). It sits next to the summary, not in it, so it never toggles the row.
 */
export function Section(props: {
  icon: IconName;
  title: string;
  value?: ReactNode;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  /** Fields this row can show that aren't on screen now (they appear after a choice). */
  help?: readonly HelpEntry[];
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  // The ⓘ shows only when there's something to explain (checked after each render, as fields come and go).
  const [explained, setExplained] = useState(true);
  useLayoutEffect(() => {
    const now = (props.help?.length ?? 0) > 0 || collectHelp(body.current).length > 0;
    if (now !== explained) setExplained(now);
  });
  return (
    <details className="ui-section" open={props.open} onToggle={(e) => props.onToggle?.(e.currentTarget.open)}>
      <summary>
        <Icon name={props.icon} />
        <span className="ui-section-title">{props.title}</span>
        <span className="ui-section-value" data-numeric>
          {props.value}
        </span>
        <span className="ui-section-chevron" aria-hidden="true">
          <Icon name="chevronDown" />
        </span>
      </summary>
      {explained && <HelpButton className="ui-section-help" title={props.title} icon={props.icon} collect={() => collectHelp(body.current)} extra={props.help} />}
      <div className="ui-section-body" ref={body}>
        {props.children}
      </div>
    </details>
  );
}
