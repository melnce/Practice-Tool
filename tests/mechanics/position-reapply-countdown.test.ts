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

const WORLD_OF_GAMES = "10503210";
const RESOLVE_MISTBLOOM = "10563210";
const ENGINE = "engine" as const;

function wogOutcome(player: "first" | "second") {
  const wog = getGraveyard(state, player).find((c) => c.id === WORLD_OF_GAMES);
  return {
    wogInGrave: !!wog,
    lwFired: !!(wog as any)?._lwFired,
    shadows: state.players[player].shadows,
    handLen: getHand(state, player).length,
  };
}

function resolvePendingFanfareTarget(
  player: "first" | "second",
  targetUid: string,
): void {
  engineDispatch(state, {
    type: "CHOOSE_TARGET",
    player,
    target: { type: "card", uid: targetUid },
  });
  if (state.pendingTargetEffect?.requiresConfirmation) {
    engineDispatch(state, { type: "CONFIRM_TARGETS" });
  }
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
});

describe("position re-apply countdown (World of Games unit)", () => {
  beforeEach(() => {
    resetUidCounter();
    _resetPositionStoreForTests();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("save mid fanfare prompt with pending death_lw → load → same graveyard, shadow, and draws", () => {
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

    // Same base cost (3) on field so playing Mistbloom advances WOG to 0.
    const costMate = createCard(RESOLVE_MISTBLOOM, "board", "first");
    applyKeywordsFromList(costMate);
    getBoard(state, "first").push(costMate);

    const enemy = createCard("10001110", "board", "second");
    enemy.peak_defense = Number(enemy.defense);
    getBoard(state, "second").push(enemy);

    const toPlay = createCard(RESOLVE_MISTBLOOM, "hand", "first");
    applyKeywordsFromList(toPlay);
    state.players.first.hand.push(toPlay);

    engineDispatch(state, {
      type: "PLAY_CARD",
      player: "first",
      cardUid: toPlay.uid,
    });

    expect(state.pendingTargetEffect).toBeDefined();
    expect(getResolutionQueue().some((item) => item.kind === "death_lw")).toBe(
      true,
    );
    expect(getBoard(state, "first").some((c) => c.uid === wog.uid)).toBe(false);
    expect(getGraveyard(state, "first").some((c) => c.uid === wog.uid)).toBe(
      false,
    );

    const saved = savePosition("wog-mid-prompt");
    expect((saved.state as any)._resolutionQueue?.length).toBeGreaterThan(0);

    resolvePendingFanfareTarget("first", enemy.uid);
    const afterFirst = wogOutcome("first");
    expect(afterFirst.wogInGrave).toBe(true);
    expect(afterFirst.lwFired).toBe(true);
    expect(afterFirst.shadows).toBe(1);
    expect(afterFirst.handLen).toBe(2);

    loadPosition(saved.id, { autoRender: false });
    expect(state.pendingTargetEffect).toBeDefined();
    expect(getResolutionQueue().some((item) => item.kind === "death_lw")).toBe(
      true,
    );

    resolvePendingFanfareTarget("first", enemy.uid);
    const afterSecond = wogOutcome("first");
    expect(afterSecond).toEqual(afterFirst);

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

    expect(getResolutionQueue().length).toBe(1);
    expect(getResolutionQueue()[0]?.kind).toBe("death_lw");

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
