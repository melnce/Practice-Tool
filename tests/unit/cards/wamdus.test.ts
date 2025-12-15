
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
            const filePath = path.resolve(__dirname, "../../../cards/sets/10004_skybound-dragons.json");

            if (!fs.existsSync(filePath)) throw new Error("JSON not found");

            const fileContent = fs.readFileSync(filePath, "utf-8");
            const cards = JSON.parse(fileContent);
            const wamdus = cards.find((c: any) => c.id === "10434110");

            expect(wamdus).toBeDefined();

            // Check Fanfare
            expect(wamdus.fanfare.length).toBeGreaterThan(0);
            expect(wamdus.fanfare[0].op).toBe("spellboost_hand");

            // Check Triggers
            // Check Spellboost Keyword
            expect(wamdus.keywords.length).toBeGreaterThan(0);
            const sb = wamdus.keywords.find((k: any) => k.name === "Spellboost");
            expect(sb).toBeDefined();
            expect(sb.effects[0].op).toBe("buff_self");
            expect(sb.effects[0].attack).toBe(1);


            // Check Super-Evolve (should be in superevolve array, not evolve)
            expect(wamdus.evolve).toEqual([]);
            expect(wamdus.superevolve.length).toBe(1);

            const se = wamdus.superevolve[0];
            expect(se.op).toBe("choose");
            expect(se.options.length).toBe(2);

            // Mode 1: Barrier
            const mode1 = se.options.find((o: any) => o.name.includes("Barrier"));
            expect(mode1).toBeDefined();
            expect(mode1.effects[0].op).toBe("buff");
            expect(mode1.effects[0].keywords).toContain("Barrier");

            // Mode 2: Damage Split
            const mode2 = se.options.find((o: any) => o.name.includes("Deal X"));
            expect(mode2).toBeDefined();
            expect(mode2.effects[0].op).toBe("damage_split_all_enemies");
            expect(mode2.effects[0].amount).toBe("{self.attack}");
        });
    });
});
