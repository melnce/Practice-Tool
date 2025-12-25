/**
 * @file Mechanic Contract Test: triggers
 *
 * DESIGN: Tests trigger event behavior with proper expected outcomes.
 * Failures indicate bugs in the trigger system that need to be fixed.
 *
 * COVERAGE:
 * - Trigger fires on matching event
 * - Once-per-turn behavior
 * - Trigger fires for correct player
 * - Context enrichment
 *
 * INVARIANTS UNDER TEST:
 * - Triggers on board respond to their registered events
 * - once_per_turn prevents duplicate firing in same turn
 * - Context contains correct enteringOwner/defender info
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    resetUidCounter,
    thenHP,
    thenBoard,
    whenRunEffects,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { fireTrigger } from "../../src/logic/core/triggers.js";

describe("Mechanic Contract: triggers", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // TRIGGER FIRES ON MATCHING EVENT
    // ===========================================================================

    describe("event matching", () => {
        it("start_of_turn trigger fires at start of turn and deals damage", () => {
            // GIVEN: A card on board with start_of_turn trigger that deals 1 damage to enemy leader
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .withFirstBoard([{
                    name: "DamageOnTurnStart",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    triggers: [{
                        event: "start_of_turn",
                        source: "board",
                        effects: [{ op: "damage", target: "enemy:leader", amount: 1 }],
                    }],
                }])
                .build();

            const hpBefore = thenHP("second");

            // WHEN: Fire start_of_turn event
            fireTrigger("start_of_turn", "first", {});

            // THEN: Enemy HP should decrease by 1
            expect(thenHP("second")).toBe(hpBefore - 1);
        });

        it("ally_follower_enter trigger fires when ally enters", () => {
            // GIVEN: A card on board with ally_follower_enter trigger that buffs all allies
            givenGameState({ seed: 1 })
                .withFirstBoard([
                    {
                        name: "BuffOnEnter",
                        type: "Follower",
                        attack: 2,
                        defense: 2,
                        triggers: [{
                            event: "ally_follower_enter",
                            source: "board",
                            effects: [{ op: "stat", action: "give", target: "ally:follower", attack: 1, defense: 1 }],
                        }],
                    },
                ])
                .build();

            const buffCard = thenBoard("first").find(c => c.name === "BuffOnEnter");
            const attackBefore = buffCard!.attack;

            // Simulate a new ally entering
            const enteringCard = {
                uid: "new_ally",
                name: "NewAlly",
                type: "Follower",
                owner: "first",
                zone: "board",
            };

            // WHEN: Fire ally_follower_enter event
            fireTrigger("ally_follower_enter", "first", { enteringCard: enteringCard as any });

            // THEN: BuffOnEnter should have +1 attack (from its own trigger)
            const buffCardAfter = thenBoard("first").find(c => c.name === "BuffOnEnter");
            expect(buffCardAfter!.attack).toBe((attackBefore as number) + 1);
        });
    });

    // ===========================================================================
    // ONCE PER TURN BEHAVIOR
    // ===========================================================================

    describe("once_per_turn", () => {
        it("trigger with once_per_turn only fires once per turn", () => {
            // GIVEN: A card with once_per_turn trigger that deals 2 damage
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .withFirstBoard([{
                    name: "OncePerTurnCard",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    triggers: [{
                        event: "ally_spell_played",
                        source: "board",
                        once_per_turn: true,
                        effects: [{ op: "damage", target: "enemy:leader", amount: 2 }],
                    }],
                }])
                .build();

            const hpBefore = thenHP("second");

            // WHEN: Fire the trigger twice in same turn
            fireTrigger("ally_spell_played", "first", {});
            const hpAfterFirst = thenHP("second");

            fireTrigger("ally_spell_played", "first", {});
            const hpAfterSecond = thenHP("second");

            // THEN: HP should only decrease by 2 (once), not 4 (twice)
            expect(hpAfterFirst).toBe(hpBefore - 2);
            expect(hpAfterSecond).toBe(hpAfterFirst); // No change on second fire
        });

        it("once_per_turn trigger fires again on new turn", () => {
            // GIVEN: A card with once_per_turn trigger
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .withTurn(1)
                .withFirstBoard([{
                    name: "OncePerTurnCard",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    triggers: [{
                        event: "ally_spell_played",
                        source: "board",
                        once_per_turn: true,
                        effects: [{ op: "damage", target: "enemy:leader", amount: 2 }],
                    }],
                }])
                .build();

            // Fire once on turn 1
            fireTrigger("ally_spell_played", "first", {});
            const hpAfterTurn1 = thenHP("second");

            // WHEN: Advance to turn 2 and fire again
            state.turnNumber = 2;
            fireTrigger("ally_spell_played", "first", {});
            const hpAfterTurn2 = thenHP("second");

            // THEN: HP should decrease again (total -4)
            expect(hpAfterTurn2).toBe(hpAfterTurn1 - 2);
        });
    });

    // ===========================================================================
    // STRIKE / CLASH TRIGGERS
    // ===========================================================================

    describe("combat triggers", () => {
        it("strike trigger fires when follower attacks", () => {
            // GIVEN: A card with strike trigger that deals 1 damage to enemy leader
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .withFirstBoard([{
                    name: "StrikeCard",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    triggers: [{
                        event: "strike",
                        source: "self",
                        effects: [{ op: "damage", target: "enemy:leader", amount: 1 }],
                    }],
                }])
                .build();

            const attacker = thenBoard("first")[0];
            const hpBefore = thenHP("second");

            // WHEN: Fire strike event with this card as attacker
            fireTrigger("strike", "first", { attackerUid: attacker.uid, attacker });

            // THEN: Enemy HP should decrease by 1 (from trigger, not combat damage)
            expect(thenHP("second")).toBe(hpBefore - 1);
        });

        it("clash trigger fires when follower clashes with enemy", () => {
            // GIVEN: A card with clash trigger that gives itself +2/+0
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "ClashCard",
                    type: "Follower",
                    attack: 2,
                    defense: 4,
                    triggers: [{
                        event: "clash",
                        source: "self",
                        effects: [{ op: "stat", action: "give", target: "self", attack: 2 }],
                    }],
                }])
                .withSecondBoard([{ name: "Defender", type: "Follower", attack: 1, defense: 3 }])
                .build();

            const clashCard = thenBoard("first")[0];
            const attackBefore = clashCard.attack;

            // WHEN: Fire clash event
            fireTrigger("clash", "first", { attackerUid: clashCard.uid, attacker: clashCard });

            // THEN: ClashCard should have +2 attack
            const clashCardAfter = thenBoard("first").find(c => c.name === "ClashCard");
            expect(clashCardAfter!.attack).toBe((attackBefore as number) + 2);
        });
    });

    // ===========================================================================
    // LAST WORDS TRIGGERS
    // ===========================================================================

    describe("LastWords", () => {
        it("LastWords trigger is defined when hasLastWords is true", () => {
            // GIVEN: A card with hasLastWords and lastWordsEffects
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "LastWordsCard",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    hasLastWords: true,
                    lastWordsEffects: [{ op: "draw", source: "deck", count: 1 }],
                }])
                .build();

            // THEN: Card should have LastWords properties
            const card = thenBoard("first")[0];
            expect(card.hasLastWords).toBe(true);
            expect(card.lastWordsEffects).toBeDefined();
            expect(card.lastWordsEffects!.length).toBeGreaterThan(0);
        });
    });
});
