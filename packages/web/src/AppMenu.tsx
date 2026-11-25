import { useEffect, useRef, useState } from "react";
import { REPO } from "./components.tsx";
import { Icon, type IconName } from "./Icon.tsx";

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

/** The site pages the menu links to (the service worker saves these with the app). */
const SITE_LINKS = ["/drivers/", "/guides/", "/validation/", "/about/", "/privacy/"];

/**
 * Offline: which of the menu's site pages are saved on this device (they still open).
 * Online: null (everything opens).
 */
function useSavedPages(online: boolean, open: boolean): Set<string> | null {
  const [saved, setSaved] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (online || !open) return setSaved(null);
    let live = true;
    setSaved(new Set());
    if (typeof caches === "undefined") return;
    void Promise.all(SITE_LINKS.map(async (href) => ((await caches.match(href).catch(() => undefined)) ? href : null))).then((hits) => {
      if (live) setSaved(new Set(hits.filter((h): h is string => h !== null)));
    });
    return () => {
      live = false;
    };
  }, [online, open]);
  return saved;
}

/** Offline and not saved: greyed out with a crossed Wi-Fi icon, and a tap does nothing. */
const OFFLINE_TITLE = "Needs a connection: not saved on this device";
const offlineProps = {
  "aria-disabled": true,
  className: "is-offline",
  title: OFFLINE_TITLE,
  onClick: (e: { preventDefault: () => void }) => e.preventDefault(),
} as const;

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
  /** False while offline: links that can't open are greyed out. */
  online: boolean;
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

  const saved = useSavedPages(props.online, open);
  /** Offline and not saved on this device (external links never are). */
  const off = (href: string) => saved !== null && !saved.has(href);
  /** A menu row linking to a site page (or out). */
  const link = (href: string, icon: IconName, label: string, external = false) =>
    off(href) ? (
      <a role="menuitem" {...offlineProps} className="menu-link is-offline" href={href}>
        <Icon name="wifiOff" />
        {label}
      </a>
    ) : (
      <a role="menuitem" className="menu-link" href={href} {...(external ? { target: "_blank", rel: "noopener", onClick: () => close(false) } : {})}>
        <Icon name={icon} />
        {label}
      </a>
    );
  /** A footer link (text only). */
  const foot = (href: string, label: string, external = true) =>
    off(href) ? (
      <a role="menuitem" {...offlineProps} href={href}>
        <Icon name="wifiOff" size={14} />
        {label}
      </a>
    ) : (
      <a role="menuitem" href={href} {...(external ? { target: "_blank", rel: "noopener", onClick: () => close(false) } : {})}>
        {label}
      </a>
    );

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
            {link("/drivers/", "speaker", "Drivers database")}
            {link("/guides/", "book", "Guides")}
            {link("/validation/", "verified", "Validation")}

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
            {link(props.reportUrl(), "bug", "Report a problem", true)}

            <hr />
            <nav className="menu-footer" aria-label="About">
              {foot(REPO, "GitHub")}
              {foot(`${REPO}#whats-next`, "Roadmap")}
              {foot("/about/", "About", false)}
              {foot("/privacy/", "Privacy", false)}
              {foot(`${REPO}/blob/main/LICENSE`, "Licence")}
              {foot(`${REPO}/blob/main/docs/data-sources.md`, "Credits")}
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
