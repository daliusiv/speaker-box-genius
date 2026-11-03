import { useEffect, useState } from "react";

/** The browser's install prompt (Chrome, Edge, Android). Not in the DOM typings yet. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Header extras: an Install button when the browser offers one, and an Offline badge. */
export function PwaStatus() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // show our own button instead of the browser's mini-bar
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

  return (
    <>
      {!online && (
        <span className="offline-badge" title="No connection. The app and driver database are running from the copy saved on this device.">
          Offline
        </span>
      )}
      {prompt && (
        <button
          type="button"
          className="secondary"
          title="Install as an app: opens in its own window and works offline"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          }}
        >
          Install app
        </button>
      )}
    </>
  );
}
