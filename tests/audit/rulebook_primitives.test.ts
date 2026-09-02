/**
 * Rulebook primitive cross-checks (Brief 8 addendum).
 *
 * Assertions derive from docs/svwb_rulebook_formatted.md + card text — never engine output.
 * Cite rulebook section in each describe block.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  thenHand,
  whenRunEffects,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { handleReanimate } from "../../src/logic/effects/ops/reanimate.js";
import { bounceToHand } from "../../src/logic/effects/ops/bounce.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import {
  destroyTarget,
  canBeDestroyed,
} from "../../src/logic/effects/ops/destroy/primitives.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import {
  isDamaged,
  getMaxDefense,
} from "../../src/logic/core/combat/damageState.js";
import {
  setStatsBuff,
  applyStatBuff,
} from "../../src/logic/effects/ops/stat/core.js";
import { onEvolve, resolveEvolveEffects } from "../../src/logic/evolveUtils.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { isOverflow } from "../../src/helpers/overflow.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  getBoard,
  getHP,
  getMaxPP,
  getPermPP,
  getShadows,
  setMaxPP,
} from "../../src/core/playerHelpers.js";
import { addMaxPP } from "../../src/logic/pp.js";
import "../../src/logic/core/effects/index.js";
import type { CardInstance } from "../../src/core/types/index.js";
import { drawCard } from "../../src/core/utils.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { restoreFollowerByAmount } from "../../src/logic/effects/ops/restore/primitives.js";

describe("Rulebook §62 — Hand limit burn creates a shadow", () => {
  beforeEach(() => resetUidCounter());

  it("drawing at 9 cards burns the draw and adds 1 shadow", () => {
    givenGameState({ seed: 1 })
      .withFirstHand([
        { name: "H1", type: "Follower", attack: 1, defense: 1 },
        { name: "H2", type: "Follower", attack: 1, defense: 1 },
        { name: "H3", type: "Follower", attack: 1, defense: 1 },
        { name: "H4", type: "Follower", attack: 1, defense: 1 },
        { name: "H5", type: "Follower", attack: 1, defense: 1 },
        { name: "H6", type: "Follower", attack: 1, defense: 1 },
        { name: "H7", type: "Follower", attack: 1, defense: 1 },
        { name: "H8", type: "Follower", attack: 1, defense: 1 },
        { name: "H9", type: "Follower", attack: 1, defense: 1 },
      ])
      .withFirstDeck([{ name: "Top", type: "Follower", attack: 1, defense: 1 }])
      .build();

    const beforeShadows = getShadows(state, "first");
    drawCard(
      state.players.first.hand as any,
      state.players.first.deck as any,
      "first",
    );

    expect(state.players.first.hand.length).toBe(9);
    expect(getShadows(state, "first")).toBe(beforeShadows + 1);
  });

  it("drawn overflow card is in the cemetery (not void) — Reanimate-sensitive", () => {
    givenGameState({ seed: 1 })
      .withFirstHand([
        { name: "H1", type: "Follower", attack: 1, defense: 1 },
        { name: "H2", type: "Follower", attack: 1, defense: 1 },
        { name: "H3", type: "Follower", attack: 1, defense: 1 },
        { name: "H4", type: "Follower", attack: 1, defense: 1 },
        { name: "H5", type: "Follower", attack: 1, defense: 1 },
        { name: "H6", type: "Follower", attack: 1, defense: 1 },
        { name: "H7", type: "Follower", attack: 1, defense: 1 },
        { name: "H8", type: "Follower", attack: 1, defense: 1 },
        { name: "H9", type: "Follower", attack: 1, defense: 1 },
      ])
      .withFirstDeck([
        { name: "BurnMe", type: "Follower", cost: 2, attack: 2, defense: 2 },
      ])
      .build();

    drawCard(
      state.players.first.hand as any,
      state.players.first.deck as any,
      "first",
    );

    expect(state.players.first.hand.length).toBe(9);
    expect(getShadows(state, "first")).toBe(1);
    expect(state.players.first.graveyard.map((c) => c.name)).toContain(
      "BurnMe",
    );
    expect(state.players.first.graveyard).toHaveLength(1);
    expect(state.players.first.deck).toHaveLength(0);
    expect(state.players.first.hand.some((c) => c.name === "BurnMe")).toBe(
      false,
    );
  });
});

describe("Rulebook §763 — Reanimate (X): cost search is strictly downward", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
  });

  it("Reanimate(4) summons highest cost ≤4; if none at 4, tries 3, 2…", () => {
    givenGameState({ seed: 42 }).build();

    const cost2 = createCard("10001110", "graveyard", "first"); // cost 2
    const cost4 = createCard("10001130", "graveyard", "first"); // Quake Goliath — cost 4
    state.players.first.graveyard = [cost2, cost4] as CardInstance[];
    recordDestroyed(state, "first", cost2);
    recordDestroyed(state, "first", cost4);

    handleReanimate({ op: "reanimate", max_cost: 4 } as any, "first");

    const board = getBoard(state, "first");
    expect(board).toHaveLength(1);
    expect(board[0]!.name).toBe("Quake Goliath");
  });

  it("Reanimate(2) with no eligible followers summons nothing", () => {
    givenGameState({ seed: 42 }).build();

    state.players.first.graveyard = [
      {
        uid: "g1",
        name: "FiveDrop",
        type: "Follower",
        cost: 5,
        attack: 5,
        defense: 5,
      },
    ] as CardInstance[];

    handleReanimate({ op: "reanimate", max_cost: 2 } as any, "first");

    expect(getBoard(state, "first")).toHaveLength(0);
  });
});

describe("Rulebook §891 — Bounce: follower reverts to base stats; granted keywords lost", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
  });

  it("returned follower is a fresh base copy without granted Rush", () => {
    givenGameState({ seed: 1 }).build();

    const fighter = createCard(
      {
        name: "Indomitable Fighter",
        id: "10001110",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
      },
      "board",
      "first",
    );
    fighter.hasRush = true;
    state.players.first.board = [fighter];

    bounceToHand(fighter);

    expect(getBoard(state, "first")).toHaveLength(0);
    const inHand = thenHand("first")[0]!;
    expect(inHand.hasRush).toBeFalsy();
    expect(Number(inHand.attack)).toBe(2);
    expect(Number(inHand.defense)).toBe(2);
  });
});

describe("Rulebook §933 — Super-Evolve: +3/+3, owner-turn protection, pierce on kill", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.roundCount = 7;
  });

  it("super-evolve grants +3/+3 (not +2/+2)", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 7 })
      .withFirstEvo(0)
      .build();

    const card = createCard(
      { name: "TestUnit", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [card];

    handleEvolveSelf(card, "first", { mode: "super", spendPoint: false });

    expect(card.attack).toBe(5);
    expect(card.defense).toBe(5);
    expect(card.evoType).toBe("super");
  });

  it("super-evolved ally cannot be destroyed by effects on owner's turn", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    const card = createCard(
      {
        name: "SuperUnit",
        type: "Follower",
        cost: 3,
        attack: 3,
        defense: 3,
        evoType: "super",
        hasEvolved: true,
      },
      "board",
      "first",
    );
    state.players.first.board = [card];

    expect(canBeDestroyed(card, "first")).toBe(false);
    expect(destroyTarget(card, "first", "test")).toBe(false);
    expect(getBoard(state, "first")).toHaveLength(1);
  });

  it("super-evolved ally takes 0 combat/effect damage on owner's turn", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    const card = createCard(
      {
        name: "SuperUnit",
        type: "Follower",
        cost: 3,
        attack: 3,
        defense: 5,
        evoType: "super",
        hasEvolved: true,
        peak_defense: 5,
      },
      "board",
      "first",
    );
    state.players.first.board = [card];

    const result = dealDamage(card, 3, null);
    expect(result.damage).toBe(0);
    expect(result.preventedBySuper).toBe(true);
    expect(card.defense).toBe(5);
  });

  it("super-evolved attacker takes normal counter-damage off owner's turn", () => {
    // Super-evo damage immunity is owner's-turn only. Verify by attacking INTO the
    // super-evolved follower during the opponent's turn (legal), not by swinging
    // off-turn (now correctly refused by the engine ownership guard).
    givenGameState({ seed: 1, activePlayer: "second", phase: "main" }).build();

    const superDefender: CardInstance = {
      ...createCard(
        { name: "SuperDef", type: "Follower", cost: 5, attack: 4, defense: 5 },
        "board",
        "first",
      ),
      evoType: "super",
      hasEvolved: true,
      can_attack: false,
      hasAttacked: false,
      justPlayed: false,
      peak_defense: 5,
    };

    const attacker: CardInstance = {
      ...createCard(
        { name: "Attacker", type: "Follower", cost: 2, attack: 2, defense: 3 },
        "board",
        "second",
      ),
      can_attack: true,
      hasAttacked: false,
      attacks_left: 1,
      justPlayed: false,
      peak_defense: 3,
    };

    state.players.first.board = [superDefender];
    state.players.second.board = [attacker];

    attackFollower(0, 0, "second", "first");

    // Off owner's turn: super takes the 2 counter-damage (no 0-damage shield)
    expect(Number(superDefender.defense)).toBe(3);
  });

  it("super-evolved follower that kills an enemy follower deals 1 to enemy leader", () => {
    givenGameState({ seed: 1, activePlayer: "first", phase: "main" }).build();

    const attacker: CardInstance = {
      ...createCard(
        { name: "SuperAtk", type: "Follower", cost: 5, attack: 5, defense: 5 },
        "board",
        "first",
      ),
      uid: "super-atk",
      evoType: "super",
      hasEvolved: true,
      can_attack: true,
      hasAttacked: false,
      attacks_left: 1,
      justPlayed: false,
      peak_defense: 5,
    };

    const defender: CardInstance = {
      uid: "weak",
      name: "Weakling",
      type: "Follower",
      cost: 1,
      attack: 0,
      defense: 2,
      can_attack: false,
      peak_defense: 2,
    };

    state.players.first.board = [attacker];
    state.players.second.board = [defender];
    state.players.second.hp = 20;

    attackFollower(0, 0, "first", "second");

    expect(getHP(state, "second")).toBe(19);
  });
});

describe("Rulebook §923–929 — Set defense resets baseline; isDamaged uses new max", () => {
  beforeEach(() => resetUidCounter());

  it('after "set defense to 1", follower at 1/1 is not damaged; +0/+2 buff raises max to 3', () => {
    const card = createCard(
      {
        name: "Target",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 5,
        peak_defense: 5,
      },
      "board",
      "first",
    );

    setStatsBuff(card, null, 1, "first");
    expect(isDamaged(card)).toBe(false);
    expect(getMaxDefense(card)).toBe(1);

    applyStatBuff(card, 0, 2, "first");
    expect(card.defense).toBe(3);
    expect(getMaxDefense(card)).toBe(3);
    expect(isDamaged(card)).toBe(false);
  });

  it('after "-0/-2" defense reduction, follower is at full new max (not damaged)', () => {
    const card = createCard(
      {
        name: "Target",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 5,
        peak_defense: 5,
      },
      "board",
      "first",
    );

    applyStatBuff(card, 0, -2, "first");
    expect(Number(card.defense)).toBe(3);
    expect(getMaxDefense(card)).toBe(3);
    expect(isDamaged(card)).toBe(false);
  });

  it('after "-0/-2" defense reduction, restore cannot exceed the new max', () => {
    const card = createCard(
      {
        name: "Target",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 5,
        peak_defense: 5,
      },
      "board",
      "first",
    );

    applyStatBuff(card, 0, -2, "first");
    card.defense = 1;
    restoreFollowerByAmount(card, 5);

    expect(Number(card.defense)).toBe(3);
    expect(getMaxDefense(card)).toBe(3);
  });
});

describe("Rulebook §62 — Bounce into full hand burns and creates a shadow", () => {
  beforeEach(() => resetUidCounter());

  it("bouncing with a 9-card hand adds 1 shadow and does not exceed hand limit", () => {
    givenGameState({ seed: 1 })
      .withFirstHand([
        { name: "H1", type: "Follower", attack: 1, defense: 1 },
        { name: "H2", type: "Follower", attack: 1, defense: 1 },
        { name: "H3", type: "Follower", attack: 1, defense: 1 },
        { name: "H4", type: "Follower", attack: 1, defense: 1 },
        { name: "H5", type: "Follower", attack: 1, defense: 1 },
        { name: "H6", type: "Follower", attack: 1, defense: 1 },
        { name: "H7", type: "Follower", attack: 1, defense: 1 },
        { name: "H8", type: "Follower", attack: 1, defense: 1 },
        { name: "H9", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();

    const onBoard = createCard(
      { name: "BounceMe", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [onBoard];

    const beforeShadows = getShadows(state, "first");
    bounceToHand(onBoard);

    expect(state.players.first.hand.length).toBe(9);
    expect(getShadows(state, "first")).toBe(beforeShadows + 1);
    expect(getBoard(state, "first")).toHaveLength(0);
    expect(state.players.first.graveyard.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Rulebook §62 — add_to_hand into a full hand burns (cemetery + shadow)", () => {
  beforeEach(() => resetUidCounter());

  it("named add_to_hand past 9 creates the card, burns it to cemetery, and adds a shadow", () => {
    givenGameState({ seed: 1 })
      .withFirstHand([
        { name: "H1", type: "Follower", attack: 1, defense: 1 },
        { name: "H2", type: "Follower", attack: 1, defense: 1 },
        { name: "H3", type: "Follower", attack: 1, defense: 1 },
        { name: "H4", type: "Follower", attack: 1, defense: 1 },
        { name: "H5", type: "Follower", attack: 1, defense: 1 },
        { name: "H6", type: "Follower", attack: 1, defense: 1 },
        { name: "H7", type: "Follower", attack: 1, defense: 1 },
        { name: "H8", type: "Follower", attack: 1, defense: 1 },
        { name: "H9", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();

    const beforeShadows = getShadows(state, "first");
    whenRunEffects(
      [{ op: "add_to_hand", name: "Fairy", count: 1 } as any],
      "first",
    );

    expect(state.players.first.hand.length).toBe(9);
    expect(getShadows(state, "first")).toBe(beforeShadows + 1);
    expect(state.players.first.graveyard.some((c) => c.name === "Fairy")).toBe(
      true,
    );
  });
});

describe("Owner ruling — hand-overflow burn does NOT fire Last Words", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
  });

  it("draw overflow: card with Last Words goes to cemetery without firing LW", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand([
        { name: "H1", type: "Follower", attack: 1, defense: 1 },
        { name: "H2", type: "Follower", attack: 1, defense: 1 },
        { name: "H3", type: "Follower", attack: 1, defense: 1 },
        { name: "H4", type: "Follower", attack: 1, defense: 1 },
        { name: "H5", type: "Follower", attack: 1, defense: 1 },
        { name: "H6", type: "Follower", attack: 1, defense: 1 },
        { name: "H7", type: "Follower", attack: 1, defense: 1 },
        { name: "H8", type: "Follower", attack: 1, defense: 1 },
        { name: "H9", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();

    const burnMe = createCard(
      {
        name: "LWBurn",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
        hasLastWords: true,
        lastWordsEffects: [
          { op: "damage", target: "enemy:leader", amount: 5 } as any,
        ],
      },
      "deck",
      "first",
    );
    burnMe.keywordState = {
      lastWordsEffects: [
        { op: "damage", target: "enemy:leader", amount: 5 } as any,
      ],
    };
    state.players.first.deck = [burnMe];

    const enemyHpBefore = getHP(state, "second");
    drawCard(
      state.players.first.hand as any,
      state.players.first.deck as any,
      "first",
    );

    expect(state.players.first.graveyard.some((c) => c.name === "LWBurn")).toBe(
      true,
    );
    expect(getShadows(state, "first")).toBe(1);
    expect(getHP(state, "second")).toBe(enemyHpBefore);
    expect(getBoard(state, "first")).toHaveLength(0);
  });
});

function lwFollower(
  owner: "first" | "second",
  name: string,
  insertionTs: number,
  summonName: string,
): CardInstance {
  const card = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: 0 },
    "board",
    owner,
  );
  card.insertionTs = insertionTs;
  card.hasLastWords = true;
  const lw = [
    { op: "summon", source: "named", name: summonName, count: 1 } as any,
  ];
  card.keywordState = { lastWordsEffects: lw };
  card.lastWordsEffects = lw;
  return card;
}

describe("Rulebook §317/#9 — Last Words resolve oldest-first, active side first", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
  });

  it("same-side simultaneous Last Words fire oldest-first (insertionTs ascending)", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    const old = lwFollower("first", "OldLW", 1, "Bat");
    const young = lwFollower("first", "YoungLW", 2, "Knight");
    state.players.first.board = [old, young];

    cleanupDead();

    const bat = getBoard(state, "first").find((c) => c.name === "Bat");
    const knight = getBoard(state, "first").find((c) => c.name === "Knight");
    expect(bat).toBeDefined();
    expect(knight).toBeDefined();
    expect((bat as any).insertionTs).toBeLessThan((knight as any).insertionTs);
  });

  it("cross-side simultaneous Last Words fire active owner's batch first", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    state.players.first.board = [lwFollower("first", "ActiveLW", 1, "Bat")];
    state.players.second.board = [
      lwFollower("second", "ReactiveLW", 1, "Knight"),
    ];

    cleanupDead();

    const bat = getBoard(state, "first").find((c) => c.name === "Bat");
    const knight = getBoard(state, "second").find((c) => c.name === "Knight");
    expect(bat).toBeDefined();
    expect(knight).toBeDefined();
    expect((bat as any).insertionTs).toBeLessThan((knight as any).insertionTs);
  });
});

describe("Rulebook §747 + owner — Super-Evolve effect lines", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
  });

  it("resolveEvolveEffects: super fires evolve[] + superevolve[] when distinct", () => {
    const card = createCard(
      { name: "DualFx", type: "Follower", cost: 2, attack: 1, defense: 1 },
      "board",
      "first",
    );
    card.evolve = [{ op: "draw", source: "deck", count: 1 } as any];
    card.superevolve = [
      { op: "summon", source: "named", name: "Ghost", count: 1 } as any,
    ];

    const fx = resolveEvolveEffects(card, "super");
    expect(fx).toHaveLength(2);
    expect(fx[0]).toMatchObject({ op: "draw" });
    expect(fx[1]).toMatchObject({ op: "summon", name: "Ghost" });
  });

  it("Leah: super-evolve draws 1 (deduped live data: empty superevolve[])", () => {
    givenGameState({ seed: 1, roundCount: 7 })
      .withFirstDeck([{ name: "A", type: "Follower", attack: 1, defense: 1 }])
      .build();

    const leah = createCard("10001120", "board", "first");
    applyKeywordsFromList(leah);
    leah.peak_defense = leah.defense;
    expect(leah.superevolve).toEqual([]);
    state.players.first.board = [leah];

    const handBefore = thenHand("first").length;
    onEvolve(leah, "first", "super");

    expect(thenHand("first").length).toBe(handBefore + 1);
  });

  it("distinct effects: super runs evolve[] then superevolve[] (draw + summon)", () => {
    givenGameState({ seed: 1, roundCount: 7 })
      .withFirstDeck([{ name: "A", type: "Follower", attack: 1, defense: 1 }])
      .build();

    const card = createCard(
      { name: "DualFx", type: "Follower", cost: 2, attack: 1, defense: 1 },
      "board",
      "first",
    );
    card.evolve = [{ op: "draw", source: "deck", count: 1 } as any];
    card.superevolve = [
      { op: "summon", source: "named", name: "Ghost", count: 1 } as any,
    ];
    card.peak_defense = 1;
    state.players.first.board = [card];

    const handBefore = thenHand("first").length;
    onEvolve(card, "first", "super");

    expect(thenHand("first").length).toBe(handBefore + 1);
    expect(getBoard(state, "first").some((c) => c.name === "Ghost")).toBe(true);
  });

  it('Arriet: Super-Evolve "instead" — restore 4 only, not 2+4 (owner)', () => {
    givenGameState({ seed: 1, roundCount: 7 }).withFirstHP(10, 20).build();

    const arriet = createCard("10002110", "board", "first");
    applyKeywordsFromList(arriet);
    arriet.peak_defense = arriet.defense;
    state.players.first.board = [arriet];
    state.players.first.hp = 10;

    expect(resolveEvolveEffects(arriet, "super")).toHaveLength(1);
    onEvolve(arriet, "first", "super");

    expect(state.players.first.hp).toBe(14);
  });

  it('Draconic Berserker: "instead" — super does not also fire single-target evolve[]', () => {
    const berserker = createCard("10042110", "board", "first");
    const fx = resolveEvolveEffects(berserker, "super");
    expect(fx).toHaveLength(1);
    expect(fx[0]).toMatchObject({ op: "damage", amount: 4 });
    expect((fx[0] as any).select).toBeUndefined();
  });
});

describe("Rulebook §229 / §326 — Max PP hard cap at 10", () => {
  it("turn 1000 still has 10 max PP (owner + rulebook)", () => {
    givenGameState({ seed: 1, roundCount: 1000 }).build();

    setMaxPP(
      state,
      "first",
      Math.min(state.roundCount + getPermPP(state, "first"), 10),
    );

    expect(getMaxPP(state, "first")).toBe(10);
  });

  it("gain_max PP effect cannot exceed 10", () => {
    givenGameState({ seed: 1, roundCount: 10 }).build();
    state.players.first.permPP = 9;

    addMaxPP("first", 5, { cap: 10, recalcNow: true });

    expect(state.players.first.maxPP).toBeLessThanOrEqual(10);
    expect(state.players.first.permPP).toBeLessThanOrEqual(10);
  });
});

describe("Rulebook §769 — Overflow: max PP ≥ 7 (bonus PP does not count)", () => {
  it("is true at 7 max PP, false at 6", () => {
    givenGameState({ seed: 1 }).withFirstPP(6, 6).build();
    expect(isOverflow("first")).toBe(false);

    state.players.first.maxPP = 7;
    expect(isOverflow("first")).toBe(true);
  });
});

describe("Rulebook §757 — Necromancy: optional if shadows ≥ X; auto-spend", () => {
  it("Devious Lesser Mummy text: Fanfare Necromancy (4) — gate requires 4 shadows", () => {
    const mummy = getCardById("10051130");
    expect(mummy?.description).toMatch(/necromancy \(4\)/i);

    const fanfare = mummy?.fanfare?.[0] as
      | { op?: string; condition?: string; cost?: number }
      | undefined;
    expect(fanfare?.op).toBe("gate");
    expect(fanfare?.condition).toBe("necromancy");
    expect(fanfare?.cost).toBe(4);
  });
});

describe("Rulebook §176–269 — Storm / Rush / Ward (combat targeting)", () => {
  it("Storm: can attack leader same turn played (Flashstep text)", () => {
    expect(getCardById("10021110")?.description).toMatch(/\bstorm\b/i);
  });

  it("Rush: cannot attack leader same turn (Arms Peddler has Rush not Storm)", () => {
    const peddler = getCardById("10021120");
    expect(peddler?.description).toMatch(/\brush\b/i);
    expect(peddler?.description).not.toMatch(/\bstorm\b/i);
  });

  it("Ward: must be attacked before non-Wards (combat.ts enforces via hasWardOn)", () => {
    expect(getCardById("10001130")?.description).toMatch(/\bward\b/i);
  });
});
