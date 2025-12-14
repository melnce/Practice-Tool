
import { describe, it, expect } from "vitest";
import { compileCardText } from "../../src/data/textCompiler/compiler.js";

describe("Card Text Compiler", () => {
    it("should extract keywords", () => {
        const result = compileCardText("Storm. Fanfare: Deal 1 damage.", "Follower");
        expect(result.keywords).toContain("Storm");
        expect(result.fanfare).toHaveLength(1);
    });

    it("should parse 'Draw X cards'", () => {
        const result = compileCardText("Fanfare: Draw a card.", "Follower");
        expect(result.fanfare[0]).toEqual({ op: "draw", count: 1 });

        const result2 = compileCardText("Last Words: Draw 2 cards.", "Follower");
        expect(result2.lastWords[0]).toEqual({ op: "draw", count: 2 });
    });

    it("should parse 'Deale X damage to an enemy follower'", () => {
        const result = compileCardText("Fanfare: Deal 3 damage to an enemy follower.", "Follower");
        expect(result.fanfare[0]).toMatchObject({
            op: "select",
            target: "enemy_follower",
            effects: [{ op: "damage", amount: 3 }]
        });
    });

    it("should capture unresolved text", () => {
        const result = compileCardText("Gain +1/+1.", "Follower");
        // Patterns only cover basic draw/damage/summon so far
        expect(result.unresolved).toHaveLength(1);
        expect(result.unresolved[0]).toBe("Gain +1/+1.");
    });
});


