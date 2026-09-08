/**
 * Leave-field triggers (banish / banish-on-death / bounce) must pass
 * `{ leavingOwner, leavingCard }` so condition checks and §317 self-exclusion apply.
 *
 * enemy-event-side.test.ts:133/169/206 only use condition-free observers — they
 * cannot catch missing context.
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
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { getHand } from "../../src/core/playerHelpers.js";
import { bounceToHand } from "../../src/logic/effects/ops/bounce.js";
import "../../src/logic/core/effects/index.js";

function nameConditionWatcher(
  victimName: string,
  watcherOwner: "first" | "second" = "first",
) {
  return createCard(
    {
      name: "ConditionWatcher",
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
    watcherOwner,
  );
}

describe("leave-field trigger context — conditioned observers", () => {
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

  describe("bounce path (site D)", () => {
    it("draws only when the bounced follower matches condition.name", () => {
      const watcher = nameConditionWatcher("MatchMe");
      state.players.first.board = [watcher];
      state.players.second.board = [
        createCard(
          { name: "MatchMe", type: "Follower", attack: 2, defense: 2 },
          "board",
          "second",
        ),
        createCard(
          { name: "OtherGuy", type: "Follower", attack: 2, defense: 2 },
          "board",
          "second",
        ),
      ];

      const handBefore = thenHand("first").length;
      whenRunEffects(
        [
          {
            op: "return",
            destination: "hand",
            target: "enemy:follower",
            filter: { name: "MatchMe" },
          },
        ],
        "first",
      );
      expect(thenHand("first").length).toBe(handBefore + 1);

      const handAfterMatch = thenHand("first").length;
      whenRunEffects(
        [
          {
            op: "return",
            destination: "hand",
            target: "enemy:follower",
            filter: { name: "OtherGuy" },
          },
        ],
        "first",
      );
      expect(thenHand("first").length).toBe(handAfterMatch);
    });
  });

  describe("banish-on-death path (site B)", () => {
    it("draws when the banished-on-death follower matches condition.name", () => {
      const watcher = nameConditionWatcher("GhostMatch");
      const ghostMatch = createCard(
        {
          name: "GhostMatch",
          type: "Follower",
          attack: 2,
          defense: 0,
          keywordState: { banishOnDeath: true },
        },
        "board",
        "second",
      );
      state.players.first.board = [watcher];
      state.players.second.board = [ghostMatch];

      const handBefore = thenHand("first").length;
      cleanupDead();
      expect(thenHand("first").length).toBe(handBefore + 1);
    });

    it("does not draw when a different banished-on-death follower leaves", () => {
      const watcher = nameConditionWatcher("GhostMatch");
      const ghostOther = createCard(
        {
          name: "GhostOther",
          type: "Follower",
          attack: 2,
          defense: 0,
          keywordState: { banishOnDeath: true },
        },
        "board",
        "second",
      );
      state.players.first.board = [watcher];
      state.players.second.board = [ghostOther];

      const handBefore = thenHand("first").length;
      cleanupDead();
      expect(thenHand("first").length).toBe(handBefore);
    });
  });

  describe("banish primitive path (site C)", () => {
    it("draws only when the banished follower matches condition.name", () => {
      const watcher = nameConditionWatcher("BanishMe");
      state.players.first.board = [watcher];
      state.players.second.board = [
        createCard(
          { name: "BanishMe", type: "Follower", attack: 2, defense: 2 },
          "board",
          "second",
        ),
        createCard(
          { name: "KeepMe", type: "Follower", attack: 2, defense: 2 },
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
            filter: { name: "BanishMe" },
          },
        ],
        "first",
        null,
      );
      expect(thenHand("first").length).toBe(handBefore + 1);

      const handAfterMatch = thenHand("first").length;
      whenRunEffects(
        [
          {
            op: "banish",
            target: "enemy:follower",
            filter: { name: "KeepMe" },
          },
        ],
        "first",
        null,
      );
      expect(thenHand("first").length).toBe(handAfterMatch);
    });
  });

  describe("§317 self-exclusion — bounce path (direct bounceToHand, sync dispatch)", () => {
    it("leaving follower does not observe its own leave", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withSecondDeck([{ name: "DeckCard", type: "Follower", cost: 1 }])
        .build();
      const selfWatcher = createCard(
        {
          name: "SelfBouncer",
          type: "Follower",
          cost: 2,
          attack: 1,
          defense: 1,
          triggers: [
            {
              event: "ally_follower_leaves_field",
              source: "board",
              effects: [{ op: "draw", source: "deck", count: 1 }],
            },
          ],
        },
        "board",
        "second",
      );
      state.players.second.board = [selfWatcher];

      bounceToHand(selfWatcher);
      expect(getHand(state, "second").length).toBe(1);
      expect(getHand(state, "second").some((c) => c.name === "DeckCard")).toBe(
        false,
      );
    });
  });

  describe("probe — amulet banish raises follower leave event (site C, no type guard)", () => {
    it("documents current behaviour: banishing an amulet satisfies a name-matched leave watcher", () => {
      const watcher = nameConditionWatcher("HolyAmulet");
      const amulet = createCard(
        { name: "HolyAmulet", type: "Amulet", cost: 2 },
        "board",
        "second",
      );
      state.players.first.board = [watcher];
      state.players.second.board = [amulet];

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
      // Site A (destroy) is gated by isFollower; sites B/C/D are not.
      expect(thenHand("first").length).toBe(handBefore + 1);
    });
  });
});
