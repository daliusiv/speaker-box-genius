/**
 * The plugin in plugin/ (AI assistants' plugin directories) runs the MCP server from npm pinned to one
 * exact version (`npx -y speaker-box-genius@1.2.0 mcp`): the directories refuse `@latest`. That pin is
 * the app's newest release, so scripts/sync-public.sh moves it (and plugin.json's version) with the
 * changelog when it cuts a release, and release-mcp.yml then publishes that version to npm.
 *
 *   node --experimental-strip-types scripts/plugin-version.ts set <version> <plugin.json> <.mcp.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

export const PACKAGE = "speaker-box-genius";
const PIN = new RegExp(`^${PACKAGE}@(\\d+\\.\\d+\\.\\d+)$`);

/** The npm version .mcp.json runs, or null when it doesn't pin one exactly. */
export function pinnedVersion(mcpJson: string): string | null {
  const args: unknown = JSON.parse(mcpJson)?.mcpServers?.[PACKAGE]?.args;
  if (!Array.isArray(args)) return null;
  for (const a of args) {
    const m = typeof a === "string" ? PIN.exec(a) : null;
    if (m) return m[1]!;
  }
  return null;
}

/** Both files with `version` as the plugin's version and the pinned npm version. */
export function setPluginVersion(pluginJson: string, mcpJson: string, version: string): { pluginJson: string; mcpJson: string } {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`not a version: ${version}`);
  const plugin = JSON.parse(pluginJson);
  plugin.version = version;
  const mcp = JSON.parse(mcpJson);
  const server = mcp?.mcpServers?.[PACKAGE];
  if (!server || !Array.isArray(server.args) || !server.args.some((a: unknown) => typeof a === "string" && PIN.test(a))) {
    throw new Error(`.mcp.json has no ${PACKAGE}@<version> argument to move`);
  }
  server.args = server.args.map((a: unknown) => (typeof a === "string" && PIN.test(a) ? `${PACKAGE}@${version}` : a));
  return { pluginJson: JSON.stringify(plugin, null, 2) + "\n", mcpJson: JSON.stringify(mcp, null, 2) + "\n" };
}

if (import.meta.main) {
  const [cmd, version, pluginPath, mcpPath] = process.argv.slice(2);
  if (cmd !== "set" || !version || !pluginPath || !mcpPath) {
    console.error("usage: plugin-version.ts set <version> <plugin.json> <.mcp.json>");
    process.exit(2);
  }
  const r = setPluginVersion(readFileSync(pluginPath, "utf8"), readFileSync(mcpPath, "utf8"), version);
  writeFileSync(pluginPath, r.pluginJson);
  writeFileSync(mcpPath, r.mcpJson);
}
