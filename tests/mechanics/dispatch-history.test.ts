/**
 * Headless dispatchAction must wrap PLAY_CARD in history like engine.dispatch.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";
import {
  canUndo,
  canRedo,
  captureSnapshot,
  resetHistory,
  setHistoryEnabled,
} from "../../src/core/history.js";
import {
  getHand,
  getBoard,
  getPP,
  setPP,
} from "../../src/core/playerHelpers.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";

vi.mock("../../src/ui/render.js", () => ({ logEvent: vi.fn() }));

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(",")}]`;
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`)
    .join(",")}}`;
}

function canonicalJson(value: unknown): string {
  return stableStringify(value);
}

function deckFill(prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `${prefix}${i}`,
    type: "Follower" as const,
    cost: 1,
    attack: 1,
    defense: 1,
  }));
}

function playViaDispatchAction(
  cardUid: string,
  player: "first" | "second" = "first",
) {
  dispatchAction(state, { type: "PLAY_CARD", player, cardUid });
}

function playViaEngine(cardUid: string, player: "first" | "second" = "first") {
  engineDispatch(state, { type: "PLAY_CARD", player, cardUid });
}

describe("dispatchAction PLAY_CARD history", () => {
  beforeEach(() => {
    resetUidCounter();
    (globalThis as any).HEADLESS = true;
    setHistoryEnabled(true);
    resetHistory();
  });

  it("play fanfare draw follower then UNDO restores pre-play snapshot", () => {
    givenGameState({ seed: 42, activePlayer: "first" })
      .withFirstHand(["10101110"])
      .withFirstDeck(deckFill("D", 10))
      .withFirstPP(2, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    resetHistory();

    const cardUid = getHand(state, "first")[0]!.uid;
    const before = canonicalJson(captureSnapshot());
    expect(getPP(state, "first")).toBe(2);
    expect(getHand(state, "first").length).toBe(1);
    expect(getBoard(state, "first").length).toBe(0);
    expect((state as any).deferDeathTriggers ?? false).toBe(false);
    const tickBefore = state.gameTick;

    playViaDispatchAction(cardUid);
    expect(canUndo()).toBe(true);
    expect(getBoard(state, "first").length).toBe(1);
    expect(getHand(state, "first").length).toBe(1); // fanfare drew 1, played 1
    expect(getPP(state, "first")).toBe(0);
    const afterPlay = canonicalJson(captureSnapshot());

    dispatchAction(state, { type: "UNDO" });
    expect(canonicalJson(captureSnapshot())).toBe(before);
    expect(getPP(state, "first")).toBe(2);
    expect(getHand(state, "first").length).toBe(1);
    expect(getBoard(state, "first").length).toBe(0);
    expect((state as any).deferDeathTriggers ?? false).toBe(false);
    expect(state.gameTick).toBe(tickBefore);

    dispatchAction(state, { type: "REDO" });
    expect(canonicalJson(captureSnapshot())).toBe(afterPlay);
    expect(canRedo()).toBe(false);
  });

  it("blocked play via dispatchAction creates no history entry", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10101110"])
      .withFirstPP(0, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    resetHistory();

    const cardUid = getHand(state, "first")[0]!.uid;
    expect(canUndo()).toBe(false);

    playViaDispatchAction(cardUid);
    expect(canUndo()).toBe(false);
    expect(getHand(state, "first").length).toBe(1);
    expect(getPP(state, "first")).toBe(0);
  });

  it("target prompt play + CHOOSE_TARGET is two undo steps on both entrypoints", () => {
    const setup = () => {
      resetUidCounter();
      givenGameState({ seed: 7, activePlayer: "first" })
        .withFirstHand(["10041310"])
        .withFirstPP(4, 6)
        .build();
      state.gameStarted = true;
      state.phase = "main";

      const enemy = createCard("10001110", "board", "second");
      applyKeywordsFromList(enemy);
      enemy.uid = "enemy_board";
      enemy.peak_defense = Number(enemy.defense);
      state.players.second.board = [enemy];
      resetHistory();
      return {
        cardUid: getHand(state, "first")[0]!.uid,
        targetUid: enemy.uid,
        beforePlay: canonicalJson(captureSnapshot()),
      };
    };

    const runHeadlessPath = (play: typeof playViaDispatchAction) => {
      const { cardUid, targetUid, beforePlay } = setup();
      play(cardUid);
      expect(state.pendingTargetEffect).toBeDefined();
      expect(canUndo()).toBe(true);

      const beforeResolve = canonicalJson(captureSnapshot());
      dispatchAction(state, {
        type: "CHOOSE_TARGET",
        target: { type: "card", uid: targetUid },
      });
      expect(state.pendingTargetEffect).toBeUndefined();
      expect(canUndo()).toBe(true);

      dispatchAction(state, { type: "UNDO" });
      expect(state.pendingTargetEffect).toBeDefined();
      expect(state.pendingTargetEffect!.targetUids ?? []).toEqual([]);
      expect(canonicalJson(captureSnapshot())).toBe(beforeResolve);

      dispatchAction(state, { type: "UNDO" });
      expect(canUndo()).toBe(false);
      expect(canonicalJson(captureSnapshot())).toBe(beforePlay);
      return beforePlay;
    };

    const headlessBefore = runHeadlessPath(playViaDispatchAction);
    const uiBefore = runHeadlessPath(playViaEngine);
    expect(uiBefore).toBe(headlessBefore);
  });
});
