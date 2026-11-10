import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served at the root of its own domain, speakerboxgenius.com (see public/CNAME).
// Without the custom domain, GitHub Pages would serve it from /<repo-name>/ instead.
export default defineConfig({
  base: "/",
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
    // The manifest tells the site build (site/calculators.ts) which file each calculator's script became.
    manifest: true,
    rollupOptions: {
      input: {
        // Vite resolves these against the project root (packages/web).
        main: "index.html",
        "calc-port-length": "src/calculators/portLength.ts",
        "calc-passive-radiator": "src/calculators/passiveRadiator.ts",
      },
    },
  },
});
