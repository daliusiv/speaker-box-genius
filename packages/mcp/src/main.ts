/**
 * speaker-box-genius mcp [--db <repo checkout>] [--offline] [--cache <dir>] [--site-db <url>]
 *
 * Starts the MCP server on stdin/stdout for an AI app (Claude Desktop, Claude Code, Cursor, VS Code…).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { siteDatabase, treeDatabase } from "@sbg/headless";
import { createServer, VERSION } from "./server.ts";

const HELP = `Speaker Box Genius ${VERSION}

Usage:
  speaker-box-genius mcp [options]   Run the MCP server (stdio) for an AI app

Options:
  --offline          Use the cached driver database only (no network)
  --db <folder>      Use a repo checkout's drivers/ and passive-radiators/ instead of the site
  --cache <folder>   Where to cache the driver database (default: your user cache folder)
  --site-db <url>    Database address (default https://speakerboxgenius.com/db/)
  --version, --help

Add to Claude Desktop / Cursor / VS Code:
  { "command": "npx", "args": ["-y", "speaker-box-genius", "mcp"] }
Claude Code:
  claude mcp add speaker-box-genius -- npx -y speaker-box-genius mcp

More: https://speakerboxgenius.com/mcp/`;

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) {
    process.stderr.write(`${name} needs a value\n`);
    process.exit(2);
  }
  return v;
}

export async function main(argv = process.argv.slice(2)) {
  const [cmd] = argv;
  if (argv.includes("--version")) return void process.stdout.write(`${VERSION}\n`);
  if (!cmd || cmd === "--help" || argv.includes("--help") || cmd !== "mcp") {
    process.stdout.write(`${HELP}\n`);
    if (cmd && cmd !== "--help" && cmd !== "mcp") process.exitCode = 2;
    return;
  }
  const dbPath = arg(argv, "--db");
  const db = dbPath ? treeDatabase(dbPath) : siteDatabase({ offline: argv.includes("--offline"), cacheDir: arg(argv, "--cache"), base: arg(argv, "--site-db") });
  const server = createServer(db);
  await server.connect(new StdioServerTransport());
  // stdout is the protocol channel: anything human goes to stderr.
  process.stderr.write(`Speaker Box Genius MCP server ${VERSION} running (database: ${db.label})\n`);
}
