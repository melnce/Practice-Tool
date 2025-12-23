
// @vitest-environment node
import { describe, it, expect } from "vitest";

describe("Corruption (10453310)", () => {
    it("should have correct Spell structure and custom ops", async () => {
        const fs = await import("fs");
        const path = await import("path");
        const filePath = path.resolve(__dirname, "../../../cards/sets/10004_skybound-dragons.json");

        if (!fs.existsSync(filePath)) throw new Error("JSON not found");

        const fileContent = fs.readFileSync(filePath, "utf-8");
        const cards = JSON.parse(fileContent);

        const card = cards.find((c: any) => c.id === "10453310");
        expect(card).toBeDefined();
        expect(card.name).toBe("Corruption");

        // Check Spell
        expect(card.spell).toBeDefined();
        expect(card.spell).toHaveLength(4);

        // 1. Debuff
        expect(card.spell[0].op).toBe("stat");
        expect(card.spell[0].target).toBe("all:follower");
        expect(card.spell[0].attack).toBe(-2);
        expect(card.spell[0].defense).toBe(-2);

        // 2. Gain Crest Self
        expect(card.spell[1].op).toBe("gain_crest");
        expect(card.spell[1].name).toBe("Crest: Corruption");
        expect(card.spell[1].countdown).toBe(4);
        expect(card.spell[1].triggers[0].type).toBe("end_of_turn_own");

        // 3. Gain Crest Opponent
        expect(card.spell[2].op).toBe("gain_crest");
        expect(card.spell[2].name).toBe("Crest: Corruption");
        expect(card.spell[2].player).toBe("opponent");

        // 4. SSA Destroy Crest
        const ssa = card.spell[3];
        expect(ssa.op).toBe("gate");
        expect(ssa.requirement).toBe(10);
        expect(ssa.effects[0].op).toBe("destroy_crest");
        expect(ssa.effects[0].name).toBe("Crest: Corruption");
    });
});
