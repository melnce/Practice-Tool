/**
 * Golden Invariant: Damage Calculator Stability
 * 
 * Asserts overflow on/off behavior and edge cases for damage calculation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState";
import { resolveDamageAmount, DamageAmountContext } from "../../src/logic/effects/ops/damage/calculator";
import { Effect } from "../../src/core/types";

describe("Golden: Damage Calculator Stability", () => {
    beforeEach(() => {
        resetGameState();
        // Ensure no overflow state (maxPP < 7)
        state.blueMaxPP = 3;
        state.redMaxPP = 3;
    });

    describe("base amount resolution", () => {
        it("resolves numeric amount", () => {
            const eff: Effect = { op: "damage", amount: 5 };
            const ctx: DamageAmountContext = { owner: "blue" };

            const result = resolveDamageAmount(eff, ctx);

            expect(result.baseAmount).toBe(5);
            expect(result.finalAmount).toBe(5);
            expect(result.isOverflowing).toBe(false);
        });

        it("handles zero damage", () => {
            const eff: Effect = { op: "damage", amount: 0 };
            const ctx: DamageAmountContext = { owner: "blue" };

            const result = resolveDamageAmount(eff, ctx);

            expect(result.finalAmount).toBe(0);
        });
    });

    describe("add_amount stacking", () => {
        it("adds add_amount to base", () => {
            const eff: Effect = { op: "damage", amount: 3, add_amount: 2 };
            const ctx: DamageAmountContext = { owner: "blue" };

            const result = resolveDamageAmount(eff, ctx);

            expect(result.baseAmount).toBe(3);
            expect(result.addAmount).toBe(2);
            expect(result.finalAmount).toBe(5);
        });
    });

    describe("overflow mechanics", () => {
        it("uses overflow_amount when overflowing", () => {
            // Trigger overflow: maxPP >= 7
            state.blueMaxPP = 7;

            const eff: Effect = { op: "damage", amount: 2, amount_overflow: 5 };
            const ctx: DamageAmountContext = { owner: "blue" };

            const result = resolveDamageAmount(eff, ctx);

            expect(result.isOverflowing).toBe(true);
            expect(result.overflowAmount).toBe(5);
            expect(result.finalAmount).toBe(5); // Overflow replaces, not adds
        });

        it("uses base amount when not overflowing", () => {
            state.blueMaxPP = 6; // Not overflowing (< 7)

            const eff: Effect = { op: "damage", amount: 2, amount_overflow: 5 };
            const ctx: DamageAmountContext = { owner: "blue" };

            const result = resolveDamageAmount(eff, ctx);

            expect(result.isOverflowing).toBe(false);
            expect(result.finalAmount).toBe(2);
        });

        it("overflow + add_amount combines correctly", () => {
            state.blueMaxPP = 7; // Overflowing

            const eff: Effect = { op: "damage", amount: 2, amount_overflow: 4, add_amount: 1 };
            const ctx: DamageAmountContext = { owner: "blue" };

            const result = resolveDamageAmount(eff, ctx);

            expect(result.isOverflowing).toBe(true);
            expect(result.finalAmount).toBe(5); // 4 (overflow) + 1 (add)
        });
    });

    describe("edge cases", () => {
        it("handles undefined add_amount gracefully", () => {
            const eff: Effect = { op: "damage", amount: 3 };
            const ctx: DamageAmountContext = { owner: "blue" };

            const result = resolveDamageAmount(eff, ctx);

            expect(result.addAmount).toBe(0);
            expect(result.finalAmount).toBe(3);
        });
    });
});
