import { useState } from "react";
import type { IconName } from "../Icon.tsx";
import { Button } from "./Button.tsx";
import { Sheet } from "./Sheet.tsx";

/** One explained field: its label and what it does. */
export type HelpEntry = { label: string; text: string };

/** A row's field help as entries, for `Section help` (fields that only appear after a choice). */
export const helpEntries = (help: Readonly<Record<string, string>>): HelpEntry[] => Object.entries(help).map(([label, text]) => ({ label, text }));

/** A field's label for the help sheet: its help title, its kit label, or a legacy label's text. */
function labelOf(el: Element): string {
  const titled = el.getAttribute("data-help-title");
  if (titled) return titled;
  if (el.matches("p")) return "More";
  const kit = el.querySelector(".ui-field-label, .ui-readout > span")?.textContent?.trim();
  if (kit) return kit;
  const span = el.querySelector(":scope > span")?.textContent?.trim();
  return span || el.textContent?.trim().slice(0, 40) || "";
}

/**
 * The help texts of the fields under `root`, in page order: every `data-help` (the `help` of
 * Num, Select, Fixed and FieldRow) and every option-card group with its choices. With
 * `skipRows`, fields inside a collapsible row (`.ui-section`) are left to that row's own help.
 */
export function collectHelp(root: Element | null, opts: { skipRows?: boolean; only?: (el: Element) => boolean } = {}): HelpEntry[] {
  if (!root) return [];
  const out: HelpEntry[] = [];
  const seen = new Set<string>();
  /** Each explained field's entry, so its own option cards join it instead of repeating its label. */
  const owners = new Map<Element, HelpEntry>();
  const add = (label: string, text: string, el?: Element) => {
    const k = `${label}|${text}`;
    if (!label || !text || seen.has(k)) return;
    seen.add(k);
    const e = { label, text };
    out.push(e);
    if (el) owners.set(el, e);
  };
  for (const el of root.querySelectorAll("[data-help], fieldset.ui-radio-cards")) {
    if (opts.skipRows && el.closest(".ui-section") && root.contains(el.closest(".ui-section"))) continue;
    if (opts.only && !opts.only(el)) continue;
    if (el.matches("fieldset")) {
      const options = [...el.querySelectorAll(".ui-radio-card")].map((c) => {
        const chip = c.querySelector(".ui-radio-card-aside .ui-chip")?.textContent?.trim();
        const desc = c.querySelector(".ui-radio-card-desc")?.textContent?.trim();
        const title = c.querySelector(".ui-radio-card-title")?.firstChild?.textContent?.trim();
        return `${title}${chip ? ` (${chip})` : ""}${desc ? `: ${desc}` : ""}`;
      });
      const owner = el.parentElement?.closest("[data-help]");
      const entry = owner && owners.get(owner);
      if (entry) entry.text = `${entry.text} ${options.join(" · ")}`;
      else add(el.querySelector("legend")?.textContent?.trim() ?? "", options.join(" · "));
    } else {
      add(labelOf(el), el.getAttribute("data-help") ?? "", el);
    }
  }
  return out;
}

/** The sheet that lists explained fields: full screen on phones, a centred panel on wider screens. */
export function HelpSheet(props: { open: boolean; onClose: () => void; title: string; icon?: IconName; entries: HelpEntry[] }) {
  return (
    <Sheet open={props.open} onClose={props.onClose} title={props.title} icon={props.icon} className="ui-help-sheet">
      {props.entries.length ? (
        <dl className="ui-help-list">
          {props.entries.map((e) => (
            <div key={`${e.label}|${e.text}`}>
              <dt>{e.label}</dt>
              <dd>{e.text}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="ui-help-empty">Nothing here needs explaining.</p>
      )}
    </Sheet>
  );
}

/**
 * An ⓘ that opens the help sheet for a part of the screen. `collect` reads the fields' help when
 * it opens (so it always matches what's there); `extra` adds fields that only appear after a choice.
 */
export function HelpButton(props: { title: string; icon?: IconName; collect: () => HelpEntry[]; extra?: readonly HelpEntry[]; className?: string }) {
  const [entries, setEntries] = useState<HelpEntry[] | null>(null);
  const open = () => {
    const found = props.collect();
    const more = (props.extra ?? []).filter((x) => !found.some((f) => f.label === x.label));
    setEntries([...found, ...more]);
  };
  return (
    <>
      <Button variant="ghost" icon="info" label={`About ${props.title}`} className={props.className} onClick={open} />
      <HelpSheet open={entries !== null} onClose={() => setEntries(null)} title={props.title} icon={props.icon} entries={entries ?? []} />
    </>
  );
}
