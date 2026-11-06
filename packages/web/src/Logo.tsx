/** The app icon's speaker without its card (site/brand.ts draws the same shapes). */
export function Logo(props: { className?: string }) {
  return (
    <svg className={props.className ?? "logo"} viewBox="136 84 240 344" aria-hidden="true">
      <rect x="136" y="84" width="240" height="344" rx="26" fill="#2a2f40" />
      <circle cx="256" cy="168" r="32" fill="#8e96aa" />
      <circle cx="256" cy="310" r="80" fill="none" stroke="#f97316" strokeWidth="26" />
      <circle cx="256" cy="310" r="30" fill="#8e96aa" />
    </svg>
  );
}

/** Line icons for the assistant's "What are you building?" tiles (24 × 24, drawn in currentColor). */
export function UseIcon({ use }: { use: "car" | "home" | "hifi" | "tower" | "other" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className="use-icon" viewBox="0 0 24 24" aria-hidden="true">
      {use === "car" && (
        <g {...common}>
          {/* A car from the side: roof, windows, body and two wheels. */}
          <path d="M3 15.5v-2.8c0-.7.4-1.3 1-1.6l2.2-1 2.3-3.1c.4-.6 1.1-1 1.9-1h4.1c.7 0 1.4.3 1.8.9l2.4 3.2 1.7.5c.9.3 1.6 1.1 1.6 2.1v2.8" />
          <path d="M3 15.5h1.6M9.4 15.5h5.2M19.4 15.5H21" />
          <circle cx="7" cy="15.5" r="2.2" />
          <circle cx="17" cy="15.5" r="2.2" />
          <path d="M7.2 10.1h11.3" />
        </g>
      )}
      {use === "home" && (
        <g {...common}>
          {/* A house with a subwoofer inside. */}
          <path d="M3.5 10.5 12 3.5l8.5 7" />
          <path d="M5.5 9v11h13V9" />
          <rect x="8.5" y="11.5" width="7" height="7" rx="1" />
          <circle cx="12" cy="15" r="2" />
        </g>
      )}
      {use === "hifi" && (
        <g {...common}>
          {/* A two-way bookshelf speaker: tweeter above a woofer. */}
          <rect x="6" y="2.5" width="12" height="19" rx="1.6" />
          <circle cx="12" cy="7" r="1.6" />
          <circle cx="12" cy="14.5" r="4" />
          <circle cx="12" cy="14.5" r="1.3" />
        </g>
      )}
      {use === "tower" && (
        <g {...common}>
          {/* A tall floor-standing speaker: tweeter over two woofers, on feet. */}
          <rect x="7.5" y="1.5" width="9" height="19.5" rx="1.4" />
          <circle cx="12" cy="4.6" r="1.1" />
          <circle cx="12" cy="9.4" r="2.6" />
          <circle cx="12" cy="15.6" r="2.6" />
          <path d="M8.5 21v1.5M15.5 21v1.5" />
        </g>
      )}
      {use === "other" && (
        <g {...common}>
          {/* Sliders: set your own. */}
          <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
          <circle cx="15" cy="6" r="2" />
          <circle cx="9" cy="12" r="2" />
          <circle cx="17" cy="18" r="2" />
        </g>
      )}
    </svg>
  );
}
