import { useEffect, useState } from "react";
import { NUDGE_KEYS, nudgeKey } from "./nudge.ts";

/** typed = the user's value (bold, accent edge); calculated = worked out (dashed, shown as a placeholder). */
export type NumberState = "plain" | "typed" | "calculated";

/**
 * A number with its unit inside the box: right-aligned, tabular figures. Typing is free; only
 * valid numbers are committed (on every keystroke that parses, and an empty box commits undefined).
 */
export function NumberField(props: {
  id?: string;
  value: number | undefined;
  unit?: string;
  onChange: (v: number | undefined) => void;
  state?: NumberState;
  /** Shown in an empty box: the calculated value, or "–". */
  placeholder?: string;
  min?: number;
  max?: number;
  /** Only values above 0 (a size, a power, a frequency). */
  positive?: boolean;
  "aria-label"?: string;
  inputMode?: "decimal" | "numeric";
}) {
  const [text, setText] = useState(props.value === undefined ? "" : String(props.value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    const shown = text.trim() === "" ? undefined : Number(text.replace(",", "."));
    if (shown !== props.value) {
      setText(props.value === undefined ? "" : String(props.value));
      setInvalid(false);
    }
    // Only follow changes from outside (loading, undo), not each keystroke.
  }, [props.value]);
  const commit = (t: string) => {
    setText(t);
    if (t.trim() === "") {
      setInvalid(false);
      props.onChange(undefined);
      return;
    }
    const v = Number(t.replace(",", "."));
    const ok = Number.isFinite(v) && (!props.positive || v > 0) && (props.min === undefined || v >= props.min) && (props.max === undefined || v <= props.max);
    setInvalid(!ok);
    if (ok) props.onChange(v);
  };
  return (
    <span className="ui-number" data-state={props.state ?? "plain"} data-invalid={invalid || undefined}>
      <input
        id={props.id}
        inputMode={props.inputMode ?? "decimal"}
        value={text}
        placeholder={props.placeholder ?? "–"}
        aria-label={props["aria-label"]}
        aria-invalid={invalid || undefined}
        aria-keyshortcuts={NUDGE_KEYS}
        onKeyDown={(e) => {
          // ↑/↓ nudge a valid number; an empty or invalid box stays put.
          const cur = Number(text.replace(",", "."));
          if (text.trim() === "" || invalid || !Number.isFinite(cur)) return;
          const n = nudgeKey(e, cur, { min: props.min, max: props.max });
          if (n === null) return;
          e.preventDefault();
          if (n !== cur && (!props.positive || n > 0)) commit(String(n));
        }}
        onChange={(e) => commit(e.currentTarget.value)}
      />
      {props.unit && (
        <span className="ui-number-unit" aria-hidden="true">
          {props.unit}
        </span>
      )}
    </span>
  );
}
