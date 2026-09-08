/**
 * Board-route filter gaps: transform and banish must honour object `filter`
 * (e.g. filter:{name:"LeaveVictim"}) when targeting ally:follower on board.
 * Deck-route regressions pin the already-working paths.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenBoard,
  thenDeck,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getBanish, getDeck } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

function allyFollower(name: string, atk = 2, def = 2) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function allyAmulet(name: string) {
  const c = createCard({ name, type: "Amulet", cost: 2 }, "board", "first");
  state.players.first.board.push(c);
  return c;
}

describe("board-route object filters", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    givenGameState({ seed: 1, activePlayer: "first" }).build();
  });

  describe("transform board route", () => {
    it("transforms only the named follower when filter.name is set", () => {
      allyFollower("LeaveVictim");
      allyFollower("Bystander");

      whenRunEffects(
        [
          {
            op: "transform",
            target: "ally:follower",
            filter: { name: "LeaveVictim" },
            into: "Goblin",
          },
        ],
        "first",
      );

      expect(findOnBoard("first", "Bystander")).toBeTruthy();
      expect(findOnBoard("first", "LeaveVictim")).toBeFalsy();
      expect(findOnBoard("first", "Goblin")).toBeTruthy();
      expect(thenBoard("first").filter((c) => c.name === "Goblin").length).toBe(
        1,
      );
    });
  });

  describe("banish board route", () => {
    it("banishes only the named follower when filter.name is set", () => {
      const victim = allyFollower("LeaveVictim");
      const bystander = allyFollower("Bystander");

      whenRunEffects(
        [
          {
            op: "banish",
            target: "ally:follower",
            filter: { name: "LeaveVictim" },
          },
        ],
        "first",
      );

      expect(findOnBoard("first", "Bystander")).toBeTruthy();
      expect(findOnBoard("first", "LeaveVictim")).toBeFalsy();
      expect(thenBoard("first").length).toBe(1);
      expect(bystander.uid).toBe(findOnBoard("first", "Bystander")!.uid);
      expect(getBanish(state, "first").some((c) => c.uid === victim.uid)).toBe(
        true,
      );
    });

    it("banishes only cards matching filter.type when follower and amulet share the pool", () => {
      const follower = allyFollower("BoardFollower");
      const amulet = allyAmulet("BoardAmulet");

      whenRunEffects(
        [
          {
            op: "banish",
            target: "ally:any",
            filter: { type: "Amulet" },
          },
        ],
        "first",
      );

      expect(findOnBoard("first", "BoardFollower")).toBeTruthy();
      expect(findOnBoard("first", "BoardAmulet")).toBeFalsy();
      expect(thenBoard("first").length).toBe(1);
      expect(follower.uid).toBe(findOnBoard("first", "BoardFollower")!.uid);
      expect(getBanish(state, "first").some((c) => c.uid === amulet.uid)).toBe(
        true,
      );
    });
  });

  describe("deck-route regressions", () => {
    it("transform deck route honours filter.name with two cards in deck", () => {
      const deck = getDeck(state, "first");
      deck.length = 0;
      const victim = createCard(
        { name: "LeaveVictim", type: "Follower", cost: 2 },
        "deck",
        "first",
      );
      const bystander = createCard(
        { name: "Bystander", type: "Follower", cost: 2 },
        "deck",
        "first",
      );
      deck.push(victim, bystander);

      whenRunEffects(
        [
          {
            op: "transform",
            target: "ally:deck",
            filter: { name: "LeaveVictim" },
            into: "Goblin",
          },
        ],
        "first",
      );

      expect(deck.find((c) => c.uid === victim.uid)!.name).toBe("Goblin");
      expect(deck.find((c) => c.uid === bystander.uid)!.name).toBe("Bystander");
      expect(thenDeck("first").length).toBe(2);
    });

    it("banish deck route honours filter.name with two cards in deck", () => {
      const deck = getDeck(state, "first");
      deck.length = 0;
      const victim = createCard(
        { name: "LeaveVictim", type: "Follower", cost: 2 },
        "deck",
        "first",
      );
      const bystander = createCard(
        { name: "Bystander", type: "Follower", cost: 2 },
        "deck",
        "first",
      );
      deck.push(victim, bystander);

      whenRunEffects(
        [
          {
            op: "banish",
            target: "ally:deck",
            filter: { name: "LeaveVictim" },
          },
        ],
        "first",
      );

      expect(thenDeck("first").length).toBe(1);
      expect(thenDeck("first")[0]!.name).toBe("Bystander");
      expect(getBanish(state, "first").some((c) => c.uid === victim.uid)).toBe(
        true,
      );
    });
  });
});
