import type { ReactNode } from "react";
import { Icon } from "../Icon.tsx";

/**
 * A bordered row that shows its values while closed and opens to its fields in place:
 * an EQ filter, a passive branch, a passive radiator's parameters.
 */
export function Disclosure(props: { title: ReactNode; value?: ReactNode; defaultOpen?: boolean; off?: boolean; children: ReactNode }) {
  return (
    <details className="ui-disclosure" open={props.defaultOpen} data-off={props.off || undefined}>
      <summary>
        <span className="ui-disclosure-title">{props.title}</span>
        <span className="ui-disclosure-value" data-numeric>
          {props.value}
        </span>
        <span className="ui-disclosure-chevron" aria-hidden="true">
          <Icon name="chevronDown" />
        </span>
      </summary>
      <div className="ui-disclosure-body">{props.children}</div>
    </details>
  );
}
