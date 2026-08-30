import { defineConfig } from "@playwright/test";
import { existsSync } from "fs";

const CHROME_EXECUTABLE =
  process.env.CHROME_PATH ||
  (existsSync("/opt/pw-browsers/chromium/chrome")
    ? "/opt/pw-browsers/chromium/chrome"
    : existsSync("/opt/google/chrome/chrome")
      ? "/opt/google/chrome/chrome"
      : existsSync("/usr/local/bin/google-chrome")
        ? "/usr/local/bin/google-chrome"
        : undefined);

export default defineConfig({
  timeout: 90_000,
  retries: 0,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
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
        baseURL: process.env.PW_BASE_URL ?? "http://localhost:5173",
        headless: true,
        ...(CHROME_EXECUTABLE
          ? { launchOptions: { executablePath: CHROME_EXECUTABLE } }
          : {}),
      },
      reporter: [["list"]],
      outputDir: "test-results/playwright",
    },
    {
      name: "qa",
      testDir: "tests/e2e/qa",
      testMatch: /.*\.spec\.ts$/,
      use: {
        baseURL: process.env.PW_BASE_URL ?? "http://localhost:5173?test=1",
        headless: true,
        ...(CHROME_EXECUTABLE
          ? { launchOptions: { executablePath: CHROME_EXECUTABLE } }
          : {}),
      },
      reporter: [
        ["list"],
        ["html", { outputFolder: "test-results/qa/html", open: "never" }],
      ],
      outputDir: "test-results/qa/artifacts",
    },
  ],
});
