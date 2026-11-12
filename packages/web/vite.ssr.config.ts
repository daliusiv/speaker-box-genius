import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The guide pages' charts (src/ssr/guideCharts.tsx), built for Node and imported by site/build.ts.
export default defineConfig({
  plugins: [react()],
  build: {
    ssr: "src/ssr/guideCharts.tsx",
    outDir: "ssr-dist",
    emptyOutDir: true,
    target: "node22",
    sourcemap: false,
    rollupOptions: { output: { entryFileNames: "guideCharts.mjs" } },
  },
  // The workspace packages are TypeScript sources: bundle them (Node won't strip types in node_modules).
  ssr: { noExternal: [/^@sbg\//] },
});
