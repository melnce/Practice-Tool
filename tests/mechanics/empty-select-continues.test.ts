/**
 * Official Q&A: an empty mandatory select fizzles only its clause — the rest of the
 * ability still resolves (Darkhaven Grace, Ruby, Apprentice Astrologer, Burnite).
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
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { getLogs, clearLogs } from "../../src/core/logger.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getGraveyard,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R10 = 10;
const DARKHAVEN_GRACE = "10162210";
const RUBY = "10101110";
const APPRENTICE_ASTROLOGER = "10131120";
const BURNITE = "10144110";
const SEND_EM_PACKING = "90034350";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: (string | object)[];
    pp?: number;
    hp?: number;
    secondBoard?: object[];
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 42,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.secondBoard?.length) b = b.withSecondBoard(opts.secondBoard);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function hasSelectFizzled(): boolean {
  return getLogs().some((entry) => entry.type === "selectFizzled");
}

describe("empty select fizzles clause but effect list continues", () => {
  beforeEach(() => {
    resetUidCounter();
    clearLogs();
    (globalThis as { HEADLESS?: boolean }).HEADLESS = false;
  });

  it("Darkhaven Grace — Engage with no allies still restores leader and logs selectFizzled", () => {
    setupTurn(R6, { hand: [DARKHAVEN_GRACE], pp: 3, hp: 18 });
    whenPlayCard("first", 0);
    const grace = findOnBoard("first", "Darkhaven Grace")!;
    engageAmulet("first", getBoard(state, "first").indexOf(grace));

    expect(getHP(state, "first")).toBe(19);
    expect(findOnBoard("first", "Darkhaven Grace")).toBeDefined();
    expect(state.pendingTargetEffect).toBeFalsy();
    expect(hasSelectFizzled()).toBe(true);
  });

  it("Darkhaven Grace — Engage with ally buffs follower and restores leader", () => {
    setupTurn(R6, { pp: 3, hp: 18 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = 2;
    getBoard(state, "first").push(ally);

    const grace = createCard(DARKHAVEN_GRACE, "board", "first");
    applyKeywordsFromList(grace);
    getBoard(state, "first").push(grace);

    engageAmulet("first", getBoard(state, "first").indexOf(grace));
    resolvePendingTarget(ally.uid);

    expect(ally.attack).toBe(3);
    expect(ally.defense).toBe(3);
    expect(getHP(state, "first")).toBe(19);
    expect(getPP(state, "first")).toBe(2);
  });

  it("Ruby, Greedy Cherub — only card in hand draws without returning", () => {
    setupTurn(R6, {
      hand: [RUBY],
      pp: 2,
      deck: [{ name: "DeckCard", type: "Follower", attack: 1, defense: 1 }],
    });
    const deckBefore = state.players.first.deck.length;

    const outcome = whenPlayCard("first", 0);
    expect(outcome.kind).toBe("done");
    expect(findOnBoard("first", "Ruby, Greedy Cherub")).toBeDefined();
    expect(state.players.first.deck.length).toBe(deckBefore - 1);
    expect(getHand(state, "first").some((c) => c.name === "DeckCard")).toBe(
      true,
    );
    expect(hasSelectFizzled()).toBe(true);
  });

  it("Apprentice Astrologer — only card in hand draws and gains earth sigil", () => {
    setupTurn(R6, {
      hand: [APPRENTICE_ASTROLOGER],
      pp: 2,
      deck: ["10131310"],
    });

    const outcome = whenPlayCard("first", 0);
    expect(outcome.kind).toBe("done");
    expect(findOnBoard("first", "Apprentice Astrologer")).toBeDefined();
    expect(
      getBoard(state, "first").some((c) => c.name === "Magic Sediment"),
    ).toBe(true);
    expect(getHand(state, "first").length).toBeGreaterThan(0);
    expect(hasSelectFizzled()).toBe(true);
  });

  it("Burnite — only card in hand deals 0 to all enemy followers without discard", () => {
    setupTurn(R10, {
      hand: [BURNITE],
      pp: 10,
      secondBoard: [
        { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 5 },
      ],
    });
    const enemy = getBoard(state, "second")[0]!;

    const outcome = whenPlayCard("first", 0);
    expect(outcome.kind).toBe("done");
    expect(enemy.defense).toBe(5);
    expect(getGraveyard(state, "first").length).toBe(0);
    expect(hasSelectFizzled()).toBe(true);
  });

  it("spell with empty mandatory select stays blocked by preflight", () => {
    setupTurn(R6, { hand: [SEND_EM_PACKING], pp: 1 });
    const spell = getHand(state, "first")[0]!;
    const preflight = canPlayCard(spell, "first");
    expect(preflight.ok).toBe(false);
    expect(preflight.reason).toMatch(/target/i);
  });
});
