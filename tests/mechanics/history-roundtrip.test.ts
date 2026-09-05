/**
 * History round-trip soak — undo/redo after every undoable action with full-state comparison.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import {
  runSoakGame,
  replaySoakTrace,
  canonicalJson,
  PRE_SNAPSHOT_HISTORY_DRIFT_FIELDS,
  applySoakActionWithOutcome,
} from "../../src/bench/soakEnv.js";
import { startNewGame, dispatch } from "../../src/engine.js";
import { state } from "../../src/core/gameState.js";
import {
  canUndo,
  captureSnapshot,
  setHistoryEnabled,
} from "../../src/core/history.js";
import { getBoard, getHand } from "../../src/core/playerHelpers.js";
import { givenGameState } from "../harness/builders.js";
import "../audit/setup.ts";

const PASSING_ENGINE_SEEDS = [20260908, 20260910] as const;
const CHAIN_UNDO_FAIL_SEED = 20260909;
const MASK = [...PRE_SNAPSHOT_HISTORY_DRIFT_FIELDS];
const REPRO_GAME = 17;
const REPRO_ACTION = 40;
const REPRO_PATH = "tests/fixtures/repro_seed20260908_game17_history.json";
const CORE = "core" as const;
const ENGINE = "engine" as const;

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  await initCardDatabaseNode();
});

describe("history round-trip soak", () => {
  for (const seed of PASSING_ENGINE_SEEDS) {
    it(`seed ${seed} — engine dispatch undo/redo (no mask)`, async () => {
      const result = await runSoakGame({
        seed,
        gameIndex: 0,
        historyCheck: true,
        dispatch: ENGINE,
        turnCap: 60,
        actionCap: 800,
      });
      expect(
        result.outcome,
        result.error ?? `seed ${seed} outcome ${result.outcome}`,
      ).toBe("completed");
    });
  }

  it("mulligan picks are not undoable — canUndo() false and UNDO is a no-op", async () => {
    setHistoryEnabled(true);
    await startNewGame({
      deckAId: "aggro_abysscraft",
      deckBId: "spell_runecraft",
      seed: 20260908,
    });
    expect(state.phase).toBe("mulligan");

    const hand = state.players.first.hand;
    const cardUid = hand.find((c) => (c as any).__mulliganSelectable)?.uid;
    expect(cardUid).toBeTruthy();

    dispatch(state, {
      type: "TOGGLE_MULLIGAN",
      player: "first",
      cardUid: cardUid!,
    });
    expect(canUndo()).toBe(false);
    const afterToggle = canonicalJson(captureSnapshot());
    dispatch(state, { type: "UNDO" });
    expect(canonicalJson(captureSnapshot())).toBe(afterToggle);

    dispatch(state, { type: "CONFIRM_MULLIGAN", player: "first" });
    dispatch(state, { type: "CONFIRM_MULLIGAN", player: "second" });
    expect(canUndo()).toBe(false);
    const afterConfirm = canonicalJson(captureSnapshot());
    dispatch(state, { type: "UNDO" });
    expect(canonicalJson(captureSnapshot())).toBe(afterConfirm);
  });

  it("engine dispatch: PLAY_CARD with fanfare draw undoes cleanly", async () => {
    setHistoryEnabled(true);
    const FILLER = "10111310";
    givenGameState({ seed: 424242, activePlayer: "first", roundCount: 5 })
      .withFirstHand([
        {
          name: "Fanfare Draw Test",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
          fanfare: [{ op: "draw", source: "deck", count: 1 }],
        },
      ])
      .withFirstDeck([FILLER, FILLER, FILLER, FILLER, FILLER])
      .withFirstPP(5, 5)
      .build();

    const player = "first" as const;
    const cardUid = state.players.first.hand[0]!.uid;
    const handBefore = canonicalJson(getHand(state, player));
    const boardBefore = canonicalJson(getBoard(state, player));
    const tickBefore = state.gameTick;
    const deferBefore = (state as any).deferDeathTriggers ?? false;

    dispatch(state, { type: "PLAY_CARD", player, cardUid });
    dispatch(state, { type: "UNDO" });

    expect((state as any).deferDeathTriggers ?? false).toBe(deferBefore);
    expect(state.gameTick).toBe(tickBefore);
    expect(canonicalJson(getHand(state, player))).toBe(handBefore);
    expect(canonicalJson(getBoard(state, player))).toBe(boardBefore);
  });

  it.fails(
    `seed ${CHAIN_UNDO_FAIL_SEED} — engine chain-undo __lastPlayedCard drift (no mask)`,
    async () => {
      const result = await runSoakGame({
        seed: CHAIN_UNDO_FAIL_SEED,
        gameIndex: 0,
        historyCheck: true,
        dispatch: ENGINE,
        turnCap: 60,
        actionCap: 800,
      });
      expect(
        result.outcome,
        result.error ??
          `seed ${CHAIN_UNDO_FAIL_SEED} outcome ${result.outcome}`,
      ).toBe("completed");
    },
  );

  it.fails(
    "engine dispatch: UNDO leaves null board slot (seed 20260909 game 14)",
    async () => {
      const result = await runSoakGame({
        seed: 20260909,
        gameIndex: 14,
        historyCheck: true,
        dispatch: ENGINE,
      });
      expect(
        result.outcome,
        result.error ?? `game 14 outcome ${result.outcome}`,
      ).toBe("completed");
    },
  );

  // Core dispatch (dispatch.ts) uses playCardNoRender — no beginAction before mutations.
  it("deferDeathTriggers restored after PLAY_CARD undo (core dispatch path, seed 20260908 game 17 action 40)", async () => {
    const repro = JSON.parse(fs.readFileSync(REPRO_PATH, "utf8"));
    setHistoryEnabled(true);
    await replaySoakTrace(
      20260908,
      REPRO_GAME,
      repro.trace.slice(0, REPRO_ACTION - 1),
      { dispatch: CORE },
    );
    const before = (state as any).deferDeathTriggers ?? false;
    applySoakActionWithOutcome(repro.trace[REPRO_ACTION - 1], CORE);
    dispatch(state, { type: "UNDO" });
    expect((state as any).deferDeathTriggers ?? false).toBe(before);
  });

  it("gameTick restored after PLAY_CARD undo (core dispatch path, seed 20260908 game 17 action 40)", async () => {
    const repro = JSON.parse(fs.readFileSync(REPRO_PATH, "utf8"));
    setHistoryEnabled(true);
    await replaySoakTrace(
      20260908,
      REPRO_GAME,
      repro.trace.slice(0, REPRO_ACTION - 1),
      { dispatch: CORE },
    );
    const tickBefore = state.gameTick;
    applySoakActionWithOutcome(repro.trace[REPRO_ACTION - 1], CORE);
    dispatch(state, { type: "UNDO" });
    expect(state.gameTick).toBe(tickBefore);
  });

  it("PLAY_CARD undo restores full board/hand state with drift mask (core dispatch path, seed 20260908 game 17 action 40)", async () => {
    const repro = JSON.parse(fs.readFileSync(REPRO_PATH, "utf8"));
    setHistoryEnabled(true);
    await replaySoakTrace(
      20260908,
      REPRO_GAME,
      repro.trace.slice(0, REPRO_ACTION - 1),
      { dispatch: CORE },
    );
    const before = canonicalJson(captureSnapshot());
    applySoakActionWithOutcome(repro.trace[REPRO_ACTION - 1], CORE);
    dispatch(state, { type: "UNDO" });
    const afterUndo = canonicalJson(captureSnapshot());
    const mask = (json: string) => {
      const obj = JSON.parse(json) as Record<string, unknown>;
      for (const key of MASK) delete obj[key];
      return canonicalJson(obj);
    };
    expect(mask(afterUndo)).toBe(mask(before));
  });

  it("END_TURN undo×1 round-trip with drift mask (core dispatch path, seed 20260908 game 0)", async () => {
    const result = await runSoakGame({
      seed: 20260908,
      gameIndex: 0,
      historyCheck: true,
      historyIgnoreFields: MASK,
      dispatch: CORE,
    });
    expect(result.outcome).toBe("completed");
  });
});
