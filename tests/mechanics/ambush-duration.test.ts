/**
 * Temporary Ambush expiry (Agent of the Testaments 10962110) and stat-duration guard.
 *
 * Rulebook: Ambush blocks enemy targeting/attacks until lost by attacking or dealing damage.
 * Testaments grants a narrower Ambush that also expires at opponent's end of turn.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
  whenRunEffects,
  whenEndTurn,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import { endTurnBlue, endTurnRed } from "../../src/logic/core/turns.js";
import {
  attackFollower,
  canAttackFollowerTarget,
} from "../../src/logic/core/combat.js";
import { getKS } from "../../src/logic/core/keywords/internal.js";
import { applyKeyword } from "../../src/logic/core/keywords/apply.js";
import "../../src/logic/core/effects/index.js";

const AGENT_TESTAMENTS = "10962110";

function makeFillerDecks() {
  const filler = (prefix: string) =>
    Array.from({ length: 4 }, (_, i) => ({
      name: `${prefix}${i}`,
      type: "Follower" as const,
      cost: 1,
      attack: 1,
      defense: 1,
    }));
  return { first: filler("PadF"), second: filler("PadS") };
}

function setupAgentPlay() {
  const decks = makeFillerDecks();
  givenGameState({
    seed: 42,
    activePlayer: "first",
    roundCount: 6,
  })
    .withFirstPP(10, 10)
    .withSecondPP(10, 10)
    .withFirstDeck(decks.first)
    .withSecondDeck(decks.second)
    .withFirstHand([AGENT_TESTAMENTS])
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

function enemyAttacker(name = "Raider") {
  const foe = createCard(
    { name, type: "Follower", cost: 2, attack: 3, defense: 5 },
    "board",
    "second",
  );
  foe.peak_defense = 5;
  foe.justPlayed = false;
  foe.attacks_left = 1;
  foe.can_attack = true;
  state.players.second.board.push(foe);
  return foe;
}

describe("Agent of the Testaments (10962110) — temporary Ambush", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("Fanfare Ambush blocks enemy attacks and selection until opponent EOT, then expires", () => {
    setupAgentPlay();
    whenPlayCard("first", 0);
    const agent = findOnBoard("first", "Agent of the Testaments")!;
    expect(agent.hasAmbush).toBe(true);
    expect(getKS(agent).ambushUntilOpponentEOT).toBe(true);
    expect(getKS(agent).ambushOwner).toBe("first");

    const attacker = enemyAttacker();
    expect(
      canAttackFollowerTarget(agent, getBoard(state, "first"), attacker),
    ).toBe(false);

    // Owner EOT — Ambush must persist through opponent's turn
    endTurnBlue();
    expect(state.activePlayer).toBe("second");
    expect(agent.hasAmbush).toBe(true);
    expect(
      canAttackFollowerTarget(agent, getBoard(state, "first"), attacker),
    ).toBe(false);

    // Opponent EOT — printed duration elapsed; follower is a legal target again
    endTurnRed();
    expect(state.activePlayer).toBe("first");
    expect(agent.hasAmbush).toBe(false);
    expect(getKS(agent).ambushUntilOpponentEOT).toBeFalsy();
    expect(
      canAttackFollowerTarget(agent, getBoard(state, "first"), attacker),
    ).toBe(true);

    // Advance to opponent's next turn so they can actually swing
    endTurnBlue();
    expect(state.activePlayer).toBe("second");
    const agentIdx = getBoard(state, "first").indexOf(agent);
    const defBefore = Number(agent.defense);
    attackFollower(0, agentIdx, "second", "first");
    expect(Number(agent.defense)).toBeLessThan(defBefore);
  }, 60_000);

  it("attacking still clears Ambush early (base rulebook rule preserved)", () => {
    givenGameState({ seed: 7, activePlayer: "first", roundCount: 5 })
      .withFirstPP(10, 10)
      .withSecondPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const agent = createCard(AGENT_TESTAMENTS, "board", "first");
    agent.peak_defense = Number(agent.defense);
    agent.justPlayed = false;
    agent.attacks_left = 1;
    agent.can_attack = true;
    state.players.first.board = [agent];

    applyKeyword(agent, "Ambush", {
      until_opponent_eot: true,
      request_owner: "first",
    });
    expect(agent.hasAmbush).toBe(true);

    const prey = createCard(
      { name: "Prey", type: "Follower", cost: 1, attack: 1, defense: 8 },
      "board",
      "second",
    );
    prey.peak_defense = 8;
    state.players.second.board = [prey];

    attackFollower(0, 0, "first", "second");
    expect(agent.hasAmbush).toBe(false);
  }, 60_000);
});

describe("stat keyword duration guard (BM2)", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("throws in NODE_ENV=test for non-expiring keyword + turn_end duration", () => {
    givenGameState({ seed: 1, roundCount: 2 }).build();
    state.gameStarted = true;
    const card = createCard(
      { name: "Warded", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    card.peak_defense = 2;
    state.players.first.board = [card];

    expect(() =>
      whenRunEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "self",
            keywords: ["Ward"],
            duration: "turn_end",
          },
        ] as any,
        "first",
        card,
      ),
    ).toThrow(/handler does not consume expiry/i);
    expect(card.hasWard).toBeFalsy();
  });

  it("allows shipped Can't Attack + duration and Testaments Ambush + opponent_turn_end", () => {
    givenGameState({ seed: 3, roundCount: 4, activePlayer: "first" })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const locked = createCard(
      { name: "Locked", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "second",
    );
    locked.peak_defense = 2;
    state.players.second.board = [locked];

    expect(() =>
      whenRunEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "enemy:follower",
            keywords: ["Can't Attack"],
            duration: "opponent_turn_end",
          },
        ] as any,
        "first",
      ),
    ).not.toThrow();
    expect(locked.keywordState?.cantAttack).toBe(true);

    setupAgentPlay();
    expect(() => whenPlayCard("first", 0)).not.toThrow();
    const agent = findOnBoard("first", "Agent of the Testaments")!;
    expect(agent.hasAmbush).toBe(true);
    expect(getKS(agent).ambushUntilOpponentEOT).toBe(true);
  });
});
