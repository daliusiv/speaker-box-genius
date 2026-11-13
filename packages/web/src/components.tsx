import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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

/**
 * Labels too long for the narrow label column sit above their input instead, so they never
 * wrap or get cut off ("Coil inductance", "Added mass"). Short ones ("Fs", "Vas") stay beside it.
 */
export const stackClass = (label: string) => (label.length > 5 ? "stack" : undefined);

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
  /** Where 0 means "none": the box is left blank with this as its placeholder (e.g. "No limit"), and clearing it sets 0. */
  zeroText?: string;
  /** Where a very large value means "none" (a loss Q): from `at` up the box is blank with `text` as its placeholder, and clearing it sets `at`. */
  none?: { text: string; at: number };
}) {
  const units = useUnits();
  const u = props.q ? units.unit(props.q) : { unit: props.unit ?? "", k: 1 };
  const shown = props.value * u.k;
  const converted = u.k !== 1;
  const blank = (v: number) => (props.zeroText !== undefined && v === 0) || (props.none !== undefined && v >= props.none.at * u.k);
  const [text, setText] = useState(blank(shown) ? "" : tidy(shown, converted));
  useEffect(() => {
    if (blank(shown)) {
      if (text.trim() !== "" && Number(text.replace(",", ".")) !== 0) setText("");
      return;
    }
    // Only rewrite the box when the stored value really moved (not when it's our own rounding).
    const typed = Number(text.replace(",", "."));
    const tol = converted ? 5e-4 * Math.max(1, Math.abs(shown)) : 1e-9 * Math.max(1, Math.abs(shown));
    if (!(Math.abs(typed - shown) <= tol)) setText(tidy(shown, converted));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  const min = (props.min ?? Number.MIN_VALUE) * u.k;
  return (
    <label className={stackClass(props.label)} data-help={props.help ?? props.title}>
      <span>{props.label}</span>
      <input
        inputMode="decimal"
        value={text}
        placeholder={props.zeroText ?? props.none?.text}
        onChange={(e) => {
          const t = e.currentTarget.value;
          setText(t);
          const v = Number(t.replace(",", "."));
          if (t.trim() === "" && props.zeroText !== undefined) props.onChange(0);
          else if (t.trim() === "" && props.none !== undefined) props.onChange(props.none.at);
          else if (t.trim() !== "" && Number.isFinite(v) && v >= min) props.onChange(v / u.k);
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
    <label className={stackClass(props.label)} data-help={props.help ?? props.title} tabIndex={props.help ?? props.title ? 0 : undefined}>
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
    <label className={`full${props.label.length > 6 ? " long" : ""}`} data-help={props.help}>
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

/** True on phones and narrow tablets (the layout with the bottom tab bar); follows rotation and resizing. */
export function useNarrow(q = "(max-width: 860px)"): boolean {
  const [narrow, setNarrow] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [q]);
  return narrow;
}

/**
 * The drive readout ("100 W"): tap or click it to type an exact value, since the slider is
 * hard to set precisely on a phone. Enter or leaving the field applies it; Escape cancels.
 */
export function DriveValue(props: { value: number; unit: string; min: number; max: number; onChange: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const done = (apply: boolean) => {
    if (apply && text !== null) {
      const v = Number(text.replace(",", ".").replace(/[^\d.]/g, ""));
      if (Number.isFinite(v) && v > 0) props.onChange(Math.min(props.max, Math.max(props.min, v)));
    }
    setText(null);
  };
  return (
    <b>
      {text === null ? (
        <button type="button" className="drive-value" title="Type an exact value" aria-label={`${props.value} ${props.unit}: type an exact value`} onClick={() => setText(String(props.value))}>
          {props.value} {props.unit}
        </button>
      ) : (
        <input
          className="drive-value"
          inputMode="decimal"
          autoFocus
          aria-label={`Drive (${props.unit})`}
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setText(e.currentTarget.value)}
          onBlur={() => done(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") done(true);
            if (e.key === "Escape") done(false);
          }}
        />
      )}
    </b>
  );
}

/**
 * An (i) button beside a title that opens a small popover with the chart's notes and caveats,
 * in place of help text under the chart. Closes on Escape, a click outside or a second tap.
 */
export function InfoPopover(props: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span className="info" ref={ref}>
      <button type="button" className="info-button" aria-label={`About: ${props.label}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 7.5v.5" />
        </svg>
      </button>
      {open && (
        <div className="info-pop" id={id} role="note">
          {props.children}
        </div>
      )}
    </span>
  );
}
