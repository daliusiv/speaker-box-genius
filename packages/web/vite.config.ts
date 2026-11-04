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
  },
});
