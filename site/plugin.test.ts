import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../packages/db-tools/src/load.ts";
import { latestVersion } from "../scripts/changelog.ts";
import { pinnedVersion, setPluginVersion } from "../scripts/plugin-version.ts";

// plugin/: the plugin listed in AI assistants' plugin directories. Their checks are mirrored here so a
// submission doesn't bounce: README of 40+ words, a LICENSE, an exactly pinned npx launcher, text files only.
const PLUGIN = join(REPO_ROOT, "plugin");
const read = (p: string) => readFileSync(join(PLUGIN, p), "utf8");

function files(dir: string, base = ""): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f), `${base}${f}/`) : [`${base}${f}`]));
}

test("plugin: pins the npm server at the app's newest release", () => {
  const version = latestVersion(readFileSync(join(REPO_ROOT, "CHANGELOG.md"), "utf8"));
  assert.ok(version);
  assert.equal(pinnedVersion(read(".mcp.json")), version, "sync-public.sh moves the pin when it cuts a release");
  assert.equal(JSON.parse(read(".claude-plugin/plugin.json")).version, version);
});

test("plugin: meets the directories' checks", () => {
  const manifest = JSON.parse(read(".claude-plugin/plugin.json"));
  assert.match(manifest.name, /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/);
  for (const k of ["description", "author", "version", "license"]) assert.ok(manifest[k], `plugin.json ${k}`);
  const words = read("README.md").replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 40, `README has ${words} words`);
  assert.equal(read("LICENSE"), readFileSync(join(REPO_ROOT, "LICENSE"), "utf8"), "plugin/LICENSE is the repo's LICENSE");
  const server = JSON.parse(read(".mcp.json")).mcpServers["speaker-box-genius"];
  assert.equal(server.command, "npx");
  assert.deepEqual(server.args.filter((a: string) => a !== "-y"), [`speaker-box-genius@${pinnedVersion(read(".mcp.json"))}`, "mcp"]);
  for (const f of files(PLUGIN)) {
    if (f === ".claude-plugin/icon.png") continue;
    assert.match(f, /\.(md|json)$|^LICENSE$/, `${f}: only text files (no binaries, no .npmrc)`);
    assert.ok(statSync(join(PLUGIN, f)).size < 256 * 1024, `${f} under 256 KiB`);
  }
  // Claude directory listing icon: square PNG, 512–2048 px a side, under 2 MB. The portal takes it only on the
  // first save or submit of the plugin, so it must be on public before then.
  const icon = readFileSync(join(PLUGIN, ".claude-plugin/icon.png"));
  assert.equal(icon.subarray(1, 4).toString(), "PNG");
  const [w, h] = [icon.readUInt32BE(16), icon.readUInt32BE(20)];
  assert.ok(w === h && w >= 512 && w <= 2048, `icon ${w}×${h}`);
  assert.ok(icon.length < 2 * 1024 * 1024);
  const skill = read("skills/design-speaker-box/SKILL.md");
  assert.match(skill, /^---\nname: design-speaker-box\ndescription: [^\n]+\n---\n/);
});

test("plugin: the README lists every tool the server has", () => {
  const readme = read("README.md");
  for (const t of ["search_drivers", "get_driver", "simulate", "suggest_boxes", "find_passive_radiators", "read_share_link", "box_volume"]) assert.ok(readme.includes(`\`${t}\``), t);
});

test("plugin-version: moves the pin and the plugin's version together", () => {
  const r = setPluginVersion(read(".claude-plugin/plugin.json"), read(".mcp.json"), "9.8.7");
  assert.equal(JSON.parse(r.pluginJson).version, "9.8.7");
  assert.equal(pinnedVersion(r.mcpJson), "9.8.7");
  assert.deepEqual(JSON.parse(r.mcpJson).mcpServers["speaker-box-genius"].args, ["-y", "speaker-box-genius@9.8.7", "mcp"]);
  assert.throws(() => setPluginVersion("{}", "{}", "9.8.7"), /no speaker-box-genius@/);
  assert.throws(() => setPluginVersion("{}", read(".mcp.json"), "latest"), /not a version/);
  assert.equal(pinnedVersion('{"mcpServers":{"speaker-box-genius":{"args":["-y","speaker-box-genius@latest","mcp"]}}}'), null);
});
