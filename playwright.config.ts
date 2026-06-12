import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 90_000,
  retries: 0,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "e2e",
      testDir: "tests/e2e",
      testMatch: /.*\.spec\.ts$/,
      testIgnore: /qa\//,
      use: {
        baseURL: process.env.PW_BASE_URL ?? "http://localhost:5174",
        headless: true,
      },
      reporter: [["list"]],
      outputDir: "test-results/playwright",
    },
    {
      name: "qa",
      testDir: "tests/e2e/qa",
      testMatch: /.*\.spec\.ts$/,
      use: {
        baseURL: process.env.PW_BASE_URL ?? "http://localhost:5174?test=1",
        headless: true,
      },
      reporter: [["list"], ["html", { outputFolder: "test-results/qa/html", open: "never" }]],
      outputDir: "test-results/qa/artifacts",
    },
  ],
});
