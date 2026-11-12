import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { decodeStateAny } from "./state.ts";
import "@fontsource-variable/inter";
import "./styles.css";

// A short link is compressed, and decompressing is asynchronous: read it before the first
// render so a shared design never flashes the defaults first.
decodeStateAny(location.hash).then(
  (initial) => render(initial),
  () => render(null),
);

function render(initial: Awaited<ReturnType<typeof decodeStateAny>>) {
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
