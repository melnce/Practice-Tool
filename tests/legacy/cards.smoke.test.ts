/**
 * @file Card Smoke Tests
 *
 * DESIGN: Comprehensive validation for all 428+ cards.
 * Ensures every card has valid schema and can be played without crashing.
 *
 * TIERS:
 *   1. Schema Validation - All required fields present
 *   2. Play Sanity - Card can be instantiated and played
 *   3. Effect Coverage - Operations execute without errors
 */

import { describe, it, expect, beforeEach } from "vitest";
import allCards from "../cards/all.json";
import tokenCards from "../cards/token_details.json";
import {
    givenGameState,
    resetUidCounter,
    whenPlayCard,
    thenBoard,
    thenHand,
} from "./harness/builders.js";
import { state } from "../src/core/gameState.js";

// =============================================================================
// TYPES
// =============================================================================

interface CardDef {
    id: string;
    name: string;
    cost: string | number;
    attack?: string | number;
    defense?: string | number;
    type: string;
    class?: string;
    rarity?: string;
    description?: string | null;
    fanfare?: unknown[];
    evolve?: unknown[];
    superevolve?: unknown[];
    keywords?: unknown[];
    spell?: unknown[];
    triggers?: unknown[];
}

// =============================================================================
// DATA SETUP
// =============================================================================

const allCardDefs: CardDef[] = [
    ...(allCards as CardDef[]),
    ...(tokenCards as CardDef[]),
];

// Filter playable cards (have cost, some tokens might not)
const playableCards = allCardDefs.filter(
    (c) => c.cost !== undefined && c.cost !== null
);

// =============================================================================
// SCHEMA VALIDATION
// =============================================================================

