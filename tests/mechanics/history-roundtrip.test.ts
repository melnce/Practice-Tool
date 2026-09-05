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

const FIXED_SEEDS = [20260908, 20260909, 20260910] as const;
const MASK = [...PRE_SNAPSHOT_HISTORY_DRIFT_FIELDS];
const REPRO_GAME = 17;
const REPRO_ACTION = 40;
const REPRO_PATH = "tests/fixtures/repro_seed20260908_game17_history.json";

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  await initCardDatabaseNode();
});

async function replayPlayCardUndoAtAction40(): Promise<void> {
  const repro = JSON.parse(fs.readFileSync(REPRO_PATH, "utf8"));
  setHistoryEnabled(true);
  await replaySoakTrace(
    20260908,
    REPRO_GAME,
    repro.trace.slice(0, REPRO_ACTION - 1),
  );
  applySoakActionWithOutcome(repro.trace[REPRO_ACTION - 1]);
  dispatch(state, { type: "UNDO" });
}

describe("history round-trip soak", () => {
  for (const seed of FIXED_SEEDS) {
    it.fails(
      `seed ${seed} — main-phase undo/redo with drift mask`,
      async () => {
        const result = await runSoakGame({
          seed,
          gameIndex: 0,
          historyCheck: true,
          historyIgnoreFields: MASK,
          turnCap: 60,
          actionCap: 800,
        });
        expect(
          result.outcome,
          result.error ?? `seed ${seed} outcome ${result.outcome}`,
        ).toBe("completed");
      },
    );
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

  // dispatch PLAY_CARD uses playCardNoRender (no beginAction); nested appendStep/doAction
  // snapshots state after playCardCore mutations (effects/index.ts deferDeathTriggers, gameTick).
  it.fails(
    "deferDeathTriggers restored after PLAY_CARD undo (seed 20260908 game 17 action 40)",
    async () => {
      const repro = JSON.parse(fs.readFileSync(REPRO_PATH, "utf8"));
      setHistoryEnabled(true);
      await replaySoakTrace(
        20260908,
        REPRO_GAME,
        repro.trace.slice(0, REPRO_ACTION - 1),
      );
      const before = (state as any).deferDeathTriggers;
      applySoakActionWithOutcome(repro.trace[REPRO_ACTION - 1]);
      dispatch(state, { type: "UNDO" });
      expect((state as any).deferDeathTriggers).toBe(before);
    },
  );

  it.fails(
    "gameTick restored after PLAY_CARD undo (seed 20260908 game 17 action 40)",
    async () => {
      const repro = JSON.parse(fs.readFileSync(REPRO_PATH, "utf8"));
      setHistoryEnabled(true);
      await replaySoakTrace(
        20260908,
        REPRO_GAME,
        repro.trace.slice(0, REPRO_ACTION - 1),
      );
      const tickBefore = state.gameTick;
      applySoakActionWithOutcome(repro.trace[REPRO_ACTION - 1]);
      dispatch(state, { type: "UNDO" });
      expect(state.gameTick).toBe(tickBefore);
    },
  );

  it.fails(
    "PLAY_CARD undo restores full board/hand state with drift mask (seed 20260908 game 17 action 40)",
    async () => {
      const repro = JSON.parse(fs.readFileSync(REPRO_PATH, "utf8"));
      setHistoryEnabled(true);
      await replaySoakTrace(
        20260908,
        REPRO_GAME,
        repro.trace.slice(0, REPRO_ACTION - 1),
      );
      const before = canonicalJson(captureSnapshot());
      applySoakActionWithOutcome(repro.trace[REPRO_ACTION - 1]);
      dispatch(state, { type: "UNDO" });
      const afterUndo = canonicalJson(captureSnapshot());
      const mask = (json: string) => {
        const obj = JSON.parse(json) as Record<string, unknown>;
        for (const key of MASK) delete obj[key];
        return canonicalJson(obj);
      };
      expect(mask(afterUndo)).toBe(mask(before));
    },
  );

  it.fails(
    "END_TURN undo×1 round-trip with drift mask (seed 20260908 game 0)",
    async () => {
      const result = await runSoakGame({
        seed: 20260908,
        gameIndex: 0,
        historyCheck: true,
        historyIgnoreFields: MASK,
      });
      expect(result.outcome).toBe("completed");
    },
  );
});
