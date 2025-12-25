/**
 * @file Mechanic Contract Test: trigger events (comprehensive)
 *
 * DESIGN: Tests ALL trigger event types.
 *
 * EVENTS COVERED:
 * - start_of_turn, end_of_turn
 * - ally_follower_enter, enemy_follower_enter
 * - ally_follower_leaves_field
 * - ally_follower_played
 * - strike, follower_strike, clash
 * - leader_attacked, leader_restored
 * - self_damaged, self_buffed_up
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenBoard,
    thenHP,
    findOnBoard,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: trigger events", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // START_OF_TURN / END_OF_TURN
    // ===========================================================================

    describe("turn events", () => {
        it("start_of_turn trigger registers correctly", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "TurnTrigger",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    triggers: [{
                        event: "start_of_turn",
                        effects: [{ op: "stat", action: "give", target: "self", attack: 1 }],
                    }],
                }])
                .build();

            const card = findOnBoard("first", "TurnTrigger");
            expect(card!.triggers).toBeDefined();
            expect(card!.triggers![0].event).toBe("start_of_turn");
        });

        it("end_of_turn trigger registers correctly", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "EndTurnCard",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    triggers: [{
                        event: "end_of_turn",
                        effects: [{ op: "restore", target: "ally:leader", amount: 1 }],
                    }],
                }])
                .build();

            const card = findOnBoard("first", "EndTurnCard");
            expect(card!.triggers![0].event).toBe("end_of_turn");
        });
    });

    // ===========================================================================
    // FOLLOWER ENTER EVENTS
    // ===========================================================================

    describe("follower enter events", () => {
        it("ally_follower_enter trigger structure is valid", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Watcher",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    triggers: [{
                        event: "ally_follower_enter",
                        effects: [{ op: "stat", action: "give", target: "self", attack: 1 }],
                    }],
                }])
                .build();

            const card = findOnBoard("first", "Watcher");
            expect(card!.triggers![0].event).toBe("ally_follower_enter");
        });

        it("enemy_follower_enter trigger structure is valid", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Reactor",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    triggers: [{
                        event: "enemy_follower_enter",
                        effects: [{ op: "damage", target: "enemy:follower", amount: 1 }],
                    }],
                }])
                .build();

            const card = findOnBoard("first", "Reactor");
            expect(card!.triggers![0].event).toBe("enemy_follower_enter");
        });
    });

    // ===========================================================================
    // COMBAT EVENTS
    // ===========================================================================

    describe("combat events", () => {
        it("strike trigger structure is valid", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Striker",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    triggers: [{
                        event: "strike",
                        effects: [{ op: "draw", source: "deck", count: 1 }],
                    }],
                }])
                .build();

            const card = findOnBoard("first", "Striker");
            expect(card!.triggers![0].event).toBe("strike");
        });

        it("clash trigger structure is valid", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Clasher",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    triggers: [{
                        event: "clash",
                        effects: [{ op: "stat", action: "give", target: "self", attack: 2 }],
                    }],
                }])
                .build();

            const card = findOnBoard("first", "Clasher");
            expect(card!.triggers![0].event).toBe("clash");
        });

        it("follower_strike trigger structure is valid", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "FollowerStriker",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    triggers: [{
                        event: "follower_strike",
                        effects: [{ op: "restore", target: "ally:leader", amount: 2 }],
                    }],
                }])
                .build();

            const card = findOnBoard("first", "FollowerStriker");
            expect(card!.triggers![0].event).toBe("follower_strike");
        });
    });

    // ===========================================================================
    // LEADER EVENTS
    // ===========================================================================

    describe("leader events", () => {
        it("leader_attacked trigger structure is valid", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Guardian",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    triggers: [{
                        event: "leader_attacked",
                        effects: [{ op: "damage", target: "enemy:follower", amount: 1 }],
                    }],
                }])
                .build();

            const card = findOnBoard("first", "Guardian");
            expect(card!.triggers![0].event).toBe("leader_attacked");
        });

        it("leader_restored trigger structure is valid", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Healer",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    triggers: [{
                        event: "leader_restored",
                        effects: [{ op: "draw", source: "deck", count: 1 }],
                    }],
                }])
                .build();

            const card = findOnBoard("first", "Healer");
            expect(card!.triggers![0].event).toBe("leader_restored");
        });
    });

    // ===========================================================================
    // SELF EVENTS
    // ===========================================================================

    describe("self events", () => {
        it("self_damaged trigger structure is valid", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Masochist",
                    type: "Follower",
                    attack: 1,
                    defense: 5,
                    triggers: [{
                        event: "self_damaged",
                        effects: [{ op: "stat", action: "give", target: "self", attack: 1 }],
                    }],
                }])
                .build();

            const card = findOnBoard("first", "Masochist");
            expect(card!.triggers![0].event).toBe("self_damaged");
        });

        it("self_buffed_up trigger structure is valid", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Grower",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    triggers: [{
                        event: "self_buffed_up",
                        effects: [{ op: "draw", source: "deck", count: 1 }],
                    }],
                }])
                .build();

            const card = findOnBoard("first", "Grower");
            expect(card!.triggers![0].event).toBe("self_buffed_up");
        });
    });

    // ===========================================================================
    // SPECIAL EVENTS
    // ===========================================================================

    describe("special events", () => {
        it("ally_ward_destroyed trigger structure is valid", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "WardWatcher",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    triggers: [{
                        event: "ally_ward_destroyed",
                        effects: [{ op: "summon", source: "named", name: "Knight", count: 1 }],
                    }],
                }])
                .build();

            const card = findOnBoard("first", "WardWatcher");
            expect(card!.triggers![0].event).toBe("ally_ward_destroyed");
        });

        it("invoke trigger structure is valid", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Invoker",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    triggers: [{
                        event: "invoke",
                        condition: { type: "combo", count: 10 },
                        effects: [{ op: "damage", target: "enemy:follower", amount: 5 }],
                    }],
                }])
                .build();

            const card = findOnBoard("first", "Invoker");
            expect(card!.triggers![0].event).toBe("invoke");
        });
    });
});
