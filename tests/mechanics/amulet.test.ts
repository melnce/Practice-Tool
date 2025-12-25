/**
 * @file Mechanic Contract Test: amulet mechanics
 *
 * DESIGN: Tests amulet-specific operations (countdown, engage).
 *
 * INVARIANTS UNDER TEST:
 * - Countdown decrements at turn start
 * - Countdown 0 destroys amulet
 * - Engage consumes PP
 * - Engage fires effects
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenBoard,
    findOnBoard,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: amulet", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // COUNTDOWN AMULET
    // ===========================================================================

    describe("countdown", () => {
        it("countdown decrements by 1", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "CountdownAmulet",
                    type: "Amulet",
                    countdown: 3,
                }])
                .build();

            const effect = {
                op: "countdown" as const,
                target: "ally:amulet",
                amount: -1,
            };
            whenRunEffects([effect], "first");

            const amulet = findOnBoard("first", "CountdownAmulet");
            expect(amulet!.countdown).toBe(2);
        });

        it("countdown reaching 0 destroys amulet", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "CountdownAmulet",
                    type: "Amulet",
                    countdown: 1,
                }])
                .build();

            const effect = {
                op: "countdown" as const,
                target: "ally:amulet",
                amount: -1,
            };
            whenRunEffects([effect], "first");

            // Amulet should be destroyed
            expect(thenBoard("first").length).toBe(0);
        });

        it("countdown reduces by specified amount", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "CountdownAmulet",
                    type: "Amulet",
                    countdown: 5,
                }])
                .build();

            const effect = {
                op: "countdown" as const,
                target: "ally:amulet",
                amount: -3,
            };
            whenRunEffects([effect], "first");

            const amulet = findOnBoard("first", "CountdownAmulet");
            expect(amulet!.countdown).toBe(2);
        });
    });

    // ===========================================================================
    // ENGAGE AMULET
    // ===========================================================================

    describe("engage", () => {
        it("engage fires amulet effects", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .withFirstBoard([{
                    name: "EngageAmulet",
                    type: "Amulet",
                    engageEffects: [{ op: "damage", target: "enemy:leader", amount: 2 }],
                    engageCost: 1,
                }])
                .build();

            state.players.first.pp = 3;

            const amulet = findOnBoard("first", "EngageAmulet");

            const effect = {
                op: "engage" as const,
                target: "self",
            };
            whenRunEffects([effect], "first", amulet);

            // Effect should have fired
            expect(thenHP("second")).toBe(18);
        });

        it("engage consumes PP", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "EngageAmulet",
                    type: "Amulet",
                    engageEffects: [{ op: "draw", source: "deck", count: 1 }],
                    engageCost: 2,
                }])
                .build();

            state.players.first.pp = 5;

            const amulet = findOnBoard("first", "EngageAmulet");

            const effect = {
                op: "engage" as const,
                target: "self",
            };
            whenRunEffects([effect], "first", amulet);

            expect(state.players.first.pp).toBe(3);
        });
    });
});
