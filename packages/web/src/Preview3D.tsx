import { lazy, Suspense } from "react";
import type { AppState } from "./state.ts";

// The 3D view and its mesh code load only when someone opens it.
const Box3D = lazy(() => import("./Box3D.tsx"));

/** The volume calculator's 3D take-apart view, loaded on demand. */
export function Preview3D(props: { state: AppState }) {
  return (
    <Suspense fallback={<p className="hint box3d-loading">Loading the 3D view…</p>}>
      <Box3D state={props.state} />
    </Suspense>
  );
}
