/**
 * Gear of Ambition / Gear of Remembrance — Amulet type (not Spell).
 * Proves cant_play survives the type correction at max PP with an empty board.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  resetUidCounter,
  thenHand,
  thenBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getPP } from "../../src/core/playerHelpers.js";
import { getCardById } from "../../src/data/cardDatabase.js";

const GEAR_AMBITION = "90071210";
const GEAR_REMEMBRANCE = "90071220";
const FILLER = "10111310";

function setupGearInHand(gearId: string) {
  givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: 10,
  })
    .withFirstPP(10, 10)
    .withFirstHand([gearId])
    .withFirstDeck(Array.from({ length: 25 }, () => FILLER))
    .withSecondDeck(Array.from({ length: 25 }, () => FILLER))
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

describe("Gear tokens — Amulet type, still unplayable", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("Gear of Ambition (90071210): whenPlayCard blocked at 10 PP, empty board", () => {
    setupGearInHand(GEAR_AMBITION);
    const card = getCardById(GEAR_AMBITION)!;
    expect(card.type).toBe("Amulet");
    expect(card.cant_play).toBe(true);

    const gear = thenHand("first")[0]!;
    const pp0 = getPP(state, "first");
    const board0 = thenBoard("first").length;

    const outcome = whenPlayCard("first", 0);
    expect(outcome.kind).toBe("blocked");
    expect(outcome.reason).toContain("cannot be played");

    expect(getPP(state, "first")).toBe(pp0);
    expect(thenHand("first").some((c) => c.uid === gear.uid)).toBe(true);
    expect(thenBoard("first").length).toBe(board0);
  });

  it("Gear of Remembrance (90071220): whenPlayCard blocked at 10 PP, empty board", () => {
    setupGearInHand(GEAR_REMEMBRANCE);
    const card = getCardById(GEAR_REMEMBRANCE)!;
    expect(card.type).toBe("Amulet");
    expect(card.cant_play).toBe(true);

    const gear = thenHand("first")[0]!;
    const pp0 = getPP(state, "first");
    const board0 = thenBoard("first").length;

    const outcome = whenPlayCard("first", 0);
    expect(outcome.kind).toBe("blocked");
    expect(outcome.reason).toContain("cannot be played");

    expect(getPP(state, "first")).toBe(pp0);
    expect(thenHand("first").some((c) => c.uid === gear.uid)).toBe(true);
    expect(thenBoard("first").length).toBe(board0);
  });
});
