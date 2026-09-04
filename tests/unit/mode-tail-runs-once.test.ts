/**
 * Regression: effects after a mode op must run once on non-modal paths.
 * Queue [mode, tail] — tail must not execute twice (was +5 instead of +3 at 10 HP).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenRunEffects,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { getHP } from "../../src/core/playerHelpers.js";
import { state } from "../../src/core/gameState.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import type { Effect } from "../../src/core/types/index.js";

const MODE_RESTORE_1 = {
  op: "mode" as const,
  options: [
    {
      label: "Restore 1",
      effects: [{ op: "restore" as const, target: "ally:leader", amount: 1 }],
    },
  ],
};

const TAIL_RESTORE_2 = {
  op: "restore" as const,
  target: "ally:leader",
  amount: 2,
};

function modeWithPick(pick: string, extra: Record<string, unknown> = {}) {
  return {
    ...MODE_RESTORE_1,
    pick,
    ...extra,
  };
}

describe("mode tail runs once (non-modal paths)", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 42 }).withFirstHP(10).build();
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  it('pick: "random" — option + tail restore exactly once', () => {
    const hpBefore = getHP(state, "first");
    whenRunEffects(
      [modeWithPick("random"), TAIL_RESTORE_2] as Effect[],
      "first",
    );
    expect(getHP(state, "first")).toBe(hpBefore + 1 + 2);
  });

  it('pick: "random_unused" — option + tail restore exactly once', () => {
    const host = createCard(
      { name: "Mode Host", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    const hpBefore = getHP(state, "first");
    whenRunEffects(
      [modeWithPick("random_unused"), TAIL_RESTORE_2] as Effect[],
      "first",
      host,
    );
    expect(getHP(state, "first")).toBe(hpBefore + 1 + 2);
  });

  it("activate_all_if_ally_board_gte: 0 — option + tail restore exactly once", () => {
    const hpBefore = getHP(state, "first");
    whenRunEffects(
      [
        {
          ...MODE_RESTORE_1,
          activate_all_if_ally_board_gte: 0,
        },
        TAIL_RESTORE_2,
      ] as Effect[],
      "first",
    );
    expect(getHP(state, "first")).toBe(hpBefore + 1 + 2);
  });

  it("scripted provider — option + tail restore exactly once", () => {
    setScriptedModePickProvider(() => [0]);
    const hpBefore = getHP(state, "first");
    whenRunEffects([MODE_RESTORE_1, TAIL_RESTORE_2] as Effect[], "first");
    expect(getHP(state, "first")).toBe(hpBefore + 1 + 2);
  });

  it("scripted provider — tail damage on follower runs once", () => {
    const follower = createCard(
      { name: "Target", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "first",
    );
    setScriptedModePickProvider(() => [0]);
    whenRunEffects(
      [
        MODE_RESTORE_1,
        { op: "damage", target: "self:follower", amount: 2 },
      ] as Effect[],
      "first",
      follower,
    );
    expect(Number(follower.defense)).toBe(3);
  });
});
