import { useEffect, useState, type ReactNode } from "react";

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

/** Number input that lets you type freely and only commits valid values (≥ min, default > 0). */
export function Num(props: { label: string; unit?: string; value: number; min?: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(props.value));
  useEffect(() => {
    if (Number(text.replace(",", ".")) !== props.value) setText(String(props.value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);
  const min = props.min ?? Number.MIN_VALUE;
  return (
    <label>
      <span>{props.label}</span>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const t = e.currentTarget.value;
          setText(t);
          const v = Number(t.replace(",", "."));
          if (t.trim() !== "" && Number.isFinite(v) && v >= min) props.onChange(v);
        }}
      />
      <span className="unit">{props.unit ?? ""}</span>
    </label>
  );
}

/** A read-only value laid out like a Num field. */
export function Fixed(props: { label: string; unit?: string; value: string; title?: string }) {
  return (
    <label title={props.title}>
      <span>{props.label}</span>
      <output className="fixed">{props.value}</output>
      <span className="unit">{props.unit ?? ""}</span>
    </label>
  );
}

export function Select<T extends string | number>(props: {
  label: string;
  value: T;
  options: { value: T; text: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label>
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
      <span className="unit" />
    </label>
  );
}

export function LibraryPicker(props: {
  label: string;
  items: { id: string; text: string }[] | undefined;
  onPick: (id: string) => void;
}) {
  if (!props.items || props.items.length === 0) return null;
  return (
    <div className="picker">
      <select
        aria-label={props.label}
        value=""
        onChange={(e) => {
          const id = e.currentTarget.value;
          if (id) props.onPick(id);
        }}
      >
        <option value="">{props.label}…</option>
        {props.items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.text}
          </option>
        ))}
      </select>
      <a href={`${REPO}/blob/main/CONTRIBUTING.md`} title="Add a driver or passive radiator to the database">
        Missing one?
      </a>
    </div>
  );
}
