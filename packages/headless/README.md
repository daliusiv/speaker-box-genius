# @sbg/headless

Speaker Box Genius without the browser. A `SimRequest` (plain JSON: a driver, a drive, some boxes) goes in; the app's own numbers come out, with a share link that opens the same design in the app.

It runs the web app's own modules (`packages/web/src/sim.ts`, `state.ts`, `presets.ts`), the same way the site build does, so its results can't drift from the app's. Used by the local MCP server.

- `validateRequest(raw)`: errors that name the field (and suggest the right key).
- `buildState(req, { db })`: the request as the app's state. The app's own sections and design fields go through the app's link parser, so they mean exactly what they mean in a share link.
- `simulateRequest(req, { db })` / `simulateState(state)`: per box F3, tuning, limits at the drive, max SPL, sampled curves, share link.
- `stateFromLink(url)` + `fromState(state)`: read a share link back as an editable request.
- `simRequestSchema`: JSON Schema of the request.
- `Database`: where driver and PR ids are looked up (the live site's `/db/` files, a cache or a checkout).

```ts
const r = await simulateRequest(
  { driver: { id: "dayton-audio/rss315hf-4" }, drive: "rated", designs: [{ kind: "vented", size: "auto" }] },
  { db },
);
r.designs[0].f3_hz; // 24.23
r.share_link; // https://speakerboxgenius.com/#z=…
```

Tests (`test/app-parity.test.ts`) check that a state taken through a request gives exactly the app's numbers for every site example and every WinISD and Hornresp reference case.
