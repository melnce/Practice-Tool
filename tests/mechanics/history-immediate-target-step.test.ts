/**
 * History: immediate target picks are undo steps; appendStep never commits mid-effect.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { getLogs, clearLogs } from "../../src/core/logger.js";
import {
  appendStep,
  canUndo,
  canRedo,
  captureSnapshot,
  onHistoryEvent,
  resetHistory,
  setHistoryEnabled,
  undo,
  redo,
} from "../../src/core/history.js";
import { canonicalJson } from "../../src/bench/soakEnv.js";
import { getBoard, getHand } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const EARRINGS = "10761210";
const RETURN_CARD = "10001110";
const FILLER = "10102110";
const COST_ONE_DRAW = "10031310";
const TARGET_SPELL = "10041310";
const ENEMY = "10001110";

function addKukishiroCrest(): void {
  const card = getCardById("10564120")!;
  const crestEff = card.fanfare!.find((e) => e.op === "crest")!;
  state.players.first.crests.push({
    name: crestEff.name as string,
    owner: "first",
    image: crestEff.image as string,
    description: crestEff.description as string,
    triggers: crestEff.triggers as any,
  });
}

function pushDeckTop(spec: string): void {
  state.players.first.deck.push(createCard(spec, "deck", "first"));
}

function countCommitsDuring(fn: () => void): {
  commits: number;
  names: string[];
} {
  const names: string[] = [];
  const unsub = onHistoryEvent((ev) => {
    if (ev.type === "commit") names.push(ev.name);
  });
  fn();
  unsub();
  return { commits: names.length, names };
}

function setupTargetSpell(): {
  cardUid: string;
  targetUid: string;
  beforePlay: string;
} {
  givenGameState({ seed: 7, activePlayer: "first" })
    .withFirstHand([TARGET_SPELL])
    .withFirstPP(4, 6)
    .build();
  state.gameStarted = true;
  state.phase = "main";

  const enemy = createCard(ENEMY, "board", "second");
  applyKeywordsFromList(enemy);
  enemy.peak_defense = Number(enemy.defense);
  state.players.second.board = [enemy];
  resetHistory();

  return {
    cardUid: getHand(state, "first")[0]!.uid,
    targetUid: enemy.uid,
    beforePlay: canonicalJson(captureSnapshot()),
  };
}

describe("history immediate target step", () => {
  beforeAll(() => {
    (globalThis as any).HEADLESS = true;
  });

  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    resetHistory();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("Earrings + Kukishiro crest: target click commits no Random Choice; undo/redo round-trip", () => {
    givenGameState({ seed: 20260908, activePlayer: "first", roundCount: 10 })
      .withFirstHand([EARRINGS, RETURN_CARD, FILLER])
      .withFirstDeck([FILLER, FILLER])
      .withFirstPP(10, 10)
      .build();
    addKukishiroCrest();
    pushDeckTop(COST_ONE_DRAW);

    const earringsUid = getHand(state, "first")[0]!.uid;
    engineDispatch(state, {
      type: "PLAY_CARD",
      player: "first",
      cardUid: earringsUid,
    });
    expect(state.pendingTargetEffect).toBeDefined();

    const toReturn = thenHand("first").find((c) => c.id === RETURN_CARD)!;
    const beforeResolve = canonicalJson(captureSnapshot());

    const { names } = countCommitsDuring(() => {
      resolvePendingTarget(toReturn.uid);
    });

    expect(names).not.toContain("Random Choice");
    expect(names).toEqual(["Resolve Targets"]);

    undo();
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect!.targetUids ?? []).toEqual([]);
    expect(canonicalJson(captureSnapshot())).toBe(beforeResolve);

    undo();
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(getHand(state, "first").some((c) => String(c.id) === EARRINGS)).toBe(
      true,
    );

    redo();
    expect(state.pendingTargetEffect).toBeDefined();
    redo();
    expect(canonicalJson(captureSnapshot())).not.toBe(beforeResolve);
    expect(canUndo()).toBe(true);
  });

  it("appendStep outside an open action logs history_step without a commit", () => {
    (globalThis as any).HEADLESS = false;
    resetHistory();
    expect(canUndo()).toBe(false);
    clearLogs();

    const { commits } = countCommitsDuring(() => {
      appendStep("Random Choice", { step: true, reason: "random" });
    });

    expect(commits).toBe(0);
    expect(canUndo()).toBe(false);
    expect(
      getLogs().some(
        (e) => e.type === "history_step" && e.details?.step === "Random Choice",
      ),
    ).toBe(true);
    (globalThis as any).HEADLESS = true;
  });

  describe("immediate-execute target via dispatch", () => {
    it.each([
      ["engineDispatch", engineDispatch],
      ["dispatchAction", dispatchAction],
    ] as const)(
      "(%s) Resolve Targets undo step and round-trip",
      (_label, dispatchFn) => {
        const { cardUid, targetUid, beforePlay } = setupTargetSpell();

        dispatchFn(state, { type: "PLAY_CARD", player: "first", cardUid });
        expect(state.pendingTargetEffect).toBeDefined();
        expect(canUndo()).toBe(true);

        const beforeResolve = canonicalJson(captureSnapshot());
        const { names } = countCommitsDuring(() => {
          dispatchFn(state, {
            type: "CHOOSE_TARGET",
            target: { type: "card", uid: targetUid },
          });
        });

        expect(names).toEqual(["Resolve Targets"]);
        expect(state.pendingTargetEffect).toBeUndefined();
        expect(canUndo()).toBe(true);
        const afterResolve = canonicalJson(captureSnapshot());

        dispatchFn(state, { type: "UNDO" });
        expect(state.pendingTargetEffect).toBeDefined();
        expect(state.pendingTargetEffect!.targetUids ?? []).toEqual([]);
        expect(canonicalJson(captureSnapshot())).toBe(beforeResolve);

        dispatchFn(state, { type: "UNDO" });
        expect(canUndo()).toBe(false);
        expect(canonicalJson(captureSnapshot())).toBe(beforePlay);

        dispatchFn(state, { type: "REDO" });
        dispatchFn(state, { type: "REDO" });
        expect(canRedo()).toBe(false);
        expect(canonicalJson(captureSnapshot())).toBe(afterResolve);
      },
    );
  });
});
