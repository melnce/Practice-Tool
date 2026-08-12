import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 90_000,
  retries: 0,
  // Reuse the already-running Vite on 5173 — do not spawn webServer.
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    launchOptions: { executablePath: "/opt/google/chrome/chrome" },
  },
  projects: [
    {
      name: "hotseat",
      testDir: "tests/e2e",
      testMatch: /hotseat_completeness\.spec\.ts$/,
      reporter: [["list"]],
      outputDir: "test-results/hotseat",
    },
  ],
});
