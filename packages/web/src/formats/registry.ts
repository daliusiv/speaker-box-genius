import { csvFormat } from "./csv.ts";
import { dspFormat } from "./dsp.ts";
import { browserFormat, projectFormat } from "./project.ts";
import { spiceFormat } from "./spice.ts";
import type { ExportFormat } from "./types.ts";
import { wdrFormat, wprFormat } from "./winisd.ts";

/**
 * Everything Save & Export offers, in the order shown. A new format is one file and one line
 * here: the window builds its list, box checklist and settings from these.
 */
export const EXPORT_FORMATS: ExportFormat[] = [browserFormat, projectFormat, csvFormat, wprFormat, wdrFormat, spiceFormat, dspFormat];

export const exportFormat = (id: string) => EXPORT_FORMATS.find((f) => f.id === id);
