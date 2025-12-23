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
    state.blueHand = [];
    state.blueBoard = [];
    state.redBoard = [];
    state.bluePP = 10;
    state.blueMaxPP = 10;
    state.isBlueTurn = true;
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

    const supplicant = makeCardFromDB(supplicantDef, "blue");
    const ally = makeCardFromDB(dummyDef, "blue");
    const enemy = makeCardFromDB(dummyDef, "red");

    // Setup board
    state.blueHand = [supplicant];
    state.blueBoard = [ally];
    state.redBoard = [enemy];

    // Dispatch Play
    dispatchAction(state, {
      type: "PLAY_CARD",
      player: "blue",
      cardUid: supplicant.uid,
    });

    // Verify Supplicant is on board
    const playedSupplicant = state.blueBoard.find(
      (c) => c.uid === supplicant.uid,
    );
    expect(playedSupplicant).toBeDefined();

    // Verify Damage
    // Ally 5 -> 2
    // Find by logic: it's the one that isn't supplicant
    const boardAlly = state.blueBoard.find((c) => c.uid === ally.uid);
    expect(boardAlly!.defense).toBe(2);

    // Enemy 5 -> 2
    const boardEnemy = state.redBoard.find((c) => c.uid === enemy.uid);
    expect(boardEnemy!.defense).toBe(2);

    // Supplicant should be undamaged (base defense 2)
    expect(playedSupplicant!.defense).toBe(2);
  });
});
