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
import { linkRef, referrerBucket, withoutRef } from "./telemetrySchema.ts";
import { SHARED_LINK } from "./start.ts";
import { guardDomForTranslation } from "./domGuard.ts";

// Before the first render: a page the browser translates must not blank the app (see domGuard.ts).
guardDomForTranslation();

// A short link is compressed, and decompressing is asynchronous: read it before the first
// render so a shared design never flashes the defaults first.
decodeStateAny(location.hash).then(
  (initial) => render(initial),
  () => render(null),
);

// A link from the MCP server carries ?ref=mcp: count it as where the visit came from (GoatCounter gets it
// from the tag in index.html), then drop it so the address bar is the plain share link again.
const REF = linkRef(location.search);
if (REF) history.replaceState(history.state, "", `${location.pathname}${withoutRef(location.search)}${location.hash}`);

function render(initial: Awaited<ReturnType<typeof decodeStateAny>>) {
  const referrer = REF ?? referrerBucket(document.referrer, location.hostname);
  track("app_opened", { entry: initial ? "share_link" : SHARED_LINK ? "shared_results" : "new", referrer });
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
