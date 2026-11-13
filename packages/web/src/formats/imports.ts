/**
 * What a dropped or picked file is, from its name and first bytes, and what it can be used for.
 * Project, WinISD/OpenISD files and Hornresp records open straight away; a measurement can mean more than one
 * thing, so the Open window asks.
 */
export type ImportKind = "project" | "winisd" | "hornresp" | "measurement";

export type ImportUse = "measure-driver" | "overlay-impedance" | "overlay-response";

export const IMPORT_USES: Record<ImportUse, { label: string; help: string }> = {
  "measure-driver": { label: "Measure the driver", help: "A free-air impedance sweep: fit the T/S parameters from it." },
  "overlay-impedance": { label: "Show impedance on the charts", help: "A sweep of the finished box, over the simulated impedance." },
  "overlay-response": { label: "Show response on the charts", help: "A measured frequency response of the finished box, level-matched to the first design." },
};

/** A project file's extension, and its media type. */
export const PROJECT_EXT = ".sbgenius";
export const PROJECT_MIME = "application/vnd.speakerboxgenius+json";

/**
 * Every type the Open window takes, for the file picker. The media types are there for phones:
 * iOS and Android don't know .sbgenius, and may grey out a file whose type isn't listed.
 */
export const IMPORT_ACCEPT = `${PROJECT_EXT},${PROJECT_MIME},application/json,.json,.wpr,.wdr,.owpr,.owdr,.zma,.frd,.txt,.csv,.dat`;

const PROJECT_MARK = /"app"\s*:\s*"speaker-box-genius"/;

export function importKind(name: string, head: string): ImportKind | null {
  const ext = /\.([^.]+)$/.exec(name.toLowerCase())?.[1] ?? "";
  // A project opens whatever it's called: .sbgenius, older .json saves, or renamed to .txt to get past a forum.
  if (ext === "sbgenius" || PROJECT_MARK.test(head)) return "project";
  if (ext === "json") return "winisd";
  if (["wpr", "wdr", "owpr", "owdr"].includes(ext)) return "winisd";
  if (["zma", "frd", "txt", "csv", "dat"].includes(ext)) {
    // A WinISD file saved as .txt still opens as one.
    if (/^\s*\[(Box|Driver|Project)\]/im.test(head)) return "winisd";
    // A Hornresp record (its export is a .txt).
    if (/^\s*ID\s*=\s*\d/m.test(head) && /\|(HORN|TRADITIONAL DRIVER) PARAMETER VALUES/i.test(head)) return "hornresp";
    return "measurement";
  }
  return null;
}

/** The uses a measurement file offers, most likely first. */
export function importUses(name: string): ImportUse[] {
  const ext = /\.([^.]+)$/.exec(name.toLowerCase())?.[1] ?? "";
  if (ext === "zma") return ["measure-driver", "overlay-impedance"];
  if (ext === "frd") return ["overlay-response"];
  return ["measure-driver", "overlay-impedance", "overlay-response"];
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", else the date. */
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const min = Math.round((now - t) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 8) return `${d} day${d > 1 ? "s" : ""} ago`;
  return new Date(t).toLocaleDateString();
}
