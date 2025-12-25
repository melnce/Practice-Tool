/**
 * @file Mechanic Contract Test: earth_rite
 *
 * DESIGN: Tests the earth rite mechanic (consume earth sigil for bonus).
 *
 * INVARIANTS UNDER TEST:
 * - Earth rite fires if earth sigil exists
 * - Earth rite destroys the sigil
 * - Earth rite does NOT fire without sigil
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenBoard,
    thenHP,
    resetUidCounter,
} from "../harness/builders.js";

describe("Mechanic Contract: earth_rite", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // EARTH RITE ACTIVATION
    // ===========================================================================

    describe("earth rite activation", () => {
        it("fires effects when earth sigil exists", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .withFirstBoard([{
                    name: "EarthSigil",
                    type: "Amulet",
                    isEarthSigil: true,
                }])
                .build();

            const effect = {
                op: "earth_rite" as const,
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 5,
                }],
            };
            whenRunEffects([effect], "first");

            // Effect should fire
            expect(thenHP("second")).toBe(15);
        });

        it("destroys one earth sigil when activated", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([
                    { name: "Sigil1", type: "Amulet", isEarthSigil: true },
                    { name: "Sigil2", type: "Amulet", isEarthSigil: true },
                ])
                .build();

            const effect = {
                op: "earth_rite" as const,
                effects: [{
                    op: "draw" as const,
                    source: "deck",
                    count: 1,
                }],
            };
            whenRunEffects([effect], "first");

            // One sigil should be destroyed
            expect(thenBoard("first").length).toBe(1);
        });

        it("does NOT fire effects when no earth sigil", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .withFirstBoard([{
                    name: "RegularAmulet",
                    type: "Amulet",
                    isEarthSigil: false,
                }])
                .build();

            const effect = {
                op: "earth_rite" as const,
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 5,
                }],
            };
            whenRunEffects([effect], "first");

            // Effect should NOT fire
            expect(thenHP("second")).toBe(20);
        });

        it("does NOT fire when board is empty", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            const effect = {
                op: "earth_rite" as const,
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 5,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(20);
        });
    });
});
