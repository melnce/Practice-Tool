/**
 * Batch 7 — Spellboost stress (Runecraft). Extends batch 1 §757 with Rune patterns.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  resetUidCounter,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import "../../src/logic/core/effects/index.js";

/** Foresight — draw 1, no targets (Stormy Blast blocks play without an enemy follower). */
const FILLER = "10031310";

describe("Runecraft — Spellboost stress", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Runeblade Conductor — On Spellboost: +1/+1 in hand", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand(["10131110", FILLER])
      .withFirstPP(6, 6)
      .build();
    const atk0 = Number(
      thenHand("first").find((c) => c.id === "10131110")!.attack,
    );
    whenPlayCard("first", 1);
    const conductor = thenHand("first").find((c) => c.id === "10131110")!;
    expect(Number(conductor.attack)).toBe(atk0 + 1);
  });

  it("Emmylou — Spellboost in hand reduces printed cost by 1 per boost", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand(["10132120", FILLER])
      .withFirstPP(6, 6)
      .build();
    const cost0 = Number(
      thenHand("first").find((c) => c.id === "10132120")!.cost,
    );
    whenPlayCard("first", 1);
    let emmylou = thenHand("first").find((c) => c.id === "10132120")!;
    expect(Number(emmylou.cost)).toBe(cost0 - 1);
    spellboostHand("first", 1, emmylou);
    emmylou = thenHand("first").find((c) => c.id === "10132120")!;
    expect(Number(emmylou.cost)).toBe(cost0 - 2);
  });

  it("Ms. Miranda — Fanfare spellboosts entire hand", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand(["10132110", "10132120", FILLER])
      .withFirstPP(2, 6)
      .build();
    whenPlayCard("first", 0);
    const emmylou = thenHand("first").find((c) => c.id === "10132120");
    expect(
      emmylou?.keywordState?.spellboostCount ?? (emmylou as any)?.spellboostCount,
    ).toBeGreaterThanOrEqual(1);
  });
});
