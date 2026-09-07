/**
 * Batch 1 — hardened global primitives (owner rulings + rulebook).
 * Assertions from docs/svwb_rulebook_formatted.md + docs/llm-guide.md only.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import {
  applyKeywordsFromList,
  applyKeyword,
} from "../../src/logic/core/keywords.js";
import {
  attackFollower,
  attackLeader,
  canAttackFollowerTarget,
  canAttackLeaderWhileWardActive,
} from "../../src/logic/core/combat.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { handleReanimate } from "../../src/logic/effects/ops/reanimate.js";
import { isOverflow } from "../../src/helpers/overflow.js";
import { useSecondPlayerPPBoost } from "../../src/logic/boosts.js";
import { getPP } from "../../src/core/playerHelpers.js";
import { getBoard, getHP, getHand } from "../../src/core/playerHelpers.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { banishCard } from "../../src/logic/effects/ops/banish/primitives.js";
import { handleTransform } from "../../src/logic/effects/ops/transform.js";
import { handleDiscardAllExceptNamed } from "../../src/logic/effects/hand.js";
import {
  getShadows,
  getGraveyard,
  getBanish,
} from "../../src/core/playerHelpers.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import "../../src/logic/core/effects/index.js";

describe("Rulebook §176–269 / owner — Ward", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("spells may target a non-Ward enemy while a Ward is in play (Ward does not gate spells)", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10041310"])
      .withFirstPP(4, 6)
      .build();

    const ward = createCard("10001130", "board", "second");
    applyKeywordsFromList(ward);
    ward.uid = "ward";
    ward.peak_defense = ward.defense;

    const nonWard = createCard(
      { name: "Target", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    nonWard.uid = "target";
    nonWard.peak_defense = 5;

    state.players.second.board = [ward, nonWard];

    whenPlayCard("first", 0);
    expect(state.pendingTargetEffect).toBeDefined();
    resolvePendingTarget("target");

    expect(Number(nonWard.defense)).toBe(3);
    expect(Number(ward.defense)).toBe(5);
  });

  it("§561/§734–735 — active Ward blocks non-Ward followers and leader; Ward itself is legal", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    const attacker = createCard("10021110", "board", "first");
    applyKeywordsFromList(attacker);
    attacker.uid = "atk";
    attacker.justPlayed = false;
    attacker.can_attack = true;
    attacker.attacks_left = 1;
    attacker.peak_defense = attacker.defense;

    const ward = createCard("10001130", "board", "second");
    applyKeywordsFromList(ward);
    ward.uid = "ward";
    ward.peak_defense = ward.defense;

    const nonWard = createCard(
      { name: "Backliner", type: "Follower", cost: 1, attack: 1, defense: 5 },
      "board",
      "second",
    );
    nonWard.uid = "back";
    nonWard.peak_defense = 5;

    const board = [ward, nonWard];
    state.players.first.board = [attacker];
    state.players.second.board = board;

    expect(canAttackFollowerTarget(nonWard, board)).toBe(false);
    expect(canAttackFollowerTarget(ward, board)).toBe(true);
    expect(canAttackLeaderWhileWardActive(board)).toBe(false);

    attackFollower(0, 1, "first", "second");
    expect(Number(nonWard.defense)).toBe(5);

    attackFollower(0, 0, "first", "second");
    expect(Number(ward.defense)).toBeLessThan(5);

    state.players.second.hp = 20;
    attackLeader(0, "first", "second");
    expect(getHP(state, "second")).toBe(20);
  });

  it("§734 — Ambush+Ward is inactive (does not gate); Aura+Ward still gates attacks", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    const ambushWard = createCard("10001130", "board", "second");
    applyKeywordsFromList(ambushWard);
    ambushWard.hasAmbush = true;
    ambushWard.uid = "ambush_ward";

    const backliner = createCard(
      { name: "Open", type: "Follower", cost: 1, attack: 1, defense: 5 },
      "board",
      "second",
    );
    backliner.uid = "open";
    backliner.peak_defense = 5;

    const ambushBoard = [ambushWard, backliner];
    expect(canAttackFollowerTarget(backliner, ambushBoard)).toBe(true);
    expect(canAttackLeaderWhileWardActive(ambushBoard)).toBe(true);

    const auraWard = createCard("10001130", "board", "second");
    applyKeywordsFromList(auraWard);
    auraWard.hasAura = true;
    auraWard.uid = "aura_ward";
    auraWard.peak_defense = auraWard.defense;

    const auraBoard = [auraWard, backliner];
    expect(canAttackFollowerTarget(backliner, auraBoard)).toBe(false);
    expect(canAttackFollowerTarget(auraWard, auraBoard)).toBe(true);
  });
});

describe("Rulebook §176–269 / owner — Storm & Rush", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("granting Storm does not increase attacks_left beyond one swing per turn", () => {
    const unit = createCard(
      { name: "Unit", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    unit.attacks_left = 1;
    unit.attacks_per_turn = 1;

    applyKeyword(unit, "storm");

    expect(unit.attacks_left).toBe(1);
    expect(unit.hasStorm).toBe(true);
  });

  it("granting Rush does not increase attacks_left beyond one swing per turn", () => {
    const unit = createCard(
      { name: "Unit", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    unit.attacks_left = 1;
    unit.attacks_per_turn = 1;

    applyKeyword(unit, "rush");

    expect(unit.attacks_left).toBe(1);
    expect(unit.hasRush).toBe(true);
  });

  it("evolving a non-Storm follower grants follower attack permission only — not the Rush keyword", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 }).build();

    const fighter = createCard("10001110", "board", "first");
    fighter.uid = "evo";
    fighter.justPlayed = true;
    fighter.peak_defense = fighter.defense;
    state.players.first.board = [fighter];

    const enemy = createCard(
      { name: "Dummy", type: "Follower", cost: 1, attack: 0, defense: 5 },
      "board",
      "second",
    );
    enemy.uid = "dummy";
    enemy.peak_defense = 5;
    state.players.second.board = [enemy];
    state.players.second.hp = 20;

    handleEvolveSelf(fighter, "first", { spendPoint: false });

    expect(fighter.hasEvolved).toBe(true);
    expect(fighter.hasRush).toBeFalsy();
    expect(fighter.hasStorm).toBeFalsy();
    expect(fighter.can_attack).toBe(true);

    attackFollower(0, 0, "first", "second");
    expect(enemy.defense).toBeLessThan(5);

    state.players.second.hp = 20;
    attackLeader(0, "first", "second");
    expect(getHP(state, "second")).toBe(20);
  });
});

describe("Rulebook §757 / owner — Spellboost (hand only)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
  });

  it("only in-hand cards receive spellboost counters when a spell is played", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10032120", "10031310"])
      .withFirstPP(10, 10)
      .build();

    const boardCopy = createCard("10032120", "board", "first");
    applyKeywordsFromList(boardCopy);
    state.players.first.board = [boardCopy];

    whenPlayCard("first", 1);

    const inHand = getHand(state, "first").find(
      (c) => c.name === "Blaze Destroyer",
    );
    expect(
      inHand?.keywordState?.spellboostCount ?? inHand?.spellboostCount,
    ).toBe(1);
    expect(
      boardCopy.spellboostCount ?? boardCopy.keywordState?.spellboostCount,
    ).toBeFalsy();
  });

  it("Spellboost keyword effects[] — stat buff on bearer in hand", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand(["10131110", "10031310"])
      .withFirstPP(6, 6)
      .build();
    const atk0 = Number(
      getHand(state, "first").find((c) => c.id === "10131110")!.attack,
    );
    whenPlayCard("first", 1);
    const conductor = getHand(state, "first").find((c) => c.id === "10131110")!;
    expect(Number(conductor.attack)).toBe(atk0 + 1);
  });

  it("+1 per spell played stacks with Spellboost keyword reductions on the same card", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10032120", "10031310"])
      .withFirstPP(10, 10)
      .build();

    const blaze = getHand(state, "first").find(
      (c) => c.name === "Blaze Destroyer",
    )!;
    expect(Number(blaze.cost)).toBe(10);

    whenPlayCard("first", 1);
    expect(Number(blaze.cost)).toBe(9);
    expect(blaze.keywordState?.spellboostCount ?? blaze.spellboostCount).toBe(
      1,
    );

    spellboostHand("first", 2, blaze);
    expect(blaze.keywordState?.spellboostCount ?? blaze.spellboostCount).toBe(
      3,
    );
    expect(Number(blaze.cost)).toBe(7);
  });
});

describe("Rulebook §757 / owner — Necromancy(N)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("≥N shadows: auto-consume N and fanfare effect fires", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10051130"])
      .withFirstShadows(4)
      .withFirstPP(5, 5)
      .build();

    whenPlayCard("first", 0);

    const mummy = getBoard(state, "first")[0]!;
    expect(mummy.hasStorm).toBe(true);
    expect(state.players.first.shadows).toBe(0);
  });

  it("<N shadows: no consume and fanfare effect does not fire", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10051130"])
      .withFirstShadows(3)
      .withFirstPP(5, 5)
      .build();

    whenPlayCard("first", 0);

    const mummy = getBoard(state, "first")[0]!;
    expect(mummy.hasStorm).toBeFalsy();
    expect(state.players.first.shadows).toBe(3);
  });
});

describe("Rulebook §769 / owner — Countdown(N)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
  });

  it("amulet countdown ticks −1 at the start of its owner's turn", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    const amulet = createCard("10061210", "board", "first");
    applyKeywordsFromList(amulet);
    state.players.first.board = [amulet];
    expect(amulet.countdown).toBe(2);

    whenEndTurn();
    whenEndTurn();

    expect(amulet.countdown).toBe(1);
  });

  it("countdown reaching 0 destroys the amulet and fires Last Words (owner: Avian/Winged)", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    const statue = createCard("10061210", "board", "first");
    applyKeywordsFromList(statue);
    statue.countdown = 0;
    state.players.first.board = [statue];

    cleanupDead();

    expect(
      getBoard(state, "first").find((c) => c.name === "Avian Statue"),
    ).toBeUndefined();
    expect(
      getBoard(state, "first").some((c) => c.name === "Regal Falcon"),
    ).toBe(true);
  });
});

describe("Rulebook §769 — Overflow (bonus PP does not count)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
  });

  it("second-player bonus PP orb does not trigger Overflow when real max PP is 6", () => {
    givenGameState({ seed: 1, activePlayer: "second", roundCount: 6 })
      .withSecondPP(6, 6)
      .build();

    expect(isOverflow("second")).toBe(false);

    useSecondPlayerPPBoost();
    expect(getPP(state, "second")).toBe(7);
    expect(state.players.second.pp).toBe(6);
    expect(state.players.second.bonusPpOrb).toBe(1);
    expect(state.players.second.maxPP).toBe(6);
    expect(isOverflow("second")).toBe(false);
  });

  it("Overflow is true only when real max PP ≥ 7", () => {
    givenGameState({ seed: 1, activePlayer: "second" })
      .withSecondPP(7, 7)
      .build();

    expect(isOverflow("second")).toBe(true);
  });
});

describe("Owner / general — zero damage still counts as taking damage", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("a 0-damage instance triggers on-damage effects while the follower survives", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    const az = createCard("10344110", "board", "first");
    az.peak_defense = az.defense;
    state.players.first.board = [az];
    state.players.second.hp = 20;

    dealDamage(az, 0, "first");
    expect(getHP(state, "second")).toBe(19);
    expect(
      getBoard(state, "first").some(
        (c) => c.name === "Azurifrit, Heir to Disdain",
      ),
    ).toBe(true);
  });
});

describe("Rulebook §763 / owner — Reanimate(N) token behavior", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
  });

  it("reanimated copy does not fire Fanfare", () => {
    givenGameState({ seed: 42, activePlayer: "first" })
      .withFirstHP(20, 20)
      .build();

    const corpse = createCard("10001110", "graveyard", "first");
    state.players.first.graveyard = [corpse];
    recordDestroyed(state, "first", corpse);

    handleReanimate({ op: "reanimate", max_cost: 2 } as any, "first");

    expect(getHP(state, "first")).toBe(20);
    expect(getBoard(state, "first")).toHaveLength(1);
    expect(getBoard(state, "first")[0]!.name).toBe("Indomitable Fighter");
  });

  it("reanimated token enters exhausted (no attack unless Storm/Rush)", () => {
    givenGameState({ seed: 42 }).build();

    const corpse = createCard("10001110", "graveyard", "first");
    state.players.first.graveyard = [corpse];
    recordDestroyed(state, "first", corpse);

    handleReanimate({ op: "reanimate", max_cost: 2 } as any, "first");

    const token = getBoard(state, "first")[0]!;
    expect(token.hasStorm).toBeFalsy();
    expect(token.hasRush).toBeFalsy();
    expect(token.can_attack).toBe(false);
  });
});

describe("Card data — numeric stats at load boundary", () => {
  it("indexed templates coerce cost/attack/defense to numbers (Mari cost is 2)", () => {
    const mari = getCardById("10441120");
    expect(mari).toBeTruthy();
    expect(typeof mari!.cost).toBe("number");
    expect(mari!.cost).toBe(2);
  });
});

describe("Owner / cemetery — shadow fuel (Necromancy & Reanimate)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("destroy, spell cast, and discard each +1 shadow; banish and transform do not", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10252310"])
      .withFirstPP(3, 6)
      .build();

    expect(getShadows(state, "first")).toBe(0);

    const fodder = createCard(
      { name: "Fodder", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    fodder.defense = 0;
    state.players.first.board = [fodder];
    cleanupDead();
    expect(getShadows(state, "first")).toBe(1);

    whenPlayCard("first", 0);
    expect(getShadows(state, "first")).toBe(2);

    const toDiscard = createCard(
      { name: "DiscardMe", type: "Follower", cost: 2, attack: 1, defense: 1 },
      "hand",
      "first",
    );
    state.players.first.hand.push(toDiscard);
    handleDiscardAllExceptNamed(
      { op: "discard", mode: "except_named", names: [] } as any,
      "first",
    );
    expect(getShadows(state, "first")).toBe(3);

    const banishTarget = createCard(
      { name: "BanishMe", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "second",
    );
    state.players.second.board = [banishTarget];
    state.players.second.shadows = 0;
    expect(banishCard(banishTarget)).toBe(true);
    expect(getShadows(state, "second")).toBe(0);

    const transformTarget = createCard(
      { name: "TransformMe", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "second",
    );
    state.players.second.board = [transformTarget];
    handleTransform(
      {
        op: "transform",
        target: "enemy:follower",
        select: 1,
        into: "Skeleton",
      } as any,
      "first",
      { sourceCard: null },
    );
    expect(getShadows(state, "second")).toBe(0);
    expect(getBoard(state, "second")).toHaveLength(1);
  });
});

describe("Rulebook §154–160 — Banish", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("banished follower goes to banish zone, not graveyard; no shadow", () => {
    givenGameState({ seed: 1 }).build();
    const lw = createCard("10242210", "board", "second");
    applyKeywordsFromList(lw);
    lw.hasLastWords = true;
    lw.lastWordsEffects = [
      { op: "summon", source: "named", name: "Pyrewyrm Blade", count: 1 },
    ];
    state.players.second.board = [lw];
    state.players.second.shadows = 0;

    expect(banishCard(lw)).toBe(true);
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(getGraveyard(state, "second")).toHaveLength(0);
    expect(getBanish(state, "second").some((c) => c.uid === lw.uid)).toBe(true);
    expect(getShadows(state, "second")).toBe(0);
    expect(
      getBoard(state, "first").some((c) => c.name === "Pyrewyrm Blade"),
    ).toBe(false);
  });
});
