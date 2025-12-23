import { describe, it, expect } from "vitest";
import { createInitialState } from "../../core/gameState.js";
import { dispatchAction } from "./dispatch.js";
import { GameState, PlayCardAction } from "../../core/types.js";

describe("UID Dispatch Hardening", () => {
  it("throws specific error when UID is not found in hand", () => {
    const state: GameState = createInitialState();

    // Construct a malicious/invalid action targeting a non-existent UID
    const invalidAction: PlayCardAction = {
      type: "PLAY_CARD",
      player: "blue",
      cardUid: "uid_NON_EXISTENT_99999",
    };

    // Expect dispatch to throw explicitly
    expect(() => {
      dispatchAction(state, invalidAction);
    }).toThrow(
      "[DISPATCH_UID_FAIL] Card not found in hand for UID: uid_NON_EXISTENT_99999",
    );
  });

  it("throws when using wrong player's UID (wrong zone/owner)", () => {
    const state: GameState = createInitialState();

    // Mock a card in RED hand
    state.redHand = [
      {
        name: "Test Goblin",
        cost: 1,
        type: "Follower",
        uid: "uid_RED_ONE",
        traits: [],
      } as any,
    ];

    // Try to play it as BLUE player
    const invalidAction: PlayCardAction = {
      type: "PLAY_CARD",
      player: "blue",
      cardUid: "uid_RED_ONE",
    };

    expect(() => {
      dispatchAction(state, invalidAction);
    }).toThrow(
      "[DISPATCH_UID_FAIL] Card not found in hand for UID: uid_RED_ONE",
    );
  });
});
