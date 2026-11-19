import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile ("are you human?"), loaded only when the submit form opens, so the app never
 * loads a third-party script otherwise. Managed mode: most people only see a tick.
 * The action must match the submit Worker's TURNSTILE_ACTION.
 */
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function Turnstile(props: { siteKey: string; onToken: (token: string) => void; onError?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(props);
  cb.current = props;
  useEffect(() => {
    let id: string | undefined;
    let gone = false;
    load().then(
      () => {
        if (gone || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: props.siteKey,
          action: "submit-driver",
          theme: "dark",
          size: "flexible",
          callback: (t: string) => cb.current.onToken(t),
          "expired-callback": () => cb.current.onToken(""),
          "error-callback": () => {
            cb.current.onToken("");
            cb.current.onError?.();
          },
        });
      },
      () => cb.current.onError?.(),
    );
    return () => {
      gone = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [props.siteKey]);
  return <div ref={box} className="sd-turnstile" />;
}
