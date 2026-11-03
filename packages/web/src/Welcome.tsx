import { useState } from "react";

/**
 * First-visit help. New visitors get a short "Getting started" card; people who open
 * a shared link get a one-line note that the design is theirs to change. Both can be
 * dismissed; the card can be brought back from the footer.
 */

const KEY = "sbg.tips-dismissed";

// Browser storage can be unavailable (private modes, embedded views): treat it as empty.
const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const write = (v: boolean) => {
  try {
    if (v) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* not remembered: fine */
  }
};

/**
 * Whether the page was opened from a link carrying a design. Read once, before the app
 * rewrites the address. The app keeps its own design in the address bar too, so a reload
 * of this tab (marked in sessionStorage, which lives as long as the tab) doesn't count.
 */
const OPENED_FROM_LINK = (() => {
  if (typeof location === "undefined" || !/(?:^#|&)s=/.test(location.hash)) return false;
  try {
    const seen = sessionStorage.getItem("sbg.tab") === "1";
    sessionStorage.setItem("sbg.tab", "1");
    return !seen;
  } catch {
    return true;
  }
})();
try {
  sessionStorage.setItem("sbg.tab", "1");
} catch {
  /* unavailable */
}

export function useWelcome() {
  const [tips, setTips] = useState(() => !OPENED_FROM_LINK && !read());
  const [linkNote, setLinkNote] = useState(OPENED_FROM_LINK);
  return {
    tips,
    linkNote,
    dismissTips: () => {
      write(true);
      setTips(false);
    },
    showTips: () => {
      write(false);
      setLinkNote(false);
      setTips(true);
    },
    dismissLinkNote: () => setLinkNote(false),
  };
}

export function GettingStarted(props: { onDismiss: () => void }) {
  return (
    <section className="card welcome" aria-labelledby="welcome-title">
      <div className="welcome-head">
        <h2 id="welcome-title">Getting started</h2>
        <button type="button" className="icon" aria-label="Close getting started tips" onClick={props.onDismiss}>
          ×
        </button>
      </div>
      <ol>
        <li>
          <b>Load your driver.</b> Use <i>Browse drivers</i> (about 200 in the database), paste the parameters from a
          datasheet, import a WinISD file, or type them in. Values you type are never overwritten; the rest are
          calculated.
        </li>
        <li>
          <b>Shape the boxes.</b> A sealed, a ported and a passive radiator design are already set up for comparison. Change
          the volume and tuning, try a preset like <i>QB3</i>, or add a bandpass. Up to 8 designs.
        </li>
        <li>
          <b>Read the charts.</b> Dashed red lines are limits: cone and PR Xmax, port chuffing. Raise <i>Power</i> at the
          top to see where each design runs out, and check <i>Maximum SPL</i> for what limits it first. Red in the table
          means over a limit.
        </li>
        <li>
          <b>Share it.</b> The address bar is always a live link to exactly what you see. <i>Share</i> also makes a forum
          image, Reddit or diyAudio text, and a CSV.
        </li>
      </ol>
      <div className="welcome-foot">
        <span className="muted">Works offline after your first visit.</span>
        <button type="button" className="secondary" onClick={props.onDismiss}>
          Got it
        </button>
      </div>
    </section>
  );
}

export function LinkNote(props: { onDismiss: () => void; onTips: () => void }) {
  return (
    <div className="link-note" role="status">
      <span>
        You opened a design from a link. It's your own copy: change anything, and the original link stays as it was.{" "}
        <button type="button" className="link" onClick={props.onTips}>
          How does this work?
        </button>
      </span>
      <button type="button" className="icon" aria-label="Close" onClick={props.onDismiss}>
        ×
      </button>
    </div>
  );
}
