/**
 * @vitest-environment node
 *
 * Save/Load positions + Checkpoint/Reroll drilling features.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../../src/core/gameState.js";
import { hashGameState } from "../../src/core/stateHash.js";
import {
  doAction,
  undo,
  redo,
  canUndo,
  canRedo,
  resetHistory,
  setHistoryEnabled,
} from "../../src/core/history.js";
import {
  savePosition,
  loadPosition,
  listPositions,
  renamePosition,
  deletePosition,
  exportPositionToJson,
  exportPositionRecordToJson,
  importPositionFromJson,
  parsePositionJson,
  PositionSchemaError,
  POSITION_SCHEMA_VERSION,
  setCheckpoint,
  restoreCheckpoint,
  rerollFromCheckpoint,
  applyRerollBranch,
  getCheckpointInfo,
  deriveRerollSeed,
  _resetPositionStoreForTests,
  setSessionDeckIds,
} from "../../src/core/positionStore.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import { drawCard } from "../../src/core/utils.js";

describe("deriveRerollSeed", () => {
  it("is stable for the same (seed, cursor, index)", () => {
    expect(deriveRerollSeed(42, 100, 1)).toBe(deriveRerollSeed(42, 100, 1));
  });

  it("changes when any input changes", () => {
    const base = deriveRerollSeed(42, 100, 1);
    expect(deriveRerollSeed(43, 100, 1)).not.toBe(base);
    expect(deriveRerollSeed(42, 101, 1)).not.toBe(base);
    expect(deriveRerollSeed(42, 100, 2)).not.toBe(base);
  });
});

describe("Save / Load Position", () => {
  beforeEach(() => {
    setHistoryEnabled(true);
    resetUidCounter();
    _resetPositionStoreForTests();
    givenGameState({ seed: 9001, turn: 7, roundCount: 4 })
      .withFirstHand([
        { name: "HandA", type: "Follower", cost: 2, attack: 2, defense: 2 },
        { name: "HandB", type: "Follower", cost: 3, attack: 3, defense: 3 },
      ])
      .withFirstBoard([
        { name: "BoardA", type: "Follower", cost: 4, attack: 4, defense: 4 },
      ])
      .withFirstDeck([
        { name: "D0", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "D1", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "D2", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "D3", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "D4", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "D5", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "D6", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "D7", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ])
      .withSecondDeck([
        { name: "E0", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "E1", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "E2", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "E3", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "E4", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "E5", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "E6", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "E7", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ])
      .withFirstPP(7)
      .build();
    resetHistory();
    setSessionDeckIds("deck_a", "deck_b");
    // Advance RNG a bit so cursor is non-zero
    state.rng.nextFloat();
    state.rng.nextFloat();
  });

  it("save → mutate → load restores identical state hash including RNG", () => {
    const beforeHash = hashGameState(state);
    const rngBefore = state.rng.snapshot();

    const saved = savePosition("Drill T7", {
      meta: { deckAId: "deck_a", deckBId: "deck_b" },
    });
    expect(saved.schemaVersion).toBe(POSITION_SCHEMA_VERSION);
    expect(saved.meta.deckAId).toBe("deck_a");
    expect(saved.meta.seed).toBe(rngBefore.seed);

    doAction(
      "mutate",
      () => {
        state.players.first.hp -= 5;
        state.players.first.hand.pop();
        state.rng.nextFloat();
        state.rng.nextFloat();
      },
      {},
      { autoRender: false },
    );

    expect(hashGameState(state)).not.toBe(beforeHash);

    loadPosition(saved.id, { autoRender: false });

    expect(hashGameState(state)).toBe(beforeHash);
    expect(state.rng.snapshot()).toEqual(rngBefore);
    expect((state as any).__rng).toBeUndefined();
  });

  it("export → import round-trips byte-identically", () => {
    const saved = savePosition("Roundtrip");
    const json1 = exportPositionToJson(saved.id);
    _resetPositionStoreForTests();
    expect(listPositions()).toHaveLength(0);

    const imported = importPositionFromJson(json1, { load: false });
    // Id may be regenerated only on collision; fresh store keeps same id
    const json2 = exportPositionToJson(imported.id);
    expect(json2).toBe(json1);

    // Record-level helper also stable
    expect(exportPositionRecordToJson(imported)).toBe(json1);
  });

  it("version mismatch on import fails loudly without loading", () => {
    const saved = savePosition("Vcheck");
    const beforeHash = hashGameState(state);
    const json = exportPositionToJson(saved.id);
    const mangled = JSON.parse(json);
    mangled.schemaVersion = 999;
    const bad = JSON.stringify(mangled, null, 2);

    expect(() => parsePositionJson(bad)).toThrow(PositionSchemaError);
    expect(() => importPositionFromJson(bad)).toThrow(PositionSchemaError);

    // Live state untouched
    expect(hashGameState(state)).toBe(beforeHash);
    // Library still has only the original save
    expect(listPositions().map((p) => p.id)).toEqual([saved.id]);
  });

  it("list / rename / delete work", () => {
    const a = savePosition("Alpha");
    const b = savePosition("Beta");
    expect(listPositions().length).toBe(2);
    renamePosition(a.id, "Alpha2");
    expect(listPositions().find((p) => p.id === a.id)?.name).toBe("Alpha2");
    expect(deletePosition(b.id)).toBe(true);
    expect(listPositions().map((p) => p.id)).toEqual([a.id]);
  });

  it("loading a position resets undo history to that floor", () => {
    const saved = savePosition("Floor");
    doAction(
      "after-save",
      () => {
        state.players.first.hp -= 1;
      },
      {},
      { autoRender: false },
    );
    expect(canUndo()).toBe(true);

    loadPosition(saved.id, { autoRender: false });
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);

    doAction(
      "after-load",
      () => {
        state.players.first.hp -= 2;
      },
      {},
      { autoRender: false },
    );
    expect(canUndo()).toBe(true);
    const hp = state.players.first.hp;
    undo({ autoRender: false });
    expect(state.players.first.hp).toBe(hp + 2);
    // Cannot walk into the pre-load game
    expect(canUndo()).toBe(false);
  });
});

describe("Checkpoint + Reroll", () => {
  beforeEach(() => {
    setHistoryEnabled(true);
    resetUidCounter();
    _resetPositionStoreForTests();
    // Distinct deck cards so reshuffles are observable
    const deckCards = [];
    for (let i = 0; i < 20; i++) {
      deckCards.push({
        name: `DeckCard${i}`,
        type: "Follower" as const,
        cost: 1,
        attack: 1,
        defense: 1,
      });
    }
    givenGameState({ seed: 424242, turn: 5, roundCount: 3 })
      .withFirstHand([
        {
          name: "KnownHand1",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
        },
        {
          name: "KnownHand2",
          type: "Follower",
          cost: 3,
          attack: 3,
          defense: 3,
        },
        {
          name: "KnownHand3",
          type: "Follower",
          cost: 4,
          attack: 4,
          defense: 4,
        },
      ])
      .withFirstBoard([
        {
          name: "KnownBoard",
          type: "Follower",
          cost: 5,
          attack: 5,
          defense: 5,
        },
      ])
      .withFirstDeck(deckCards)
      .withSecondDeck(deckCards.map((c, i) => ({ ...c, name: `OppDeck${i}` })))
      .withFirstPP(5)
      .build();
    resetHistory();
    // Burn some RNG so checkpoint cursor != 0
    for (let i = 0; i < 7; i++) state.rng.nextFloat();
  });

  it("checkpoint → reroll keeps hand identical; next draw differs across rerolls; same index reproduces", () => {
    const handUids = state.players.first.hand.map((c) => c.uid);
    const handIds = state.players.first.hand.map((c) => c.id);
    const boardUids = state.players.first.board.map((c) => c.uid);
    const deckIdsAtCheckpoint = state.players.first.deck.map((c) => c.id);

    setCheckpoint();
    expect(getCheckpointInfo().active).toBe(true);
    expect(getCheckpointInfo().rerollCount).toBe(0);

    applyRerollBranch(1, { autoRender: false });
    expect(state.players.first.hand.map((c) => c.uid)).toEqual(handUids);
    expect(state.players.first.hand.map((c) => c.id)).toEqual(handIds);
    expect(state.players.first.board.map((c) => c.uid)).toEqual(boardUids);
    // Multiset of remaining deck ids preserved (only order changes)
    expect([...state.players.first.deck.map((c) => c.id)].sort()).toEqual(
      [...deckIdsAtCheckpoint].sort(),
    );

    const deckOrder1 = state.players.first.deck.map((c) => c.uid);
    const top1 = deckOrder1[deckOrder1.length - 1];
    const hash1 = hashGameState(state);
    const rng1 = state.rng.snapshot();

    // Draw one card on branch 1 — top of deck is array end
    const handLenBefore = state.players.first.hand.length;
    const ok = drawCard(
      state.players.first.hand,
      state.players.first.deck,
      "first",
    );
    expect(ok).toBe(true);
    expect(state.players.first.hand.length).toBe(handLenBefore + 1);
    expect(
      state.players.first.hand[state.players.first.hand.length - 1]?.uid,
    ).toBe(top1);

    // Re-apply same branch — hand must return to checkpoint hand; deck order identical
    applyRerollBranch(1, { autoRender: false });
    expect(state.players.first.hand.map((c) => c.uid)).toEqual(handUids);
    expect(hashGameState(state)).toBe(hash1);
    expect(state.rng.snapshot()).toEqual(rng1);
    expect(state.players.first.deck.map((c) => c.uid)).toEqual(deckOrder1);

    // Branch 2 differs
    applyRerollBranch(2, { autoRender: false });
    expect(state.players.first.hand.map((c) => c.uid)).toEqual(handUids);
    const deckOrder2 = state.players.first.deck.map((c) => c.uid);
    const top2 = deckOrder2[deckOrder2.length - 1];
    const hash2 = hashGameState(state);

    expect(deckOrder2).not.toEqual(deckOrder1);
    expect(top2).not.toBe(top1);
    expect(hash2).not.toBe(hash1);

    // Incrementing API matches applyRerollBranch
    restoreCheckpoint({ autoRender: false });
    // restore keeps rerollCount at last applied (2); force via apply
    applyRerollBranch(1, { autoRender: false });
    expect(hashGameState(state)).toBe(hash1);

    // rerollFromCheckpoint increments from current count
    _resetPositionStoreForTests();
    // rebuild checkpoint on current state... state is at branch 1; set fresh
    givenGameState({ seed: 424242, turn: 5, roundCount: 3 })
      .withFirstHand([
        {
          name: "KnownHand1",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
        },
        {
          name: "KnownHand2",
          type: "Follower",
          cost: 3,
          attack: 3,
          defense: 3,
        },
        {
          name: "KnownHand3",
          type: "Follower",
          cost: 4,
          attack: 4,
          defense: 4,
        },
      ])
      .withFirstDeck(
        Array.from({ length: 20 }, (_, i) => ({
          name: `DeckCard${i}`,
          type: "Follower" as const,
          cost: 1,
          attack: 1,
          defense: 1,
        })),
      )
      .withSecondDeck(
        Array.from({ length: 20 }, (_, i) => ({
          name: `OppDeck${i}`,
          type: "Follower" as const,
          cost: 1,
          attack: 1,
          defense: 1,
        })),
      )
      .build();
    for (let i = 0; i < 7; i++) state.rng.nextFloat();
    setCheckpoint();
    const info1 = rerollFromCheckpoint({ autoRender: false });
    expect(info1.rerollCount).toBe(1);
    const hInc1 = hashGameState(state);
    applyRerollBranch(1, { autoRender: false });
    expect(hashGameState(state)).toBe(hInc1);
  });

  it("undo still behaves after a reroll", () => {
    setCheckpoint();
    rerollFromCheckpoint({ autoRender: false });
    expect(canUndo()).toBe(false);

    const hp0 = state.players.first.hp;
    doAction(
      "damage",
      () => {
        state.players.first.hp -= 3;
      },
      {},
      { autoRender: false },
    );
    expect(canUndo()).toBe(true);
    undo({ autoRender: false });
    expect(state.players.first.hp).toBe(hp0);
    expect(canUndo()).toBe(false);
    redo({ autoRender: false });
    expect(state.players.first.hp).toBe(hp0 - 3);
  });

  it("exact restoreCheckpoint reproduces the pre-reroll position", () => {
    const hash0 = hashGameState(state);
    const rng0 = state.rng.snapshot();
    setCheckpoint();
    rerollFromCheckpoint({ autoRender: false });
    expect(hashGameState(state)).not.toBe(hash0);
    restoreCheckpoint({ autoRender: false });
    expect(hashGameState(state)).toBe(hash0);
    expect(state.rng.snapshot()).toEqual(rng0);
  });
});
