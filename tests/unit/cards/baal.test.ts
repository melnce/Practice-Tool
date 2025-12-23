// @vitest-environment node
import { describe, it, expect } from "vitest";

describe("Baal, Elemental Resonance (10452130)", () => {
  it("should have correct Choose Fanfare definition", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      __dirname,
      "../../../cards/sets/10004_skybound-dragons.json",
    );

    if (!fs.existsSync(filePath)) throw new Error("JSON not found");

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const cards = JSON.parse(fileContent);

    const card = cards.find((c: any) => c.id === "10452130");
    expect(card).toBeDefined();
    expect(card.name).toBe("Baal, Elemental Resonance");

    // Check Fanfare
    expect(card.fanfare).toBeDefined();
    expect(card.fanfare).toHaveLength(1);

    const chooseOp = card.fanfare[0];
    expect(chooseOp.op).toBe("mode");
    expect(chooseOp.options).toHaveLength(2);

    // Option 1: Buff Self + Random Ally
    const op1 = chooseOp.options[0];
    expect(op1.effects).toHaveLength(2);
    expect(op1.effects[0].op).toBe("stat");
    expect(op1.effects[1].op).toBe("select");
    expect(op1.effects[1].mode).toBe("random");
    expect(op1.effects[1].condition.not_self).toBe(true);

    // Option 2: Damage Random Enemy (migrated to canonical damage)
    const op2 = chooseOp.options[1];
    expect(op2.effects[0].op).toBe("damage");
    expect(op2.effects[0].distribution).toBe("random_hits");
    expect(op2.effects[0].amount).toBe(3);
  });
});
