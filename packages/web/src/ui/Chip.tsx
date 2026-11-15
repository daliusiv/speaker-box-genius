import type { ReactNode } from "react";

export type Tone = "neutral" | "accent" | "warn" | "over";

/** A small label; with `onClick` it becomes a toggle chip (aria-pressed). */
export function Chip(props: { children: ReactNode; tone?: Tone; pressed?: boolean; onClick?: () => void }) {
  if (props.onClick)
    return (
      <button type="button" className="ui-chip" data-tone={props.tone ?? "neutral"} aria-pressed={props.pressed} onClick={props.onClick}>
        {props.children}
      </button>
    );
  return (
    <span className="ui-chip" data-tone={props.tone ?? "neutral"}>
      {props.children}
    </span>
  );
}
