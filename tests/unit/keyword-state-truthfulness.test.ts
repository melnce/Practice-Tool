/**
 * BF1–BF4: keyword-state mirrors, canonical spellboost cost shape,
 * normalizeKeywordName in gates, vestigial Strike keyword removal.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenRunEffects,
  resetUidCounter,
  thenHand,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { allEffectRoots } from "../../scripts/check-card-text.js";
import {
  attackFollower,
  recomputeAttackFlags,
} from "../../src/logic/core/combat.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import "../../src/logic/core/effects/index.js";

const FORESIGHT = "10031310";
const BLAZE_DESTROYER = "10032120";
const JENO = "10123110";
const ONION_PATCH = "90032110";

function readyAttacker(card: {
  justPlayed?: boolean;
  can_attack?: boolean;
  can_attack_followers?: boolean;
  can_attack_leader?: boolean;
}) {
  card.justPlayed = false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.can_attack_leader = true;
}

describe("BF1 — spellboost keywordState mirror is truthful", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("applyKeyword stores camelCase reduceCostBy/minCost on keywordState.spellboost", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand([BLAZE_DESTROYER])
      .withFirstPP(10, 10)
      .build();
    const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
    applyKeywordsFromList(blaze);
    expect(blaze.keywordState?.spellboost).toEqual({
      reduceCostBy: 1,
      minCost: 0,
    });
  });

  it("spellboostHand cost reduction reads the keyword object, not keywordState.spellboost", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand([BLAZE_DESTROYER])
      .withFirstPP(10, 10)
      .build();
    const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
    blaze.keywordState = {
      ...(blaze.keywordState ?? {}),
      hasSpellboost: true,
      spellboost: { reduceCostBy: 99, minCost: 0 },
    };
    const cost0 = getEffectiveCost(blaze);
    spellboostHand("first", 1, blaze);
    expect(getEffectiveCost(blaze)).toBe(cost0 - 1);
  });

  it("effect-only Spellboost cards do not get implicit cost reduction from mirror defaults", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand(["10131110"])
      .withFirstPP(6, 6)
      .build();
    const conductor = thenHand("first").find((c) => c.id === "10131110")!;
    applyKeywordsFromList(conductor);
    expect(conductor.keywordState?.spellboost).toBeUndefined();
    const cost0 = getEffectiveCost(conductor);
    const atk0 = Number(conductor.attack);
    spellboostHand("first", 1, conductor);
    expect(getEffectiveCost(conductor)).toBe(cost0);
    expect(Number(conductor.attack)).toBe(atk0 + 1);
  });
});

describe("BF3 — keyword effect roots use normalizeKeywordName", () => {
  it("lowercase engage keyword effects are collected for card-text gates", () => {
    const fixture = {
      id: "99999901",
      name: "Fixture Engage Amulet",
      type: "Amulet",
      keywords: [
        {
          name: "engage",
          cost: 1,
          effects: [{ op: "draw", source: "deck", count: 1 }],
        },
      ],
    };
    const roots = allEffectRoots(fixture as any);
    expect(roots).toHaveLength(1);
    expect((roots[0] as { op?: string }).op).toBe("draw");
  });

  it("lowercase enhance keyword effects are collected for card-text gates", () => {
    const fixture = {
      id: "99999902",
      name: "Fixture Enhance Spell",
      type: "Spell",
      keywords: [
        {
          name: "enhance",
          cost: 3,
          effects: [{ op: "damage", target: "enemy:leader", amount: 2 }],
        },
      ],
    };
    const roots = allEffectRoots(fixture as any);
    expect(roots).toHaveLength(1);
    expect((roots[0] as { op?: string }).op).toBe("damage");
  });
});

describe("BF4 — vestigial Strike keyword string removed from Jeno", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  function enemyFollower(def = 5) {
    return {
      name: "Enemy",
      type: "Follower" as const,
      attack: 1,
      defense: def,
      can_attack: false,
    };
  }

  it("10123110 Jeno — Strike trigger still grants Barrier and summons Knight", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
      .withFirstHand([JENO])
      .withSecondBoard([enemyFollower(3)])
      .withFirstPP(7, 7)
      .build();
    whenPlayCard("first", 0);
    const jeno = findOnBoard("first", "Jeno, Levin Axeraider")!;
    expect(jeno.keywords).not.toContain("Strike");
    readyAttacker(jeno);
    recomputeAttackFlags(jeno);
    attackFollower(
      getBoard(state, "first").indexOf(jeno),
      0,
      "first",
      "second",
    );
    expect(getBoard(state, "first").some((c) => c.name === "Knight")).toBe(
      true,
    );
  });

  it("silenced Strike follower still uses card.triggers (not hasStrike) for Strike", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand([ONION_PATCH, BLAZE_DESTROYER])
      .withSecondBoard([enemyFollower(5)])
      .withFirstPP(1, 6)
      .build();
    whenPlayCard("first", 0);
    const onion = findOnBoard("first", "Onion Patch")!;
    const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
    const sb0 =
      blaze.keywordState?.spellboostCount ??
      (blaze as { spellboostCount?: number }).spellboostCount ??
      0;
    whenRunEffects(
      [{ op: "keyword", action: "silence", target: "ally:follower" }],
      "first",
      onion,
    );
    expect(onion.triggers?.length).toBeGreaterThan(0);
    readyAttacker(onion);
    recomputeAttackFlags(onion);
    attackFollower(
      getBoard(state, "first").indexOf(onion),
      0,
      "first",
      "second",
    );
    const sbAfter =
      blaze.keywordState?.spellboostCount ??
      (blaze as { spellboostCount?: number }).spellboostCount ??
      0;
    expect(sbAfter).toBe(sb0 + 1);
  });
});
