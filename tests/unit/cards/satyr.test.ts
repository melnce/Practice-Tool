// @vitest-environment node
import { describe, it, expect } from "vitest";

describe("Satyr, Open-Hearted Rover (10452120)", () => {
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

    const card = cards.find((c: any) => c.id === "10452120");
    expect(card).toBeDefined();
    expect(card.name).toBe("Satyr, Open-Hearted Rover");

    // Check Fanfare
    expect(card.fanfare).toBeDefined();
    expect(card.fanfare).toHaveLength(1);

    const effect = card.fanfare[0];
    expect(effect.op).toBe("gate");
    expect(effect.effects).toBeDefined();
    expect(effect.effects[0].op).toBe("evolve");
    expect(effect.effects[0].target).toBe("self");
  });
});






