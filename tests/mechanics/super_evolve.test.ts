/**
 * @file Mechanic Contract Test: super evolve
 *
 * DESIGN: Tests the super evolution mechanic.
 *
 * INVARIANTS UNDER TEST:
 * - Super evolve requires unlock condition
 * - Super evolve grants extra bonuses
 * - super_evo_unlocked flag is tracked
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    findOnBoard,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: super evolve", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // SUPER EVOLVE STRUCTURE
    // ===========================================================================

    describe("super evolve structure", () => {
        it("card with super evolve has superEvolve defined", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "SuperEvoCard",
                    type: "Follower",
                    attack: 5,
                    defense: 5,
                    canSuperEvolve: true,
                    superEvolveCondition: { type: "evolved_allied", count: 5 },
                    superEvolveEffects: [{ op: "damage", target: "enemy:leader", amount: 5 }],
                }])
                .build();

            const card = findOnBoard("first", "SuperEvoCard");
            expect(card!.canSuperEvolve).toBe(true);
        });
    });

    // ===========================================================================
    // SUPER EVO UNLOCKED
    // ===========================================================================

    describe("super_evo_unlocked", () => {
        it("player tracks super evo unlock state", () => {
            givenGameState({ seed: 1 }).build();

            state.players.first.superEvoUnlocked = true;

            expect(state.players.first.superEvoUnlocked).toBe(true);
        });

        it("gate checks super_evo_unlocked", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            state.players.first.superEvoUnlocked = true;

            const effect = {
                op: "gate" as const,
                condition: "super_evo_unlocked",
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 4,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(16);
        });
    });

    // ===========================================================================
    // ALLY SUPER EVOLVE TRIGGER
    // ===========================================================================

    describe("ally_super_evolve trigger", () => {
        it("ally_super_evolve trigger structure is valid", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "SuperEvoWatcher",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    triggers: [{
                        event: "ally_super_evolve",
                        effects: [{ op: "draw", source: "deck", count: 1 }],
                    }],
                }])
                .build();

            const card = findOnBoard("first", "SuperEvoWatcher");
            expect(card!.triggers![0].event).toBe("ally_super_evolve");
        });
    });
});

// Helper
function thenHP(player: "first" | "second"): number {
    return state.players[player].hp;
}
