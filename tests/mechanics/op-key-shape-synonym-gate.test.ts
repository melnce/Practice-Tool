/**
 * Gate sabotage for BH synonym cleanup — fallback_leader, stat amount, discard keys, random pick.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkOpKeysForCard } from "../../scripts/op-keys-gate.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..");

function gateFails(card: Record<string, unknown>): boolean {
  const setPath = path.join(ROOT, "cards/sets/__bh_gate_test__.json");
  fs.writeFileSync(setPath, JSON.stringify([card], null, 2));
  try {
    execSync(
      "npx tsx scripts/check-canonical-form.ts --gate=op-key-shape --fail",
      { cwd: ROOT, stdio: "pipe", encoding: "utf-8" },
    );
    return false;
  } catch {
    return true;
  } finally {
    fs.unlinkSync(setPath);
  }
}

function gateOutput(card: Record<string, unknown>): string {
  const setPath = path.join(ROOT, "cards/sets/__bh_gate_test__.json");
  fs.writeFileSync(setPath, JSON.stringify([card], null, 2));
  try {
    return execSync(
      "npx tsx scripts/check-canonical-form.ts --gate=op-key-shape --fail 2>&1 || true",
      { cwd: ROOT, encoding: "utf-8" },
    );
  } finally {
    fs.unlinkSync(setPath);
  }
}

const base = {
  id: "99999998",
  name: "BH Gate Sabotage",
  type: "Spell",
  class: "Neutral",
  cost: "0",
};

describe("op-key-shape synonym gate sabotage", () => {
  it("flags fallback_leader on damage", () => {
    const card = {
      ...base,
      spell: [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 1,
          select: 1,
          fallback_leader: true,
        },
      ],
    };
    expect(gateFails(card)).toBe(true);
    expect(gateOutput(card)).toContain("99999998");
  });

  it("flags stat amount", () => {
    const card = {
      ...base,
      spell: [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          select: 1,
          amount: 1,
          attack: 1,
          defense: 1,
        },
      ],
    };
    expect(gateFails(card)).toBe(true);
    expect(gateOutput(card)).toContain("amount");
  });

  it("flags countdown random:true", () => {
    const card = {
      ...base,
      spell: [
        {
          op: "countdown",
          action: "delay",
          board_name: "Test",
          select: 1,
          random: true,
        },
      ],
    };
    expect(gateFails(card)).toBe(true);
    expect(gateOutput(card)).toContain("countdown");
  });
});

describe("op-keys-gate discard/stat allowlist sabotage", () => {
  const cardBase = {
    id: "99999997",
    name: "OpKeys Sabotage",
    type: "Follower",
    class: "Neutral",
    cost: "0",
  };

  it("flags discard select key", () => {
    const issues = checkOpKeysForCard({
      ...cardBase,
      fanfare: [{ op: "discard", select: 1, optional: true }],
    });
    expect(issues.some((i) => i.message.includes('"select"'))).toBe(true);
    expect(issues.some((i) => i.message.includes('"optional"'))).toBe(true);
  });

  it("flags stat amount key", () => {
    const issues = checkOpKeysForCard({
      ...cardBase,
      fanfare: [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          select: 1,
          amount: 1,
          attack: 1,
          defense: 1,
        },
      ],
    });
    expect(issues.some((i) => i.message.includes('"amount"'))).toBe(true);
  });
});
