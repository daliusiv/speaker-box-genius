# Speaker Box Genius plugin

Lets your AI assistant design loudspeaker boxes with [Speaker Box Genius](https://speakerboxgenius.com)'s own simulator. Ask what box suits a driver, how deep a sealed, ported or passive radiator box will play, whether it runs out of cone travel or the port gets noisy at your amplifier's power, which passive radiator to use, or what a box's net volume is. Every design comes back with a link that opens it in the web app.

The simulator is checked against WinISD, Hornresp and SPICE: see the [validation page](https://speakerboxgenius.com/validation/).

## Install

In Claude Code:

```
/plugin install speaker-box-genius --marketplace daliusiv/speaker-box-genius
```

Other apps (Claude Desktop, Cursor, VS Code): see https://speakerboxgenius.com/mcp/.

## What it contains

- **An MCP server**, `speaker-box-genius` from npm, started on your computer with `npx -y speaker-box-genius@<version> mcp` (needs Node.js 20 or newer). Its tools, all read-only: `search_drivers`, `get_driver`, `simulate`, `suggest_boxes`, `find_passive_radiators`, `read_share_link`, `box_volume`.
- **A skill**, `design-speaker-box`, that tells the assistant how to use those tools: find the driver, start from sized boxes, check the limits at real power, and give you the share link.

## What it runs, sends and fetches

- It runs the npm package `speaker-box-genius` at the exact version in `.mcp.json`. Its source is in this repository (`packages/mcp`, `packages/headless`, `packages/engine`).
- The only network requests are downloads of the public driver database from `https://speakerboxgenius.com/db/` (cached in your user cache folder, so it also works offline). Nothing about your designs or your questions is sent anywhere, and there is no telemetry.
- Share links it returns carry `?ref=mcp`, so speakerboxgenius.com can count visits that came from an AI answer (only that tag, never the design). See the [privacy page](https://speakerboxgenius.com/privacy/).
- It can't change anything on your computer: no files written except its database cache.

## Licence

Free for non-commercial use: PolyForm Noncommercial 1.0.0 (see `LICENSE`). Driver data: CC BY-NC-SA 4.0, except a few brands under their own terms (the server's `get_driver` says which).
