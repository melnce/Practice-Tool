/**
 * Interactive target resolver — exercises pause/resume WITHOUT auto resolvePendingTarget().
 * Mirrors UI path: playCard → pending state → engine.dispatch(CHOOSE_TARGET).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { playCard } from "../../src/logic/core/playCard/index.js";
import { dispatch } from "../../src/engine.js";
import { injectAdapter } from "../../src/core/adapter.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { getHand } from "../../src/core/playerHelpers.js";

describe("Interactive target resolver (UI handshake)", () => {
  let renderCalls = 0;

  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = false;
    renderCalls = 0;
    injectAdapter({
      render: () => {
        renderCalls++;
      },
      showChoiceModal: () => {},
      showTargetConfirmationButton: () => {},
      hideTargetConfirmation: () => {},
      triggerConfirmButtonClick: () => {},
    });
  });

  it("playCard pauses; CHOOSE_TARGET resumes damage and clears pending", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10041310"])
      .withFirstPP(4, 6)
      .build();

    const enemy = createCard("10001110", "board", "second");
    applyKeywordsFromList(enemy);
    enemy.uid = "enemy_board";
    enemy.peak_defense = Number(enemy.defense);
    state.players.second.board = [enemy];

    const hand = getHand(state, "first");
    const outcome = playCard(hand, "first", 0);

    expect(outcome.kind).toBe("paused");
    expect(state.pendingTargetEffect).toBeDefined();
    expect(enemy.__uiSelectable).toBe(true);
    expect(renderCalls).toBeGreaterThan(0);

    const beforeDef = Number(enemy.defense);
    dispatch(state, { type: "CHOOSE_TARGET", target: { type: "card", uid: enemy.uid } });

    expect(state.pendingTargetEffect).toBeUndefined();
    expect(enemy.__uiSelectable).toBeUndefined();
    expect(Number(enemy.defense)).toBe(beforeDef - 2);
    expect(renderCalls).toBeGreaterThan(1);
  });

  it("select op: CHOOSE_TARGET completes nested stat buff", async () => {
    givenGameState({ seed: 2, activePlayer: "first" })
      .withFirstPP(10, 10)
      .build();

    const golem = createCard(
      { name: "Golem", type: "Follower", cost: 2, attack: 2, defense: 2, tribes: ["Golem"] },
      "board",
      "first",
    );
    golem.uid = "golem_1";
    golem.peak_defense = 2;
    state.players.first.board = [golem];

    // Simulate super-evolve select effect (Remi Rami pattern)
    state.pendingTargetEffect = undefined;
    const { runEffects } = await import("../../src/logic/core/effects/index.js");
    runEffects(
      [
        {
          op: "select",
          target: "ally:follower",
          select: 1,
          condition: { tribe: "Golem" },
          effects: [
            { op: "stat", action: "give", target: "selected:follower", attack: 3, defense: 3 },
          ],
        },
      ],
      "first",
      null,
    );

    expect(state.pendingTargetEffect).toBeDefined();
    expect(golem.__uiSelectable).toBe(true);

    dispatch(state, { type: "CHOOSE_TARGET", target: { type: "card", uid: golem.uid } });

    expect(state.pendingTargetEffect).toBeUndefined();
    expect(Number(golem.attack)).toBe(5);
    expect(Number(golem.defense)).toBe(5);
  });
});
