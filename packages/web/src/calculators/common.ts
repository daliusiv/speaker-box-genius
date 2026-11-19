/**
 * What every calculator page's script shares: element lookups, HTML escaping, the inputs kept in
 * the page address (query.ts), and the "Copy link" button. The pages' HTML comes from the site
 * build (site/calculators.ts); these work on it.
 */
import { decodeQuery, encodeQuery, type QuerySpec, type QueryValues } from "./query.ts";

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
/** A number field's value (a comma taken as the decimal point); 0 when empty. */
export const val = (id: string) => Number(($<HTMLInputElement>(id)?.value ?? "").replace(",", "."));

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Escapes text for HTML content and quoted attribute values, in one pass. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]!);

/** What the form holds now, by link key. */
export function readForm(spec: QuerySpec): QueryValues {
  const out: QueryValues = {};
  for (const [k, f] of Object.entries(spec)) {
    const el = $<HTMLInputElement | HTMLSelectElement>(f.id);
    if (!el) continue;
    out[k] = f.kind === "check" ? ((el as HTMLInputElement).checked ? (f.on ?? "1") : "") : el.value;
  }
  return out;
}

/** Puts values into the form (a check's radio group follows: ticking one unticks the rest). */
export function applyValues(spec: QuerySpec, values: QueryValues) {
  for (const [k, v] of Object.entries(values)) {
    const f = spec[k];
    const el = f && $<HTMLInputElement | HTMLSelectElement>(f.id);
    if (!f || !el) continue;
    if (f.kind === "check") (el as HTMLInputElement).checked = v !== "";
    else el.value = v;
  }
}

/**
 * The page address kept in step with the form. `start()` takes the form's own values as the
 * defaults and returns what the link asks for (the page applies it, in its own order: units
 * first, then values); `save()` rewrites the address after each change, without a history entry.
 */
export function pageQuery(spec: QuerySpec, extra: QueryValues = {}) {
  let defaults: QueryValues = {};
  return {
    start(): QueryValues {
      defaults = { ...readForm(spec), ...extra };
      return decodeQuery(location.search, spec);
    },
    /** `omit`: keys the link leaves out (values another key already carries, such as a database PR's). */
    save(values: QueryValues = {}, omit: readonly string[] = []) {
      const keep = Object.fromEntries(Object.entries(spec).filter(([k]) => !omit.includes(k)));
      const q = encodeQuery({ ...readForm(spec), ...values }, defaults, keep);
      if (q !== location.search) history.replaceState(history.state, "", `${location.pathname}${q}${location.hash}`);
    },
  };
}

/** Wires a "Copy link" button: copies the page address (with the inputs) and says so for 2 s. */
export function wireCopyLink(id: string) {
  const btn = $<HTMLButtonElement>(id);
  if (!btn) return;
  const label = btn.querySelector<HTMLElement>(".label");
  const say = (text: string) => {
    if (!label) return;
    label.textContent = text;
    window.setTimeout(() => (label.textContent = "Copy link"), 2000);
  };
  btn.hidden = false;
  btn.addEventListener("click", () => {
    const url = location.href;
    const fallback = () => {
      // No clipboard (an old browser, or an insecure page): show the link to copy by hand.
      window.prompt("Copy this link:", url);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => say("Copied"), fallback);
    else fallback();
  });
}
