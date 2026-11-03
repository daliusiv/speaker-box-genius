import { useEffect, useState } from "react";

/** The browser's install prompt (Chrome, Edge, Android). Not in the DOM typings yet. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Install and connection state. `install` is set while the browser offers to install
 * the app (we show our own button instead of the browser's mini-bar).
 */
export function usePwa(): { online: boolean; install: (() => Promise<void>) | null } {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setPrompt(null);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return {
    online,
    install: prompt
      ? async () => {
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }
      : null,
  };
}

/** Header extras: an Install button (wide screens; phones get it in the Projects menu) and an Offline badge. */
export function PwaStatus({ pwa }: { pwa: ReturnType<typeof usePwa> }) {
  return (
    <>
      {!pwa.online && (
        <span className="offline-badge" title="No connection. The app and driver database are running from the copy saved on this device.">
          Offline
        </span>
      )}
      {pwa.install && (
        <button
          type="button"
          className="secondary install-button"
          title="Install as an app: opens in its own window and works offline"
          onClick={pwa.install}
        >
          Install app
        </button>
      )}
    </>
  );
}
