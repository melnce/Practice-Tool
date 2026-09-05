import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      include: [
        "tests/invariants/**/*.test.ts",
        "tests/mechanics/**/*.test.ts",
        "tests/integration/**/*.test.ts",
        "tests/unit/**/*.test.ts",
        "tests/regression/**/*.test.ts",
        "tests/scenarios/**/*.test.ts",
        "tests/golden/**/*.test.ts",
      ],
      exclude: [
        "tests/_dev/**",
        "tests/audit/**",
        "tests/specs/**",
        "tests/manual/**",
      ],
      setupFiles: ["./tests/fixtures/setup.ts"],
    },
    resolve: {
      alias: {
        "@core": path.resolve(__dirname, "src/core"),
        "@data": path.resolve(__dirname, "src/data"),
        "@logic": path.resolve(__dirname, "src/logic"),
        "@ui": path.resolve(__dirname, "src/ui"),
        "@helpers": path.resolve(__dirname, "src/helpers"),
        "@ops": path.resolve(__dirname, "src/logic/effects/ops"),
      },
    },
  }),
);
