import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { latestVersion } from "../../scripts/changelog.ts";

// The released version (CHANGELOG.md's newest "## 1.2.0 (date)"; empty before 1.0.0), shown
// beside the Changelog link. The public sync writes it (scripts/sync-public.sh).
const APP_VERSION = latestVersion(readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8")) ?? "";

// Served at the root of its own domain, speakerboxgenius.com (see public/CNAME).
// Without the custom domain, GitHub Pages would serve it from /<repo-name>/ instead.
export default defineConfig({
  base: "/",
  plugins: [react()],
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(APP_VERSION) },
  build: {
    target: "es2022",
    sourcemap: true,
    // The manifest tells the site build (site/calculators.ts) which file each calculator's script became.
    manifest: true,
    rollupOptions: {
      input: {
        // Vite resolves these against the project root (packages/web).
        main: "index.html",
        // The UI kit catalogue at /ui/ (noindex): every component in every state.
        ui: "ui/index.html",
        "calc-port-length": "src/calculators/portLength.ts",
        "calc-passive-radiator": "src/calculators/passiveRadiator.ts",
        "calc-sealed-box": "src/calculators/sealedBox.ts",
        "calc-ported-box": "src/calculators/portedBox.ts",
        "calc-subwoofer-box": "src/calculators/subwooferBox.ts",
        "calc-box-volume": "src/calculators/boxVolume.ts",
        "calc-open-baffle": "src/calculators/openBaffle.ts",
      },
    },
  },
});
