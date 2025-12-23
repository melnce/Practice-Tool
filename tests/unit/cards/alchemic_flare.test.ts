// @vitest-environment node
import { describe, it, expect } from "vitest";

// Mock window for cardDatabase if needed
if (typeof window === "undefined") {
  (global as any).window = {};
}

describe("Alchemic Flare Logic", () => {
  describe("Card JSON Check", () => {
    it("should have correct definitions", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const filePath = path.resolve(
        __dirname,
        "../../../cards/sets/10004_skybound-dragons.json",
      );

      if (!fs.existsSync(filePath)) throw new Error("JSON not found");

      const fileContent = fs.readFileSync(filePath, "utf-8");
      const cards = JSON.parse(fileContent);
      const flare = cards.find((c: any) => c.id === "10433310");

      expect(flare).toBeDefined();

      // Check Flare Spell Effects
      expect(flare.spell.length).toBe(3);

      // Effect 1: Damage Follower
      expect(flare.spell[0].op).toBe("select");
      expect(flare.spell[0].target).toContain("enemy:follower");
      expect(flare.spell[0].effects[0].op).toBe("damage");
      expect(flare.spell[0].effects[0].target).toBe("selected");
      expect(flare.spell[0].effects[0].amount).toBe(4);

      // Effect 2: Summon Magic Sediment
      expect(flare.spell[1].op).toBe("summon");
      expect(flare.spell[1].name).toBe("Magic Sediment");

      // Effect 3: Skybound Art
      expect(flare.spell[2].op).toBe("gate");
      expect(flare.spell[2].requirement).toBe(10);
      expect(flare.spell[2].effects[0].op).toBe("damage");
      expect(flare.spell[2].effects[0].target).toContain("enemy:leader");
      expect(flare.spell[2].effects[0].amount).toBe(2);
    });
  });
});
