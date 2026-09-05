/**
 * History module — disabled-mode safety and rollback invariants.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

(globalThis as any).HEADLESS = true;

import {
  setHistoryEnabled,
  isHistoryEnabled,
  doAction,
  beginAction,
  abortAction,
  isInAction,
  resetHistory,
  canUndo,
  undo,
} from "../../src/core/history.js";
import { state, resetGameState } from "../../src/core/gameState.js";

describe("History module — disabled mode", () => {
  beforeEach(() => {
    resetHistory();
    resetGameState(42);
  });

  afterEach(() => {
    setHistoryEnabled(true);
  });

  describe("setHistoryEnabled", () => {
    it("toggles history on and off", () => {
      expect(isHistoryEnabled()).toBe(true);
      setHistoryEnabled(false);
      expect(isHistoryEnabled()).toBe(false);
      setHistoryEnabled(true);
      expect(isHistoryEnabled()).toBe(true);
    });
  });

  describe("doAction with history disabled", () => {
    it("clears inAction on throw without corrupting unrelated state", () => {
      setHistoryEnabled(false);
      const roundCountBefore = state.roundCount;

      expect(() => {
        doAction(
          "FailingAction",
          () => {
            (state as any).roundCount = 999;
            throw new Error("boom");
          },
          {},
          { autoRender: false },
        );
      }).toThrow("boom");

      expect(isInAction()).toBe(false);
      expect(state.roundCount).toBe(999);
      expect(roundCountBefore).not.toBe(999);
    });

    it("clears inAction on throw even without snapshot", () => {
      setHistoryEnabled(false);

      expect(() => {
        doAction(
          "Thrower",
          () => {
            throw new Error("test error");
          },
          {},
          { autoRender: false },
        );
      }).toThrow("test error");

      expect(isInAction()).toBe(false);
    });
  });

  describe("commit flow with history disabled", () => {
    it("does not push to history when disabled", () => {
      setHistoryEnabled(false);

      doAction(
        "SomeAction",
        () => {
          (state as any).roundCount = 50;
        },
        {},
        { autoRender: false },
      );

      expect(canUndo()).toBe(false);
      expect(state.roundCount).toBe(50);
    });

    it("records undo when history is enabled", () => {
      setHistoryEnabled(true);

      doAction(
        "NormalAction",
        () => {
          (state as any).roundCount = 100;
        },
        {},
        { autoRender: false },
      );

      expect(canUndo()).toBe(true);
      expect(state.roundCount).toBe(100);

      undo({ autoRender: false });
      expect(state.roundCount).not.toBe(100);
    });
  });

  describe("abortAction", () => {
    it("does not crash when before is null (history disabled)", () => {
      setHistoryEnabled(false);

      beginAction("Test");
      expect(() => abortAction()).not.toThrow();
      expect(isInAction()).toBe(false);
    });

    it("reverts state when before exists (history enabled)", () => {
      setHistoryEnabled(true);

      const originalRound = state.roundCount;
      beginAction("Test");
      (state as any).roundCount = 789;

      abortAction({ autoRender: false });

      expect(isInAction()).toBe(false);
      expect(state.roundCount).toBe(originalRound);
    });

    it("respects autoRender option", () => {
      setHistoryEnabled(true);

      beginAction("Test");
      (state as any).roundCount = 123;

      expect(() => abortAction({ autoRender: false })).not.toThrow();
      expect(isInAction()).toBe(false);
    });
  });

  describe("doAction rollback when history enabled", () => {
    it("reverts state when fn throws", () => {
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
          { autoRender: false },
        );
      }).toThrow("test");

      expect(state.roundCount).toBe(originalRound);
      expect(isInAction()).toBe(false);
    });
  });

  describe("re-entrancy safety", () => {
    it("allows nested doAction after abortAction clears inAction", () => {
      setHistoryEnabled(true);

      expect(() => {
        doAction(
          "FirstAction",
          () => {
            throw new Error("fail");
          },
          {},
          { autoRender: false },
        );
      }).toThrow("fail");

      expect(isInAction()).toBe(false);

      expect(() => {
        doAction(
          "SecondAction",
          () => {
            (state as any).roundCount = 777;
          },
          {},
          { autoRender: false },
        );
      }).not.toThrow();

      expect(state.roundCount).toBe(777);
    });
  });

  describe("notify consistency", () => {
    it("calls notify even when history disabled", () => {
      setHistoryEnabled(false);

      beginAction("Test");
      expect(() => abortAction({ autoRender: false })).not.toThrow();
      expect(isInAction()).toBe(false);
    });
  });
});
