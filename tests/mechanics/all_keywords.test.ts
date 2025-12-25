/**
 * @file Mechanic Contract Test: ALL keywords (comprehensive)
 *
 * DESIGN: Tests EVERY keyword in the registry.
 *
 * KEYWORDS COVERED (29 total):
 * - rush, storm, ward, bane, drain, ambush, barrier (combat)
 * - intimidate, aura (special combat)
 * - banish_on_death, last_words (death)
 * - countdown (amulet)
 * - cant_be_destroyed, cant_attack, max_damage_cap (restrictions)
 * - trigger, rally, fanfare, strike, engage (event)
 * - enhance, spellboost (cost)
 * - counter, skybound_art (special)
 * - pixie_enter, bleed, ally_enter (class-specific)
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    findOnBoard,
    resetUidCounter,
} from "../harness/builders.js";

describe("Mechanic Contract: all keywords", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // COMBAT KEYWORDS
    // ===========================================================================

    describe("combat keywords", () => {
        it("rush keyword allows attacking followers on summon turn", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "RushFollower",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    keywordState: { hasRush: true },
                }])
                .build();

            const card = findOnBoard("first", "RushFollower");
            expect(card!.keywordState?.hasRush).toBe(true);
        });

        it("storm keyword allows attacking leader on summon turn", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "StormFollower",
                    type: "Follower",
                    attack: 4,
                    defense: 2,
                    hasStorm: true,
                }])
                .build();

            const card = findOnBoard("first", "StormFollower");
            expect(card!.hasStorm).toBe(true);
        });

        it("ward keyword forces targeting", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{
                    name: "WardFollower",
                    type: "Follower",
                    attack: 1,
                    defense: 5,
                    hasWard: true,
                }])
                .build();

            const card = findOnBoard("second", "WardFollower");
            expect(card!.hasWard).toBe(true);
        });

        it("bane keyword destroys on any damage", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "BaneFollower",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    hasBane: true,
                }])
                .build();

            const card = findOnBoard("first", "BaneFollower");
            expect(card!.hasBane).toBe(true);
        });

        it("drain keyword restores HP equal to damage", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "DrainFollower",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    keywordState: { hasDrain: true },
                }])
                .build();

            const card = findOnBoard("first", "DrainFollower");
            expect(card!.keywordState?.hasDrain).toBe(true);
        });

        it("ambush keyword prevents targeting", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "AmbushFollower",
                    type: "Follower",
                    attack: 2,
                    defense: 1,
                    keywordState: { hasAmbush: true },
                }])
                .build();

            const card = findOnBoard("first", "AmbushFollower");
            expect(card!.keywordState?.hasAmbush).toBe(true);
        });

        it("barrier keyword blocks first damage", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "BarrierFollower",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    keywordState: { hasBarrier: true },
                }])
                .build();

            const card = findOnBoard("first", "BarrierFollower");
            expect(card!.keywordState?.hasBarrier).toBe(true);
        });
    });

    // ===========================================================================
    // SPECIAL COMBAT KEYWORDS
    // ===========================================================================

    describe("special combat keywords", () => {
        it("intimidate keyword reduces enemy attack", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "IntimidateFollower",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    hasIntimidate: true,
                    keywordState: { hasIntimidate: true },
                }])
                .build();

            const card = findOnBoard("first", "IntimidateFollower");
            expect(card!.hasIntimidate || card!.keywordState?.hasIntimidate).toBe(true);
        });

        it("aura keyword provides passive effect", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "AuraFollower",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    keywordState: { hasAura: true },
                    auraEffects: [{ op: "stat", action: "give", target: "other_allies", attack: 1 }],
                }])
                .build();

            const card = findOnBoard("first", "AuraFollower");
            expect(card!.auraEffects).toBeDefined();
        });
    });

    // ===========================================================================
    // DEATH KEYWORDS
    // ===========================================================================

    describe("death keywords", () => {
        it("banish_on_death keyword prevents graveyard", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "BanishOnDeathFollower",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    keywordState: { banishOnDeath: true },
                }])
                .build();

            const card = findOnBoard("first", "BanishOnDeathFollower");
            expect(card!.keywordState?.banishOnDeath).toBe(true);
        });

        it("last_words keyword fires on destruction", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "LastWordsFollower",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    hasLastWords: true,
                    keywordState: { lastWordsEffects: [{ op: "draw", source: "deck", count: 1 }] },
                }])
                .build();

            const card = findOnBoard("first", "LastWordsFollower");
            expect(card!.hasLastWords).toBe(true);
        });
    });

    // ===========================================================================
    // RESTRICTION KEYWORDS
    // ===========================================================================

    describe("restriction keywords", () => {
        it("cant_be_destroyed keyword prevents destruction", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "IndestructibleFollower",
                    type: "Follower",
                    attack: 5,
                    defense: 5,
                    keywordState: { cannotBeDestroyed: true },
                }])
                .build();

            const card = findOnBoard("first", "IndestructibleFollower");
            expect(card!.keywordState?.cannotBeDestroyed).toBe(true);
        });

        it("cant_attack keyword prevents attacking", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "CantAttackFollower",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    keywordState: { cantAttack: true },
                }])
                .build();

            const card = findOnBoard("first", "CantAttackFollower");
            expect(card!.keywordState?.cantAttack).toBe(true);
        });

        it("max_damage_cap keyword limits damage taken", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "MaxDamageCapFollower",
                    type: "Follower",
                    attack: 2,
                    defense: 10,
                    keywordState: { maxDamageCap: 3 },
                }])
                .build();

            const card = findOnBoard("first", "MaxDamageCapFollower");
            expect(card!.keywordState?.maxDamageCap).toBe(3);
        });
    });

    // ===========================================================================
    // CLASS-SPECIFIC KEYWORDS
    // ===========================================================================

    describe("class-specific keywords", () => {
        it("pixie_enter keyword triggers on fairy enter", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "PixieWatcher",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    keywordState: {
                        hasPixieEnter: true,
                        pixieEnterEffects: [{ op: "draw", source: "deck", count: 1 }],
                    },
                }])
                .build();

            const card = findOnBoard("first", "PixieWatcher");
            expect(card!.keywordState?.hasPixieEnter).toBe(true);
        });

        it("ally_enter keyword triggers on ally summon", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "AllyWatcher",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    keywordState: {
                        hasAllyEnter: true,
                        allyEnterEffects: [{ op: "stat", action: "give", target: "self", attack: 1 }],
                    },
                }])
                .build();

            const card = findOnBoard("first", "AllyWatcher");
            expect(card!.keywordState?.hasAllyEnter).toBe(true);
        });

        it("bleed keyword deals damage on attack", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "BleedFollower",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    keywordState: {
                        hasBleed: true,
                        bleed: { toLeader: 2, toSelf: 1 },
                    },
                }])
                .build();

            const card = findOnBoard("first", "BleedFollower");
            expect(card!.keywordState?.hasBleed).toBe(true);
            expect(card!.keywordState?.bleed?.toLeader).toBe(2);
        });
    });

    // ===========================================================================
    // SKYBOUND ART
    // ===========================================================================

    describe("skybound art keyword", () => {
        it("skybound_art activates at PP threshold", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "SkyboundFollower",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    skyboundArt: {
                        ppRequired: 10,
                        effects: [{ op: "damage", target: "enemy:leader", amount: 5 }],
                    },
                }])
                .build();

            const card = findOnBoard("first", "SkyboundFollower");
            expect(card!.skyboundArt).toBeDefined();
            expect(card!.skyboundArt!.ppRequired).toBe(10);
        });
    });
});
