// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../../../src/core/gameState";
import { dispatchAction } from "../../../src/logic/core/dispatch";
import { makeCardFromDB } from "../../../src/logic/effects/ops/summon_ops/core";
import masterCardDefinitions from "../../../cards/sets/10003_heirs-of-the-omen.json";
import { CardInstance } from "../../../src/core/types";

describe("Supplicant of Truth (10332110) Integration", () => {
  beforeEach(() => {
    // Minimal state reset
    state.players.first.hand = [];
    state.players.first.board = [];
    state.players.second.board = [];
    state.players.first.pp = 10;
    state.players.first.maxPP = 10;
    state.isFirstPlayerTurn = true;
    // Ensure RNG exists (setup usually handles it, but just in case)
    if (!state.rng)
      state.rng = {
        makeUid: () => Math.random().toString(36).substr(2, 9),
      } as any;
  });

  it("should deal 3 damage to all other followers", () => {
    const supplicantDef: any = masterCardDefinitions.find(
      (c: any) => c.id === "10332110",
    );
    // Create dummy definition based closer to a real follower
    const dummyDef: any = {
      ...supplicantDef,
      id: "999999",
      name: "Dummy",
      cost: 1,
      attack: 1,
      defense: 5,
    };

    const supplicant = makeCardFromDB(supplicantDef, "first");
    const ally = makeCardFromDB(dummyDef, "first");
    const enemy = makeCardFromDB(dummyDef, "second");

    // Setup board
    state.players.first.hand = [supplicant];
    state.players.first.board = [ally];
    state.players.second.board = [enemy];

    // Dispatch Play
    dispatchAction(state, {
      type: "PLAY_CARD",
      player: "first",
      cardUid: supplicant.uid,
    });

    // Verify Supplicant is on board
    const playedSupplicant = state.players.first.board.find(
      (c) => c.uid === supplicant.uid,
    );
    expect(playedSupplicant).toBeDefined();

    // Verify Damage
    // Ally 5 -> 2
    // Find by logic: it's the one that isn't supplicant
    const boardAlly = state.players.first.board.find((c) => c.uid === ally.uid);
    expect(boardAlly!.defense).toBe(2);

    // Enemy 5 -> 2
    const boardEnemy = state.players.second.board.find((c) => c.uid === enemy.uid);
    expect(boardEnemy!.defense).toBe(2);

    // Supplicant should be undamaged (base defense 2)
    expect(playedSupplicant!.defense).toBe(2);
  });
});






