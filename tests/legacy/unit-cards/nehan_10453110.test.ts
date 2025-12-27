// @vitest-environment node
import { describe, it, expect } from "vitest";

describe("Nehan, Dispenser of Samsara (10453110)", () => {
  it("should have correct Fanfare definition", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      __dirname,
      "../../../cards/sets/10004_skybound-dragons.json",
    );

    if (!fs.existsSync(filePath)) throw new Error("JSON not found");

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const cards = JSON.parse(fileContent);

    const card = cards.find((c: any) => c.id === "10453110");
    expect(card).toBeDefined();
    expect(card.name).toBe("Nehan, Dispenser of Samsara");

    // Check Fanfare
    expect(card.fanfare).toBeDefined();
    expect(card.fanfare).toHaveLength(2);

    // Effect 1: Evolve all unevolved allies (unified format)
    expect(card.fanfare[0].op).toBe("evolve");
    expect(card.fanfare[0].target).toBe("all_allies");

    // Effect 2: Damage Leader (self damage)
    expect(card.fanfare[1].op).toBe("damage");
    expect(card.fanfare[1].target).toBe("ally:leader");
    expect(card.fanfare[1].amount).toBe(2);
  });
});






