/**
 * MOVED TO LEGACY
 * 
 * Original Path: tests/integration/kuonEnhance.test.ts
 * Reason: Syntax Error (Unexpected "}")
 * Classification: BROKEN: invalid test code
 * 
 * POLICY: Do not fix by changing engine code.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { state, resetGameState } from "../../src/core/gameState";
import { loadCardDatabase, getCardDetails } from "../../src/data/cardDatabase";
import { runEffects } from "../../src/logic/core/effects";
import { playCard } from "../../src/logic/core/playCard";


describe("Kuon Enhance Effect", () => {
    beforeAll(async () => {
        await loadCardDatabase();
    });

    beforeEach(() => {
        resetGameState();
        state.blueBoard = [];
        state.redBoard = [];
        state.shikigamiDeathsThisTurnBlue = [];
        state.shikigamiDeathsThisTurnRed = [];
        state.lastSummoned = [];
    });

    it("should have Shikigami tokens in database", () => {
        const celestial = getCardDetails("Celestial Shikigami");
        const demonic = getCardDetails("Demonic Shikigami");
        const paper = getCardDetails("Paper Shikigami");
        const noble = getCardDetails("Noble Shikigami");

        expect(celestial).not.toBeNull();
        expect(demonic).not.toBeNull();
        expect(paper).not.toBeNull();
        expect(noble).not.toBeNull();

        console.log("Celestial tribes:", celestial?.tribes);
        console.log("Demonic tribes:", demonic?.tribes);
        console.log("Paper tribes:", paper?.tribes);
    });

    it("should summon Shikigami via fanfare effect", () => {
        // Simulate running fanfare effects
        const fanfareEffects = [
            { op: "summon_named", name: "Celestial Shikigami", count: 1 },
            { op: "summon_named", name: "Demonic Shikigami", count: 1 },
            { op: "summon_named", name: "Paper Shikigami", count: 1 }
        ];

        runEffects(fanfareEffects as any, "blue", null);

        console.log("Board after fanfare:", state.blueBoard.map(c => ({ name: c.name, tribes: c.tribes })));

        expect(state.blueBoard.length).toBe(3);
        expect(state.blueBoard.some(c => c.name === "Celestial Shikigami")).toBe(true);
        expect(state.blueBoard.some(c => c.name === "Demonic Shikigami")).toBe(true);
        expect(state.blueBoard.some(c => c.name === "Paper Shikigami")).toBe(true);

        // Check tribes
        for (const card of state.blueBoard) {
            console.log(`${card.name} tribes:`, card.tribes);
            expect(card.tribes).toContain("Shikigami");
        }
    });

    it("should destroy Shikigami via destroy_all with tribe condition", () => {
        // First summon the Shikigami
        const fanfareEffects = [
            { op: "summon_named", name: "Celestial Shikigami", count: 1 },
            { op: "summon_named", name: "Demonic Shikigami", count: 1 },
            { op: "summon_named", name: "Paper Shikigami", count: 1 }
        ];

        runEffects(fanfareEffects as any, "blue", null);
        console.log("Board before destroy:", state.blueBoard.map(c => c.name));
        expect(state.blueBoard.length).toBe(3);

        // Now run destroy_all with tribe condition
        const destroyEffect = {
            op: "destroy_all",
            target: "ally:follower",
            condition: { tribe: "Shikigami" }
        };

        runEffects([destroyEffect] as any, "blue", null);

        console.log("Board after destroy_all:", state.blueBoard.map(c => c.name));
        console.log("Shikigami deaths blue:", state.shikigamiDeathsThisTurnBlue);

        // Board should be empty now
        expect(state.blueBoard.length).toBe(0);
        // Shikigami deaths should be tracked
        expect(state.shikigamiDeathsThisTurnBlue?.length).toBeGreaterThan(0);
    });

    it("should run full enhance sequence: fanfare then destroy then summon Noble", () => {
        // Simulate the full Kuon enhance(10) sequence manually to verify Ops
        // 1. Fanfare summons 3 Shikigami
        const fanfareEffects = [
            { op: "summon_named", name: "Celestial Shikigami", count: 1 },
            { op: "summon_named", name: "Demonic Shikigami", count: 1 },
            { op: "summon_named", name: "Paper Shikigami", count: 1 }
        ];
        runEffects(fanfareEffects as any, "blue", null);

        console.log("After fanfare - board:", state.blueBoard.map(c => c.name));
        expect(state.blueBoard.length).toBe(3);

        // 2. Enhance destroys all Shikigami and summons Noble
        const enhanceEffects = [
            {
                op: "destroy_all",
                target: "ally:follower",
                condition: { tribe: "Shikigami" }
            },
            {
                op: "summon_named",
                name: "Noble Shikigami",
                count: 1
            }
        ];
        runEffects(enhanceEffects as any, "blue", null);

        console.log("After enhance - board:", state.blueBoard.map(c => ({
            name: c.name,
            attack: c.attack,
            defense: c.defense
        })));
        console.log("Shikigami deaths:", state.shikigamiDeathsThisTurnBlue);

        // Should have Noble Shikigami on board
        expect(state.blueBoard.length).toBe(1);
        expect(state.blueBoard[0].name).toBe("Noble Shikigami");

        // Noble should be buffed (base 1/1 + 9/9 from deaths = 10/10)
        const noble = state.blueBoard[0];
        console.log("Noble stats:", { attack: noble.attack, defense: noble.defense });
        expect(noble.attack).toBe(10);
        expect(noble.defense).toBe(10);
    });

    it("should work when played via playCard (verifying execution order)", () => {
        // Setup hand with Kuon
        const kuon = getCardDetails("Kuon, Fivefold Master");
        if (!kuon) throw new Error("Kuon not found");

        const kuonInstance = { ...kuon, uid: state.rng.makeUid(), owner: "blue" as any };
        state.blueHand = [kuonInstance];
        state.bluePP = 10;
        state.blueMaxPP = 10;
        state.blueBoard = []; // Ensure empty board
        state.lastSummoned = [];
        state.shikigamiDeathsThisTurnBlue = [];

        console.log("Playing Kuon with 10 PP...");

        // Play card (index 0)
        playCard(state.blueHand, "blue", 0);

        console.log("After playCard - board:", state.blueBoard.map(c => ({
            name: c.name,
            attack: c.attack,
            defense: c.defense,
            buffs: c.buffs
        })));
        console.log("Shikigami deaths:", state.shikigamiDeathsThisTurnBlue);

        // Should have Kuon + 1 Noble Shikigami
        expect(state.blueBoard.length).toBe(2);

        // Noble should be on board
        const noble = state.blueBoard.find(c => c.name === "Noble Shikigami");
        expect(noble).toBeDefined();

        // Should have destroyed 3 Shikigami
        expect(state.shikigamiDeathsThisTurnBlue?.length).toBe(3);

        // Noble should be 10/10
        expect(noble!.attack).toBe(10);
        expect(noble!.defense).toBe(10);
    });
});


});


