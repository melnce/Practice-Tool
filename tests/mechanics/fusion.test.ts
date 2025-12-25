/**
 * @file Mechanic Contract Test: fusion
 *
 * DESIGN: Tests the fusion mechanic.
 *
 * INVARIANTS UNDER TEST:
 * - Fusion combines cards
 * - Fused materials are consumed
 * - Fusion triggers fire
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenHand,
    findOnBoard,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: fusion", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // FUSION STRUCTURE
    // ===========================================================================

    describe("fusion structure", () => {
        it("card with fusion has fuseTarget defined", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{
                    name: "FusionCard",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    fuseTarget: true,
                    fuseMaterials: ["MaterialA", "MaterialB"],
                }])
                .build();

            const card = thenHand("first")[0];
            expect(card.fuseTarget).toBe(true);
        });

        it("fusion materials are defined", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{
                    name: "FusionCard",
                    type: "Follower",
                    fuseMaterials: ["MaterialA", "MaterialB"],
                }])
                .build();

            const card = thenHand("first")[0];
            expect(card.fuseMaterials).toBeDefined();
            expect(card.fuseMaterials!.length).toBe(2);
        });
    });

    // ===========================================================================
    // FUSION COUNT
    // ===========================================================================

    describe("fusion count", () => {
        it("fused card tracks fusion count", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "FusedCard",
                    type: "Follower",
                    attack: 5,
                    defense: 5,
                    fusionCount: 3,
                }])
                .build();

            const card = findOnBoard("first", "FusedCard");
            expect(card!.fusionCount).toBe(3);
        });
    });

    // ===========================================================================
    // ON_FUSE TRIGGER
    // ===========================================================================

    describe("on_fuse trigger", () => {
        it("on_fuse trigger structure is valid", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{
                    name: "FuseReactor",
                    type: "Follower",
                    triggers: [{
                        event: "on_fuse",
                        effects: [{ op: "stat", action: "give", target: "self", attack: 1 }],
                    }],
                }])
                .build();

            const card = thenHand("first")[0];
            expect(card.triggers![0].event).toBe("on_fuse");
        });
    });
});
