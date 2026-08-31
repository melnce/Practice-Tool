// @vitest-environment node
import { describe, it, expect } from "vitest";

describe("Nezha JSON Definition", () => {
  it("should have correct definitions for Rush and EOT effects", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      __dirname,
      "../../../cards/sets/10004_skybound-dragons.json",
    );

    if (!fs.existsSync(filePath)) throw new Error("JSON not found");

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const cards = JSON.parse(fileContent);

    const card = cards.find((c: any) => c.id === "10452110");
    expect(card).toBeDefined();
    expect(card.name).toBe("Nezha, Soaring War God");

    // 1. Check Rush
    expect(card.keywords).toContain("Rush");

    // 2. Check Triggers
    expect(card.triggers).toBeDefined();
    expect(card.triggers).toHaveLength(1);

    const eot = card.triggers[0];
    expect(eot.event).toBe("end_of_turn");
    expect(eot.condition?.whose_turn).toBe("owner");
    expect(eot.effects).toHaveLength(2);

    // Effect 1: Deal 4 (migrated to canonical damage with random_hits)
    expect(eot.effects[0].op).toBe("damage");
    expect(eot.effects[0].distribution).toBe("random_hits");
    expect(eot.effects[0].target).toBe("enemy:follower");
    expect(eot.effects[0].amount).toBe(4);

    // Effect 2: Deal 2 (migrated to canonical damage with random_hits)
    expect(eot.effects[1].op).toBe("damage");
    expect(eot.effects[1].distribution).toBe("random_hits");
    expect(eot.effects[1].target).toBe("enemy:follower");
    expect(eot.effects[1].amount).toBe(2);
  });
});






