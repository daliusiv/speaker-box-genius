import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the site from /<repo-name>/.
// If you add a custom domain later, change base to "/".
export default defineConfig({
  base: "/speaker-box-genius/",
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
