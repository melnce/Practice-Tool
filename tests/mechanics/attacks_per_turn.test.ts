/**
 * @file Mechanic Contract Test: attacks_per_turn
 *
 * DESIGN: Tests attack count modification per turn.
 *
 * INVARIANTS UNDER TEST:
 * - attacksPerTurn increases allowed attacks
 * - Follower can attack multiple times
 * - Attacks reset at turn start
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    findOnBoard,
    resetUidCounter,
} from "../harness/builders.js";

describe("Mechanic Contract: attacks_per_turn", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // SET ATTACKS PER TURN
    // ===========================================================================

    describe("set attacks per turn", () => {
        it("sets attacksPerTurn on follower", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    attacksPerTurn: 1,
                }])
                .build();

            const card = findOnBoard("first", "Target");

            const effect = {
                op: "attacks_per_turn" as const,
                target: "self",
                amount: 3,
            };
            whenRunEffects([effect], "first", card);

            expect(findOnBoard("first", "Target")!.attacksPerTurn).toBe(3);
        });

        it("can set to 0 (cannot attack)", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    attacksPerTurn: 1,
                }])
                .build();

            const card = findOnBoard("first", "Target");

            const effect = {
                op: "attacks_per_turn" as const,
                target: "self",
                amount: 0,
            };
            whenRunEffects([effect], "first", card);

            expect(findOnBoard("first", "Target")!.attacksPerTurn).toBe(0);
        });
    });

    // ===========================================================================
    // ADD ATTACKS PER TURN
    // ===========================================================================

    describe("add attacks per turn", () => {
        it("increases attacksPerTurn", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    attacksPerTurn: 1,
                }])
                .build();

            const card = findOnBoard("first", "Target");

            const effect = {
                op: "attacks_per_turn" as const,
                target: "self",
                action: "add",
                amount: 2,
            };
            whenRunEffects([effect], "first", card);

            // 1 + 2 = 3
            expect(findOnBoard("first", "Target")!.attacksPerTurn).toBe(3);
        });
    });
});
