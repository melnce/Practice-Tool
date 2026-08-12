/**
 * Bible §346 / §443 / §477 — Bane destroys on any combat damage, including 0.
 *
 * Regression: resolveBane early-returned when damageDealt <= 0 && !barrierPopped,
 * so 0-attack (and negative-attack clamped to 0) Bane never destroyed.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import {
  makeCardFromDB,
  pushToBoard,
} from "../../src/logic/effects/ops/summon_ops/core.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { CardInstance, CardTemplate } from "../../src/core/types/index.js";
import { grantBarrier } from "../../src/logic/core/barrier.js";
import { whenRunEffects } from "../harness/builders.js";
import { getBoard, getHP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

function isDead(card: CardInstance, owner: "first" | "second"): boolean {
  return (
    (card.defense as number) <= 0 || !state.players[owner].board.includes(card)
  );
}

function makeTestFollower(
  owner: "first" | "second",
  name: string,
  stats: { attack: number; defense: number },
  traits: Partial<CardInstance> = {},
): CardInstance {
  const template: CardTemplate = {
    id: "test_" + name,
    uid: "temp_" + name,
    name,
    type: "Follower",
    cost: 1,
    attack: stats.attack,
    defense: stats.defense,
    format: "rotation",
    set_id: "0000",
    faction: "neutral",
    base_id: "0000",
  };
  const f = makeCardFromDB(template, owner);
  Object.assign(f, traits);
  const board =
    owner === "first" ? state.players.first.board : state.players.second.board;
  pushToBoard(board, owner, f);
  return f;
}

function readyAttacker(traits: Partial<CardInstance> = {}) {
  return {
    hasRush: true,
    can_attack: true,
    can_attack_followers: true,
    attacks_left: 1,
    justPlayed: false,
    hasAttacked: false,
    ...traits,
  } as Partial<CardInstance>;
}

describe("Bane destroys on 0 combat damage (§346 / §477)", () => {
  beforeEach(() => {
    resetGameState(1);
    state.activePlayer = "first";
    state.gameStarted = true;
  });

  afterEach(() => {
    resetGameState(1);
  });

  // ---------------------------------------------------------------------------
  // Bug cases (written first — must fail before the resolveBane fix)
  // ---------------------------------------------------------------------------

  it("0-attack Bane attacker destroys the defender", () => {
    makeTestFollower(
      "first",
      "Zero Bane",
      { attack: 0, defense: 5 },
      readyAttacker({ hasBane: true }),
    );
    const defender = makeTestFollower("second", "Tank", {
      attack: 1,
      defense: 10,
    });

    attackFollower(0, 0, "first", "second");

    expect(isDead(defender, "second")).toBe(true);
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("0-attack Bane defender destroys the attacker via counter-damage", () => {
    makeTestFollower(
      "first",
      "Swinger",
      { attack: 1, defense: 5 },
      readyAttacker(),
    );
    const baneDef = makeTestFollower(
      "second",
      "Zero Bane Wall",
      { attack: 0, defense: 10 },
      { hasBane: true },
    );

    attackFollower(0, 0, "first", "second");

    // Attacker took 0 counter-damage but Bane still destroys it.
    expect(isDead(baneDef, "second")).toBe(false);
    expect(getBoard(state, "first")).toHaveLength(0);
  });

  it("negative-attack Bane (clamped to 0) still destroys", () => {
    // base 1 with a −3 debuff → internal attack −2; effectiveAtk clamps to 0
    makeTestFollower(
      "first",
      "Debuffed Bane",
      { attack: -2, defense: 5 },
      readyAttacker({ hasBane: true }),
    );
    const defender = makeTestFollower("second", "Beefy", {
      attack: 1,
      defense: 10,
    });

    attackFollower(0, 0, "first", "second");

    expect(isDead(defender, "second")).toBe(true);
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("positive-damage Bane still destroys (control)", () => {
    makeTestFollower(
      "first",
      "Classic Bane",
      { attack: 2, defense: 5 },
      readyAttacker({ hasBane: true }),
    );
    const defender = makeTestFollower("second", "Tall", {
      attack: 1,
      defense: 10,
    });

    attackFollower(0, 0, "first", "second");

    expect(isDead(defender, "second")).toBe(true);
    expect(Number(defender.defense)).toBe(0);
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Preserved guards (must still hold after the fix)
  // ---------------------------------------------------------------------------

  it("Bane still destroys when the Bane holder dies in the exchange", () => {
    makeTestFollower(
      "first",
      "Suicide Bane",
      { attack: 1, defense: 1 },
      readyAttacker({ hasBane: true }),
    );
    makeTestFollower("second", "Big Body", { attack: 5, defense: 10 });

    attackFollower(0, 0, "first", "second");

    expect(getBoard(state, "first")).toHaveLength(0);
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("Barrier does not save a follower from Bane (including 0-attack Bane)", () => {
    makeTestFollower(
      "first",
      "Zero Bane",
      { attack: 0, defense: 5 },
      readyAttacker({ hasBane: true }),
    );
    const defender = makeTestFollower("second", "Shielded", {
      attack: 1,
      defense: 5,
    });
    grantBarrier(defender);
    expect(defender.hasBarrier).toBe(true);

    attackFollower(0, 0, "first", "second");

    expect(defender.hasBarrier).toBe(false);
    expect(isDead(defender, "second")).toBe(true);
  });

  it("can't-be-destroyed-by-abilities survives Bane while defense > 0", () => {
    makeTestFollower(
      "first",
      "Zero Bane",
      { attack: 0, defense: 5 },
      readyAttacker({ hasBane: true }),
    );
    const protectedF = makeTestFollower(
      "second",
      "Protected",
      { attack: 1, defense: 5 },
      { keywordState: { cannotBeDestroyed: true } } as any,
    );

    attackFollower(0, 0, "first", "second");

    expect(getBoard(state, "second")).toContain(protectedF);
    expect(Number(protectedF.defense)).toBe(5);
  });

  it("Bane does not affect leaders", () => {
    makeTestFollower(
      "first",
      "Bane Face",
      { attack: 3, defense: 3 },
      readyAttacker({ hasBane: true, hasStorm: true }),
    );
    const hpBefore = getHP(state, "second");

    attackLeader(0, "first", "second");

    expect(getHP(state, "second")).toBe(hpBefore - 3);
    expect(getHP(state, "second")).toBeGreaterThan(0);
  });

  it("Bane does not fire from non-combat effect damage", () => {
    makeTestFollower(
      "first",
      "Bane Idle",
      { attack: 0, defense: 5 },
      { hasBane: true },
    );
    const target = makeTestFollower("second", "Victim", {
      attack: 1,
      defense: 5,
    });

    whenRunEffects(
      [{ op: "damage", target: "enemy:follower", amount: 0 }] as any,
      "first",
    );

    expect(getBoard(state, "second")).toContain(target);
    expect(Number(target.defense)).toBe(5);
  });

  // ---------------------------------------------------------------------------
  // Predicate: damage-step participation, not mere attack declaration
  // ---------------------------------------------------------------------------

  it("Bane defender does not kill when follower_strike removes it before damage", () => {
    // Attack was declared into a Bane defender, but Strike destroys it before
    // the damage exchange — Bane must not fire (attacker survives at full DEF).
    const attacker = makeTestFollower(
      "first",
      "Striker",
      { attack: 1, defense: 5 },
      readyAttacker({
        triggers: [
          {
            event: "follower_strike",
            source: "board",
            effects: [{ op: "destroy", scope: "defender" }],
          },
        ],
      } as any),
    );
    makeTestFollower(
      "second",
      "Bane Wall",
      { attack: 10, defense: 1 },
      { hasBane: true },
    );

    attackFollower(0, 0, "first", "second");

    expect(getBoard(state, "second")).toHaveLength(0);
    expect(getBoard(state, "first")).toContain(attacker);
    expect(Number(attacker.defense)).toBe(5);
  });
});
