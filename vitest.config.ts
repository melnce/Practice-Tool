import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts"],
        setupFiles: ["./tests/setup.ts"],
    },
    resolve: {
        alias: [
            { find: "@core", replacement: path.resolve(__dirname, "./dist/core") },
            { find: "@logic", replacement: path.resolve(__dirname, "./dist/logic") },
            { find: "@ui", replacement: path.resolve(__dirname, "./dist/ui") },
            { find: "@helpers", replacement: path.resolve(__dirname, "./dist/helpers") },
            { find: "@data", replacement: path.resolve(__dirname, "./dist/data") },
            { find: "@ops", replacement: path.resolve(__dirname, "./dist/logic/effects/ops") },
        ]
    },
});
