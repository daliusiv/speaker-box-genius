import { Icon } from "../Icon.tsx";

/** A small whole number with − and + (drivers, PRs, ports). Typing works too. */
export function Stepper(props: { id?: string; value: number; min?: number; max?: number; onChange: (v: number) => void; label: string }) {
  const min = props.min ?? 1;
  const max = props.max ?? 99;
  const set = (v: number) => props.onChange(Math.min(max, Math.max(min, Math.round(v))));
  return (
    <div className="ui-stepper" role="group" aria-label={props.label}>
      <button type="button" aria-label={`Fewer: ${props.label}`} disabled={props.value <= min} onClick={() => set(props.value - 1)}>
        <Icon name="minus" />
      </button>
      <input
        id={props.id}
        inputMode="numeric"
        aria-label={props.label}
        value={props.value}
        aria-keyshortcuts="ArrowUp ArrowDown"
        onKeyDown={(e) => {
          // ↑/↓ one more or fewer, Shift ten.
          if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          set(props.value + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1));
        }}
        onChange={(e) => {
          const v = Number(e.currentTarget.value);
          if (e.currentTarget.value.trim() !== "" && Number.isFinite(v)) set(v);
        }}
      />
      <button type="button" aria-label={`More: ${props.label}`} disabled={props.value >= max} onClick={() => set(props.value + 1)}>
        <Icon name="plus" />
      </button>
    </div>
  );
}
