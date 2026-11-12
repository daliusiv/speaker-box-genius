import { ICON_PATHS, type IconName } from "./iconPaths.ts";

export type { IconName };

/** A line icon in the current text colour; decorative (the button or link carries the words). */
/** `filled`: a soft fill under the line (the active item in a nav bar). */
export function Icon(props: { name: IconName; size?: number; filled?: boolean }) {
  const s = props.size ?? 18;
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" width={s} height={s} fill={props.filled ? "currentColor" : "none"} fillOpacity={props.filled ? 0.22 : undefined} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICON_PATHS[props.name]} />
    </svg>
  );
}
