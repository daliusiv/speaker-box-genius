import type { InputHTMLAttributes, Ref } from "react";
import { Icon, type IconName } from "../Icon.tsx";

/**
 * A boxed text field, left-aligned (a name, a search), the same height as a number field.
 * An optional icon sits inside the box before the text.
 */
export function TextField({ icon, ref, type = "text", className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon?: IconName; ref?: Ref<HTMLInputElement> }) {
  return (
    <span className={["ui-text", className].filter(Boolean).join(" ")}>
      {icon && <Icon name={icon} />}
      <input {...rest} ref={ref} type={type} />
    </span>
  );
}