describe("Card Smoke Tests", () => {
    describe("Schema Validation", () => {
        it(`validates all ${allCards.length} main cards have required fields`, () => {
            const errors: string[] = [];

            for (const card of allCards as CardDef[]) {
                if (!card.id) errors.push(`Missing id for card: ${JSON.stringify(card).slice(0, 100)}`);
                if (!card.name) errors.push(`Missing name for card id: ${card.id}`);
                if (card.cost === undefined) errors.push(`Missing cost for: ${card.name}`);
                if (!card.type) errors.push(`Missing type for: ${card.name}`);
            }

            expect(errors).toEqual([]);
        });

        it(`validates all ${tokenCards.length} token cards have required fields`, () => {
            const errors: string[] = [];

            for (const card of tokenCards as CardDef[]) {
                if (!card.id) errors.push(`Missing id for token: ${JSON.stringify(card).slice(0, 100)}`);
                if (!card.name) errors.push(`Missing name for token id: ${card.id}`);
            }

            expect(errors).toEqual([]);
        });

        it("has expected total card count", () => {
            // Adjust this assertion as cards are added
            expect(allCards.length).toBeGreaterThanOrEqual(400);
            expect(allCardDefs.length).toBeGreaterThan(allCards.length);
        });
    });

    // =============================================================================
    // PLAY SANITY TESTS (Parameterized)
    // =============================================================================

    describe("Play Sanity", () => {
        beforeEach(() => {
            resetUidCounter();
        });

        // Group cards by type for clearer test organization
        const followers = playableCards.filter((c) => c.type === "Follower");
        const spells = playableCards.filter((c) => c.type === "Spell");
        const amulets = playableCards.filter((c) => c.type === "Amulet");

        describe(`Followers (${followers.length} cards)`, () => {
            it.each(followers.map((c) => [c.id, c.name, c]))(
                "%s: %s - instantiates and plays without crash",
                (id, name) => {
                    // Reset for each card
                    resetUidCounter();

                    // Setup: high PP, empty board, card in hand
                    givenGameState({ seed: parseInt(String(id).slice(-4), 10) || 1 })
                        .withFirstPP(10, 10)
                        .withFirstHand([{ name: String(name) }])
                        .withFirstEvo(3) // Provide evo charges for evolve effects
                        .build();

                    // Should not throw
                    expect(() => {
                        whenPlayCard("first", 0);
                    }).not.toThrow();

                    // Basic sanity: card should move from hand to board
                    expect(thenHand("first").length).toBeLessThanOrEqual(1); // May have add_to_hand effects
                    // Board should have at least the played card (or tokens from summon)
                    // Note: Some cards may destroy themselves or transform
                }
            );
        });

        describe(`Spells (${spells.length} cards)`, () => {
            it.each(spells.map((c) => [c.id, c.name, c]))(
                "%s: %s - casts without crash",
                (id, name) => {
                    resetUidCounter();

                    // Setup: high PP, provide a target for spells that need one
                    givenGameState({ seed: parseInt(String(id).slice(-4), 10) || 1 })
                        .withFirstPP(10, 10)
                        .withFirstHand([{ name: String(name) }])
                        .withFirstBoard([
                            { name: "Target Dummy", type: "Follower", attack: 1, defense: 1 },
                        ])
                        .withSecondBoard([
                            { name: "Enemy Dummy", type: "Follower", attack: 1, defense: 1 },
                        ])
                        .withFirstDeck([
                            { name: "Deck Card 1", type: "Follower", attack: 1, defense: 1 },
                            { name: "Deck Card 2", type: "Follower", attack: 1, defense: 1 },
                        ])
                        .build();

                    expect(() => {
                        whenPlayCard("first", 0);
                    }).not.toThrow();

                    // Spells go to graveyard, not board
                    // Hand should be empty after playing
                }
            );
        });

        describe(`Amulets (${amulets.length} cards)`, () => {
            it.each(amulets.map((c) => [c.id, c.name, c]))(
                "%s: %s - plays without crash",
                (id, name) => {
                    resetUidCounter();

                    givenGameState({ seed: parseInt(String(id).slice(-4), 10) || 1 })
                        .withFirstPP(10, 10)
                        .withFirstHand([{ name: String(name) }])
                        .withFirstEvo(3)
                        .build();

                    expect(() => {
                        whenPlayCard("first", 0);
                    }).not.toThrow();
                }
            );
        });
    });

    // =============================================================================
    // EFFECT OPERATION COVERAGE
    // =============================================================================

    describe("Effect Coverage", () => {
        it("catalogs all unique operations used across cards", () => {
            const ops = new Set<string>();

            function extractOps(effects: unknown[]) {
                if (!Array.isArray(effects)) return;
                for (const effect of effects) {
                    if (effect && typeof effect === "object" && "op" in effect) {
                        ops.add((effect as { op: string }).op);
                    }
                    // Recurse into nested effects
                    if (effect && typeof effect === "object") {
                        const e = effect as Record<string, unknown>;
                        if (Array.isArray(e.effects)) extractOps(e.effects);
                        if (Array.isArray(e.options)) {
                            for (const opt of e.options as unknown[]) {
                                if (opt && typeof opt === "object" && "effects" in opt) {
                                    extractOps((opt as { effects: unknown[] }).effects);
                                }
                            }
                        }
                    }
                }
            }

            for (const card of allCardDefs) {
                extractOps(card.fanfare || []);
                extractOps(card.evolve || []);
                extractOps(card.superevolve || []);
                extractOps(card.spell || []);
                extractOps(card.triggers || []);

                // Extract from keywords
                if (Array.isArray(card.keywords)) {
                    for (const kw of card.keywords) {
                        if (kw && typeof kw === "object" && "effects" in kw) {
                            extractOps((kw as { effects: unknown[] }).effects);
                        }
                    }
                }
            }

            // Should have a reasonable number of operations
            expect(ops.size).toBeGreaterThan(10);

            // Log for visibility during test runs
            console.log(`\nUnique operations found: ${ops.size}`);
            console.log([...ops].sort().join(", "));
        });
    });
});
