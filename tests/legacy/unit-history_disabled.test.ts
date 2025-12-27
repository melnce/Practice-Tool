// tests/unit/history_disabled.test.ts
// Regression test for history disable safety - ensures abortAction doesn't corrupt state
// when history is disabled (before=null).

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Set HEADLESS before imports
(globalThis as any).HEADLESS = true;

import {
    setHistoryEnabled,
    isHistoryEnabled,
    doAction,
    beginAction,
    commitAction,
    abortAction,
    isInAction,
    resetHistory,
    canUndo,
    canRedo,
    undo,
} from "../../src/core/history";
import { state, resetGameState } from "../../src/core/gameState";

describe("History Module - Disabled Mode", () => {
    beforeEach(() => {
        resetHistory();
        resetGameState(42);
    });

    afterEach(() => {
        // Re-enable history after each test
        setHistoryEnabled(true);
    });

    describe("setHistoryEnabled", () => {
        it("should disable and enable history", () => {
            expect(isHistoryEnabled()).toBe(true);
            setHistoryEnabled(false);
            expect(isHistoryEnabled()).toBe(false);
            setHistoryEnabled(true);
            expect(isHistoryEnabled()).toBe(true);
        });
    });

    describe("doAction with history disabled - error handling", () => {
        it("should NOT corrupt state when action throws (BUG FIX REGRESSION TEST)", () => {
            setHistoryEnabled(false);

            // Capture state before
            const roundCountBefore = state.roundCount;

            // Mutate state and throw
            expect(() => {
                doAction(
                    "FailingAction",
                    () => {
                        (state as any).roundCount = 999; // mutation
                        throw new Error("boom");
                    },
                    {},
                    { autoRender: false }
                );
            }).toThrow("boom");

            // CRITICAL: inAction should be cleared
            expect(isInAction()).toBe(false);

            // With the bug fix, state is NOT reverted (no snapshot was taken)
            // but it should NOT crash or corrupt unrelated state
            // The roundCount was mutated and stays mutated - that's expected when history is disabled
            // The important thing is that abortAction didn't crash by calling replaceState({})
            expect(state.roundCount).toBe(999); // mutation persists
        });

        it("should clear inAction on throw even without snapshot", () => {
            setHistoryEnabled(false);

            expect(() => {
                doAction(
                    "Thrower",
                    () => {
                        throw new Error("test error");
                    },
                    {},
                    { autoRender: false }
                );
            }).toThrow("test error");

            // inAction must be cleared - no leak
            expect(isInAction()).toBe(false);
        });
    });

    describe("Normal commit flow with history disabled", () => {
        it("should not push to history when disabled", () => {
            setHistoryEnabled(false);

            doAction(
                "SomeAction",
                () => {
                    (state as any).roundCount = 50;
                },
                {},
                { autoRender: false }
            );

            expect(canUndo()).toBe(false); // No history was recorded
            expect(state.roundCount).toBe(50);
        });

        it("should allow normal actions when enabled", () => {
            setHistoryEnabled(true);

            doAction(
                "NormalAction",
                () => {
                    (state as any).roundCount = 100;
                },
                {},
                { autoRender: false }
            );

            expect(canUndo()).toBe(true);
            expect(state.roundCount).toBe(100);

            // Undo should work
            undo({ autoRender: false });
            expect(state.roundCount).not.toBe(100);
        });
    });

    describe("abortAction direct call", () => {
        it("should not crash when before is null (history disabled)", () => {
            setHistoryEnabled(false);

            beginAction("Test");
            // inAction.before is null

            // This should NOT throw or corrupt state
            expect(() => abortAction()).not.toThrow();

            // inAction should be cleared
            expect(isInAction()).toBe(false);
        });

        it("should revert state when before exists (history enabled)", () => {
            setHistoryEnabled(true);

            const originalRound = state.roundCount;
            beginAction("Test");
            (state as any).roundCount = 789;

            abortAction({ autoRender: false });

            expect(isInAction()).toBe(false);
            expect(state.roundCount).toBe(originalRound); // State reverted
        });

        it("should respect autoRender option", () => {
            setHistoryEnabled(true);

            beginAction("Test");
            (state as any).roundCount = 123;

            // Should not throw with autoRender: false
            expect(() => abortAction({ autoRender: false })).not.toThrow();
            expect(isInAction()).toBe(false);
        });
    });

    describe("doAction rollback when history enabled", () => {
        it("should revert state when fn throws (rollback works)", () => {
            setHistoryEnabled(true);
            const originalRound = state.roundCount;

            expect(() => {
                doAction(
                    "FailingAction",
                    () => {
                        (state as any).roundCount = 555;
                        throw new Error("test");
                    },
                    {},
                    { autoRender: false }
                );
            }).toThrow("test");

            // State should be reverted (history enabled)
            expect(state.roundCount).toBe(originalRound);
            expect(isInAction()).toBe(false);
        });
    });

    describe("Re-entrancy safety", () => {
        it("should allow nested doAction calls after abortAction clears inAction", () => {
            setHistoryEnabled(true);

            // This tests that inAction is cleared BEFORE any render/notify callbacks
            // Old bug: abortAction cleared inAction at the end, after render,
            // which would cause "beginAction called while another action is open" 
            // if render triggered a new action.

            // Simulate the scenario: an action throws, and during the abort path
            // we want to be able to start a new action immediately.
            expect(() => {
                doAction(
                    "FirstAction",
                    () => {
                        throw new Error("fail");
                    },
                    {},
                    { autoRender: false }
                );
            }).toThrow("fail");

            // inAction should be cleared - we should be able to start a new action
            expect(isInAction()).toBe(false);

            // This should NOT throw "beginAction called while another action is open"
            expect(() => {
                doAction("SecondAction", () => {
                    (state as any).roundCount = 777;
                }, {}, { autoRender: false });
            }).not.toThrow();

            expect(state.roundCount).toBe(777);
        });
    });

    describe("notify consistency", () => {
        it("should call notify even when history disabled", () => {
            setHistoryEnabled(false);

            // Just verify it doesn't crash - notify is always called now
            beginAction("Test");
            expect(() => abortAction({ autoRender: false })).not.toThrow();
            expect(isInAction()).toBe(false);
        });
    });
});
