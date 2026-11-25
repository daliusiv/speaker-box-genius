import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./Button.tsx";
import { Icon, type IconName } from "../Icon.tsx";

export type MenuItem =
  | {
      kind?: "item";
      label: string;
      icon?: ReactNode;
      onSelect: () => void;
      /** A rich item: a line under the label, and numbers beside it. */
      description?: ReactNode;
      detail?: ReactNode;
      /** A choice in a set (the current one ticked): the item becomes a menuitemradio. */
      checked?: boolean;
      /** Removes or clears something: drawn in the over-limit colour. */
      danger?: boolean;
    }
  | { kind: "link"; label: string; href: string; icon?: ReactNode }
  | { kind: "separator" }
  /** A small heading over the items after it (a group in a longer menu). */
  | { kind: "heading"; label: string };

/** One item for a menu list built by hand (a menu with its own placement or extras). */
export function MenuItemButton(props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "role">) {
  return <button {...props} type="button" role="menuitem" className={["ui-menu-item", props.className].filter(Boolean).join(" ")} />;
}

/**
 * A button that opens a list of actions. Arrow keys move, Home/End jump, Escape or a click
 * outside closes and puts focus back on the button.
 */
export function Menu(props: {
  label: string;
  items: readonly MenuItem[];
  variant?: ButtonVariant;
  icon?: IconName;
  /** Icon-only trigger: `label` is the accessible name. */
  iconOnly?: boolean;
  align?: "start" | "end";
  /** Labelled trigger without the ▾ (the label already says it opens choices). */
  caret?: boolean;
  /** Start open (the /ui catalogue and screenshots). */
  defaultOpen?: boolean;
  /** A trigger that looks like a field (a select): it shows `value`, with a chevron. */
  field?: boolean;
  value?: ReactNode;
  disabled?: boolean;
  /** A line at the foot of the list. */
  footer?: ReactNode;
  /** The list pinned to the window under the trigger, as tall as fits (in a scroll box that would clip it). */
  pinned?: boolean;
  className?: string;
  /** Called as the list opens (to work out what it shows only when it's needed). */
  onOpen?: () => void;
  /** A labelled trigger's accessible name when its visible label is too short to say what it is (e.g. a unit). */
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const items = () => [...(root.current?.querySelectorAll<HTMLElement>("[role=menuitem], [role=menuitemradio]") ?? [])];
  const [place, setPlace] = useState<CSSProperties | undefined>();
  useLayoutEffect(() => {
    if (!open || !props.pinned || !matchMedia("(min-width: 861px)").matches) {
      setPlace(undefined);
      return;
    }
    const fit = () => {
      const b = root.current?.querySelector("button")?.getBoundingClientRect();
      if (!b) return;
      const top = b.bottom + 6;
      const width = Math.min(360, innerWidth - 24);
      const left = props.align === "end" ? Math.max(12, b.right - width) : b.left;
      setPlace({ position: "fixed", left, right: "auto", top, width, maxHeight: Math.max(160, innerHeight - top - 12), overflowY: "auto" });
    };
    fit();
    addEventListener("scroll", fit, true);
    addEventListener("resize", fit);
    return () => {
      removeEventListener("scroll", fit, true);
      removeEventListener("resize", fit);
    };
  }, [open, props.pinned, props.align]);
  // A list that would run off the window's side (its button mid-row on a phone) slides back in.
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!open || place) {
      setShift(0);
      return;
    }
    const list = root.current?.querySelector<HTMLElement>(".ui-menu-list");
    if (!list) return;
    const r = list.getBoundingClientRect();
    const margin = 8;
    const left = r.left - shift;
    const right = r.right - shift;
    const vw = document.documentElement.clientWidth;
    setShift(left < margin ? margin - left : right > vw - margin ? Math.max(margin - left, vw - margin - right) : 0);
  }, [open, place]); // eslint-disable-line react-hooks/exhaustive-deps
  // A list that would run off the window's bottom (or under a bar fixed there, `data-bottom-bar`)
  // opens upward when there's more room above, and scrolls if it fits neither way.
  const [vertical, setVertical] = useState<CSSProperties | undefined>();
  useLayoutEffect(() => {
    if (!open || place) {
      setVertical(undefined);
      return;
    }
    const list = root.current?.querySelector<HTMLElement>(".ui-menu-list");
    const b = root.current?.querySelector("button")?.getBoundingClientRect();
    if (!list || !b) return;
    const margin = 8;
    const gap = list.getBoundingClientRect().top - b.bottom;
    const bar = [...document.querySelectorAll<HTMLElement>("[data-bottom-bar]")].map((e) => e.getBoundingClientRect()).find((r) => r.height > 0);
    const floor = Math.min(innerHeight, bar ? bar.top : innerHeight) - margin;
    // Only for a button on screen (one just tapped), not a list shown open off screen (/ui catalogue).
    if (b.top < 0 || b.bottom > floor + margin) return setVertical(undefined);
    const below = floor - b.bottom - Math.max(gap, 0);
    const above = b.top - margin - Math.max(gap, 0);
    const h = list.scrollHeight;
    if (h <= below) return setVertical(undefined);
    const up = above > below;
    const room = Math.max(120, up ? above : below);
    setVertical({ ...(up ? { top: "auto", bottom: `calc(100% + ${Math.max(gap, 0)}px)` } : {}), ...(h > room ? { maxHeight: room, overflowY: "auto" } : {}) });
  }, [open, place]); // eslint-disable-line react-hooks/exhaustive-deps
  const focusTrigger = () => root.current?.querySelector<HTMLButtonElement>("button")?.focus();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const onKey = (e: KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => list[(i + list.length) % list.length]?.focus();
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      focusTrigger();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        props.onOpen?.();
        setOpen(true);
        requestAnimationFrame(() => {
          const all = items();
          (all.find((el) => el.getAttribute("aria-checked") === "true") ?? all[0])?.focus();
        });
      } else go(at + 1);
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      go(at - 1);
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      go(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      go(list.length - 1);
    } else if (e.key === "Tab" && open) setOpen(false);
  };

  const close = () => {
    setOpen(false);
    focusTrigger();
  };

  return (
    <div className={["ui-menu", props.className].filter(Boolean).join(" ")} ref={root} data-align={props.align ?? "start"} onKeyDown={onKey}>
      {props.field ? (
        <Button
          className="ui-menu-field"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={id}
          aria-label={typeof props.value === "string" ? `${props.label}: ${props.value}` : props.label}
          disabled={props.disabled}
          onClick={() => {
            if (!open) props.onOpen?.();
            setOpen(!open);
          }}
        >
          <span className="ui-menu-field-value">{props.value}</span>
          <Icon name="chevronDown" />
        </Button>
      ) : props.iconOnly && props.icon ? (
        <Button variant={props.variant ?? "ghost"} icon={props.icon} label={props.label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} disabled={props.disabled} onClick={() => setOpen(!open)} />
      ) : (
        <Button
          variant={props.variant ?? "secondary"}
          icon={props.icon}
          aria-label={props.ariaLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={id}
          disabled={props.disabled}
          onClick={() => setOpen(!open)}
        >
          {props.label}
          {props.caret !== false && <span aria-hidden="true">▾</span>}
        </Button>
      )}
      {open && (
        <div className="ui-menu-list" role="menu" id={id} aria-label={props.ariaLabel ?? props.label} style={place ?? (shift || vertical ? { ...vertical, ...(shift ? { transform: `translateX(${shift}px)` } : {}) } : undefined)}>
          {props.items.map((it, i) =>
            it.kind === "separator" ? (
              <hr key={i} className="ui-menu-sep" />
            ) : it.kind === "heading" ? (
              <div key={i} className="ui-menu-head" role="presentation">
                {it.label}
              </div>
            ) : it.kind === "link" ? (
              <a key={i} className="ui-menu-item" role="menuitem" href={it.href} target="_blank" rel="noopener" onClick={close}>
                {it.icon}
                {it.label}
              </a>
            ) : (
              <button
                key={i}
                type="button"
                className={
                  it.description !== undefined || it.checked !== undefined ? `ui-menu-item ui-menu-item-rich${it.icon ? "" : " ui-menu-item-noicon"}` : "ui-menu-item"
                }
                data-tone={it.danger ? "danger" : undefined}
                role={it.checked !== undefined ? "menuitemradio" : "menuitem"}
                aria-checked={it.checked}
                onClick={() => {
                  close();
                  it.onSelect();
                }}
              >
                {it.icon}
                {it.description !== undefined || it.detail !== undefined ? (
                  <span className="ui-menu-item-text">
                    <span className="ui-menu-item-label">
                      {it.label}
                      {it.detail !== undefined && <span className="ui-menu-item-detail">{it.detail}</span>}
                    </span>
                    {it.description !== undefined && <span className="ui-menu-item-desc">{it.description}</span>}
                  </span>
                ) : (
                  it.label
                )}
                {it.checked !== undefined && <span className="ui-menu-item-check">{it.checked && <Icon name="check" />}</span>}
              </button>
            ),
          )}
          {props.footer && <p className="ui-menu-foot">{props.footer}</p>}
        </div>
      )}
    </div>
  );
}
