
// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

// Mock window for cardDatabase if needed
if (typeof window === "undefined") {
    (global as any).window = {};
}

import { handleRemoveAbilities } from "../../../src/logic/core/keywords.js";
import { CardInstance } from "../../../src/core/types.js";

describe("Elmott Logic", () => {
    describe("handleRemoveAbilities", () => {
        it("should clear all abilities from a target", () => {
            const mockCard: any = {
                uid: "test_uid",
                name: "Test Follower",
                type: "Follower",
                hasWard: true,
                hasRush: true,
                hasStorm: true,
                hasBane: true,
                hasDrain: true,
                hasAmbush: true,
                hasIntimidate: true,
                hasLastWords: true, // Boolean flag
                keywords: ["ward", "rush"],
                triggers: [{ event: "start_of_turn" }],
                fanfare: [{ op: "damage" }],
                lastWordsEffects: [{ op: "die" }],
                strikeEffects: [{ op: "strike" }],
                engageEffects: [{ op: "engage" }],
                enhanceTiers: [{ cost: 5 }]
            };

            const context = { targets: [mockCard] };
            const owner = "blue";
            const effect = { op: "remove_abilities" };

            handleRemoveAbilities(effect as any, owner, [], context);

            // Verify boolean flags are cleared
            expect(mockCard.hasWard).toBe(false);
            expect(mockCard.hasRush).toBe(false);
            expect(mockCard.hasStorm).toBe(false);
            expect(mockCard.hasBane).toBe(false);
            expect(mockCard.hasDrain).toBe(false);
            expect(mockCard.hasAmbush).toBe(false);
            expect(mockCard.hasIntimidate).toBe(false);
            expect(mockCard.hasLastWords).toBe(false);

            // Verify arrays are cleared
            expect(mockCard.keywords).toEqual([]);
            expect(mockCard.triggers).toEqual([]);
            expect(mockCard.fanfare).toEqual([]);
            expect(mockCard.lastWordsEffects).toEqual([]);
            expect(mockCard.strikeEffects).toEqual([]);
            expect(mockCard.engageEffects).toEqual([]);
            expect(mockCard.enhanceTiers).toEqual([]);
        });
    });

    describe("Card JSON Check", () => {
        it("should have correct Fanfare and Super-Evo definitions", async () => {
            const fs = await import("fs");
            const path = await import("path");
            const filePath = path.resolve(__dirname, "../../../../cards/sets/10004_skybound-dragons.json");

            if (!fs.existsSync(filePath)) throw new Error("JSON not found");

            const fileContent = fs.readFileSync(filePath, "utf-8");
            const cards = JSON.parse(fileContent);
            const elmott = cards.find((c: any) => c.id === "10433110");

            expect(elmott).toBeDefined();

            console.log("Elmott loaded:", JSON.stringify(elmott.evolve?.[0], null, 2));

            // Check Fanfare
            expect(elmott.fanfare[0].op).toBe("select");
            expect(elmott.fanfare[0].effects[0].op).toBe("remove_abilities");
            expect(elmott.fanfare[0].effects[1].op).toBe("damage");
            expect(elmott.fanfare[0].effects[1].amount).toBe(3);

            // Check Evolve (Super-Evo Gate)
            expect(elmott.evolve[0].op).toBe("super_evo_gate");
            const crestOp = elmott.evolve[0].effects[0];
            expect(crestOp.op).toBe("gain_crest");
            expect(crestOp.name).toContain("Elmott");
            expect(crestOp.triggers[0].event).toBe("start_of_turn");
        });
    });
});
