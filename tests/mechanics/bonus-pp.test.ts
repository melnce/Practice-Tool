/**
 * Bonus PP as engine action (BONUS_PP) — headless via dispatch, not DOM/button.
 * Rulebook L182–186 / src/core/bonusPp.ts
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "./setup.js";
import {
  givenGameState,
  resetUidCounter,
  whenEndTurn,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";
import { resetHistory } from "../../src/core/history.js";
import {
  getMaxPP,
  getPP,
  setMaxPP,
  setPP,
} from "../../src/core/playerHelpers.js";
import { getLegalSoakActions } from "../../src/bench/soakEnv.js";
import { parseScriptDocument } from "../../src/core/script/parse.js";
import { SCRIPT_SCHEMA_VERSION } from "../../src/core/script/types.js";
import { scriptStepToAction } from "../../src/logic/script/resolve.js";
import {
  buildRecordStepFromAction,
  clearScript,
  startRecording,
  stopRecording,
} from "../../src/logic/script/runtime.js";

vi.mock("../../src/ui/render.js", () => ({ logEvent: vi.fn() }));

function deckFill(prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `${prefix}${i}`,
    type: "Follower" as const,
    attack: 1,
    defense: 1,
  }));
}

function readySecondMain(round: number, pp?: number, maxPP?: number) {
  givenGameState({ seed: 1, activePlayer: "second", roundCount: round })
    .withSecondDeck(deckFill("S", 10))
    .withFirstDeck(deckFill("F", 10))
    .build();
  state.gameStarted = true;
  state.phase = "main";
  state.secondPlayerPPBoostUsedEarly = false;
  state.secondPlayerPPBoostUsedLate = false;
  state.secondPlayerPPBoostPending = false;
  const cap = maxPP ?? round;
  setMaxPP(state, "second", cap);
  setPP(state, "second", pp ?? cap);
  resetHistory();
}

function bonusPp() {
  return engineDispatch(state, { type: "BONUS_PP", player: "second" });
}

function boostSnapshot() {
  return {
    pp: getPP(state, "second"),
    maxPP: getMaxPP(state, "second"),
    early: state.secondPlayerPPBoostUsedEarly,
    late: state.secondPlayerPPBoostUsedLate,
    pending: state.secondPlayerPPBoostPending,
  };
}

describe("Bonus PP via engine BONUS_PP action", () => {
  beforeEach(() => {
    resetUidCounter();
    (globalThis as any).HEADLESS = true;
  });

  it("round 1: activate, spend orb on 2-cost, EOT commits early charge; next second turn is back to max", () => {
    readySecondMain(1, 1, 1);
    givenGameState({ seed: 1 })
      .withSecondHand([
        { name: "TwoDrop", type: "Follower", cost: 2, attack: 2, defense: 2 },
      ])
      .build();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "second";
    state.roundCount = 1;
    setMaxPP(state, "second", 1);
    setPP(state, "second", 1);
    resetHistory();

    bonusPp();
    expect(getPP(state, "second")).toBe(2);
    expect(getMaxPP(state, "second")).toBe(1);
    expect(state.secondPlayerPPBoostPending).toBe(true);

    const cardUid = state.players.second.hand[0]!.uid;
    engineDispatch(state, {
      type: "PLAY_CARD",
      player: "second",
      cardUid,
    });
    expect(getPP(state, "second")).toBe(0);

    whenEndTurn(); // second EOT → round 2, first's turn
    expect(state.secondPlayerPPBoostUsedEarly).toBe(true);
    expect(state.secondPlayerPPBoostPending).toBe(false);

    whenEndTurn(); // first EOT → second's turn again (still round 2)
    expect(getPP(state, "second")).toBe(2);
    expect(getMaxPP(state, "second")).toBe(2);
    expect(state.secondPlayerPPBoostPending).toBe(false);

    const before = boostSnapshot();
    bonusPp();
    expect(boostSnapshot()).toEqual(before);
  });

  it("early charge forfeited after round 5; late charge on round 6 then refused on round 7", () => {
    readySecondMain(5, 5, 5);
    whenEndTurn(); // first on round 5
    whenEndTurn(); // second EOT → round 6

    expect(state.roundCount).toBe(6);
    expect(state.activePlayer).toBe("second");
    expect(state.secondPlayerPPBoostUsedEarly).toBe(false);
    expect(state.secondPlayerPPBoostUsedLate).toBe(false);

    bonusPp();
    expect(getPP(state, "second")).toBe(7);
    expect(getMaxPP(state, "second")).toBe(6);
    expect(state.secondPlayerPPBoostPending).toBe(true);

    whenEndTurn(); // round 7, first; late committed
    expect(state.secondPlayerPPBoostUsedLate).toBe(true);
    expect(state.secondPlayerPPBoostUsedEarly).toBe(false);

    whenEndTurn(); // round 7, second

    expect(state.roundCount).toBe(7);
    expect(state.activePlayer).toBe("second");
    const before = boostSnapshot();
    bonusPp();
    expect(boostSnapshot()).toEqual(before);
  });

  it("cancel: toggle off while orb unspent refunds and leaves charge available", () => {
    readySecondMain(3, 3, 3);

    bonusPp();
    expect(getPP(state, "second")).toBe(4);
    expect(state.secondPlayerPPBoostPending).toBe(true);

    bonusPp();
    expect(getPP(state, "second")).toBe(3);
    expect(state.secondPlayerPPBoostPending).toBe(false);
    expect(state.secondPlayerPPBoostUsedEarly).toBe(false);
  });

  it("cancel after spending the bonus orb is a no-op; charge commits at EOT", () => {
    readySecondMain(1, 1, 1);
    givenGameState({ seed: 1 })
      .withSecondHand([
        { name: "TwoDrop", type: "Follower", cost: 2, attack: 2, defense: 2 },
      ])
      .build();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "second";
    state.roundCount = 1;
    setMaxPP(state, "second", 1);
    setPP(state, "second", 1);
    resetHistory();

    bonusPp();
    engineDispatch(state, {
      type: "PLAY_CARD",
      player: "second",
      cardUid: state.players.second.hand[0]!.uid,
    });
    expect(getPP(state, "second")).toBe(0);

    const before = boostSnapshot();
    bonusPp();
    expect(boostSnapshot()).toEqual(before);
    expect(state.secondPlayerPPBoostPending).toBe(true);

    whenEndTurn();
    expect(state.secondPlayerPPBoostUsedEarly).toBe(true);
    expect(state.secondPlayerPPBoostPending).toBe(false);
  });

  it("at 10 max PP pushes usable PP to 11/10", () => {
    readySecondMain(8, 10, 10);
    state.secondPlayerPPBoostUsedEarly = true;

    bonusPp();
    expect(getPP(state, "second")).toBe(11);
    expect(getMaxPP(state, "second")).toBe(10);
  });

  it("first player BONUS_PP is refused via engine (no throw); core dispatch throws", () => {
    readySecondMain(3, 3, 3);
    state.activePlayer = "first";
    setMaxPP(state, "first", 3);
    setPP(state, "first", 3);

    const before = {
      ...boostSnapshot(),
      firstPp: getPP(state, "first"),
    };
    engineDispatch(state, { type: "BONUS_PP", player: "first" });
    expect(getPP(state, "first")).toBe(before.firstPp);
    expect(boostSnapshot()).toEqual({
      pp: before.pp,
      maxPP: before.maxPP,
      early: before.early,
      late: before.late,
      pending: before.pending,
    });

    expect(() =>
      dispatchAction(state, { type: "BONUS_PP", player: "first" }),
    ).toThrow(/BONUS_PP is second-player only/);
  });

  it("soak legal actions omit BONUS_PP during mulligan; game over refuses engine dispatch", () => {
    readySecondMain(3, 3, 3);

    state.phase = "mulligan";
    state.mulliganStage = "second";
    expect(getLegalSoakActions().some((a) => a.type === "BONUS_PP")).toBe(
      false,
    );

    state.phase = "gameover";
    const goBefore = boostSnapshot();
    bonusPp();
    expect(boostSnapshot()).toEqual(goBefore);
  });

  it("undo restores PP and pending flag; redo re-applies", () => {
    readySecondMain(3, 3, 3);

    bonusPp();
    expect(getPP(state, "second")).toBe(4);
    expect(state.secondPlayerPPBoostPending).toBe(true);

    engineDispatch(state, { type: "UNDO" });
    expect(getPP(state, "second")).toBe(3);
    expect(state.secondPlayerPPBoostPending).toBe(false);

    engineDispatch(state, { type: "REDO" });
    expect(getPP(state, "second")).toBe(4);
    expect(state.secondPlayerPPBoostPending).toBe(true);
  });

  it("soak legal-action list includes BONUS_PP when second has 1 PP and a 2-cost card", () => {
    givenGameState({ seed: 424242, activePlayer: "second", roundCount: 1 })
      .withSecondHand([
        { name: "TwoDrop", type: "Follower", cost: 2, attack: 2, defense: 2 },
      ])
      .withSecondDeck(deckFill("S", 10))
      .withFirstDeck(deckFill("F", 10))
      .build();
    state.gameStarted = true;
    state.phase = "main";
    setMaxPP(state, "second", 1);
    setPP(state, "second", 1);
    state.secondPlayerPPBoostUsedEarly = false;
    state.secondPlayerPPBoostUsedLate = false;
    state.secondPlayerPPBoostPending = false;

    const legal = getLegalSoakActions();
    expect(legal.some((a) => a.type === "BONUS_PP")).toBe(true);
  });
});

describe("Bonus PP bot paths (script record/replay)", () => {
  beforeEach(() => {
    resetUidCounter();
    (globalThis as any).HEADLESS = true;
    readySecondMain(4, 4, 4);
  });

  it("script parse/resolve round-trips BONUS_PP", () => {
    const doc = parseScriptDocument({
      schemaVersion: SCRIPT_SCHEMA_VERSION,
      name: "bonus pp line",
      scriptedSide: "second",
      seed: 1,
      steps: [{ op: "BONUS_PP" }, { op: "END_TURN" }],
    });
    expect(doc.steps[0]).toEqual({ op: "BONUS_PP" });

    const action = scriptStepToAction(state, "second", doc.steps[0]!, 0);
    expect(action).toEqual({ type: "BONUS_PP", player: "second" });
  });

  it("script recorder captures BONUS_PP from a player action", () => {
    clearScript();
    startRecording({ name: "bonus", scriptedSide: "second", seed: 1 });
    const step = buildRecordStepFromAction({
      type: "BONUS_PP",
      player: "second",
    });
    expect(step).toEqual({ op: "BONUS_PP" });
    stopRecording();
  });
});
