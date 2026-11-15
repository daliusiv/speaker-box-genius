import type { InputHTMLAttributes } from "react";

/**
 * Text you edit in place, drawn as plain text (a card's name): no box until it has focus,
 * then an accent underline. `aria-label` is required, as there is no visible label.
 */
export function InlineText(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { "aria-label": string }) {
  return <input {...props} type="text" className={["ui-inline-text", props.className].filter(Boolean).join(" ")} />;
}
