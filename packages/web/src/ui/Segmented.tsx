import { useRef, type KeyboardEvent } from "react";

/** Two to four choices side by side (a radio group: arrow keys move, one tab stop). */
export function Segmented<T extends string>(props: {
  id?: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const index = props.options.findIndex((o) => o.value === props.value);
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + props.options.length) % props.options.length;
    props.onChange(props.options[next]!.value);
    ref.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };
  return (
    <div className="ui-segmented" role="radiogroup" aria-label={props.label} id={props.id} ref={ref} onKeyDown={onKey}>
      {props.options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index || (index < 0 && i === 0) ? 0 : -1}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
