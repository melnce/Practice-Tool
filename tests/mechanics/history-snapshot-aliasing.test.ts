/**
 * Engine/UI-path history snapshot aliasing — undo/redo must not share references
 * with stored history entries (see fix-history-snapshot-aliasing).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { dispatch } from "../../src/engine.js";
import { state } from "../../src/core/gameState.js";
import { setHistoryEnabled } from "../../src/core/history.js";
import { hashGameState } from "../../src/core/stateHash.js";
import { givenGameState } from "../harness/builders.js";
import { injectAdapter } from "../../src/core/adapter.js";
import "../audit/setup.ts";

function postPlayHash(): string {
  return hashGameState(state);
}

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  await initCardDatabaseNode();
});

describe("engine dispatch history snapshot aliasing", () => {
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

  it("play A → undo → redo → play B → undo B → undo A → redo A restores post-A state", async () => {
    const FILLER = "10111310";
    givenGameState({ seed: 9001, activePlayer: "first", roundCount: 5 })
      .withFirstHand([
        {
          name: "Aliasing Test A",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
        {
          name: "Aliasing Test B",
          type: "Follower",
          cost: 1,
          attack: 2,
          defense: 2,
        },
      ])
      .withFirstDeck([FILLER, FILLER, FILLER, FILLER])
      .withFirstPP(5, 5)
      .build();

    const player = "first" as const;
    const uidA = state.players.first.hand[0]!.uid;
    const uidB = state.players.first.hand[1]!.uid;

    dispatch(state, { type: "PLAY_CARD", player, cardUid: uidA });
    const postA = postPlayHash();

    dispatch(state, { type: "UNDO" });
    dispatch(state, { type: "REDO" });

    dispatch(state, { type: "PLAY_CARD", player, cardUid: uidB });
    dispatch(state, { type: "UNDO" });
    dispatch(state, { type: "UNDO" });
    dispatch(state, { type: "REDO" });

    expect(postPlayHash()).toBe(postA);
  });

  it("__lastSelected is cleared on undo after nested_effects target resolution", () => {
    givenGameState({ seed: 9002, activePlayer: "first", roundCount: 5 })
      .withFirstBoard([
        {
          name: "Board Follower",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
      ])
      .withFirstDeck(["10111310", "10111310", "10111310"])
      .withFirstPP(5, 5)
      .build();

    const player = "first" as const;
    const source = state.players.first.board[0]!;
    const targetUid = source.uid;

    state.pendingTargetEffect = {
      eff: {
        op: "nested_effects",
        effects: [{ op: "draw", source: "deck", count: 1 }],
      },
      owner: player,
      sourceCard: source,
      sourceCardUid: source.uid,
      pool: [source],
      poolUids: [source.uid],
      targetUids: [],
      selectCount: 1,
    };

    dispatch(state, {
      type: "CHOOSE_TARGET",
      player,
      target: { type: "card", uid: targetUid },
    });
    expect((state as any).__lastSelected?.uid).toBe(targetUid);

    dispatch(state, { type: "UNDO" });
    expect((state as any).__lastSelected).toBeUndefined();
  });
});
