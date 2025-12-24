// @vitest-environment node
import { describe, it, expect } from "vitest";

// Mock window for cardDatabase if needed
if (typeof window === "undefined") {
  (global as any).window = {};
}

describe("Wamdus Logic", () => {
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
      const wamdus = cards.find((c: any) => c.id === "10434110");

      expect(wamdus).toBeDefined();

      // Check Fanfare
      expect(wamdus.fanfare.length).toBeGreaterThan(0);
      expect(wamdus.fanfare[0].op).toBe("spellboost");
      expect(wamdus.fanfare[0].target).toBe("hand");

      // Check Triggers
      // Check Spellboost Keyword
      expect(wamdus.keywords.length).toBeGreaterThan(0);
      const sb = wamdus.keywords.find((k: any) => k.name === "Spellboost");
      expect(sb).toBeDefined();
      expect(sb.effects[0].op).toBe("stat");
      expect(sb.effects[0].attack).toBe(1);

      // Check Super-Evolve (should be in superevolve array, not evolve)
      expect(wamdus.evolve).toEqual([]);
      expect(wamdus.superevolve.length).toBe(1);

      const se = wamdus.superevolve[0];
      expect(se.op).toBe("mode");
      expect(se.options.length).toBe(2);

      // Mode 1: Barrier
      const mode1 = se.options.find((o: any) => o.name.includes("Barrier"));
      expect(mode1).toBeDefined();
      expect(mode1.effects[0].op).toBe("stat");
      expect(mode1.effects[0].keywords).toContain("Barrier");

      // Mode 2: Damage Split (migrated to canonical "damage" op)
      const mode2 = se.options.find((o: any) => o.name.includes("Deal X"));
      expect(mode2).toBeDefined();
      expect(mode2.effects[0].op).toBe("damage");
      expect(mode2.effects[0].distribution).toBe("split_sequential");
      expect(mode2.effects[0].spill_to_leader).toBe(true);
      expect(mode2.effects[0].amount).toBe("{self.attack}");
    });
  });
});






