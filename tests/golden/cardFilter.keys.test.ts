/**
 * Golden Invariant: CardFilter Semantics
 * 
 * Asserts that preserved filter keys (type, class, cost_*, attack_*, defense_*, tribe_*)
 * produce correct matching behavior.
 */
import { describe, it, expect } from "vitest";
import { normalizeCardFilter } from "../../src/logic/core/cardFilter/normalize";
import { buildCardPredicate } from "../../src/logic/core/cardFilter/predicates";
import { CardInstance } from "../../src/core/types";

function makeCard(overrides: Partial<CardInstance> = {}): CardInstance {
    return {
        uid: "test",
        name: "Test",
        type: "Follower",
        cost: 3,
        attack: 2,
        defense: 2,
        class: "Runecraft",
        tribes: ["Golem"],
        ...overrides,
    } as CardInstance;
}

describe("Golden: CardFilter Key Semantics", () => {
    describe("type filter", () => {
        it("matches exact type", () => {
            const filter = normalizeCardFilter({ type: "Follower" });
            const pred = buildCardPredicate(filter);

            expect(pred(makeCard({ type: "Follower" }))).toBe(true);
            expect(pred(makeCard({ type: "Spell" }))).toBe(false);
        });

        it("is case-insensitive", () => {
            const filter = normalizeCardFilter({ type: "FOLLOWER" });
            const pred = buildCardPredicate(filter);

            expect(pred(makeCard({ type: "Follower" }))).toBe(true);
        });
    });

    describe("class filter", () => {
        it("matches exact class", () => {
            const filter = normalizeCardFilter({ class: "Runecraft" });
            const pred = buildCardPredicate(filter);

            expect(pred(makeCard({ class: "Runecraft" }))).toBe(true);
            expect(pred(makeCard({ class: "Swordcraft" }))).toBe(false);
        });
    });

    describe("cost filters", () => {
        it("cost_lte matches", () => {
            const filter = normalizeCardFilter({ cost_lte: 3 });
            const pred = buildCardPredicate(filter);

            expect(pred(makeCard({ cost: 2 }))).toBe(true);
            expect(pred(makeCard({ cost: 3 }))).toBe(true);
            expect(pred(makeCard({ cost: 4 }))).toBe(false);
        });

        it("cost_gte matches", () => {
            const filter = normalizeCardFilter({ cost_gte: 3 });
            const pred = buildCardPredicate(filter);

            expect(pred(makeCard({ cost: 4 }))).toBe(true);
            expect(pred(makeCard({ cost: 3 }))).toBe(true);
            expect(pred(makeCard({ cost: 2 }))).toBe(false);
        });

        it("cost_eq (exact) matches", () => {
            const filter = normalizeCardFilter({ cost_eq: 3 });
            const pred = buildCardPredicate(filter);

            expect(pred(makeCard({ cost: 3 }))).toBe(true);
            expect(pred(makeCard({ cost: 2 }))).toBe(false);
        });
    });

    describe("attack filters", () => {
        it("attack_lte matches", () => {
            const filter = normalizeCardFilter({ attack_lte: 2 });
            const pred = buildCardPredicate(filter);

            expect(pred(makeCard({ attack: 2 }))).toBe(true);
            expect(pred(makeCard({ attack: 3 }))).toBe(false);
        });

        it("attack_gte matches", () => {
            const filter = normalizeCardFilter({ attack_gte: 2 });
            const pred = buildCardPredicate(filter);

            expect(pred(makeCard({ attack: 2 }))).toBe(true);
            expect(pred(makeCard({ attack: 1 }))).toBe(false);
        });
    });

    describe("defense filters", () => {
        it("defense_lte matches", () => {
            const filter = normalizeCardFilter({ defense_lte: 3 });
            const pred = buildCardPredicate(filter);

            expect(pred(makeCard({ defense: 3 }))).toBe(true);
            expect(pred(makeCard({ defense: 4 }))).toBe(false);
        });
    });

    describe("tribe filters", () => {
        it("tribe (singular) matches", () => {
            const filter = normalizeCardFilter({ tribe: "Golem" });
            const pred = buildCardPredicate(filter);

            expect(pred(makeCard({ tribes: ["Golem"] }))).toBe(true);
            expect(pred(makeCard({ tribes: ["Pixie"] }))).toBe(false);
        });

        it("tribes (array) matches any", () => {
            const filter = normalizeCardFilter({ tribes: ["Golem", "Earth Sigil"] });
            const pred = buildCardPredicate(filter);

            expect(pred(makeCard({ tribes: ["Golem"] }))).toBe(true);
            expect(pred(makeCard({ tribes: ["Earth Sigil"] }))).toBe(true);
            expect(pred(makeCard({ tribes: ["Pixie"] }))).toBe(false);
        });
    });

    describe("combined filters", () => {
        it("all criteria must match (AND logic)", () => {
            const filter = normalizeCardFilter({
                type: "Follower",
                class: "Runecraft",
                cost_lte: 5,
            });
            const pred = buildCardPredicate(filter);

            expect(pred(makeCard({ type: "Follower", class: "Runecraft", cost: 3 }))).toBe(true);
            expect(pred(makeCard({ type: "Spell", class: "Runecraft", cost: 3 }))).toBe(false);
            expect(pred(makeCard({ type: "Follower", class: "Runecraft", cost: 6 }))).toBe(false);
        });
    });
});
