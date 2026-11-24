# @sbg/mcp

Speaker Box Genius as a local [MCP](https://modelcontextprotocol.io) server. An AI app (Claude Desktop, Claude Code, Cursor, VS Code…) runs the simulator's own engine on your machine: no account, no telemetry, nothing about your designs leaves it. The only network use is fetching the public driver database from speakerboxgenius.com/db/, cached locally.

Tools (all read-only): `search_drivers`, `get_driver`, `simulate`, `suggest_boxes`, `find_passive_radiators`, `read_share_link`, `box_volume`. Resources: `sbg://about`, `sbg://schema/sim-request`. Prompt: `design_a_box`.

The tools wrap [`@sbg/headless`](../headless), which runs the web app's modules, so the numbers are the app's.

## Run from a checkout

```sh
pnpm i
pnpm mcp            # stdio server using this checkout's drivers/ and passive-radiators/
```

Claude Code: `claude mcp add sbg-dev -- node --experimental-strip-types /path/to/repo/packages/mcp/src/cli.ts mcp --db /path/to/repo`

Options: `--offline` (cache only), `--db <folder>` (a checkout), `--cache <folder>`, `--site-db <url>`.

## Tests

`test/server.test.ts` drives every tool through an in-memory MCP client; `test/stdio.test.ts` starts the server as an AI app does and calls `simulate`.
