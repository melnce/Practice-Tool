/**
 * Engine/UI-path fixes for __lastPlayedCard history and null board snapshots.
 * Does not require soak bench history helpers (#223).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { dispatch } from "../../src/engine.js";
import { state } from "../../src/core/gameState.js";
import { captureSnapshot, setHistoryEnabled } from "../../src/core/history.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import { givenGameState, createCard } from "../harness/builders.js";
import { injectAdapter } from "../../src/core/adapter.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import {
  cleanupDead,
  flushDeferredDeathBatch,
} from "../../src/logic/core/cleanup.js";
import { validateGameState } from "../../src/core/stateValidation.js";
import "../audit/setup.ts";

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  await initCardDatabaseNode();
});

describe("history __lastPlayedCard and null snapshot boards", () => {
  beforeEach(() => {
    setHistoryEnabled(true);
    injectAdapter({
      showTargetConfirmationButton: (vm: { onConfirm: () => void }) => {
        vm.onConfirm();
      },
      hideTargetConfirmation: () => {},
      triggerConfirmButtonClick: () => {},
    });
  });

  it("UI path: field_other_same_base_cost sees the played card after play → confirm → undo → redo", () => {
    const FILLER = "10111310";
    givenGameState({ seed: 515151, activePlayer: "first", roundCount: 5 })
      .withFirstBoard([
        {
          name: "World of Games",
          type: "Amulet",
          cost: 5,
          countdown: 5,
          hasCountdown: true,
          triggers: [
            {
              event: "ally_card_played",
              source: "board",
              condition: { not_self: true, field_other_same_base_cost: true },
              effects: [{ op: "countdown", action: "advance", amount: 1 }],
            },
          ],
        },
        {
          name: "Board Twin",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
        },
      ])
      .withFirstHand([
        {
          name: "Played Twin",
          type: "Follower",
          cost: 2,
          attack: 1,
          defense: 1,
          fanfare: [
            {
              op: "damage",
              amount: 1,
              target: "enemy:follower",
              select: 1,
            },
          ],
        },
      ])
      .withSecondBoard([
        {
          name: "Enemy Target",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 3,
        },
      ])
      .withFirstDeck([FILLER, FILLER, FILLER, FILLER])
      .withFirstPP(5, 5)
      .build();

    const player = "first" as const;
    const playedUid = state.players.first.hand[0]!.uid;
    const enemyUid = state.players.second.board[0]!.uid;

    dispatch(state, { type: "PLAY_CARD", player, cardUid: playedUid });
    expect((state as any).__lastPlayedCard?.uid).toBe(playedUid);

    dispatch(state, {
      type: "CHOOSE_TARGET",
      player,
      target: { type: "card", uid: enemyUid },
    });

    expect((state as any).__lastPlayedCard?.uid).toBe(playedUid);

    dispatch(state, { type: "UNDO" });
    expect((state as any).__lastPlayedCard).toBeUndefined();

    dispatch(state, { type: "REDO" });
    dispatch(state, {
      type: "CHOOSE_TARGET",
      player,
      target: { type: "card", uid: enemyUid },
    });

    expect((state as any).__lastPlayedCard?.uid).toBe(playedUid);
  });

  it("captureSnapshot() during paused deferred Last Words prompt has no null board slots", () => {
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
                    attack: 1,
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

    state.players.first.board = [buffTarget, null as any, null as any];

    const snap = captureSnapshot();
    expect(getBoard(snap, "first").every((c) => c != null)).toBe(true);
    expect(getBoard(snap, "second").every((c) => c != null)).toBe(true);
    const validation = validateGameState(snap);
    expect(validation.fails.some((f) => /Null entry/.test(f))).toBe(false);
  });
});
