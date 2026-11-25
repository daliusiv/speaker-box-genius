# Speaker Box Genius MCP server

Lets an AI assistant (Claude, Cursor, VS Code…) design speaker boxes with [Speaker Box Genius](https://speakerboxgenius.com)'s own simulator, on your computer. It can search about 1,900 drivers, size sealed, ported and passive radiator boxes, find passive radiators, simulate any box type (validated against WinISD, Hornresp and SPICE), work out a box's net volume, and read Speaker Box Genius share links. Every design comes back with a link that opens it in the app.

**Private:** runs locally, no account, no telemetry. The only thing it downloads is the public driver database (cached, so it also works offline). Share links it returns end in `?ref=mcp` before the `#`, so speakerboxgenius.com can count visits from AI answers (only that tag, never the design).

MCP Registry: `com.speakerboxgenius/mcp`.

## Add it to your AI app

Claude Desktop: download the one-click extension from https://speakerboxgenius.com/mcp/, or add to `claude_desktop_config.json`:

```json
{ "mcpServers": { "speaker-box-genius": { "command": "npx", "args": ["-y", "speaker-box-genius", "mcp"] } } }
```

Claude Code: `claude mcp add speaker-box-genius -- npx -y speaker-box-genius mcp`

Cursor, VS Code and others: the same command, `npx -y speaker-box-genius mcp`. Needs Node.js 20 or newer.

Options: `--offline` (cached database only), `--cache <folder>`.

## Tools

`search_drivers`, `get_driver`, `simulate`, `suggest_boxes`, `find_passive_radiators`, `read_share_link`, `box_volume`. All read-only.

Try: *"Find a 12-inch subwoofer under 40 L sealed with F3 below 35 Hz and give me the link."*

More: https://speakerboxgenius.com/mcp/

## Licence

Code: PolyForm Noncommercial 1.0.0 (see LICENSE). Driver data: CC BY-NC-SA 4.0, except a few brands under their own terms (the server says which). Source: https://github.com/daliusiv/speaker-box-genius
