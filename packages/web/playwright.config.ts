import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression for the UI kit (/ui/): Chromium on Linux only, so the stored screenshots
 * are Linux ones (`pnpm test:ui:update` rewrites them; commit the PNGs it changes).
 */
const PORT = 4179;

export default defineConfig({
  testDir: "e2e",
  // One baseline per screenshot, for Linux CI (no platform in the name).
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      // Anti-aliasing differs a hair between machines; a real change moves far more pixels.
      maxDiffPixelRatio: 0.002,
    },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    colorScheme: "dark",
    reducedMotion: "reduce",
    locale: "en-GB",
    timezoneId: "UTC",
  },
  projects: [
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/ui/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
