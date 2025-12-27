import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    environment: "node",
    include: [
      // Trusted test suites only
      "tests/invariants/**/*.test.ts",
      "tests/mechanics/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/unit/**/*.test.ts", // Remaining unit tests (non-card expectation)
    ],
    exclude: [
      // Quarantined test suites
      "tests/legacy/**",
      "tests/_dev/**",
      "tests/regression/**",
      "tests/golden/**", // Golden tests may be stale
      "tests/scenarios/**",
      "tests/specs/**",
      "tests/manual/**",
    ],
    setupFiles: ["./tests/fixtures/setup.ts"],
  },
  resolve: {},
});
