/**
 * Position save/load must preserve in-flight death_lw queue entries so
 * countdown-zero amulets (World of Games) resolve identically on re-apply.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import "../fixtures/setup.ts";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { runSoakGame } from "../../src/bench/soakEnv.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { state } from "../../src/core/gameState.js";
import {
  savePosition,
  loadPosition,
  deletePosition,
  _resetPositionStoreForTests,
} from "../../src/core/positionStore.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import {
  getBoard,
  getGraveyard,
  getHand,
} from "../../src/core/playerHelpers.js";
import { getResolutionQueue } from "../../src/logic/core/triggers/queue.js";
import { getEngineEphemeralFootprint } from "../../src/core/history.js";

const WORLD_OF_GAMES = "10503210";
const ENGINE = "engine" as const;

function canonGraveAndHand(player: "first" | "second") {
  const grave = getGraveyard(state, player).map((c) => ({
    uid: c.uid,
    name: c.name,
    lw: (c as any)._lwFired,
  }));
  const hand = getHand(state, player).map((c) => c.uid);
  return JSON.stringify({
    grave,
    hand,
    shadows: state.players[player].shadows,
  });
}

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  await initCardDatabaseNode();
});

describe("position re-apply countdown (soak pins)", () => {
  it("seed 20260925 game 18 — position save-load re-apply (World of Games uid_28)", async () => {
    const result = await runSoakGame({
      seed: 20260925,
      gameIndex: 18,
      positionCheck: true,
      dispatch: ENGINE,
      fuse: true,
      interactiveModes: true,
      turnCap: 60,
      actionCap: 800,
    });
    expect(
      result.outcome,
      result.error ?? `game 18 outcome ${result.outcome}`,
    ).toBe("completed");
  }, 60_000);

  it("seed 20260925 game 98 — position save-load re-apply (World of Games uid_13)", async () => {
    const result = await runSoakGame({
      seed: 20260925,
      gameIndex: 98,
      positionCheck: true,
      dispatch: ENGINE,
      fuse: true,
      interactiveModes: true,
      turnCap: 60,
      actionCap: 800,
    });
    expect(
      result.outcome,
      result.error ?? `game 98 outcome ${result.outcome}`,
    ).toBe("completed");
  }, 60_000);
});

describe("position re-apply countdown (World of Games unit)", () => {
  beforeEach(() => {
    resetUidCounter();
    _resetPositionStoreForTests();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("save → play → load → re-play leaves World of Games in graveyard with 2 draws", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 5 })
      .withFirstPP(10, 10)
      .withFirstDeck([
        { name: "Deck Filler A", type: "Follower", cost: 1 },
        { name: "Deck Filler B", type: "Follower", cost: 1 },
        { name: "Deck Filler C", type: "Follower", cost: 1 },
        { name: "Deck Filler D", type: "Follower", cost: 1 },
      ])
      .build();

    const wog = createCard(WORLD_OF_GAMES, "board", "first");
    applyKeywordsFromList(wog);
    wog.hasCountdown = true;
    wog.countdown = 1;
    getBoard(state, "first").push(wog);

    const sameCostOnField = createCard("10001110", "board", "first");
    sameCostOnField.cost = 1;
    (sameCostOnField as { base_cost?: number }).base_cost = 1;
    getBoard(state, "first").push(sameCostOnField);

    const toPlay = createCard("10001120", "hand", "first");
    toPlay.cost = 1;
    (toPlay as { base_cost?: number }).base_cost = 1;
    state.players.first.hand.push(toPlay);
    const playUid = toPlay.uid;

    const saved = savePosition("wog-reapply");
    const playAction = {
      type: "PLAY_CARD" as const,
      player: "first" as const,
      cardUid: playUid,
    };

    engineDispatch(state, playAction);
    const afterFirst = canonGraveAndHand("first");
    expect(getGraveyard(state, "first").some((c) => c.uid === wog.uid)).toBe(
      true,
    );
    expect(getHand(state, "first").length).toBeGreaterThanOrEqual(2);

    loadPosition(saved.id, { autoRender: false });
    expect(getResolutionQueue().length).toBe(0);

    engineDispatch(state, playAction);
    const afterSecond = canonGraveAndHand("first");
    expect(afterSecond).toBe(afterFirst);
    expect(getGraveyard(state, "first").some((c) => c.uid === wog.uid)).toBe(
      true,
    );

    deletePosition(saved.id);
  });

  it("snapshot preserves death_lw queue for limbo countdown amulet", () => {
    givenGameState({ seed: 7, activePlayer: "first", roundCount: 5 })
      .withFirstPP(10, 10)
      .build();

    const wog = createCard(WORLD_OF_GAMES, "board", "first");
    applyKeywordsFromList(wog);
    wog.hasCountdown = true;
    wog.countdown = 0;
    getBoard(state, "first").push(wog);

    (state as any).deferDeathTriggers = true;
    getResolutionQueue().push({
      kind: "death_lw",
      items: [{ cardUid: wog.uid, owner: "first", card: wog }],
    });
    getBoard(state, "first").splice(getBoard(state, "first").indexOf(wog), 1);

    const footprint = getEngineEphemeralFootprint();
    expect(footprint.resolutionQueueLen).toBe(1);
    expect(footprint.resolutionQueueKinds[0]).toMatch(/^death_lw/);

    const saved = savePosition("wog-limbo");
    expect((saved.state as any)._resolutionQueue?.length).toBe(1);
    expect((saved.state as any)._resolutionQueue[0]?.items[0]?.cardUid).toBe(
      wog.uid,
    );

    loadPosition(saved.id, { autoRender: false });
    expect(getResolutionQueue().length).toBe(1);
    expect(resolveDeathLwCardRef(wog.uid)).toBeTruthy();

    deletePosition(saved.id);
  });
});

function resolveDeathLwCardRef(uid: string) {
  const q = getResolutionQueue();
  for (const item of q) {
    if (item.kind !== "death_lw") continue;
    for (const lw of item.items) {
      if (lw.cardUid === uid) return lw.card;
    }
  }
  return null;
}
