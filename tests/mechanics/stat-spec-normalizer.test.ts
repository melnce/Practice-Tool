/**
 * Stat spec normalizer and duration resolver contract tests.
 *
 * Covers branches not driven by the behaviour harness: unified duration aliases,
 * self-route dynamic sources, keyword grants, negative-defense semantics, and
 * inline-card normalizations for keys no shipped card authors yet.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../fixtures/setup.js";
import {
  givenGameState,
  whenRunEffects,
  whenEndTurn,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenHP,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getLogs, clearLogs } from "../../src/core/logger.js";
import { isCantAttackLocked } from "../../src/logic/core/keywords.js";
import { endTurnBlue, endTurnRed } from "../../src/logic/core/turns.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { resolveStatDuration } from "../../src/logic/effects/ops/stat/duration.js";
import "../../src/logic/core/effects/index.js";

function allyFollower(
  name: string,
  atk: number,
  def: number,
  opts: Record<string, unknown> = {},
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def, ...opts },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

describe("stat spec normalizer — duration resolver (BG1)", () => {
  beforeEach(() => {
    resetUidCounter();
    clearLogs();
  });

  it("resolveStatDuration accepts all alias spellings", () => {
    expect(
      resolveStatDuration({ op: "stat", until_end_of_turn: true } as any),
    ).toBe("turn_end");
    expect(resolveStatDuration({ op: "stat", until_eot: true } as any)).toBe(
      "turn_end",
    );
    expect(
      resolveStatDuration({ op: "stat", duration: "turn_end" } as any),
    ).toBe("turn_end");
    expect(
      resolveStatDuration({
        op: "stat",
        duration: "opponent_turn_end",
      } as any),
    ).toBe("opponent_turn_end");
    expect(resolveStatDuration({ op: "stat" } as any)).toBe("permanent");
  });

  it("pooled route: until_end_of_turn stat delta expires at EOT", () => {
    givenGameState({ seed: 1 }).build();
    const card = allyFollower("Temp", 2, 2);
    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          attack: 2,
          until_end_of_turn: true,
        },
      ] as any,
      "first",
    );
    expect(card.attack).toBe(4);
    runEndOfTurnBoundary("first");
    expect(card.attack).toBe(2);
  });

  it("self route: duration turn_end + cant_attack keyword (Lamretta shape)", () => {
    givenGameState({ seed: 1, roundCount: 3, activePlayer: "first" }).build();
    state.gameStarted = true;
    state.roundCount = 3;
    const source = allyFollower("Shepherd", 2, 2);
    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "self",
          keywords: ["Can't Attack"],
          duration: "turn_end",
        },
      ] as any,
      "first",
      source,
    );
    expect(isCantAttackLocked(source)).toBe(true);
    endTurnBlue();
    expect(isCantAttackLocked(source)).toBe(false);
  });

  it("pooled route: opponent_turn_end + cant_attack (not ambush — ambush expiry is separate)", () => {
    givenGameState({ seed: 1, roundCount: 2, activePlayer: "first" }).build();
    state.gameStarted = true;
    state.roundCount = 2;
    const enemy = createCard(
      { name: "Debuffed", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "second",
    );
    enemy.peak_defense = 2;
    state.players.second.board.push(enemy);

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
    );
    expect(isCantAttackLocked(enemy)).toBe(true);
    endTurnBlue();
    expect(isCantAttackLocked(enemy)).toBe(true);
    endTurnRed();
    expect(isCantAttackLocked(enemy)).toBe(false);
  });
});

describe("stat spec normalizer — self dynamic route (BG2)", () => {
  beforeEach(() => {
    resetUidCounter();
    clearLogs();
  });

  it("attack_source combo buffs self with resolved magnitude", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.gameStarted = true;
    state.players.first.playsThisTurn = 3;
    const source = allyFollower("ComboBuff", 1, 1);
    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "self",
          attack_source: "combo",
        },
      ] as any,
      "first",
      source,
    );
    expect(source.attack).toBe(4);
  });

  it("dynamic self route applies keywords when stat delta is zero", () => {
    givenGameState({ seed: 1, roundCount: 2 }).build();
    state.roundCount = 2;
    const source = allyFollower("KeywordOnly", 2, 2);
    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "self",
          keywords: ["Can't Attack"],
          duration: "turn_end",
        },
      ] as any,
      "first",
      source,
    );
    expect(isCantAttackLocked(source)).toBe(true);
  });

  it("dynamic self route fires checkPostBuffTriggers for positive buffs", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).withFirstHP(18).build();
    state.gameStarted = true;
    state.players.first.playsThisTurn = 2;
    const knight = createCard(
      {
        name: "Knight of the Holy Order",
        type: "Follower",
        cost: 3,
        attack: 2,
        defense: 2,
        triggers: [
          {
            event: "self_buffed_up",
            effects: [{ op: "restore", target: "leader", amount: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    knight.peak_defense = 2;
    state.players.first.board = [knight];

    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "self",
          attack_source: "combo",
        },
      ] as any,
      "first",
      knight,
    );
    expect(thenHP("first")).toBe(19);
  });
});

describe("stat spec normalizer — pooled normalizations (BG2 items 3–7)", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("negative defense lowers max defense on pooled route", () => {
    givenGameState({ seed: 1 }).build();
    const card = allyFollower("Debuff", 3, 5);
    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          defense: -2,
        },
      ] as any,
      "first",
    );
    expect(card.defense).toBe(3);
    expect(card.peak_defense).toBe(3);
  });

  it("dynamic attack template resolves on pooled route", () => {
    givenGameState({ seed: 1 }).build();
    const source = allyFollower("Source", 4, 2);
    const target = allyFollower("Target", 1, 1);
    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          attack: "-{self.attack}",
        },
      ] as any,
      "first",
      source,
    );
    expect(target.attack).toBe(-3);
  });

  it("tracks potential_attack and potential_defense on pooled give", () => {
    givenGameState({ seed: 1 }).build();
    const card = allyFollower("Potentials", 2, 2);
    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          attack: 1,
          defense: 1,
        },
      ] as any,
      "first",
    );
    expect(card.potential_attack).toBe(4);
    expect(card.potential_defense).toBe(4);
  });
});

describe("stat spec normalizer — set action guard (BG3)", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("throws in NODE_ENV=test when opponent_turn_end carries a numeric delta", () => {
    givenGameState({ seed: 1 }).build();
    const card = allyFollower("BadOpp", 2, 2);
    expect(() =>
      whenRunEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "ally:follower",
            attack: 2,
            duration: "opponent_turn_end",
          },
        ] as any,
        "first",
      ),
    ).toThrow(
      /duration:"opponent_turn_end" cannot carry non-zero attack\/defense/i,
    );
    expect(card.attack).toBe(2);
  });

  it("throws in NODE_ENV=test when set carries duration", () => {
    givenGameState({ seed: 1 }).build();
    const card = allyFollower("SetTemp", 3, 3);
    expect(() =>
      whenRunEffects(
        [
          {
            op: "stat",
            action: "set",
            target: "ally:follower",
            defense: 1,
            until_end_of_turn: true,
          },
        ] as any,
        "first",
      ),
    ).toThrow(/action:"set" cannot carry duration/i);
    expect(card.defense).toBe(3);
  });

  it("set without duration still overrides stats", () => {
    givenGameState({ seed: 1 }).build();
    const card = allyFollower("SetPerm", 5, 5);
    whenRunEffects(
      [
        {
          op: "stat",
          action: "set",
          target: "ally:follower",
          attack: 1,
        },
      ] as any,
      "first",
    );
    expect(card.attack).toBe(1);
  });
});
