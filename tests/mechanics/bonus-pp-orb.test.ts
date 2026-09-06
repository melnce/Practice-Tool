/**
 * Bonus PP orb accounting — official Q&A (Baby Carbuncle 10112130, Dimension Climb 10134310).
 * Regular orbs are spent first; recovery refills regular up to max while bonus orb stacks on top.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "./setup.js";
import {
  givenGameState,
  resetUidCounter,
  whenPlayCard,
  whenEndTurn,
  createCard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { resetHistory } from "../../src/core/history.js";
import { toggleSecondPlayerBonusPp } from "../../src/core/bonusPp.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import {
  getPP,
  getMaxPP,
  setMaxPP,
  setPP,
  setSuperEvoCharges,
} from "../../src/core/playerHelpers.js";

vi.mock("../../src/ui/render.js", () => ({ logEvent: vi.fn() }));

function deckFill(prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `${prefix}${i}`,
    type: "Follower" as const,
    attack: 1,
    defense: 1,
  }));
}

function readySecondRound9() {
  givenGameState({ seed: 42, activePlayer: "second", roundCount: 9 })
    .withSecondDeck(deckFill("S", 10))
    .withFirstDeck(deckFill("F", 10))
    .build();
  state.gameStarted = true;
  state.phase = "main";
  state.secondPlayerPPBoostUsedEarly = false;
  state.secondPlayerPPBoostUsedLate = false;
  state.secondPlayerPPBoostPending = false;
  setMaxPP(state, "second", 9);
  setPP(state, "second", 9);
  resetHistory();
}

describe("Bonus PP orb — spend order and recovery cap", () => {
  beforeEach(() => {
    resetUidCounter();
    (globalThis as any).HEADLESS = true;
  });

  it("Baby Carbuncle: bonus + 3-cost play → 7 PP, super-evolve recover 3 → 10", () => {
    readySecondRound9();
    const carb = createCard("10112130", "board", "second");
    state.players.second.board = [carb];
    state.players.second.hand = [createCard("10102310", "hand", "second")];

    expect(toggleSecondPlayerBonusPp()).toBe(true);
    expect(getPP(state, "second")).toBe(10);

    whenPlayCard("second", 0);
    expect(getPP(state, "second")).toBe(7);

    setSuperEvoCharges(state, "second", 1);
    handleEvolveSelf(carb, "second", { mode: "super", spendPoint: true });
    expect(getPP(state, "second")).toBe(10);
    expect(getMaxPP(state, "second")).toBe(9);
  });

  it("Dimension Climb: bonus + Kuon Enhance (10) → 0, 0-cost Climb → 9 PP", () => {
    readySecondRound9();
    const climb = createCard("10134310", "hand", "second");
    climb.effectiveCost = 0;
    state.players.second.hand = [
      createCard("10134110", "hand", "second"),
      climb,
      ...deckFill("H", 3).map((c) => createCard(c, "hand", "second")),
    ];
    state.players.second.deck = deckFill("S", 8).map((c, i) =>
      createCard(c, "deck", "second"),
    );

    expect(toggleSecondPlayerBonusPp()).toBe(true);
    expect(getPP(state, "second")).toBe(10);

    whenPlayCard("second", 0);
    expect(getPP(state, "second")).toBe(0);

    const climbIdx = state.players.second.hand.findIndex(
      (c) => c.id === "10134310",
    );
    whenPlayCard("second", climbIdx);
    expect(getPP(state, "second")).toBe(9);
  });

  it("recover 3 at 9 max with no bonus and 7 PP → caps at 9", () => {
    readySecondRound9();
    setPP(state, "second", 7);
    expect(state.players.second.bonusPpOrb).toBe(0);

    runEffects(
      [{ op: "pp", action: "recover", player: "self", amount: 3 }],
      "second",
      null,
    );
    expect(getPP(state, "second")).toBe(9);
  });

  it("paying 9 of 10 leaves the bonus orb; recover 3 → 4 total", () => {
    readySecondRound9();
    expect(toggleSecondPlayerBonusPp()).toBe(true);
    expect(getPP(state, "second")).toBe(10);

    runEffects(
      [{ op: "pp", action: "spend", player: "self", amount: 9 }],
      "second",
      null,
    );
    expect(getPP(state, "second")).toBe(1);
    expect(state.players.second.bonusPpOrb).toBe(1);

    runEffects(
      [{ op: "pp", action: "recover", player: "self", amount: 3 }],
      "second",
      null,
    );
    expect(getPP(state, "second")).toBe(4);
  });

  it("unused bonus orb is lost at end of turn; next second turn is normal max PP", () => {
    givenGameState({ seed: 7, activePlayer: "second", roundCount: 3 })
      .withSecondDeck(deckFill("S", 10))
      .withFirstDeck(deckFill("F", 10))
      .build();
    state.gameStarted = true;
    state.phase = "main";
    state.secondPlayerPPBoostUsedEarly = false;
    state.secondPlayerPPBoostPending = false;
    setMaxPP(state, "second", 3);
    setPP(state, "second", 3);
    resetHistory();

    expect(toggleSecondPlayerBonusPp()).toBe(true);
    expect(getPP(state, "second")).toBe(4);

    whenEndTurn();
    whenEndTurn();

    expect(state.activePlayer).toBe("second");
    expect(getPP(state, "second")).toBe(4);
    expect(getMaxPP(state, "second")).toBe(4);
    expect(state.players.second.bonusPpOrb).toBe(0);
    expect(state.secondPlayerPPBoostPending).toBe(false);
    expect(state.secondPlayerPPBoostUsedEarly).toBe(true);
  });
});
