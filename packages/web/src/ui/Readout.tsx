import type { ReactNode } from "react";

/** A calculated value in a field row: label left, value right, tabular figures. */
export function Readout(props: { label: ReactNode; value: ReactNode; tone?: "over" }) {
  return (
    <div className="ui-field ui-readout" data-wide data-tone={props.tone}>
      <span className="ui-field-label">{props.label}</span>
      <output>{props.value}</output>
    </div>
  );
}
