import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/golden/**/*.test.ts"],
        exclude: ["tests/_dev/**", "tests/regression/**"],
        setupFiles: ["./tests/fixtures/setup.ts"],
    },
    resolve: {
    },
});
