import { useEffect, useRef, useState } from "react";
import { REPO } from "./components.tsx";
import { Icon } from "./Icon.tsx";

/** "Ctrl+S" or "⌘S", for the menu's shortcut hints. */
export const shortcut = (key: string) =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? `⌘${key}` : `Ctrl+${key}`;

/** iPhone and iPad Safari have no install prompt: installing is Share → Add to Home Screen. */
const isIos = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/**
 * The ☰ menu: everything that isn't Share or the controls. The project (new, open, save: the
 * windows do the rest), the rest of the site, the app, and a footer of about-links, short
 * enough never to scroll. A dropdown on wide
 * screens, a panel from the right on phones (CSS). Esc or a click outside closes it; arrow
 * keys move between items; focus goes into it on opening and back to the button on closing.
 */
export function AppMenu(props: {
  /** Set while the browser offers to install the app. */
  install: (() => Promise<void>) | null;
  showTips: () => void;
  /** New project: open the design assistant (this tab if untouched, else a new one). */
  onAssistant: () => void;
  /** The current design's link, for "Report a problem". */
  reportUrl: () => string;
  /** Open the Save & Export window. */
  onExport: () => void;
  /** Open the Open / Import window. */
  onImport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = (focusButton = true) => {
    setOpen(false);
    setIosHelp(false);
    if (focusButton) button.current?.focus();
  };
  /** Run an item's action and close the menu. */
  const act = (f: () => void) => () => {
    close(false);
    f();
  };

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const outside = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
      const items = [...(panel.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]!.focus();
    };
    addEventListener("pointerdown", outside);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("pointerdown", outside);
      removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canInstall = props.install !== null;
  const iosInstall = !canInstall && isIos() && !isStandalone();

  return (
    <div className="app-menu" ref={root}>
      <button
        ref={button}
        type="button"
        className="secondary icon menu-button"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Projects, install, guides and more"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name="menu" size={20} />
      </button>
      {open && (
        <>
          <div className="app-menu-backdrop" aria-hidden="true" onClick={() => close(false)} />
          <div className="app-menu-panel" role="menu" aria-label="Menu" ref={panel}>
            <div className="app-menu-head">
              <b>Speaker Box Genius</b>
              <button type="button" className="icon" aria-label="Close menu" onClick={() => close()}>
                ✕
              </button>
            </div>

            <p className="menu-label">Project</p>
            {/* A new project starts in the design assistant: in this tab while the example is untouched, else a new tab. */}
            <button role="menuitem" onClick={act(props.onAssistant)}>
              <Icon name="plus" />
              New project… <span className="menu-note">assistant</span>
            </button>
            <button role="menuitem" onClick={act(props.onImport)}>
              <Icon name="open" />
              Open / Import… <span className="menu-note kbd">{shortcut("O")}</span>
            </button>
            <button role="menuitem" onClick={act(props.onExport)}>
              <Icon name="save" />
              Save / Export… <span className="menu-note kbd">{shortcut("S")}</span>
            </button>

            <hr />
            <p className="menu-label">Explore</p>
            <a role="menuitem" className="menu-link" href="/drivers/">
              <Icon name="speaker" />
              Drivers database
            </a>
            <a role="menuitem" className="menu-link" href="/guides/">
              <Icon name="book" />
              Guides
            </a>
            <a role="menuitem" className="menu-link" href="/validation/">
              <Icon name="verified" />
              Validation
            </a>

            <hr />
            <p className="menu-label">App</p>
            {canInstall && (
              <button role="menuitem" onClick={act(() => void props.install?.())}>
                <Icon name="install" />
                Install app <span className="menu-note">works offline</span>
              </button>
            )}
            {iosInstall && (
              <button role="menuitem" aria-expanded={iosHelp} onClick={() => setIosHelp(!iosHelp)}>
                <Icon name="install" />
                Install app <span className="menu-note">how</span>
              </button>
            )}
            {iosHelp && <p className="hint">In Safari, tap Share (the square with an arrow), then “Add to Home Screen”. It then opens like an app and works offline.</p>}
            <button role="menuitem" onClick={act(props.showTips)}>
              <Icon name="tip" />
              Getting started tips
            </button>
            <a role="menuitem" className="menu-link" href={props.reportUrl()} target="_blank" rel="noopener" onClick={() => close(false)}>
              <Icon name="bug" />
              Report a problem
            </a>

            <hr />
            <nav className="menu-footer" aria-label="About">
              <a role="menuitem" href={REPO} target="_blank" rel="noopener" onClick={() => close(false)}>
                GitHub
              </a>
              <a role="menuitem" href={`${REPO}#whats-next`} target="_blank" rel="noopener" onClick={() => close(false)}>
                Roadmap
              </a>
              <a role="menuitem" href="/about/">
                About
              </a>
              <a role="menuitem" href="/privacy/">
                Privacy
              </a>
              <a role="menuitem" href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener" onClick={() => close(false)}>
                Licence
              </a>
              <a role="menuitem" href={`${REPO}/blob/main/docs/data-sources.md`} target="_blank" rel="noopener" onClick={() => close(false)}>
                Credits
              </a>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
