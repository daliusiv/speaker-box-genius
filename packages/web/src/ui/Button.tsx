import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "../Icon.tsx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** One primary per screen; secondary is the default; ghost for quiet actions in a row. */
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: IconName;
} & (
    | { children: ReactNode; label?: string }
    /** Icon-only: `label` is required and becomes the accessible name and the tooltip. */
    | { children?: undefined; icon: IconName; label: string }
  );

/** The one button. Variants are data attributes so styles.css never needs a new class. */
export function Button({ variant = "secondary", size = "md", icon, label, children, type = "button", ...rest }: ButtonProps) {
  const iconOnly = children === undefined;
  return (
    <button
      {...rest}
      type={type}
      className={["ui-button", rest.className].filter(Boolean).join(" ")}
      data-variant={variant}
      data-size={size}
      data-icon-only={iconOnly || undefined}
      aria-label={iconOnly ? label : rest["aria-label"]}
      title={rest.title ?? (iconOnly ? label : undefined)}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

/** A link that looks like a button (opens a page: datasheet, form). Ghost by default. */
export function ButtonLink({
  variant = "ghost",
  size = "md",
  icon,
  label,
  children,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & { variant?: ButtonVariant; size?: "sm" | "md" } & (
    | { children: ReactNode; icon?: IconName; label?: undefined }
    /** Icon-only: `label` is required and becomes the accessible name and the tooltip. */
    | { children?: undefined; icon: IconName; label: string }
  )) {
  const iconOnly = children === undefined;
  return (
    <a
      {...rest}
      className={["ui-button", rest.className].filter(Boolean).join(" ")}
      data-variant={variant}
      data-size={size}
      data-icon-only={iconOnly || undefined}
      aria-label={iconOnly ? label : rest["aria-label"]}
      title={rest.title ?? (iconOnly ? label : undefined)}
      rel={rest.rel ?? (rest.target === "_blank" ? "noopener" : undefined)}
    >
      {children}
      {icon && <Icon name={icon} />}
    </a>
  );
}
