import { describe, it, expect } from "vitest";
import {
  validateGameState,
  assertValidGameState,
} from "../../src/core/stateValidation";
import { state, resetGameState } from "../../src/core/gameState";
import { GameState } from "../../src/core/types";

describe("GameState Validation", () => {
  it("validates the initial clean state", () => {
    resetGameState(1);
    const result = validateGameState(state);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(() => assertValidGameState(state)).not.toThrow();
  });

  it("detects null entries in card arrays", () => {
    resetGameState(1);
    // @ts-ignore
    state.players.first.hand.push(null);

    const result = validateGameState(state);
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toContain("H3: Null entry in players.first.hand");

    expect(() => assertValidGameState(state)).toThrow("Invalid GameState");
  });

  it("detects duplicate UIDs in zones (H1 invariant)", () => {
    resetGameState(1);
    // Use the same UID for both cards - this should trigger H1 violation
    const card1 = {
      uid: "duplicate-uid",
      name: "Card1",
      instanceId: 100,
    } as any;
    const card2 = {
      uid: "duplicate-uid",
      name: "Card2",
      instanceId: 101,
    } as any;

    state.players.first.hand.push(card1);
    state.players.second.board.push(card2);

    const result = validateGameState(state);
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toContain("H1: Duplicate UID");
  });

  it("detects invalid numeric fields", () => {
    resetGameState(1);
    state.players.first.pp = -1;
    state.players.second.shadows = NaN;

    const result = validateGameState(state);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("first.pp"))).toBe(true);
    expect(result.issues.some((i) => i.includes("second.shadows"))).toBe(true);
  });

  it("allows negative HP (valid for dead players)", () => {
    resetGameState(1);
    state.players.first.hp = -5;
    const result = validateGameState(state);
    // Should be valid as long as it's a number
    expect(result.valid).toBe(true);
  });

  it("reports missing critical arrays", () => {
    // Create a broken object manually
    const brokenState = JSON.parse(JSON.stringify(state));
    delete brokenState.players.first.deck;

    const result = validateGameState(brokenState);
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toContain(
      "H3: Missing or invalid array: players.first.deck",
    );
  });
});
