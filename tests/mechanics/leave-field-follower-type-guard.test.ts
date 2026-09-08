/**
 * Follower-leave events must fire only when the leaving card is a Follower.
 * Sites B (banish-on-death), C (banishCard), D (bounceToHand).
 *
 * Sabotage (manual): remove the isFollower guard from ONE site and re-run this
 * file — only that site's amulet case should fail; follower cases stay green.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  thenHand,
  whenRunEffects,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { bounceToHand } from "../../src/logic/effects/ops/bounce.js";
import { getHand } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const BAYLE = "10113130";

function allyLeaveWatcher(victimName: string) {
  return createCard(
    {
      name: "AllyLeaveWatcher",
      type: "Follower",
      cost: 2,
      attack: 1,
      defense: 1,
      triggers: [
        {
          event: "ally_follower_leaves_field",
          source: "board",
          condition: { name: victimName },
          effects: [{ op: "draw", source: "deck", count: 1 }],
        },
      ],
    },
    "board",
    "first",
  );
}

function enemyLeaveWatcher(victimName: string) {
  return createCard(
    {
      name: "EnemyLeaveWatcher",
      type: "Follower",
      cost: 2,
      attack: 1,
      defense: 1,
      triggers: [
        {
          event: "enemy_follower_leaves_field",
          source: "board",
          condition: { name: victimName },
          effects: [{ op: "draw", source: "deck", count: 1 }],
        },
      ],
    },
    "board",
    "first",
  );
}

describe("leave-field follower type guard", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstDeck([
        { name: "Drawn1", type: "Follower", cost: 1 },
        { name: "Drawn2", type: "Follower", cost: 1 },
        { name: "Drawn3", type: "Follower", cost: 1 },
        { name: "Drawn4", type: "Follower", cost: 1 },
      ])
      .build();
  });

  describe("site B — banish-on-death (cleanup.ts)", () => {
    it("amulet banished on death does NOT fire ally_follower_leaves_field", () => {
      const watcher = allyLeaveWatcher("CountAmulet");
      const amulet = createCard(
        {
          name: "CountAmulet",
          type: "Amulet",
          cost: 2,
          hasCountdown: true,
          countdown: 0,
          keywordState: { banishOnDeath: true },
        },
        "board",
        "first",
      );
      state.players.first.board = [watcher, amulet];

      const handBefore = thenHand("first").length;
      cleanupDead();
      // PRE (unguarded site B): handBefore + 1
      expect(thenHand("first").length).toBe(handBefore);
    });

    it("follower banished on death still fires ally_follower_leaves_field", () => {
      const watcher = allyLeaveWatcher("GhostAlly");
      const follower = createCard(
        {
          name: "GhostAlly",
          type: "Follower",
          attack: 2,
          defense: 0,
          keywordState: { banishOnDeath: true },
        },
        "board",
        "first",
      );
      state.players.first.board = [watcher, follower];

      const handBefore = thenHand("first").length;
      cleanupDead();
      expect(thenHand("first").length).toBe(handBefore + 1);
    });
  });

  describe("site C — banishCard (primitives.ts)", () => {
    it("banished amulet does NOT fire enemy_follower_leaves_field", () => {
      const watcher = enemyLeaveWatcher("HolyAmulet");
      state.players.first.board = [watcher];
      state.players.second.board = [
        createCard(
          { name: "HolyAmulet", type: "Amulet", cost: 2 },
          "board",
          "second",
        ),
      ];

      const handBefore = thenHand("first").length;
      whenRunEffects(
        [
          {
            op: "banish",
            target: "enemy:amulet",
            filter: { name: "HolyAmulet" },
          },
        ],
        "first",
        null,
      );
      // PRE (unguarded site C): handBefore + 1
      expect(thenHand("first").length).toBe(handBefore);
    });

    it("banished follower still fires enemy_follower_leaves_field", () => {
      const watcher = enemyLeaveWatcher("BanishFoe");
      state.players.first.board = [watcher];
      state.players.second.board = [
        createCard(
          { name: "BanishFoe", type: "Follower", attack: 2, defense: 2 },
          "board",
          "second",
        ),
      ];

      const handBefore = thenHand("first").length;
      whenRunEffects(
        [
          {
            op: "banish",
            target: "enemy:follower",
            filter: { name: "BanishFoe" },
          },
        ],
        "first",
        null,
      );
      expect(thenHand("first").length).toBe(handBefore + 1);
    });
  });

  describe("site D — bounceToHand (bounce.ts)", () => {
    it("bounced amulet does NOT fire ally_follower_leaves_field", () => {
      const watcher = allyLeaveWatcher("BounceAmulet");
      const amulet = createCard(
        { name: "BounceAmulet", type: "Amulet", cost: 2 },
        "board",
        "first",
      );
      state.players.first.board = [watcher, amulet];

      const handBefore = thenHand("first").length;
      bounceToHand(amulet);
      // PRE (unguarded site D): handBefore + 1 (plus bounced copy in hand)
      expect(thenHand("first").length).toBe(handBefore + 1);
    });

    it("bounced follower still fires ally_follower_leaves_field", () => {
      const watcher = allyLeaveWatcher("BounceAlly");
      const follower = createCard(
        { name: "BounceAlly", type: "Follower", attack: 2, defense: 2 },
        "board",
        "first",
      );
      state.players.first.board = [watcher, follower];

      const handBefore = thenHand("first").length;
      bounceToHand(follower);
      expect(thenHand("first").length).toBe(handBefore + 2);
    });
  });

  describe("10113130 Bayle, Luxglaive Warrior — real consumer", () => {
    it("bounced allied amulet does NOT reduce Bayle cost; bounced follower does", () => {
      const bayle = createCard(BAYLE, "hand", "first");
      const cost0 = Number(bayle.cost);
      const amulet = createCard(
        { name: "BayleAmulet", type: "Amulet", cost: 2 },
        "board",
        "first",
      );
      const follower = createCard(
        { name: "BayleAlly", type: "Follower", attack: 2, defense: 2 },
        "board",
        "first",
      );
      state.players.first.hand = [bayle];
      state.players.first.board = [amulet, follower];

      bounceToHand(amulet);
      expect(Number(bayle.cost)).toBe(cost0);

      bounceToHand(follower);
      expect(Number(bayle.cost)).toBe(Math.max(0, cost0 - 1));
    });
  });
});

describe("leave-field follower type guard — sabotage proof", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstDeck([{ name: "Drawn1", type: "Follower", cost: 1 }])
      .build();
  });

  it("site C unguarded would let amulet banish satisfy ally_follower_leaves_field", () => {
    const watcher = allyLeaveWatcher("SabAmulet");
    state.players.first.board = [watcher];
    state.players.first.board.push(
      createCard(
        { name: "SabAmulet", type: "Amulet", cost: 2 },
        "board",
        "first",
      ),
    );
    const handBefore = thenHand("first").length;
    whenRunEffects(
      [{ op: "banish", target: "ally:amulet", filter: { name: "SabAmulet" } }],
      "first",
      null,
    );
    // Sabotage (remove site C guard): expect(thenHand("first").length).toBe(handBefore + 1)
    expect(thenHand("first").length).toBe(handBefore);
  });
});
