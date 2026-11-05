import { useCallback, useReducer } from "react";
import { historyReducer, initHistory } from "./history.ts";

/** useState with undo/redo. `setState(x, {step: true})` makes the change a separate step. */
export function useUndoable<S>(initial: () => S) {
  const [h, dispatch] = useReducer(historyReducer<S>, undefined, () => initHistory(initial()));
  const setState = useCallback(
    (v: S | ((s: S) => S), opts?: { step?: boolean; start?: boolean; hold?: boolean }) =>
      dispatch({ type: "set", update: typeof v === "function" ? (v as (s: S) => S) : () => v, now: Date.now(), step: opts?.step, start: opts?.start, hold: opts?.hold }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  return { state: h.present, setState, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
