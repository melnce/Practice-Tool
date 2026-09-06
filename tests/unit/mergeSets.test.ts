import { describe, it } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("mergeSets", () => {
  it("cards:update writes all.json and index.json that pass prettier --check", () => {
    execSync("npm run cards:update", { cwd: ROOT, stdio: "pipe" });
    execSync("npx prettier --check cards/all.json cards/index.json", {
      cwd: ROOT,
      stdio: "pipe",
    });
  }, 120_000); // shell-out under load can exceed vitest's default 5 s timeout
});
