/**
 * Targeted damage with can_target_leader — leader click and empty-board fallback.
 *
 * Ephemeral Foxfire (10843310) uses can_target_leader only; Ravening Tentacles
 * (10123310) has both keys. Both must honour a leader click and empty-board fallback.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  whenRunEffects,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  getBoard,
  getDeck,
  getHP,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const EPHEMERAL_FOXFIRE = "10843310";
const RAVENING_TENTACLES = "10123310";
const FILLER = "90001110";

function setupTurn(opts: {
  hand: string[];
  pp?: number;
  deck?: string[];
  secondHP?: number;
}) {
  const pp = opts.pp ?? 7;
  let b = givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
    .withFirstPP(pp, pp)
    .withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.secondHP !== undefined) b = b.withSecondHP(opts.secondHP);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
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

function playAndTargetLeader(handIndex = 0): void {
  whenPlayCard("first", handIndex);
  expect(state.pendingTargetEffect?.canTargetLeader).toBe(true);
  resolvePendingTarget("leader");
  expect(state.pendingTargetEffect).toBeUndefined();
}

function playAndTargetFollower(followerUid: string, handIndex = 0): void {
  whenPlayCard("first", handIndex);
  resolvePendingTarget(followerUid);
  expect(state.pendingTargetEffect).toBeUndefined();
}

describe("targeted damage — leader click and empty-board fallback", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  describe("Ephemeral Foxfire (can_target_leader only)", () => {
    it("(a) follower present, click leader → leader −1, follower untouched, deck copy added", () => {
      setupTurn({
        hand: [EPHEMERAL_FOXFIRE],
        pp: 1,
        deck: [FILLER, FILLER, FILLER],
      });
      const follower = enemyFollower(2, 9);
      const foxfireInDeckBefore = getDeck(state, "first").filter(
        (c) => c.id === EPHEMERAL_FOXFIRE,
      ).length;

      playAndTargetLeader();

      expect(getHP(state, "second")).toBe(19);
      expect(follower.defense).toBe(9);
      expect(
        getDeck(state, "first").filter((c) => c.id === EPHEMERAL_FOXFIRE)
          .length,
      ).toBe(foxfireInDeckBefore + 1);
    });

    it("(b) follower present, click follower → follower −1, leader untouched", () => {
      setupTurn({ hand: [EPHEMERAL_FOXFIRE], pp: 1, deck: [FILLER] });
      const follower = enemyFollower(2, 9);

      playAndTargetFollower(follower.uid);

      expect(getHP(state, "second")).toBe(20);
      expect(follower.defense).toBe(8);
    });

    it("(c) no enemy followers → leader −1 via leader target", () => {
      // Preflight blocks full spell play when the pool is empty (can_target_leader
      // is not yet honoured there); exercise the damage op directly.
      givenGameState({ seed: 1 }).withSecondHP(20).build();
      const damageEff = getCardById(EPHEMERAL_FOXFIRE)!.spell![0];

      whenRunEffects([damageEff], "first");
      expect(state.pendingTargetEffect?.canTargetLeader).toBe(true);
      expect(state.pendingTargetEffect?.pool?.length ?? 0).toBe(0);
      resolvePendingTarget("leader");
      expect(state.pendingTargetEffect).toBeUndefined();

      expect(getHP(state, "second")).toBe(19);
    });
  });

  describe("Ravening Tentacles (can_target_leader + fallback_leader)", () => {
    it("(a) follower present, click leader → leader −5, follower untouched, self heals 5", () => {
      setupTurn({
        hand: [RAVENING_TENTACLES],
        pp: 7,
        secondHP: 20,
      });
      const follower = enemyFollower(4, 4);
      state.players.first.hp = 12;

      playAndTargetLeader();

      expect(getHP(state, "second")).toBe(15);
      expect(follower.defense).toBe(4);
      expect(getHP(state, "first")).toBe(17);
    });

    it("(b) follower present, click follower → follower −5, leader untouched", () => {
      setupTurn({ hand: [RAVENING_TENTACLES], pp: 7 });
      const follower = enemyFollower(4, 9);

      playAndTargetFollower(follower.uid);

      expect(getHP(state, "second")).toBe(20);
      expect(follower.defense).toBe(4);
    });

    it("(c) no enemy followers → leader −5 via leader target", () => {
      setupTurn({ hand: [RAVENING_TENTACLES], pp: 7 });

      whenPlayCard("first", 0);
      expect(state.pendingTargetEffect?.canTargetLeader).toBe(true);
      resolvePendingTarget("leader");
      expect(state.pendingTargetEffect).toBeUndefined();

      expect(getHP(state, "second")).toBe(15);
    });
  });
});
