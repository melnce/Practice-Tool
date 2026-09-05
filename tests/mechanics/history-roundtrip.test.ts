/**
 * History round-trip soak — undo/redo after every undoable action with full-state comparison.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { runSoakGame } from "../../src/bench/soakEnv.js";
import { startNewGame, dispatch } from "../../src/engine.js";
import { state } from "../../src/core/gameState.js";
import { canUndo, captureSnapshot } from "../../src/core/history.js";
import { canonicalJson } from "../../src/bench/soakEnv.js";

const FIXED_SEEDS = [20260908, 20260909, 20260910] as const;

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  await initCardDatabaseNode();
});

describe("history round-trip soak", () => {
  for (const seed of FIXED_SEEDS) {
    it.fails(`seed ${seed} — main-phase undo/redo round-trip`, async () => {
      const result = await runSoakGame({
        seed,
        gameIndex: 0,
        historyCheck: true,
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
    await startNewGame({
      deckAId: "aggro_abysscraft",
      deckBId: "spell_runecraft",
      seed: 20260908,
    });
    expect(state.phase).toBe("mulligan");

    const hand = state.players.first.hand;
    const cardUid = hand.find((c) => (c as any).__mulliganSelectable)?.uid;
    expect(cardUid).toBeTruthy();

    const beforeToggle = canonicalJson(captureSnapshot());
    dispatch(state, {
      type: "TOGGLE_MULLIGAN",
      player: "first",
      cardUid: cardUid!,
    });
    expect(canUndo()).toBe(false);
    const afterToggle = canonicalJson(captureSnapshot());
    expect(afterToggle).not.toBe(beforeToggle);
    dispatch(state, { type: "UNDO" });
    expect(canonicalJson(captureSnapshot())).toBe(afterToggle);

    dispatch(state, { type: "CONFIRM_MULLIGAN", player: "first" });
    dispatch(state, { type: "CONFIRM_MULLIGAN", player: "second" });
    expect(canUndo()).toBe(false);
    const afterConfirm = canonicalJson(captureSnapshot());
    dispatch(state, { type: "UNDO" });
    expect(canonicalJson(captureSnapshot())).toBe(afterConfirm);
  });

  // deferDeathTriggers / lastDrawnCard not restored on PLAY_CARD undo (module-level death deferral).
  it.fails(
    "PLAY_CARD undo×1 leaves deferDeathTriggers and lastDrawnCard dirty (seed 20260908 game 0 action 40)",
    async () => {
      const result = await runSoakGame({
        seed: 20260908,
        gameIndex: 0,
        historyCheck: true,
      });
      expect(result.outcome).toBe("completed");
    },
  );

  // Deep-chain redo drifts on lastAddedToHand / lastDrawnCards references.
  it.fails(
    "deep-chain redo level 4 mismatch on hand metadata (seed 20260908 game 100 action 25)",
    async () => {
      const result = await runSoakGame({
        seed: 20260908,
        gameIndex: 100,
        historyCheck: true,
      });
      expect(result.outcome).toBe("completed");
    },
  );

  // CHOOSE_TARGET and PLAY_CARD sometimes emit zero history commits (bypass history.ts).
  it.fails(
    "unexpected non-undoable engine actions CHOOSE_TARGET and PLAY_CARD (seed 20260908 game 15)",
    async () => {
      const result = await runSoakGame({
        seed: 20260908,
        gameIndex: 15,
        historyCheck: true,
      });
      expect(result.outcome).toBe("completed");
    },
  );
});
