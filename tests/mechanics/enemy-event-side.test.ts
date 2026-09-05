/**
 * enemy_* trigger events: activePlayer must be the acting side (entering/leaving
 * follower's owner), not the listener side. See process.ts ally_/enemy_ filters.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  whenRunEffects,
  createCard,
  findOnBoard,
  thenBoard,
  thenHand,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { hasKeyword } from "../../src/logic/core/keywords/has.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const TRAP = "10911210";
const FAIRY = "90011110";
const AIZEDEN = "10974120";

function trapOnFirstSecondPlaysVanilla() {
  givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
    .withFirstPP(3, 6)
    .withFirstHand([TRAP])
    .withSecondPP(1, 6)
    .withSecondHand([FAIRY])
    .build();
  state.gameStarted = true;
  state.phase = "main";
  whenPlayCard("first", 0);
  whenEndTurn();
  whenPlayCard("second", 0);
}

describe("enemy_* event activePlayer convention", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
  });

  describe("enemy_follower_enter", () => {
    it("play path: Trap in the Woods destroys enemy follower and itself", () => {
      trapOnFirstSecondPlaysVanilla();
      expect(thenBoard("second").length).toBe(0);
      expect(findOnBoard("first", "Trap in the Woods")).toBeFalsy();
    });

    it("fanfare summon path: Trap destroys summoned enemy follower and itself", () => {
      givenGameState({ seed: 42, activePlayer: "first", roundCount: 8 })
        .withFirstPP(7, 8)
        .withFirstHand([AIZEDEN])
        .withSecondBoard([TRAP])
        .build();
      whenPlayCard("first", 0);
      expect(
        thenBoard("first").some((c) => c.name === "Warden of the Trigger"),
      ).toBe(false);
      expect(findOnBoard("second", "Trap in the Woods")).toBeFalsy();
    });

    it("chain summon path: Trap destroys chain-spawned enemy follower and itself", () => {
      givenGameState({ seed: 42, activePlayer: "first", roundCount: 10 })
        .withFirstBoard([
          { name: "Seed", type: "Follower", attack: 3, defense: 3 },
        ])
        .withSecondBoard([TRAP])
        .build();
      const seed = findOnBoard("first", "Seed")!;
      whenRunEffects(
        [{ op: "summon", source: "self", mode: "chain_fill" }],
        "first",
        seed,
      );
      expect(thenBoard("first").length).toBe(1);
      expect(findOnBoard("second", "Trap in the Woods")).toBeFalsy();
    });

    it("last words summon path: Trap destroys LW-summoned enemy follower and itself", () => {
      givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
        .withFirstPP(3, 6)
        .withFirstHand([TRAP])
        .withSecondBoard([
          {
            name: "LW Summoner",
            type: "Follower",
            cost: 2,
            attack: 1,
            defense: 1,
            hasLastWords: true,
            lastWordsEffects: [
              {
                op: "summon",
                source: "named",
                name: "Fairy",
                count: 1,
                owner: "ally",
              },
            ],
          },
        ])
        .build();
      whenPlayCard("first", 0);
      whenRunEffects(
        [{ op: "destroy", target: "enemy:follower" }],
        "first",
        null,
      );
      expect(thenBoard("first").length).toBe(0);
      expect(findOnBoard("first", "Trap in the Woods")).toBeFalsy();
    });
  });

  describe("enemy_follower_leaves_field", () => {
    it("bounce path: observer on listener side draws when enemy follower bounces", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "LeaveWatcher",
            type: "Follower",
            attack: 1,
            defense: 1,
            triggers: [
              {
                event: "enemy_follower_leaves_field",
                source: "board",
                effects: [{ op: "draw", source: "deck", count: 1 }],
              },
            ],
          },
        ])
        .withSecondBoard([
          { name: "BounceTarget", type: "Follower", attack: 2, defense: 2 },
        ])
        .withFirstDeck([{ name: "Drawn", type: "Follower", cost: 1 }])
        .build();
      const handBefore = thenHand("first").length;
      whenRunEffects(
        [
          {
            op: "return",
            destination: "hand",
            target: "enemy:follower",
          },
        ],
        "first",
      );
      expect(thenHand("first").length).toBe(handBefore + 1);
    });

    it("banish-on-death path: observer draws when enemy follower banishes on death", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "BanishWatcher",
            type: "Follower",
            attack: 1,
            defense: 1,
            triggers: [
              {
                event: "enemy_follower_leaves_field",
                source: "board",
                effects: [{ op: "draw", source: "deck", count: 1 }],
              },
            ],
          },
        ])
        .withSecondBoard([
          {
            name: "BanishOnDeath",
            type: "Follower",
            attack: 2,
            defense: 2,
            keywordState: { banishOnDeath: true },
          },
        ])
        .withFirstDeck([{ name: "Drawn", type: "Follower", cost: 1 }])
        .build();
      const handBefore = thenHand("first").length;
      whenRunEffects(
        [{ op: "destroy", target: "enemy:follower" }],
        "first",
        null,
      );
      expect(thenHand("first").length).toBe(handBefore + 1);
    });

    it("banish primitive path: observer draws when enemy follower is banished", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "BanishWatcher",
            type: "Follower",
            attack: 1,
            defense: 1,
            triggers: [
              {
                event: "enemy_follower_leaves_field",
                source: "board",
                effects: [{ op: "draw", source: "deck", count: 1 }],
              },
            ],
          },
        ])
        .withSecondBoard([
          { name: "BanishTarget", type: "Follower", attack: 2, defense: 2 },
        ])
        .withFirstDeck([{ name: "Drawn", type: "Follower", cost: 1 }])
        .build();
      const handBefore = thenHand("first").length;
      whenRunEffects(
        [{ op: "banish", target: "enemy:follower" }],
        "first",
        null,
      );
      expect(thenHand("first").length).toBe(handBefore + 1);
    });
  });

  describe("enemy_super_evolve (already correct — regression pin)", () => {
    it("hand follower gains keyword when opponent super-evolves", () => {
      givenGameState({ seed: 1, activePlayer: "second", roundCount: 7 })
        .withFirstHand(["10302110"])
        .build();
      state.players.second.superEvoCharges = 1;
      state.players.second.evoCharges = 2;
      const foe = createCard(
        { name: "Foe", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "board",
        "second",
      );
      applyKeywordsFromList(foe);
      state.players.second.board = [foe];
      onEvolve(foe, "second", "super");
      const insp = thenHand("first").find(
        (c) => c.name === "Inspirational One",
      )!;
      expect(hasKeyword(insp, "Bane")).toBe(true);
    });
  });

  describe("enemy_follower_defense_down (already correct — regression pin)", () => {
    it("listener on opponent-of-debuffer side draws when enemy follower defense is reduced", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
        .withSecondBoard([
          {
            name: "DefenseWatcher",
            type: "Follower",
            attack: 1,
            defense: 1,
            triggers: [
              {
                event: "enemy_follower_defense_down",
                source: "board",
                effects: [{ op: "draw", source: "deck", count: 1 }],
              },
            ],
          },
          { name: "Target", type: "Follower", attack: 3, defense: 5 },
        ])
        .withSecondDeck([{ name: "Drawn", type: "Follower", cost: 1 }])
        .build();
      const handBefore = thenHand("second").length;
      whenRunEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "enemy:follower",
            defense: -1,
          },
        ],
        "first",
      );
      expect(thenHand("second").length).toBe(handBefore + 1);
    });
  });
});
