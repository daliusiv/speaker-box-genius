import { strToU8, zipSync } from "fflate";
import type { OutFile } from "./types.ts";

/** Same-named files get " (2)", " (3)"… so none is lost in the zip. */
function unique(files: OutFile[]): OutFile[] {
  const seen = new Map<string, number>();
  return files.map((f) => {
    const n = (seen.get(f.name) ?? 0) + 1;
    seen.set(f.name, n);
    return n === 1 ? f : { ...f, name: f.name.replace(/(\.[^.]+)?$/, ` (${n})$1`) };
  });
}

/** One file as is; several in one zip (stored, not compressed: they're small text). */
export function bundle(files: OutFile[], zipName: string): OutFile {
  if (files.length === 1) return files[0]!;
  const entries: Record<string, Uint8Array> = {};
  for (const f of unique(files)) entries[f.name] = typeof f.data === "string" ? strToU8(f.data) : f.data;
  return { name: `${zipName}.zip`, data: zipSync(entries, { level: 0 }), type: "application/zip" };
}

/** Hand a file to the browser's downloads. */
export function downloadFile(f: OutFile): void {
  downloadBlob(new Blob([f.data as BlobPart], { type: f.type }), f.name);
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
