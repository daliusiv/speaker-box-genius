import { useEffect, useRef, useState } from "react";
import { REPO } from "./components.tsx";
import { useProjects } from "./Projects.tsx";
import type { AppState } from "./state.ts";

/** Saved projects shown before "All saved…". */
const RECENT = 5;

/** iPhone and iPad Safari have no install prompt: installing is Share → Add to Home Screen. */
const isIos = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/**
 * The ☰ menu: everything that isn't Share or the controls. Most-used first: the project (new,
 * save, open), the app (install, tips), the rest of the site, and about. A dropdown on wide
 * screens, a panel from the right on phones (CSS). Esc or a click outside closes it; arrow
 * keys move between items; focus goes into it on opening and back to the button on closing.
 */
export function AppMenu(props: {
  state: AppState;
  onOpen: (s: AppState) => void;
  notify: (m: string) => void;
  /** Set while the browser offers to install the app. */
  install: (() => Promise<void>) | null;
  showTips: () => void;
  /** New project: open the design assistant (this tab if untouched, else a new one). */
  onAssistant: () => void;
  /** The current design's link, for "Report a problem". */
  reportUrl: () => string;
}) {
  const [open, setOpen] = useState(false);
  const [allSaved, setAllSaved] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const p = useProjects(props);

  const close = (focusButton = true) => {
    setOpen(false);
    setAllSaved(false);
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
    p.refresh();
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

  const shown = allSaved ? p.saved : p.saved.slice(0, RECENT);
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
        ☰
      </button>
      {p.fileInputElement}
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
              New project… <span className="menu-note">design assistant</span>
            </button>
            <button role="menuitem" onClick={act(p.save)}>
              Save in this browser…
            </button>
            {shown.map((x) => (
              <div key={x.name} className="saved-row">
                <button role="menuitem" onClick={act(() => p.openSaved(x))} title={`Saved ${new Date(x.savedAt).toLocaleString()}`}>
                  {x.name}
                </button>
                <button className="icon" aria-label={`Delete ${x.name}`} title="Delete" onClick={() => p.remove(x)}>
                  ✕
                </button>
              </div>
            ))}
            {!allSaved && p.saved.length > RECENT && (
              <button role="menuitem" className="menu-more" onClick={() => setAllSaved(true)}>
                All saved ({p.saved.length})…
              </button>
            )}
            <button role="menuitem" onClick={act(p.download)}>
              Save project file (.json)
            </button>
            <button role="menuitem" onClick={act(p.openFile)}>
              Open project file…
            </button>

            <hr />
            <p className="menu-label">App</p>
            {canInstall && (
              <button role="menuitem" onClick={act(() => void props.install?.())}>
                Install app <span className="menu-note">works offline</span>
              </button>
            )}
            {iosInstall && (
              <button role="menuitem" aria-expanded={iosHelp} onClick={() => setIosHelp(!iosHelp)}>
                Install app <span className="menu-note">how</span>
              </button>
            )}
            {iosHelp && <p className="hint">In Safari, tap Share (the square with an arrow), then “Add to Home Screen”. It then opens like an app and works offline.</p>}
            <button role="menuitem" onClick={act(props.showTips)}>
              Getting started tips
            </button>

            <hr />
            <p className="menu-label">Explore</p>
            <a role="menuitem" className="menu-link" href="/drivers/">
              Drivers
            </a>
            <a role="menuitem" className="menu-link" href="/guides/">
              Guides
            </a>
            <a role="menuitem" className="menu-link" href="/validation/">
              Validation
            </a>

            <hr />
            <p className="menu-label">About</p>
            <a role="menuitem" className="menu-link" href={props.reportUrl()} target="_blank" rel="noopener" onClick={() => close(false)}>
              Report a problem
            </a>
            <a role="menuitem" className="menu-link" href={REPO} target="_blank" rel="noopener" onClick={() => close(false)}>
              GitHub
            </a>
            <a role="menuitem" className="menu-link" href={`${REPO}/blob/main/docs/build-plan.md`} target="_blank" rel="noopener" onClick={() => close(false)}>
              Roadmap
            </a>
            <a role="menuitem" className="menu-link" href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener" onClick={() => close(false)}>
              Licence
            </a>
            <a role="menuitem" className="menu-link" href="/about/">
              About
            </a>
            <a role="menuitem" className="menu-link" href="/privacy/">
              Privacy
            </a>
            <a role="menuitem" className="menu-link" href={`${REPO}/blob/main/docs/data-sources.md`} target="_blank" rel="noopener" onClick={() => close(false)}>
              Driver data credits
            </a>
            <p className="hint">Browser saves stay on this device. Project files and share links work anywhere.</p>
          </div>
        </>
      )}
    </div>
  );
}
