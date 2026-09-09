/**
 * Engage-sacrifice and engage-countdown amulet removal must raise ally_amulet_destroyed
 * and recordDestroyed exactly once — same path as destroyTarget / cleanupDead.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { destroyTarget } from "../../src/logic/effects/ops/destroy/primitives.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  bootstrapFaithForPlayer,
  faithCrestNameForCard,
} from "../../src/logic/faith/bootstrap.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  expireCountdownForLastWords,
  killFollowerForLastWords,
} from "../harness/l2Dispatch.js";
import { getBoard, getCrests, getHP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const OMERIO = "10964120";
const LYANTHOTH = "10664120";
const DETECTIVES_LENS = "10001210";
const SERENE_SANCTUARY = "10161210";

const R5 = 5;
const R8 = 8;

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number } = {},
): void {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 42,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function enemyFollower(atk: number, def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  getBoard(state, "second").push(c);
  return c;
}

function grantLyanthothFaith(owner: "first" | "second" = "first"): void {
  const lyan = getCardById(LYANTHOTH)!;
  state.players[owner].deck.push({
    ...lyan,
    uid: state.rng.makeUid(),
  } as any);
  bootstrapFaithForPlayer(
    owner,
    state.players[owner].deck,
    state.players[owner].hand,
  );
}

function makeAmuletDestroyWatcher(name = "AmuletPin") {
  const watcher = createCard(
    {
      name,
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      counters: { amulet_destroyed: 0 },
      triggers: [
        {
          event: "ally_amulet_destroyed",
          source: "board",
          effects: [
            {
              op: "counter",
              action: "add",
              key: "amulet_destroyed",
              amount: 1,
            },
          ],
        },
      ],
    },
    "board",
    "first",
  );
  applyKeywordsFromList(watcher);
  getBoard(state, "first").push(watcher);
  return watcher;
}

function makeFollowerLeaveWatcher(name = "LeavePin") {
  const watcher = createCard(
    {
      name,
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      counters: { follower_left: 0 },
      triggers: [
        {
          event: "ally_follower_leaves_field",
          source: "board",
          effects: [
            {
              op: "counter",
              action: "add",
              key: "follower_left",
              amount: 1,
            },
          ],
        },
      ],
    },
    "board",
    "first",
  );
  applyKeywordsFromList(watcher);
  getBoard(state, "first").push(watcher);
  return watcher;
}

function engageSacrificeLens(): void {
  const lens = findOnBoard("first", "Detective's Lens")!;
  engageAmulet("first", state.players.first.board.indexOf(lens));
}

describe("Engage amulet destruction raises ally_amulet_destroyed", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  it("Omerio — engaging sacrifice amulet advances sequence step 1 (2 foes damaged)", () => {
    setupTurn(R8, { hand: [OMERIO], pp: 10 });
    const foes = [enemyFollower(2, 6, "F1"), enemyFollower(2, 6, "F2")];
    const defBefore = foes.reduce((s, f) => s + Number(f.defense), 0);

    whenPlayCard("first", 0);
    const fodder = createCard(
      {
        name: "Sacrifice Fodder",
        type: "Amulet",
        cost: 1,
        hasEngage: true,
        engageSacrifice: true,
        engageCost: 0,
        engageEffects: [],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(fodder);
    getBoard(state, "first").push(fodder);
    engageAmulet("first", state.players.first.board.indexOf(fodder));

    expect(findOnBoard("first", "Sacrifice Fodder")).toBeUndefined();
    const defAfter = foes.reduce((s, f) => s + Number(f.defense), 0);
    // Step 1 deals 3 to two random enemy followers — both F1 and F2 should be hit.
    expect(defBefore - defAfter).toBe(6);
  }, 60_000);

  it("Lyanthoth Faith — engaging sacrifice amulet increases faith by 1", () => {
    setupTurn(R5, { hand: [DETECTIVES_LENS], pp: 5 });
    grantLyanthothFaith();
    const crestName = faithCrestNameForCard("Lyanthoth, Eld Tome");
    const crest = getCrests(state, "first").find((c) => c.name === crestName);
    expect(crest?.counters?.faith ?? 0).toBe(0);

    whenPlayCard("first", 0);
    engageSacrificeLens();

    const updated = getCrests(state, "first").find((c) => c.name === crestName);
    expect(updated?.counters?.faith ?? 0).toBe(1);
  }, 60_000);

  it("engage-sacrifice fires ally_amulet_destroyed exactly once", () => {
    setupTurn(R5, { hand: [DETECTIVES_LENS], pp: 5 });
    const watcher = makeAmuletDestroyWatcher();
    whenPlayCard("first", 0);
    engageSacrificeLens();
    expect(watcher.counters?.amulet_destroyed ?? 0).toBe(1);
  }, 60_000);

  it("countdown at 0 after engage (engage.ts expiry path) fires ally_amulet_destroyed exactly once", () => {
    setupTurn(R5, { pp: 5 });
    const watcher = makeAmuletDestroyWatcher();
    // Engage with no countdown-advance effect: expiry is handled only by engage.ts
    // post-effects check (removeWithLastWords on origin/main), not countdown op cleanup.
    const amulet = createCard(
      {
        name: "ZeroCD Engage",
        type: "Amulet",
        cost: 1,
        hasCountdown: true,
        countdown: 0,
        hasEngage: true,
        engageCost: 0,
        engageEffects: [],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(amulet);
    getBoard(state, "first").push(amulet);
    engageAmulet("first", state.players.first.board.indexOf(amulet));
    expect(watcher.counters?.amulet_destroyed ?? 0).toBe(1);
    expect(findOnBoard("first", "ZeroCD Engage")).toBeUndefined();
  }, 60_000);

  it("engage-sacrifice records destroyedHistory entry", () => {
    setupTurn(R5, { hand: [DETECTIVES_LENS], pp: 5 });
    whenPlayCard("first", 0);
    const lens = findOnBoard("first", "Detective's Lens")!;
    engageSacrificeLens();
    const history = state.players.first.destroyedHistory ?? [];
    expect(history.some((r) => r.uid === lens.uid)).toBe(true);
  }, 60_000);

  describe("regression — ordinary destruction still fires exactly once", () => {
    it("destroy op", () => {
      setupTurn(R5, { pp: 5 });
      const watcher = makeAmuletDestroyWatcher();
      const amulet = createCard(
        { name: "Fodder", type: "Amulet", cost: 1 },
        "board",
        "first",
      );
      applyKeywordsFromList(amulet);
      getBoard(state, "first").push(amulet);
      destroyTarget(amulet, "first");
      cleanupDead();
      expect(watcher.counters?.amulet_destroyed ?? 0).toBe(1);
    }, 60_000);

    it("countdown expiry via cleanupDead (turn-start path)", () => {
      setupTurn(R5, { hand: [SERENE_SANCTUARY], pp: 5 });
      const watcher = makeAmuletDestroyWatcher();
      whenPlayCard("first", 0);
      const sanctuary = findOnBoard("first", "Serene Sanctuary")!;
      expireCountdownForLastWords(sanctuary, "first");
      expect(watcher.counters?.amulet_destroyed ?? 0).toBe(1);
    }, 60_000);
  });

  describe("follower-leave negative with positive control", () => {
    it("amulet engage-sacrifice does not raise ally_follower_leaves_field", () => {
      setupTurn(R5, { hand: [DETECTIVES_LENS], pp: 5 });
      const amuletWatcher = makeAmuletDestroyWatcher("AmuletPin");
      const leaveWatcher = makeFollowerLeaveWatcher("LeavePin");
      whenPlayCard("first", 0);
      engageSacrificeLens();
      expect(amuletWatcher.counters?.amulet_destroyed ?? 0).toBe(1);
      expect(leaveWatcher.counters?.follower_left ?? 0).toBe(0);
    }, 60_000);

    it("follower death raises ally_follower_leaves_field (detector works)", () => {
      setupTurn(R5, { pp: 5 });
      const leaveWatcher = makeFollowerLeaveWatcher();
      const fodder = createCard(
        {
          name: "FodderFollower",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
        "board",
        "first",
      );
      fodder.peak_defense = 1;
      getBoard(state, "first").push(fodder);
      killFollowerForLastWords(fodder, "first");
      expect(leaveWatcher.counters?.follower_left ?? 0).toBe(1);
    }, 60_000);
  });
});
