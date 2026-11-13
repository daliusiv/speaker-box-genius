import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, type AppState, type VentedDesign } from "../src/state.ts";
import { backDepthOf, enclosureOf, ventDistanceOf } from "../src/sim.ts";

const [, ported] = DEFAULT_STATE.designs as [AppState["designs"][0], VentedDesign];
const vol = (link: string, shape: AppState["volume"]["shape"] = "box"): AppState["volume"] => ({ ...DEFAULT_STATE.volume, link, shape, depth_cm: 40, topDepth_cm: 20 });

test("port position: next to the driver, custom, and on the back from the linked volume calculator", () => {
  assert.equal(ventDistanceOf(ported, vol(ported.id)), 0);
  assert.equal(ventDistanceOf({ ...ported, ventAt: "custom", ventDistance_cm: 25 }), 25);
  assert.equal(ventDistanceOf({ ...ported, ventAt: "back" }, vol(ported.id)), 40);
  assert.equal(ventDistanceOf({ ...ported, ventAt: "back" }, vol(ported.id, "wedge")), 30);
  // Not linked, or a shape without a back panel: side by side.
  assert.equal(backDepthOf(ported, vol("none")), null);
  assert.equal(ventDistanceOf({ ...ported, ventAt: "back" }, vol("none")), 0);
  assert.equal(ventDistanceOf({ ...ported, ventAt: "back" }, vol(ported.id, "cylinder")), 0);
});

test("the engine gets the distance only when there is one", () => {
  const losses = DEFAULT_STATE.settings.losses;
  assert.equal("ventDistance_cm" in enclosureOf(ported, 50, losses), false);
  const e = enclosureOf({ ...ported, ventAt: "back" }, 50, losses, 18, vol(ported.id));
  assert.equal(e.kind === "vented" && e.ventDistance_cm, 40);
});
