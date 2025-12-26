/**
 * @file Mechanic Contract Test: attacks_per_turn
 *
 * DESIGN: Tests attack count modification per turn.
 *
 * INVARIANTS UNDER TEST:
 * - attacks_per_turn sets the value on the card
 * - Card can be set to multiple attacks per turn
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
    // Canonical: { op: "attacks_per_turn", value: N }
    // ===========================================================================

    describe("set attacks per turn", () => {
        it("sets attacks_per_turn on follower", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    attacks_per_turn: 1,
                }])
                .build();

            const card = findOnBoard("first", "Target");

            const effect = {
                op: "attacks_per_turn" as const,
                value: 3,
            };
            whenRunEffects([effect], "first", card);

            expect(findOnBoard("first", "Target")!.attacks_per_turn).toBe(3);
        });

        it("sets to 2 (double attack)", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    attacks_per_turn: 1,
                }])
                .build();

            const card = findOnBoard("first", "Target");

            const effect = {
                op: "attacks_per_turn" as const,
                value: 2,
            };
            whenRunEffects([effect], "first", card);

            expect(findOnBoard("first", "Target")!.attacks_per_turn).toBe(2);
        });
    });
});
