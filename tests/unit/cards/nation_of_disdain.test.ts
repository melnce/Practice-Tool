
// @vitest-environment node
import { describe, it, expect } from "vitest";

describe("Nation of Disdain (10342210) Structure", () => {
    it("should have correct 'other:follower' targeting for Engage effect", async () => {
        const fs = await import("fs");
        const path = await import("path");
        const filePath = path.resolve(__dirname, "../../../cards/sets/10003_heirs-of-the-omen.json");

        const fileContent = fs.readFileSync(filePath, "utf-8");
        const cards = JSON.parse(fileContent);
        const card = cards.find((c: any) => c.id === "10342210");

        expect(card).toBeDefined();

        // Find Engage keyword
        // Keywords can be object { name: "engage" ... }
        const engage = card.keywords.find((k: any) => k.name && k.name.toLowerCase() === "engage");
        expect(engage).toBeDefined();

        const effect = engage.effects[0];
        expect(effect.op).toBe("damage_all");

        // Use the new shorthand
        expect(effect.target).toBe("other:follower");

        // Verify not_self is gone
        if (effect.condition) {
            expect(effect.condition.not_self).toBeUndefined();
        }
    });
});
