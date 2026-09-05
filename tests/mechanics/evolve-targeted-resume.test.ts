/**
 * PR #230 — selective evolve must resume through orchestrator queue, not run
 * evolve scripts inside the targeted-op handler (guardLifecycle runEffects).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import {
  canUndo,
  captureSnapshot,
  resetHistory,
  setHistoryEnabled,
  doAction,
} from "../../src/core/history.js";
import { getPP, getBoard } from "../../src/core/playerHelpers.js";

function placeEdelweissOnBoard(uid = "edel_1") {
  const edel = structuredClone(getCardById("10133130")!);
  edel.uid = uid;
  edel.zone = "board";
  edel.owner = "first";
  edel.peak_defense = Number(edel.defense);
  applyKeywordsFromList(edel);
  state.players.first.board = [edel];
  return edel;
}

function placeEnemyFollower(uid = "enemy_1") {
  const enemy = createCard("10001110", "board", "second");
  applyKeywordsFromList(enemy);
  enemy.uid = uid;
  enemy.peak_defense = Number(enemy.defense);
  state.players.second.board = [enemy];
  return enemy;
}

describe("selective evolve targeted-op resume (PR #230)", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    resetHistory();
    givenGameState({ seed: 230, activePlayer: "first" })
      .withFirstPP(8, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("runEffects pause + CHOOSE_TARGET runs evolve script without lifecycle guard", () => {
    const edel = placeEdelweissOnBoard();
    const enemy = placeEnemyFollower();
    const ppBefore = getPP(state, "first");

    doAction(
      "Select evolve ally",
      () => {
        runEffects(
          [
            {
              op: "evolve",
              target: "ally:follower",
              select: 1,
              spend_point: false,
            },
          ],
          "first",
          null,
        );
      },
      { op: "evolve" },
      { autoRender: false },
    );

    expect(state.pendingTargetEffect?.eff.op).toBe("evolve");

    engineDispatch(state, {
      type: "CHOOSE_TARGET",
      target: { type: "card", uid: edel.uid },
    });

    expect(state.pendingTargetEffect).toBeUndefined();
    expect(edel.hasEvolved).toBe(true);
    expect(Number(edel.attack)).toBe(4);
    expect(Number(edel.defense)).toBe(4);
    expect(Number(enemy.defense)).toBeLessThan(2);
    expect(getPP(state, "first")).toBe(ppBefore + 2);
  });

  it("engineDispatch CHOOSE_TARGET path matches runEffects resume", () => {
    const edel = placeEdelweissOnBoard("edel_ui");
    placeEnemyFollower("enemy_ui");

    runEffects(
      [
        {
          op: "evolve",
          target: "ally:follower",
          select: 1,
          spend_point: false,
        },
      ],
      "first",
      null,
    );

    expect(() =>
      engineDispatch(state, {
        type: "CHOOSE_TARGET",
        target: { type: "card", uid: edel.uid },
      }),
    ).not.toThrow(/illegally invoked lifecycle function: runEffects/);

    expect(edel.hasEvolved).toBe(true);
  });

  it("super-evolve selective target runs deferred script (Olivia pattern)", () => {
    const ally = placeEdelweissOnBoard("ally_super");
    const olivia = structuredClone(getCardById("10104110")!);
    olivia.uid = "olivia_1";
    olivia.zone = "board";
    olivia.owner = "first";
    olivia.hasEvolved = true;
    olivia.peak_defense = Number(olivia.defense);
    applyKeywordsFromList(olivia);
    state.players.first.board.push(olivia);
    placeEnemyFollower("enemy_super");

    runEffects(
      [
        {
          op: "evolve",
          target: "ally:follower",
          select: 1,
          mode: "super",
          filter: { unevolved: true, not_self: true },
          spend_point: false,
        },
      ],
      "first",
      olivia,
    );

    engineDispatch(state, {
      type: "CHOOSE_TARGET",
      target: { type: "card", uid: ally.uid },
    });

    expect(ally.hasEvolved).toBe(true);
    expect(ally.evoType).toBe("super");
    expect(Number(ally.attack)).toBe(5);
    expect(Number(ally.defense)).toBe(5);
  });

  it("undo/redo across evolve target prompt restores board", () => {
    const edel = placeEdelweissOnBoard("edel_undo");
    placeEnemyFollower();
    const before = JSON.stringify(captureSnapshot());

    doAction(
      "Select evolve ally",
      () => {
        runEffects(
          [
            {
              op: "evolve",
              target: "ally:follower",
              select: 1,
              spend_point: false,
            },
          ],
          "first",
          null,
        );
      },
      { op: "evolve" },
      { autoRender: false },
    );
    expect(canUndo()).toBe(true);
    expect(state.pendingTargetEffect).toBeDefined();

    engineDispatch(state, {
      type: "CHOOSE_TARGET",
      target: { type: "card", uid: edel.uid },
    });
    expect(edel.hasEvolved).toBe(true);

    engineDispatch(state, { type: "UNDO" });
    expect(JSON.stringify(captureSnapshot())).toBe(before);
    const restored = getBoard(state, "first").find((c) => c.uid === edel.uid);
    expect(restored?.hasEvolved).toBeFalsy();

    doAction(
      "Select evolve ally",
      () => {
        runEffects(
          [
            {
              op: "evolve",
              target: "ally:follower",
              select: 1,
              spend_point: false,
            },
          ],
          "first",
          null,
        );
      },
      { op: "evolve" },
      { autoRender: false },
    );
    engineDispatch(state, {
      type: "CHOOSE_TARGET",
      target: { type: "card", uid: edel.uid },
    });
    const reEvolved = getBoard(state, "first").find((c) => c.uid === edel.uid);
    expect(reEvolved?.hasEvolved).toBe(true);
  });
});
