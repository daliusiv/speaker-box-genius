import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon.tsx";

export type PanelId = "driver" | "boxes" | "signal" | "build" | "settings";

export const PANELS: { id: PanelId; label: string; icon: IconName }[] = [
  { id: "driver", label: "Driver", icon: "speaker" },
  { id: "boxes", label: "Boxes", icon: "box" },
  { id: "signal", label: "Signal", icon: "signal" },
  { id: "build", label: "Build", icon: "wrench" },
  { id: "settings", label: "Settings", icon: "gear" },
];

const KEY = "sbg.panel";

/** The panel to open with: the last one used in this browser, else Boxes (the example's boxes, or the assistant's). */
export function initialPanel(): PanelId {
  try {
    const v = localStorage.getItem(KEY);
    if (PANELS.some((p) => p.id === v)) return v as PanelId;
  } catch {
    // storage unavailable (private mode, embedded): fall through
  }
  return "boxes";
}

export function rememberPanel(p: PanelId) {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    // not remembered, which is fine
  }
}

/**
 * Tab bar for the controls column. `badges` adds a small count or dot per tab
 * (designs shown, signal processing switched on). Arrow keys move between tabs.
 */
export function PanelTabs(props: {
  value: PanelId;
  onChange: (p: PanelId) => void;
  badges?: Partial<Record<PanelId, ReactNode>>;
  /** Extra tab before the panels (the phone layout's Charts view). */
  lead?: { id: string; label: string; selected: boolean; onSelect: () => void };
  className?: string;
  /** Prefix for the tab ids (two bars on one page need different ids). */
  idPrefix?: string;
}) {
  const pre = props.idPrefix ?? "tab-";
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? [])];
    const i = tabs.findIndex((t) => t === document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const n = tabs.length;
    const j = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
    tabs[j]!.focus();
    tabs[j]!.click();
  };
  const leadSelected = props.lead?.selected ?? false;
  return (
    <div className={`panel-tabs ${props.className ?? ""}`} role="tablist" aria-label="Controls" ref={ref} onKeyDown={onKey}>
      {props.lead && (
        <button
          role="tab"
          id={`${pre}${props.lead.id}`}
          aria-selected={leadSelected}
          tabIndex={leadSelected ? 0 : -1}
          className={leadSelected ? "on" : ""}
          onClick={props.lead.onSelect}
        >
          <span className="tab-icon" aria-hidden="true">
            <Icon name="charts" size={22} filled={leadSelected} />
          </span>
          {props.lead.label}
        </button>
      )}
      {PANELS.map((p) => {
        const on = !leadSelected && p.id === props.value;
        return (
          <button
            key={p.id}
            role="tab"
            id={`${pre}${p.id}`}
            aria-selected={on}
            aria-controls={`panel-${p.id}`}
            tabIndex={on ? 0 : -1}
            className={`${on ? "on" : ""}${p.id === "settings" ? " tab-settings" : ""}`}
            onClick={() => props.onChange(p.id)}
          >
            <span className={`tab-icon${p.id === "settings" ? " tab-gear" : ""}`} aria-hidden="true">
              <Icon name={p.icon} size={22} filled={on} />
            </span>
            {p.label}
            {props.badges?.[p.id] !== undefined && <span className="tab-badge">{props.badges[p.id]}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A plain row of tabs (used above the charts). Arrow keys move between tabs. */
export function TabRow<T extends string>(props: {
  /** `alert`: a warning dot on the tab, with this as its spoken text. */
  tabs: { id: T; label: string; alert?: string }[];
  selected: T;
  onSelect: (id: T) => void;
  ariaLabel: string;
  className?: string;
  /** Id of the element each tab controls. */
  controls?: (id: T) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? [])];
    const i = tabs.findIndex((t) => t === document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const n = tabs.length;
    const j = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
    tabs[j]!.focus();
    tabs[j]!.click();
  };
  // One scrolling row: the picked tab scrolled into view, and a fade on each side that has more.
  const edges = () => {
    const el = ref.current;
    if (!el) return;
    el.classList.toggle("more-left", el.scrollLeft > 2);
    el.classList.toggle("more-right", el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  useEffect(() => {
    const el = ref.current;
    const on = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && on) {
      const left = on.offsetLeft - el.offsetLeft;
      if (left < el.scrollLeft || left + on.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = Math.max(0, left - 24);
    }
    edges();
  }, [props.selected, props.tabs.length]);
  useEffect(() => {
    window.addEventListener("resize", edges);
    return () => window.removeEventListener("resize", edges);
  }, []);
  return (
    <div className={`panel-tabs ${props.className ?? ""}`} role="tablist" aria-label={props.ariaLabel} ref={ref} onKeyDown={onKey} onScroll={edges}>
      {props.tabs.map((t) => {
        const on = t.id === props.selected;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            aria-controls={props.controls?.(t.id)}
            tabIndex={on ? 0 : -1}
            className={on ? "on" : ""}
            onClick={() => props.onSelect(t.id)}
            title={t.alert}
          >
            {t.label}
            {t.alert && (
              <span className="tab-alert" role="img" aria-label={t.alert}>
                ●
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
