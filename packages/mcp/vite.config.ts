// One self-contained file for npm and the Claude Desktop extension: Node won't strip TypeScript
// types inside node_modules, so the published package ships this bundle (every dependency inlined).
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { latestVersion } from "../../scripts/changelog.ts";

const VERSION = process.env.SBG_MCP_VERSION || latestVersion(readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8")) || "0.0.0";

export default defineConfig({
  define: { __SBG_VERSION__: JSON.stringify(VERSION), "import.meta.env.BASE_URL": JSON.stringify("/") },
  logLevel: "warn",
  build: {
    ssr: "src/cli.ts",
    target: "node20",
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    rollupOptions: { output: { entryFileNames: "sbg.mjs", inlineDynamicImports: true, banner: "#!/usr/bin/env node" } },
  },
  ssr: { noExternal: true, target: "node" },
});
