import type { ReactNode } from "react";
import { Icon } from "../Icon.tsx";

/** A short message in the flow of a panel: info, warn (check this) or over (past a limit). */
export function Notice(props: { tone?: "info" | "warn" | "over"; children: ReactNode }) {
  const tone = props.tone ?? "info";
  return (
    <div className="ui-notice" data-tone={tone} role={tone === "info" ? "note" : "status"}>
      <span className="ui-notice-icon" aria-hidden="true">
        <Icon name={tone === "info" ? "info" : "tip"} />
      </span>
      <div>{props.children}</div>
    </div>
  );
}
