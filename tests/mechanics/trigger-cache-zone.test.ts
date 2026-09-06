/**
 * Trigger candidate cache must reflect every zone move (board/hand/deck/banish).
 * Self-check in getOrderedTriggerCandidates (dev/VITEST) catches stale cache.
 *
 * Each zone-move test primes the cache inside one doAction (prime summon fires
 * ally_follower_enter while the watcher is still on board), performs the real
 * zone op, then probes with a second summon — all before commitAction bumps
 * actionSeq.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import type { CardInstance } from "../../src/core/types/index.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { doAction } from "../../src/core/history.js";
import { getBoard, getDeck, getHand } from "../../src/core/playerHelpers.js";
import { bounceToHand } from "../../src/logic/effects/ops/bounce.js";
import { summonFromHand } from "../../src/logic/effects/ops/summon_ops/hand.js";
import { transformTarget } from "../../src/logic/effects/ops/transform.js";
import { banishCard } from "../../src/logic/effects/ops/banish/primitives.js";
import { changeFollowerControl } from "../../src/logic/effects/ops/changeControl.js";
import { resolveReturnHandToDeck } from "../../src/logic/effects/ops/returnHandToDeck.js";
import { getOrderedTriggerCandidates } from "../../src/logic/core/triggers/utils.js";
import { fireTrigger } from "../../src/logic/core/triggers.js";
import { snapshotEnteringKeywords } from "../../src/logic/core/enterKeywords.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import "../../src/logic/core/effects/index.js";

const STALE_CACHE_RE = /\[Triggers\] stale trigger candidate cache/;

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

/** Fire ally_follower_enter without a zone splice (probe only — no summon bump). */
function fireAllyEnterProbe(card: CardInstance) {
  fireTrigger("ally_follower_enter", "first", {
    enteringCard: card,
    enteringOwner: "first",
    enteringKeywordSnapshot: snapshotEnteringKeywords(card),
  });
}

type ZoneProbeSetup = {
  watcher: CardInstance;
  primeUid: string;
  probeUid: string;
};

/**
 * Prime cache (watcher on board draws once), zone-move, probe summon — one action.
 * Asserts no extra draw and no stale-cache self-check throw.
 */
function expectZoneMoveDoesNotStaleBoardTriggerCache(
  setup: () => ZoneProbeSetup,
  move: (ctx: ZoneProbeSetup) => void,
) {
  const ctx = setup();
  const deckBefore = deckLen();

  let deckAfterPrime = 0;
  let deckBeforeProbe = 0;
  let deckAfterProbe = 0;

  expect(() => {
    doAction("trigger-cache zone probe", () => {
      summonAlly(ctx.primeUid);
      deckAfterPrime = deckLen();
      expect(deckAfterPrime).toBe(deckBefore - 1);

      move(ctx);

      deckBeforeProbe = deckLen();
      const probeCard = getHand(state, "first").find(
        (c) => c.uid === ctx.probeUid,
      )!;
      fireAllyEnterProbe(probeCard);
      deckAfterProbe = deckLen();
    });
  }).not.toThrow(STALE_CACHE_RE);

  expect(deckAfterProbe).toBe(deckBeforeProbe);
}

function boardWatcherSetup(): ZoneProbeSetup {
  const watcher = makeDrawWatcher();
  const prime = makeHandAlly("ally_prime");
  const probe = makeHandAlly("ally_probe");
  state.players.first.board = [watcher];
  state.players.first.hand = [prime, probe];
  return { watcher, primeUid: "ally_prime", probeUid: "ally_probe" };
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

  it("bounce: watcher in hand does not draw on ally enter (same action)", () => {
    givenGameState({ seed: 2 })
      .withFirstDeck([FILLER, FILLER, FILLER, FILLER, FILLER, FILLER])
      .build();

    expectZoneMoveDoesNotStaleBoardTriggerCache(
      boardWatcherSetup,
      ({ watcher }) => {
        bounceToHand(watcher);
        expect(
          getHand(state, "first").some((c) => c.name === "DrawWatcher"),
        ).toBe(true);
      },
    );
  });

  it("return to deck: watcher in deck does not draw on ally enter (same action)", () => {
    givenGameState({ seed: 3 })
      .withFirstDeck([FILLER, FILLER, FILLER, FILLER, FILLER, FILLER])
      .build();

    expectZoneMoveDoesNotStaleBoardTriggerCache(
      boardWatcherSetup,
      ({ watcher }) => {
        bounceToHand(watcher);
        const inHand = getHand(state, "first").find(
          (c) => c.name === "DrawWatcher",
        );
        expect(inHand).toBeDefined();
        resolveReturnHandToDeck(inHand!, "first");
        expect(
          getDeck(state, "first").some((c) => c.name === "DrawWatcher"),
        ).toBe(true);
      },
    );
  });

  it("transform: replaced board follower does not draw on ally enter (same action)", () => {
    givenGameState({ seed: 4 })
      .withFirstDeck([FILLER, FILLER, FILLER, FILLER, FILLER, FILLER])
      .build();

    expectZoneMoveDoesNotStaleBoardTriggerCache(
      boardWatcherSetup,
      ({ watcher }) => {
        transformTarget(watcher, "Goblin");
        expect(getBoard(state, "first")[0]?.name).toBe("Goblin");
      },
    );
  });

  it("banish: banished watcher does not draw on ally enter (same action)", () => {
    givenGameState({ seed: 5 })
      .withFirstDeck([FILLER, FILLER, FILLER, FILLER, FILLER, FILLER])
      .build();

    expectZoneMoveDoesNotStaleBoardTriggerCache(
      boardWatcherSetup,
      ({ watcher }) => {
        banishCard(watcher);
      },
    );
  });

  it("control change: watcher on enemy board does not draw for original owner ally enter (same action)", () => {
    givenGameState({ seed: 6 })
      .withFirstDeck([FILLER, FILLER, FILLER, FILLER, FILLER, FILLER])
      .build();

    expectZoneMoveDoesNotStaleBoardTriggerCache(
      () => {
        const ctx = boardWatcherSetup();
        state.players.second.board = [];
        return ctx;
      },
      ({ watcher }) => {
        changeFollowerControl(watcher, "second");
        expect(watcher.owner).toBe("second");
      },
    );
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

    expect(() => getOrderedTriggerCandidates("first")).toThrow(STALE_CACHE_RE);
  });
});
