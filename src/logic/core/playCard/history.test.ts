import { describe, it, expect } from "vitest";
import { pushPlayedHistory } from "./history.js";
import { state } from "../../../core/gameState.js";
import { CardInstance } from "../../../core/types.js";

describe("Played History", () => {
  it("pushes a lightweight entry, not full card", () => {
    // Setup
    state.bluePlayedHistory = [];
    const card: CardInstance = {
      id: "123",
      uid: "uid-123",
      name: "Test Card",
      type: "Follower",
      cost: 2,
      base_image: "img.png",
      // Extra fields that should NOT be in history
      attack: 5,
      defense: 5,
      zone: "hand",
      spell: [], // Ensure it looks like a CardInstance
    };

    // Execute
    pushPlayedHistory("blue", card);

    // Assert
    expect(state.bluePlayedHistory).toHaveLength(1);
    const entry = state.bluePlayedHistory[0];

    expect(entry).toEqual(
      expect.objectContaining({
        id: "123",
        uid: "uid-123",
        name: "Test Card",
        type: "Follower",
        cost: 2,
        base_image: "img.png",
        ts: expect.any(Number),
      }),
    );

    // Verify shape strictness (no extra fields)
    expect((entry as any).attack).toBeUndefined();
    expect((entry as any).zone).toBeUndefined();
  });
});
