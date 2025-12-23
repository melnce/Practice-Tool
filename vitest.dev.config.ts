import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/_dev/**/*.ts", "tests/_dev/**/*.test.ts"],
    setupFiles: ["./tests/fixtures/setup.ts"],
  },
  resolve: {},
});
