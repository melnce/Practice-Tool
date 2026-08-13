/**
 * @vitest-environment node
 *
 * Puzzle mode: checker over saved positions (NOT a solver).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../../src/core/gameState.js";
import { hashGameState } from "../../src/core/stateHash.js";
import {
  doAction,
  resetHistory,
  setHistoryEnabled,
} from "../../src/core/history.js";
import {
  savePosition,
  _resetPositionStoreForTests,
} from "../../src/core/positionStore.js";
import {
  savePuzzle,
  listPuzzles,
  parsePuzzleJson,
  exportPuzzleRecordToJson,
  importPuzzleFromJson,
  _resetPuzzleStoreForTests,
  PuzzleSchemaError,
  PUZZLE_SCHEMA_VERSION,
  isGoalMet,
  enemyFollowerCount,
  startPuzzle,
  retryPuzzle,
  getPuzzleSessionSnapshot,
  notePuzzlePpBeforePlay,
  _resetPuzzleSessionForTests,
  getPuzzle,
} from "../../src/core/puzzle/index.js";
import {
  beginPuzzleAttempt,
  retryPuzzleAttempt,
} from "../../src/logic/puzzle/runtime.js";
import {
  clearScript,
  loadScriptForPlayback,
  advanceScriptPlayback,
  getScriptRuntimeSnapshot,
} from "../../src/logic/script/runtime.js";
import { SCRIPT_SCHEMA_VERSION } from "../../src/core/script/types.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { endTurnBlue, endTurnRed } from "../../src/logic/core/turns.js";
import { applyGameOverIfNeeded } from "../../src/core/gameOver.js";

function fillDecks(): void {
  // Ensure end-turn draws don't deck out during multi-turn puzzles.
  for (const side of ["first", "second"] as const) {
    if (state.players[side].deck.length < 10) {
      for (let i = state.players[side].deck.length; i < 12; i++) {
        state.players[side].deck.push(
          createCard(
            {
              name: `Pad${side}${i}`,
              type: "Follower",
              cost: 1,
              attack: 1,
              defense: 1,
            },
            "deck",
            side,
          ),
        );
      }
    }
  }
}

function baseBoard(opts?: { enemyHp?: number; withEnemyFollower?: boolean }) {
  givenGameState({ seed: 7777, turn: 5, roundCount: 3, activePlayer: "first" })
    .withFirstHand([
      { name: "Strike", type: "Follower", cost: 2, attack: 5, defense: 2 },
    ])
    .withFirstBoard([
      {
        name: "Beater",
        type: "Follower",
        cost: 3,
        attack: 4,
        defense: 3,
        justPlayed: false,
        can_attack: true,
        attacks_left: 1,
        hasStorm: true,
      },
    ])
    .withSecondHP(opts?.enemyHp ?? 4)
    .withFirstPP(5)
    .build();
  state.gameStarted = true;
  state.phase = "main";
  if (opts?.withEnemyFollower) {
    state.players.second.board = [
      createCard(
        {
          name: "Blocker",
          type: "Follower",
          cost: 2,
          attack: 1,
          defense: 2,
        },
        "board",
        "second",
      ),
    ];
  }
  fillDecks();
  resetHistory();
}

describe("puzzle goals", () => {
  beforeEach(() => {
    resetUidCounter();
    _resetPositionStoreForTests();
    _resetPuzzleStoreForTests();
    _resetPuzzleSessionForTests();
    clearScript();
    setHistoryEnabled(true);
    (globalThis as any).HEADLESS = true;
  });

  it("detects enemy_leader_hp_0", () => {
    baseBoard({ enemyHp: 0 });
    expect(
      isGoalMet(
        { type: "enemy_leader_hp_0" },
        { solverSide: "first", turnsUsed: 0 },
      ),
    ).toBe(true);
  });

  it("detects clear_enemy_board only when no enemy followers remain", () => {
    baseBoard({ withEnemyFollower: true });
    expect(enemyFollowerCount(state, "first")).toBe(1);
    expect(
      isGoalMet(
        { type: "clear_enemy_board" },
        { solverSide: "first", turnsUsed: 0 },
      ),
    ).toBe(false);
    state.players.second.board = [];
    expect(
      isGoalMet(
        { type: "clear_enemy_board" },
        { solverSide: "first", turnsUsed: 0 },
      ),
    ).toBe(true);
  });

  it("survive_n_turns requires turnsUsed >= n and solver alive", () => {
    baseBoard();
    expect(
      isGoalMet(
        { type: "survive_n_turns", n: 2 },
        { solverSide: "first", turnsUsed: 1 },
      ),
    ).toBe(false);
    expect(
      isGoalMet(
        { type: "survive_n_turns", n: 2 },
        { solverSide: "first", turnsUsed: 2 },
      ),
    ).toBe(true);
    state.players.first.hp = 0;
    expect(
      isGoalMet(
        { type: "survive_n_turns", n: 2 },
        { solverSide: "first", turnsUsed: 2 },
      ),
    ).toBe(false);
  });
});

describe("puzzle load / retry determinism", () => {
  beforeEach(() => {
    resetUidCounter();
    _resetPositionStoreForTests();
    _resetPuzzleStoreForTests();
    _resetPuzzleSessionForTests();
    clearScript();
    setHistoryEnabled(true);
    (globalThis as any).HEADLESS = true;
    baseBoard({ enemyHp: 4, withEnemyFollower: true });
    // Advance RNG so cursor is non-zero
    state.rng.nextFloat();
    state.rng.nextFloat();
  });

  function saveLethalPuzzle() {
    const position = savePosition("puzzle-pos");
    return savePuzzle({
      title: "Kill in 1",
      solverSide: "first",
      turnLimit: 1,
      goal: { type: "enemy_leader_hp_0" },
      position,
    });
  }

  it("loads to a byte-identical state hash every time, including RNG cursor", () => {
    const puzzle = saveLethalPuzzle();
    const hashA = (() => {
      beginPuzzleAttempt(puzzle.id, { autoRender: false });
      return {
        hash: hashGameState(state),
        rng: state.rng.snapshot(),
        session: getPuzzleSessionSnapshot().startHash,
      };
    })();

    // Mutate heavily
    doAction(
      "mutate",
      () => {
        state.players.first.hp -= 3;
        state.rng.nextFloat();
        state.players.second.board = [];
      },
      {},
      { autoRender: false },
    );

    const hashB = (() => {
      beginPuzzleAttempt(puzzle.id, { autoRender: false });
      return {
        hash: hashGameState(state),
        rng: state.rng.snapshot(),
        session: getPuzzleSessionSnapshot().startHash,
      };
    })();

    expect(hashA.hash).toBe(hashB.hash);
    expect(hashA.session).toBe(hashB.session);
    expect(hashA.rng.seed).toBe(hashB.rng.seed);
    expect(hashA.rng.cursor).toBe(hashB.rng.cursor);
    expect(hashA.rng.uidCounter).toBe(hashB.rng.uidCounter);
  });

  it("retry restores identical starting position; same actions → same outcome", () => {
    const puzzle = saveLethalPuzzle();
    beginPuzzleAttempt(puzzle.id, { autoRender: false });
    const startHash = getPuzzleSessionSnapshot().startHash;

    // Fail by ending turn without lethal
    endTurnBlue();
    expect(getPuzzleSessionSnapshot().status).toBe("failed");

    retryPuzzleAttempt({ autoRender: false });
    expect(getPuzzleSessionSnapshot().status).toBe("active");
    expect(getPuzzleSessionSnapshot().startHash).toBe(startHash);
    expect(hashGameState(state)).toBe(startHash);
    expect(getPuzzleSessionSnapshot().turnsUsed).toBe(0);

    // Solve by dealing lethal to enemy leader via direct HP (checker path)
    doAction(
      "lethal",
      () => {
        state.players.second.hp = 0;
        applyGameOverIfNeeded("lethal");
      },
      {},
      { autoRender: false },
    );
    expect(getPuzzleSessionSnapshot().status).toBe("solved");
  });

  it("detects turn-limit failure for clear_enemy_board", () => {
    const position = savePosition("clear-pos");
    const puzzle = savePuzzle({
      title: "Clear board",
      solverSide: "first",
      turnLimit: 1,
      goal: { type: "clear_enemy_board" },
      position,
    });
    beginPuzzleAttempt(puzzle.id, { autoRender: false });
    expect(enemyFollowerCount(state, "first")).toBe(1);
    endTurnBlue();
    expect(getPuzzleSessionSnapshot().status).toBe("failed");
    expect(getPuzzleSessionSnapshot().failReason).toMatch(/Turn limit/);
  });

  it("detects clear_enemy_board success at end of solver turn", () => {
    const position = savePosition("clear-pos-2");
    const puzzle = savePuzzle({
      title: "Clear board win",
      solverSide: "first",
      turnLimit: 1,
      goal: { type: "clear_enemy_board" },
      position,
    });
    beginPuzzleAttempt(puzzle.id, { autoRender: false });
    doAction(
      "wipe",
      () => {
        state.players.second.board = [];
      },
      {},
      { autoRender: false },
    );
    // Not yet — clear is evaluated at end of solver turn
    expect(getPuzzleSessionSnapshot().status).toBe("active");
    endTurnBlue();
    expect(getPuzzleSessionSnapshot().status).toBe("solved");
  });

  it("survive_n_turns succeeds after N solver end-turns", () => {
    const position = savePosition("survive-pos");
    const puzzle = savePuzzle({
      title: "Survive 2",
      solverSide: "first",
      turnLimit: 2,
      goal: { type: "survive_n_turns", n: 2 },
      position,
    });
    beginPuzzleAttempt(puzzle.id, { autoRender: false });
    endTurnBlue();
    expect(getPuzzleSessionSnapshot().status).toBe("active");
    expect(getPuzzleSessionSnapshot().turnsUsed).toBe(1);
    // Opponent passes
    endTurnRed();
    endTurnBlue();
    expect(getPuzzleSessionSnapshot().turnsUsed).toBe(2);
    expect(getPuzzleSessionSnapshot().status).toBe("solved");
  });
});

describe("puzzle with opponent script", () => {
  beforeEach(() => {
    resetUidCounter();
    _resetPositionStoreForTests();
    _resetPuzzleStoreForTests();
    _resetPuzzleSessionForTests();
    clearScript();
    setHistoryEnabled(true);
    (globalThis as any).HEADLESS = true;
  });

  it("replays opponent script identically across attempts", () => {
    givenGameState({ seed: 4242, activePlayer: "second" }).build();
    state.gameStarted = true;
    state.phase = "main";
    state.roundCount = 4;
    state.players.second.pp = 5;
    state.players.second.maxPP = 5;
    const follower = createCard(
      {
        id: "script_atk_1",
        name: "Line Attacker",
        type: "Follower",
        cost: 2,
        attack: 3,
        defense: 2,
        hasStorm: true,
        justPlayed: false,
        can_attack: true,
        attacks_left: 1,
      },
      "board",
      "second",
    );
    state.players.second.board = [follower];
    fillDecks();
    resetHistory();

    const script = {
      schemaVersion: SCRIPT_SCHEMA_VERSION,
      name: "pass-line",
      scriptedSide: "second" as const,
      steps: [{ op: "END_TURN" as const }],
    };

    const position = savePosition("scripted-puzzle-pos");
    const puzzle = savePuzzle({
      title: "Scripted lethal",
      solverSide: "first",
      turnLimit: 2,
      goal: { type: "enemy_leader_hp_0" },
      position,
      opponentScript: script,
      scriptCursor: 0,
    });

    const runOnce = () => {
      beginPuzzleAttempt(puzzle.id, { autoRender: false });
      const startHash = hashGameState(state);
      // Opponent is active — advance script (END_TURN)
      const r1 = advanceScriptPlayback({
        applyAction: (action) => {
          if (action.type === "END_TURN") {
            if (state.activePlayer === "second") endTurnRed();
            else endTurnBlue();
          }
        },
      });
      expect(r1.status).toBe("ok");
      expect(state.activePlayer).toBe("first");
      const afterScriptHash = hashGameState(state);
      const cursor = getScriptRuntimeSnapshot().progress?.cursor;
      return { startHash, afterScriptHash, cursor };
    };

    const a = runOnce();
    const b = runOnce();
    expect(a.startHash).toBe(b.startHash);
    expect(a.afterScriptHash).toBe(b.afterScriptHash);
    expect(a.cursor).toBe(b.cursor);

    retryPuzzleAttempt({ autoRender: false });
    expect(hashGameState(state)).toBe(a.startHash);
    expect(getScriptRuntimeSnapshot().progress?.cursor).toBe(0);
  });
});

describe("puzzle export / import round-trip", () => {
  beforeEach(() => {
    resetUidCounter();
    _resetPositionStoreForTests();
    _resetPuzzleStoreForTests();
    _resetPuzzleSessionForTests();
    clearScript();
    setHistoryEnabled(true);
    (globalThis as any).HEADLESS = true;
    baseBoard();
  });

  it("export → import preserves definition and starting hash", () => {
    const position = savePosition("rt-pos");
    const puzzle = savePuzzle({
      title: "Round trip",
      description: "Worked example",
      solverSide: "first",
      turnLimit: 2,
      goal: { type: "enemy_leader_hp_0" },
      position,
      opponentScript: {
        schemaVersion: SCRIPT_SCHEMA_VERSION,
        name: "empty-pass",
        scriptedSide: "second",
        steps: [{ op: "END_TURN" }],
      },
    });

    const json = exportPuzzleRecordToJson(puzzle);
    _resetPuzzleStoreForTests();
    expect(listPuzzles()).toHaveLength(0);

    const imported = importPuzzleFromJson(json);
    expect(imported.schemaVersion).toBe(PUZZLE_SCHEMA_VERSION);
    expect(imported.title).toBe("Round trip");
    expect(imported.description).toBe("Worked example");
    expect(imported.goal).toEqual({ type: "enemy_leader_hp_0" });
    expect(imported.opponentScript?.steps).toHaveLength(1);
    expect(imported.position.state.__rng).toBeTruthy();

    beginPuzzleAttempt(imported.id, { autoRender: false });
    const h1 = getPuzzleSessionSnapshot().startHash;
    beginPuzzleAttempt(imported.id, { autoRender: false });
    expect(getPuzzleSessionSnapshot().startHash).toBe(h1);
  });

  it("rejects bad schema versions loudly", () => {
    expect(() =>
      parsePuzzleJson(
        JSON.stringify({
          schemaVersion: 999,
          id: "x",
          title: "bad",
          solverSide: "first",
          turnLimit: 1,
          goal: { type: "enemy_leader_hp_0" },
          position: {},
          savedAt: 1,
        }),
      ),
    ).toThrow(PuzzleSchemaError);
  });

  it("tracks best attempt on solve (cards played)", () => {
    const position = savePosition("best-pos");
    const puzzle = savePuzzle({
      title: "Best",
      solverSide: "first",
      turnLimit: 1,
      goal: { type: "enemy_leader_hp_0" },
      position,
    });
    beginPuzzleAttempt(puzzle.id, { autoRender: false });
    // Fake a successful play metric path via doAction named Play Card
    const card = state.players.first.hand[0]!;
    notePuzzlePpBeforePlay("first");
    const ppBefore = state.players.first.pp;
    doAction(
      "Play Card",
      () => {
        state.players.first.pp = ppBefore - 2;
        state.players.first.hand = [];
        state.players.second.hp = 0;
        applyGameOverIfNeeded("lethal");
      },
      { player: "first", uid: card.uid },
      { autoRender: false },
    );
    expect(getPuzzleSessionSnapshot().status).toBe("solved");
    expect(getPuzzleSessionSnapshot().cardsPlayed).toBe(1);
    expect(getPuzzleSessionSnapshot().ppSpent).toBe(2);
    const stored = getPuzzle(puzzle.id);
    expect(stored?.bestAttempt?.cardsPlayed).toBe(1);
    expect(stored?.bestAttempt?.ppSpent).toBe(2);
  });
});

describe("startPuzzle without script wrapper still restores position", () => {
  beforeEach(() => {
    resetUidCounter();
    _resetPositionStoreForTests();
    _resetPuzzleStoreForTests();
    _resetPuzzleSessionForTests();
    clearScript();
    setHistoryEnabled(true);
    (globalThis as any).HEADLESS = true;
    baseBoard();
  });

  it("startPuzzle + retryPuzzle are deterministic", () => {
    const position = savePosition("core-only");
    const puzzle = savePuzzle({
      title: "Core",
      solverSide: "first",
      turnLimit: 1,
      goal: { type: "enemy_leader_hp_0" },
      position,
    });
    startPuzzle(puzzle.id, { autoRender: false });
    const h = hashGameState(state);
    doAction(
      "x",
      () => {
        state.rng.nextFloat();
      },
      {},
      { autoRender: false },
    );
    retryPuzzle({ autoRender: false });
    expect(hashGameState(state)).toBe(h);
  });
});
