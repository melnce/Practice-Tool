/**
 * Position save/load, export/import, checkpoint, and reroll round-trip soak.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import {
  runSoakGame,
  canonicalJson,
  getLegalSoakActions,
  PRE_SNAPSHOT_HISTORY_DRIFT_FIELDS,
} from "../../src/bench/soakEnv.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { state } from "../../src/core/gameState.js";
import { hashGameState } from "../../src/core/stateHash.js";
import {
  captureSnapshot,
  setHistoryEnabled,
  resetHistory,
} from "../../src/core/history.js";
import {
  savePosition,
  loadPosition,
  deletePosition,
  exportPositionToJson,
  importPositionFromJson,
  setCheckpoint,
  restoreCheckpoint,
  rerollFromCheckpoint,
  deriveRerollSeed,
  getCheckpointInfo,
  _resetPositionStoreForTests,
} from "../../src/core/positionStore.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import { setPendingTarget } from "../../src/logic/core/pendingTarget/index.js";
import { highlightSelectable } from "../../src/logic/core/targeting.js";
import { injectAdapter } from "../../src/core/adapter.js";
import "../audit/setup.ts";

const ENGINE = "engine" as const;
const MASK = [...PRE_SNAPSHOT_HISTORY_DRIFT_FIELDS];

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  await initCardDatabaseNode();
});

const SAVE_LOAD_READ_PATH_FINDING =
  "position save-load re-apply mismatch: read-path preflight mutates live state during " +
  "getLegalSoakActions (pickEnhanceTiers enhanceTiers write-back in " +
  "src/logic/core/playCard/cost.ts; e.g. __uiSelectable on deck cards) — " +
  "flips when fix-enhance-tiers-read-write merges";

describe("position round-trip soak", () => {
  vi.setConfig({ testTimeout: 120_000 });

  it("seed 20260908 — engine dispatch position round-trip (game 0)", async () => {
    const result = await runSoakGame({
      seed: 20260908,
      gameIndex: 0,
      positionCheck: true,
      dispatch: ENGINE,
      turnCap: 60,
      actionCap: 800,
    });
    expect(
      result.outcome,
      result.error ?? `seed 20260908 outcome ${result.outcome}`,
    ).toBe("completed");
  });

  it.fails(
    "seed 20260909 — engine dispatch position round-trip (game 0)",
    async () => {
      const result = await runSoakGame({
        seed: 20260909,
        gameIndex: 0,
        positionCheck: true,
        dispatch: ENGINE,
        turnCap: 60,
        actionCap: 800,
      });
      expect(
        result.outcome,
        result.error ?? `${SAVE_LOAD_READ_PATH_FINDING}; got ${result.outcome}`,
      ).toBe("completed");
    },
  );

  it("seed 20260909 — history + positions together (game 0)", async () => {
    const result = await runSoakGame({
      seed: 20260909,
      gameIndex: 0,
      historyCheck: true,
      positionCheck: true,
      dispatch: ENGINE,
      turnCap: 60,
      actionCap: 800,
    });
    expect(
      result.outcome,
      result.error ?? `combined outcome ${result.outcome}`,
    ).toBe("completed");
  });

  it("sabotage skip-load is detected on save/load round-trip", async () => {
    const result = await runSoakGame({
      seed: 20260909,
      gameIndex: 0,
      positionCheck: true,
      sabotageSkipLoad: true,
      dispatch: ENGINE,
      turnCap: 60,
      actionCap: 800,
    });
    expect(result.outcome).toBe("position");
    expect(result.error).toMatch(/position save-load load mismatch/);
  });
});

describe("position round-trip shapes (engineDispatch)", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    resetHistory();
    _resetPositionStoreForTests();
    injectAdapter({
      render: () => {},
      showChoiceModal: () => {},
      showTargetConfirmationButton: () => {},
      hideTargetConfirmation: () => {},
    });
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it.fails(
    "pickEnhanceTiers write-back in cost.ts mutates hand on getLegalSoakActions read path",
    () => {
      givenGameState({ seed: 4242, activePlayer: "first", roundCount: 5 })
        .withFirstHand([
          {
            name: "Enhance Test",
            type: "Follower",
            cost: 1,
            attack: 1,
            defense: 1,
            enhanceTiers: [{ cost: 1, effects: [{ op: "draw", count: 1 }] }],
          },
        ])
        .withFirstDeck([
          {
            name: "Filler",
            type: "Follower",
            cost: 1,
            attack: 1,
            defense: 1,
          },
        ])
        .withFirstPP(5, 5)
        .build();
      resetHistory();

      const card = state.players.first.hand[0]!;
      expect(card.enhanceTiers).toBeUndefined();

      getLegalSoakActions();
      expect(card.enhanceTiers).toBeUndefined();
    },
  );

  it("save while target prompt open → load → prompt open with no picks", () => {
    givenGameState({ seed: 5, activePlayer: "first" }).build();
    const a = createCard("10001110", "board", "second");
    const b = createCard("10001120", "board", "second");
    a.uid = "t_a";
    b.uid = "t_b";
    a.peak_defense = Number(a.defense);
    b.peak_defense = Number(b.defense);
    state.players.second.board = [a, b];

    setPendingTarget({
      eff: { op: "damage", amount: 2, select: 2 } as any,
      owner: "first",
      sourceCard: null,
      pool: [a, b],
      poolUids: [a.uid, b.uid],
      targets: [],
      targetUids: [],
      selectCount: 2,
      requiresConfirmation: true,
    });
    highlightSelectable([a, b]);

    engineDispatch(state, {
      type: "CHOOSE_TARGET",
      target: { type: "card", uid: a.uid },
    });
    expect(state.pendingTargetEffect?.targetUids).toEqual([a.uid]);

    const saved = savePosition("prompt-open");
    loadPosition(saved.id, { autoRender: false });
    deletePosition(saved.id);

    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect?.targetUids).toEqual([]);
    expect(state.pendingTargetEffect?.pool?.map((c) => c.uid)).toEqual([
      a.uid,
      b.uid,
    ]);
  });

  it("checkpoint before attack → attack → restore → attack again → same outcome", () => {
    givenGameState({ seed: 77, activePlayer: "first", roundCount: 5 })
      .withFirstBoard([
        {
          name: "Attacker",
          type: "Follower",
          cost: 2,
          attack: 3,
          defense: 3,
          canAttack: true,
        },
      ])
      .withSecondBoard([
        {
          name: "Defender",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
        },
      ])
      .build();

    const attacker = findOnBoard("first", "Attacker")!;
    const defender = findOnBoard("second", "Defender")!;
    attacker.can_attack = true;
    attacker.hasAttacked = false;

    setCheckpoint();
    engineDispatch(state, {
      type: "ATTACK",
      player: "first",
      attackerUid: attacker.uid,
      defender: { type: "card", uid: defender.uid },
    });
    const hashAfterAttack = hashGameState(state);
    const attackerDef = Number(attacker.defense);
    const defenderDef = Number(defender.defense);

    restoreCheckpoint({ autoRender: false });
    const attacker2 = findOnBoard("first", "Attacker")!;
    const defender2 = findOnBoard("second", "Defender")!;
    attacker2.can_attack = true;
    attacker2.hasAttacked = false;

    engineDispatch(state, {
      type: "ATTACK",
      player: "first",
      attackerUid: attacker2.uid,
      defender: { type: "card", uid: defender2.uid },
    });

    expect(hashGameState(state)).toBe(hashAfterAttack);
    expect(Number(attacker2.defense)).toBe(attackerDef);
    expect(Number(defender2.defense)).toBe(defenderDef);
  });

  it("reroll reshuffles only the undrawn deck remainder", () => {
    const deckCards = Array.from({ length: 12 }, (_, i) => ({
      name: `DeckCard${i}`,
      type: "Follower" as const,
      cost: 1,
      attack: 1,
      defense: 1,
    }));
    givenGameState({ seed: 424242, turn: 5, roundCount: 3 })
      .withFirstHand([
        {
          name: "KnownHand",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
        },
      ])
      .withFirstBoard([
        {
          name: "KnownBoard",
          type: "Follower",
          cost: 3,
          attack: 3,
          defense: 3,
        },
      ])
      .withFirstDeck(deckCards)
      .withSecondDeck(deckCards.map((c, i) => ({ ...c, name: `OppDeck${i}` })))
      .build();
    resetHistory();
    for (let i = 0; i < 5; i++) state.rng.nextFloat();

    const handUids = state.players.first.hand.map((c) => c.uid);
    const boardUids = state.players.first.board.map((c) => c.uid);
    const deckIdsBefore = [...state.players.first.deck.map((c) => c.id)].sort();
    const deckOrderBefore = state.players.first.deck.map((c) => c.uid);

    setCheckpoint();
    rerollFromCheckpoint({ autoRender: false });

    expect(state.players.first.hand.map((c) => c.uid)).toEqual(handUids);
    expect(state.players.first.board.map((c) => c.uid)).toEqual(boardUids);
    expect([...state.players.first.deck.map((c) => c.id)].sort()).toEqual(
      deckIdsBefore,
    );
    expect(state.players.first.deck.map((c) => c.uid)).not.toEqual(
      deckOrderBefore,
    );
    const info = getCheckpointInfo();
    const expectedSeed = deriveRerollSeed(
      info.originalSeed!,
      info.checkpointCursor!,
      1,
    );
    expect(state.rng.snapshot().seed).toBe(expectedSeed);
  });

  it("export/import JSON round-trip matches masked canonical snapshot", () => {
    givenGameState({ seed: 9001, turn: 4, roundCount: 3 })
      .withFirstHand([
        {
          name: "HandA",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
        },
      ])
      .withFirstDeck([
        {
          name: "D0",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
        {
          name: "D1",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
      ])
      .build();
    resetHistory();

    const saved = savePosition("export-test");
    const before = canonicalJson(captureSnapshot());
    const json = exportPositionToJson(saved.id);
    const imported = importPositionFromJson(json, { load: false });
    loadPosition(imported.id, { autoRender: false });
    const after = canonicalJson(captureSnapshot());

    const mask = (jsonStr: string) => {
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;
      for (const key of MASK) delete obj[key];
      return canonicalJson(obj);
    };

    expect(mask(after)).toBe(mask(before));
    deletePosition(saved.id);
    deletePosition(imported.id);
  });
});
