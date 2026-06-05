import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Card-behavior audit tests (assert from card text; failures = bug reports). */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      include: ["tests/audit/**/*.test.ts"],
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
