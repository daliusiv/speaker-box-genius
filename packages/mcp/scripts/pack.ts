/**
 * Lay out what gets published, from dist/sbg.mjs (vite build):
 *   dist/npm/   the npm package "speaker-box-genius" (bin: speaker-box-genius)
 *   dist/mcpb/  the Claude Desktop extension folder (pack it with `mcpb pack dist/mcpb`)
 *   dist/registry/server.json  the official MCP Registry entry (`mcp-publisher publish`, release-mcp.yml)
 *
 *   node --experimental-strip-types packages/mcp/scripts/pack.ts [--version x.y.z]
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { latestVersion } from "../../../scripts/changelog.ts";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const ROOT = join(HERE, "../..");
const DIST = join(HERE, "dist");
const i = process.argv.indexOf("--version");
const version = (i >= 0 ? process.argv[i + 1] : undefined) || process.env.SBG_MCP_VERSION || latestVersion(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8")) || "0.0.0";
const bundle = join(DIST, "sbg.mjs");
if (!readFileSync(bundle, "utf8").includes(`"${version}"`)) {
  console.error(`dist/sbg.mjs wasn't built for ${version}: run the build with SBG_MCP_VERSION=${version}`);
  process.exit(1);
}

const DESCRIPTION = "Speaker Box Genius as a local MCP server: AI assistants design speaker boxes with the simulator's own engine, on your machine.";
const REPO = "https://github.com/daliusiv/speaker-box-genius";
const HOME = "https://speakerboxgenius.com/mcp/";
/** The server's name in the official MCP Registry: speakerboxgenius.com, proven by a DNS TXT record. */
const MCP_NAME = "com.speakerboxgenius/mcp";
/** The Registry's short description (100 characters at most). */
const REGISTRY_DESCRIPTION = "Simulate sealed, ported and passive-radiator speaker boxes with a 1,900+ driver database.";
const TOOLS = [
  ["search_drivers", "Search the driver database by name and filters"],
  ["get_driver", "A driver's full record, sources and licence"],
  ["simulate", "Simulate boxes: F3, limits, max SPL, curves and a share link"],
  ["suggest_boxes", "Size sealed, ported and PR boxes for a driver"],
  ["find_passive_radiators", "Passive radiators that tune a box, best first"],
  ["read_share_link", "Read a Speaker Box Genius link back as a design and results"],
  ["box_volume", "Net internal volume of a box, wedge, tube or sphere"],
] as const;

// npm package.
const npm = join(DIST, "npm");
rmSync(npm, { recursive: true, force: true });
mkdirSync(npm, { recursive: true });
copyFileSync(bundle, join(npm, "sbg.mjs"));
copyFileSync(join(ROOT, "LICENSE"), join(npm, "LICENSE"));
copyFileSync(join(HERE, "npm-readme.md"), join(npm, "README.md"));
writeFileSync(
  join(npm, "package.json"),
  JSON.stringify(
    {
      name: "speaker-box-genius",
      version,
      description: DESCRIPTION,
      mcpName: MCP_NAME,
      type: "module",
      bin: { "speaker-box-genius": "sbg.mjs" },
      files: ["sbg.mjs", "README.md", "LICENSE"],
      engines: { node: ">=20" },
      license: "SEE LICENSE IN LICENSE",
      homepage: HOME,
      repository: { type: "git", url: `git+${REPO}.git` },
      keywords: ["mcp", "model-context-protocol", "loudspeaker", "speaker-box", "enclosure", "subwoofer", "passive-radiator", "winisd", "thiele-small"],
    },
    null,
    2,
  ) + "\n",
);

// Claude Desktop extension.
const mcpb = join(DIST, "mcpb");
rmSync(mcpb, { recursive: true, force: true });
mkdirSync(join(mcpb, "server"), { recursive: true });
copyFileSync(bundle, join(mcpb, "server", "sbg.mjs"));
copyFileSync(join(ROOT, "LICENSE"), join(mcpb, "LICENSE"));
copyFileSync(join(ROOT, "packages/web/public/icons/icon-512.png"), join(mcpb, "icon.png"));
writeFileSync(
  join(mcpb, "manifest.json"),
  JSON.stringify(
    {
      manifest_version: "0.3",
      name: "speaker-box-genius",
      display_name: "Speaker Box Genius",
      version,
      description: DESCRIPTION,
      long_description:
        "Search about 1,900 drivers, size sealed, ported and passive radiator boxes, find passive radiators and simulate any box type with Speaker Box Genius's engine (validated against WinISD, Hornresp and SPICE). Runs on your computer: no account, no telemetry; it only downloads the public driver database. Every answer comes with a share link that opens the design in the app.",
      author: { name: "Speaker Box Genius", url: "https://speakerboxgenius.com" },
      homepage: HOME,
      documentation: HOME,
      support: `${REPO}/issues`,
      repository: { type: "git", url: REPO },
      icon: "icon.png",
      license: "PolyForm-Noncommercial-1.0.0",
      keywords: ["speaker", "loudspeaker", "subwoofer", "enclosure", "winisd"],
      privacy_policies: ["https://speakerboxgenius.com/privacy/"],
      server: {
        type: "node",
        entry_point: "server/sbg.mjs",
        mcp_config: { command: "node", args: ["${__dirname}/server/sbg.mjs", "mcp"] },
      },
      tools: TOOLS.map(([name, description]) => ({ name, description })),
      prompts: [{ name: "design_a_box", description: "Pick and compare box designs for a driver and goal", arguments: ["driver", "goal"], text: "Help me design a speaker box for ${arguments.driver}. Goal: ${arguments.goal}" }],
      compatibility: { platforms: ["darwin", "win32", "linux"], runtimes: { node: ">=20.0.0" } },
    },
    null,
    2,
  ) + "\n",
);
// Official MCP Registry entry (same version as npm; the Registry checks npm's mcpName matches).
if (REGISTRY_DESCRIPTION.length > 100) throw new Error("REGISTRY_DESCRIPTION is over 100 characters");
const registry = join(DIST, "registry");
rmSync(registry, { recursive: true, force: true });
mkdirSync(registry, { recursive: true });
writeFileSync(
  join(registry, "server.json"),
  JSON.stringify(
    {
      $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
      name: MCP_NAME,
      title: "Speaker Box Genius",
      description: REGISTRY_DESCRIPTION,
      websiteUrl: HOME,
      repository: { url: REPO, source: "github", subfolder: "packages/mcp" },
      version,
      packages: [{ registryType: "npm", registryBaseUrl: "https://registry.npmjs.org", identifier: "speaker-box-genius", version, transport: { type: "stdio" }, packageArguments: [{ type: "positional", value: "mcp" }] }],
    },
    null,
    2,
  ) + "\n",
);
console.log(`speaker-box-genius ${version}: dist/npm, dist/mcpb and dist/registry ready`);
