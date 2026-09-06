/**
 * Trigger candidate cache must reflect every zone move (board/hand/deck/banish).
 * Self-check in getOrderedTriggerCandidates (dev/VITEST) catches stale cache.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import type { CardInstance } from "../../src/core/types/index.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getBoard, getDeck, getHand } from "../../src/core/playerHelpers.js";
import { bounceToHand } from "../../src/logic/effects/ops/bounce.js";
import { summonFromHand } from "../../src/logic/effects/ops/summon_ops/hand.js";
import { transformTarget } from "../../src/logic/effects/ops/transform.js";
import { banishCard } from "../../src/logic/effects/ops/banish/primitives.js";
import { changeFollowerControl } from "../../src/logic/effects/ops/changeControl.js";
import { resolveReturnHandToDeck } from "../../src/logic/effects/ops/returnHandToDeck.js";
import { getOrderedTriggerCandidates } from "../../src/logic/core/triggers/utils.js";
import { bumpActionSeq } from "../../src/core/actionSeq.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { whenPlayCard } from "../harness/builders.js";
import "../../src/logic/core/effects/index.js";

const FILLER = "10102110";
const BUG_ALERT = "10012310";
const MANAMEL = "10411120";

function makeDrawWatcher(zone: "board" | "hand" = "board", uid = "watcher") {
  return createCard(
    {
      name: "DrawWatcher",
      type: "Follower",
      cost: 2,
      attack: 1,
      defense: 2,
      uid,
      triggers: [
        {
          event: "ally_follower_enter",
          source: "board",
          effects: [{ op: "draw", count: 1 }],
        },
      ],
    },
    zone,
    "first",
  );
}

function makeHandAlly(uid: string) {
  return createCard(
    {
      name: "SummonAlly",
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      uid,
    },
    "hand",
    "first",
  );
}

function deckLen() {
  return getDeck(state, "first").length;
}

function summonAlly(uid: string) {
  const ally = getHand(state, "first").find((c) => c.uid === uid);
  expect(ally).toBeDefined();
  summonFromHand(ally!, "first");
}

describe("trigger candidate cache zone invalidation", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    (state as any).zoneVersion = 0;
    (state as any).actionSeq = 0;
    (state as any)._triggerCache = null;
  });

  it("baseline: board watcher draws when an ally enters", () => {
    givenGameState({ seed: 1 })
      .withFirstDeck([FILLER, FILLER, FILLER, FILLER, FILLER])
      .build();

    const watcher = makeDrawWatcher();
    const ally = makeHandAlly("ally1");
    state.players.first.board = [watcher];
    state.players.first.hand = [ally];

    const before = deckLen();
    summonAlly("ally1");
    expect(deckLen()).toBe(before - 1);
  });

  it("bounce: watcher in hand does not draw on ally enter (same action + next)", () => {
    givenGameState({ seed: 2 })
      .withFirstDeck([FILLER, FILLER, FILLER, FILLER, FILLER, FILLER])
      .build();

    const watcher = makeDrawWatcher();
    const ally1 = makeHandAlly("ally1");
    const ally2 = makeHandAlly("ally2");
    state.players.first.board = [watcher];
    state.players.first.hand = [ally1, ally2];

    bounceToHand(watcher);
    expect(getHand(state, "first").some((c) => c.name === "DrawWatcher")).toBe(
      true,
    );

    const before = deckLen();
    summonAlly("ally1");
    expect(deckLen()).toBe(before);

    bumpActionSeq();
    summonAlly("ally2");
    expect(deckLen()).toBe(before);
  });

  it("return to deck: watcher in deck does not draw on ally enter", () => {
    givenGameState({ seed: 3 })
      .withFirstDeck([FILLER, FILLER, FILLER, FILLER, FILLER, FILLER])
      .build();

    const watcher = makeDrawWatcher("hand", "watcher_deck");
    const ally = makeHandAlly("ally1");
    state.players.first.hand = [watcher, ally];

    resolveReturnHandToDeck(watcher, "first");
    expect(getDeck(state, "first").some((c) => c.uid === "watcher_deck")).toBe(
      true,
    );

    const before = deckLen();
    summonAlly("ally1");
    expect(deckLen()).toBe(before);

    bumpActionSeq();
    const ally2 = makeHandAlly("ally2");
    state.players.first.hand.push(ally2);
    summonAlly("ally2");
    expect(deckLen()).toBe(before);
  });

  it("transform: replaced board follower does not draw on ally enter", () => {
    givenGameState({ seed: 4 })
      .withFirstDeck([FILLER, FILLER, FILLER, FILLER, FILLER, FILLER])
      .build();

    const watcher = makeDrawWatcher();
    const ally = makeHandAlly("ally1");
    state.players.first.board = [watcher];
    state.players.first.hand = [ally];

    transformTarget(watcher, "Goblin");
    expect(getBoard(state, "first")[0]?.name).toBe("Goblin");

    const before = deckLen();
    summonAlly("ally1");
    expect(deckLen()).toBe(before);
  });

  it("banish: banished watcher does not draw on ally enter", () => {
    givenGameState({ seed: 5 })
      .withFirstDeck([FILLER, FILLER, FILLER, FILLER, FILLER, FILLER])
      .build();

    const watcher = makeDrawWatcher();
    const ally = makeHandAlly("ally1");
    state.players.first.board = [watcher];
    state.players.first.hand = [ally];

    banishCard(watcher);
    const before = deckLen();
    summonAlly("ally1");
    expect(deckLen()).toBe(before);
  });

  it("control change: watcher on enemy board does not draw for original owner ally enter", () => {
    givenGameState({ seed: 6 })
      .withFirstDeck([FILLER, FILLER, FILLER, FILLER, FILLER, FILLER])
      .build();

    const watcher = makeDrawWatcher();
    const ally = makeHandAlly("ally1");
    state.players.first.board = [watcher];
    state.players.first.hand = [ally];
    state.players.second.board = [];

    changeFollowerControl(watcher, "second");
    expect(watcher.owner).toBe("second");

    const before = deckLen();
    summonAlly("ally1");
    expect(deckLen()).toBe(before);
  });

  it("Manamel bounce: END_TURN does not evolve from stale trigger cache", () => {
    givenGameState({ seed: 7, activePlayer: "second", roundCount: 6 })
      .withSecondHand([BUG_ALERT])
      .withSecondPP(10, 10)
      .build();
    state.players.second.evoCount = 1;

    const manamel = createCard(MANAMEL, "board", "second");
    manamel.peak_defense = manamel.defense;
    manamel.justPlayed = false;
    manamel.uid = "manamel_board";
    state.players.second.board = [manamel];
    state.players.first.board = [
      createCard(
        { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 5 },
        "board",
        "first",
      ),
    ];

    whenPlayCard("second", 0);
    resolvePendingTarget("manamel_board");

    const evoBefore = state.players.second.evoCount;
    engineDispatch(state, { type: "END_TURN" });
    expect(state.players.second.evoCount).toBe(evoBefore);
  });

  it("self-check throws when zone moves without bumpZoneVersion", () => {
    givenGameState({ seed: 8 }).build();
    const watcher = makeDrawWatcher();
    state.players.first.board = [watcher];

    getOrderedTriggerCandidates("first");

    const board = getBoard(state, "first");
    const hand = getHand(state, "first");
    board.splice(0, 1);
    hand.push(watcher);
    watcher.zone = "hand";

    expect(() => getOrderedTriggerCandidates("first")).toThrow(
      /\[Triggers\] stale trigger candidate cache/,
    );
  });
});
