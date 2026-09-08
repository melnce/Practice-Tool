/**
 * Tier A — card-JSON authoring drift (behaviour + keyword names).
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { endTurnBlue, endTurnRed } from "../../src/logic/core/turns.js";
import { getHand, getCrests } from "../../src/core/playerHelpers.js";
import { getLogs, clearLogs } from "../../src/core/logger.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import "../../src/logic/core/effects/index.js";

const MARAUDER = "10942110";
const MOELLE = "10811130";
const RUBY = "10101110";
const LAPIS = "10163130";
const INSTITUTE_OF_TRUTH = "10332210";
const ILLAMRITA = "10704110";
const R6 = 6;
const MARAUDER_BASE_ATTACK = 1;

function enemyFollower(atk: number, def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: (string | object)[];
    pp?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function setupTurnAfterAllyLeaderAttack(
  round: number,
  opts: { hand?: string[]; pp?: number } = {},
) {
  setupTurn(round, opts);
  const raider = createCard(
    {
      name: "Raider",
      type: "Follower",
      cost: 2,
      attack: 2,
      defense: 2,
      hasStorm: true,
      can_attack: true,
      attacks_left: 1,
      justPlayed: false,
      hasAttacked: false,
    },
    "board",
    "first",
  );
  state.players.first.board.push(raider);
  attackLeader(0, "first", "second");
  endTurnBlue();
  endTurnRed();
}

describe("A1 — until_eot on target:self stat op", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("High-Spirited Marauder Strike buff is +1 attack until end of turn only", () => {
    setupTurnAfterAllyLeaderAttack(R6, { hand: [MARAUDER], pp: 2 });
    enemyFollower(1, 5, "Dummy");
    whenPlayCard("first", 0);
    const marauder = findOnBoard("first", "High-Spirited Marauder")!;
    const marauderIdx = state.players.first.board.indexOf(marauder);
    marauder.can_attack = true;
    marauder.attacks_left = 1;
    marauder.justPlayed = false;
    attackFollower(marauderIdx, 0, "first", "second");
    expect(Number(marauder.attack)).toBe(MARAUDER_BASE_ATTACK + 1);
    whenEndTurn();
    whenEndTurn();
    const afterTurn = findOnBoard("first", "High-Spirited Marauder")!;
    expect(Number(afterTurn.attack)).toBe(MARAUDER_BASE_ATTACK);
  }, 60_000);
});

describe("A2 — empty hand does not block return-to-deck draw", () => {
  beforeEach(() => {
    resetUidCounter();
    clearLogs();
    (globalThis as { HEADLESS?: boolean }).HEADLESS = false;
  });

  function hasSelectFizzled(): boolean {
    return getLogs().some((entry) => entry.type === "selectFizzled");
  }

  it("Moelle, Gloomy Maiden — empty hand still draws exactly one card", () => {
    setupTurn(R6, {
      hand: [MOELLE],
      pp: 1,
      deck: [{ name: "DrawnCard", type: "Follower", attack: 1, defense: 1 }],
    });
    const deckBefore = state.players.first.deck.length;
    const outcome = whenPlayCard("first", 0);
    expect(outcome.kind).toBe("done");
    expect(state.players.first.deck.length).toBe(deckBefore - 1);
    expect(getHand(state, "first").length).toBe(1);
    expect(getHand(state, "first")[0]!.name).toBe("DrawnCard");
    expect(hasSelectFizzled()).toBe(true);
  }, 60_000);

  it("Ruby, Greedy Cherub — optional empty-hand path still draws", () => {
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
  }, 60_000);
});

describe("A3 — LastWords template flag", () => {
  it("Lapis, Shining Seraph template has hasLastWords", () => {
    const template = getCardById(LAPIS)!;
    expect(template.hasLastWords).toBe(true);
  });
});

describe("A4 — Countdown template value", () => {
  it("Institute of Truth template countdown matches printed (5)", () => {
    const template = getCardById(INSTITUTE_OF_TRUTH)!;
    expect(template.hasCountdown).toBe(true);
    expect(template.countdown).toBe(5);
  });
});

describe("A5 — crest LastWords via keyword branch", () => {
  beforeEach(() => {
    resetUidCounter();
    setupTurn(R6, { pp: 10 });
  });

  it("crest Last Words fires via keyword when description omits Last Words text", () => {
    handleGainCrest(
      {
        op: "crest",
        action: "gain",
        name: "Test Illamrita Crest",
        description: "Countdown (2)",
        countdown: 2,
        keywords: ["Last Words"],
        effects: [
          {
            op: "summon",
            source: "named",
            name: "Illamrita, Designated Target",
            count: 1,
          },
          { op: "evolve", target: "last_summoned" },
        ],
      } as any,
      "first",
    );
    const crest = getCrests(state, "first").find(
      (c) => c.name === "Test Illamrita Crest",
    )!;
    expect(crest.description).not.toMatch(/last words/i);

    whenEndTurn();
    whenEndTurn();
    whenEndTurn();
    whenEndTurn();
    whenEndTurn();

    expect(thenBoard("first").filter((c) => c.id === ILLAMRITA)).toHaveLength(
      1,
    );
    const summoned = thenBoard("first").find((c) => c.id === ILLAMRITA)!;
    expect(summoned.hasEvolved || summoned.isEvolved).toBe(true);
  }, 60_000);
});
