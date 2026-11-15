import { useId, type ReactNode } from "react";

/** A choice where each option needs a line of explanation (models, radiation space). Native radios. */
export function RadioCards<T extends string>(props: {
  legend: string;
  value: T;
  options: readonly { value: T; title: string; description?: string; aside?: ReactNode }[];
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="ui-radio-cards">
      <legend>{props.legend}</legend>
      {props.options.map((o) => (
        <label key={o.value} className="ui-radio-card">
          <input type="radio" name={name} value={o.value} checked={o.value === props.value} onChange={() => props.onChange(o.value)} />
          <span className="ui-radio-card-text">
            <span className="ui-radio-card-title">{o.title}</span>
            {o.description && <span className="ui-radio-card-desc">{o.description}</span>}
          </span>
          {o.aside !== undefined && <span className="ui-radio-card-aside">{o.aside}</span>}
        </label>
      ))}
    </fieldset>
  );
}
