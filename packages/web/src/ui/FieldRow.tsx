import { useId, type ReactNode } from "react";

/**
 * Label on the left, one control on the right, every control on the same right edge
 * (the token column: every control is the same width).
 * The control receives the generated id through the render prop, so the label is real.
 */
export function FieldRow(props: {
  label: ReactNode;
  hint?: ReactNode;
  /** What the field does: listed in its row's (or card's) ⓘ help sheet. */
  help?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div
      className="ui-field"
      data-help={props.help}
      data-help-title={props.help && typeof props.label === "string" ? props.label : undefined}
    >
      <label className="ui-field-label" htmlFor={id}>
        {props.label}
      </label>
      {props.children(id)}
      {props.hint && <p className="ui-field-hint">{props.hint}</p>}
    </div>
  );
}
