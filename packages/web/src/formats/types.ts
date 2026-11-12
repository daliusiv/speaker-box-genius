import type { Design } from "../sim.ts";
import type { AppState, DesignState } from "../state.ts";
import type { IconName } from "../iconPaths.ts";

/** One file to hand to the browser (or into a zip). */
export interface OutFile {
  name: string;
  data: string | Uint8Array;
  type: string;
}

/** A setting a format shows in the Save & Export window. Plain data, so formats stay testable without React. */
export type OptionField =
  | { key: string; label: string; kind: "select"; choices: { value: string; text: string }[]; help?: (value: string) => string }
  | { key: string; label: string; kind: "text"; help?: () => string };

export interface ExportContext {
  state: AppState;
  /** The simulated designs (runDesigns), comparison runs included. */
  designs: Design[];
  shareUrl: string;
}

/** Files to download, a message for something saved without a file, or why it can't be done. */
export type ExportResult = { files: OutFile[]; notes?: string[] } | { message: string } | string;

export interface ExportFormat {
  id: string;
  group: "project" | "sim" | "dsp";
  label: string;
  /** Shown next to the label: ".wpr", "this device"… */
  ext: string;
  icon: IconName;
  help: string;
  /** "workspace": the whole project; "designs": a checklist of boxes. */
  scope: "workspace" | "designs";
  /** Can this box be written? A string says why not (shown greyed). */
  supports?: (d: DesignState, s: AppState) => true | string;
  options?: OptionField[];
  defaults?: (s: AppState) => Record<string, string>;
  run(ctx: ExportContext, designIds: string[], opts: Record<string, string>): ExportResult;
  /** Button text; "Download" by default. */
  action?: string;
}

/** A file name from a driver or design name. */
export const safeName = (s: string, fallback = "speaker-box") => s.replace(/[^\w.-]+/g, " ").trim() || fallback;

export const GROUPS: Record<ExportFormat["group"], string> = {
  project: "Project",
  sim: "Simulators & data",
  dsp: "DSP",
};
