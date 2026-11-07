import { useState } from "react";

const KEY = "sbg.foldedDesigns";

function load(): Set<string> {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/**
 * Which box designs are folded to one line. Kept for this browser tab only (not in the project
 * or share links, and not across visits, where another project's designs could share the ids),
 * so a shared link opens with every design showing.
 */
export function useFolded() {
  const [folded, setFolded] = useState<Set<string>>(load);
  const save = (next: Set<string>) => {
    setFolded(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      // Storage full or blocked: folding still works for this visit.
    }
  };
  return {
    isFolded: (id: string) => folded.has(id),
    fold: (id: string, on: boolean) => {
      const next = new Set(folded);
      if (on) next.add(id);
      else next.delete(id);
      save(next);
    },
    foldAll: (ids: string[], on: boolean) => {
      const next = new Set(folded);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      save(next);
    },
  };
}
