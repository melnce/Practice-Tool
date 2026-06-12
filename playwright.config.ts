import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.PW_BASE_URL ?? "http://localhost:5174",
    headless: true,
  },
  reporter: [["list"]],
  outputDir: "test-results/playwright",
});
