/**
 * @file Mechanic Contract Test: search operation
 *
 * DESIGN: Tests the search op (distinct from draw).
 *
 * SEMANTIC DIFFERENCE:
 * - draw: Random card acquisition (no player choice)
 * - search: Filtered deck search (player selects from options)
 *
 * INVARIANTS UNDER TEST:
 * - Searches deck for matching cards
 * - Adds matching cards to hand (respects MAX_HAND)
 * - Shuffles deck AFTER search (deterministic with seed)
 * - Respects filter criteria (type, cost, tribe, cost_gte, cost_lte)
 * - Does nothing if no matches OR no filters
 * - Takes topmost matches first (highest indices)
 * - Applies keywords to searched cards
 * - Updates lastAddedToHand and lastSearchedCards state
 * - Card zone transitions from deck to hand
 * - Card UIDs remain stable through search
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    whenPlayCard,
    thenHand,
    thenDeck,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: search op", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // BASIC SEARCH - Core functionality
    // ===========================================================================

    describe("basic search", () => {
        it("finds matching card in deck and adds to hand", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Vanilla", type: "Follower", attack: 1, defense: 1 },
                    { name: "TargetSpell", type: "Spell", cost: 2 },
                    { name: "Target", type: "Follower", attack: 3, defense: 3 },
                ])
                .build();

            const deckBefore = state.players.first.deck.length;
            const handBefore = thenHand("first").length;

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 1,
            }], "first");

            // ASSERTION: Deck shrinks by exactly 1
            expect(state.players.first.deck.length).toBe(deckBefore - 1);
            // ASSERTION: Hand grows by exactly 1
            expect(thenHand("first").length).toBe(handBefore + 1);
            // ASSERTION: Correct card was found
            const foundSpell = thenHand("first").find((c) => c.name === "TargetSpell");
            expect(foundSpell).toBeDefined();
            expect(foundSpell!.type).toBe("Spell");
        });

        it("search with no matches does nothing - deck and hand unchanged", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "A", type: "Follower", attack: 1, defense: 1 },
                    { name: "B", type: "Follower", attack: 2, defense: 2 },
                ])
                .withFirstHand([
                    { name: "InHand", type: "Spell", cost: 1 },
                ])
                .build();

            const handBefore = thenHand("first").length;
            const deckBefore = state.players.first.deck.length;
            const deckCardsBefore = state.players.first.deck.map(c => c.uid);

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Amulet" },
                count: 1,
            }], "first");

            // ASSERTION: Hand unchanged
            expect(thenHand("first").length).toBe(handBefore);
            // ASSERTION: Deck unchanged (no shuffle when no match)
            expect(state.players.first.deck.length).toBe(deckBefore);
        });

        it("search with empty filter object does nothing", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "A", type: "Follower", attack: 1, defense: 1 },
                    { name: "B", type: "Spell", cost: 2 },
                ])
                .build();

            const deckBefore = state.players.first.deck.length;

            whenRunEffects([{
                op: "search" as const,
                filter: {},
                count: 1,
            }], "first");

            // ASSERTION: No search without filters
            expect(state.players.first.deck.length).toBe(deckBefore);
        });

        it("search with count 0 does nothing", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "A", type: "Spell", cost: 1 },
                ])
                .build();

            const deckBefore = state.players.first.deck.length;

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 0,
            }], "first");

            expect(state.players.first.deck.length).toBe(deckBefore);
        });

        it("search with negative count does nothing", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "A", type: "Spell", cost: 1 },
                ])
                .build();

            const deckBefore = state.players.first.deck.length;

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: -5,
            }], "first");

            expect(state.players.first.deck.length).toBe(deckBefore);
        });
    });

    // ===========================================================================
    // FILTER TYPES - All supported filter criteria
    // ===========================================================================

    describe("filter types", () => {
        it("searches by card type", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Follower1", type: "Follower", attack: 1, defense: 1 },
                    { name: "Amulet1", type: "Amulet", cost: 2 },
                    { name: "Follower2", type: "Follower", attack: 2, defense: 2 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Amulet" },
                count: 1,
            }], "first");

            const found = thenHand("first").find((c) => c.name === "Amulet1");
            expect(found).toBeDefined();
            expect(found!.type).toBe("Amulet");
            // ASSERTION: Followers still in deck
            expect(thenDeck("first").every(c => c.type === "Follower")).toBe(true);
        });

        it("searches by exact cost", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Cheap", type: "Follower", cost: 1, attack: 1, defense: 1 },
                    { name: "Mid", type: "Follower", cost: 5, attack: 3, defense: 3 },
                    { name: "Expensive", type: "Follower", cost: 8, attack: 5, defense: 5 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { cost: 8 },
                count: 1,
            }], "first");

            const found = thenHand("first").find((c) => c.name === "Expensive");
            expect(found).toBeDefined();
            expect(found!.cost).toBe(8);
        });

        it("searches by cost_gte (greater than or equal)", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Cheap", type: "Follower", cost: 1, attack: 1, defense: 1 },
                    { name: "Mid", type: "Follower", cost: 5, attack: 3, defense: 3 },
                    { name: "Expensive", type: "Follower", cost: 8, attack: 5, defense: 5 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { cost_gte: 5 },
                count: 2,
            }], "first");

            const hand = thenHand("first");
            // ASSERTION: Found exactly the cards >= 5 cost
            expect(hand.length).toBe(2);
            expect(hand.every(c => Number(c.cost) >= 5)).toBe(true);
        });

        it("searches by cost_lte (less than or equal)", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Cheap", type: "Follower", cost: 1, attack: 1, defense: 1 },
                    { name: "Mid", type: "Follower", cost: 5, attack: 3, defense: 3 },
                    { name: "Expensive", type: "Follower", cost: 8, attack: 5, defense: 5 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { cost_lte: 5 },
                count: 3,
            }], "first");

            const hand = thenHand("first");
            expect(hand.length).toBe(2); // Only Cheap and Mid
            expect(hand.every(c => Number(c.cost) <= 5)).toBe(true);
        });

        it("searches by tribe", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Dragon1", type: "Follower", tribes: ["Dragon"], attack: 5, defense: 5 },
                    { name: "Fairy1", type: "Follower", tribes: ["Fairy"], attack: 1, defense: 1 },
                    { name: "Dragon2", type: "Follower", tribes: ["Dragon"], attack: 3, defense: 3 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { tribe: "Dragon" },
                count: 2,
            }], "first");

            const hand = thenHand("first");
            expect(hand.length).toBe(2);
            expect(hand.every(c => c.tribes?.includes("Dragon"))).toBe(true);
        });

        it("searches by combined filters (type AND cost_gte)", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "CheapFollower", type: "Follower", cost: 1, attack: 1, defense: 1 },
                    { name: "ExpensiveFollower", type: "Follower", cost: 7, attack: 5, defense: 5 },
                    { name: "ExpensiveSpell", type: "Spell", cost: 7 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Follower", cost_gte: 7 },
                count: 1,
            }], "first");

            const hand = thenHand("first");
            expect(hand.length).toBe(1);
            expect(hand[0].name).toBe("ExpensiveFollower");
        });
    });

    // ===========================================================================
    // COUNT BEHAVIOR - Multiple cards and limits
    // ===========================================================================

    describe("search count", () => {
        it("searches for exact count when available", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Spell1", type: "Spell", cost: 1 },
                    { name: "Spell2", type: "Spell", cost: 2 },
                    { name: "Spell3", type: "Spell", cost: 3 },
                    { name: "Follower", type: "Follower", attack: 1, defense: 1 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 2,
            }], "first");

            const spells = thenHand("first").filter((c) => c.type === "Spell");
            expect(spells.length).toBe(2);
            // ASSERTION: Deck has remaining spell + follower
            expect(thenDeck("first").length).toBe(2);
        });

        it("searches limited by available matches - count exceeds matches", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "OnlySpell", type: "Spell", cost: 1 },
                    { name: "Follower", type: "Follower", attack: 1, defense: 1 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 5,
            }], "first");

            // ASSERTION: Only got 1 (all available)
            const spells = thenHand("first").filter((c) => c.type === "Spell");
            expect(spells.length).toBe(1);
        });

        it("takes topmost matching cards first (highest deck indices)", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    // Index 0 (bottom)
                    { name: "BottomSpell", type: "Spell", cost: 1 },
                    // Index 1
                    { name: "MiddleSpell", type: "Spell", cost: 2 },
                    // Index 2 (top)
                    { name: "TopSpell", type: "Spell", cost: 3 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 1,
            }], "first");

            // ASSERTION: Got the TOP spell (highest index)
            const found = thenHand("first").find(c => c.type === "Spell");
            expect(found?.name).toBe("TopSpell");
        });

        it("takes multiple topmost when count > 1", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "BottomSpell", type: "Spell", cost: 1 },
                    { name: "MiddleSpell", type: "Spell", cost: 2 },
                    { name: "TopSpell", type: "Spell", cost: 3 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 2,
            }], "first");

            // ASSERTION: Got Top and Middle, Bottom remains
            const hand = thenHand("first");
            expect(hand.some(c => c.name === "TopSpell")).toBe(true);
            expect(hand.some(c => c.name === "MiddleSpell")).toBe(true);
            expect(thenDeck("first").some(c => c.name === "BottomSpell")).toBe(true);
        });
    });

    // ===========================================================================
    // HAND OVERFLOW - Excess cards go to graveyard (NOT blocked)
    // ===========================================================================

    describe("hand overflow (excess to graveyard)", () => {
        it("puts excess searched cards in graveyard when hand fills", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "DeckSpell1", type: "Spell", cost: 1 },
                    { name: "DeckSpell2", type: "Spell", cost: 2 },
                    { name: "DeckSpell3", type: "Spell", cost: 3 },
                ])
                .withFirstHand([
                    // 8 cards already in hand
                    { name: "H1", type: "Follower", attack: 1, defense: 1 },
                    { name: "H2", type: "Follower", attack: 1, defense: 1 },
                    { name: "H3", type: "Follower", attack: 1, defense: 1 },
                    { name: "H4", type: "Follower", attack: 1, defense: 1 },
                    { name: "H5", type: "Follower", attack: 1, defense: 1 },
                    { name: "H6", type: "Follower", attack: 1, defense: 1 },
                    { name: "H7", type: "Follower", attack: 1, defense: 1 },
                    { name: "H8", type: "Follower", attack: 1, defense: 1 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 3,
            }], "first");

            // ASSERTION: Hand capped at 9
            expect(thenHand("first").length).toBe(9);
            // ASSERTION: Only 1 spell added to hand
            expect(thenHand("first").filter(c => c.type === "Spell").length).toBe(1);
            // ASSERTION: Deck is now empty (all 3 spells were searched)
            expect(thenDeck("first").length).toBe(0);
            // ASSERTION: 2 spells went to graveyard (overflow)
            const grave = state.players.first.graveyard;
            expect(grave.filter(c => c.type === "Spell").length).toBe(2);
        });

        it("all searched cards go to graveyard when hand is already full (9)", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "DeckSpell", type: "Spell", cost: 1 },
                ])
                .withFirstHand([
                    { name: "H1", type: "Follower", attack: 1, defense: 1 },
                    { name: "H2", type: "Follower", attack: 1, defense: 1 },
                    { name: "H3", type: "Follower", attack: 1, defense: 1 },
                    { name: "H4", type: "Follower", attack: 1, defense: 1 },
                    { name: "H5", type: "Follower", attack: 1, defense: 1 },
                    { name: "H6", type: "Follower", attack: 1, defense: 1 },
                    { name: "H7", type: "Follower", attack: 1, defense: 1 },
                    { name: "H8", type: "Follower", attack: 1, defense: 1 },
                    { name: "H9", type: "Follower", attack: 1, defense: 1 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 1,
            }], "first");

            // ASSERTION: Hand still at 9 (no room)
            expect(thenHand("first").length).toBe(9);
            // ASSERTION: Deck is now empty (spell was searched)
            expect(thenDeck("first").length).toBe(0);
            // ASSERTION: Spell went to graveyard
            const grave = state.players.first.graveyard;
            expect(grave.some(c => c.name === "DeckSpell")).toBe(true);
            expect(grave.find(c => c.name === "DeckSpell")?.zone).toBe("graveyard");
        });

        it("searched cards in graveyard still have keywords applied", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "DeckFollower", type: "Follower", attack: 2, defense: 2 },
                ])
                .withFirstHand([
                    { name: "H1", type: "Follower", attack: 1, defense: 1 },
                    { name: "H2", type: "Follower", attack: 1, defense: 1 },
                    { name: "H3", type: "Follower", attack: 1, defense: 1 },
                    { name: "H4", type: "Follower", attack: 1, defense: 1 },
                    { name: "H5", type: "Follower", attack: 1, defense: 1 },
                    { name: "H6", type: "Follower", attack: 1, defense: 1 },
                    { name: "H7", type: "Follower", attack: 1, defense: 1 },
                    { name: "H8", type: "Follower", attack: 1, defense: 1 },
                    { name: "H9", type: "Follower", attack: 1, defense: 1 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Follower", attack: 2 },
                count: 1,
                keywords: ["Rush"],
            }], "first");

            // ASSERTION: Card went to graveyard with keyword applied
            const grave = state.players.first.graveyard;
            const found = grave.find(c => c.name === "DeckFollower");
            expect(found).toBeDefined();
            expect(found!.hasRush).toBe(true);
        });

        it("search spell played from full hand: spell leaves first, then search adds card", () => {
            // CRITICAL TCG MECHANIC:
            // When playing a spell that searches with 9 cards in hand:
            // 1. Pay PP
            // 2. Spell leaves hand → graveyard (hand now 8)
            // 3. Spell effect resolves → search adds card (hand now 9)
            // Result: searched card goes to hand, NOT graveyard

            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "FoundCard", type: "Follower", attack: 3, defense: 3 },
                ])
                .withFirstHand([
                    // 9 cards in hand - the 9th is our search spell
                    { name: "H1", type: "Follower", attack: 1, defense: 1 },
                    { name: "H2", type: "Follower", attack: 1, defense: 1 },
                    { name: "H3", type: "Follower", attack: 1, defense: 1 },
                    { name: "H4", type: "Follower", attack: 1, defense: 1 },
                    { name: "H5", type: "Follower", attack: 1, defense: 1 },
                    { name: "H6", type: "Follower", attack: 1, defense: 1 },
                    { name: "H7", type: "Follower", attack: 1, defense: 1 },
                    { name: "H8", type: "Follower", attack: 1, defense: 1 },
                    // This is the search spell we'll play
                    {
                        name: "SearchSpell",
                        type: "Spell",
                        cost: 1,
                        spell: [{ op: "search", filter: { type: "Follower" }, count: 1 }],
                    },
                ])
                .withFirstPP(1, 1)
                .build();

            expect(thenHand("first").length).toBe(9);

            // Play the search spell (last card in hand, index 8)
            whenPlayCard("first", 8);

            // ASSERTION: Hand still at 9 (spell left, searched card arrived)
            expect(thenHand("first").length).toBe(9);
            // ASSERTION: Searched card is in hand
            expect(thenHand("first").some(c => c.name === "FoundCard")).toBe(true);
            // ASSERTION: Deck is empty (card was searched)
            expect(thenDeck("first").length).toBe(0);
            // ASSERTION: Spell is in graveyard
            const grave = state.players.first.graveyard;
            expect(grave.some(c => c.name === "SearchSpell")).toBe(true);
            // ASSERTION: Searched card is NOT in graveyard
            expect(grave.some(c => c.name === "FoundCard")).toBe(false);
        });
    });

    // ===========================================================================
    // DECK SHUFFLE - Deterministic shuffle after search
    // ===========================================================================

    describe("deck shuffle after search", () => {
        it("shuffles deck AFTER search (deterministic with seed)", () => {
            givenGameState({ seed: 42 })
                .withFirstDeck([
                    { name: "A", type: "Follower", attack: 1, defense: 1 },
                    { name: "Target", type: "Spell", cost: 1 },
                    { name: "B", type: "Follower", attack: 2, defense: 2 },
                    { name: "C", type: "Follower", attack: 3, defense: 3 },
                ])
                .build();

            const deckOrderBefore = state.players.first.deck.map(c => c.name);

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 1,
            }], "first");

            const deckOrderAfter = state.players.first.deck.map(c => c.name);

            // ASSERTION: Deck has 3 cards remaining
            expect(state.players.first.deck.length).toBe(3);
            // ASSERTION: Deck order changed (shuffled) - with seed 42 this is deterministic
            expect(deckOrderAfter).not.toEqual(["A", "B", "C"]);
        });

        it("produces same shuffle order with same seed (determinism)", () => {
            const runSearch = (seed: number) => {
                givenGameState({ seed })
                    .withFirstDeck([
                        { name: "A", type: "Follower", attack: 1, defense: 1 },
                        { name: "Target", type: "Spell", cost: 1 },
                        { name: "B", type: "Follower", attack: 2, defense: 2 },
                        { name: "C", type: "Follower", attack: 3, defense: 3 },
                        { name: "D", type: "Follower", attack: 4, defense: 4 },
                    ])
                    .build();

                whenRunEffects([{
                    op: "search" as const,
                    filter: { type: "Spell" },
                    count: 1,
                }], "first");

                return state.players.first.deck.map(c => c.name);
            };

            const order1 = runSearch(999);
            resetUidCounter();
            const order2 = runSearch(999);

            // ASSERTION: Same seed = same deck order
            expect(order1).toEqual(order2);
        });
    });

    // ===========================================================================
    // KEYWORD APPLICATION - Keywords applied to searched cards
    // ===========================================================================

    describe("keyword application", () => {
        it("applies keywords to searched cards", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "TargetFollower", type: "Follower", attack: 2, defense: 2 },
                    { name: "Other", type: "Spell", cost: 1 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Follower" },
                count: 1,
                keywords: ["Rush", "Ward"],
            }], "first");

            const found = thenHand("first").find(c => c.name === "TargetFollower");
            expect(found).toBeDefined();
            // ASSERTION: Keywords applied (stored as hasX flags)
            expect(found!.hasRush).toBe(true);
            expect(found!.hasWard).toBe(true);
        });

        it("does not apply keywords when none specified", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "TargetFollower", type: "Follower", attack: 2, defense: 2 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Follower" },
                count: 1,
            }], "first");

            const found = thenHand("first").find(c => c.name === "TargetFollower");
            // ASSERTION: No unexpected keywords
            expect(found!.hasRush).toBeFalsy();
        });
    });

    // ===========================================================================
    // STATE TRACKING - lastSearchedCards and lastAddedToHand
    // ===========================================================================

    describe("state tracking", () => {
        it("updates lastAddedToHand to the last searched card", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "First", type: "Spell", cost: 1 },
                    { name: "Second", type: "Spell", cost: 2 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 2,
            }], "first");

            // ASSERTION: lastAddedToHand is set
            expect((state as any).lastAddedToHand).toBeDefined();
            expect((state as any).lastAddedToHand.type).toBe("Spell");
        });

        it("updates lastSearchedCards array", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Spell1", type: "Spell", cost: 1 },
                    { name: "Spell2", type: "Spell", cost: 2 },
                    { name: "Follower", type: "Follower", attack: 1, defense: 1 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 2,
            }], "first");

            // ASSERTION: lastSearchedCards contains searched cards
            expect((state as any).lastSearchedCards).toBeDefined();
            expect((state as any).lastSearchedCards.length).toBe(2);
            expect((state as any).lastSearchedCards.every((c: any) => c.type === "Spell")).toBe(true);
        });
    });

    // ===========================================================================
    // ZONE TRANSITIONS - Card zone property updates
    // ===========================================================================

    describe("zone transitions", () => {
        it("sets card zone to 'hand' when searched", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Target", type: "Spell", cost: 1 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 1,
            }], "first");

            const found = thenHand("first").find(c => c.name === "Target");
            expect(found?.zone).toBe("hand");
        });
    });

    // ===========================================================================
    // UID STABILITY - UIDs preserved through search
    // ===========================================================================

    describe("UID stability", () => {
        it("preserves card UID when moved from deck to hand", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Target", type: "Spell", cost: 1 },
                ])
                .build();

            const uidBefore = state.players.first.deck[0].uid;

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 1,
            }], "first");

            const found = thenHand("first").find(c => c.name === "Target");
            // ASSERTION: Same UID (card identity preserved)
            expect(found?.uid).toBe(uidBefore);
        });
    });

    // ===========================================================================
    // PLAYER TARGETING - Search for opponent
    // ===========================================================================

    describe("player targeting", () => {
        it("can search opponent's deck when player: opponent", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "FirstDeck", type: "Spell", cost: 1 },
                ])
                .withSecondDeck([
                    { name: "SecondDeck", type: "Amulet", cost: 2 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Amulet" },
                count: 1,
                player: "opponent",
            }], "first");

            // ASSERTION: Opponent's deck was searched
            expect(thenDeck("second").length).toBe(0);
            // ASSERTION: Opponent's hand has the card
            expect(thenHand("second").some(c => c.name === "SecondDeck")).toBe(true);
            // ASSERTION: First player's hand unchanged
            expect(thenHand("first").some(c => c.name === "SecondDeck")).toBe(false);
        });
    });

    // ===========================================================================
    // EDGE CASES - Empty deck, single card, etc.
    // ===========================================================================

    describe("edge cases", () => {
        it("handles empty deck gracefully", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([])
                .build();

            // Should not throw
            expect(() => {
                whenRunEffects([{
                    op: "search" as const,
                    filter: { type: "Spell" },
                    count: 1,
                }], "first");
            }).not.toThrow();

            expect(thenHand("first").length).toBe(0);
        });

        it("handles deck with single matching card", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Only", type: "Spell", cost: 1 },
                ])
                .build();

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 1,
            }], "first");

            expect(thenHand("first").length).toBe(1);
            expect(thenDeck("first").length).toBe(0);
        });

        it("handles large deck efficiently", () => {
            const largeDeck = Array.from({ length: 40 }, (_, i) => ({
                name: `Card${i}`,
                type: i % 3 === 0 ? "Spell" : "Follower",
                cost: i,
                attack: i,
                defense: i,
            }));

            givenGameState({ seed: 1 })
                .withFirstDeck(largeDeck as any)
                .build();

            const spellCountBefore = state.players.first.deck.filter(c => c.type === "Spell").length;

            whenRunEffects([{
                op: "search" as const,
                filter: { type: "Spell" },
                count: 3,
            }], "first");

            // ASSERTION: Got 3 spells
            expect(thenHand("first").filter(c => c.type === "Spell").length).toBe(3);
            // ASSERTION: Deck has 3 fewer spells
            expect(thenDeck("first").filter(c => c.type === "Spell").length).toBe(spellCountBefore - 3);
        });
    });
});
