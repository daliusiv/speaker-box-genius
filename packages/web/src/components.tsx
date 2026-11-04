import { useEffect, useState, type ReactNode } from "react";
import { useUnits, type Quantity } from "./units.ts";

export const REPO = "https://github.com/daliusiv/speaker-box-genius";

export function Card(props: {
  title: string;
  color?: string;
  on?: boolean;
  onToggle?: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className={`card${props.on === false ? " off" : ""}`}>
      <h2>
        {props.color && <span className="swatch" style={{ background: props.color }} />}
        {props.title}
        {props.onToggle && (
          <input
            type="checkbox"
            checked={props.on}
            onChange={(e) => props.onToggle!(e.currentTarget.checked)}
            aria-label={`Use ${props.title}`}
          />
        )}
      </h2>
      {props.on !== false && props.children}
    </section>
  );
}

/** Converted values are rounded for display (4 significant figures); metric ones keep up to 6. */
const tidy = (v: number, converted = false) => String(Number(v.toPrecision(converted ? 4 : 6)));

/**
 * Number input that lets you type freely and only commits valid values (≥ min, default > 0).
 * With `q`, the value is stored in metric and shown in the user's chosen units.
 */
export function Num(props: {
  label: string;
  unit?: string;
  q?: Quantity;
  value: number;
  min?: number;
  /** What the field is and does: shown in the help strip when it has focus (or is hovered). */
  help?: string;
  /** Older name for help. */
  title?: string;
  onChange: (v: number) => void;
}) {
  const units = useUnits();
  const u = props.q ? units.unit(props.q) : { unit: props.unit ?? "", k: 1 };
  const shown = props.value * u.k;
  const converted = u.k !== 1;
  const [text, setText] = useState(tidy(shown, converted));
  useEffect(() => {
    // Only rewrite the box when the stored value really moved (not when it's our own rounding).
    const typed = Number(text.replace(",", "."));
    const tol = converted ? 5e-4 * Math.max(1, Math.abs(shown)) : 1e-9 * Math.max(1, Math.abs(shown));
    if (!(Math.abs(typed - shown) <= tol)) setText(tidy(shown, converted));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  const min = (props.min ?? Number.MIN_VALUE) * u.k;
  return (
    <label data-help={props.help ?? props.title}>
      <span>{props.label}</span>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const t = e.currentTarget.value;
          setText(t);
          const v = Number(t.replace(",", "."));
          if (t.trim() !== "" && Number.isFinite(v) && v >= min) props.onChange(v / u.k);
        }}
      />
      <span className="unit">{u.unit}</span>
    </label>
  );
}

/** A read-only value laid out like a Num field. Give `num` + `q` to convert units. */
export function Fixed(props: { label: string; unit?: string; value?: string; num?: number; q?: Quantity; title?: string; help?: string }) {
  const units = useUnits();
  const u = props.q ? units.unit(props.q) : null;
  const text = props.num !== undefined && u ? (props.num * u.k).toFixed(u.digits) : (props.value ?? "–");
  return (
    <label data-help={props.help ?? props.title} tabIndex={props.help ?? props.title ? 0 : undefined}>
      <span>{props.label}</span>
      <output className="fixed">{text}</output>
      <span className="unit">{u ? u.unit : (props.unit ?? "")}</span>
    </label>
  );
}

export function Select<T extends string | number>(props: {
  label: string;
  value: T;
  options: { value: T; text: string }[];
  /** What the choice does: shown in the help strip when it has focus (or is hovered). */
  help?: string;
  onChange: (v: T) => void;
}) {
  return (
    <label className="full" data-help={props.help}>
      <span>{props.label}</span>
      <select
        value={String(props.value)}
        onChange={(e) => {
          const o = props.options.find((x) => String(x.value) === e.currentTarget.value);
          if (o) props.onChange(o.value);
        }}
      >
        {props.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.text}
          </option>
        ))}
      </select>
    </label>
  );
}
