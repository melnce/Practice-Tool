/**
 * C4 — Interactive Last Words suspend deferred death flush until resolved.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.js";
import { givenGameState, createCard, resetUidCounter } from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getBoard, getHand } from "../../src/core/playerHelpers.js";
import { cleanupDead, flushDeferredDeathBatch } from "../../src/logic/core/cleanup.js";
import "../../src/logic/core/effects/index.js";

describe("Deferred LW interactive pause", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("LW with select op suspends flush; resumes after CHOOSE_TARGET", () => {
    givenGameState({ seed: 20, activePlayer: "first" }).build();

    const victim = createCard(
      {
        name: "LW Select",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
        keywords: [
          {
            name: "LastWords",
            effects: [
              {
                op: "select",
                target: "ally:follower",
                select: 1,
                effects: [
                  {
                    op: "stat",
                    action: "give",
                    target: "selected:follower",
                    attack: 5,
                    defense: 0,
                  },
                ],
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(victim);
    victim.uid = "lw_victim";
    victim.peak_defense = 2;

    const buffTarget = createCard("10001110", "board", "first");
    buffTarget.uid = "buff_target";
    buffTarget.peak_defense = Number(buffTarget.defense);

    state.players.first.board = [buffTarget, victim];

    (state as any).deferDeathTriggers = true;
    dealDamage(victim, 2);
    cleanupDead();
    (state as any).deferDeathTriggers = false;

    flushDeferredDeathBatch();

    expect(state.pendingTargetEffect).toBeDefined();
    expect(getBoard(state, "first").some((c) => c?.uid === victim.uid)).toBe(false);
    expect(victim.zone).not.toBe("graveyard");
    expect(Number(buffTarget.attack)).toBe(Number(buffTarget.base_attack ?? buffTarget.attack));

    resolvePendingTarget(buffTarget.uid);

    expect(state.pendingTargetEffect).toBeUndefined();
    expect(Number(buffTarget.attack)).toBeGreaterThan(2);
    expect(getBoard(state, "first").some((c) => c.uid === victim.uid)).toBe(false);
  });
});
