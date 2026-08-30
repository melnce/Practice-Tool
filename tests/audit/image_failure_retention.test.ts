import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const BUILD_INDEX = join(ROOT, "build", "index.html");

function runHarness(imageMode: "abort" | "fulfill") {
  const env = {
    ...process.env,
    LISTENER_LEAK_PROBE: "0",
    LISTENER_LEAK_SNAPSHOT: "0",
    LISTENER_LEAK_CYCLES: "20",
    LISTENER_LEAK_SAMPLE_EVERY: "10",
    LISTENER_LEAK_IMAGE_MODE: imageMode,
    LISTENER_LEAK_DECK_INDEX: "11",
  };
  return spawnSync("npx", ["tsx", "scripts/listener-leak-harness.mjs"], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    timeout: 180_000,
  });
}

describe("image failure retention soak", () => {
  it(
    "keeps DOM flat when CDN card art is forced to fail",
    () => {
    if (!existsSync(BUILD_INDEX)) {
      spawnSync("npm", ["run", "build"], {
        cwd: ROOT,
        stdio: "inherit",
        timeout: 120_000,
      });
    }
    expect(existsSync(BUILD_INDEX)).toBe(true);

    const result = runHarness("abort");
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toMatch(/CDN image mode: abort/);
    expect(result.stdout).toMatch(/PASS: post-GC node\/listener trend is flat/);
    },
    180_000,
  );
});
