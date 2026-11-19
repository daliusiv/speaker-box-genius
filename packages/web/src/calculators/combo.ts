/**
 * The calculators' database pickers: a text field with its own list of matches under it (above it
 * when there's no room below). Replaces the browser's own `<datalist>` popup, which a page can't
 * place: Chrome opens a long one beside the field when the field is low in the window.
 *
 * The page markup keeps `<input list="…">` + `<datalist>` (the pages' scripts fill the datalist,
 * as before); `wireCombos()` takes the `list` off, so the browser shows nothing, and draws the
 * datalist's options itself. Picking one sets the field and fires `input` and `change`, as the
 * browser's list does, so the pages' own handlers run unchanged.
 */

/** Most matches drawn at once; the rest are counted ("keep typing"). */
export const MAX_SHOWN = 100;

/**
 * The options that match what's typed: every word typed appears in the option (any case), the
 * ones that start with it first, otherwise in the list's order. An empty query matches all.
 */
export function matchOptions(options: readonly string[], query: string, limit = MAX_SHOWN): { items: string[]; more: number } {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const hits = words.length ? options.filter((o) => words.every((w) => o.toLowerCase().includes(w))) : [...options];
  if (q) {
    const first = hits.filter((o) => o.toLowerCase().startsWith(q));
    const rest = hits.filter((o) => !o.toLowerCase().startsWith(q));
    hits.splice(0, hits.length, ...first, ...rest);
  }
  return { items: hits.slice(0, limit), more: Math.max(0, hits.length - limit) };
}

/** The list opens above the field when there's less than this below it (px) and more above. */
const ROOM = 220;
/** Tallest the list gets (px), about 7 rows. */
const TALLEST = 320;

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITY[c]!);

/** Turns every `<input list>` under `root` into a picker with its own list. */
export function wireCombos(root: ParentNode = document) {
  root.querySelectorAll<HTMLInputElement>("input[list]").forEach(wireCombo);
}

function wireCombo(input: HTMLInputElement) {
  const listId = input.getAttribute("list");
  const source = listId ? document.getElementById(listId) : null;
  if (!source) return;
  input.removeAttribute("list");

  const wrap = document.createElement("span");
  wrap.className = "calc-combo";
  input.before(wrap);
  wrap.append(input);
  const ul = document.createElement("ul");
  ul.className = "calc-combo-list";
  ul.id = `${input.id}-listbox`;
  ul.setAttribute("role", "listbox");
  ul.hidden = true;
  wrap.append(ul);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", ul.id);
  input.setAttribute("aria-expanded", "false");

  let open = false;
  let active = -1;
  let items: string[] = [];
  /** Show the whole list (just focused, the field still holding a picked name) rather than matches. */
  let all = true;

  const options = () => Array.from(source.querySelectorAll("option"), (o) => o.value).filter(Boolean);

  const mark = () => {
    ul.querySelectorAll<HTMLElement>("[role=option]").forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
    const li = active >= 0 ? document.getElementById(`${ul.id}-${active}`) : null;
    if (li) {
      input.setAttribute("aria-activedescendant", li.id);
      li.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  };

  const render = () => {
    const opts = options();
    const m = matchOptions(opts, all ? "" : input.value);
    items = m.items;
    if (active >= items.length) active = items.length - 1;
    const rows = items.map((v, i) => `<li id="${ul.id}-${i}" role="option" aria-selected="false" data-i="${i}">${esc(v)}</li>`);
    if (!opts.length) rows.push('<li class="note" aria-disabled="true">Loading the list…</li>');
    else if (!items.length) rows.push('<li class="note" aria-disabled="true">No match in the database</li>');
    else if (m.more) rows.push(`<li class="note" aria-disabled="true">${m.more} more: keep typing to narrow it down</li>`);
    ul.innerHTML = rows.join("");
    mark();
  };

  /** Below the field, or above it when there's more room there; never taller than the room. */
  const place = () => {
    const r = input.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const above = r.top;
    const up = below < ROOM && above > below;
    ul.classList.toggle("up", up);
    ul.style.maxHeight = `${Math.max(120, Math.min(TALLEST, (up ? above : below) - 12))}px`;
  };

  const show = () => {
    if (!open) {
      open = true;
      ul.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
    place();
    render();
  };
  const hide = () => {
    if (!open) return;
    open = false;
    active = -1;
    ul.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };
  const choose = (v: string) => {
    input.value = v;
    hide();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  input.addEventListener("focus", () => {
    all = true;
    show();
  });
  input.addEventListener("click", () => {
    if (!open) show();
  });
  input.addEventListener("input", (e) => {
    if (!e.isTrusted) return; // our own, after a pick
    all = false;
    active = -1;
    show();
  });
  input.addEventListener("blur", hide);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show();
      if (!items.length) return;
      active = e.key === "ArrowDown" ? (active + 1) % items.length : active <= 0 ? items.length - 1 : active - 1;
      mark();
    } else if (e.key === "Enter" && open && active >= 0) {
      e.preventDefault();
      choose(items[active]!);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      hide();
    } else if (e.key === "Tab") hide();
  });
  // Keep the focus in the field while picking with the mouse or a finger.
  ul.addEventListener("mousedown", (e) => e.preventDefault());
  ul.addEventListener("click", (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>("[role=option]");
    if (li) choose(items[Number(li.dataset.i)]!);
  });
  // The page fills (or, on the subwoofer page, filters) the datalist while the list may be open.
  new MutationObserver(() => open && render()).observe(source, { childList: true });
  window.addEventListener("resize", () => open && place());
  window.addEventListener("scroll", () => open && place(), { passive: true });
}
