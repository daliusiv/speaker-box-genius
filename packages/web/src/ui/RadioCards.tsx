import { useId, type ReactNode } from "react";

/**
 * A choice where each option needs a line of explanation (models, radiation space). Native radios.
 * `list` (default): quiet rows tied together by a line under the legend. `card`: each option boxed, for big choices.
 */
export function RadioCards<T extends string>(props: {
  legend: string;
  value: T;
  options: readonly { value: T; title: string; description?: string; aside?: ReactNode }[];
  onChange: (v: T) => void;
  /** The legend for screen readers only (when the row's title already says it). */
  hideLegend?: boolean;
  variant?: "list" | "card";
  /** Fields that belong to the last option, drawn right under it and lined up with its text. */
  children?: ReactNode;
}) {
  const name = useId();
  const list = (props.variant ?? "list") === "list";
  return (
    <fieldset className="ui-radio-cards" data-variant={list ? "list" : "card"} data-legend={props.hideLegend ? "hidden" : undefined}>
      <legend className={props.hideLegend ? "sr-only" : undefined}>{props.legend}</legend>
      <div className="ui-radio-cards-options">
        {props.options.map((o) => (
          <label key={o.value} className="ui-radio-card">
            <input type="radio" name={name} value={o.value} checked={o.value === props.value} onChange={() => props.onChange(o.value)} />
            <span className="ui-radio-card-text">
              <span className="ui-radio-card-title">
                <span className="ui-radio-card-name">{o.title}</span>
                {list && o.aside !== undefined && <span className="ui-radio-card-aside">{o.aside}</span>}
              </span>
              {o.description && <span className="ui-radio-card-desc">{o.description}</span>}
            </span>
            {!list && o.aside !== undefined && <span className="ui-radio-card-aside">{o.aside}</span>}
          </label>
        ))}
        {props.children !== undefined && <div className="ui-radio-cards-follow">{props.children}</div>}
      </div>
    </fieldset>
  );
}
