
// @vitest-environment node
import { describe, it, expect } from "vitest";

describe("Belial, Archangel of Cunning (10454120)", () => {
    it("should have correct Fanfare and Evolve definition", async () => {
        const fs = await import("fs");
        const path = await import("path");
        const filePath = path.resolve(__dirname, "../../../cards/sets/10004_skybound-dragons.json");

        if (!fs.existsSync(filePath)) throw new Error("JSON not found");

        const fileContent = fs.readFileSync(filePath, "utf-8");
        const cards = JSON.parse(fileContent);

        const card = cards.find((c: any) => c.id === "10454120");
        expect(card).toBeDefined();
        expect(card.name).toBe("Belial, Archangel of Cunning");

        // Check Fanfare
        expect(card.fanfare).toBeDefined();
        // Item 1: Damage all others 10
        const dmg = card.fanfare.find((f: any) => f.op === "damage_all");
        expect(dmg).toBeDefined();
        expect(dmg.target).toBe("other:follower");
        expect(dmg.amount).toBe(10);

        // Item 2: SSA Gain Crest
        const ssa = card.fanfare.find((f: any) => f.op === "gate");
        expect(ssa).toBeDefined();
        expect(ssa.requirement).toBe(10);
        expect(ssa.effects[0].op).toBe("gain_crest");
        expect(ssa.effects[0].name).toBe("Crest: Belial, Archangel of Cunning");
        expect(ssa.effects[0].countdown).toBe(4);

        // Expiry effect: Damage enemy leader 20
        expect(ssa.effects[0].effects[0].op).toBe("damage");
        expect(ssa.effects[0].effects[0].target).toBe("enemy:leader");
        expect(ssa.effects[0].effects[0].amount).toBe(20);

        // Check Super Evolve
        expect(card.superevolve).toBeDefined();
        expect(card.superevolve).toHaveLength(1);
        expect(card.superevolve[0].op).toBe("crest_advance_countdown");
        expect(card.superevolve[0].name).toBe("Crest: Belial, Archangel of Cunning");
        expect(card.superevolve[0].amount).toBe(1);
    });
});
