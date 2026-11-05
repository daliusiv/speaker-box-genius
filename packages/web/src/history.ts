/**
 * Undo/redo history for the whole app state. Every change is a step, except that
 * changes arriving close together (typing a number, dragging the power slider) merge
 * into one step, so one undo takes back the whole edit rather than one keystroke.
 */
export interface History<S> {
  past: S[];
  present: S;
  future: S[];
  /** Time of the last change, for merging bursts. */
  lastAt: number;
  /** Whether the last change may absorb the next one (false right after undo/redo or a marked step). */
  open: boolean;
}

export type HistoryAction<S> =
  | {
      type: "set";
      update: (s: S) => S;
      now: number;
      step?: boolean;
      /** Starts a new step but leaves it open, so a gesture's later changes (`hold`) join it. */
      start?: boolean;
      /** Joins the open step however long ago it changed (the rest of a drag, even after a pause). */
      hold?: boolean;
    }
  | { type: "undo" }
  | { type: "redo" };

/** Changes this close together count as one step. */
export const MERGE_MS = 800;
export const MAX_STEPS = 100;

export const initHistory = <S>(present: S): History<S> => ({ past: [], present, future: [], lastAt: 0, open: false });

export function historyReducer<S>(h: History<S>, a: HistoryAction<S>): History<S> {
  switch (a.type) {
    case "set": {
      const next = a.update(h.present);
      if (Object.is(next, h.present)) return h;
      // `step` forces a step of its own (deleting a design right after typing must stay separately undoable).
      const merge = !a.step && !a.start && h.open && h.past.length > 0 && (a.hold || a.now - h.lastAt < MERGE_MS);
      return {
        past: merge ? h.past : [...h.past, h.present].slice(-MAX_STEPS),
        present: next,
        future: [],
        lastAt: a.now,
        open: !a.step,
      };
    }
    case "undo": {
      if (h.past.length === 0) return h;
      return {
        past: h.past.slice(0, -1),
        present: h.past[h.past.length - 1]!,
        future: [h.present, ...h.future],
        lastAt: 0,
        open: false,
      };
    }
    case "redo": {
      if (h.future.length === 0) return h;
      return {
        past: [...h.past, h.present],
        present: h.future[0]!,
        future: h.future.slice(1),
        lastAt: 0,
        open: false,
      };
    }
  }
}

