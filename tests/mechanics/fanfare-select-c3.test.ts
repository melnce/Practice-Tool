/**
 * C3 — Fanfare-select defers enter-reactive triggers until target resolves.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { dispatch } from "../../src/engine.js";
import { getBoard, getHand } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

describe("C3 fanfare-select resume", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("Marion: enter-reactive crest does not fire until after target pick", () => {
    givenGameState({ seed: 10, activePlayer: "first" })
      .withFirstHand(["10142140"])
      .withFirstPP(10, 10)
      .build();

    const ally = createCard("10001110", "board", "first");
    ally.uid = "ally_on_board";
    ally.peak_defense = Number(ally.defense);
    state.players.first.board = [ally];

    state.players.first.crests = [
      {
        name: "Enter Buff Crest",
        owner: "first",
        insertionTs: 1,
        triggers: [
          {
            event: "ally_follower_enter",
            effects: [
              {
                op: "stat",
                action: "give",
                target: "entering_follower",
                attack: 9,
                defense: 0,
              },
            ],
          },
        ],
      },
    ] as any;

    const hand = getHand(state, "first");
    const outcome = playCardNoRender(hand, "first", 0);
    expect(outcome.kind).toBe("paused");

    const marion = getBoard(state, "first").find((c) =>
      c.name?.includes("Marion"),
    );
    expect(marion).toBeDefined();
    expect(Number(marion!.attack)).toBe(3);

    dispatch(state, {
      type: "CHOOSE_TARGET",
      target: { type: "card", uid: ally.uid },
    });

    expect(Number(marion!.attack)).toBe(12);
    expect(Number(ally.attack)).toBeGreaterThan(1);
  });

  it("Valse Enhance (6): Ambush applies after fanfare target resolves", () => {
    givenGameState({ seed: 11, activePlayer: "first" })
      .withFirstHand(["10123120"])
      .withFirstPP(6, 10)
      .build();

    const enemy = createCard("10001110", "board", "second");
    enemy.uid = "enemy_v";
    enemy.defense = 10;
    enemy.peak_defense = 10;
    state.players.second.board = [enemy];

    const hand = getHand(state, "first");
    whenPlayAndResolve(hand);

    const valse = getBoard(state, "first").find((c) =>
      c.name?.includes("Valse"),
    );
    expect(valse).toBeDefined();
    expect(valse!.hasAmbush).toBe(true);
    expect(Number(enemy.defense)).toBe(5);
  });
});

function whenPlayAndResolve(hand: ReturnType<typeof getHand>) {
  const outcome = playCardNoRender(hand, "first", 0);
  expect(outcome.kind).toBe("paused");
  const pending = state.pendingTargetEffect;
  expect(pending).toBeDefined();
  const uid = pending?.pool?.[0]?.uid ?? state.players.second.board[0]?.uid;
  dispatch(state, {
    type: "CHOOSE_TARGET",
    target: { type: "card", uid: uid! },
  });
}
