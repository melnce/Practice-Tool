/**
 * Batch 01 — Set [10000] Basic
 *
 * Assertions derive from each card's `description` + docs/svwb_rulebook_formatted.md.
 * Consult rulebook before escalating B/C to owner. Failures are bug reports.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import "../../src/logic/core/effects/index.js";

/** Card text: "Draw a card." */
const FORESIGHT = "10031310";
/** Card text: "Summon a Clay Golem." */
const TRUTH_SUMMONS = "10031320";
/** Card text: "Enhance (4): Give this follower +3/+3." */
const INDOMITABLE_FIGHTER = "10001110";
/** Ward / Last Words: Draw / Evolve: Draw */
const LEAH = "10001120";
/** Last Words: Summon a Knight. */
const ROYAL_COACHWOMAN = "10022110";
/** Storm */
const FLASHSTEP = "10021110";

function cardText(id: string): string {
  return getCardById(id)?.description ?? "";
}

describe("Audit Batch 01 — [10000] Basic (card-text derived)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
  });

  describe("Foresight (10031310)", () => {
    it('playing the spell draws 1 card ("Draw a card.")', () => {
      expect(cardText(FORESIGHT)).toMatch(/draw a card/i);

      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand([FORESIGHT])
        .withFirstDeck([
          { name: "DeckA", type: "Follower", attack: 1, defense: 1 },
          { name: "DeckB", type: "Follower", attack: 1, defense: 1 },
        ])
        .withFirstPP(5, 5)
        .build();

      const deckBefore = state.players.first.deck.length;

      const outcome = whenPlayCard("first", 0);
      expect(outcome.kind).toBe("done");

      expect(thenHand("first").length).toBe(1);
      expect(thenHand("first")[0]!.name).not.toBe("Foresight");
      expect(state.players.first.deck.length).toBe(deckBefore - 1);
    });
  });

  describe("Truth Summons (10031320)", () => {
    it('places a Clay Golem on your field ("Summon a Clay Golem.")', () => {
      expect(cardText(TRUTH_SUMMONS)).toMatch(/summon a clay golem/i);

      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand([TRUTH_SUMMONS])
        .withFirstPP(5, 5)
        .build();

      expect(thenBoard("first").length).toBe(0);

      const outcome = whenPlayCard("first", 0);
      expect(outcome.kind).toBe("done");

      const golem = thenBoard("first").find((c) => c.name === "Clay Golem");
      expect(golem).toBeDefined();
      expect(golem!.type).toBe("Follower");
    });
  });

  describe("Indomitable Fighter (10001110)", () => {
    it("with 4+ PP available, Enhance (4) gives this follower +3/+3 (2/2 → 5/5)", () => {
      expect(cardText(INDOMITABLE_FIGHTER)).toMatch(/enhance \(4\).*\+3\/\+3/i);

      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand([INDOMITABLE_FIGHTER])
        .withFirstPP(4, 4)
        .build();

      whenPlayCard("first", 0);

      const fighter = findOnBoard("first", "Indomitable Fighter");
      expect(fighter).toBeDefined();
      expect(fighter!.attack).toBe(5);
      expect(fighter!.defense).toBe(5);
    });

    it("with only base cost PP (2), plays without Enhance buff (stays 2/2)", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand([INDOMITABLE_FIGHTER])
        .withFirstPP(2, 2)
        .build();

      whenPlayCard("first", 0);

      const fighter = findOnBoard("first", "Indomitable Fighter");
      expect(fighter!.attack).toBe(2);
      expect(fighter!.defense).toBe(2);
    });
  });

  describe("Leah, Bellringer Angel (10001120)", () => {
    it("has Ward (card text: Ward)", () => {
      expect(cardText(LEAH)).toMatch(/\bward\b/i);

      const leah = createCard(LEAH, "board", "first");
      applyKeywordsFromList(leah);
      expect(leah.hasWard).toBe(true);
    });

    it("Last Words: Draw a card — when destroyed, owner draws 1", () => {
      expect(cardText(LEAH)).toMatch(/last words:\s*draw a card/i);

      givenGameState({ seed: 1 })
        .withFirstDeck([
          { name: "DeckCard", type: "Follower", attack: 1, defense: 1 },
        ])
        .build();

      const leah = createCard(LEAH, "board", "first");
      applyKeywordsFromList(leah);
      leah.defense = 0;
      state.players.first.board = [leah];

      const handBefore = thenHand("first").length;
      cleanupDead();

      expect(thenHand("first").length).toBe(handBefore + 1);
      expect(thenBoard("first").length).toBe(0);
    });

    it("Evolve: Draw a card — normal evolve draws exactly 1 (not 0, not 2)", () => {
      expect(cardText(LEAH)).toMatch(/evolve:\s*draw a card/i);

      givenGameState({ seed: 1, roundCount: 5 })
        .withFirstDeck([
          { name: "DeckCard", type: "Follower", attack: 1, defense: 1 },
        ])
        .withFirstEvo(2)
        .build();

      const leah = createCard(LEAH, "board", "first");
      applyKeywordsFromList(leah);
      leah.peak_defense = leah.defense;
      state.players.first.board = [leah];

      const handBefore = thenHand("first").length;
      whenEvolve(leah, "first");

      expect(thenHand("first").length).toBe(handBefore + 1);
      expect(thenHand("first").length).not.toBe(handBefore);
      expect(thenHand("first").length).not.toBe(handBefore + 2);
    });

    // Rulebook §747 / Evolve data note: superevolve[] is empty so super-evolve
    // resolves the draw once (Leah draws 1 on super, not 2) — not an authoring omission.
    it("Super-Evolve: Draw a card — super-evolve draws exactly 1 (not 0, not 2)", () => {
      givenGameState({ seed: 1, roundCount: 7 })
        .withFirstDeck([
          { name: "DeckCard", type: "Follower", attack: 1, defense: 1 },
        ])
        .build();

      const leah = createCard(LEAH, "board", "first");
      applyKeywordsFromList(leah);
      leah.peak_defense = leah.defense;
      expect(leah.superevolve).toEqual([]);
      state.players.first.board = [leah];

      const handBefore = thenHand("first").length;
      whenSuperEvolve(leah, "first");

      expect(thenHand("first").length).toBe(handBefore + 1);
      expect(thenHand("first").length).not.toBe(handBefore);
      expect(thenHand("first").length).not.toBe(handBefore + 2);
    });
  });

  describe("Royal Coachwoman (10022110)", () => {
    it("Last Words: Summon a Knight — when destroyed, summons Knight", () => {
      expect(cardText(ROYAL_COACHWOMAN)).toMatch(
        /last words:\s*summon a knight/i,
      );

      givenGameState({ seed: 1 }).build();

      const coach = createCard(ROYAL_COACHWOMAN, "board", "first");
      applyKeywordsFromList(coach);
      coach.defense = 0;
      state.players.first.board = [coach];

      cleanupDead();

      const knight = thenBoard("first").find((c) => c.name === "Knight");
      expect(knight).toBeDefined();
      expect(knight!.type).toBe("Follower");
    });

    it("Last Words summon fills slot freed by death even on a full board (owner)", () => {
      givenGameState({ seed: 1 }).build();

      const fillers = ["10001110", "10001130", "10021110", "10021130"].map(
        (id, i) => {
          const c = createCard(id, "board", "first");
          c.uid = `filler_${i}`;
          c.peak_defense = c.defense;
          return c;
        },
      );

      const coach = createCard(ROYAL_COACHWOMAN, "board", "first");
      applyKeywordsFromList(coach);
      coach.uid = "coach";
      coach.defense = 0;
      coach.peak_defense = 2;

      state.players.first.board = [...fillers, coach];
      expect(state.players.first.board).toHaveLength(5);

      cleanupDead();

      expect(thenBoard("first")).toHaveLength(5);
      expect(thenBoard("first").find((c) => c.name === "Knight")).toBeDefined();
      expect(thenBoard("first").find((c) => c.uid === "coach")).toBeUndefined();
    });
  });

  describe("Flashstep Quickblader (10021110)", () => {
    it("Storm — can attack leader on the turn it is played", () => {
      expect(cardText(FLASHSTEP)).toMatch(/\bstorm\b/i);

      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand([FLASHSTEP])
        .withFirstPP(5, 5)
        .build();

      whenPlayCard("first", 0);

      const quickblader = findOnBoard("first", "Flashstep Quickblader");
      expect(quickblader!.hasStorm).toBe(true);
      expect(quickblader!.can_attack).toBe(true);
    });
  });
});
