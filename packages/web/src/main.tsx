// First, so errors while the app starts are caught too (crash reports and usage stats, see /privacy/).
import { track } from "./telemetry.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { decodeStateAny } from "./state.ts";
import "@fontsource-variable/inter";
import "./styles.css";
import "./ui/tokens.css";
import "./ui/ui.css";
import "./driver-card.css";
import "./boxes.css";
import "./signal.css";
import "./build.css";
import "./settings.css";
import "./library.css";
import "./headroom.css";
import "./submit-dialog.css";
import { referrerBucket } from "./telemetrySchema.ts";
import { SHARED_LINK } from "./start.ts";

// A short link is compressed, and decompressing is asynchronous: read it before the first
// render so a shared design never flashes the defaults first.
decodeStateAny(location.hash).then(
  (initial) => render(initial),
  () => render(null),
);

function render(initial: Awaited<ReturnType<typeof decodeStateAny>>) {
  const referrer = referrerBucket(document.referrer, location.hostname);
  track("app_opened", { entry: initial ? "share_link" : SHARED_LINK ? "shared_results" : "new", ...(referrer ? { referrer } : {}) });
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App initial={initial} />
    </StrictMode>,
  );
}

// Offline support: the service worker saves the app and the driver database.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
