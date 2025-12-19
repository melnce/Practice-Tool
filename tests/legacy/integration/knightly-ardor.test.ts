/**
 * MOVED TO LEGACY
 * 
 * Original Path: tests/integration/knightly-ardor.test.ts
 * Reason: TypeError: makeUid is not a function
 * Classification: BROKEN: harness/infra rot
 * 
 * POLICY: Do not fix by changing engine code.
 */
// tests/knightly-ardor.test.ts
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { state, resetGameState } from "../../src/core/gameState";
import { loadCardDatabase } from "../../src/data/cardDatabase";
import { runEffects } from "../../src/logic/core/effects/index";
import { makeUid } from "../../src/core/rng";

describe("Knightly Ardor", () => {
    beforeAll(async () => {
        await loadCardDatabase();
    });

    beforeEach(() => {
        resetGameState();
        state.isBlueTurn = true;
        state.bluePP = 10;
        state.blueMaxPP = 10;
        state.blueEvoCharges = 0;
    });

    it("Mode 1: Give leftmost allied Swordcraft follower attacks_per_turn = 2", () => {
        // Setup: Put 3 followers on board - only middle one is Swordcraft
        const forestFollower = {
            uid: makeUid("card"),
            name: "Forest Elf",
            type: "Follower",
            class: "Forestcraft",
            attack: 2,
            defense: 2,
            attacks_per_turn: 1,
            attacks_left: 1,
        };
        const swordFollower1 = {
            uid: makeUid("card"),
            name: "Knight",
            type: "Follower",
            class: "Swordcraft",
            attack: 3,
            defense: 3,
            attacks_per_turn: 1,
            attacks_left: 1,
        };
        const swordFollower2 = {
            uid: makeUid("card"),
            name: "Steelclad Knight",
            type: "Follower",
            class: "Swordcraft",
            attack: 4,
            defense: 4,
            attacks_per_turn: 1,
            attacks_left: 1,
        };

        // Forest first, then two Swordcraft
        state.blueBoard = [forestFollower, swordFollower1, swordFollower2] as any;

        // Run the buff effect targeting leftmost Swordcraft
        runEffects([{
            op: "buff",
            target: "ally:follower",
            filter: "leftmost",
            condition: { class: "Swordcraft" },
            attacks_per_turn: 2
        }], "blue", null as any);

        // Forest should NOT have been affected
        expect(forestFollower.attacks_per_turn).toBe(1);

        // swordFollower1 (leftmost Swordcraft) should have attacks_per_turn = 2
        expect(swordFollower1.attacks_per_turn).toBe(2);
        expect(swordFollower1.attacks_left).toBe(2);

        // swordFollower2 should NOT have been affected
        expect(swordFollower2.attacks_per_turn).toBe(1);
    });

    it("Mode 2: Give all allied Swordcraft followers +1/+1 and Barrier", () => {
        const swordFollower = {
            uid: makeUid("card"),
            name: "Knight",
            type: "Follower",
            class: "Swordcraft",
            attack: 2,
            defense: 2,
        };
        const forestFollower = {
            uid: makeUid("card"),
            name: "Forest Elf",
            type: "Follower",
            class: "Forestcraft",
            attack: 2,
            defense: 2,
        };

        state.blueBoard = [swordFollower, forestFollower] as any;

        runEffects([{
            op: "buff",
            target: "ally:follower",
            condition: { class: "Swordcraft" },
            attack: 1,
            defense: 1,
            keywords: ["Barrier"]
        }], "blue", null as any);

        // Swordcraft follower should be buffed
        expect(swordFollower.attack).toBe(3);
        expect(swordFollower.defense).toBe(3);
        expect((swordFollower as any).hasBarrier).toBe(true);

        // Forest follower should NOT be buffed
        expect(forestFollower.attack).toBe(2);
        expect(forestFollower.defense).toBe(2);
        expect((forestFollower as any).hasBarrier).toBeFalsy();
    });

    it("Mode 3: Recover 2 PP and 1 EP", () => {
        state.bluePP = 3;
        state.blueMaxPP = 10;
        state.blueEvoCharges = 0;

        runEffects([
            { op: "recover_pp", amount: 2 },
            { op: "recover_ep", amount: 1 }
        ], "blue", null as any);

        expect(state.bluePP).toBe(5); // 3 + 2
        expect(state.blueEvoCharges).toBe(1); // 0 + 1
    });

    it("Mode 4: Restore 6 defense to leader", () => {
        state.blueHP = 14;
        state.blueMaxHP = 20;

        runEffects([{ op: "heal_leader", amount: 6 }], "blue", null as any);

        expect(state.blueHP).toBe(20); // 14 + 6
    });
});


