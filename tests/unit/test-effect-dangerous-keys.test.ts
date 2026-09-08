import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  runTestEffectDangerousKeysGate,
  scanEffectLiteralFiles,
} from "../../scripts/lib/test-effect-dangerous-keys.js";

describe("test-effect-dangerous-keys gate", () => {
  it("flags filter on return op with destination hand", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dangerous-keys-"));
    const file = path.join(dir, "sample.test.ts");
    fs.writeFileSync(
      file,
      `
export const fx = {
  op: "return",
  destination: "hand",
  target: "ally:follower",
  filter: { name: "Skeleton" },
};
`,
    );
    const violations = scanEffectLiteralFiles([file], dir);
    expect(
      violations.some(
        (v) =>
          v.op === "return" &&
          v.key === "filter" &&
          v.message.includes('destination:"hand"'),
      ),
    ).toBe(true);
  });

  it("flags filter, condition, and target on return op with destination deck", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dangerous-keys-"));
    const file = path.join(dir, "deck.test.ts");
    fs.writeFileSync(
      file,
      `
export const fx = {
  op: "return",
  destination: "deck",
  target: "ally:follower",
  condition: { name: "Skeleton" },
  filter: { name: "Skeleton" },
};
`,
    );
    const violations = scanEffectLiteralFiles([file], dir);
    expect(violations.map((v) => v.key).sort()).toEqual([
      "condition",
      "filter",
      "target",
    ]);
    expect(
      violations
        .filter((v) => v.key === "filter" || v.key === "condition")
        .every((v) => v.message.includes("returnHandToDeck")),
    ).toBe(true);
    const targetViolation = violations.find((v) => v.key === "target");
    expect(targetViolation?.message.includes("delete the key")).toBe(false);
    expect(
      violations
        .filter((v) => v.key === "filter" || v.key === "condition")
        .every((v) => v.message.includes("delete the key")),
    ).toBe(true);
  });

  it("deck return target violation does not tell reader to delete target", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dangerous-keys-"));
    const file = path.join(dir, "deck-target-msg.test.ts");
    fs.writeFileSync(
      file,
      `
export const fx = {
  op: "return",
  destination: "deck",
  target: "ally:follower",
  filter: { name: "Skeleton" },
};
`,
    );
    const violations = scanEffectLiteralFiles([file], dir);
    const targetViolation = violations.find((v) => v.key === "target");
    expect(targetViolation).toBeDefined();
    expect(targetViolation!.message).not.toMatch(/delete the key/i);
    expect(targetViolation!.message).toMatch(/return\/unified\.ts:37-40/);
  });

  it("flags condition on return op with destination deck", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dangerous-keys-"));
    const file = path.join(dir, "deck-condition.test.ts");
    fs.writeFileSync(
      file,
      `
export const fx = {
  op: "return",
  destination: "deck",
  target: "ally:follower",
  condition: { name: "Skeleton" },
};
`,
    );
    const violations = scanEffectLiteralFiles([file], dir);
    expect(violations.some((v) => v.key === "condition")).toBe(true);
  });

  it("allows bare target on deck return required by return/unified.ts validation", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dangerous-keys-"));
    const file = path.join(dir, "deck-target-only.test.ts");
    fs.writeFileSync(
      file,
      `
export const fx = {
  op: "return",
  destination: "deck",
  target: "ally:hand",
};
`,
    );
    const violations = scanEffectLiteralFiles([file], dir);
    expect(violations).toHaveLength(0);
  });

  it("flags filter conservatively when return destination is absent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dangerous-keys-"));
    const file = path.join(dir, "unknown.test.ts");
    fs.writeFileSync(
      file,
      `
export const fx = {
  op: "return",
  target: "ally:follower",
  filter: { name: "Skeleton" },
};
`,
    );
    const violations = scanEffectLiteralFiles([file], dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.key).toBe("filter");
  });

  it("passes when return to hand uses condition", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dangerous-keys-"));
    const file = path.join(dir, "ok-hand.test.ts");
    fs.writeFileSync(
      file,
      `
export const fx = {
  op: "return",
  destination: "hand",
  target: "ally:follower",
  condition: { name: "Skeleton" },
};
`,
    );
    const violations = scanEffectLiteralFiles([file], dir);
    expect(violations).toHaveLength(0);
  });

  it("flags filter on keyword op", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dangerous-keys-"));
    const file = path.join(dir, "keyword.test.ts");
    fs.writeFileSync(
      file,
      `
export const fx = {
  op: "keyword",
  action: "grant",
  target: "ally:follower",
  keywords: ["Rush"],
  filter: { type: "Follower" },
};
`,
    );
    const violations = scanEffectLiteralFiles([file], dir);
    expect(
      violations.some((v) => v.op === "keyword" && v.key === "filter"),
    ).toBe(true);
  });

  it("flags bare cost inside search filter", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dangerous-keys-"));
    const file = path.join(dir, "search.test.ts");
    fs.writeFileSync(
      file,
      `
export const fx = {
  op: "search" as const,
  filter: { cost: 8 },
  count: 1,
};
`,
    );
    const violations = scanEffectLiteralFiles([file], dir);
    expect(violations.some((v) => v.key === "filter.cost")).toBe(true);
  });

  it("skips object literals containing a spread", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dangerous-keys-"));
    const file = path.join(dir, "spread.test.ts");
    fs.writeFileSync(
      file,
      `
const base = { destination: "hand", target: "ally:follower", filter: { name: "X" } };
export const fx = { op: "return", ...base };
`,
    );
    const violations = scanEffectLiteralFiles([file], dir);
    expect(violations).toHaveLength(0);
  });

  it("runTestEffectDangerousKeysGate passes on clean fixture tree", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dangerous-keys-"));
    const testsDir = path.join(dir, "tests");
    fs.mkdirSync(testsDir);
    fs.writeFileSync(
      path.join(testsDir, "ok.test.ts"),
      `export const fx = { op: "draw", count: 1 };`,
    );
    const gate = runTestEffectDangerousKeysGate({
      rootDir: dir,
      testRoots: ["tests"],
      testGlob: "tests/**/*.ts",
      excludedRelPaths: [],
    });
    expect(gate.exitCode).toBe(0);
  });
});
